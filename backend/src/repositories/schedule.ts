import { getPool } from '../db/connection.js';

// 003-schedule-coordination — T004

export type EventType = 'MEETING' | 'DEADLINE' | 'MILESTONE';
export type EventStatus = 'SCHEDULED' | 'CANCELLED';
export type RsvpResponse = 'ATTEND' | 'DECLINE' | 'PENDING';

export interface ScheduleEventRow {
  id: number;
  project_id: number;
  type: EventType;
  title: string;
  description: string | null;
  starts_at: Date;
  ends_at: Date | null;
  created_by: number;
  recurrence_group_id: string | null;
  reminder_offset_min: number;
  reminder_sent_at: Date | null;
  status: EventStatus;
  created_at: Date;
}

export interface AvailRow {
  user_id: number;
  weekday: number;
  start_min: number;
  end_min: number;
}

// 프로젝트 ACCEPTED 멤버(+owner)의 가용시간
export async function memberAvailabilities(projectId: number): Promise<AvailRow[]> {
  const [rows] = (await getPool().query(
    `SELECT a.user_id, a.weekday, a.start_min, a.end_min
       FROM availabilities a
       WHERE a.user_id IN (
         SELECT user_id FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'
         UNION SELECT owner_id FROM projects WHERE id = ?
       )`,
    [projectId, projectId],
  )) as unknown as [AvailRow[]];
  return rows;
}

// 공통 시간 계산의 분모(전원 수): ACCEPTED 멤버 + owner (중복 제거)
export async function memberCount(projectId: number): Promise<number> {
  const [rows] = (await getPool().query(
    `SELECT COUNT(*) AS cnt FROM (
        SELECT user_id FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'
        UNION SELECT owner_id FROM projects WHERE id = ?
     ) t`,
    [projectId, projectId],
  )) as unknown as [Array<{ cnt: number }>];
  return rows[0]?.cnt ?? 0;
}

export async function memberUserIds(projectId: number): Promise<number[]> {
  const [rows] = (await getPool().query(
    `SELECT user_id FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'
       UNION SELECT owner_id FROM projects WHERE id = ?`,
    [projectId, projectId],
  )) as unknown as [Array<{ user_id: number }>];
  return rows.map((r) => r.user_id);
}

// --- events ---
export async function insertEvent(e: {
  projectId: number;
  type: EventType;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  createdBy: number;
  recurrenceGroupId?: string | null;
  reminderOffsetMin: number;
}): Promise<number> {
  const [res] = (await getPool().query(
    `INSERT INTO schedule_events
       (project_id, type, title, description, starts_at, ends_at, created_by, recurrence_group_id, reminder_offset_min)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.projectId,
      e.type,
      e.title,
      e.description ?? null,
      e.startsAt,
      e.endsAt ?? null,
      e.createdBy,
      e.recurrenceGroupId ?? null,
      e.reminderOffsetMin,
    ],
  )) as unknown as [{ insertId: number }];
  return res.insertId;
}

export async function findEvent(id: number): Promise<ScheduleEventRow | null> {
  const [rows] = (await getPool().query(`SELECT * FROM schedule_events WHERE id = ? LIMIT 1`, [
    id,
  ])) as unknown as [ScheduleEventRow[]];
  return rows[0] ?? null;
}

export async function listEvents(projectId: number): Promise<ScheduleEventRow[]> {
  const [rows] = (await getPool().query(
    `SELECT * FROM schedule_events WHERE project_id = ? AND status = 'SCHEDULED' ORDER BY starts_at`,
    [projectId],
  )) as unknown as [ScheduleEventRow[]];
  return rows;
}

export async function updateEvent(
  id: number,
  patch: { title?: string; startsAt?: Date; endsAt?: Date | null },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(patch.title);
  }
  if (patch.startsAt !== undefined) {
    sets.push('starts_at = ?', 'reminder_sent_at = NULL'); // 시간 변경 시 리마인더 재무장
    params.push(patch.startsAt);
  }
  if (patch.endsAt !== undefined) {
    sets.push('ends_at = ?');
    params.push(patch.endsAt);
  }
  if (!sets.length) return;
  params.push(id);
  await getPool().query(`UPDATE schedule_events SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function cancelEvent(id: number): Promise<void> {
  await getPool().query(`UPDATE schedule_events SET status = 'CANCELLED' WHERE id = ?`, [id]);
}

// --- rsvp ---
export async function seedRsvps(eventId: number, userIds: number[]): Promise<void> {
  if (!userIds.length) return;
  const values = userIds.map(() => '(?, ?)').join(', ');
  const params = userIds.flatMap((u) => [eventId, u]);
  await getPool().query(
    `INSERT IGNORE INTO event_rsvps (event_id, user_id) VALUES ${values}`,
    params,
  );
}

export async function setRsvp(eventId: number, userId: number, response: RsvpResponse): Promise<void> {
  await getPool().query(
    `INSERT INTO event_rsvps (event_id, user_id, response, responded_at)
     VALUES (?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE response = VALUES(response), responded_at = NOW(3)`,
    [eventId, userId, response],
  );
}

export async function listRsvps(
  eventId: number,
): Promise<Array<{ user_id: number; name: string; response: RsvpResponse }>> {
  const [rows] = (await getPool().query(
    `SELECT r.user_id, u.name, r.response
       FROM event_rsvps r JOIN users u ON u.id = r.user_id
       WHERE r.event_id = ?`,
    [eventId],
  )) as unknown as [Array<{ user_id: number; name: string; response: RsvpResponse }>];
  return rows;
}

// --- reminder scan ---
export async function dueReminders(now: Date): Promise<ScheduleEventRow[]> {
  // reminder 시점(starts_at - offset)이 지났고 아직 미발송, 미래 시작, SCHEDULED
  const [rows] = (await getPool().query(
    `SELECT * FROM schedule_events
       WHERE status = 'SCHEDULED' AND reminder_sent_at IS NULL
         AND starts_at > ?
         AND DATE_SUB(starts_at, INTERVAL reminder_offset_min MINUTE) <= ?
       ORDER BY starts_at LIMIT 100`,
    [now, now],
  )) as unknown as [ScheduleEventRow[]];
  return rows;
}

export async function markReminderSent(id: number): Promise<void> {
  await getPool().query(`UPDATE schedule_events SET reminder_sent_at = NOW(3) WHERE id = ?`, [id]);
}
