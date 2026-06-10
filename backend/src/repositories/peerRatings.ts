import { getPool } from '../db/connection.js';

// 팀원 별점 평가 저장소(peer_star_ratings) — 완료된 프로젝트의 1:1 별점.

export interface StarRatingRow {
  ratee_id: number;
  stars: string; // DECIMAL → 문자열로 옴
  comment: string | null;
}

export type ModState = 'approved' | 'pending' | 'blocked';

// 한 평가자의 별점 1건 upsert(재제출 시 갱신). 모더레이션 상태/사유/점수 포함.
export async function upsert(
  projectId: number,
  raterId: number,
  rateeId: number,
  stars: number,
  comment: string | null,
  mod: { state: ModState; reason: string | null; score: number | null } = {
    state: 'approved',
    reason: null,
    score: null,
  },
): Promise<void> {
  await getPool().query(
    `INSERT INTO peer_star_ratings (project_id, rater_id, ratee_id, stars, comment, mod_state, mod_reason, mod_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE stars = VALUES(stars), comment = VALUES(comment),
       mod_state = VALUES(mod_state), mod_reason = VALUES(mod_reason), mod_score = VALUES(mod_score)`,
    [projectId, raterId, rateeId, stars, comment, mod.state, mod.reason, mod.score],
  );
}

// upsert 직후 해당 행 id 조회(검토 큐 플래그 연결용).
export async function findId(projectId: number, raterId: number, rateeId: number): Promise<number | null> {
  const [rows] = (await getPool().query(
    `SELECT id FROM peer_star_ratings WHERE project_id = ? AND rater_id = ? AND ratee_id = ?`,
    [projectId, raterId, rateeId],
  )) as unknown as [Array<{ id: number }>];
  return rows[0]?.id ?? null;
}

// 특정 프로젝트에서 한 평가자가 제출한 별점 목록(폼 프리필용).
export async function listByRater(projectId: number, raterId: number): Promise<StarRatingRow[]> {
  const [rows] = (await getPool().query(
    `SELECT ratee_id, stars, comment FROM peer_star_ratings WHERE project_id = ? AND rater_id = ?`,
    [projectId, raterId],
  )) as unknown as [StarRatingRow[]];
  return rows;
}

export interface ReviewRow {
  stars: string;
  comment: string;
  updated_at: Date;
}

// 한 사용자가 받은 '코멘트가 있는' 별점 후기 — 익명(평가자 정보 제외)으로 노출.
// 검토 대기(pending)/차단(blocked) 코멘트는 노출하지 않는다(악성·검토중 숨김).
export async function listReviewsForRatee(userId: number, limit = 50): Promise<ReviewRow[]> {
  const [rows] = (await getPool().query(
    `SELECT stars, comment, updated_at
       FROM peer_star_ratings
       WHERE ratee_id = ? AND comment IS NOT NULL AND comment <> '' AND mod_state = 'approved'
       ORDER BY updated_at DESC
       LIMIT ?`,
    [userId, limit],
  )) as unknown as [ReviewRow[]];
  return rows;
}

// 한 사용자가 받은 별점의 평균/개수 — 종합 평점 재계산용. 차단(blocked) 건은 평균에서 제외.
export async function averageForRatee(userId: number): Promise<{ avg: number | null; count: number }> {
  const [rows] = (await getPool().query(
    `SELECT AVG(stars) AS avg, COUNT(*) AS cnt
       FROM peer_star_ratings WHERE ratee_id = ? AND mod_state <> 'blocked'`,
    [userId],
  )) as unknown as [Array<{ avg: string | null; cnt: number }>];
  const r = rows[0] ?? { avg: null, cnt: 0 };
  return { avg: r.avg !== null ? Number(r.avg) : null, count: r.cnt };
}

// 같은 프로젝트에서 '이 평가자를 제외한' 다른 평가자들의 별점 평균/인원(허위 별점 탐지용).
export async function peerStatForRatee(
  projectId: number,
  rateeId: number,
  excludeRaterId: number,
): Promise<{ avg: number | null; count: number }> {
  const [rows] = (await getPool().query(
    `SELECT AVG(stars) AS avg, COUNT(*) AS cnt
       FROM peer_star_ratings
       WHERE project_id = ? AND ratee_id = ? AND rater_id <> ? AND mod_state <> 'blocked'`,
    [projectId, rateeId, excludeRaterId],
  )) as unknown as [Array<{ avg: string | null; cnt: number }>];
  const r = rows[0] ?? { avg: null, cnt: 0 };
  return { avg: r.avg !== null ? Number(r.avg) : null, count: r.cnt };
}

// 관리자 검토 결과 반영 — 모더레이션 상태 변경(+removed 면 코멘트 비움).
export async function setModState(id: number, state: ModState, clearComment = false): Promise<void> {
  if (clearComment) {
    await getPool().query(`UPDATE peer_star_ratings SET mod_state = ?, comment = NULL WHERE id = ?`, [state, id]);
  } else {
    await getPool().query(`UPDATE peer_star_ratings SET mod_state = ? WHERE id = ?`, [state, id]);
  }
}

export async function findRowById(
  id: number,
): Promise<{ id: number; project_id: number; rater_id: number; ratee_id: number } | undefined> {
  const [rows] = (await getPool().query(
    `SELECT id, project_id, rater_id, ratee_id FROM peer_star_ratings WHERE id = ?`,
    [id],
  )) as unknown as [Array<{ id: number; project_id: number; rater_id: number; ratee_id: number }>];
  return rows[0];
}
