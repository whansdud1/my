# Phase 1 Data Model: 일정 조율·캘린더

**Feature**: `003-schedule-coordination` · DB: MariaDB · ID: BIGINT UNSIGNED (001 컨벤션)

## 1. `schedule_events`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT UNSIGNED | PK | |
| project_id | BIGINT UNSIGNED | FK projects, NOT NULL, INDEX | |
| type | ENUM('MEETING','DEADLINE','MILESTONE') | NOT NULL | 일정 유형 |
| title | VARCHAR(150) | NOT NULL | |
| description | VARCHAR(1000) | NULL | |
| starts_at | DATETIME(3) | NOT NULL, INDEX | UTC |
| ends_at | DATETIME(3) | NULL | UTC(MEETING) |
| created_by | BIGINT UNSIGNED | FK users | 생성자(팀장) |
| recurrence_group_id | CHAR(21) | NULL, INDEX | 반복 회의 묶음 |
| reminder_offset_min | INT | NOT NULL DEFAULT 60 | 리마인더 N분 전 |
| reminder_sent_at | DATETIME(3) | NULL | 리마인더 발송 멱등 |
| status | ENUM('SCHEDULED','CANCELLED') | NOT NULL DEFAULT 'SCHEDULED' | |
| created_at | DATETIME(3) | DEFAULT NOW(3) | |

- 인덱스: `(project_id, starts_at)`, `(status, reminder_sent_at, starts_at)` 워커 스캔.
- 검증: `starts_at > now`(생성 시), `ends_at > starts_at`.

## 2. `event_rsvps`
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | BIGINT UNSIGNED | PK |
| event_id | BIGINT UNSIGNED | FK schedule_events ON DELETE CASCADE |
| user_id | BIGINT UNSIGNED | FK users |
| response | ENUM('ATTEND','DECLINE','PENDING') | DEFAULT 'PENDING' |
| responded_at | DATETIME(3) | NULL |
| | | UNIQUE(event_id, user_id) |

## 3. `calendar_connections`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| user_id | BIGINT UNSIGNED | PK | |
| provider | ENUM('GOOGLE') | NOT NULL DEFAULT 'GOOGLE' | |
| access_token_enc | VARBINARY(1024) | NULL | 암호화 저장 |
| refresh_token_enc | VARBINARY(1024) | NULL | |
| expires_at | DATETIME(3) | NULL | |
| sync_state | ENUM('ACTIVE','EXPIRED','DISCONNECTED') | DEFAULT 'ACTIVE' | EC-04 |
| connected_at | DATETIME(3) | DEFAULT NOW(3) | |

## 4. `calendar_sync_map`
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | BIGINT UNSIGNED | PK |
| schedule_event_id | BIGINT UNSIGNED | FK schedule_events ON DELETE CASCADE |
| user_id | BIGINT UNSIGNED | FK users |
| external_event_id | VARCHAR(255) | NOT NULL |
| last_synced_at | DATETIME(3) | DEFAULT NOW(3) |
| | | UNIQUE(schedule_event_id, user_id) |

## 비영속: CommonSlot (계산 결과)
`{ weekday, startMin, endMin, availableCount, totalMembers }` — `availabilities` 교집합 산출, DB 저장 안 함.

## 관계
```
projects 1─* schedule_events 1─* event_rsvps
schedule_events 1─* calendar_sync_map
users 1─1 calendar_connections
users(availabilities) ──계산──▶ CommonSlot
```
