# Quickstart: 일정 조율·캘린더

**Feature**: `003-schedule-coordination` · BE `9538` / FE `9518`

## 1. 마이그레이션
```bash
cd backend
npm run migrate   # 008_schedule: schedule_events / event_rsvps / calendar_connections / calendar_sync_map
```

## 2. 서버 기동
```bash
cd backend && npm run dev      # 리마인더 워커 포함
cd frontend && npm run dev
```
> Google Calendar 동기화: `GOOGLE_CLIENT_ID/SECRET` 부재 시 어댑터는 스텁(로그만) 동작(WA-04).

## 3. 핵심 흐름 검증
### 3-1. 공통 시간 후보
```bash
curl -s "http://localhost:9538/api/v1/projects/<pid>/schedule/common-slots" \
  -H "Authorization: Bearer $TOKEN" | jq
# → slots[]: { weekday, startMin, endMin, availableCount, totalMembers } (겹침 인원·길이순)
```
### 3-2. 회의 생성(팀장)
```bash
curl -s -X POST "http://localhost:9538/api/v1/projects/<pid>/schedule/events" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"MEETING","title":"킥오프","startsAt":"2026-06-10T11:00:00Z","endsAt":"2026-06-10T12:00:00Z"}' | jq
# → 201 + 팀원에게 SCHEDULE_CHANGE 알림(002)
```
### 3-3. RSVP
```bash
curl -s -X POST "http://localhost:9538/api/v1/schedule/events/<eid>/rsvp" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"response":"ATTEND"}' | jq
```

## 4. UI (http://localhost:9518)
- 프로젝트 상세 → **일정 탭**: 공통 시간 후보 → 회의 생성, 일정 목록·RSVP, 캘린더 연동 토글.

## 5. 합격 기준 매핑
| 검증 | SC |
|---|---|
| 공통 시간 후보 2초 내 표시(5인) | SC-02 |
| 회의 생성→알림→RSVP | SC-01 |
| 리마인더 발송(회의 1h 전) | SC-05 |

## 6. 트러블슈팅
- 공통 슬롯 비어있음: 팀원 `availabilities` 미입력(EC-03) 또는 전원 겹침 없음(EC-01 → 차선 후보 표기 확인)
- 캘린더 미반영: `GOOGLE_CLIENT_ID` 미설정 시 정상(스텁). `calendar_connections.sync_state` 확인
- 리마인더 미발송: `reminder_sent_at` 이미 set(멱등) 또는 워커 미기동
