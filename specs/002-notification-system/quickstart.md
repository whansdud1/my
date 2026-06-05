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

### 4-1. 이벤트 → 알림 생성
매칭 완료 이벤트를 모의 발생시켜 알림이 생성·전송되는지 확인:
```bash
# 인증 토큰 확보 후
TOKEN=... # 로그인으로 획득한 JWT
# (예: 매칭 완료 트리거가 연결된 엔드포인트 호출 또는 테스트 시드)
curl -s http://localhost:9538/api/v1/notifications \
  -H "Authorization: Bearer $TOKEN" | jq
# → items[0].type == "MATCH_READY", status == "unread"
```

### 4-2. 안읽음 개수(폴링)
```bash
curl -s http://localhost:9538/api/v1/notifications/unread-count \
  -H "Authorization: Bearer $TOKEN" | jq
# → { "unreadCount": 1 }
```

### 4-3. 읽음 처리(멱등)
```bash
curl -s -X POST http://localhost:9538/api/v1/notifications/<id>/read \
  -H "Authorization: Bearer $TOKEN" | jq
# → status == "read". 동일 호출 반복해도 결과 동일(멱등).
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

## 6. 합격 기준 매핑

| 검증 | Success Criteria |
|---|---|
| 이벤트 후 인앱 표시 5초 내 | SC-01 |
| 긴급(SECURITY_ALERT) 1분 내 도달 | SC-02 |
| 설정 변경 즉시 반영 | SC-04 |
| 5분 내 동일 이벤트 1건으로 묶임 | SC-05 |

## 7. 트러블슈팅

- 이메일 미발송: `delivery_logs`에서 `result='failed'` 확인 → `MAIL_API_KEY`/연락처 유효성(EC-07) 점검
- 알림 미생성: `notificationEvents` 구독 등록 여부, `notification_outbox` pending 적재 확인
- 야간에 이메일 보류됨: 정상 동작(quiet hours). 긴급만 즉시 발송(FR-B4)
