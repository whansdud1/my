import { getPool } from '../db/connection.js';

// T056 — matching_recommendations 캐시 (TTL 7일)

export interface RecCache {
  candidate_id: number;
  score: string;
  score_breakdown: Record<string, number>;
  generated_at: Date;
  expires_at: Date;
}

export async function getCached(projectId: number): Promise<RecCache[]> {
  const [rows] = (await getPool().query(
    `SELECT candidate_id, score, score_breakdown, generated_at, expires_at
       FROM matching_recommendations
       WHERE project_id = ? AND expires_at > NOW(3)
       ORDER BY score DESC LIMIT 50`,
    [projectId],
  )) as unknown as [RecCache[]];
  return rows;
}

export async function saveBatch(
  projectId: number,
  items: Array<{ candidateId: number; score: number; breakdown: Record<string, number> }>,
): Promise<void> {
  if (items.length === 0) return;
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM matching_recommendations WHERE project_id = ?`, [projectId]);
    const placeholders = items.map(() => '(?, ?, ?, CAST(? AS JSON), NOW(3), DATE_ADD(NOW(3), INTERVAL 7 DAY))').join(', ');
    const params = items.flatMap((i) => [projectId, i.candidateId, i.score, JSON.stringify(i.breakdown)]);
    await conn.query(
      `INSERT INTO matching_recommendations (project_id, candidate_id, score, score_breakdown, generated_at, expires_at) VALUES ${placeholders}`,
      params,
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function purgeExpired(): Promise<number> {
  const [res] = (await getPool().query(
    `DELETE FROM matching_recommendations WHERE expires_at <= NOW(3)`,
  )) as unknown as [{ affectedRows: number }];
  return res.affectedRows;
}
