import type { Knex } from 'knex';

// T013 — subscriptions / partnerships / partnership_members

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE subscriptions (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      tier ENUM('FREE','PREMIUM') NOT NULL DEFAULT 'FREE',
      started_at DATETIME(3) NULL,
      ends_at DATETIME(3) NULL,
      billing_state ENUM('NONE','ACTIVE','PAST_DUE','CANCELED') NOT NULL DEFAULT 'NONE',
      pg_provider VARCHAR(40) NULL,
      pg_subscription_id VARCHAR(100) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_sub_tier (tier, billing_state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE partnerships (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      org_name VARCHAR(150) NOT NULL,
      scope JSON NOT NULL,
      state ENUM('DRAFT','ACTIVE','EXPIRED') NOT NULL DEFAULT 'DRAFT',
      starts_at DATETIME(3) NULL,
      ends_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_part_state (state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE partnership_members (
      partnership_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      role VARCHAR(40) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (partnership_id, user_id),
      CONSTRAINT fk_pmem_part FOREIGN KEY (partnership_id) REFERENCES partnerships(id) ON DELETE CASCADE,
      CONSTRAINT fk_pmem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS partnership_members');
  await knex.raw('DROP TABLE IF EXISTS partnerships');
  await knex.raw('DROP TABLE IF EXISTS subscriptions');
}
