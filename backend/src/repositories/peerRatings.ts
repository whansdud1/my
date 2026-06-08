import { getPool } from '../db/connection.js';

// 팀원 별점 평가 저장소(peer_star_ratings) — 완료된 프로젝트의 1:1 별점.

export interface StarRatingRow {
  ratee_id: number;
  stars: string; // DECIMAL → 문자열로 옴
  comment: string | null;
}

// 한 평가자의 별점 1건 upsert(재제출 시 갱신).
export async function upsert(
  projectId: number,
  raterId: number,
  rateeId: number,
  stars: number,
  comment: string | null,
): Promise<void> {
  await getPool().query(
    `INSERT INTO peer_star_ratings (project_id, rater_id, ratee_id, stars, comment)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE stars = VALUES(stars), comment = VALUES(comment)`,
    [projectId, raterId, rateeId, stars, comment],
  );
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
export async function listReviewsForRatee(userId: number, limit = 50): Promise<ReviewRow[]> {
  const [rows] = (await getPool().query(
    `SELECT stars, comment, updated_at
       FROM peer_star_ratings
       WHERE ratee_id = ? AND comment IS NOT NULL AND comment <> ''
       ORDER BY updated_at DESC
       LIMIT ?`,
    [userId, limit],
  )) as unknown as [ReviewRow[]];
  return rows;
}

// 한 사용자가 받은 별점의 평균/개수 — 종합 평점 재계산용.
export async function averageForRatee(userId: number): Promise<{ avg: number | null; count: number }> {
  const [rows] = (await getPool().query(
    `SELECT AVG(stars) AS avg, COUNT(*) AS cnt FROM peer_star_ratings WHERE ratee_id = ?`,
    [userId],
  )) as unknown as [Array<{ avg: string | null; cnt: number }>];
  const r = rows[0] ?? { avg: null, cnt: 0 };
  return { avg: r.avg !== null ? Number(r.avg) : null, count: r.cnt };
}
