import type { Knex } from 'knex';

// 017 — 로그인 화면 브랜딩(관리자 편집).
// 로그인 페이지에 노출할 배너 이미지·헤드라인·보조문구를 관리자가 편집할 수 있게
// 단일 행(싱글톤) 설정 테이블을 둔다. image_key 는 uploads/branding 하위 저장 키.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE login_branding (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
      image_key VARCHAR(255) NULL,
      image_mime VARCHAR(100) NULL,
      headline VARCHAR(120) NULL,
      subtext VARCHAR(300) NULL,
      updated_by BIGINT UNSIGNED NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT chk_login_branding_singleton CHECK (id = 1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 싱글톤 행 1개를 미리 만들어 둔다 — 이후 항상 UPDATE 로만 변경.
  await knex.raw(`INSERT INTO login_branding (id) VALUES (1)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS login_branding');
}
