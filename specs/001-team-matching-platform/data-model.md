# Data Model: 대학생 팀 매칭 플랫폼

**Feature**: 001-team-matching-platform
**DBMS**: MariaDB (utf8mb4_general_ci, InnoDB)
**Status**: Initial (Phase 1)

> 모든 PK 는 `BIGINT UNSIGNED AUTO_INCREMENT`. 시간 컬럼은 `DATETIME(3)` UTC, 표시는 클라이언트가 변환. 모든 테이블은 `created_at`, `updated_at` 보유.

---

## 1. ERD 개요

```
users ──< project_members >── projects
  │            │                  │
  │            │                  ├──< matching_recommendations
  │            │                  ├──< collaboration_activities
  │            │                  └──< evaluations >── anomaly_flags
  │
  ├──< availabilities
  ├──< collab_integrations
  ├──< ai_scores
  ├──< ratings (1:1)
  ├──< subscriptions (1:1)
  ├──< notifications
  ├──< audit_logs (관리자/시스템)
  └──< consents

partnerships ──< partnership_members >── users (선택)
```

---

## 2. 테이블 정의

### 2.1 `users`

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|---|---|---|---|---|
| id | BIGINT UNSIGNED PK | N | AI | |
| email | VARCHAR(255) UNIQUE | N | | 가입 이메일 |
| email_domain | VARCHAR(63) | N | | `email` 의 도메인(`.ac.kr` 검증용) |
| email_verified_at | DATETIME(3) | Y | NULL | 인증 완료 시각 |
| password_hash | VARCHAR(255) | N | | bcrypt |
| name | VARCHAR(50) | N | | 표시명 |
| gender | ENUM('M','F','OTHER','UNSPEC') | N | 'UNSPEC' | |
| grade | TINYINT UNSIGNED | Y | NULL | 1~6 |
| department | VARCHAR(100) | Y | NULL | 학과 |
| university | VARCHAR(100) | Y | NULL | 대학 |
| preferred_roles | JSON | N | '[]' | 다중 선택 |
| collaboration_style | JSON | N | '{}' | 설문 결과(키-값) |
| self_intro | TEXT | Y | NULL | |
| role_user | ENUM('STUDENT','PROFESSOR','ADMIN') | N | 'STUDENT' | RBAC |
| trust_score | DECIMAL(4,2) | N | 50.00 | 0~100 |
| status | ENUM('ACTIVE','SUSPENDED','DELETED') | N | 'ACTIVE' | |
| deleted_at | DATETIME(3) | Y | NULL | 소프트 삭제 |
| created_at | DATETIME(3) | N | CURRENT_TIMESTAMP(3) | |
| updated_at | DATETIME(3) | N | CURRENT_TIMESTAMP(3) ON UPDATE | |

- **INDEX**: `(email_domain)`, `(department, grade)`, `(role_user)`, `(status)`.
- **검증**: 이메일 도메인 화이트리스트(시스템 설정 테이블 `domain_whitelist`).

### 2.2 `availabilities`

사용자별 요일·시간 가용 슬롯.

| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| id | BIGINT PK | N | |
| user_id | BIGINT FK→users | N | CASCADE |
| weekday | TINYINT | N | 0=일~6=토 |
| start_min | SMALLINT UNSIGNED | N | 0~1439 |
| end_min | SMALLINT UNSIGNED | N | 0~1439, > start_min |
| pref_night | BOOLEAN | N | 0/1, 야간 선호 표식 |

- **INDEX**: `(user_id, weekday)`.

### 2.3 `collab_integrations`

사용자별 외부 도구 연동 토큰(암호화 저장).

| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| id | BIGINT PK | | |
| user_id | BIGINT FK→users | N | CASCADE |
| provider | ENUM('ZOOM','DISCORD','NOTION','GOOGLE') | N | |
| access_token_enc | VARBINARY(2048) | N | KMS 또는 AES-256-GCM |
| refresh_token_enc | VARBINARY(2048) | Y | |
| scope | VARCHAR(255) | N | 부여 스코프 |
| expires_at | DATETIME(3) | Y | |
| revoked_at | DATETIME(3) | Y | |

- **UNIQUE**: `(user_id, provider)`.

### 2.4 `projects`

| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| id | BIGINT PK | | |
| owner_id | BIGINT FK→users | N | 등록자 |
| title | VARCHAR(150) | N | |
| description | TEXT | Y | |
| type | ENUM('CONTEST','CLASS','SELF') | N | |
| required_roles | JSON | N | `[{role,count}]` |
| target_size | TINYINT UNSIGNED | N | 모집 인원 |
| starts_at | DATETIME(3) | Y | |
| ends_at | DATETIME(3) | Y | |
| work_time_pref | ENUM('DAY','NIGHT','ANY') | N | 'ANY' |
| status | ENUM('RECRUIT','RUNNING','CLOSED','ARCHIVED') | N | 'RECRUIT' |

- **INDEX**: `(status, starts_at)`, `(type)`, `(owner_id)`.

### 2.5 `project_members`

| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| id | BIGINT PK | | |
| project_id | BIGINT FK→projects | N | CASCADE |
| user_id | BIGINT FK→users | N | CASCADE |
| role | VARCHAR(40) | N | 역할 명 |
| state | ENUM('INVITED','ACCEPTED','LEFT','REJECTED') | N | 'INVITED' |
| joined_at | DATETIME(3) | Y | |

- **UNIQUE**: `(project_id, user_id)`.
- **INDEX**: `(user_id, state)`.

### 2.6 `matching_recommendations`

추천 결과 캐시(7일 TTL → archive).

| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| id | BIGINT PK | | |
| project_id | BIGINT FK→projects | N | CASCADE |
| candidate_id | BIGINT FK→users | N | |
| score | DECIMAL(5,2) | N | 0~100 |
| score_breakdown | JSON | N | 가중치별 분해 |
| generated_at | DATETIME(3) | N | DEFAULT CURRENT_TIMESTAMP(3) |
| expires_at | DATETIME(3) | N | generated_at + 7d |

- **INDEX**: `(project_id, score DESC)`, `(expires_at)`.

### 2.7 `collaboration_activities`

외부 도구에서 수집한 이벤트(이벤트 소싱).

| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| id | BIGINT PK | | |
| project_id | BIGINT FK→projects | N | |
| user_id | BIGINT FK→users | N | |
| provider | ENUM(ZOOM/DISCORD/NOTION/GOOGLE/MANUAL) | N | |
| activity_type | ENUM('MEETING_JOIN','UPLOAD','MESSAGE_RESP','DEADLINE_MET','DEADLINE_MISS') | N | |
| occurred_at | DATETIME(3) | N | |
| meta | JSON | Y | 도구별 보조 정보(본문 미저장) |

- **INDEX**: `(project_id, occurred_at)`, `(user_id, occurred_at)`.
- **파티션**: `RANGE (TO_DAYS(occurred_at))` — 월 단위.

### 2.8 `evaluations`

| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| id | BIGINT PK | | |
| project_id | BIGINT FK→projects | N | |
| evaluator_id | BIGINT FK→users | N | 시스템 내부 식별, UI 비공개 |
| evaluatee_id | BIGINT FK→users | N | |
| contribution | TINYINT UNSIGNED | N | 1~5 |
| communication | TINYINT UNSIGNED | N | 1~5 |
| responsibility | TINYINT UNSIGNED | N | 1~5 |
| satisfaction | TINYINT UNSIGNED | N | 1~5 |
| comment | TEXT | Y | 자유 코멘트 |
| review_state | ENUM('PENDING','APPLIED','HOLD','REJECTED') | N | 'PENDING' |
| submitted_at | DATETIME(3) | N | |

- **UNIQUE**: `(project_id, evaluator_id, evaluatee_id)`.
- **INDEX**: `(evaluatee_id, submitted_at)`, `(evaluator_id, submitted_at)`.

### 2.9 `ai_scores`

| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| id | BIGINT PK | | |
| user_id | BIGINT FK→users | N | |
| project_id | BIGINT FK→projects | N | |
| meeting_rate | DECIMAL(5,2) | N | 0~100 |
| upload_rate | DECIMAL(5,2) | N | |
| deadline_rate | DECIMAL(5,2) | N | |
| response_score | DECIMAL(5,2) | N | |
| completion_score | DECIMAL(5,2) | N | |
| total | DECIMAL(4,2) | N | 0~5 |
| calculated_at | DATETIME(3) | N | |

- **UNIQUE**: `(user_id, project_id)`.

### 2.10 `ratings` (1:1 with users)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| user_id | BIGINT PK FK→users | |
| stars | DECIMAL(3,2) | 0.00~5.00 |
| review_summary | TEXT | AI 요약 |
| evaluation_count | INT UNSIGNED | 누적 |
| updated_at | DATETIME(3) | |

### 2.11 `anomaly_flags`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGINT PK | |
| evaluation_id | BIGINT FK→evaluations | CASCADE |
| signal_type | ENUM('PAIR_BIAS','ACTIVITY_GAP','BURST_LOW') | |
| severity | ENUM('LOW','MEDIUM','HIGH') | |
| state | ENUM('OPEN','REVIEWING','RESOLVED') | |
| reviewer_id | BIGINT FK→users | NULL |
| resolution | TEXT | NULL |
| created_at | DATETIME(3) | |

### 2.12 `subscriptions` (1:1)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| user_id | BIGINT PK FK→users | |
| tier | ENUM('FREE','PREMIUM') | DEFAULT 'FREE' |
| started_at | DATETIME(3) | |
| ends_at | DATETIME(3) | |
| billing_state | ENUM('NONE','ACTIVE','PAST_DUE','CANCELED') | |
| pg_provider | VARCHAR(40) | |
| pg_subscription_id | VARCHAR(100) | |

### 2.13 `partnerships` / `partnership_members`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGINT PK | |
| org_name | VARCHAR(150) | 학교/기관명 |
| scope | JSON | 계약 범위 |
| state | ENUM('DRAFT','ACTIVE','EXPIRED') | |
| starts_at / ends_at | DATETIME(3) | |

`partnership_members(partnership_id, user_id)` 다대다.

### 2.14 `notifications`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK→users | |
| type | VARCHAR(40) | INVITE/RISK/EVAL/ADMIN |
| body | JSON | |
| sent_at | DATETIME(3) | |
| read_at | DATETIME(3) | NULL |

### 2.15 `consents`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK→users | |
| consent_type | ENUM('TOS','PRIVACY','COLLAB_METADATA','MARKETING','BODY_NLP') | |
| version | VARCHAR(20) | |
| accepted_at | DATETIME(3) | |
| revoked_at | DATETIME(3) | NULL |

### 2.16 `audit_logs`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGINT PK | |
| actor_id | BIGINT FK→users | NULL=시스템 |
| action | VARCHAR(80) | EVAL_SUBMIT, DSR_DELETE, ADMIN_SANCTION… |
| target_type | VARCHAR(40) | |
| target_id | BIGINT | |
| ip | VARBINARY(16) | IPv6 |
| meta | JSON | |
| occurred_at | DATETIME(3) | |

---

## 3. 상태 전이

### Project.status

```
RECRUIT ──(팀 확정)──► RUNNING ──(마감/평가완료)──► CLOSED ──(보관)──► ARCHIVED
RECRUIT ──(취소)──► ARCHIVED
```

### ProjectMember.state

```
INVITED ──(수락)──► ACCEPTED ──(중도이탈)──► LEFT
INVITED ──(거절)──► REJECTED
```

### Evaluation.review_state

```
PENDING ──(이상 탐지 없음/검토 승인)──► APPLIED
PENDING ──(이상 탐지)──► HOLD ──(관리자 승인)──► APPLIED
                          └──(반려)──► REJECTED
```

### Subscription.billing_state

```
NONE ──(결제 시작)──► ACTIVE ──(결제실패)──► PAST_DUE ──(해지)──► CANCELED
```

---

## 4. 비즈니스 규칙 / 트리거

- **R1**: `project_members.state='ACCEPTED'` 의 카운트 ≤ `projects.target_size`.
- **R2**: 동일 사용자가 동시 `state IN ('INVITED','ACCEPTED')` 인 프로젝트가 **3건 초과**이면 신규 INVITE 불가(spec FR-B6).
- **R3**: `evaluations` 의 `evaluator_id == evaluatee_id` 금지(자기 평가 불가).
- **R4**: `evaluations.submitted_at` 은 `projects.ends_at + 14d` 이내여야 함(spec FR-E5).
- **R5**: `consents.consent_type IN ('TOS','PRIVACY')` 동의 없는 사용자는 status='SUSPENDED'.
- **R6**: 데이터 삭제 요청 처리 시 `users.status='DELETED'`, PII 컬럼 NULL/익명화, `evaluations` 는 익명 통계 보존(spec FR-J4).

---

## 5. 인덱스·성능

- 추천 핫패스: `matching_recommendations(project_id, score DESC)`.
- 위험 신호 집계: `collaboration_activities(project_id, occurred_at)` 파티션.
- 평가 집계: `evaluations(evaluatee_id)` 커버링 인덱스 + 집계 캐시 테이블 `user_eval_summary` 권장.

---

## 6. 마이그레이션·시드

- `001_init.sql`: users/availabilities/collab_integrations/projects/project_members.
- `002_matching.sql`: matching_recommendations.
- `003_collaboration.sql`: collaboration_activities + 파티션.
- `004_evaluation.sql`: evaluations/ai_scores/ratings/anomaly_flags.
- `005_subscription.sql`: subscriptions/partnerships.
- `006_admin.sql`: notifications/consents/audit_logs.
- 시드: 도메인 화이트리스트, 기본 협업 스타일 설문 12문항, 관리자 1계정.
