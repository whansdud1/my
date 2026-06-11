import type { Knex } from 'knex';

// 020 — 메인 화면 하단 '검은색(dark)' 영역 편집.
// 히어로(상단) 아래의 어두운 배경 섹션 — 헤드라인·설명문·CTA 버튼 문구를
// 관리자가 편집할 수 있게 컬럼을 추가한다. 모두 NULL 이면 코드의 기본 문구를 노출.
//   dark_headline : 큰 제목(줄바꿈 허용)
//   dark_subtext  : 설명 문구(줄바꿈 허용)
//   dark_cta      : 버튼 라벨

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE login_branding
      ADD COLUMN dark_headline VARCHAR(120) NULL AFTER subtext,
      ADD COLUMN dark_subtext  VARCHAR(400) NULL AFTER dark_headline,
      ADD COLUMN dark_cta      VARCHAR(40)  NULL AFTER dark_subtext
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE login_branding
      DROP COLUMN dark_headline,
      DROP COLUMN dark_subtext,
      DROP COLUMN dark_cta
  `);
}
