// 002-notification-system — T011
// 계약 테스트: POST /notifications/:id/read (멱등) · POST /notifications/read-all.
// notificationsRouter 만 격리 마운트하고 auth·repo 를 모킹한다(DB 불필요).
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { type Express } from 'express';
import request from 'supertest';
import { Errors } from '../../src/lib/envelope.js';
import { errorHandler } from '../../src/middlewares/error.js';

// --- repo 모킹 ---
const markRead = jest.fn<(u: number, id: number) => Promise<unknown>>();
const markAllRead = jest.fn<(u: number) => Promise<number>>();
const unreadCount = jest.fn<(u: number) => Promise<number>>();
const listForUser = jest.fn<() => Promise<unknown[]>>();

jest.unstable_mockModule('../../src/repositories/notifications.js', () => ({
  markRead,
  markAllRead,
  unreadCount,
  listForUser,
}));

// --- auth 모킹: x-uid 헤더가 있으면 그 사용자로 주입, 없으면 401 ---
jest.unstable_mockModule('../../src/middlewares/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const uid = req.header('x-uid');
    if (!uid) return next(Errors.Unauthorized());
    (req as express.Request & { user: unknown }).user = { id: Number(uid), email: 't@e.st', role: 'STUDENT' };
    next();
  },
  optionalAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

const { notificationsRouter } = await import('../../src/routes/notifications.js');

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', notificationsRouter);
  app.use(errorHandler);
  return app;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  recipient_id: 1,
  type: 'MATCH_READY',
  priority: 'NORMAL',
  title: '새 매칭 후보',
  body: '후보 3명 도착',
  deep_link: '/projects/12',
  target_ref: 'project:12',
  dedup_key: null,
  group_count: 1,
  status: 'READ',
  created_at: new Date('2026-06-01T00:00:00.000Z'),
  read_at: new Date('2026-06-01T01:00:00.000Z'),
  ...over,
});

let app: Express;
beforeEach(() => {
  app = buildApp();
});

describe('POST /notifications/:id/read', () => {
  it('읽음 처리 후 직렬화된 알림(status=read)을 200으로 반환한다', async () => {
    markRead.mockResolvedValue(row());
    const res = await request(app).post('/api/v1/notifications/7/read').set('x-uid', '1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ id: '7', status: 'read', priority: 'normal' });
    expect(markRead).toHaveBeenCalledWith(1, 7);
  });

  it('멱등: 이미 읽은 알림을 다시 호출해도 200/동일 결과(서버 상태 변화 없음)', async () => {
    markRead.mockResolvedValue(row()); // 이미 READ 상태를 반환
    const first = await request(app).post('/api/v1/notifications/7/read').set('x-uid', '1');
    const second = await request(app).post('/api/v1/notifications/7/read').set('x-uid', '1');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
  });

  it('존재하지 않거나 타인 알림이면 404', async () => {
    markRead.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/notifications/999/read').set('x-uid', '1');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('id 가 숫자가 아니면 422', async () => {
    const res = await request(app).post('/api/v1/notifications/abc/read').set('x-uid', '1');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(markRead).not.toHaveBeenCalled();
  });

  it('인증 없으면 401', async () => {
    const res = await request(app).post('/api/v1/notifications/7/read');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /notifications/read-all', () => {
  it('갱신된 개수를 200으로 반환한다', async () => {
    markAllRead.mockResolvedValue(5);
    const res = await request(app).post('/api/v1/notifications/read-all').set('x-uid', '1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 5 });
    expect(markAllRead).toHaveBeenCalledWith(1);
  });

  it('멱등: 읽을 게 없으면 updated=0', async () => {
    markAllRead.mockResolvedValue(0);
    const res = await request(app).post('/api/v1/notifications/read-all').set('x-uid', '1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 0 });
  });
});
