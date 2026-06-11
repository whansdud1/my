import { getPool } from '../db/connection.js';
import type { RiskLevel, RiskFactor } from '../services/collabRisk/index.js';

// 023 — 협업 위험 알림 상태(프로젝트별 직전 평가/알림 레벨).
// collabRiskWorker 가 재알림 스팸을 막기 위해 사용한다.

export interface RiskAlertRow {
  project_id: number;
  last_level: RiskLevel;
  last_score: number;
  notified_at: Date | null;
}

export async function getState(projectId: number): Promise<RiskAlertRow | null> {
  const [rows] = (await getPool().query(
    `SELECT project_id, last_level, last_score, notified_at
       FROM collab_risk_alerts WHERE project_id = ? LIMIT 1`,
    [projectId],
  )) as unknown as [RiskAlertRow[]];
  return rows[0] ?? null;
}

// 현재 평가 결과를 기록. notified=true 면 notified_at 도 NOW 로 갱신한다.
export async function saveState(
  projectId: number,
  level: RiskLevel,
  score: number,
  factors: RiskFactor[],
  notified: boolean,
): Promise<void> {
  await getPool().query(
    `INSERT INTO collab_risk_alerts (project_id, last_level, last_score, last_factors, notified_at)
       VALUES (?, ?, ?, CAST(? AS JSON), ${notified ? 'NOW(3)' : 'NULL'})
     ON DUPLICATE KEY UPDATE
       last_level = VALUES(last_level),
       last_score = VALUES(last_score),
       last_factors = VALUES(last_factors)${notified ? ', notified_at = NOW(3)' : ''}`,
    [projectId, level, score, JSON.stringify(factors)],
  );
}
