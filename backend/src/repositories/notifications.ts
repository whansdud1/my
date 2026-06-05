import { getPool } from '../db/connection.js';

// 002-notification-system — T007
// 알림/설정/outbox/로그 repository (raw mysql2, 기존 컨벤션 일치)

export type Priority = 'CRITICAL' | 'NORMAL' | 'INFO';
export type Audience = 'INDIVIDUAL' | 'TEAM_LEAD' | 'TEAM' | 'ADMIN';
export type NotifStatus = 'UNREAD' | 'READ' | 'ARCHIVED';
export type Channel = 'IN_APP' | 'EMAIL' | 'PUSH';
export type OutboxStatus = 'PENDING' | 'SENT' | 'FAILED';
export type DeliveryResult = 'SENT' | 'FAILED' | 'RETRIED' | 'SUPPRESSED';

export interface NotificationRow {
  id: number;
  recipient_id: number;
  type: string;
  priority: Priority;
  title: string;
  body: string;
  deep_link: string | null;
  target_ref: string | null;
  dedup_key: string | null;
  group_count: number;
  status: NotifStatus;
  created_at: Date;
  read_at: Date | null;
}

export interface TypeRow {
  code: string;
  default_priority: Priority;
  default_audience: Audience;
  is_mandatory: number; // tinyint
}

export interface PrefRow {
  user_id: number;
  type: string;
  in_app: number;
  email: number;
  push: number;
}

export interface SettingsRow {
  user_id: number;
  dnd_enabled: number;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
}

export interface OutboxRow {
  id: number;
  notification_id: number;
  channel: Channel;
  status: OutboxStatus;
  attempt_count: number;
  next_attempt_at: Date;
  last_error: string | null;
}

// --- types ---
export async function getType(code: string): Promise<TypeRow | null> {
  const [rows] = (await getPool().query(`SELECT * FROM notification_types WHERE code = ? LIMIT 1`, [
    code,
  ])) as unknown as [TypeRow[]];
  return rows[0] ?? null;
}

export async function listTypes(): Promise<TypeRow[]> {
  const [rows] = (await getPool().query(
    `SELECT * FROM notification_types ORDER BY code`,
  )) as unknown as [TypeRow[]];
  return rows;
}

// --- notifications ---
export async function insertNotification(n: {
  recipientId: number;
  type: string;
  priority: Priority;
  title: string;
  body: string;
  deepLink?: string | null;
  targetRef?: string | null;
  dedupKey?: string | null;
}): Promise<number> {
  const [res] = (await getPool().query(
    `INSERT INTO notifications (recipient_id, type, priority, title, body, deep_link, target_ref, dedup_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [n.recipientId, n.type, n.priority, n.title, n.body, n.deepLink ?? null, n.targetRef ?? null, n.dedupKey ?? null],
  )) as unknown as [{ insertId: number }];
  return res.insertId;
}

// dedup: 같은 키의 UNREAD 알림이 있으면 group_count++ 후 그 id 반환, 없으면 null
export async function bumpDedup(recipientId: number, dedupKey: string): Promise<number | null> {
  const [rows] = (await getPool().query(
    `SELECT id FROM notifications WHERE recipient_id = ? AND dedup_key = ? AND status = 'UNREAD' LIMIT 1`,
    [recipientId, dedupKey],
  )) as unknown as [Array<{ id: number }>];
  const existing = rows[0];
  if (!existing) return null;
  await getPool().query(
    `UPDATE notifications SET group_count = group_count + 1, created_at = NOW(3) WHERE id = ?`,
    [existing.id],
  );
  return existing.id;
}

export async function findById(id: number): Promise<NotificationRow | null> {
  const [rows] = (await getPool().query(`SELECT * FROM notifications WHERE id = ? LIMIT 1`, [
    id,
  ])) as unknown as [NotificationRow[]];
  return rows[0] ?? null;
}

export async function listForUser(
  userId: number,
  opts: { status?: NotifStatus | 'ALL'; cursor?: number; limit: number },
): Promise<NotificationRow[]> {
  const params: unknown[] = [userId];
  let where = `recipient_id = ?`;
  if (opts.status && opts.status !== 'ALL') {
    where += ` AND status = ?`;
    params.push(opts.status);
  } else {
    where += ` AND status <> 'ARCHIVED'`;
  }
  if (opts.cursor) {
    where += ` AND id < ?`;
    params.push(opts.cursor);
  }
  params.push(opts.limit);
  const [rows] = (await getPool().query(
    `SELECT * FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ?`,
    params,
  )) as unknown as [NotificationRow[]];
  return rows;
}

export async function unreadCount(userId: number): Promise<number> {
  const [rows] = (await getPool().query(
    `SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_id = ? AND status = 'UNREAD'`,
    [userId],
  )) as unknown as [Array<{ cnt: number }>];
  return rows[0]?.cnt ?? 0;
}

// 멱등 읽음 처리 — 본인 알림만. 이미 read면 변화 없음.
export async function markRead(userId: number, id: number): Promise<NotificationRow | null> {
  await getPool().query(
    `UPDATE notifications SET status = 'READ', read_at = NOW(3)
       WHERE id = ? AND recipient_id = ? AND status = 'UNREAD'`,
    [id, userId],
  );
  const n = await findById(id);
  if (!n || n.recipient_id !== userId) return null;
  return n;
}

export async function markAllRead(userId: number): Promise<number> {
  const [res] = (await getPool().query(
    `UPDATE notifications SET status = 'READ', read_at = NOW(3)
       WHERE recipient_id = ? AND status = 'UNREAD'`,
    [userId],
  )) as unknown as [{ affectedRows: number }];
  return res.affectedRows;
}

// 보관: 기간 경과한 READ/UNREAD → ARCHIVED (FR-F1)
export async function archiveOlderThan(days: number): Promise<number> {
  const [res] = (await getPool().query(
    `UPDATE notifications SET status = 'ARCHIVED'
       WHERE status <> 'ARCHIVED' AND created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [days],
  )) as unknown as [{ affectedRows: number }];
  return res.affectedRows;
}

// --- preferences ---
export async function getPrefs(userId: number): Promise<PrefRow[]> {
  const [rows] = (await getPool().query(`SELECT * FROM notification_preferences WHERE user_id = ?`, [
    userId,
  ])) as unknown as [PrefRow[]];
  return rows;
}

export async function getPref(userId: number, type: string): Promise<PrefRow | null> {
  const [rows] = (await getPool().query(
    `SELECT * FROM notification_preferences WHERE user_id = ? AND type = ? LIMIT 1`,
    [userId, type],
  )) as unknown as [PrefRow[]];
  return rows[0] ?? null;
}

export async function upsertPref(p: {
  userId: number;
  type: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO notification_preferences (user_id, type, in_app, email, push)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE in_app = VALUES(in_app), email = VALUES(email), push = VALUES(push)`,
    [p.userId, p.type, p.inApp, p.email, p.push],
  );
}

// --- settings ---
export async function getSettings(userId: number): Promise<SettingsRow | null> {
  const [rows] = (await getPool().query(
    `SELECT * FROM user_notification_settings WHERE user_id = ? LIMIT 1`,
    [userId],
  )) as unknown as [SettingsRow[]];
  return rows[0] ?? null;
}

export async function upsertSettings(s: {
  userId: number;
  dndEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO user_notification_settings (user_id, dnd_enabled, quiet_start, quiet_end, timezone)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE dnd_enabled = VALUES(dnd_enabled), quiet_start = VALUES(quiet_start),
       quiet_end = VALUES(quiet_end), timezone = VALUES(timezone)`,
    [s.userId, s.dndEnabled, s.quietStart, s.quietEnd, s.timezone],
  );
}

// --- outbox ---
export async function enqueueOutbox(
  notificationId: number,
  channel: Channel,
  nextAttemptAt?: Date,
): Promise<void> {
  await getPool().query(
    `INSERT INTO notification_outbox (notification_id, channel, next_attempt_at)
     VALUES (?, ?, ?)`,
    [notificationId, channel, nextAttemptAt ?? new Date()],
  );
}

export async function claimDueOutbox(limit: number): Promise<OutboxRow[]> {
  const [rows] = (await getPool().query(
    `SELECT * FROM notification_outbox
       WHERE status = 'PENDING' AND next_attempt_at <= NOW(3)
       ORDER BY next_attempt_at ASC LIMIT ?`,
    [limit],
  )) as unknown as [OutboxRow[]];
  return rows;
}

export async function markOutboxSent(id: number): Promise<void> {
  await getPool().query(`UPDATE notification_outbox SET status = 'SENT', attempt_count = attempt_count + 1 WHERE id = ?`, [
    id,
  ]);
}

export async function rescheduleOutbox(id: number, nextAttemptAt: Date, error: string): Promise<void> {
  await getPool().query(
    `UPDATE notification_outbox
       SET attempt_count = attempt_count + 1, next_attempt_at = ?, last_error = ?
       WHERE id = ?`,
    [nextAttemptAt, error.slice(0, 500), id],
  );
}

export async function markOutboxFailed(id: number, error: string): Promise<void> {
  await getPool().query(
    `UPDATE notification_outbox SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = ? WHERE id = ?`,
    [error.slice(0, 500), id],
  );
}

// --- delivery logs ---
export async function logDelivery(
  notificationId: number,
  channel: Channel,
  result: DeliveryResult,
  attemptCount: number,
): Promise<void> {
  await getPool().query(
    `INSERT INTO delivery_logs (notification_id, channel, result, attempt_count) VALUES (?, ?, ?, ?)`,
    [notificationId, channel, result, attemptCount],
  );
}
