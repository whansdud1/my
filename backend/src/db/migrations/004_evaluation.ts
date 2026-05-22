import type { Knex } from 'knex';

// T012 — evaluations / ai_scores / ratings / anomaly_flags

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE evaluations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      evaluator_id BIGINT UNSIGNED NOT NULL,
      evaluatee_id BIGINT UNSIGNED NOT NULL,
      contribution TINYINT UNSIGNED NOT NULL,
      communication TINYINT UNSIGNED NOT NULL,
      responsibility TINYINT UNSIGNED NOT NULL,
      satisfaction TINYINT UNSIGNED NOT NULL,
      comment TEXT NULL,
      review_state ENUM('PENDING','APPLIED','HOLD','REJECTED') NOT NULL DEFAULT 'PENDING',
      reviewer_weight DECIMAL(3,2) NOT NULL DEFAULT 1.00,
      submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_proj_eval_atee (project_id, evaluator_id, evaluatee_id),
      CONSTRAINT fk_eval_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_eval_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_eval_evaluatee FOREIGN KEY (evaluatee_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_eval_evaluatee (evaluatee_id, submitted_at),
      INDEX idx_eval_evaluator (evaluator_id, submitted_at),
      INDEX idx_eval_review_state (review_state),
      CHECK (evaluator_id <> evaluatee_id),
      CHECK (contribution BETWEEN 1 AND 5),
      CHECK (communication BETWEEN 1 AND 5),
      CHECK (responsibility BETWEEN 1 AND 5),
      CHECK (satisfaction BETWEEN 1 AND 5)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE ai_scores (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      project_id BIGINT UNSIGNED NOT NULL,
      meeting_rate DECIMAL(5,2) NOT NULL,
      upload_rate DECIMAL(5,2) NOT NULL,
      deadline_rate DECIMAL(5,2) NOT NULL,
      response_score DECIMAL(5,2) NOT NULL,
      completion_score DECIMAL(5,2) NOT NULL,
      total DECIMAL(4,2) NOT NULL,
      calculated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_user_project (user_id, project_id),
      CONSTRAINT fk_ai_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_ai_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE ratings (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      stars DECIMAL(3,2) NOT NULL DEFAULT 0.00,
      review_summary TEXT NULL,
      evaluation_count INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_ratings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await knex.raw(`
    CREATE TABLE anomaly_flags (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      evaluation_id BIGINT UNSIGNED NOT NULL,
      signal_type ENUM('PAIR_BIAS','ACTIVITY_GAP','BURST_LOW') NOT NULL,
      severity ENUM('LOW','MEDIUM','HIGH') NOT NULL,
      state ENUM('OPEN','REVIEWING','RESOLVED') NOT NULL DEFAULT 'OPEN',
      reviewer_id BIGINT UNSIGNED NULL,
      resolution TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_anom_eval FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
      CONSTRAINT fk_anom_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_anom_state (state, severity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS anomaly_flags');
  await knex.raw('DROP TABLE IF EXISTS ratings');
  await knex.raw('DROP TABLE IF EXISTS ai_scores');
  await knex.raw('DROP TABLE IF EXISTS evaluations');
}
