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

  const affected = new Set<number>();
  for (const it of input.items) {
    if (it.rateeId === input.raterId) continue; // 자기 평가 금지
    if (!acceptedIds.has(it.rateeId)) continue; // 외부/비팀원 차단
    const stars = normalizeStars(it.stars);
    const comment = it.comment?.trim().slice(0, 500) || null;
    await PeerRatings.upsert(input.projectId, input.raterId, it.rateeId, stars, comment);
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
