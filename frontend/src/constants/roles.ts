// 프로젝트 "필요 역할" / 프로필 "선호 역할" 공통 목록.
// 여기 한 곳만 수정하면 프로젝트 생성·프로필·지원 화면에 모두 반영된다.
export const PROJECT_ROLES = [
  '기획',
  '발표',
  'ppt 제작',
  '디자인',
  '자료 조사',
  '문서 작성',
] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];
