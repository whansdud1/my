import type { Knex } from 'knex';

// 010 — 모집 완료 시각 기록: 팀원 모집이 완료(RECRUIT→RUNNING)된 시점을 저장.
// 프로젝트 목록에서 "모집 완료 후 1일 경과" 건을 숨기는 데 사용한다.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE projects
      ADD COLUMN recruit_closed_at DATETIME(3) NULL DEFAULT NULL AFTER status
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE projects DROP COLUMN recruit_closed_at`);
}
