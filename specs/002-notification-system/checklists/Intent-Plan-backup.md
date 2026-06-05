# Intent - Plan

[웹스택] Vue.js + Node.js

# Vue.js + Node.js

현대적인 웹 개발 패턴을 따르는 풀스택 애플리케이션입니다. 프론트엔드와 백엔드가 분리된 구조로, REST API를 통해 데이터를 주고받습니다.

**프론트엔드**
- Vue.js 3 (v3.4+): Composition API 기반 컴포넌트
- TypeScript (v5.x): 정적 타입 지원
- Vite (v5.x): 빠른 개발 서버 및 빌드 도구
- Pinia (v2.x): 상태 관리

**백엔드**
- Node.js (v20 LTS): JavaScript 서버 런타임
- Express.js (v4.x): 웹 프레임워크
- TypeScript (v5.x): 타입 안전성
- mysql2 (v3.x): MariaDB 연결 드라이버

**데이터베이스 기술**
- MariaDB: MySQL 호환 관계형 DB
- mysql2 드라이버: Promise 기반 비동기 쿼리
- SQL 쿼리 기반 데이터 조작

※ 실제 연결 정보는 [데이터베이스 설정]을 참고하세요.

**개발환경/배포**
- Docker: 컨테이너 패키징
- Nginx: 리버스 프록시, HTTPS
- GitLab CI/CD: 자동화 배포

**빠른 시작**
```bash
# 프론트엔드
cd frontend && npm install && npm run dev

# 백엔드
cd backend && npm install && npm run dev
```

[웹스택] React + FastAPI

# React + FastAPI

현대적인 풀스택 조합입니다. React로 동적인 사용자 인터페이스를 구축하고, FastAPI로 고성능 백엔드 API를 개발합니다.

**프론트엔드**
- React 18: 동적 UI 구축
- TypeScript: 타입 안전성
- 풍부한 생태계 활용

**백엔드**
- FastAPI: 고성능 Python 웹 프레임워크
- Python 3.11: async/await 비동기 처리
- Pydantic: 강력한 데이터 검증
- Swagger 자동 문서화

**데이터베이스 기술**
- PostgreSQL 권장
- SQLAlchemy ORM 지원
- Pydantic 모델 검증

※ 실제 연결 정보는 [데이터베이스 설정]을 참고하세요.

**적합한 프로젝트**
- 데이터 처리 중심 애플리케이션
- 머신러닝 모델 서빙
- 복잡한 비동기 작업

**빠른 시작**
```bash
# Frontend
npx create-react-app frontend --template typescript
cd frontend && npm start

# Backend
pip install fastapi uvicorn
uvicorn main:app --reload
```

[웹스택] Django

# Django

배터리 포함 프레임워크입니다. 관리자 패널, 인증, ORM 등 웹 개발에 필요한 모든 것이 내장되어 있습니다.

**프론트엔드**
- Django 템플릿 또는 DRF + SPA
- Tailwind CSS: 스타일링

**백엔드**
- Django 5.0: 풀스택 Python 프레임워크
- Django REST Framework: API 개발
- 강력한 관리자 인터페이스 자동 생성
- 내장 사용자 인증 및 권한 시스템

**데이터베이스 기술**
- Django ORM: 직관적인 DB 작업
- 마이그레이션 자동 관리
- 다양한 DB 백엔드 지원

※ 실제 연결 정보는 [데이터베이스 설정]을 참고하세요.

**적합한 프로젝트**
- 콘텐츠 관리 시스템 (CMS)
- 빠른 MVP 개발
- 관리 기능이 중요한 내부 도구

**빠른 시작**
```bash
# 프로젝트 생성
pip install django djangorestframework
django-admin startproject mysite
cd mysite

# 개발 서버 실행
python manage.py migrate
python manage.py runserver
```

[웹스택] Next.js Full-Stack

# Next.js Full-Stack

단일 언어 개발 환경입니다. 프론트엔드와 백엔드 모두 TypeScript로 개발하여 타입 안전성을 유지합니다.

**프론트엔드**
- Next.js 14: React 기반 프레임워크
- TypeScript: End-to-End 타입 안전성
- Tailwind CSS: 유틸리티 기반 스타일링
- 서버 사이드 렌더링 (SSR) 지원

**백엔드**
- Next.js API Routes: 서버리스 API
- tRPC: End-to-End 타입 안전성
- Prisma ORM: 타입 안전 DB 클라이언트

**데이터베이스 기술**
- Prisma ORM: 타입 안전 DB 클라이언트
- 자동 마이그레이션 생성
- 다양한 DB 지원 (PostgreSQL, MySQL, SQLite)

※ 실제 연결 정보는 [데이터베이스 설정]을 참고하세요.

**적합한 프로젝트**
- SEO가 중요한 웹 서비스
- 빠른 개발 속도 필요
- TypeScript 전문 팀

**빠른 시작**
```bash
# Next.js 프로젝트 생성
npx create-next-app@latest myapp --typescript
cd myapp

# Prisma 설정
npm install prisma @prisma/client
npx prisma init
```

[데이터베이스 설정]

# 팀 데이터베이스 연결 정보

- DB 서버: MariaDB A

**외부 접속 정보** (권장)
- 호스트: mis.iptime.org
- 포트: 13306
- 사용자명: pioneer18
- 데이터베이스: pioneer18
- 비밀번호: pioneer26

**연결 예시 (Node.js mysql2)**
```javascript
const mysql = require('mysql2/promise');

const connection = await mysql.createConnection({
  host: 'mis.iptime.org',
  port: 13306,
  user: 'pioneer18',
  password: 'pioneer26',
  database: 'pioneer18'
});
```

**연결 예시 (터미널)**
```bash
mysql -h mis.iptime.org -P 13306 -u pioneer18 -ppioneer26 pioneer18
```

**내부 접속 정보** (서버 내부용)
- 호스트: 192.168.0.91
- 포트: 3306

⚠️ **주의: Homebrew mysql 바이너리 사용 금지!**
반드시 Docker 컨테이너를 통해 접속하세요:
```bash
# Docker 컨테이너 내부에서 실행
docker exec -it mariadb mysql -u pioneer18 -ppioneer26 pioneer18
```
