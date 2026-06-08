import type { Knex } from 'knex';

// 014 — 팀원 별점 평가(완료된 프로젝트에서 서로를 0.5~5.0 별점으로 평가).
// 기존 evaluations(정수 4개 항목)와 별개로, 반개 단위 별점만 받는 단순 테이블.
// 제출 시 ratings.stars(종합 평점)를 받은 별점 평균으로 재계산한다.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE peer_star_ratings (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      rater_id BIGINT UNSIGNED NOT NULL,
      ratee_id BIGINT UNSIGNED NOT NULL,
      stars DECIMAL(2,1) NOT NULL,
      comment TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_psr_proj_rater_ratee (project_id, rater_id, ratee_id),
      CONSTRAINT fk_psr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_psr_rater FOREIGN KEY (rater_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_psr_ratee FOREIGN KEY (ratee_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_psr_ratee (ratee_id),
      CHECK (rater_id <> ratee_id),
      CHECK (stars BETWEEN 0.5 AND 5.0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS peer_star_ratings');
}
