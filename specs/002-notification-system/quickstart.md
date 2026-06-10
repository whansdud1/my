# Quickstart: 알림 시스템

**Feature**: `002-notification-system` · 로컬 포트 BE `9538` / FE `9518` · 도메인 `p18.sumzip.com`

이 문서는 알림 시스템을 로컬에서 띄우고 핵심 흐름(이벤트 → 알림 → 읽음 → 설정)을 검증하는 최소 가이드다.

---

## 1. 사전 준비

- MariaDB 가동 (001과 동일 인스턴스, 포터블 MySQL 8.4.5 포트 3307 사용 가능)
- `backend/.env`에 `PORT=9538`, DB 접속 정보, 이메일 SaaS 키(`MAIL_API_KEY`) 설정
- `frontend/.env`에 `VITE_API_BASE_URL=http://localhost:9538/api/v1`

## 2. 마이그레이션 적용

```bash
cd backend
npm run migrate        # notifications, notification_types, notification_preferences,
                       # user_notification_settings, notification_outbox, delivery_logs
npm run seed           # notification_types 초기 시드 (MATCH_READY 등)
```

## 3. 서버 기동

```bash
# 터미널 1 — 백엔드 (워커 포함)
cd backend && npm run dev          # http://localhost:9538

# 터미널 2 — 프론트엔드
cd frontend && npm run dev         # http://localhost:9518
```

워커(`notificationWorker`)는 백엔드 프로세스 내에서 기본 10초 주기로 `notification_outbox`를 폴링한다.

## 4. 핵심 흐름 검증

> 모든 성공 응답은 공통 envelope `{ "ok": true, "data": <payload> }` 형태다.
> 따라서 `jq '.data'` 로 페이로드를 본다. 오류는 RFC 7807 problem+json(`instance`=requestId).

### 4-1. 이벤트 → 알림 생성
매칭 완료 이벤트를 모의 발생시켜 알림이 생성·전송되는지 확인:
```bash
# 인증 토큰 확보 후
TOKEN=... # 로그인으로 획득한 JWT
# (예: 매칭 완료 트리거가 연결된 엔드포인트 호출 또는 테스트 시드)
curl -s http://localhost:9538/api/v1/notifications \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
# → data.items[0].type == "MATCH_READY", data.items[0].status == "unread"
```

### 4-2. 안읽음 개수(폴링)
```bash
curl -s http://localhost:9538/api/v1/notifications/unread-count \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
# → { "unreadCount": 1 }
```

### 4-3. 읽음 처리(멱등)
```bash
curl -s -X POST http://localhost:9538/api/v1/notifications/<id>/read \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
# → data.status == "read". 동일 호출 반복해도 결과 동일(멱등).
```

### 4-4. 수신 설정 변경
```bash
curl -s -X PUT http://localhost:9538/api/v1/notifications/preferences \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"preferences":[{"type":"SCHEDULE_CHANGE","inApp":true,"email":false,"push":false,"mandatory":false}],
       "global":{"dndEnabled":false,"quietStart":"22:00","quietEnd":"08:00","timezone":"Asia/Seoul"}}' | jq
# 이후 SCHEDULE_CHANGE 알림은 인앱으로만 전송됨.
```

## 5. UI 확인 (http://localhost:9518)

- 상단 **NotificationBell** 에 안읽음 배지 표시
- 클릭 시 **NotificationList** 드롭다운, 안읽음 필터·전체 읽음 버튼
- `/settings/notifications` 에서 종류×채널 토글 + 방해 금지/야간 시간대 설정

## 6. 자동 테스트로 빠르게 검증

DB·서버 없이 핵심 로직을 검증하는 자동 테스트가 있다(모킹 기반):

```bash
# 백엔드 — 계약(목록/읽음/설정) · 단위(preferenceService) · 통합(워커 재시도·quiet hours·dedup)
cd backend && npm test
# 프론트 — 알림 센터 스토어(30초 폴링 · 읽음 상태 전이)
cd frontend && npx vitest run
```

| 테스트 | 파일 | 검증 대상 |
|---|---|---|
| 계약: 목록/카운트 | `backend/tests/contract/notifications.list.test.ts` | 직렬화·커서·필터·401/422 |
| 계약: 읽음(멱등) | `backend/tests/contract/notifications.read.test.ts` | 멱등 read·read-all·404 |
| 계약: 설정 | `backend/tests/contract/notifications.preferences.test.ts` | 필수 비활성 거부→422(FR-C3) |
| 단위: preferenceService | `backend/tests/unit/preferenceService.test.ts` | 기본값·필수 강제 |
| 통합: 워커 | `backend/tests/integration/notificationWorker.test.ts` | 재시도 백오프·quiet hours·suppress·dedup |
| 단위: 알림 센터 스토어 | `frontend/tests/unit/notificationStore.spec.ts` | 폴링·읽음 전이 |

## 7. 운영 지표 / 합격 기준 매핑

운영 지표는 워커가 1시간 주기로 집계·로깅한다(`src/services/notification/metrics.ts`).
수동 검증 SQL은 [`metrics-queries.sql`](./metrics-queries.sql) 참조.

| 검증 | Success Criteria | 측정 방법 |
|---|---|---|
| 이벤트 후 인앱 표시 5초 내 | SC-01 | metrics `inAppWithin5sRatio` / SQL `pct_within_5s` |
| 긴급(CRITICAL) 1분 내 도달 | SC-02 | metrics `criticalWithin1mRatio` / SQL `pct_within_1m` |
| 설정 변경 즉시 반영 | SC-04 | 설정 계약 테스트 + 다음 알림 채널 라우팅 |
| 5분 내 동일 이벤트 1건으로 묶임 | SC-05 | metrics `duplicateRatio` / SQL `pct_deduped` |

## 8. 트러블슈팅

- 이메일 미발송: `delivery_logs`에서 `result='failed'` 확인 → `MAIL_API_KEY`/연락처 유효성(EC-07) 점검
- 알림 미생성: `notificationEvents` 구독 등록 여부, `notification_outbox` pending 적재 확인
- 야간에 이메일 보류됨: 정상 동작(quiet hours). 긴급만 즉시 발송(FR-B4)
