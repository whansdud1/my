import { getPool } from '../db/connection.js';

export interface MessageRow {
  id: number;
  project_id: number;
  user_id: number;
  body: string;
  created_at: Date;
  name: string; // JOIN users.name
}

// 메시지 저장 후 작성자 이름까지 합쳐 단건 반환(브로드캐스트 DTO 구성용).
export async function insert(projectId: number, userId: number, body: string): Promise<MessageRow> {
  const pool = getPool();
  const [res] = (await pool.query(
    `INSERT INTO project_messages (project_id, user_id, body) VALUES (?, ?, ?)`,
    [projectId, userId, body],
  )) as unknown as [{ insertId: number }];
  const [rows] = (await pool.query(
    `SELECT pm.id, pm.project_id, pm.user_id, pm.body, pm.created_at, u.name
       FROM project_messages pm JOIN users u ON u.id = pm.user_id
      WHERE pm.id = ?`,
    [res.insertId],
  )) as unknown as [MessageRow[]];
  const row = rows[0];
  if (!row) throw new Error('insert(project_messages): 방금 저장한 행을 다시 읽지 못했습니다');
  return row;
}

// 프로젝트 메시지 조회(항상 시간 오름차순 반환).
//  - afterId: 그보다 최신(큰 id) 메시지 — 재연결 시 놓친 메시지 따라잡기(catch-up).
//  - beforeId: 그보다 과거(작은 id) 메시지 — 위로 더 불러오기.
//  - 둘 다 없으면 최신 N개.
export async function listByProject(
  projectId: number,
  opts: { beforeId?: number; afterId?: number; limit?: number } = {},
): Promise<MessageRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

  // catch-up: id > afterId 를 오래된 순으로(=놓친 순서대로) 그대로 반환.
  if (opts.afterId) {
    const [rows] = (await getPool().query(
      `SELECT pm.id, pm.project_id, pm.user_id, pm.body, pm.created_at, u.name
         FROM project_messages pm JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ? AND pm.id > ?
        ORDER BY pm.id ASC
        LIMIT ?`,
      [projectId, opts.afterId, limit],
    )) as unknown as [MessageRow[]];
    return rows;
  }

  // 초기/이전 로드: 최신순 LIMIT 후 오름차순으로 뒤집어 반환.
  const params: Array<number> = [projectId];
  let where = 'pm.project_id = ?';
  if (opts.beforeId) {
    where += ' AND pm.id < ?';
    params.push(opts.beforeId);
  }
  const [rows] = (await getPool().query(
    `SELECT pm.id, pm.project_id, pm.user_id, pm.body, pm.created_at, u.name
       FROM project_messages pm JOIN users u ON u.id = pm.user_id
      WHERE ${where}
      ORDER BY pm.id DESC
      LIMIT ?`,
    [...params, limit],
  )) as unknown as [MessageRow[]];
  return rows.reverse();
}
