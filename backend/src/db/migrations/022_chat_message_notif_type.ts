import type { Knex } from 'knex';

// 022 — 팀 채팅 새 메시지 알림 종류(CHAT_MESSAGE) 추가.
// 시드(02_notification_types)와 동일 정의를 기존 DB에도 반영한다.
// notifications.type → notification_types.code FK 제약 때문에 발행 전에 타입이 존재해야 한다.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `INSERT INTO notification_types (code, default_priority, default_audience, is_mandatory)
     VALUES ('CHAT_MESSAGE', 'NORMAL', 'TEAM', FALSE)
     ON DUPLICATE KEY UPDATE
       default_priority = VALUES(default_priority),
       default_audience = VALUES(default_audience),
       is_mandatory = VALUES(is_mandatory)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  // 해당 타입으로 발행된 알림이 있으면 FK 때문에 삭제 불가 → 먼저 정리 후 타입 제거.
  await knex.raw(`DELETE FROM notifications WHERE type = 'CHAT_MESSAGE'`);
  await knex.raw(`DELETE FROM notification_types WHERE code = 'CHAT_MESSAGE'`);
}
