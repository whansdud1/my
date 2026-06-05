# Phase 0 Research: 알림 시스템

**Feature**: `002-notification-system` · **Date**: 2026-06-05

각 항목은 Decision / Rationale / Alternatives 형식으로 정리한다.

---

## R-01. 이벤트 전달 방식

- **Decision**: 1차는 **인프로세스 이벤트 버스**(Node `EventEmitter` 기반 `notificationEvents`). 이벤트 핸들러가 즉시 알림을 생성해 `notification_outbox`에 적재한다.
- **Rationale**: 001 백엔드가 단일 Express 프로세스이며, 외부 큐(RabbitMQ/Redis Streams) 도입은 운영 복잡도만 키운다. outbox 테이블이 내구성을 제공하므로 프로세스 재시작에도 미전송 알림이 보존된다.
- **Alternatives**: (a) Redis Pub/Sub — 다중 인스턴스 확장 시 필요하나 1차 과잉. (b) 직접 동기 전송 — 외부 채널 장애가 이벤트 소스로 전파되어 거부.

## R-02. Outbox + 워커 재시도 전략

- **Decision**: `notification_outbox`에 (notificationId, channel, status, attemptCount, nextAttemptAt)를 두고, `notificationWorker`가 기본 10초 주기로 `nextAttemptAt <= now` 행을 집어 전송. 실패 시 지수 백오프(30s, 2m, 10m, 30m) 최대 4회, 이후 `failed` 확정 + 로그.
- **Rationale**: 채널 장애를 이벤트 소스와 분리(FR-B3), 멱등 처리로 중복 발송 방지, 재시도 상한으로 무한 루프 차단.
- **Alternatives**: cron-only(주기만, 백오프 없음) — 일시 장애에 비효율. 즉시 동기 재시도 — 요청 지연 유발로 거부.

## R-03. 중복 억제(dedup) 규칙

- **Decision**: 알림 생성 시 `dedupKey = hash(recipient + type + targetRef + bucket(5분))` 산출. 같은 키가 이미 unread로 존재하면 새로 만들지 않고 기존 알림의 count/시각만 갱신(묶음).
- **Rationale**: SC-05(중복 5분 내 재전송 1% 미만) 달성. 동일 위험 신호·반복 이벤트 폭주 방지.
- **Alternatives**: 전송 단계에서만 rate limit — 이미 생성된 알림이 목록을 오염. 키 없이 시간창 카운트 — 정확도 낮음.

## R-04. Quiet Hours / 방해 금지

- **Decision**: 사용자 설정의 야간 시간대(기본 22:00~08:00, 사용자 타임존 기준)와 방해 금지 모드 동안 **비긴급** 알림의 email/push 전송을 보류하고 `nextAttemptAt`을 다음 발송 가능 시각으로 설정. 인앱은 즉시 보존. 긴급(critical)은 항상 즉시(FR-B4).
- **Rationale**: EC-08·FR-E2 충족, 사용자 피로 감소(SC-06).
- **Alternatives**: 야간 전면 차단 — 정보 누락. 클라이언트 측 숨김 — 서버 권위 위배.

## R-05. 채널 어댑터 경계

- **Decision**: `Channel` 인터페이스(`send(notification, recipientContact): Promise<DeliveryResult>`). 구현체 `inAppChannel`(DB 보존), `emailChannel`(외부 트랜잭션 메일 SaaS 어댑터), `pushChannel`(Web Push/VAPID, **WA-01로 1차 비활성 스텁**).
- **Rationale**: 채널 추가/교체가 서비스 로직에 영향 없음(Library-first). 이메일 SaaS 후보는 환경변수로 주입.
- **Alternatives**: 채널별 하드코딩 — 교체 비용↑. 단일 멀티채널 SaaS 강결합 — 종속성↑.

## R-06. 읽음 상태 다기기 동기화

- **Decision**: 서버가 권위. `read` 처리는 멱등(이미 read면 no-op). 클라이언트는 폴링 시 서버의 status/unreadCount를 신뢰 갱신(WA-02).
- **Rationale**: EC-04(다기기 읽음 반영) 충족, 충돌 단순화.
- **Alternatives**: 클라 로컬 상태 우선 — 기기 간 불일치. 실시간 push 동기화 — 2차 SSE 도입 시 적용.

## R-07. 이메일/푸시 SaaS 후보

- **Decision**: 이메일은 어댑터 뒤에 두고 후보(예: 트랜잭션 메일 SaaS) 중 1차 1개 선택, `.env`로 주입. 푸시는 인터페이스만 확정.
- **Rationale**: 비용·도달률은 운영 정책 의존, 코드 결합 회피.
- **Alternatives**: 자체 SMTP 운영 — 도달률·운영부담 리스크.

---

## 미해결(클라리파이 이관)

- **WA-01~03** (plan §2): 채널 범위/실시간성/위험 신호 수신 대상 — `/speckit.clarify`에서 최종 확정 필요.
