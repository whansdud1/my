import type { Knex } from 'knex';

// 002-notification-system — T006
// 알림 종류 시드. SECURITY_ALERT 만 필수(끌 수 없음, FR-C3).

type Priority = 'CRITICAL' | 'NORMAL' | 'INFO';
type Audience = 'INDIVIDUAL' | 'TEAM_LEAD' | 'TEAM' | 'ADMIN';

const TYPES: Array<{ code: string; priority: Priority; audience: Audience; mandatory: boolean }> = [
  { code: 'MATCH_READY', priority: 'NORMAL', audience: 'INDIVIDUAL', mandatory: false },
  { code: 'TEAM_JOIN_REQUEST', priority: 'NORMAL', audience: 'INDIVIDUAL', mandatory: false },
  { code: 'TEAM_JOIN_RESULT', priority: 'NORMAL', audience: 'INDIVIDUAL', mandatory: false },
  { code: 'COLLAB_RISK', priority: 'CRITICAL', audience: 'TEAM_LEAD', mandatory: false }, // WA-03: 팀장만
  { code: 'EVAL_REQUEST', priority: 'NORMAL', audience: 'INDIVIDUAL', mandatory: false },
  { code: 'EVAL_REMINDER', priority: 'NORMAL', audience: 'INDIVIDUAL', mandatory: false },
  { code: 'SCHEDULE_CHANGE', priority: 'INFO', audience: 'TEAM', mandatory: false },
  { code: 'CHAT_MESSAGE', priority: 'NORMAL', audience: 'TEAM', mandatory: false }, // 팀 채팅 새 메시지(발신자 제외)
  { code: 'TASK_ASSIGNED', priority: 'NORMAL', audience: 'INDIVIDUAL', mandatory: false },
  { code: 'ADMIN_REVIEW', priority: 'NORMAL', audience: 'ADMIN', mandatory: false },
  { code: 'SECURITY_ALERT', priority: 'CRITICAL', audience: 'INDIVIDUAL', mandatory: true },
  { code: 'SYSTEM_NOTICE', priority: 'INFO', audience: 'INDIVIDUAL', mandatory: false },
];

export async function seed(knex: Knex): Promise<void> {
  for (const t of TYPES) {
    await knex.raw(
      `INSERT INTO notification_types (code, default_priority, default_audience, is_mandatory)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         default_priority = VALUES(default_priority),
         default_audience = VALUES(default_audience),
         is_mandatory = VALUES(is_mandatory)`,
      [t.code, t.priority, t.audience, t.mandatory],
    );
  }
}
