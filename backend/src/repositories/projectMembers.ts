import { getPool } from '../db/connection.js';

export type MemberState = 'INVITED' | 'ACCEPTED' | 'LEFT' | 'REJECTED' | 'APPLIED';

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

// 본인이 속한(참여/대기/초대) 프로젝트 목록 — 프로필의 "내 프로젝트"용.
export async function findProjectsByUser(
  userId: number,
): Promise<
  Array<{
    project_id: number;
    title: string;
    status: 'RECRUIT' | 'RUNNING' | 'CLOSED' | 'ARCHIVED';
    role: string;
    state: MemberState;
    created_at: Date;
  }>
> {
  const [rows] = (await getPool().query(
    `SELECT pm.project_id, p.title, p.status, pm.role, pm.state, pm.created_at
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
      WHERE pm.user_id = ? AND pm.state IN ('APPLIED','ACCEPTED','INVITED')
      ORDER BY pm.created_at DESC`,
    [userId],
  )) as unknown as [
    Array<{
      project_id: number;
      title: string;
      status: 'RECRUIT' | 'RUNNING' | 'CLOSED' | 'ARCHIVED';
      role: string;
      state: MemberState;
      created_at: Date;
    }>,
  ];
  return rows;
}

// 수락(ACCEPTED)된 멤버의 역할별 인원 수 — 남은 역할 계산 및 매칭 점수에 사용.
export async function acceptedRoleCounts(projectId: number): Promise<Record<string, number>> {
  const [rows] = (await getPool().query(
    `SELECT role, COUNT(*) AS cnt FROM project_members
        WHERE project_id = ? AND state = 'ACCEPTED' GROUP BY role`,
    [projectId],
  )) as unknown as [Array<{ role: string; cnt: number }>];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.role] = Number(r.cnt);
  return out;
}

// 역할을 골라 지원 — 신규는 APPLIED 로 INSERT, 과거에 LEFT/REJECTED 였던 사용자는 재지원 허용.
// 이미 ACCEPTED/INVITED/APPLIED 상태면 호출 전에 Conflict 로 막아야 한다(여기서는 덮어쓰지 않음).
export async function apply(projectId: number, userId: number, role: string): Promise<number> {
  const [res] = (await getPool().query(
    `INSERT INTO project_members (project_id, user_id, role, state, invited_by, joined_at)
       VALUES (?, ?, ?, 'APPLIED', NULL, NULL)
     ON DUPLICATE KEY UPDATE
       role = VALUES(role),
       state = 'APPLIED',
       invited_by = NULL,
       joined_at = NULL`,
    [projectId, userId, role],
  )) as unknown as [{ insertId: number }];
  return res.insertId;
}

// 특정 프로젝트의 지원자(APPLIED) 목록 + 지원자 이름.
export async function findApplicants(
  projectId: number,
): Promise<Array<MemberRow & { name: string }>> {
  const [rows] = (await getPool().query(
    `SELECT pm.*, u.name AS name
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ? AND pm.state = 'APPLIED'
      ORDER BY pm.created_at`,
    [projectId],
  )) as unknown as [Array<MemberRow & { name: string }>];
  return rows;
}
