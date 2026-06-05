# Phase 0 Research: 일정 조율·캘린더

**Feature**: `003-schedule-coordination` · **Date**: 2026-06-05

## R-01. 공통 시간 계산 알고리즘
- **Decision**: 요일별 1440분 카운트 배열을 만들어, 각 멤버의 가용 슬롯을 +1 누적. 카운트가 멤버 수와 같은 연속 구간 = 전원 공통 슬롯. 최소 길이(30분) 필터 후 (인원, 길이) 순 정렬. 전원 슬롯이 없으면 최대 카운트 구간을 차선 제시.
- **Rationale**: 순수 함수·결정적·O(멤버×슬롯)로 5인 <2초(SC-02). 단위 테스트 용이.
- **Alternatives**: 인터벌 스위프라인(복잡), DB 집계 쿼리(테스트 어려움) — 기각.

## R-02. 타임존 처리
- **Decision**: 일정 시각은 UTC DATETIME 저장. `availabilities`는 사용자 로컬 주간 패턴이므로 사용자 타임존 기준으로 해석. 표시는 클라이언트가 사용자 타임존으로 변환.
- **Rationale**: 단일 진실 원천(UTC), 표시 책임만 분리(FR-E1/EC-02).
- **Alternatives**: 로컬 저장 — DST·이동 시 모호 → 기각.

## R-03. 캘린더 동기화 매핑
- **Decision**: `calendar_sync_map`(scheduleEventId, userId, externalEventId)로 내부 일정 ↔ 외부 이벤트 1:1 추적. 생성/수정/삭제를 외부에 반영(단방향, WA-02). 토큰 만료 시 sync 보류 + 재연동 안내(EC-04).
- **Rationale**: 멱등 업서트·삭제 추적 가능.
- **Alternatives**: 매핑 없이 매번 재생성 — 중복 발생 → 기각.

## R-04. 리마인더 스케줄링
- **Decision**: 일정 테이블에 `starts_at` 보유. 워커가 주기(기본 60초)로 "리마인더 시점 도래 & 미발송" 일정을 스캔해 002 `notify('EVAL_REMINDER'... 아님 SCHEDULE)` 호출. 발송 여부는 `reminder_sent_at`으로 멱등 보장.
- **Rationale**: 002 알림 인프라 재사용, 별도 스케줄러 불필요.
- **Alternatives**: cron 외부 스케줄러 — 운영 복잡 → 기각.

## R-05. 반복 회의 모델
- **Decision**: 1차는 생성 시 N주(기본 8주) 인스턴스를 펼쳐 개별 ScheduleEvent 행으로 저장(`recurrence_group_id` 공유). 개별 회차 취소 가능(EC-08).
- **Rationale**: 조회·RSVP·동기화가 단순(각 회차가 독립 행).
- **Alternatives**: RRULE 가상 전개 — 구현 복잡, 1차 과잉 → 기각.

## R-06. Google Calendar 어댑터
- **Decision**: `CalendarProvider` 인터페이스(upsertEvent/deleteEvent). GoogleAdapter는 OAuth 키(`GOOGLE_CLIENT_ID/SECRET`) 존재 시 활성, 없으면 스텁(로그만). 002 이메일 어댑터와 동일 패턴.
- **Rationale**: 키 부재 개발 환경에서 안전, 운영 시 키 주입으로 활성(WA-04).

## 미해결(클라리파이 이관)
- WA-01~04 (plan §2). 특히 WA-02 동기화 방향은 양방향 요구 시 설계 확장 필요.
