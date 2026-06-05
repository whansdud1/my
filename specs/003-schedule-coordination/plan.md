# Implementation Plan: 일정 조율·캘린더 (Schedule Coordination)

**Feature Branch**: `003-schedule-coordination`
**Created**: 2026-06-05
**Source Spec**: [spec.md](./spec.md)
**Status**: Draft (Phase 0–2 planned)

---

## 1. Summary

ACCEPTED 팀원의 주간 가용시간(`availabilities`)을 교집합 계산해 공통 회의 시간을 제안하고, 회의·마감·산출물 일정을 관리(RSVP 포함)하며, Google Calendar로 단방향 동기화하고, 002 알림 시스템으로 리마인더를 보낸다. 공통 시간 계산은 순수 함수(분 단위 비트 교집합)로 구현해 빠르고 테스트 가능하게 한다.

---

## 2. Technical Context

| 항목 | 결정 | 근거 |
|---|---|---|
| 스택 | 001/002와 동일 (TS5/Node20/Express4/MariaDB · Vue3/Vite/Pinia) | 일관성 |
| 공통 시간 계산 | 순수 함수 — 요일×분(0–1439) 가용 카운트 배열 교집합 | 결정적·단위 테스트 용이(SC-02) |
| 외부 캘린더 | `CalendarProvider` 어댑터 인터페이스 + GoogleAdapter(**스텁, WA**) | 002 이메일 어댑터 패턴, OAuth 키 부재 시 안전 |
| 리마인더 실행 | DB 일정 테이블 + 주기 워커(`jobs/scheduleReminderWorker`) → 002 `notify()` | 002 인프라 재사용 |
| 시간 저장 | UTC(DATETIME) 저장, 표시 시 사용자 타임존 변환 | FR-E1 |
| 인증/인가 | 기존 JWT + RBAC, 회의 생성은 프로젝트 owner | WA-03 |
| 테스트 | 공통 시간 계산 순수 함수 단위 테스트(러너 도입 시) | Test-First 지향 |

### 인프라 고정 설정 (절대 변경 금지)
| 항목 | 값 |
|---|---|
| Frontend 포트 | `9518` |
| Backend 포트 | `9538` |
| 공개 도메인 | `p18.sumzip.com` |

API는 `/api/v1` 하위 `/api/v1/projects/:id/schedule`, `/api/v1/schedule`, `/api/v1/calendar` 로 추가.

### 작업 가정 (Open Questions 확정 — spec §8)
- **WA-01 (Q1)**: 공통 시간 = 주간 반복 가용시간(`availabilities`)만. 단발성 입력은 2차.
- **WA-02 (Q2)**: 캘린더 **단방향**(UniTeam → Google). 외부 일정 읽기·충돌 표시는 2차.
- **WA-03 (Q3)**: 회의·일정 생성은 **팀장(owner)** 만. 팀원 권한 부여는 2차.
- **WA-04**: Google OAuth는 어댑터 인터페이스 + 스텁으로 구현(키 부재 환경 안전). 실제 동기화는 키 주입 시 활성.

---

## 3. Project Structure

```
specs/003-schedule-coordination/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/openapi.yaml
└── checklists/requirements.md

backend/src/
├── db/migrations/008_schedule.ts
├── repositories/schedule.ts
├── services/schedule/
│   ├── commonSlots.ts          (순수 함수 — 가용시간 교집합)
│   ├── scheduleService.ts      (일정 CRUD·RSVP·검증)
│   └── calendar/
│       ├── provider.ts         (인터페이스)
│       └── googleAdapter.ts    (스텁, WA-04)
├── jobs/scheduleReminderWorker.ts
└── routes/schedule.ts

frontend/src/
├── services/scheduleApi.ts
├── stores/scheduleStore.ts
├── pages/projects/Schedule.vue   (프로젝트 일정 탭)
└── components/CommonSlots.vue · MeetingForm.vue
```

---

## 4. Constitution Check

| 게이트 | 평가 | 비고 |
|---|---|---|
| Simplicity | PASS | 공통 시간 = 순수 함수, 외부 큐 없음, 워커는 002 패턴 재사용 |
| Library-first | PASS | 캘린더는 어댑터 인터페이스 |
| Test-First | PASS | commonSlots 순수 함수 단위 테스트 선행 가능 |
| Observability | PASS | 동기화·리마인더 로깅 |
| Versioning | PASS | `/api/v1`, knex 마이그레이션 008 |
| Security/Privacy | PASS | 캘린더 토큰 암호화 저장, 생성 권한 검증 |

**Gate 결과**: 통과.

---

## 5. Phase 0 — Research
산출물: [research.md](./research.md). 공통 시간 알고리즘, 타임존 처리, 캘린더 동기화 매핑, 리마인더 스케줄링, 반복 회의 모델.

## 6. Phase 1 — Design & Contracts
산출물: data-model.md, contracts/openapi.yaml, quickstart.md.

### 핵심 엔드포인트
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/projects/:id/schedule/common-slots` | 공통 시간 후보 |
| GET·POST | `/api/v1/projects/:id/schedule/events` | 일정 목록·생성 |
| PATCH·DELETE | `/api/v1/schedule/events/:eid` | 일정 변경·취소 |
| POST | `/api/v1/schedule/events/:eid/rsvp` | 참석 응답 |
| GET·PUT·DELETE | `/api/v1/calendar/connection` | 캘린더 연동 관리 |

## 7. Phase 2 — Task Decomposition Preview
1. 마이그레이션 008 + repository
2. commonSlots 순수 함수 (US1)
3. scheduleService + 일정/RSVP 라우트 (US2)
4. 캘린더 어댑터·연동 (US3)
5. 리마인더 워커 → 002 notify (US4)
6. FE: 일정 탭·공통시간·회의폼·RSVP·캘린더 설정

## 8. Risks & Mitigations
| 리스크 | 완화 |
|---|---|
| Google OAuth 키 부재 | 어댑터 스텁, 키 주입 시 활성(WA-04) |
| 타임존 오류 | UTC 저장 단일화, 표시만 변환 |
| 공통 시간 계산 성능 | 분 단위 카운트 배열 O(멤버×슬롯), 5인 <2s(SC-02) |
| 멤버 변동 시 일정 불일치 | RSVP 대상 동적 재계산(EC-06) |

## 9. Next Action
`/speckit.tasks` (자율 진행 중 — 이어서 tasks.md 생성).
