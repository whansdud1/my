import type { Knex } from 'knex';

// 018 — 메인 화면 배너 이미지 크기 조절.
// 관리자가 메인 화면 편집에서 배너 이미지를 작게/크게 표시할 수 있도록
// 표시 배율(퍼센트)을 저장한다. 기본 100(=기본 크기), 허용 범위 30~150.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE login_branding
      ADD COLUMN image_scale SMALLINT UNSIGNED NOT NULL DEFAULT 100 AFTER image_mime
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE login_branding DROP COLUMN image_scale');
}
