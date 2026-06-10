import type { Knex } from 'knex';

// 015 — 프로젝트 업무/태스크 관리(To-Be ③).
// 일정(schedule_events)이 '언제 모이는지'를 다룬다면, project_tasks 는 '무엇을 누가 언제까지'를 다룬다.
// 예: "자료 조사 — 담당 OOO — 6/15까지". 완료 시 마감 준수 여부를 협업활동으로 적재하여 AI 평점에 반영.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE project_tasks (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(200) NOT NULL,
      description VARCHAR(2000) NULL,
      assignee_id BIGINT UNSIGNED NULL,
      status ENUM('TODO','IN_PROGRESS','DONE') NOT NULL DEFAULT 'TODO',
      due_date DATE NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      completed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_task_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_task_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_task_project_status (project_id, status),
      INDEX idx_task_assignee (assignee_id),
      INDEX idx_task_due (project_id, due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS project_tasks');
}
