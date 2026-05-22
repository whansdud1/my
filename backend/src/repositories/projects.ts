import { getPool } from '../db/connection.js';

export interface ProjectRow {
  id: number;
  owner_id: number;
  title: string;
  description: string | null;
  type: 'CONTEST' | 'CLASS' | 'SELF';
  required_roles: Array<{ role: string; count: number }>;
  target_size: number;
  starts_at: Date | null;
  ends_at: Date | null;
  work_time_pref: 'DAY' | 'NIGHT' | 'ANY';
  status: 'RECRUIT' | 'RUNNING' | 'CLOSED' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectInput {
  ownerId: number;
  title: string;
  description?: string;
  type?: ProjectRow['type'];
  requiredRoles: Array<{ role: string; count: number }>;
  targetSize: number;
  startsAt?: string | null;
  endsAt?: string | null;
  workTimePref?: ProjectRow['work_time_pref'];
}

export async function create(p: CreateProjectInput): Promise<number> {
  const [res] = (await getPool().query(
    `INSERT INTO projects (owner_id, title, description, type, required_roles, target_size, starts_at, ends_at, work_time_pref)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?)`,
    [
      p.ownerId,
      p.title,
      p.description ?? null,
      p.type ?? 'SELF',
      JSON.stringify(p.requiredRoles ?? []),
      p.targetSize,
      p.startsAt ?? null,
      p.endsAt ?? null,
      p.workTimePref ?? 'ANY',
    ],
  )) as unknown as [{ insertId: number }];
  return res.insertId;
}

export async function findById(id: number): Promise<ProjectRow | null> {
  const [rows] = (await getPool().query(`SELECT * FROM projects WHERE id = ? LIMIT 1`, [id])) as unknown as [ProjectRow[]];
  return rows[0] ?? null;
}

export interface ListFilters {
  status?: ProjectRow['status'];
  q?: string;
  ownerId?: number;
  page?: number;
  pageSize?: number;
}

export async function list(f: ListFilters): Promise<{ items: ProjectRow[]; total: number }> {
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (f.status) {
    where.push('status = ?');
    params.push(f.status);
  }
  if (f.ownerId) {
    where.push('owner_id = ?');
    params.push(f.ownerId);
  }
  if (f.q) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const like = `%${f.q}%`;
    params.push(like, like);
  }
  const page = f.page && f.page > 0 ? f.page : 1;
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const [[{ cnt }]] = (await getPool().query(
    `SELECT COUNT(*) AS cnt FROM projects WHERE ${where.join(' AND ')}`,
    params,
  )) as unknown as [Array<{ cnt: number }>];

  const [rows] = (await getPool().query(
    `SELECT * FROM projects WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )) as unknown as [ProjectRow[]];

  return { items: rows, total: cnt };
}

export async function updateStatus(id: number, status: ProjectRow['status']): Promise<void> {
  await getPool().query(`UPDATE projects SET status = ? WHERE id = ?`, [status, id]);
}

export async function patch(id: number, fields: Partial<{ title: string; description: string | null; targetSize: number; startsAt: string | null; endsAt: string | null; workTimePref: ProjectRow['work_time_pref']; status: ProjectRow['status'] }>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const map: Array<[keyof typeof fields, string]> = [
    ['title', 'title'],
    ['description', 'description'],
    ['targetSize', 'target_size'],
    ['startsAt', 'starts_at'],
    ['endsAt', 'ends_at'],
    ['workTimePref', 'work_time_pref'],
    ['status', 'status'],
  ];
  for (const [k, col] of map) {
    if (fields[k] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(fields[k]);
    }
  }
  if (sets.length === 0) return;
  params.push(id);
  await getPool().query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params);
}
