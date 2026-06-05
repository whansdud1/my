import type { Knex } from 'knex';

// 002-notification-system — T005
// notification_types / notifications / notification_preferences /
// user_notification_settings / notification_outbox / delivery_logs

export async function up(knex: Knex): Promise<void> {
  // 006_admin 의 MVP용 notifications 테이블을 본 알림 시스템이 대체한다.
  // 레거시 데이터는 단순 초대 알림뿐이며 새 스키마로 자동 이관 대상이 아님(폐기).
  await knex.raw('DROP TABLE IF EXISTS notifications');

  await knex.raw(`
    CREATE TABLE notification_types (
      code VARCHAR(50) NOT NULL PRIMARY KEY,
      default_priority ENUM('CRITICAL','NORMAL','INFO') NOT NULL DEFAULT 'NORMAL',
      default_audience ENUM('INDIVIDUAL','TEAM_LEAD','TEAM','ADMIN') NOT NULL DEFAULT 'INDIVIDUAL',
      is_mandatory BOOLEAN NOT NULL DEFAULT FALSE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      recipient_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(50) NOT NULL,
      priority ENUM('CRITICAL','NORMAL','INFO') NOT NULL DEFAULT 'NORMAL',
      title VARCHAR(150) NOT NULL,
      body VARCHAR(1000) NOT NULL,
      deep_link VARCHAR(500) NULL,
      target_ref VARCHAR(100) NULL,
      dedup_key CHAR(64) NULL,
      group_count INT UNSIGNED NOT NULL DEFAULT 1,
      status ENUM('UNREAD','READ','ARCHIVED') NOT NULL DEFAULT 'UNREAD',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      read_at DATETIME(3) NULL,
      CONSTRAINT fk_notif_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_notif_type FOREIGN KEY (type) REFERENCES notification_types(code),
      INDEX idx_notif_recipient (recipient_id, status, created_at),
      INDEX idx_notif_dedup (dedup_key, status),
      INDEX idx_notif_archive (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE notification_preferences (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(50) NOT NULL,
      in_app BOOLEAN NOT NULL DEFAULT TRUE,
      email BOOLEAN NOT NULL DEFAULT TRUE,
      push BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE KEY uniq_user_type (user_id, type),
      CONSTRAINT fk_pref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_pref_type FOREIGN KEY (type) REFERENCES notification_types(code) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE user_notification_settings (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      dnd_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      quiet_start TIME NOT NULL DEFAULT '22:00:00',
      quiet_end TIME NOT NULL DEFAULT '08:00:00',
      timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
      CONSTRAINT fk_uns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE notification_outbox (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      notification_id BIGINT UNSIGNED NOT NULL,
      channel ENUM('IN_APP','EMAIL','PUSH') NOT NULL,
      status ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
      attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
      next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_error VARCHAR(500) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_outbox_notif FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
      INDEX idx_outbox_due (status, next_attempt_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE delivery_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      notification_id BIGINT UNSIGNED NOT NULL,
      channel ENUM('IN_APP','EMAIL','PUSH') NOT NULL,
      result ENUM('SENT','FAILED','RETRIED','SUPPRESSED') NOT NULL,
      attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_dlog_notif (notification_id),
      INDEX idx_dlog_result (result, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS delivery_logs');
  await knex.raw('DROP TABLE IF EXISTS notification_outbox');
  await knex.raw('DROP TABLE IF EXISTS user_notification_settings');
  await knex.raw('DROP TABLE IF EXISTS notification_preferences');
  await knex.raw('DROP TABLE IF EXISTS notifications');
  await knex.raw('DROP TABLE IF EXISTS notification_types');

  // 006_admin 의 레거시 notifications 테이블 복원(롤백 일관성 — 006 down 과 호환)
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
}
