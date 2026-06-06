import { getPool } from '../db/connection.js';

// 읽음 커서 저장/조회. last_read 는 GREATEST 로만 전진(뒤로 가지 않음).

export async function markRead(
  projectId: number,
  userId: number,
  messageId: number,
): Promise<number> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO project_message_reads (project_id, user_id, last_read_message_id)
       VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id))`,
    [projectId, userId, messageId],
  );
  const [[row]] = (await pool.query(
    `SELECT last_read_message_id AS lr FROM project_message_reads WHERE project_id = ? AND user_id = ?`,
    [projectId, userId],
  )) as unknown as [Array<{ lr: number }>];
  return Number(row?.lr ?? messageId);
}

// 프로젝트 멤버들의 마지막 읽은 id (읽음 표시 계산용).
export async function lastReads(
  projectId: number,
): Promise<Array<{ userId: number; lastReadId: number }>> {
  const [rows] = (await getPool().query(
    `SELECT user_id, last_read_message_id FROM project_message_reads WHERE project_id = ?`,
    [projectId],
  )) as unknown as [Array<{ user_id: number; last_read_message_id: number }>];
  return rows.map((r) => ({ userId: r.user_id, lastReadId: Number(r.last_read_message_id) }));
}

// 특정 프로젝트에서 내 안읽음 수 (내 last_read 초과 + 내가 쓰지 않은 메시지).
export async function unreadCount(projectId: number, userId: number): Promise<number> {
  const [[row]] = (await getPool().query(
    `SELECT COUNT(*) AS cnt FROM project_messages m
       WHERE m.project_id = ?
         AND m.user_id <> ?
         AND m.id > COALESCE(
           (SELECT last_read_message_id FROM project_message_reads WHERE project_id = ? AND user_id = ?), 0)`,
    [projectId, userId, projectId, userId],
  )) as unknown as [Array<{ cnt: number }>];
  return Number(row?.cnt ?? 0);
}

// 내가 ACCEPTED 인 모든 프로젝트의 프로젝트별 안읽음 수 (프로필/배지 집계용).
export async function unreadByUser(
  userId: number,
): Promise<Array<{ projectId: number; unread: number }>> {
  const [rows] = (await getPool().query(
    `SELECT pm.project_id AS projectId, COUNT(msg.id) AS unread
       FROM project_members pm
       LEFT JOIN project_message_reads r
         ON r.project_id = pm.project_id AND r.user_id = pm.user_id
       LEFT JOIN project_messages msg
         ON msg.project_id = pm.project_id
        AND msg.user_id <> pm.user_id
        AND msg.id > COALESCE(r.last_read_message_id, 0)
      WHERE pm.user_id = ? AND pm.state = 'ACCEPTED'
      GROUP BY pm.project_id`,
    [userId],
  )) as unknown as [Array<{ projectId: number; unread: number }>];
  return rows.map((r) => ({ projectId: Number(r.projectId), unread: Number(r.unread) }));
}
