import type { Knex } from 'knex';

// 016 — 평가 리뷰 악성 탐지(US8).
// peer_star_ratings 에 모더레이션 상태를 달고, 관리자 검토 큐(moderation_flags)를 만든다.
//   mod_state: approved(노출) | pending(검토 대기·비노출) | blocked(차단·비노출·평균 제외)
// 텍스트 악성(욕설·인격모독)과 허위/보복성 별점을 모두 플래그로 적재한다.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE peer_star_ratings
      ADD COLUMN mod_state ENUM('approved','pending','blocked') NOT NULL DEFAULT 'approved' AFTER comment,
      ADD COLUMN mod_reason VARCHAR(255) NULL AFTER mod_state,
      ADD COLUMN mod_score DECIMAL(4,3) NULL AFTER mod_reason,
      ADD INDEX idx_psr_mod_state (mod_state)
  `);

  await knex.raw(`
    CREATE TABLE moderation_flags (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      target_type ENUM('peer_rating','evaluation') NOT NULL,
      target_id BIGINT UNSIGNED NOT NULL,
      project_id BIGINT UNSIGNED NULL,
      rater_id BIGINT UNSIGNED NULL,
      ratee_id BIGINT UNSIGNED NULL,
      kind ENUM('TOXIC_TEXT','RATING_ANOMALY') NOT NULL,
      severity ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
      score DECIMAL(4,3) NULL,
      snippet VARCHAR(500) NULL,
      detail JSON NULL,
      state ENUM('pending','kept','removed') NOT NULL DEFAULT 'pending',
      resolved_by BIGINT UNSIGNED NULL,
      resolved_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_modflags_state (state),
      INDEX idx_modflags_target (target_type, target_id),
      INDEX idx_modflags_ratee (ratee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS moderation_flags');
  await knex.raw(`
    ALTER TABLE peer_star_ratings
      DROP INDEX idx_psr_mod_state,
      DROP COLUMN mod_score,
      DROP COLUMN mod_reason,
      DROP COLUMN mod_state
  `);
}
