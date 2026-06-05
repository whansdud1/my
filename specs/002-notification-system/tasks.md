# Tasks: 알림 시스템 (Notification System)

**Feature Branch**: `002-notification-system`
**Source**: [plan.md](./plan.md) · [spec.md](./spec.md) · [data-model.md](./data-model.md) · [contracts/openapi.yaml](./contracts/openapi.yaml)
**Stack**: TS5/Node20/Express4/MariaDB(mysql2+knex) · Vue3/Vite/Pinia · 포트 BE 9538 / FE 9518
**Test policy**: plan §4 Test-First 게이트 → 계약·단위·통합 테스트 포함 (Jest+Supertest / Vitest)

---

## 규칙

- `[P]` = 다른 파일이라 병렬 실행 가능. 같은 파일 수정 작업은 순차.
- 각 사용자 스토리(US) 단계는 독립적으로 테스트 가능한 증분.
- 체크포인트에서 해당 스토리만으로 동작 검증 후 다음 진행.

---

## Phase 1: Setup (공유 인프라)

- [X] **T001** `backend/src/services/notification/` 디렉토리 골격 및 `index.ts` 진입점 생성
- [X] **T002** [P] `backend/src/domain/notification.ts` 도메인 타입 정의 (Notification, NotificationType, Preference, OutboxItem, DeliveryLog) — data-model.md 반영
- [X] **T003** [P] `frontend/src/types/notification.ts` 공유 DTO 타입 정의 (openapi.yaml 스키마 반영)
- [X] **T004** `.env.example`에 `MAIL_API_KEY`, `NOTIF_WORKER_INTERVAL_MS=10000`, `NOTIF_ARCHIVE_DAYS=90` 추가

---

## Phase 2: Foundational (모든 스토리의 선행 — 반드시 먼저 완료)

- [X] **T005** `backend/src/db/migrations/00X_notifications.ts` — `notifications`, `notification_types`, `notification_preferences`, `user_notification_settings`, `notification_outbox`, `delivery_logs` 테이블 + 인덱스 생성 (data-model.md)
- [X] **T006** `backend/src/db/seeds/00X_notification_types.ts` — 10종 시드(MATCH_READY…SYSTEM_NOTICE, SECURITY_ALERT는 is_mandatory=true)
- [X] **T007** `backend/src/repositories/notificationRepository.ts` — CRUD + 목록(커서·status 필터)·unreadCount·dedup 조회·outbox 적재/조회
- [X] **T008** `backend/src/services/notification/events/notificationEvents.ts` — 인프로세스 EventEmitter + 이벤트→종류 매핑 + 수신자 결정 로직(audience: individual/team_lead/team/admin)
- [X] **T009** `backend/src/routes/notifications.ts` 라우터 등록 + `/api/v1/notifications` 마운트, RBAC 미들웨어 연결

**Checkpoint**: 마이그레이션·시드 적용되고 빈 라우터가 인증 하에 200/401 응답.

---

## Phase 3: User Story 1 (P1) — 알림 수신·조회·읽음 [MVP]

**목표**: 이벤트 발생 시 인앱 알림이 생성되어 사용자가 목록·안읽음수 확인 및 읽음 처리 가능.
**독립 테스트**: 매칭 완료 이벤트 모의 발생 → 목록에 unread 1건 → 읽음 처리 시 read 전환, unreadCount 0.

### 테스트 (먼저)
- [ ] **T010** [P] [US1] `backend/tests/contract/notifications.list.test.ts` — GET /notifications, /unread-count 계약 테스트
- [ ] **T011** [P] [US1] `backend/tests/contract/notifications.read.test.ts` — POST /{id}/read, /read-all 계약(멱등 포함)

### 구현
- [X] **T012** [US1] `backend/src/services/notification/notificationService.ts` — `create(event)` 인앱 알림 생성 + outbox(in_app) 적재
- [X] **T013** [US1] `backend/src/services/notification/channels/channel.ts` 인터페이스 + `inAppChannel.ts`(DB 보존, 항상 성공)
- [X] **T014** [US1] `backend/src/controllers/notificationController.ts` — list/unreadCount/read/readAll 핸들러 (read 멱등, 다기기 동기화는 서버 권위)
- [X] **T015** [US1] T009 라우터에 list/unread-count/read/read-all 엔드포인트 연결
- [X] **T016** [P] [US1] `frontend/src/services/notificationApi.ts` — list·unreadCount·read·readAll API 클라이언트
- [X] **T017** [P] [US1] `frontend/src/stores/notificationStore.ts` — Pinia: 목록·unreadCount 상태, 30초 폴링(WA-02)
- [X] **T018** [US1] `frontend/src/components/NotificationBell.vue` — 안읽음 배지
- [X] **T019** [US1] `frontend/src/components/NotificationList.vue` — 목록·안읽음 필터·개별/전체 읽음·deep link 이동(EC-06 삭제 대상 안내)
- [X] **T020** [US1] 001 매칭 모듈에서 `notificationEvents.emit('MATCH_READY', …)` 연결 (이벤트 소스는 채널을 모름)
- [ ] **T021** [P] [US1] `frontend/tests/unit/notificationStore.spec.ts` — 폴링·읽음 상태 전이 Vitest

**Checkpoint**: US1만으로 인앱 알림 수신→읽음 전 흐름 동작. **= 배포 가능한 MVP.**

---

## Phase 4: User Story 2 (P2) — 채널 설정 + 이메일 채널

**목표**: 사용자가 종류×채널 수신 설정을 관리하고, 설정에 따라 이메일이 추가 발송됨.
**독립 테스트**: SCHEDULE_CHANGE 이메일 off 저장 → 해당 이벤트 시 이메일 미발송·인앱만; 필수 종류(SECURITY_ALERT)는 off 불가.

### 테스트 (먼저)
- [ ] **T022** [P] [US2] `backend/tests/contract/notifications.preferences.test.ts` — GET/PUT /preferences 계약 + 필수 종류 비활성 거부

### 구현
- [X] **T023** [US2] `backend/src/services/notification/preferenceService.ts` — 설정 조회/갱신, 행 부재 시 type 기본값 적용, is_mandatory 강제(FR-C3)
- [X] **T024** [US2] notificationController에 preferences GET/PUT 핸들러 + T009 라우터 연결
- [X] **T025** [US2] notificationService 확장 — create 시 preferenceService 조회해 outbox에 email 채널 조건부 적재
- [X] **T026** [US2] `backend/src/services/notification/channels/emailChannel.ts` — 외부 메일 SaaS 어댑터(인터페이스 뒤), 연락처 유효성 검사(EC-07)
- [X] **T027** [P] [US2] `frontend/src/pages/NotificationSettings.vue` — 종류×채널 토글 + 즉시 저장(FR-C4)
- [X] **T028** [P] [US2] `frontend/src/services/notificationApi.ts`에 preferences get/put 추가
- [ ] **T029** [P] [US2] `backend/tests/unit/preferenceService.test.ts` — 기본값·필수 강제 단위 테스트

**Checkpoint**: US1 + US2. 설정 기반 멀티채널(인앱+이메일) 동작. 푸시는 스텁(WA-01).

---

## Phase 5: User Story 3 (P3) — 신뢰성: 중복억제·재시도·quiet hours·수명주기

**목표**: 워커가 outbox를 처리하며 재시도·중복 억제·야간 묶음·보관을 수행해 과다/누락을 방지.
**독립 테스트**: 동일 이벤트 5분 내 2회 → 알림 1건(group_count 증가); 이메일 1회 실패 후 재시도 성공; 야간엔 비긴급 이메일 보류, 긴급 즉시.

### 테스트 (먼저)
- [ ] **T030** [P] [US3] `backend/tests/integration/notificationWorker.test.ts` — 재시도 백오프·quiet hours·dedup 통합 테스트

### 구현
- [X] **T031** [US3] notificationService dedup — `dedupKey=hash(recipient+type+targetRef+5분버킷)`, 기존 unread면 group_count·시각 갱신(FR-E1/SC-05)
- [X] **T032** [US3] `backend/src/jobs/notificationWorker.ts` — 주기 폴링, 채널 전송, 지수 백오프(30s/2m/10m/30m) 최대 4회, 실패 시 failed + delivery_logs(FR-B3)
- [X] **T033** [US3] quiet hours/DND 적용 — 비긴급 email/push의 next_attempt_at을 다음 발송 가능 시각으로 이연, critical 즉시(FR-B4/FR-E2/EC-08)
- [X] **T034** [US3] 보관 워커 — created_at > NOTIF_ARCHIVE_DAYS 알림 archived 일괄 처리(FR-F1/EC-05)
- [X] **T035** [US3] `backend/src/services/notification/channels/pushChannel.ts` — Web Push 인터페이스 스텁(비활성 토글, WA-01)
- [X] **T036** [US3] 001 이벤트 소스 추가 연결 — COLLAB_RISK(팀장만, WA-03)·EVAL_REMINDER·TEAM_JOIN_REQUEST/RESULT emit

**Checkpoint**: US1+US2+US3. 신뢰성·피로도 제어 완비.

---

## Phase 6: Polish & Cross-Cutting

- [ ] **T037** [P] delivery_logs 기반 운영 지표(전송 지연·실패율) 측정 로깅 + SC-01/02/05 검증 쿼리
- [ ] **T038** [P] `frontend/tests/e2e/notification.e2e.ts` — 이벤트→수신→읽음→설정 반영 E2E(Playwright)
- [ ] **T039** [P] OpenAPI 문서 `/api/v1` 통합 및 에러 응답(requestId) 일관성 점검
- [ ] **T040** quickstart.md 절차 실측 검증 및 보정

---

## 의존성 그래프

```
Setup(T001-T004) → Foundational(T005-T009) ─┬─ US1(T010-T021)  [MVP, 독립]
                                            ├─ US2(T022-T029)  [US1 위에 증분]
                                            └─ US3(T030-T036)  [US1/US2 위에 증분]
                                                      ↓
                                              Polish(T037-T040)
```

- US1은 Foundational 완료 후 단독 배포 가능(MVP).
- US2는 US1의 notificationService/controller를 확장(T025는 T012 의존).
- US3은 outbox 처리 워커로 US1/US2의 채널을 신뢰성 보강.

## 병렬 실행 예시

- **Setup**: T002, T003 동시 (BE 타입 / FE 타입).
- **US1 테스트**: T010, T011 동시. 구현 중 T016·T017·T021(FE)와 T012·T013(BE) 동시.
- **US2**: T027·T028(FE)와 T023·T026·T029(BE) 동시.

## 구현 전략 (MVP first)

1. **MVP**: Phase 1→2→3 (US1)만으로 인앱 알림 수신·읽음 제공 — 가장 빠른 가치 전달.
2. **증분 1**: Phase 4(US2) 채널 설정+이메일.
3. **증분 2**: Phase 5(US3) 신뢰성·피로 제어.
4. **마감**: Phase 6 관측·E2E·문서.

## 미확정(클라리파이 이관)

- **WA-01** 푸시 1차 비활성(스텁만, T035) / **WA-02** 30초 폴링(T017) / **WA-03** COLLAB_RISK 팀장만(T036).
  `/speckit.clarify`에서 확정 시 관련 태스크 조정 필요.
