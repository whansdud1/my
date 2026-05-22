import type { Knex } from 'knex';

// T009 — users / availabilities / consents
// MariaDB / InnoDB / utf8mb4

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      email_domain VARCHAR(63) NOT NULL,
      email_verified_at DATETIME(3) NULL,
      email_verify_token VARCHAR(64) NULL,
      email_verify_expires_at DATETIME(3) NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(50) NOT NULL,
      gender ENUM('M','F','OTHER','UNSPEC') NOT NULL DEFAULT 'UNSPEC',
      grade TINYINT UNSIGNED NULL,
      department VARCHAR(100) NULL,
      university VARCHAR(100) NULL,
      preferred_roles JSON NOT NULL,
      collaboration_style JSON NOT NULL,
      self_intro TEXT NULL,
      role_user ENUM('STUDENT','PROFESSOR','ADMIN') NOT NULL DEFAULT 'STUDENT',
      trust_score DECIMAL(4,2) NOT NULL DEFAULT 50.00,
      status ENUM('PENDING','ACTIVE','SUSPENDED','DELETED') NOT NULL DEFAULT 'PENDING',
      deleted_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_users_email_domain (email_domain),
      INDEX idx_users_dept_grade (department, grade),
      INDEX idx_users_role (role_user),
      INDEX idx_users_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE availabilities (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      weekday TINYINT UNSIGNED NOT NULL,         -- 0=일 .. 6=토
      start_min SMALLINT UNSIGNED NOT NULL,      -- 0..1439
      end_min SMALLINT UNSIGNED NOT NULL,
      pref_night BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_avail_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_avail_user_day (user_id, weekday),
      CHECK (end_min > start_min),
      CHECK (weekday BETWEEN 0 AND 6),
      CHECK (start_min BETWEEN 0 AND 1439 AND end_min BETWEEN 1 AND 1440)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE consents (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      consent_type ENUM('TOS','PRIVACY','COLLAB_METADATA','MARKETING','BODY_NLP') NOT NULL,
      version VARCHAR(20) NOT NULL,
      accepted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      revoked_at DATETIME(3) NULL,
      CONSTRAINT fk_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_consents_user_type (user_id, consent_type),
      INDEX idx_consents_user_active (user_id, consent_type, revoked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 이메일 도메인 화이트리스트 (시드는 T024가 채움)
  await knex.raw(`
    CREATE TABLE domain_whitelist (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      domain VARCHAR(127) NOT NULL UNIQUE,
      label VARCHAR(100) NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS domain_whitelist');
  await knex.raw('DROP TABLE IF EXISTS consents');
  await knex.raw('DROP TABLE IF EXISTS availabilities');
  await knex.raw('DROP TABLE IF EXISTS users');
}
