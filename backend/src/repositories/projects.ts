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
  recruit_closed_at: Date | null;
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
  // owner 조인 — 작성자 이름(users.name) 검색에 사용.
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (f.status) {
    where.push('p.status = ?');
    params.push(f.status);
  }
  if (f.ownerId) {
    where.push('p.owner_id = ?');
    params.push(f.ownerId);
  }
  if (f.q) {
    // 제목·설명·작성자 이름·모집 역할(required_roles JSON)까지 검색.
    // 역할은 LOWER 로 대소문자 무시(JSON 은 기본 case-sensitive)하고 $[*].role 경로만 대상으로 한다.
    where.push(
      `(p.title LIKE ? OR p.description LIKE ? OR u.name LIKE ?
        OR JSON_SEARCH(LOWER(p.required_roles), 'one', LOWER(?), NULL, '$[*].role') IS NOT NULL)`,
    );
    const like = `%${f.q}%`;
    params.push(like, like, like, like);
  }
  // 모집 완료 후 1일이 지난 '모집 중' 프로젝트는 목록에서 숨김.
  // (RUNNING 등 시작된 프로젝트는 recruit_closed_at 이 오래돼도 계속 노출)
  where.push(
    `(p.status <> 'RECRUIT' OR p.recruit_closed_at IS NULL OR p.recruit_closed_at >= NOW(3) - INTERVAL 1 DAY)`,
  );
  const page = f.page && f.page > 0 ? f.page : 1;
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const FROM = `FROM projects p JOIN users u ON u.id = p.owner_id`;

  const [countRows] = (await getPool().query(
    `SELECT COUNT(*) AS cnt ${FROM} WHERE ${where.join(' AND ')}`,
    params,
  )) as unknown as [Array<{ cnt: number }>];

  const [rows] = (await getPool().query(
    `SELECT p.* ${FROM} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )) as unknown as [ProjectRow[]];

  return { items: rows, total: countRows[0]?.cnt ?? 0 };
}

export async function updateStatus(id: number, status: ProjectRow['status']): Promise<void> {
  await getPool().query(`UPDATE projects SET status = ? WHERE id = ?`, [status, id]);
}

// 프로젝트 삭제 — project_members 등은 FK ON DELETE CASCADE 로 함께 삭제된다.
export async function remove(id: number): Promise<void> {
  await getPool().query(`DELETE FROM projects WHERE id = ?`, [id]);
}

// 모집 완료 처리 — 상태는 RECRUIT 로 유지하고 완료 시각만 기록.
// (RUNNING 전환은 팀장이 직접 '프로젝트 시작'을 눌러야 일어난다 → start() 참고)
export async function closeRecruit(id: number): Promise<void> {
  await getPool().query(
    `UPDATE projects SET recruit_closed_at = NOW(3) WHERE id = ?`,
    [id],
  );
}

// 프로젝트 시작 — 팀장이 수동으로 RUNNING 전환. 아직 모집이 안 닫혔으면 종료 시각도 기록.
export async function start(id: number): Promise<void> {
  await getPool().query(
    `UPDATE projects SET status = 'RUNNING', recruit_closed_at = COALESCE(recruit_closed_at, NOW(3)) WHERE id = ?`,
    [id],
  );
}

// 프로젝트 완료 — 팀장이 진행 중(RUNNING) 프로젝트를 완료(CLOSED) 처리. 이후 팀원 별점 평가가 열린다.
export async function complete(id: number): Promise<void> {
  await getPool().query(`UPDATE projects SET status = 'CLOSED' WHERE id = ?`, [id]);
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
