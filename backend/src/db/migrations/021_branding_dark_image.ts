import type { Knex } from 'knex';

// 021 — 메인 화면 하단 '검은색(dark)' 영역 이미지.
// 히어로(상단)와 동일하게 이미지·표시 배율·표시 방식을 검은색 영역에도 둔다.
//   dark_image_key   : uploads/branding 하위 저장 키(없으면 이미지 미설정)
//   dark_image_mime  : 이미지 MIME
//   dark_image_scale : 배너 이미지 표시 배율(%) — 기본 100, 범위 30~150
//   dark_image_mode  : 표시 방식 'banner'(문구 위 배너) | 'background'(영역 전체 배경)

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE login_branding
      ADD COLUMN dark_image_key   VARCHAR(255)      NULL              AFTER dark_cta,
      ADD COLUMN dark_image_mime  VARCHAR(100)      NULL              AFTER dark_image_key,
      ADD COLUMN dark_image_scale SMALLINT UNSIGNED NOT NULL DEFAULT 100   AFTER dark_image_mime,
      ADD COLUMN dark_image_mode  VARCHAR(20)       NOT NULL DEFAULT 'banner' AFTER dark_image_scale
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE login_branding
      DROP COLUMN dark_image_key,
      DROP COLUMN dark_image_mime,
      DROP COLUMN dark_image_scale,
      DROP COLUMN dark_image_mode
  `);
}
