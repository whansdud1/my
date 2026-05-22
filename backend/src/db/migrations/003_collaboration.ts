import type { Knex } from 'knex';

// T011 — collab_integrations / collaboration_activities (월 단위 RANGE 파티션)

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE collab_integrations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      provider ENUM('ZOOM','DISCORD','NOTION','GOOGLE') NOT NULL,
      access_token_enc VARBINARY(2048) NOT NULL,
      refresh_token_enc VARBINARY(2048) NULL,
      scope VARCHAR(255) NOT NULL,
      expires_at DATETIME(3) NULL,
      revoked_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_user_provider (user_id, provider),
      CONSTRAINT fk_ci_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // collaboration_activities: 월 단위 파티션.
  // 파티션 키에 PK가 포함되어야 하므로 PRIMARY KEY (id, occurred_at).
  // 외래 키는 파티션 테이블에서 지원되지 않으므로 미설정(서비스 레이어에서 보장).
  await knex.raw(`
    CREATE TABLE collaboration_activities (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      provider ENUM('ZOOM','DISCORD','NOTION','GOOGLE','MANUAL') NOT NULL,
      activity_type ENUM('MEETING_JOIN','UPLOAD','MESSAGE_RESP','DEADLINE_MET','DEADLINE_MISS') NOT NULL,
      occurred_at DATETIME(3) NOT NULL,
      meta JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id, occurred_at),
      KEY idx_ca_project_time (project_id, occurred_at),
      KEY idx_ca_user_time (user_id, occurred_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    PARTITION BY RANGE (TO_DAYS(occurred_at)) (
      PARTITION p_2026_05 VALUES LESS THAN (TO_DAYS('2026-06-01')),
      PARTITION p_2026_06 VALUES LESS THAN (TO_DAYS('2026-07-01')),
      PARTITION p_2026_07 VALUES LESS THAN (TO_DAYS('2026-08-01')),
      PARTITION p_2026_08 VALUES LESS THAN (TO_DAYS('2026-09-01')),
      PARTITION p_2026_09 VALUES LESS THAN (TO_DAYS('2026-10-01')),
      PARTITION p_2026_10 VALUES LESS THAN (TO_DAYS('2026-11-01')),
      PARTITION p_2026_11 VALUES LESS THAN (TO_DAYS('2026-12-01')),
      PARTITION p_2026_12 VALUES LESS THAN (TO_DAYS('2027-01-01')),
      PARTITION p_max     VALUES LESS THAN MAXVALUE
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS collaboration_activities');
  await knex.raw('DROP TABLE IF EXISTS collab_integrations');
}
