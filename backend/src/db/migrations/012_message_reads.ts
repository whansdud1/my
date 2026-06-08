import type { Knex } from 'knex';

// 012 — 팀 채팅 읽음 추적: 멤버별로 "마지막으로 읽은 메시지 id" 한 줄을 둔다.
//  - 안읽음 수 = 내 last_read 보다 크고 내가 쓰지 않은 메시지 수
//  - 읽음 표시 = 특정 메시지 id 이상을 읽은 다른 멤버 수
// 메시지 단위가 아니라 커서(마지막 읽은 id) 방식이라 행 수가 멤버 수로 고정된다.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE project_message_reads (
      project_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (project_id, user_id),
      CONSTRAINT fk_pmr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_pmr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS project_message_reads`);
}
