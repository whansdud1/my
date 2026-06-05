# Implementation Plan: 알림 시스템 (Notification System)

**Feature Branch**: `002-notification-system`
**Created**: 2026-06-05
**Source Spec**: [spec.md](./spec.md)
**Status**: Draft (Phase 0–2 planned)

---

## 1. Summary

UniTeam 플랫폼의 주요 이벤트(매칭·합류·협업 위험·평가·일정·운영·공지)를 사용자에게 다중 채널(인앱·이메일·푸시)로 전달하는 통합 알림 시스템을 구축한다. 이벤트 발생 → 알림 생성 → 사용자 설정 기반 채널 라우팅 → 전송/재시도 → 읽음·보관 수명주기 관리를 핵심 흐름으로 한다. 기존 001 백엔드의 `services/notification` 경계를 실 모듈로 구체화한다.

---

## 2. Technical Context

| 항목 | 결정 | 근거 |
|---|---|---|
| 언어/런타임 (FE) | TypeScript 5.x on Vue.js 3 (Composition API) | 001 plan 일치 |
| 빌드 도구 (FE) | Vite 5.x | 001 plan 일치 |
| 상태관리 (FE) | Pinia 2.x (`notificationStore`) | 안읽음 배지·목록 캐시 |
| 언어/런타임 (BE) | TypeScript 5.x on Node.js 20 LTS | 001 plan 일치 |
| 웹 프레임워크 (BE) | Express.js 4.x | 001 plan 일치 |
| DB | MariaDB (MySQL 호환), `mysql2` + `knex` | 001 plan 일치 |
| 이벤트 수신 | 인프로세스 이벤트 버스(EventEmitter) → 향후 큐로 확장 | 1차 단순화, 모듈 경계 유지 |
| 비동기 처리 | DB 기반 작업 테이블(`notification_outbox`) + 주기 워커(`jobs/`) | 외부 채널 장애 격리·재시도(FR-B3) |
| 이메일 채널 | 외부 트랜잭션 메일 SaaS 어댑터(인터페이스로 추상화) | 교체 가능성 확보 |
| 푸시 채널 | Web Push(VAPID) 어댑터 — **WA-01 따라 2차 토글** | Q1 기본값 |
| 실시간 인앱 | 주기 폴링(기본 30초) + 안읽음 카운트 엔드포인트 — **WA-02** | Q2 기본값, SSE는 2차 옵션 |
| 인증/인가 | 기존 JWT + RBAC 재사용 | 001 일치 |
| 테스트 | Jest+Supertest(BE), Vitest(FE), 계약 테스트(OpenAPI) | 001 표준 |
| 관측 | pino 구조적 로그 + DeliveryLog 테이블 | FR-F2, SC 측정 |

### 인프라 고정 설정 (절대 변경 금지)

| 항목 | 값 |
|---|---|
| Frontend 포트 | `9518` |
| Backend 포트 | `9538` |
| 공개 도메인 | `p18.sumzip.com` |

알림 API는 기존 `/api/v1` 네임스페이스 하위 `/api/v1/notifications`로 추가한다.

### 작업 가정 (Open Questions 확정 — spec §8)

> `/speckit.clarify` 미실행 상태. 아래는 명세 기본값을 따른 **작업 가정**이며 최종 결정 시 본 문서 갱신.

- **WA-01 (Q1 채널 범위)**: 1차는 **인앱 + 이메일**. 푸시는 어댑터 인터페이스만 정의하고 비활성 토글로 보류(2차 활성화).
- **WA-02 (Q2 실시간성)**: 1차는 **주기 폴링(30초) + 안읽음 카운트**. 실시간 SSE/WebSocket은 2차 옵션.
- **WA-03 (Q3 위험 신호 수신 대상)**: 1차는 **팀장(team lead)에게만** 협업 위험 신호 알림 전송. 팀 전체 공유는 옵트인 설정으로 추후 제공.

---

## 3. Project Structure

```
specs/002-notification-system/
├── spec.md
├── plan.md               (이 문서)
├── research.md           (Phase 0)
├── data-model.md         (Phase 1)
├── quickstart.md         (Phase 1)
├── contracts/
│   └── openapi.yaml       (Phase 1)
└── checklists/
    └── requirements.md

backend/src/                (기존 구조에 추가)
├── routes/notifications.ts
├── controllers/notificationController.ts
├── services/notification/
│   ├── notificationService.ts      (생성·라우팅·중복억제)
│   ├── preferenceService.ts        (사용자 설정)
│   ├── channels/
│   │   ├── channel.ts              (인터페이스)
│   │   ├── inAppChannel.ts
│   │   ├── emailChannel.ts
│   │   └── pushChannel.ts          (WA-01 비활성)
│   └── events/notificationEvents.ts (이벤트 → 알림 매핑)
├── repositories/notificationRepository.ts
├── jobs/notificationWorker.ts      (outbox 폴링·재시도·야간 묶음)
└── db/migrations/00X_notifications.ts

frontend/src/                (기존 구조에 추가)
├── stores/notificationStore.ts
├── services/notificationApi.ts
├── components/NotificationBell.vue / NotificationList.vue
└── pages/NotificationSettings.vue
```

---

## 4. Constitution Check

`.specify/memory/constitution.md` 부재 → 속성 기반 일반 원칙으로 평가.

| 게이트 | 평가 | 비고 |
|---|---|---|
| Simplicity | PASS | 1차 인프로세스 이벤트 + DB outbox, 외부 큐 미도입 |
| Library-first | PASS | 표준 OSS 재사용, 채널은 어댑터 인터페이스 |
| Test-First | PASS | OpenAPI 계약 → contract 테스트 → 구현 |
| Observability | PASS | DeliveryLog + pino, SC 지표 측정 가능 |
| Versioning | PASS | `/api/v1/notifications`, knex 마이그레이션 |
| Security/Privacy | PASS | 필수 알림 강제(FR-C3), 수신자 권한 검증, 연락처 검증(EC-07) |

**Gate 결과**: 통과. 위반 없음.

---

## 5. Phase 0 Plan — Research

산출물: [research.md](./research.md)

- 이벤트 전달 방식(인프로세스 EventEmitter vs 메시지 큐) 1차 선택 근거
- Outbox 패턴 + 워커 폴링 주기·재시도(backoff) 전략
- 중복 억제(dedup key + rate limit) 규칙 설계
- 야간 묶음(quiet hours) 및 방해 금지 동작 정의
- 이메일/푸시 SaaS 후보 비교 및 어댑터 인터페이스 경계
- 읽음 상태 다기기 동기화(서버 권위 모델) 방식

---

## 6. Phase 1 Plan — Design & Contracts

산출물: [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

### API 디자인 원칙
- REST, `/api/v1/notifications` 하위. 모든 응답에 요청 ID 포함.
- 목록은 커서/페이지 기반, `?status=unread` 필터, `unreadCount` 별도 엔드포인트.
- 설정은 종류×채널 매트릭스 PUT.

### 핵심 엔드포인트(요약)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/notifications` | 알림 목록(필터·페이지) |
| GET | `/api/v1/notifications/unread-count` | 안읽음 개수(폴링용) |
| POST | `/api/v1/notifications/{id}/read` | 개별 읽음 |
| POST | `/api/v1/notifications/read-all` | 전체 읽음 |
| GET | `/api/v1/notifications/preferences` | 수신 설정 조회 |
| PUT | `/api/v1/notifications/preferences` | 수신 설정 갱신 |

### 모듈 경계
- **이벤트 소스(001 모듈)** 는 `notificationEvents.emit(type, payload)` 만 호출, 채널·전송을 모름.
- **notificationService** 가 수신자 결정·설정 적용·dedup·outbox 적재 담당.
- **notificationWorker** 가 outbox를 읽어 채널 어댑터로 전송·재시도·야간 묶음 처리.

---

## 7. Phase 2 Plan — Task Decomposition Preview

1. DB 마이그레이션(notifications, notification_preferences, notification_outbox, delivery_logs)
2. 도메인 타입 + repository
3. notificationService(생성·dedup·설정 적용) + 단위 테스트
4. 채널 어댑터(inApp, email) + 인터페이스, push 스텁
5. notificationWorker(폴링·재시도·quiet hours) + 통합 테스트
6. REST 라우트·컨트롤러 + OpenAPI 계약 테스트
7. 001 이벤트 소스 연결(매칭·합류·위험·평가 트리거)
8. FE: store·api·Bell·List·Settings + Vitest
9. E2E: 이벤트 → 알림 수신 → 읽음 → 설정 반영

---

## 8. Risks & Mitigations

| 리스크 | 영향 | 완화 |
|---|---|---|
| 외부 메일 SaaS 장애 | 이메일 미도달 | 인앱 항상 보존(FR-B2), 재시도·실패 로그, 채널 격리 |
| 알림 과다로 피로 | 수신 거부 증가(SC-06) | dedup·rate limit·quiet hours·종류별 설정 |
| 폴링 부하 | 서버 부담 | unread-count 경량 엔드포인트, 30초 주기, 2차 SSE 전환 |
| 읽음 상태 경쟁 | 다기기 불일치 | 서버 권위 모델, 멱등 read 처리 |

---

## 9. Definition of Done (계획 단계)

- [x] Technical Context 확정(작업 가정 명시)
- [x] Constitution Check 통과
- [x] research.md / data-model.md / contracts / quickstart 생성
- [ ] `/speckit.clarify`로 WA-01~03 최종 확정
- [ ] `/speckit.tasks`로 작업 분해

---

## 10. Next Action

`/speckit.clarify` (WA-01~03 확정) 또는 `/speckit.tasks` (작업 분해) 진행.
