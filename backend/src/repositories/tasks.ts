import { getPool } from '../db/connection.js';

// 015 — 프로젝트 업무/태스크 저장소(To-Be ③)

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface TaskRow {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  status: TaskStatus;
  due_date: string | null; // 'YYYY-MM-DD'
  created_by: number;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const SELECT = `
  SELECT t.id, t.project_id, t.title, t.description, t.assignee_id, u.name AS assignee_name,
         t.status, DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date, t.created_by,
         t.completed_at, t.created_at, t.updated_at
    FROM project_tasks t
    LEFT JOIN users u ON u.id = t.assignee_id`;

export async function listByProject(projectId: number): Promise<TaskRow[]> {
  const [rows] = (await getPool().query(
    `${SELECT} WHERE t.project_id = ?
       ORDER BY FIELD(t.status,'TODO','IN_PROGRESS','DONE'), t.due_date IS NULL, t.due_date, t.created_at`,
    [projectId],
  )) as unknown as [TaskRow[]];
  return rows;
}

export async function findById(id: number): Promise<TaskRow | null> {
  const [rows] = (await getPool().query(`${SELECT} WHERE t.id = ? LIMIT 1`, [id])) as unknown as [TaskRow[]];
  return rows[0] ?? null;
}

export async function insert(t: {
  projectId: number;
  title: string;
  description?: string | null;
  assigneeId?: number | null;
  dueDate?: string | null;
  createdBy: number;
}): Promise<number> {
  const [res] = (await getPool().query(
    `INSERT INTO project_tasks (project_id, title, description, assignee_id, due_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [t.projectId, t.title, t.description ?? null, t.assigneeId ?? null, t.dueDate ?? null, t.createdBy],
  )) as unknown as [{ insertId: number }];
  return res.insertId;
}

export async function update(
  id: number,
  fields: Partial<{
    title: string;
    description: string | null;
    assigneeId: number | null;
    status: TaskStatus;
    dueDate: string | null;
    completedAt: Date | null;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.title !== undefined) (sets.push('title = ?'), params.push(fields.title));
  if (fields.description !== undefined) (sets.push('description = ?'), params.push(fields.description));
  if (fields.assigneeId !== undefined) (sets.push('assignee_id = ?'), params.push(fields.assigneeId));
  if (fields.status !== undefined) (sets.push('status = ?'), params.push(fields.status));
  if (fields.dueDate !== undefined) (sets.push('due_date = ?'), params.push(fields.dueDate));
  if (fields.completedAt !== undefined) (sets.push('completed_at = ?'), params.push(fields.completedAt));
  if (sets.length === 0) return;
  params.push(id);
  await getPool().query(`UPDATE project_tasks SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function remove(id: number): Promise<void> {
  await getPool().query(`DELETE FROM project_tasks WHERE id = ?`, [id]);
}

// 대시보드 집계용 — 프로젝트의 상태별/담당자별 카운트
export interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number; // 마감 지남 + 미완료
}

export async function statsByProject(projectId: number): Promise<TaskStats> {
  const [rows] = (await getPool().query(
    `SELECT
        COUNT(*) AS total,
        SUM(status = 'TODO') AS todo,
        SUM(status = 'IN_PROGRESS') AS in_progress,
        SUM(status = 'DONE') AS done,
        SUM(status <> 'DONE' AND due_date IS NOT NULL AND due_date < CURDATE()) AS overdue
       FROM project_tasks WHERE project_id = ?`,
    [projectId],
  )) as unknown as [Array<{ total: number; todo: number | null; in_progress: number | null; done: number | null; overdue: number | null }>];
  const r = rows[0] ?? { total: 0, todo: 0, in_progress: 0, done: 0, overdue: 0 };
  return {
    total: Number(r.total ?? 0),
    todo: Number(r.todo ?? 0),
    inProgress: Number(r.in_progress ?? 0),
    done: Number(r.done ?? 0),
    overdue: Number(r.overdue ?? 0),
  };
}

// 담당자별 완료/전체 — 협업 효율 분석용
export interface MemberTaskLoad {
  user_id: number;
  assigned: number;
  done: number;
}

export async function loadByMember(projectId: number): Promise<MemberTaskLoad[]> {
  const [rows] = (await getPool().query(
    `SELECT assignee_id AS user_id, COUNT(*) AS assigned, SUM(status = 'DONE') AS done
       FROM project_tasks
       WHERE project_id = ? AND assignee_id IS NOT NULL
       GROUP BY assignee_id`,
    [projectId],
  )) as unknown as [Array<{ user_id: number; assigned: number; done: number | null }>];
  return rows.map((r) => ({ user_id: r.user_id, assigned: Number(r.assigned), done: Number(r.done ?? 0) }));
}
