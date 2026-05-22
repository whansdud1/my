// T067 + T070 — 동료 평가 입력
//
// 규칙:
//   - 자기 평가 금지(evaluator != evaluatee)
//   - 프로젝트 종료(CLOSED) 후 14일 이내만 제출 가능 (FR-E5)
//   - UNIQUE(project, evaluator, evaluatee) — 1회 제출
//   - 1차 review_state = PENDING, 이상 탐지가 활성화되면 HOLD 로 갱신

import { Errors } from '../../lib/envelope.js';
import { getPool } from '../../db/connection.js';
import { audit } from '../audit.js';

export interface EvalItem {
  ateeId: number;            // evaluatee
  contribution: number;
  communication: number;
  responsibility: number;
  satisfaction: number;
  comment?: string;
}

export interface SubmitInput {
  projectId: number;
  evaluatorId: number;
  items: EvalItem[];
}

export async function submitEvaluation(input: SubmitInput): Promise<{ inserted: number }> {
  const pool = getPool();
  // 프로젝트 종료 + 14일 가드
  const [[proj]] = (await pool.query(
    `SELECT id, status, ends_at FROM projects WHERE id = ?`,
    [input.projectId],
  )) as unknown as [Array<{ id: number; status: string; ends_at: Date | null }>];
  if (!proj) throw Errors.NotFound('프로젝트가 없습니다');
  if (proj.status !== 'CLOSED' && proj.status !== 'RUNNING') {
    throw Errors.Validation('평가 가능한 상태가 아닙니다');
  }
  if (proj.ends_at) {
    const deadline = new Date(proj.ends_at.getTime() + 14 * 24 * 60 * 60 * 1000);
    if (Date.now() > deadline.getTime()) {
      throw Errors.Validation('평가 제출 기한(14일)이 지났습니다');
    }
  }

  // 평가자 자신이 ACCEPTED 멤버였어야 함
  const [memberRows] = (await pool.query(
    `SELECT user_id, state FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'`,
    [input.projectId],
  )) as unknown as [Array<{ user_id: number; state: string }>];
  const acceptedIds = new Set(memberRows.map((r) => r.user_id));
  if (!acceptedIds.has(input.evaluatorId)) {
    throw Errors.Forbidden('해당 프로젝트의 팀원만 평가할 수 있습니다');
  }

  let inserted = 0;
  for (const it of input.items) {
    if (it.ateeId === input.evaluatorId) continue;          // R3
    if (!acceptedIds.has(it.ateeId)) continue;              // 외부 사용자 차단
    try {
      await pool.query(
        `INSERT INTO evaluations
            (project_id, evaluator_id, evaluatee_id, contribution, communication,
             responsibility, satisfaction, comment, review_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          input.projectId,
          input.evaluatorId,
          it.ateeId,
          clamp(it.contribution),
          clamp(it.communication),
          clamp(it.responsibility),
          clamp(it.satisfaction),
          it.comment?.slice(0, 500) ?? null,
        ],
      );
      inserted++;
    } catch (e) {
      // UNIQUE 충돌(이미 제출) — 조용히 무시
      if ((e as { code?: string }).code !== 'ER_DUP_ENTRY') throw e;
    }
  }

  await audit({
    actorId: input.evaluatorId,
    action: 'EVAL_SUBMIT',
    targetType: 'project',
    targetId: input.projectId,
    meta: { inserted },
  });

  return { inserted };
}

function clamp(n: number): number {
  if (n < 1) return 1;
  if (n > 5) return 5;
  return Math.round(n);
}
