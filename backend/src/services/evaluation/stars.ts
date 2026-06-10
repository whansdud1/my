// 팀원 별점 평가 — 완료(CLOSED)된 프로젝트에서 ACCEPTED 팀원이 서로를 0.5~5.0 별점으로 평가.
//
// 규칙:
//   - 프로젝트가 완료(CLOSED) 상태여야 함
//   - 평가자/피평가자 모두 ACCEPTED 팀원, 자기 자신 제외
//   - 별점은 0.5 단위, 0.5~5.0
//   - UNIQUE(project, rater, ratee) — 재제출 시 갱신(upsert)
//   - 제출 후 피평가자의 종합 평점(ratings.stars)을 받은 별점 평균으로 재계산

import { Errors } from '../../lib/envelope.js';
import { getPool } from '../../db/connection.js';
import { audit } from '../audit.js';
import * as Projects from '../../repositories/projects.js';
import * as PeerRatings from '../../repositories/peerRatings.js';
import * as ModFlags from '../../repositories/moderationFlags.js';
import { analyzeText } from '../moderation/textModeration.js';
import { detectRatingAnomaly } from '../moderation/ratingAnomaly.js';

export interface StarItem {
  rateeId: number;
  stars: number;
  comment?: string;
}

export interface SubmitStarsInput {
  projectId: number;
  raterId: number;
  items: StarItem[];
}

function normalizeStars(n: number): number {
  // 0.5 단위로 반올림 후 0.5~5.0 로 클램프
  const half = Math.round(n * 2) / 2;
  return Math.max(0.5, Math.min(5, half));
}

export async function submitStarRatings(input: SubmitStarsInput): Promise<{ saved: number }> {
  const project = await Projects.findById(input.projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');
  if (project.status !== 'CLOSED') {
    throw Errors.Validation('완료된 프로젝트에서만 팀원을 평가할 수 있습니다');
  }

  // ACCEPTED 팀원만(평가자/피평가자 모두)
  const [memberRows] = (await getPool().query(
    `SELECT user_id FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'`,
    [input.projectId],
  )) as unknown as [Array<{ user_id: number }>];
  const acceptedIds = new Set(memberRows.map((r) => r.user_id));
  if (!acceptedIds.has(input.raterId)) {
    throw Errors.Forbidden('해당 프로젝트의 팀원만 평가할 수 있습니다');
  }

  // 1차: 명백한 악성 코멘트가 하나라도 있으면 제출 전체를 거부(아무것도 저장 안 함).
  //      → 작성자가 수정해 다시 제출하도록 유도(차단). 의심 항목은 통과시켜 검토 큐로.
  const analyzed = new Map<number, Awaited<ReturnType<typeof analyzeText>>>();
  for (const it of input.items) {
    if (it.rateeId === input.raterId || !acceptedIds.has(it.rateeId)) continue;
    const comment = it.comment?.trim().slice(0, 500) || null;
    const result = await analyzeText(comment);
    analyzed.set(it.rateeId, result);
    if (result.verdict === 'block') {
      throw Errors.Validation(
        '부적절한 표현(욕설·인격모독 등)이 감지되어 제출할 수 없습니다. 내용을 수정해 다시 제출해 주세요.',
      );
    }
  }

  const affected = new Set<number>();
  for (const it of input.items) {
    if (it.rateeId === input.raterId) continue; // 자기 평가 금지
    if (!acceptedIds.has(it.rateeId)) continue; // 외부/비팀원 차단
    const stars = normalizeStars(it.stars);
    const comment = it.comment?.trim().slice(0, 500) || null;
    const text = analyzed.get(it.rateeId);

    // 텍스트 검토 필요 시 비노출(pending)로 저장
    const modState = text && text.verdict === 'review' ? 'pending' : 'approved';
    await PeerRatings.upsert(input.projectId, input.raterId, it.rateeId, stars, comment, {
      state: modState,
      reason: text && text.reasons.length ? text.reasons.join(' | ').slice(0, 255) : null,
      score: text ? text.score : null,
    });
    const ratingId = await PeerRatings.findId(input.projectId, input.raterId, it.rateeId);

    // 텍스트 악성 검토 큐
    if (text && text.verdict === 'review' && ratingId) {
      await ModFlags.insertFlag({
        targetType: 'peer_rating',
        targetId: ratingId,
        projectId: input.projectId,
        raterId: input.raterId,
        rateeId: it.rateeId,
        kind: 'TOXIC_TEXT',
        severity: text.severity === 'severe' ? 'high' : 'medium',
        score: text.score,
        snippet: comment,
        detail: { categories: text.categories, reasons: text.reasons, source: text.source },
      });
    }

    // 허위/보복성 별점 탐지(합의 대비 이상치) → 검토 큐(차단은 안 함, 별점은 유지)
    const peers = await PeerRatings.peerStatForRatee(input.projectId, it.rateeId, input.raterId);
    const anomaly = detectRatingAnomaly(stars, peers);
    if (anomaly.anomalous && ratingId) {
      await ModFlags.insertFlag({
        targetType: 'peer_rating',
        targetId: ratingId,
        projectId: input.projectId,
        raterId: input.raterId,
        rateeId: it.rateeId,
        kind: 'RATING_ANOMALY',
        severity: anomaly.severity,
        score: anomaly.score,
        snippet: comment,
        detail: { stars, peerAvg: anomaly.peerAvg, peerCount: anomaly.peerCount, reason: anomaly.reason },
      });
    }

    affected.add(it.rateeId);
  }

  // 받은 사람들의 종합 평점 재계산
  for (const rateeId of affected) {
    await recomputeStarRating(rateeId);
  }

  await audit({
    actorId: input.raterId,
    action: 'PEER_STAR_SUBMIT',
    targetType: 'project',
    targetId: input.projectId,
    meta: { saved: affected.size },
  });

  return { saved: affected.size };
}

// 피평가자가 받은 별점 평균으로 ratings.stars 갱신.
export async function recomputeStarRating(userId: number): Promise<{ stars: number; count: number }> {
  const { avg, count } = await PeerRatings.averageForRatee(userId);
  const stars = avg !== null ? Math.round(avg * 100) / 100 : 0;
  await getPool().query(
    `INSERT INTO ratings (user_id, stars, evaluation_count) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE stars = VALUES(stars), evaluation_count = VALUES(evaluation_count)`,
    [userId, stars, count],
  );
  return { stars, count };
}
