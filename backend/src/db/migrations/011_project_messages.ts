import type { Knex } from 'knex';

// 011 — 팀 채팅: 프로젝트(팀)에 속한 ACCEPTED 멤버들이 주고받는 메시지.
// 권한은 project_members.state = 'ACCEPTED' 로 게이팅(라우트/소켓에서 검증).
// 실시간 전달은 socket.io(/api/socket.io), 영속/히스토리는 이 테이블.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE project_messages (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      body VARCHAR(2000) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_pmsg_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_pmsg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_pmsg_project_id (project_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS project_messages`);
}
