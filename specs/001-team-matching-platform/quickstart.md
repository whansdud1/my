# Quickstart: UniTeam 로컬 개발 환경 부팅

**Feature**: 001-team-matching-platform
**Date**: 2026-05-15

> 본 문서는 `frontend/`, `backend/` 가 아직 생성되기 전 단계에서도 사용할 수 있도록 절차를 정리한다. 코드 골격은 `/speckit.tasks` → `/speckit.implement` 단계에서 생성된다.

---

## 1. 사전 요구사항

- macOS / Linux / WSL2
- Docker Desktop 또는 OrbStack
- Node.js 20 LTS (`nvm install 20`)
- pnpm 또는 npm 10+
- (선택) Google/Zoom/Notion/Discord 개발자 계정 — 외부 연동 테스트 시
- 학과 MariaDB 접속 권한
  - 호스트: 외부 `mis.iptime.org:13306`, 내부 `192.168.0.91:3306`
  - 자격증명은 **`.env` 파일에 저장하고 절대 커밋하지 않는다.**

---

## 2. 디렉터리 생성(최초 1회)

```bash
cd /Users/pioneer18/mis2601
mkdir -p frontend backend infra/docker infra/ci
cp .env.example .env  # .env.example 은 backend 골격 생성 시 동봉
```

`.env` 예시:

```dotenv
# === DB ===
DB_HOST=mis.iptime.org
DB_PORT=13306
DB_USER=pioneer18
DB_PASSWORD=*****          # 실제 비밀번호를 환경변수로 주입
DB_NAME=pioneer18

# === Auth ===
JWT_ACCESS_SECRET=replace-me
JWT_REFRESH_SECRET=replace-me
ACCESS_TTL=15m
REFRESH_TTL=14d

# === OAuth (개발용 placeholder) ===
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# === Mail ===
MAIL_PROVIDER=ses
MAIL_FROM=no-reply@uniteam.example

# === Misc ===
# 로컬 개발
APP_BASE_URL=http://localhost:9518
API_BASE_URL=http://localhost:9538
# 프로덕션(Nginx 리버스 프록시 종단)
PUBLIC_BASE_URL=https://p18.sumzip.com
NODE_ENV=development
```

> **인프라 고정값** (절대 변경 금지)
> - Frontend 포트: **9518** (Vite dev / preview)
> - Backend 포트: **9538** (Express API)
> - 공개 도메인: **p18.sumzip.com** — Nginx가 `/` → frontend, `/api/*` → backend 로 프록시

---

## 3. DB 연결 확인

```bash
# Docker 내부 MariaDB 컨테이너 접속 (학과 서버 정책)
docker exec -it mariadb mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"

# 또는 외부에서 mysql2 클라이언트로
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
```

⚠️ Intent-Plan.md 의 안내대로 **Homebrew `mysql` 바이너리 직접 사용 금지**. Docker 컨테이너 또는 GUI 클라이언트 사용.

---

## 4. 백엔드 부팅(예정 구조)

`/speckit.tasks` 단계에서 다음 파일이 생성될 예정:

```
backend/
  package.json    # express, mysql2, knex, jsonwebtoken, pino, zod
  tsconfig.json
  src/index.ts
  src/db/migrations/001_init.ts ...
```

부팅 절차:

```bash
cd backend
npm install
npm run migrate    # knex migrate:latest
npm run seed       # 기본 시드(관리자·도메인 화이트리스트)
npm run dev        # ts-node-dev + 포트 9538
```

확인:

```bash
curl http://localhost:9538/api/v1/health
# → { "data": { "ok": true } }
```

---

## 5. 프론트엔드 부팅(예정 구조)

```
frontend/
  package.json   # vue@3, vite, pinia, vue-router, axios, vue-i18n(2차)
  vite.config.ts
  src/main.ts
```

```bash
cd frontend
npm install
npm run dev      # Vite, 포트 9518
```

브라우저: http://localhost:9518 (로컬) / https://p18.sumzip.com (프로덕션)

---

## 6. 골든 패스 수동 검증

`spec.md §2.1 Primary User Story` 를 끝까지 따라가 본다.

1. `POST /auth/signup` → 학생 가입(예: `student@uni.ac.kr`).
2. 메일함의 인증 링크 클릭 → `POST /auth/verify-email`.
3. `POST /auth/login` → 토큰 획득.
4. `PUT /users/me/availability` → 가용 시간 등록.
5. `POST /projects` → 공모전 프로젝트 생성.
6. `GET /projects/{id}/recommendations` → 추천 후보 목록 확인.
7. `POST /projects/{id}/invites` → 1~3명 초대.
8. (다른 계정으로) `POST /invites/{id}/respond` → 수락.
9. `GET /integrations/{provider}/oauth/start` → 협업 도구 연결.
10. (모의 데이터 시드) `POST /admin/seed/activities` → 활동 이벤트 주입.
11. `GET /projects/{id}/risk-signals` → 위험 신호 시각화 확인.
12. `POST /projects/{id}/evaluations` → 동료 평가 제출.
13. `GET /users/{id}/rating` → 평점 반영 확인.

---

## 7. 자동 테스트

```bash
# 백엔드
cd backend
npm test                  # Jest 단위
npm run test:contract     # OpenAPI 계약 테스트(dredd 또는 schemathesis)
npm run test:integration  # Testcontainers MariaDB + supertest

# 프론트엔드
cd frontend
npm test                  # Vitest

# E2E
cd e2e
npm run test              # Playwright (frontend·backend 동시 기동 필요)
```

---

## 8. Docker Compose (예정)

```bash
cd infra/docker
docker compose up -d
# 서비스: frontend(9518), backend(9538), nginx(80/443 → p18.sumzip.com), (필요 시 local mariadb)
```

---

## 9. 트러블슈팅

- **DB 연결 실패**: 학과 네트워크 외부에서 `mis.iptime.org:13306` 차단 여부 확인. VPN 필요할 수 있음.
- **OAuth redirect_uri mismatch**: 각 SaaS 콘솔에 로컬 `http://localhost:9538/api/v1/integrations/{provider}/oauth/callback` 및 프로덕션 `https://p18.sumzip.com/api/v1/integrations/{provider}/oauth/callback` 둘 다 등록.
- **이메일 미수신**: 개발 환경에선 `ethereal.email` 또는 MailHog 권장. `MAIL_PROVIDER=mailhog` 로 전환.
- **JWT 만료**: `ACCESS_TTL` 짧음. 리프레시 흐름 `POST /auth/refresh` 사용(추가 예정).

---

## 10. 다음 단계

1. CQ-01~03 확정 — `spec.md`, `plan.md`, `research.md` 갱신.
2. `/speckit.tasks` 로 의존성 정렬된 태스크 생성.
3. `/speckit.implement` 로 구현 착수.
