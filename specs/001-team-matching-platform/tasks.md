# Tasks: 대학생 팀 매칭 플랫폼 (UniTeam)

**Feature**: 001-team-matching-platform
**Date**: 2026-05-15
**Inputs**: [spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/openapi.yaml](./contracts/openapi.yaml) · [Intent-Tasks.md](./Intent-Tasks.md)

## 표기 규칙

- `T###` 순차 번호 (실행 순서)
- `[P]` 다른 파일·다른 모듈로 **동시 실행 가능**
- `[US#]` 해당 사용자 스토리 범위
- `[FE]` 프론트엔드 — Intent-Tasks.md 지시에 따라 `/frontend-design "<설명>"` 호출 권장
- `[BE]` 백엔드 / `[DB]` 마이그레이션 / `[INF]` 인프라
- 테스트는 사용자 요청 부재로 별도 태스크화하지 않고 **각 구현 태스크 DoD 에 단위 테스트 작성을 포함**

## 사용자 스토리 우선순위

| 우선순위 | 스토리 | 요약 | MVP |
|---|---|---|---|
| **P1** | US1 회원가입·프로필 | 학생 가입·인증·프로필 작성 후 매칭 후보 풀 진입 | ✅ |
| **P1** | US2 프로젝트 등록·모집 | 프로젝트 생성·팀원 초대·동시 진행 한도 적용 | ✅ |
| **P1** | US3 매칭 추천 | 적합도 점수 기반 후보 추천 + breakdown | ✅ |
| **P1** | US4 동료 평가·종합 평점 | 익명 평가 + AI 평점 결합 → 별점·리뷰 갱신 | ✅ |
| P2 | US5 외부 협업 도구 연동 | OAuth + 활동 메타데이터 수집 | |
| P2 | US6 위험 신호 대시보드 | 임계치 위반 시 알림·시각화 | |
| P2 | US7 일정 조율 | 공통 가능 시간 제안·캘린더 동기화 | |
| P3 | US8 이상 평가 탐지·관리자 검토 | IQR/괴리도 기반 자동 감지 + 관리자 처리 | |
| P3 | US9 구독·결제·프리미엄 매칭 | PG 어댑터 + 프리미엄 부스트 | |
| P3 | US10 개인정보 보호 | DSR(열람·정정·삭제) 30일 SLA | |

> **MVP**: US1+US2+US3+US4 (Phase 1~6) 완료 시점에서 핵심 가치 루프(가입→프로젝트→매칭→평가→평점)가 동작.

---

## Phase 1 — Setup (공통 인프라)

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T001** | [INF] | 워크스페이스 골격 생성 — `frontend/`, `backend/`, `infra/docker/`, `infra/ci/`, `.env.example` | `/Users/pioneer18/mis2601/` | |
| **T002** | [BE] | 백엔드 부트스트랩 — package.json(express, mysql2, knex, jsonwebtoken, pino, zod, bcrypt), tsconfig, eslint, prettier, `PORT=9538` 기본값 + CORS 허용 origin `http://localhost:9518`·`https://p18.sumzip.com` | `backend/` | [P] |
| **T003** | [FE] | 프론트엔드 부트스트랩 — Vite + Vue 3 + Pinia + vue-router + axios, tsconfig, eslint, prettier, `vite.config.ts` server.port=**9518** + preview.port=**9518** — `/frontend-design "기본 레이아웃·테마"` | `frontend/` | [P] |
| **T004** | [INF] | Docker Compose + Nginx 프록시 — frontend(**9518**)/backend(**9538**)/(local mariadb 옵션), Nginx `server_name p18.sumzip.com` + `/api/*` → 9538 프록시 | `infra/docker/docker-compose.yml`, `nginx.conf` | [P] |
| **T005** | [INF] | GitLab CI 파이프라인 골격 — lint/test/build/deploy 스테이지 + GitLeaks | `infra/ci/.gitlab-ci.yml` | [P] |
| **T006** | [BE] | 코드 품질 도구 — husky + lint-staged, commitlint, .editorconfig | repo root | [P] |
| **T007** | [BE] | 로깅·요청 추적 — pino + `X-Request-Id` 미들웨어, http access log | `backend/src/middlewares/logging.ts` | |

---

## Phase 2 — Foundational (모든 스토리 선결조건)

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T008** | [BE] | mysql2 연결 모듈 + 헬스 체크 | `backend/src/db/connection.ts`, `routes/health.ts` | |
| **T009** | [DB] | knex 마이그레이션 셋업 + `001_init.sql` (users, availabilities, consents) | `backend/src/db/migrations/001_init.ts` | |
| **T010** | [DB] | `002_matching.sql` (projects, project_members, matching_recommendations) | `backend/src/db/migrations/002_matching.ts` | [P] |
| **T011** | [DB] | `003_collaboration.sql` (collab_integrations, collaboration_activities + 월 단위 RANGE 파티션) | `backend/src/db/migrations/003_collaboration.ts` | [P] |
| **T012** | [DB] | `004_evaluation.sql` (evaluations, ai_scores, ratings, anomaly_flags) | `backend/src/db/migrations/004_evaluation.ts` | [P] |
| **T013** | [DB] | `005_subscription.sql` (subscriptions, partnerships, partnership_members) | `backend/src/db/migrations/005_subscription.ts` | [P] |
| **T014** | [DB] | `006_admin.sql` (notifications, audit_logs, domain_whitelist) | `backend/src/db/migrations/006_admin.ts` | [P] |
| **T015** | [BE] | 표준 응답 envelope + 글로벌 에러 핸들러 (RFC 7807 + 도메인 코드) | `backend/src/middlewares/error.ts`, `lib/envelope.ts` | |
| **T016** | [BE] | JWT auth 미들웨어 + 토큰 발급/검증 (access 15m / refresh 14d httpOnly) | `backend/src/middlewares/auth.ts`, `services/auth/tokens.ts` | |
| **T017** | [BE] | RBAC 미들웨어 (STUDENT/PROFESSOR/ADMIN) + 객체 수준 권한 가드 | `backend/src/middlewares/rbac.ts` | |
| **T018** | [BE] | Rate limit 미들웨어 (인증 60/min, 비인증 20/min) | `backend/src/middlewares/rate-limit.ts` | [P] |
| **T019** | [BE] | 감사 로그 helper + audit_logs 저장 | `backend/src/services/audit.ts` | [P] |
| **T020** | [BE] | OpenAPI 로더 + 스키마 검증 미들웨어(zod 변환) | `backend/src/middlewares/validate.ts` | [P] |
| **T021** | [FE] | axios 인스턴스 + 인터셉터(인증·envelope unwrap·에러 매핑) — `/frontend-design "API 클라이언트 래퍼"` | `frontend/src/services/api.ts` | [P] |
| **T022** | [FE] | Pinia 스토어 골격(auth/user/project/notifications) + 영속화 | `frontend/src/stores/*` | [P] |
| **T023** | [FE] | 라우터 + 공통 레이아웃(헤더·사이드바·토스트) — `/frontend-design "기본 레이아웃"` | `frontend/src/router/`, `layouts/` | [P] |
| **T024** | [BE] | 이메일 도메인 화이트리스트 시드 (.ac.kr 기본) | `backend/src/db/seeds/01_domain_whitelist.ts` | [P] |

**Checkpoint F1**: 마이그레이션 적용 + `/api/v1/health` 200 응답 + FE 빈 페이지 라우팅 OK.

---

## Phase 3 — US1: 회원가입·프로필 (P1) 🚀 MVP

**Story Goal** — 학생이 이메일 가입·인증·프로필 작성 후 매칭 후보 풀에 진입.
**Independent Test** — (1) `POST /auth/signup` → 201, (2) 인증 메일 토큰으로 `verify-email` → 200, (3) `POST /auth/login` → 토큰, (4) `GET /users/me` → 본인 프로필, (5) `PUT /users/me/availability` → 가용시간 반영.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T025** | [BE][US1] | users repository — findByEmail/insert/update/softDelete | `backend/src/repositories/users.ts` | |
| **T026** | [BE][US1] | availabilities repository — bulk replace | `backend/src/repositories/availabilities.ts` | [P] |
| **T027** | [BE][US1] | consents repository + 동의 강제 미들웨어 | `backend/src/repositories/consents.ts`, `middlewares/consent.ts` | [P] |
| **T028** | [BE][US1] | auth service — 비밀번호 해시(bcrypt), 도메인 화이트리스트 검증, 인증 토큰 발급 | `backend/src/services/auth/index.ts` | |
| **T029** | [BE][US1] | email 어댑터 (개발: MailHog, 운영: SES/SendGrid) + 가입 인증 메일 템플릿 | `backend/src/adapters/email/*` | [P] |
| **T030** | [BE][US1] | `POST /auth/signup` 엔드포인트(스키마 검증 + consents 기록) | `backend/src/routes/auth.ts` | |
| **T031** | [BE][US1] | `POST /auth/verify-email` 엔드포인트 | `backend/src/routes/auth.ts` | |
| **T032** | [BE][US1] | `POST /auth/login` + `POST /auth/logout` 엔드포인트 (refresh 회전) | `backend/src/routes/auth.ts` | |
| **T033** | [BE][US1] | `GET/PATCH /users/me` | `backend/src/routes/users.ts` | [P] |
| **T034** | [BE][US1] | `DELETE /users/me` (DSR 큐로 위임, US10 참조) | `backend/src/routes/users.ts` | [P] |
| **T035** | [BE][US1] | `PUT /users/me/availability` | `backend/src/routes/users.ts` | [P] |
| **T036** | [BE][US1] | `GET /users/:id` (공개 프로필) | `backend/src/routes/users.ts` | [P] |
| **T037** | [FE][US1] | 회원가입 페이지 + 약관/개인정보 동의 — `/frontend-design "회원가입 폼"` | `frontend/src/pages/auth/Signup.vue` | [P] |
| **T038** | [FE][US1] | 이메일 인증 안내·완료 페이지 — `/frontend-design "이메일 인증 안내 화면"` | `frontend/src/pages/auth/Verify.vue` | [P] |
| **T039** | [FE][US1] | 로그인 페이지 — `/frontend-design "로그인 폼"` | `frontend/src/pages/auth/Login.vue` | [P] |
| **T040** | [FE][US1] | 프로필 편집 (성별·학년·학과·선호 역할·자기소개) — `/frontend-design "프로필 편집"` | `frontend/src/pages/profile/Edit.vue` | [P] |
| **T041** | [FE][US1] | 가용 시간표 편집 (요일·시간·야간 선호) — `/frontend-design "주간 가용 시간표 그리드"` | `frontend/src/pages/profile/Availability.vue` | [P] |
| **T042** | [FE][US1] | 협업 성향 설문 (12문항) — `/frontend-design "협업 성향 설문 흐름"` | `frontend/src/pages/onboarding/Survey.vue` | [P] |

**Checkpoint US1 ✅**: 신규 학생이 가입→인증→프로필 작성 후 `users.status='ACTIVE'` 진입.

---

## Phase 4 — US2: 프로젝트 등록·모집 (P1) 🚀 MVP

**Story Goal** — 학생/교수가 프로젝트를 만들고 팀원을 초대·확정.
**Independent Test** — (1) `POST /projects` 201, (2) `POST /projects/:id/invites` 201, (3) 초대 받은 사용자 `POST /invites/:id/respond` 200, (4) 동시 프로젝트 3건 초과 시 초대 거부.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T043** | [BE][US2] | projects repository — CRUD + 상태 전이 | `backend/src/repositories/projects.ts` | |
| **T044** | [BE][US2] | project_members repository | `backend/src/repositories/projectMembers.ts` | [P] |
| **T045** | [BE][US2] | projects service — 생성·필터 목록 페이지네이션 | `backend/src/services/projects/index.ts` | |
| **T046** | [BE][US2] | invite service — 초대·수락/거절, **동시 진행 한도 3건 가드(FR-B6)** | `backend/src/services/projects/invites.ts` | |
| **T047** | [BE][US2] | `POST/GET /projects` | `backend/src/routes/projects.ts` | [P] |
| **T048** | [BE][US2] | `GET/PATCH /projects/:id` | `backend/src/routes/projects.ts` | [P] |
| **T049** | [BE][US2] | `POST /projects/:id/invites` | `backend/src/routes/projects.ts` | [P] |
| **T050** | [BE][US2] | `POST /invites/:id/respond` | `backend/src/routes/invites.ts` | [P] |
| **T051** | [BE][US2] | 알림 발송 hook — 초대/팀확정 (notifications 테이블 + 이메일) | `backend/src/services/notifications/invite.ts` | [P] |
| **T052** | [FE][US2] | 프로젝트 생성 폼(역할·일정·시간 선호) — `/frontend-design "프로젝트 생성 폼"` | `frontend/src/pages/projects/New.vue` | [P] |
| **T053** | [FE][US2] | 프로젝트 목록·필터 — `/frontend-design "프로젝트 목록·필터 사이드바"` | `frontend/src/pages/projects/List.vue` | [P] |
| **T054** | [FE][US2] | 프로젝트 상세 + 팀원·초대 영역 — `/frontend-design "프로젝트 상세·팀원 패널"` | `frontend/src/pages/projects/Detail.vue` | [P] |
| **T055** | [FE][US2] | 초대 받은 사용자용 수락/거절 화면 + 인앱 알림 뱃지 — `/frontend-design "초대 응답 모달"` | `frontend/src/pages/invites/Respond.vue` | [P] |

**Checkpoint US2 ✅**: 등록자→초대→수락 흐름 종단 통과.

---

## Phase 5 — US3: 매칭 추천 (P1) 🚀 MVP

**Story Goal** — 프로젝트 요건·후보 풀에서 적합도 점수순 상위 N 후보 제시.
**Independent Test** — 시드된 후보군에서 `GET /projects/:id/recommendations?limit=10` 호출 시 정렬·breakdown 동봉. SC-06(5초 이내) 충족.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T056** | [BE][US3] | matching_recommendations repository (TTL 7일) | `backend/src/repositories/matching.ts` | |
| **T057** | [BE][US3] | matching service — 역할 균형 점수(w1=0.30) | `backend/src/services/matching/role.ts` | [P] |
| **T058** | [BE][US3] | matching service — 시간 겹침 점수(w2=0.25) | `backend/src/services/matching/overlap.ts` | [P] |
| **T059** | [BE][US3] | matching service — 협업 성향 호환 점수(w3=0.15) | `backend/src/services/matching/style.ts` | [P] |
| **T060** | [BE][US3] | matching service — 평점·신뢰·다양성 가중치(w4=0.15, w6=0.05, w5=0.10) + 노출 적은 사용자 보정(FR-F3) | `backend/src/services/matching/weights.ts` | [P] |
| **T061** | [BE][US3] | matching service — 결합기 + breakdown JSON 산출 | `backend/src/services/matching/index.ts` | |
| **T062** | [BE][US3] | 추천 결과 캐시 + archive 잡(만료 7d) | `backend/src/jobs/matching-archive.ts` | [P] |
| **T063** | [BE][US3] | `GET /projects/:id/recommendations` 엔드포인트 | `backend/src/routes/projects.ts` | |
| **T064** | [FE][US3] | 추천 후보 리스트 — `/frontend-design "매칭 추천 카드 그리드"` | `frontend/src/pages/projects/Recommendations.vue` | [P] |
| **T065** | [FE][US3] | 후보 프로필 카드(별점·리뷰 요약·시간 겹침 게이지·score breakdown 툴팁) — `/frontend-design "후보 프로필 카드"` | `frontend/src/components/CandidateCard.vue` | [P] |
| **T066** | [FE][US3] | 후보→초대 액션 연동 (US2 invite API) | `frontend/src/pages/projects/Recommendations.vue` | |

**Checkpoint US3 ✅**: 프로젝트 등록 후 10명 상위 후보가 5초 내 표시·초대 가능.

---

## Phase 6 — US4: 동료 평가·종합 평점 (P1) 🚀 MVP

**Story Goal** — 종료 프로젝트에 대한 익명 동료 평가 + AI 평점 결합 → 사용자 별점/리뷰 갱신.
**Independent Test** — (1) 프로젝트 종료 → 평가 요청 발송, (2) `POST /projects/:id/evaluations` 201, (3) AI 평점 산출 + ratings 갱신, (4) 14일 미제출 시 잠정 평점 적용.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T067** | [BE][US4] | evaluations repository — UNIQUE(project,eval/atee) | `backend/src/repositories/evaluations.ts` | [P] |
| **T068** | [BE][US4] | ai_scores repository | `backend/src/repositories/aiScores.ts` | [P] |
| **T069** | [BE][US4] | ratings repository (1:1 with users) | `backend/src/repositories/ratings.ts` | [P] |
| **T070** | [BE][US4] | evaluation service — 익명화·자기평가 금지·14일 마감 검증 | `backend/src/services/evaluation/peer.ts` | |
| **T071** | [BE][US4] | AI 평점 계산기 — 활동 지표 정규화 → 가중합 0~5 | `backend/src/services/evaluation/ai.ts` | [P] |
| **T072** | [BE][US4] | 종합 평점 결합(0.6·peer + 0.4·AI) + ratings 갱신 | `backend/src/services/evaluation/combine.ts` | |
| **T073** | [BE][US4] | 평가 마감 14d 리마인더 잡 + 잠정 평점 적용 | `backend/src/jobs/evaluation-reminder.ts` | [P] |
| **T074** | [BE][US4] | 프로젝트 종료 트리거 — 평가 요청 알림 일괄 발송 | `backend/src/services/evaluation/notify.ts` | [P] |
| **T075** | [BE][US4] | `POST/GET /projects/:id/evaluations` | `backend/src/routes/evaluations.ts` | [P] |
| **T076** | [BE][US4] | `GET /users/:id/rating` | `backend/src/routes/users.ts` | [P] |
| **T077** | [FE][US4] | 평가 작성 화면(4항목 + 자유 코멘트) — `/frontend-design "동료 평가 폼"` | `frontend/src/pages/evaluations/Submit.vue` | [P] |
| **T078** | [FE][US4] | 사용자 별점·리뷰 요약 패널 — `/frontend-design "사용자 별점·리뷰 카드"` | `frontend/src/components/RatingPanel.vue` | [P] |
| **T079** | [FE][US4] | 내 평가 이력·마감 알림 화면 — `/frontend-design "내 평가 마감 화면"` | `frontend/src/pages/evaluations/Inbox.vue` | [P] |

**🎯 MVP Checkpoint** — US1~US4 완료 시 핵심 가치 루프 작동: 가입 → 프로젝트 등록 → 매칭 → 평가 → 평점 반영. **여기서 한 번 출시 가능**.

---

## Phase 7 — US5: 외부 협업 도구 연동 (P2)

**Story Goal** — Zoom/Discord/Notion/Google Workspace OAuth 연결 후 메타데이터 활동 수집.
**Independent Test** — OAuth 시작→콜백→토큰 저장→스케줄 잡 1회 실행 후 `/projects/:id/activities` 응답 비어있지 않음.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T080** | [BE][US5] | collab_integrations repository (AES-256-GCM 토큰 암호화) | `backend/src/repositories/integrations.ts` | |
| **T081** | [BE][US5] | OAuth 공통 유틸 — state/redirect_uri/CSRF | `backend/src/services/integrations/oauth.ts` | [P] |
| **T082** | [BE][US5] | Zoom 어댑터 — 회의 참석/녹화 메타 | `backend/src/adapters/zoom/*` | [P] |
| **T083** | [BE][US5] | Discord 어댑터 — 메시지 시각 메타(본문 미저장) | `backend/src/adapters/discord/*` | [P] |
| **T084** | [BE][US5] | Notion 어댑터 — 페이지 변경 이벤트 | `backend/src/adapters/notion/*` | [P] |
| **T085** | [BE][US5] | Google Workspace 어댑터 — Drive/Calendar 메타 | `backend/src/adapters/google/*` | [P] |
| **T086** | [BE][US5] | activities 수집 잡(rate limit 백오프, 24h 단위) | `backend/src/jobs/collab-sync.ts` | |
| **T087** | [BE][US5] | collaboration_activities repository(파티션 인지 INSERT/조회) | `backend/src/repositories/activities.ts` | |
| **T088** | [BE][US5] | `GET /integrations/:provider/oauth/start` | `backend/src/routes/integrations.ts` | [P] |
| **T089** | [BE][US5] | `GET /integrations/:provider/oauth/callback` | `backend/src/routes/integrations.ts` | [P] |
| **T090** | [BE][US5] | `GET /projects/:id/integrations`, `GET /projects/:id/activities` | `backend/src/routes/integrations.ts` | [P] |
| **T091** | [BE][US5] | 수동 활동 기록 API (외부 연동 거부 팀용) | `backend/src/routes/activities-manual.ts` | [P] |
| **T092** | [FE][US5] | 연동 관리 화면(연결/해제/스코프) — `/frontend-design "외부 도구 연동 카드"` | `frontend/src/pages/integrations/Manage.vue` | [P] |
| **T093** | [FE][US5] | 수동 활동 기록 UI — `/frontend-design "수동 활동 기록 패널"` | `frontend/src/components/ManualActivity.vue` | [P] |

**Checkpoint US5 ✅**: 한 팀이 도구 연결 후 활동 이벤트가 DB 에 적재.

---

## Phase 8 — US6: 위험 신호 대시보드 (P2)

**Story Goal** — 회의 결석·업로드 정체·응답 지연 등 임계 초과 시 팀 대시보드 표시 + 알림.
**Independent Test** — 모의 활동(낮은 참여)에서 `GET /projects/:id/risk-signals` 응답 + 팀장에게 알림 발송.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T094** | [BE][US6] | risk-signal service — 통계 기반 동적 임계치 + 신호 분류 | `backend/src/services/anomaly/risk.ts` | |
| **T095** | [BE][US6] | 임계치 정책 저장소(관리자 조정 가능) | `backend/src/repositories/policies.ts` | [P] |
| **T096** | [BE][US6] | 위험 신호 알림(팀 대시보드 + 팀장 메일) | `backend/src/services/notifications/risk.ts` | [P] |
| **T097** | [BE][US6] | `GET /projects/:id/risk-signals` | `backend/src/routes/projects.ts` | [P] |
| **T098** | [FE][US6] | 팀 협업 대시보드(참여·업로드·마감·응답 시각화) — `/frontend-design "팀 협업 대시보드"` | `frontend/src/pages/projects/Dashboard.vue` | [P] |
| **T099** | [FE][US6] | 위험 신호 카드/배지 + 권장 조치 — `/frontend-design "위험 신호 카드"` | `frontend/src/components/RiskBadge.vue` | [P] |

**Checkpoint US6 ✅**: SC-05 의 위험 신호→7일 내 개선 KPI 측정 가능.

---

## Phase 9 — US7: 일정 조율 (P2)

**Story Goal** — 팀 공통 가능 시간 제안 + Google Calendar 동기화 + 리마인더.
**Independent Test** — 가용 시간 입력된 멤버 3+ 명 → 공통 슬롯 추천 → 이벤트 생성 → 캘린더 반영.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T100** | [BE][US7] | schedule service — 공통 슬롯 산출(요일·시간 교집합) | `backend/src/services/schedule/slots.ts` | |
| **T101** | [BE][US7] | Google Calendar 어댑터 — 이벤트 생성/취소 | `backend/src/adapters/google/calendar.ts` | [P] |
| **T102** | [BE][US7] | 일정 리마인더 잡 (회의·마감) | `backend/src/jobs/schedule-reminder.ts` | [P] |
| **T103** | [BE][US7] | `GET /projects/:id/schedule/common-slots`, `POST /projects/:id/schedule/events` | `backend/src/routes/schedule.ts` | [P] |
| **T104** | [FE][US7] | 팀 캘린더 + 슬롯 추천 위젯 — `/frontend-design "팀 캘린더"` | `frontend/src/pages/projects/Schedule.vue` | [P] |

**Checkpoint US7 ✅**: 회의/마감 이벤트가 팀원 캘린더에 반영.

---

## Phase 10 — US8: 이상 평가 탐지·관리자 검토 (P3)

**Story Goal** — 의심 평가 자동 감지 후 관리자 콘솔에서 승인/반려/제재.
**Independent Test** — 시뮬 평가 → `anomaly_flags.state='OPEN'` → 관리자 `POST /admin/anomalies/:id/resolve` → 평점 가중치 반영.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T105** | [BE][US8] | anomaly_flags repository | `backend/src/repositories/anomaly.ts` | [P] |
| **T106** | [BE][US8] | anomaly service — 신호1(페어바이어스 2σ)·신호2(활동괴리≥1.5)·신호3(burst-low) | `backend/src/services/anomaly/detect.ts` | |
| **T107** | [BE][US8] | 평가 제출 시 자동 감지 hook + review_state='HOLD' 처리 | `backend/src/services/evaluation/peer.ts` | |
| **T108** | [BE][US8] | 평가자 가중치 자동 감소(2건 이상 신호 → ×0.5) | `backend/src/services/anomaly/weight.ts` | [P] |
| **T109** | [BE][US8] | `GET /admin/anomalies`, `POST /admin/anomalies/:id/resolve` | `backend/src/routes/admin.ts` | [P] |
| **T110** | [BE][US8] | 감사 로그(`audit_logs.action='ADMIN_SANCTION'`) | `backend/src/services/audit.ts` | [P] |
| **T111** | [FE][US8] | 관리자 검토 큐 화면 — `/frontend-design "관리자 이상 평가 큐 테이블"` | `frontend/src/pages/admin/Anomalies.vue` | [P] |
| **T112** | [FE][US8] | 처리 다이얼로그(승인/반려/제재) — `/frontend-design "이상 평가 처리 모달"` | `frontend/src/components/AnomalyResolveDialog.vue` | [P] |

**Checkpoint US8 ✅**: SC-10 정확도/재현율 측정 가능.

---

## Phase 11 — US9: 구독·결제·프리미엄 매칭 (P3)

**Story Goal** — 프리미엄 구독으로 결제 + 매칭 점수에 부스트(인기 프로젝트 우선 매칭).
**Independent Test** — 구독 시작 webhook → `subscriptions.tier='PREMIUM'` → 동일 점수 후보 중 프리미엄 우선 노출.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T113** | [BE][US9] | subscriptions repository | `backend/src/repositories/subscriptions.ts` | [P] |
| **T114** | [BE][US9] | PG 어댑터 인터페이스 + 토스/아임포트 구현체 1종 | `backend/src/adapters/pg/*` | |
| **T115** | [BE][US9] | 매칭 점수에 프리미엄 부스트 가중치 적용 | `backend/src/services/matching/weights.ts` | |
| **T116** | [BE][US9] | `POST/DELETE /billing/subscriptions` | `backend/src/routes/billing.ts` | [P] |
| **T117** | [BE][US9] | `POST /billing/webhooks/:provider` (서명 검증) | `backend/src/routes/billing.ts` | [P] |
| **T118** | [FE][US9] | 구독 가입/관리 화면 — `/frontend-design "프리미엄 구독 페이지"` | `frontend/src/pages/billing/Subscribe.vue` | [P] |
| **T119** | [FE][US9] | 결제 결과 안내 + 영수증 다운로드 — `/frontend-design "결제 완료 화면"` | `frontend/src/pages/billing/Success.vue` | [P] |

**Checkpoint US9 ✅**: SC-13 프리미엄 전환율 측정 가능.

---

## Phase 12 — US10: 개인정보 보호 (P3)

**Story Goal** — 데이터 열람·정정·삭제 요청을 30일 이내 처리, 익명 통계 보존.
**Independent Test** — 삭제 요청 후 30일 내 PII 익명화, 평가 통계는 보존.

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T120** | [BE][US10] | DSR 요청 큐 + 상태 머신 | `backend/src/services/privacy/dsr.ts` | |
| **T121** | [BE][US10] | 삭제 파이프라인(PII NULL/익명화, 평가 익명 보존) | `backend/src/services/privacy/erase.ts` | [P] |
| **T122** | [BE][US10] | 데이터 export(JSON/CSV) 잡 | `backend/src/jobs/dsr-export.ts` | [P] |
| **T123** | [BE][US10] | 30일 SLA 모니터 + 관리자 알림 | `backend/src/jobs/dsr-sla.ts` | [P] |
| **T124** | [FE][US10] | 개인정보·동의 관리 화면(열람/내보내기/삭제) — `/frontend-design "개인정보 관리 페이지"` | `frontend/src/pages/profile/Privacy.vue` | [P] |
| **T125** | [FE][US10] | 동의 철회 흐름 (마케팅·본문 분석 옵트인) — `/frontend-design "동의 철회 폼"` | `frontend/src/components/ConsentManager.vue` | [P] |

**Checkpoint US10 ✅**: SC-11(30일 100% 처리) 측정 가능.

---

## Phase 13 — Polish & Cross-Cutting

| ID | 영역 | 작업 | 파일/경로 | 병렬 |
|---|---|---|---|---|
| **T126** | [FE] | i18n 키 분리(한국어 기본) — `/frontend-design "i18n 키 구조"` | `frontend/src/i18n/*` | [P] |
| **T127** | [FE] | 접근성 점검(WCAG 2.1 AA) + 키보드 내비게이션 — `/frontend-design "접근성 검수"` | `frontend/src/**` | [P] |
| **T128** | [BE] | 보안 강화 — CSRF·CSP·HSTS·GitLeaks CI | `backend/src/middlewares/security.ts`, CI | [P] |
| **T129** | [BE] | 관측 — Prometheus 메트릭 `/metrics` + Grafana 대시보드 | `backend/src/observability/*`, `infra/docker/grafana/*` | [P] |
| **T130** | [INF] | k6 부하 테스트 — SC-06(10K 동시·5초) 검증 시나리오 | `infra/loadtest/*` | [P] |
| **T131** | [BE] | 편향 모니터링 KPI — 매칭 분포·노출 적은 학생 비율(SC-09) | `backend/src/services/analytics/bias.ts` | [P] |
| **T132** | [INF] | 운영 Runbook — 장애·DSR·결제·이상 평가 처리 절차 | `docs/runbook.md` | [P] |
| **T133** | [BE] | API 문서 자동 발행(Redoc / Swagger UI) | `backend/src/routes/docs.ts` | [P] |

---

## 의존성 그래프

```
Phase 1 Setup ─► Phase 2 Foundational ─► US1(P1) ─┬─► US2(P1) ─┬─► US3(P1) ─► US4(P1) ──► [MVP 완료]
                                                  │            │
                                                  │            ▼
                                                  │           US5(P2) ─► US6(P2) ─► US7(P2)
                                                  │
                                                  └─► US10(P3) (병행 가능; DELETE /users/me 는 US1 이후)

US4 ─► US8(P3 — 평가 의존)
US3 ─► US9(P3 — 매칭 가중치 의존)

Phase 13 Polish 는 각 스토리 종료 시 점진 적용 가능
```

- **US1 → US2**: 사용자 풀 필요
- **US2 → US3**: 프로젝트가 있어야 후보 추천
- **US3 → US4**: 매칭 후 평가 시나리오 성립
- **US4 → US8**: 평가 데이터가 있어야 이상 탐지
- **US3 → US9**: 매칭 점수 모듈에 부스트 가중치 추가
- **US5, US6, US7**: 외부 연동·일정 — US2 이후 독립 진행 가능
- **US10**: US1 이후 거의 독립 — Phase 12 로 분리하되 우선순위에 따라 조기 시작 가능

---

## 병렬 실행 예시

### Phase 2(Foundational) 동시 작업 가능
- DB 마이그레이션 그룹: **T010~T014** [P] — 서로 다른 파일.
- 미들웨어 그룹: **T018, T019, T020** [P] — 서로 다른 파일.
- FE 골격 그룹: **T021, T022, T023** [P] — 서로 다른 파일.

### US1 동시 작업 가능
- 라우트 분리 가능: **T033, T034, T035, T036** [P]
- FE 화면 분리 가능: **T037~T042** [P] — 모두 `/frontend-design` 호출로 디자인 가능.

### US3 매칭 점수기 4종 동시
- **T057, T058, T059, T060** [P] — 가중치별 서비스 파일 독립.

---

## 검증 기준 요약

| US | Independent Test | 관련 SC |
|---|---|---|
| US1 | 가입→인증→로그인→프로필 200 | SC-01(10분 내 매칭 진입) |
| US2 | 프로젝트 생성→초대→수락 | — |
| US3 | 추천 응답 ≤5초, breakdown 동봉 | SC-02, SC-06 |
| US4 | 종합 평점 갱신, 14일 잠정 처리 | SC-04 |
| US5 | OAuth→이벤트 적재 | SC-08 |
| US6 | 위험 신호 노출 및 7일 내 개선 | SC-05 |
| US7 | 공통 슬롯·캘린더 이벤트 | — |
| US8 | 이상 감지 정확도/재현율 측정 | SC-10 |
| US9 | 프리미엄 전환 후 부스트 작동 | SC-13 |
| US10 | 30일 SLA 처리 | SC-11 |

---

## 실행 전략 — Incremental Delivery

1. **Sprint 0 (Setup+Found)**: Phase 1+2 — 1~1.5 sprint.
2. **Sprint 1~2 (MVP α)**: US1+US2 — 가입·프로젝트 가능.
3. **Sprint 3 (MVP β)**: US3 — 매칭 가능.
4. **Sprint 4 (MVP GA)**: US4 — 평가·평점 닫힘. **첫 출시**.
5. **Sprint 5~6**: US5+US6+US7 — 협업/위험/일정.
6. **Sprint 7+**: US8(이상 평가) → US9(결제) → US10(개인정보) → Polish.

---

## 통계

- 총 태스크: **133개** (T001~T133)
- Setup: 7 / Foundational: 17
- US1: 18 / US2: 13 / US3: 11 / US4: 13 (**MVP 합 55개**)
- US5: 14 / US6: 6 / US7: 5
- US8: 8 / US9: 7 / US10: 6
- Polish: 8
- [P] 병렬 마킹: 약 90개 (전체의 약 68%)
- FE 화면 태스크 모두 `/frontend-design` 스킬 호출 지정

---

## 다음 단계

1. **CQ-01~03 명확화 미해결** — `/speckit.clarify` 실행 후 본 문서의 가정(WA-01~03)을 확정 결정으로 갱신.
2. `/speckit.implement` 또는 `/speckit.implement T001` 형태로 구현 착수.
3. 각 FE 태스크 시작 시 `/frontend-design "<해당 작업 설명>"` 호출.

---

## 진행 로그 (자동 갱신)

> `/speckit.implement` 실행 결과. 최근 갱신: 2026-05-22.

### Phase 1 — Setup ✅
- [X] **T001** 워크스페이스 골격 (frontend/, backend/, infra/, .env.example, .gitignore, .editorconfig)
- [X] **T002** 백엔드 부트스트랩 (Express + TS, PORT=9538, CORS 9518/p18.sumzip.com)
- [X] **T003** 프론트엔드 부트스트랩 (Vite + Vue 3 + Pinia, port=9518, proxy /api→9538)
- [X] **T004** Docker Compose + Nginx (p18.sumzip.com 단일 entrypoint)
- [X] **T005** GitLab CI 파이프라인 (lint/test/secret-scan/build/deploy + GitLeaks)
- [X] **T006** husky + lint-staged + commitlint + .editorconfig
- [X] **T007** pino + X-Request-Id 미들웨어

### Phase 2 — Foundational ✅
- [X] **T008** mysql2 connection.ts + ping
- [X] **T009** 001_init (users, availabilities, consents, domain_whitelist)
- [X] **T010** 002_matching (projects, project_members, matching_recommendations)
- [X] **T011** 003_collaboration (collab_integrations, collaboration_activities + 월 RANGE 파티션)
- [X] **T012** 004_evaluation (evaluations, ai_scores, ratings, anomaly_flags)
- [X] **T013** 005_subscription (subscriptions, partnerships, partnership_members)
- [X] **T014** 006_admin (notifications, audit_logs, refresh_tokens, dsr_requests)
- [X] **T015** Envelope + 글로벌 에러 핸들러 (RFC 7807)
- [X] **T016** JWT auth (access 15m + refresh 14d httpOnly + 회전·재사용 감지)
- [X] **T017** RBAC + assertOwner / assertSelfOrAdmin
- [X] **T018** rate-limit (인증 60/min, 익명 20/min, /auth/* 10/min)
- [X] **T019** audit log helper (audit_logs 저장 + 실패 fallback)
- [X] **T020** zod 검증 미들웨어 (body/query/params)
- [X] **T021** axios 인스턴스 + 인터셉터 + envelope unwrap
- [X] **T022** Pinia 스토어 (auth/projects/notifications) + 영속화
- [X] **T023** 라우터 + DefaultLayout
- [X] **T024** 도메인 화이트리스트 시드 (.ac.kr, .edu, .ac.uk 등)

### Phase 3 — US1 회원가입·프로필 ✅
- [X] **T025-T027** users / availabilities / consents repositories
- [X] **T028** auth service (bcrypt, 도메인 화이트리스트, 토큰 발급)
- [X] **T029** email 어댑터 + 가입 인증 메일 템플릿
- [X] **T030-T032** /auth/signup, /verify-email, /login, /logout, /refresh
- [X] **T033-T036** /users/me, PATCH/DELETE, /availability, /:id, /survey
- [X] **T037-T042** FE: Signup / Verify / Login / Profile Edit / Availability / Survey

### Phase 4 — US2 프로젝트 등록·모집 ✅
- [X] **T043-T044** projects / projectMembers repositories
- [X] **T045-T046** projects service + invite service (FR-B6 동시 3건 가드)
- [X] **T047-T050** /projects (CRUD + invite + respond)
- [X] **T051** 알림 hook (notifications insert)
- [X] **T052-T055** FE: Project New / List / Detail / Respond (Detail 통합)

### Phase 5 — US3 매칭 추천 ✅
- [X] **T056** matching repository + 7일 TTL
- [X] **T057-T060** 역할 / 시간겹침 / 성향 / 평점·신뢰·다양성 가중치
- [X] **T061** 결합기 (w1..w6 + exposureBoost) + breakdown
- [X] **T063** GET /projects/:id/recommendations
- [X] **T064-T066** FE: Recommendations 카드 그리드 + breakdown 툴팁

### Phase 6 — US4 동료 평가·종합 평점 ✅
- [X] **T067-T069** evaluations / ai_scores / ratings repositories (마이그레이션 내포)
- [X] **T070** evaluation service (자기평가 금지 + 14일 마감 + UNIQUE)
- [X] **T071** AI 평점 계산기
- [X] **T072** 종합 평점 결합 (0.6·peer + 0.4·AI)
- [X] **T075-T076** /projects/:id/evaluations, /users/:id/rating
- [X] **T077-T079** FE: 평가 작성 / Inbox / 별점 패널

### 미완(후속 세션 진행 예정)
- T062 matching archive 잡 / T073-T074 리마인더·트리거 잡
- US5~US10 (T080-T125) — 외부 연동·위험·일정·이상평가·결제·DSR
- Polish (T126-T133) — i18n / 접근성 / 보안 강화 / 관측 / 부하 테스트

