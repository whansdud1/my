import type { Knex } from 'knex';

// 013 — 팀 채팅 첨부: 한 메시지에 사진/파일을 0개 이상 붙인다(자료조사 공유용).
// 실제 바이트는 로컬 디스크(config.uploads.dir)에 저장하고, 이 테이블엔 메타만.
// 권한은 메시지 → 프로젝트(project_messages.project_id) 의 ACCEPTED 멤버로 게이팅.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE project_message_attachments (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      message_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('image','file') NOT NULL DEFAULT 'file',
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(150) NOT NULL,
      byte_size INT UNSIGNED NOT NULL,
      storage_key VARCHAR(300) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_pma_message FOREIGN KEY (message_id) REFERENCES project_messages(id) ON DELETE CASCADE,
      INDEX idx_pma_message (message_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS project_message_attachments`);
}
