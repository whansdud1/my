import type { Knex } from 'knex';

// T010 — projects / project_members / matching_recommendations / invites

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE projects (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      owner_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(150) NOT NULL,
      description TEXT NULL,
      type ENUM('CONTEST','CLASS','SELF') NOT NULL DEFAULT 'SELF',
      required_roles JSON NOT NULL,
      target_size TINYINT UNSIGNED NOT NULL,
      starts_at DATETIME(3) NULL,
      ends_at DATETIME(3) NULL,
      work_time_pref ENUM('DAY','NIGHT','ANY') NOT NULL DEFAULT 'ANY',
      status ENUM('RECRUIT','RUNNING','CLOSED','ARCHIVED') NOT NULL DEFAULT 'RECRUIT',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
      INDEX idx_projects_status_start (status, starts_at),
      INDEX idx_projects_type (type),
      INDEX idx_projects_owner (owner_id),
      CHECK (target_size BETWEEN 2 AND 20)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE project_members (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      role VARCHAR(40) NOT NULL,
      state ENUM('INVITED','ACCEPTED','LEFT','REJECTED') NOT NULL DEFAULT 'INVITED',
      invited_by BIGINT UNSIGNED NULL,
      joined_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_project_user (project_id, user_id),
      CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_pm_user_state (user_id, state),
      INDEX idx_pm_project_state (project_id, state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE matching_recommendations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      candidate_id BIGINT UNSIGNED NOT NULL,
      score DECIMAL(5,2) NOT NULL,
      score_breakdown JSON NOT NULL,
      generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      expires_at DATETIME(3) NOT NULL,
      CONSTRAINT fk_mr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_mr_candidate FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_mr_project_score (project_id, score DESC),
      INDEX idx_mr_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS matching_recommendations');
  await knex.raw('DROP TABLE IF EXISTS project_members');
  await knex.raw('DROP TABLE IF EXISTS projects');
}
