# Phase 0 Research: 대학생 팀 매칭 플랫폼

**Feature**: 001-team-matching-platform
**Date**: 2026-05-15
**Status**: Initial

---

## R-01. 미해결 명확화에 대한 작업 결정 (CQ-01 ~ CQ-03)

### R-01a. 매칭 진입점/트리거 (CQ-01)

- **Decision**: 1차는 **혼합형 — 학생 자율 기본 + 교수 등록(권한 토글)** 모드로 출시.
- **Rationale**:
  - spec.md Primary Story 가 학생 주도 시나리오(공모전 참여)를 중심에 둠 → 자율형이 자연스러움.
  - 교수 등록은 추가 권한·UI 1개 화면이면 충족 가능(낮은 비용). 학교 제휴 시 즉시 활성 가능한 옵션을 갖는 편이 비즈니스 유연성 확보.
  - 학교 SSO 미구축 시점이라도 자율형이 단독 가동 가능.
- **Alternatives**:
  - 학생 자율 단독: 빠르나 학교/교수 가치제안(spec §혜택 §교수·학교 측면) 미구현.
  - 수업 연계 단독: 제휴 계약 선결 필요, 출시 일정 위험.
- **Open**: 사용자 최종 확정 시 본 결정 무효화 가능.

### R-01b. 학생 신분 검증 (CQ-02)

- **Decision**: 1차 **이메일 도메인 인증(.ac.kr 화이트리스트)** + 의심 사례 한정 학생증 업로드(관리자 검토).
- **Rationale**:
  - 도메인 인증은 통합 비용 최소, MVP 적합.
  - 화이트리스트로 우회(개인 메일) 차단.
  - 학생증은 모든 사용자에게 강제하면 가입 마찰 큼 → 이상 행위 의심 시에만 요청.
- **Alternatives**:
  - SSO 전면 도입: 학교별 협의·SAML/OIDC 구성 필요, 출시 일정 위험.
  - 학생증 전면 도입: 운영 인력·개인정보 보관 부담 큼.
- **Future**: 2차에서 학교 SSO(OIDC) 옵션을 어댑터로 추가.

### R-01c. 외부 협업 도구 데이터 수집 범위 (CQ-03)

- **Decision**: **중간 집합** — 회의 참석 로그, 문서/작업 업로드 이벤트, 마감 준수, **메시지 응답 빈도/시간**(본문 미분석).
- **Rationale**:
  - 본문 NLP 분석은 동의 범위 확장·보안 요건 급증 → 1차 회피.
  - 응답 빈도/시간 은 메타데이터(이벤트 시각)만 수집, 본문 미접근 → 동의·구현 비용 최소화하면서 위험 신호 정확도 확보.
  - 동의서에 "본문 미분석" 명시.
- **Alternatives**:
  - 최소 집합: 위험 신호 정확도 낮음, AI 학습 데이터 부족.
  - 최대 집합(본문 NLP): 정확도 최고이나 동의·보안·법적 리스크 큼.

---

## R-02. 매칭 알고리즘 v1

- **Decision**: 가중치 기반 선형 결합 모델(투명·설명가능).
- **Score**: `S = w1·역할균형 + w2·시간겹침 + w3·성향호환 + w4·평점 + w5·다양성 + w6·신뢰점수`
- **초기 가중치**: w1=0.30, w2=0.25, w3=0.15, w4=0.15, w5=0.10, w6=0.05 (운영 데이터로 튜닝)
- **Rationale**:
  - spec FR-B3 의 5개 요소 + 평가자 신뢰점수 반영.
  - 학습 모델은 1차 미도입(데이터·라벨 부족). 2차에서 학습 모델로 대체 가능하도록 인터페이스 분리.
- **Alternatives**:
  - 협업 필터링: 콜드스타트 취약, 신규 사용자 불리.
  - GBM/딥러닝: 데이터 누적 후(SC-12 달성 후) 도입.

---

## R-03. AI 평점 산출식 v1

- **Decision**: 활동 지표 → 정규화 → 가중합 (0~5 스케일).
- **Indicators**:
  - 회의 참석률 (참석/총 회의)
  - 업로드 빈도(주간 정규화)
  - 마감 준수율
  - 응답 회신 중앙값(시간 단축 시 가산)
  - 역할별 산출물 완성도 평가(교수/팀장 가능 시 입력)
- **Formula**: `AI = 5 · Σ(min(1, indicator_i / target_i) · weight_i)`
- **Rationale**: 단순·검증 용이. 통계적 정규화로 코호트 간 비교 가능.
- **Combined Score** (FR-E4): `최종 = 0.6·동료평가(평균) + 0.4·AI`
- **Open**: 학과·프로젝트 유형별 가중치 튜닝 필요.

---

## R-04. 이상 평가 감지 규칙 v1

- **Decision**: 다중 신호의 OR 결합.
  - **신호 1**: 동일 평가자→피평가자 페어의 평균 점수가 평가자 전체 평균보다 2σ 이하.
  - **신호 2**: 활동 지표 정규화 점수와 동료 평가 점수의 절대차 ≥ 1.5 (5점 척도).
  - **신호 3**: 단기간(7일 내) 동일 평가자가 다수 피평가자에게 일관되게 낮은 점수.
- **Action**: 위 신호 1건 이상 → "검토 보류" + 관리자 알림. 2건 이상 → 평가자 가중치 0.5 자동 적용.
- **Rationale**: spec FR-G1, AS-08.
- **Alternatives**: 머신러닝 이상 탐지(데이터 누적 후 2차 도입).

---

## R-05. 외부 협업 도구 OAuth 스코프

| 도구 | 필요 스코프(요지) | 비고 |
|---|---|---|
| Zoom | meeting:read, recording:read(선택) | 참석자/참석시간 |
| Discord | guilds.read, messages.read(메타) | 본문 미저장, 메시지 시각만 |
| Notion | block:read, database:read | 페이지 변경 시각 |
| Google Workspace | drive.metadata.readonly, calendar.events.readonly | 업로드·캘린더 |
| Google Calendar | calendar.events.readonly | 일정 충돌 계산 |

- **Decision**: 최소 스코프 원칙. 본문/녹화 콘텐츠는 명시적 별도 동의 후에만.
- **Rate limit 가드**: 도구별 백오프·캐싱(최근 24시간 단위 fetch).

---

## R-06. 마이그레이션 도구

- **Decision**: **knex.js** 마이그레이션 + 쿼리는 `mysql2` 그대로 사용.
- **Rationale**:
  - 가벼움, MariaDB 호환.
  - 별도 ORM 미사용으로 SQL 가시성 유지(Intent-Plan.md "SQL 쿼리 기반 데이터 조작" 방침).
- **Alternatives**:
  - Prisma: 강력하나 SQL 가시성·MariaDB 일부 기능 지원 한계.
  - umzug: 가능하나 knex 가 마이그레이션 + 시드 동시 제공.

---

## R-07. 비밀 관리

- **Decision**: `.env` 로컬 개발, 배포 시 시크릿 매니저(예: GitLab CI Variables → 컨테이너 env 주입).
- **Action**:
  - Intent-Plan.md 의 평문 비밀번호는 문서 단계에서만 존재, 코드/리포지토리 평문 금지.
  - `.env.example` 만 커밋, 실제 `.env` 는 `.gitignore`.
- **Rationale**: spec FR-J3.

---

## R-08. 결제(PG) 어댑터

- **Decision**: 후보 — **토스페이먼츠** 또는 **아임포트(Iamport)**. 1차는 어댑터 인터페이스만 정의하고 단일 PG 채택.
- **Rationale**: 국내 학생 결제 환경 적합, 정기결제 지원.
- **Open**: 학교 결제 정책에 따라 변경 가능.

---

## R-09. 이메일 발송

- **Decision**: 1차 — Amazon SES 또는 SendGrid 중 운영비 적은 쪽. 어댑터로 추상화.
- **Rationale**: 발송 신뢰도, 도메인 평판 관리, 휴면계정 회수 정책.

---

## R-10. 관측·로깅

- **Decision**:
  - 구조적 로그: `pino` (백엔드) + 요청 ID(`X-Request-Id`).
  - 메트릭: Prometheus 노출 (`/metrics`), Grafana 대시보드.
  - 알람: Grafana Alert + 이메일/Discord 웹훅.
- **Rationale**: spec SC-07 가용성 모니터링 필수.

---

## R-11. DB 인덱스·파티셔닝 전략 (개요)

- **users**: `(email_domain)`, `(department, grade)`, `(rating DESC)` 부분 정렬용.
- **collaboration_activity**: `(project_id, occurred_at)` 클러스터·`(user_id, occurred_at)`. 월 단위 RANGE 파티션(이벤트 폭증 대응).
- **evaluation**: `(project_id, evaluatee_id)`, `(evaluator_id, created_at)`.
- **matching_recommendation**: TTL(7일) 후 archive 테이블로 이전.

---

## R-12. 테스트 전략

- **Contract first**: openapi.yaml → contract test(`pact` 또는 `dredd`) → 구현.
- **단위**: Vitest(FE), Jest(BE) — 도메인 서비스 90% line.
- **통합**: 테스트 컨테이너로 MariaDB 기동, repositories·routes 통합 테스트.
- **E2E**: Playwright — 가입~매칭~평가 골든 패스.
- **로드**: k6 — SC-06(10K 동시, 매칭 추천 5초) 검증.

---

## R-13. 접근성·국제화

- **Decision**: 1차 한국어. WCAG 2.1 AA 준수(키보드 내비게이션·대비·라벨).
- **Future**: 영문 i18n(`vue-i18n`) — 2차.

---

## R-14. 보안 체크리스트(요약)

- TLS 강제, HSTS.
- CSRF: 쿠키 사용 경로에 한해 SameSite=Lax + 토큰.
- XSS: Vue 기본 이스케이프 + DOMPurify.
- SQL Injection: prepared statements(`mysql2` placeholder).
- 권한 우회: RBAC 미들웨어 + 객체 수준 권한 가드.
- 감사 로그: 평가/제재/삭제 액션은 별 테이블 적재.
- 비밀: env 분리, 코드 스캐닝(GitLeaks) CI 단계.

---

## R-15. 비용·운영 개요(추정)

- 1차 인프라: 단일 Docker 호스트 + 외부 DB(MariaDB) → 월 수십만 원대.
- 확장: 동시접속 10K 도달 시(SC-06) — DB 읽기 복제, 매칭 워커 분리.

---

## Open Items (계속 추적)

- CQ-01~03 최종 결정 시 본 문서 R-01a~c 갱신.
- AI 평점 가중치 운영 튜닝.
- PG/이메일 SaaS 최종 선정.
