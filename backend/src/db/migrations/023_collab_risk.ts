import type { Knex } from 'knex';

// 023 — 팀 갈등(협업) 위험 알림 상태 테이블.
// collabRiskWorker 가 RUNNING 프로젝트의 위험도를 주기적으로 평가하고,
// medium 이상으로 '상승'할 때만 팀장에게 COLLAB_RISK 알림을 보낸다.
// 매 평가 주기마다 재알림하지 않도록(스팸 방지) 직전에 알림한 레벨을 여기에 기록한다.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE collab_risk_alerts (
      project_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      last_level ENUM('none','low','medium','high') NOT NULL DEFAULT 'none',
      last_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
      last_factors JSON NULL,
      notified_at DATETIME(3) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_cra_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS collab_risk_alerts');
}
