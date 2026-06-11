import { getPool } from '../db/connection.js';

// 로그인 화면 브랜딩(login_branding) 싱글톤 저장소.
// 행 id=1 은 마이그레이션에서 보장되므로 여기서는 항상 SELECT/UPDATE 만 수행한다.

export type BrandingImageMode = 'banner' | 'background';

export interface LoginBrandingRow {
  id: number;
  image_key: string | null;
  image_mime: string | null;
  image_scale: number; // 배너 이미지 표시 배율(%) — 기본 100
  image_mode: BrandingImageMode; // 표시 방식 — 배너(상단) | 배경 전체
  headline: string | null;
  subtext: string | null;
  dark_headline: string | null; // 하단 검은색 영역 — 헤드라인
  dark_subtext: string | null; // 하단 검은색 영역 — 설명 문구
  dark_cta: string | null; // 하단 검은색 영역 — 버튼 라벨
  dark_image_key: string | null; // 하단 검은색 영역 — 이미지 저장 키
  dark_image_mime: string | null; // 하단 검은색 영역 — 이미지 MIME
  dark_image_scale: number; // 하단 검은색 영역 — 이미지 표시 배율(%) 기본 100
  dark_image_mode: BrandingImageMode; // 하단 검은색 영역 — 표시 방식
  updated_by: number | null;
  updated_at: Date;
}

export async function getLoginBranding(): Promise<LoginBrandingRow> {
  const [rows] = (await getPool().query(
    `SELECT id, image_key, image_mime, image_scale, image_mode, headline, subtext,
            dark_headline, dark_subtext, dark_cta,
            dark_image_key, dark_image_mime, dark_image_scale, dark_image_mode,
            updated_by, updated_at
       FROM login_branding WHERE id = 1`,
  )) as unknown as [LoginBrandingRow[]];
  // 싱글톤 행(id=1)은 마이그레이션에서 보장되지만, 누락 시 빈 기본값으로 안전하게 동작.
  return (
    rows[0] ?? {
      id: 1,
      image_key: null,
      image_mime: null,
      image_scale: 100,
      image_mode: 'banner',
      headline: null,
      subtext: null,
      dark_headline: null,
      dark_subtext: null,
      dark_cta: null,
      dark_image_key: null,
      dark_image_mime: null,
      dark_image_scale: 100,
      dark_image_mode: 'banner',
      updated_by: null,
      updated_at: new Date(0),
    }
  );
}

export interface UpdateLoginBranding {
  imageKey: string | null;
  imageMime: string | null;
  imageScale: number;
  imageMode: BrandingImageMode;
  headline: string | null;
  subtext: string | null;
  darkHeadline: string | null;
  darkSubtext: string | null;
  darkCta: string | null;
  darkImageKey: string | null;
  darkImageMime: string | null;
  darkImageScale: number;
  darkImageMode: BrandingImageMode;
  updatedBy: number;
}

export async function updateLoginBranding(u: UpdateLoginBranding): Promise<void> {
  await getPool().query(
    `UPDATE login_branding
        SET image_key = ?, image_mime = ?, image_scale = ?, image_mode = ?, headline = ?, subtext = ?,
            dark_headline = ?, dark_subtext = ?, dark_cta = ?,
            dark_image_key = ?, dark_image_mime = ?, dark_image_scale = ?, dark_image_mode = ?,
            updated_by = ?
      WHERE id = 1`,
    [
      u.imageKey,
      u.imageMime,
      u.imageScale,
      u.imageMode,
      u.headline,
      u.subtext,
      u.darkHeadline,
      u.darkSubtext,
      u.darkCta,
      u.darkImageKey,
      u.darkImageMime,
      u.darkImageScale,
      u.darkImageMode,
      u.updatedBy,
    ],
  );
}
