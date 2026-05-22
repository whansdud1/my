// T072 — 종합 평점 결합 (0.6 * peer + 0.4 * AI) → ratings 갱신
//
// peer: 평균(contribution+communication+responsibility+satisfaction)/4 → 1~5
// AI:   ai_scores.total → 0~5
// 결합 후 ratings.stars (DECIMAL 3,2) 로 저장.

import { getPool } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';

export async function recomputeRating(userId: number): Promise<{ stars: number; count: number }> {
  const pool = getPool();
  // peer 평균 (APPLIED 만 반영)
  const [[peer]] = (await pool.query(
    `SELECT AVG((contribution + communication + responsibility + satisfaction) / 4) AS avg_peer,
            COUNT(*) AS cnt
       FROM evaluations
       WHERE evaluatee_id = ? AND review_state = 'APPLIED'`,
    [userId],
  )) as unknown as [Array<{ avg_peer: string | null; cnt: number }>];

  // AI 평균
  const [[ai]] = (await pool.query(
    `SELECT AVG(total) AS avg_ai FROM ai_scores WHERE user_id = ?`,
    [userId],
  )) as unknown as [Array<{ avg_ai: string | null }>];

  const peerAvg = peer.avg_peer ? Number(peer.avg_peer) : null;
  const aiAvg = ai.avg_ai ? Number(ai.avg_ai) : null;

  let stars: number;
  if (peerAvg !== null && aiAvg !== null) stars = 0.6 * peerAvg + 0.4 * aiAvg;
  else if (peerAvg !== null) stars = peerAvg;
  else if (aiAvg !== null) stars = aiAvg;
  else stars = 0;

  stars = Math.max(0, Math.min(5, Math.round(stars * 100) / 100));

  await pool.query(
    `INSERT INTO ratings (user_id, stars, evaluation_count) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE stars = VALUES(stars), evaluation_count = VALUES(evaluation_count)`,
    [userId, stars, peer.cnt],
  );

  logger.info({ userId, stars, count: peer.cnt }, 'ratings recomputed');
  return { stars, count: peer.cnt };
}
