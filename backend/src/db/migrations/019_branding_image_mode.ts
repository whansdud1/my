import type { Knex } from 'knex';

// 019 — 메인 화면 배너 이미지 표시 방식.
// 'banner'      : 기존 방식 — 문구 위에 가로형 배너로 표시(크기 배율 적용).
// 'background'  : 히어로 영역 전체 배경으로 깔고 그 위에 문구를 올린다(흰 스크림으로 가독성 확보).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE login_branding
      ADD COLUMN image_mode VARCHAR(20) NOT NULL DEFAULT 'banner' AFTER image_scale
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE login_branding DROP COLUMN image_mode');
}
