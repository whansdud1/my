# Phase 1 Data Model: 알림 시스템

**Feature**: `002-notification-system` · **Date**: 2026-06-05 · DB: MariaDB

---

## 엔티티

### 1. `notifications`
개별 알림 인스턴스.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | CHAR(21) | PK (nanoid) | 알림 ID |
| recipient_id | CHAR(21) | FK users.id, NOT NULL, INDEX | 수신자 |
| type | VARCHAR(50) | NOT NULL, FK notification_types.code | 알림 종류 |
| priority | ENUM('critical','normal','info') | NOT NULL, default 'normal' | 우선순위 |
| title | VARCHAR(150) | NOT NULL | 제목 |
| body | VARCHAR(1000) | NOT NULL | 본문 |
| deep_link | VARCHAR(500) | NULL | 연결 대상 경로 |
| target_ref | VARCHAR(100) | NULL | 참조 객체(project/evaluation id) |
| dedup_key | CHAR(64) | INDEX | 중복 억제 키 |
| group_count | INT | default 1 | 묶음 횟수 |
| status | ENUM('unread','read','archived') | NOT NULL, default 'unread', INDEX | 상태 |
| created_at | DATETIME | NOT NULL, INDEX | 생성 시각 |
| read_at | DATETIME | NULL | 읽은 시각 |

- 인덱스: `(recipient_id, status, created_at)` 목록 조회, `(dedup_key, status)` 중복 검사.
- 상태 전이: `unread → read → archived`. archived는 보관 기간(기본 90일) 경과 시 워커가 일괄 처리(EC-05/FR-F1).

### 2. `notification_types`
알림 종류 정의(시드 데이터).

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| code | VARCHAR(50) | PK | 종류 코드 |
| default_priority | ENUM('critical','normal','info') | NOT NULL | 기본 우선순위 |
| default_audience | ENUM('individual','team_lead','team','admin') | NOT NULL | 기본 수신 대상 |
| is_mandatory | BOOLEAN | NOT NULL default false | 끌 수 없는 필수 알림(FR-C3) |

**초기 시드**:
| code | priority | audience | mandatory |
|---|---|---|---|
| MATCH_READY | normal | individual | false |
| TEAM_JOIN_REQUEST | normal | individual | false |
| TEAM_JOIN_RESULT | normal | individual | false |
| COLLAB_RISK | critical | team_lead | false |
| EVAL_REQUEST | normal | individual | false |
| EVAL_REMINDER | normal | individual | false |
| SCHEDULE_CHANGE | info | team | false |
| ADMIN_REVIEW | normal | admin | false |
| SECURITY_ALERT | critical | individual | **true** |
| SYSTEM_NOTICE | info | individual | false |

### 3. `notification_preferences`
사용자별·종류별 채널 수신 설정.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | CHAR(21) | PK | |
| user_id | CHAR(21) | FK users.id, NOT NULL | |
| type | VARCHAR(50) | FK notification_types.code, NOT NULL | |
| in_app | BOOLEAN | NOT NULL default true | 인앱 수신 |
| email | BOOLEAN | NOT NULL default true | 이메일 수신 |
| push | BOOLEAN | NOT NULL default false | 푸시 수신(WA-01) |

- UNIQUE `(user_id, type)`.
- 행 부재 시 `notification_types` 기본값 적용. 필수 종류(is_mandatory)는 설정과 무관히 전송.

### 4. `user_notification_settings`
사용자 전역 설정(방해 금지·야간).

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| user_id | CHAR(21) | PK, FK users.id | |
| dnd_enabled | BOOLEAN | default false | 방해 금지 |
| quiet_start | TIME | default '22:00' | 야간 시작 |
| quiet_end | TIME | default '08:00' | 야간 종료 |
| timezone | VARCHAR(50) | default 'Asia/Seoul' | 타임존 |

### 5. `notification_outbox`
채널별 전송 작업 큐.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | CHAR(21) | PK | |
| notification_id | CHAR(21) | FK notifications.id, NOT NULL | |
| channel | ENUM('in_app','email','push') | NOT NULL | |
| status | ENUM('pending','sent','failed') | default 'pending', INDEX | |
| attempt_count | INT | default 0 | |
| next_attempt_at | DATETIME | INDEX | 다음 시도 시각(백오프·quiet hours) |
| last_error | VARCHAR(500) | NULL | |

- 워커 조회 인덱스: `(status, next_attempt_at)`.

### 6. `delivery_logs`
전송 이력(운영 분석·SC 측정, FR-F2).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | CHAR(21) PK | |
| notification_id | CHAR(21) | |
| channel | ENUM | |
| result | ENUM('sent','failed','retried','suppressed') | |
| attempt_count | INT | |
| created_at | DATETIME | |

---

## 관계도(요약)

```
users 1───* notifications *───1 notification_types
users 1───* notification_preferences *───1 notification_types
users 1───1 user_notification_settings
notifications 1───* notification_outbox
notifications 1───* delivery_logs
```

## 검증 규칙

- `title` 1–150자, `body` 1–1000자.
- `priority='critical'` 알림은 quiet hours/DND 무시(FR-B4).
- `is_mandatory=true` 종류는 preferences로 비활성 불가(FR-C3).
- 채널 전송 전 수신자 연락처 유효성 검사 실패 시 해당 채널 `suppressed` 기록 + 인앱 안내(EC-07).
