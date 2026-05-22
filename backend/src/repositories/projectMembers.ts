import { getPool } from '../db/connection.js';

export type MemberState = 'INVITED' | 'ACCEPTED' | 'LEFT' | 'REJECTED';

export interface MemberRow {
  id: number;
  project_id: number;
  user_id: number;
  role: string;
  state: MemberState;
  invited_by: number | null;
  joined_at: Date | null;
  created_at: Date;
}

export async function findByProject(projectId: number): Promise<MemberRow[]> {
  const [rows] = (await getPool().query(
    `SELECT * FROM project_members WHERE project_id = ? ORDER BY created_at`,
    [projectId],
  )) as unknown as [MemberRow[]];
  return rows;
}

export async function findOne(projectId: number, userId: number): Promise<MemberRow | null> {
  const [rows] = (await getPool().query(
    `SELECT * FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1`,
    [projectId, userId],
  )) as unknown as [MemberRow[]];
  return rows[0] ?? null;
}

export async function invite(projectId: number, userId: number, role: string, invitedBy: number): Promise<number> {
  const [res] = (await getPool().query(
    `INSERT INTO project_members (project_id, user_id, role, state, invited_by)
     VALUES (?, ?, ?, 'INVITED', ?)`,
    [projectId, userId, role, invitedBy],
  )) as unknown as [{ insertId: number }];
  return res.insertId;
}

export async function setState(id: number, state: MemberState, joinedAt?: Date): Promise<void> {
  if (state === 'ACCEPTED') {
    await getPool().query(
      `UPDATE project_members SET state = ?, joined_at = ? WHERE id = ?`,
      [state, joinedAt ?? new Date(), id],
    );
  } else {
    await getPool().query(`UPDATE project_members SET state = ? WHERE id = ?`, [state, id]);
  }
}

// FR-B6: 동시 진행 한도 3건 가드용
export async function countActiveByUser(userId: number): Promise<number> {
  const [[{ cnt }]] = (await getPool().query(
    `SELECT COUNT(*) AS cnt FROM project_members
        WHERE user_id = ? AND state IN ('INVITED','ACCEPTED')`,
    [userId],
  )) as unknown as [Array<{ cnt: number }>];
  return cnt;
}

export async function countAcceptedByProject(projectId: number): Promise<number> {
  const [[{ cnt }]] = (await getPool().query(
    `SELECT COUNT(*) AS cnt FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'`,
    [projectId],
  )) as unknown as [Array<{ cnt: number }>];
  return cnt;
}
