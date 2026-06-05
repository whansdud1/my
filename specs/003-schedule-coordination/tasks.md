# Tasks: 일정 조율·캘린더 (Schedule Coordination)

**Feature Branch**: `003-schedule-coordination`
**Source**: plan.md · spec.md · data-model.md · contracts/openapi.yaml
**Stack**: TS5/Node20/Express4/MariaDB · Vue3/Vite/Pinia · BE 9538 / FE 9518

## 규칙
- `[P]` = 다른 파일이라 병렬 가능. 각 US는 독립 테스트 가능 증분.

---

## Phase 1: Setup
- [X] **T001** [P] `backend/src/domain/schedule.ts` 도메인 타입 (ScheduleEvent, Rsvp, CommonSlot, CalendarConnection)
- [X] **T002** `.env.example`에 `GOOGLE_CLIENT_ID/SECRET`, `SCHEDULE_REMINDER_INTERVAL_MS=60000`, `SCHEDULE_REPEAT_MAX_WEEKS=8` 추가

## Phase 2: Foundational
- [X] **T003** `backend/src/db/migrations/008_schedule.ts` — schedule_events / event_rsvps / calendar_connections / calendar_sync_map + 인덱스
- [X] **T004** `backend/src/repositories/schedule.ts` — 일정 CRUD·RSVP·리마인더 스캔·sync_map·connection
- [X] **T005** `backend/src/routes/schedule.ts` 라우터 + `/api/v1` 마운트

**Checkpoint**: 마이그레이션 적용, 빈 라우터 인증 응답.

---

## Phase 3: US1 (P1) — 공통 시간 계산 [MVP 핵심]
**독립 테스트**: 팀원 가용시간으로 공통 슬롯이 겹침 인원·길이순 산출, 전원 불가 시 차선.
- [X] **T006** [P] [US1] `backend/src/services/schedule/commonSlots.ts` — 순수 함수(요일×분 카운트 교집합, 최소길이 필터, 정렬, 차선)
- [X] **T007** [US1] common-slots 엔드포인트 + repository에서 멤버 availabilities 조회
- [X] **T008** [P] [US1] `frontend/src/services/scheduleApi.ts` + `stores/scheduleStore.ts`
- [X] **T009** [P] [US1] `frontend/src/components/CommonSlots.vue` — 후보 표시(겹침 인원 배지)

**Checkpoint**: 공통 시간 후보 조회 동작.

---

## Phase 4: US2 (P2) — 회의·일정 관리 + RSVP
**독립 테스트**: 팀장이 회의 생성→팀원 알림→RSVP 집계; 과거 시각 거부; 팀원 생성 시 403.
- [X] **T010** [US2] `backend/src/services/schedule/scheduleService.ts` — 생성(권한·과거시각·반복전개)·변경·취소·RSVP
- [X] **T011** [US2] events GET/POST, events/:eid PATCH/DELETE, rsvp POST 라우트 연결
- [X] **T012** [US2] 생성/변경/취소 시 002 `notify('SCHEDULE_CHANGE', { projectId, ... })` 연동
- [X] **T013** [P] [US2] `frontend/src/components/MeetingForm.vue` + `pages/projects/Schedule.vue` (일정 탭·목록·RSVP)
- [X] **T014** [US2] 프로젝트 상세에 일정 탭 라우트/링크 연결

**Checkpoint**: 회의 생성·RSVP·알림 동작.

---

## Phase 5: US3 (P3) — Google Calendar 동기화
**독립 테스트**: 연동 켠 사용자의 회의가 calendar_sync_map에 매핑(스텁 환경은 로그); 토큰 만료 시 EXPIRED.
- [X] **T015** [US3] `backend/src/services/schedule/calendar/provider.ts` 인터페이스 + `googleAdapter.ts`(키 있으면 활성, 없으면 스텁, WA-04)
- [X] **T016** [US3] calendar/connection GET/PUT/DELETE 라우트 + connection repository
- [X] **T017** [US3] 일정 생성/변경/취소 시 연동 사용자 캘린더 upsert/delete + sync_map 갱신(EC-04 만료 처리)
- [X] **T018** [P] [US3] FE 캘린더 연동 토글 (Schedule.vue 내)

**Checkpoint**: 연동 상태 관리·동기화 매핑 동작(스텁).

---

## Phase 6: US4 (P4) — 리마인더 워커
**독립 테스트**: 리마인더 시점 도래 일정에 1회 notify, reminder_sent_at 멱등.
- [X] **T019** [US4] `backend/src/jobs/scheduleReminderWorker.ts` — 주기 스캔 → 002 notify → reminder_sent_at set
- [X] **T020** [US4] server.ts에 워커 기동/종료 연결

**Checkpoint**: 리마인더 자동 발송.

---

## Phase 7: Polish
- [X] **T021** [P] commonSlots 단위 테스트(jest ESM) — 교집합·차선·최소길이·정렬·dedup·경계 (10케이스 통과)
- [X] **T022** [P] quickstart 실측 검증 — migrate(tsx) 멱등 OK, BE/FE 기동·엔드포인트 확인
- [X] **T023** [P] OpenAPI `/api/v1` Error 스키마를 RFC7807 problem+json(type/title/status/code/detail/instance/details)으로 통일

## 의존성
```
Setup(T001-2) → Foundational(T003-5) ─┬ US1(T006-9) [MVP]
                                      ├ US2(T010-14) [US1 위]
                                      ├ US3(T015-18) [US2 위]
                                      └ US4(T019-20) [US2 위]
                                            → Polish(T021-23)
```

## 미확정(WA)
- WA-01 주간 가용만 / WA-02 단방향 동기화 / WA-03 회의생성 팀장만 / WA-04 Google 어댑터 스텁.
