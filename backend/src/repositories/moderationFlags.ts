import { getPool } from '../db/connection.js';

// 관리자 검토 큐(moderation_flags) 저장소.

export type FlagKind = 'TOXIC_TEXT' | 'RATING_ANOMALY';
export type FlagState = 'pending' | 'kept' | 'removed';
export type FlagSeverity = 'low' | 'medium' | 'high';

export interface NewFlag {
  targetType: 'peer_rating' | 'evaluation';
  targetId: number;
  projectId?: number | null;
  raterId?: number | null;
  rateeId?: number | null;
  kind: FlagKind;
  severity: FlagSeverity;
  score?: number | null;
  snippet?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function insertFlag(f: NewFlag): Promise<number> {
  const [res] = (await getPool().query(
    `INSERT INTO moderation_flags
       (target_type, target_id, project_id, rater_id, ratee_id, kind, severity, score, snippet, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      f.targetType,
      f.targetId,
      f.projectId ?? null,
      f.raterId ?? null,
      f.rateeId ?? null,
      f.kind,
      f.severity,
      f.score ?? null,
      f.snippet ?? null,
      f.detail ? JSON.stringify(f.detail) : null,
    ],
  )) as unknown as [{ insertId: number }];
  return res.insertId;
}

export interface FlagRow {
  id: number;
  target_type: string;
  target_id: number;
  project_id: number | null;
  rater_id: number | null;
  ratee_id: number | null;
  kind: FlagKind;
  severity: FlagSeverity;
  score: string | null;
  snippet: string | null;
  detail: unknown;
  state: FlagState;
  created_at: Date;
}

export async function listFlags(state: FlagState | 'all', limit = 100): Promise<FlagRow[]> {
  const where = state === 'all' ? '' : 'WHERE state = ?';
  const params = state === 'all' ? [limit] : [state, limit];
  const [rows] = (await getPool().query(
    `SELECT id, target_type, target_id, project_id, rater_id, ratee_id, kind, severity,
            score, snippet, detail, state, created_at
       FROM moderation_flags ${where}
       ORDER BY (state='pending') DESC, created_at DESC
       LIMIT ?`,
    params,
  )) as unknown as [FlagRow[]];
  return rows;
}

export async function findFlag(id: number): Promise<FlagRow | undefined> {
  const [rows] = (await getPool().query(
    `SELECT id, target_type, target_id, project_id, rater_id, ratee_id, kind, severity,
            score, snippet, detail, state, created_at
       FROM moderation_flags WHERE id = ?`,
    [id],
  )) as unknown as [FlagRow[]];
  return rows[0];
}

export async function resolveFlag(id: number, state: 'kept' | 'removed', adminId: number): Promise<void> {
  await getPool().query(
    `UPDATE moderation_flags SET state = ?, resolved_by = ?, resolved_at = NOW(3) WHERE id = ?`,
    [state, adminId, id],
  );
}

export async function pendingCount(): Promise<number> {
  const [rows] = (await getPool().query(
    `SELECT COUNT(*) AS c FROM moderation_flags WHERE state = 'pending'`,
  )) as unknown as [Array<{ c: number }>];
  return rows[0]?.c ?? 0;
}
