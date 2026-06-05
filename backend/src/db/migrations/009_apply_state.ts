import type { Knex } from 'knex';

// 009 — 역할 기반 지원(self-application) 지원: project_members.state 에 'APPLIED' 추가.
// 지원자가 역할을 골라 지원하면 'APPLIED'(대기) 상태로 들어가고, 팀장이 'ACCEPTED'/'REJECTED' 로 처리한다.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE project_members
      MODIFY COLUMN state ENUM('INVITED','ACCEPTED','LEFT','REJECTED','APPLIED')
      NOT NULL DEFAULT 'INVITED'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 롤백 전 잔존 APPLIED 행을 REJECTED 로 정리(ENUM 축소 시 데이터 손실 방지).
  await knex.raw(`UPDATE project_members SET state = 'REJECTED' WHERE state = 'APPLIED'`);
  await knex.raw(`
    ALTER TABLE project_members
      MODIFY COLUMN state ENUM('INVITED','ACCEPTED','LEFT','REJECTED')
      NOT NULL DEFAULT 'INVITED'
  `);
}
