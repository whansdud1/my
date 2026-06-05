import type { Knex } from 'knex';

// 003-schedule-coordination — T003
// schedule_events / event_rsvps / calendar_connections / calendar_sync_map

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE schedule_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      type ENUM('MEETING','DEADLINE','MILESTONE') NOT NULL,
      title VARCHAR(150) NOT NULL,
      description VARCHAR(1000) NULL,
      starts_at DATETIME(3) NOT NULL,
      ends_at DATETIME(3) NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      recurrence_group_id CHAR(21) NULL,
      reminder_offset_min INT NOT NULL DEFAULT 60,
      reminder_sent_at DATETIME(3) NULL,
      status ENUM('SCHEDULED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_sched_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_sched_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_sched_project (project_id, starts_at),
      INDEX idx_sched_reminder (status, reminder_sent_at, starts_at),
      INDEX idx_sched_recur (recurrence_group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE event_rsvps (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      response ENUM('ATTEND','DECLINE','PENDING') NOT NULL DEFAULT 'PENDING',
      responded_at DATETIME(3) NULL,
      UNIQUE KEY uniq_event_user (event_id, user_id),
      CONSTRAINT fk_rsvp_event FOREIGN KEY (event_id) REFERENCES schedule_events(id) ON DELETE CASCADE,
      CONSTRAINT fk_rsvp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE calendar_connections (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      provider ENUM('GOOGLE') NOT NULL DEFAULT 'GOOGLE',
      access_token_enc VARBINARY(1024) NULL,
      refresh_token_enc VARBINARY(1024) NULL,
      expires_at DATETIME(3) NULL,
      sync_state ENUM('ACTIVE','EXPIRED','DISCONNECTED') NOT NULL DEFAULT 'ACTIVE',
      connected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_calconn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE calendar_sync_map (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      schedule_event_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      external_event_id VARCHAR(255) NOT NULL,
      last_synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_event_user_sync (schedule_event_id, user_id),
      CONSTRAINT fk_syncmap_event FOREIGN KEY (schedule_event_id) REFERENCES schedule_events(id) ON DELETE CASCADE,
      CONSTRAINT fk_syncmap_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS calendar_sync_map');
  await knex.raw('DROP TABLE IF EXISTS calendar_connections');
  await knex.raw('DROP TABLE IF EXISTS event_rsvps');
  await knex.raw('DROP TABLE IF EXISTS schedule_events');
}
