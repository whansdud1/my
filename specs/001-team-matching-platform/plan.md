# Implementation Plan: 대학생 팀 매칭 플랫폼 (UniTeam)

**Branch**: `001-team-matching-platform` (git 미사용 환경 — 디렉터리 기준)
**Date**: 2026-05-15
**Spec**: [spec.md](./spec.md)
**Stack Source**: [Intent-Plan.md](./Intent-Plan.md)
**Status**: Draft (Phase 2 결과)

---

## 1. Summary

본 계획은 `spec.md` 에 정의된 대학생 팀 매칭 플랫폼을 **Vue.js 3 + Node.js/Express + MariaDB** 풀스택으로 구현하기 위한 1차 실행 청사진이다. 구현은 두 개의 분리된 워크스페이스(`frontend/`, `backend/`)로 진행하며, REST API 로 통신한다. 외부 협업 도구 연동·AI 추천·결제는 어댑터 레이어를 통해 모듈로 분리해 향후 교체 가능성을 확보한다.

본 문서 범위는 **Phase 0~2(계획)** 까지이다. 실제 태스크 생성과 구현은 후속 `/speckit.tasks`, `/speckit.implement` 단계에서 수행한다.

---

## 2. Technical Context

| 항목 | 결정 | 근거 |
|---|---|---|
| 언어/런타임 (FE) | TypeScript 5.x on Vue.js 3 (Composition API) | Intent-Plan.md 지정. 컴포넌트 재사용·타입 안전성 확보 |
| 빌드 도구 (FE) | Vite 5.x | Intent-Plan.md 지정. HMR·번들 속도 |
| 상태관리 (FE) | Pinia 2.x | Intent-Plan.md 지정. SSR·DevTools 친화 |
| 언어/런타임 (BE) | TypeScript 5.x on Node.js 20 LTS | Intent-Plan.md 지정 |
| 웹 프레임워크 (BE) | Express.js 4.x | Intent-Plan.md 지정. 최소·검증된 라우팅 미들웨어 |
| DB | MariaDB (MySQL 호환) | Intent-Plan.md 지정. 학교 인프라 보유 |
| DB 드라이버 | `mysql2` (Promise) | Intent-Plan.md 지정 |
| 마이그레이션 | `knex` 또는 `umzug` (선택; research 결정) | SQL 버전관리 표준 |
| 인증 | JWT (Access 15분 + Refresh 14일, httpOnly Cookie) | OAuth2 확장 호환·세션 무상태 |
| 인가 | RBAC (학생/교수/관리자) | spec FR-A5 |
| 외부 연동 | Zoom·Discord·Notion·Google Workspace OAuth 2.0 | spec FR-C1 |
| 캘린더 | Google Calendar API | spec FR-D2 |
| 결제 | 외부 PG 위임(예: 토스/아임포트 — 어댑터) | spec FR-I, A-06 |
| 알림 | 이메일(SMTP/외부 발송 SaaS) + 인앱 큐 | spec FR-H |
| 컨테이너/배포 | Docker + Nginx + GitLab CI/CD | Intent-Plan.md 지정 |
| 테스트 | Vitest(FE), Jest+Supertest(BE), Playwright(E2E) | 표준 |
| 관측 | structured logging(pino) + Prometheus + Grafana(권장) | 운영 표준 |
| 비밀관리 | `.env` (개발) / 배포 환경 비밀저장소 | A-06, Intent-Plan.md 노출된 평문 비번 처리 |

### 인프라 고정 설정 (절대 변경 금지)

> 사용자 지시(2026-05-22) — 모든 구성·코드·문서는 아래 값을 정확히 반영해야 한다.

| 항목 | 값 | 적용 위치 |
|---|---|---|
| **Frontend 포트** | `9518` | `vite.config.ts` server.port + preview.port, Docker compose `frontend` 매핑, `APP_BASE_URL=http://localhost:9518` |
| **Backend 포트** | `9538` | Express `app.listen`, `backend/.env` `PORT=9538`, Docker compose `backend` 매핑, `API_BASE_URL=http://localhost:9538` |
| **공개 도메인** | `p18.sumzip.com` | Nginx `server_name`, TLS 인증서 SAN, CORS allowed origin(`https://p18.sumzip.com`), OAuth redirect_uri(`https://p18.sumzip.com/api/v1/integrations/{provider}/oauth/callback`), OpenAPI `servers.url`, `PUBLIC_BASE_URL` |

**Nginx 라우팅**: `https://p18.sumzip.com/` → frontend(9518), `https://p18.sumzip.com/api/*` → backend(9538). 두 경로 모두 동일 origin이므로 브라우저 CORS 없이 동작 (개발 환경만 CORS 필요).

### 미해결 명확화 (Carry-over from spec.md §3.2)

> 사용자 지시로 `/speckit.plan` 단계를 진행했으나 `/speckit.clarify` 미실행 상태. 아래는 **작업 가정**이며 최종 결정 시 본 문서 갱신 필요.

- **WA-01 (CQ-01)**: 1차 출시는 **혼합형** 가정 — 학생 자율 등록을 기본, 교수 등록은 권한 토글로 지원. 권한 토글은 비활성 기본값으로 시작해 학교 제휴 체결 시 활성화.
- **WA-02 (CQ-02)**: 1차는 **대학 이메일 도메인(.ac.kr) 인증**, 2차에서 학교 SSO 옵션 추가. 학생증 업로드는 의심 케이스 한정 보조 수단.
- **WA-03 (CQ-03)**: 협업 데이터 수집은 **중간 집합(B)** — 회의 참석·문서 업로드·마감 준수·메시지 응답 빈도(본문 미분석). 본문 분석은 별도 동의 항목으로 추후 옵트인 제공.

---

## 3. Project Structure

```
mis2601/
├── specs/
│   └── 001-team-matching-platform/
│       ├── spec.md
│       ├── plan.md            (이 문서)
│       ├── research.md
│       ├── data-model.md
│       ├── quickstart.md
│       ├── contracts/
│       │   └── openapi.yaml
│       ├── checklists/
│       │   └── requirements.md
│       └── Intent-*.md
├── frontend/                  (Phase 3 생성 예정)
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── composables/
│   │   ├── pages/             (라우트 단위 화면)
│   │   ├── stores/            (Pinia)
│   │   ├── services/          (API 클라이언트 래퍼)
│   │   ├── types/             (공유 DTO 타입)
│   │   ├── router/
│   │   └── main.ts
│   ├── tests/
│   │   ├── unit/
│   │   └── e2e/
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/                   (Phase 3 생성 예정)
│   ├── src/
│   │   ├── routes/            (Express 라우터)
│   │   ├── controllers/
│   │   ├── services/          (비즈니스 로직)
│   │   │   ├── matching/
│   │   │   ├── evaluation/
│   │   │   ├── anomaly/
│   │   │   └── notification/
│   │   ├── repositories/      (mysql2 쿼리)
│   │   ├── adapters/          (Zoom/Discord/Notion/Google/PG)
│   │   ├── middlewares/       (auth, RBAC, rate-limit, audit)
│   │   ├── domain/            (엔터티/타입)
│   │   ├── config/
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   └── seeds/
│   │   ├── jobs/              (스케줄/큐 워커)
│   │   └── index.ts
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── contract/
│   ├── package.json
│   ├── tsconfig.json
│   └── nodemon.json
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml
│   │   ├── frontend.Dockerfile
│   │   ├── backend.Dockerfile
│   │   └── nginx.conf
│   └── ci/
│       └── .gitlab-ci.yml
├── docs/                      (선택; 운영 문서)
└── .env.example
```

---

## 4. Constitution Check

`.specify/memory/constitution.md` 가 존재하지 않으므로, **속성 기반 일반 원칙**으로 게이트를 평가한다.

| 게이트 | 평가 | 비고 |
|---|---|---|
| Simplicity (필요 이상 복잡성 없음) | PASS | FE/BE 2 프로젝트, 어댑터로 외부 통합 일원화 |
| Library-first (라이브러리 우선) | PASS | 표준 OSS(Express/Vue/mysql2) 활용 |
| Test-First (계약·통합 테스트 선행) | PASS | OpenAPI 계약 → contract 테스트 → 구현 순서 |
| Observability (구조적 로그·추적) | PASS | pino 구조적 로그 + 요청 ID + 감사 로그 |
| Versioning (스키마·API 버전) | PASS | `/api/v1` 네임스페이스, knex 마이그레이션 |
| Security/Privacy (FR-J 충족) | PASS | TLS·암호화 저장·동의 절차·삭제 권리 30일 |
| Bias Mitigation (FR-F3) | PASS | 다양성 가중치 모듈 분리, 노출 분포 측정 |

**Justification for non-trivial choices**

- 어댑터 패턴: 외부 SaaS(Zoom/Discord/Notion 등) API 변경·교체 시 영향을 차단하기 위함. spec FR-C 의 도구 다양성 요구를 반영.
- AI 모듈 분리: spec FR-E3, FR-F1 의 학습·갱신 주기와 운영 안정성 분리. 1차는 규칙 기반 + 단순 가중치, 2차에서 ML 도입.

**Gate 결과**: 통과. 위반 없음.

---

## 5. Phase 0 Plan — Research

산출물: [research.md](./research.md)

- 미해결 명확화(WA-01~03) 임시 결정 근거 정리
- 매칭 알고리즘 v1 (역할 균형·시간 겹침·성향 호환·평점·다양성 가중치) 가중치 초안
- 외부 협업 도구 OAuth 스코프·rate limit 조사
- AI 평점 산출식 v1 (활동지표 정규화 → 가중합)
- 이상 평가 감지 규칙(IQR + 활동괴리) v1
- MariaDB 인덱스·파티셔닝 전략(이벤트 테이블)
- 마이그레이션 도구 선택(knex vs umzug)
- 결제·이메일 발송 SaaS 후보

---

## 6. Phase 1 Plan — Design & Contracts

산출물:
- [data-model.md](./data-model.md) — 12개 핵심 엔터티 + 보조 테이블의 컬럼·관계·인덱스·상태전이
- [contracts/openapi.yaml](./contracts/openapi.yaml) — REST 계약 v1
- [quickstart.md](./quickstart.md) — 로컬 부팅 + 골든패스 검증
- [agent context](../../CLAUDE.md) — 후속 자동화 에이전트용 컨텍스트 (해당 환경 미구성 시 생략)

### API 디자인 원칙

- 기본 prefix: `/api/v1`
- 인증: JWT (Authorization: Bearer …) 또는 httpOnly Cookie
- 표준 응답 envelope:
  ```json
  { "data": { ... }, "meta": { "page": 1, "total": 0 }, "errors": [] }
  ```
- 페이지네이션: `?page=&size=` (기본 size=20, max=100)
- 필터: `?filter[field]=value`
- 정렬: `?sort=-createdAt`
- 에러 코드: RFC 7807 Problem Details + 도메인 코드 (예: `MATCHING_NO_CANDIDATE`)
- Rate limit: 인증 60 req/min, 비인증 20 req/min (NGINX + Express middleware)
- 감사 로그: 평가 작성/수정, 관리자 제재, 데이터 삭제 요청은 별도 audit_log 적재

### 모듈 경계

| 모듈 | 책임 | 주요 의존 |
|---|---|---|
| auth | 가입·로그인·토큰·세션·도메인 검증 | bcrypt, jsonwebtoken |
| users | 프로필·구독·삭제 요청 | repositories.users |
| projects | 프로젝트 CRUD·모집·초대 | repositories.projects |
| matching | 후보 추천·점수 산출·다양성 보정 | services.matching |
| collaboration | 외부 OAuth·활동 수집·위험 신호 | adapters.{zoom,notion,…} |
| schedule | 가용 시간 합산·캘린더 동기화 | adapters.google_calendar |
| evaluation | 동료평가·AI평점·종합평점 | services.evaluation, ai |
| anomaly | 이상 평가 감지·관리자 큐 | services.anomaly |
| notification | 이메일·인앱 큐 | adapters.email |
| billing | 구독·결제 콜백 | adapters.pg |
| admin | 관리자 콘솔·정책·통계 | repositories.* |

---

## 7. Phase 2 Plan — Task Decomposition Preview

> 본 계획서에는 태스크를 나열하지 않는다. 후속 `/speckit.tasks` 에서 다음 영역 단위로 의존성 정렬된 작업이 생성될 것을 권장:
>
> 1. 인프라(Docker, DB 마이그레이션 골격, CI)
> 2. 인증·사용자 프로필
> 3. 프로젝트·매칭 v1
> 4. 외부 협업 도구 연동(중간 집합)
> 5. 평가·AI 평점·이상 감지
> 6. 알림·구독·관리자
> 7. 관측·보안 강화·접근성·다국어

---

## 8. Risks & Mitigations

| 위험 | 영향 | 대응 |
|---|---|---|
| 외부 SaaS API 변경/장애 | 협업 데이터 수집 중단 | 어댑터 인터페이스, 마지막 정상 수집 시점 표기, 재시도 백오프 |
| 데이터 편향 누적 | 일부 학생만 매칭 집중 | 다양성 가중치 + 노출 KPI 모니터링(SC-09) |
| 악의 평가 보복 | 평점 신뢰도 저하 | IQR·괴리도 감지 + 평가자 가중치 감소 + 감사 |
| DB 비밀정보 평문 노출 | 보안 사고 | `.env`/비밀저장소 분리, 코드/문서에 평문 금지 |
| 개인정보 삭제 요청 폭주 | 운영 부담 | 자동 처리 파이프라인 + 익명화 보존 |
| MVP 범위 폭주 | 일정 지연 | 1차 무료 핵심(매칭·일정·평가)만, 프리미엄/광고는 2차 |

---

## 9. Definition of Done (계획 단계)

- [x] spec.md 와 정합되는 기술 스택 결정
- [x] 미해결 CQ 의 작업 가정 명시
- [x] Constitution 게이트 평가
- [x] research / data-model / contracts / quickstart 산출물 골격 작성
- [ ] CQ-01~03 최종 결정 후 본 문서·산출물 갱신 (사용자 결정 대기)

---

## 10. Next Action

1. `/speckit.clarify` 로 CQ-01~03 확정
2. 본 plan.md / research.md / data-model.md / contracts 갱신
3. `/speckit.tasks` 로 의존성 정렬된 작업 분해
4. `/speckit.implement` 로 구현 착수
