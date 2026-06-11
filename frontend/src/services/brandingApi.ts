import { api } from './api';

// 사이트 메인(첫 진입) 화면 브랜딩 API 클라이언트.
// 조회(GET)는 비로그인 사용자도 호출 가능, 편집(PUT)은 관리자만.
// NOTE: 백엔드 엔드포인트 경로(`/branding/login`)는 초기 구현(로그인 화면) 시절의
//       이름을 그대로 유지한다 — 저장소는 싱글톤이라 경로명은 표시 위치와 무관하다.

export type BrandingImageMode = 'banner' | 'background';

export interface SiteBranding {
  headline: string | null;
  subtext: string | null;
  darkHeadline: string | null; // 하단 검은색 영역 — 헤드라인
  darkSubtext: string | null; // 하단 검은색 영역 — 설명 문구
  darkCta: string | null; // 하단 검은색 영역 — 버튼 라벨
  imageUrl: string | null;
  imageScale: number; // 배너 이미지 표시 배율(%) — 기본 100
  imageMode: BrandingImageMode; // 표시 방식 — 배너(상단) | 배경 전체
  darkImageUrl: string | null; // 하단 검은색 영역 — 이미지 URL
  darkImageScale: number; // 하단 검은색 영역 — 이미지 표시 배율(%) 기본 100
  darkImageMode: BrandingImageMode; // 하단 검은색 영역 — 표시 방식
}

export interface UpdateSiteBrandingInput {
  headline?: string | null;
  subtext?: string | null;
  darkHeadline?: string | null; // 하단 검은색 영역 — 헤드라인
  darkSubtext?: string | null; // 하단 검은색 영역 — 설명 문구
  darkCta?: string | null; // 하단 검은색 영역 — 버튼 라벨
  image?: File | null; // 새 이미지 파일
  removeImage?: boolean; // 기존 이미지 제거
  imageScale?: number; // 배너 이미지 표시 배율(%) 30~150
  imageMode?: BrandingImageMode; // 표시 방식
  darkImage?: File | null; // 하단 검은색 영역 — 새 이미지 파일
  removeDarkImage?: boolean; // 하단 검은색 영역 — 기존 이미지 제거
  darkImageScale?: number; // 하단 검은색 영역 — 이미지 표시 배율(%) 30~150
  darkImageMode?: BrandingImageMode; // 하단 검은색 영역 — 표시 방식
}

export const brandingApi = {
  async get(): Promise<SiteBranding> {
    const { data } = await api.get<SiteBranding>('/branding/login');
    return data;
  },

  async update(input: UpdateSiteBrandingInput): Promise<SiteBranding> {
    const fd = new FormData();
    if (input.headline !== undefined) fd.append('headline', input.headline ?? '');
    if (input.subtext !== undefined) fd.append('subtext', input.subtext ?? '');
    if (input.darkHeadline !== undefined) fd.append('darkHeadline', input.darkHeadline ?? '');
    if (input.darkSubtext !== undefined) fd.append('darkSubtext', input.darkSubtext ?? '');
    if (input.darkCta !== undefined) fd.append('darkCta', input.darkCta ?? '');
    if (input.image) fd.append('image', input.image);
    if (input.removeImage) fd.append('removeImage', 'true');
    if (input.imageScale !== undefined) fd.append('imageScale', String(input.imageScale));
    if (input.imageMode !== undefined) fd.append('imageMode', input.imageMode);
    if (input.darkImage) fd.append('darkImage', input.darkImage);
    if (input.removeDarkImage) fd.append('removeDarkImage', 'true');
    if (input.darkImageScale !== undefined) fd.append('darkImageScale', String(input.darkImageScale));
    if (input.darkImageMode !== undefined) fd.append('darkImageMode', input.darkImageMode);
    const { data } = await api.put<SiteBranding>('/admin/branding/login', fd);
    return data;
  },
};
