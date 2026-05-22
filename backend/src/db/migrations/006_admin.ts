import type { Knex } from 'knex';

// T014 — notifications / audit_logs / refresh_tokens / dsr_requests

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(40) NOT NULL,
      body JSON NOT NULL,
      sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      read_at DATETIME(3) NULL,
      CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_notif_user_unread (user_id, read_at),
      INDEX idx_notif_user_type (user_id, type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      actor_id BIGINT UNSIGNED NULL,
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(40) NULL,
      target_id BIGINT UNSIGNED NULL,
      ip VARBINARY(16) NULL,
      meta JSON NULL,
      occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_audit_actor_time (actor_id, occurred_at),
      INDEX idx_audit_action_time (action, occurred_at),
      INDEX idx_audit_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // refresh 토큰 회전 추적 — 재사용 감지
  await knex.raw(`
    CREATE TABLE refresh_tokens (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      expires_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3) NULL,
      replaced_by BIGINT UNSIGNED NULL,
      user_agent VARCHAR(255) NULL,
      ip VARBINARY(16) NULL,
      UNIQUE KEY uniq_token_hash (token_hash),
      CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_rt_user_active (user_id, revoked_at, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 개인정보 요청(US10)
  await knex.raw(`
    CREATE TABLE dsr_requests (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      request_type ENUM('EXPORT','RECTIFY','DELETE') NOT NULL,
      state ENUM('OPEN','IN_PROGRESS','COMPLETED','REJECTED') NOT NULL DEFAULT 'OPEN',
      details JSON NULL,
      due_at DATETIME(3) NOT NULL,                       -- 30일 SLA
      completed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_dsr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_dsr_state_due (state, due_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS dsr_requests');
  await knex.raw('DROP TABLE IF EXISTS refresh_tokens');
  await knex.raw('DROP TABLE IF EXISTS audit_logs');
  await knex.raw('DROP TABLE IF EXISTS notifications');
}
