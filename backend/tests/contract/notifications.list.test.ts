// 002-notification-system — T010
// 계약 테스트: GET /notifications (목록·커서·필터) · GET /notifications/unread-count.
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { type Express } from 'express';
import request from 'supertest';
import { Errors } from '../../src/lib/envelope.js';
import { errorHandler } from '../../src/middlewares/error.js';

const listForUser = jest.fn<(u: number, opts: { status?: string; cursor?: number; limit: number }) => Promise<unknown[]>>();
const unreadCount = jest.fn<(u: number) => Promise<number>>();

jest.unstable_mockModule('../../src/repositories/notifications.js', () => ({ listForUser, unreadCount }));
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

const row = (id: number) => ({
  id,
  recipient_id: 1,
  type: 'MATCH_READY',
  priority: 'NORMAL',
  title: `알림 ${id}`,
  body: '본문',
  deep_link: null,
  target_ref: null,
  dedup_key: null,
  group_count: 1,
  status: 'UNREAD',
  created_at: new Date('2026-06-01T00:00:00.000Z'),
  read_at: null,
});

let app: Express;
beforeEach(() => {
  app = buildApp();
  unreadCount.mockResolvedValue(2);
});

describe('GET /notifications', () => {
  it('목록·unreadCount 를 직렬화하고, 결과가 limit 미만이면 nextCursor=null', async () => {
    listForUser.mockResolvedValue([row(10), row(9)]);
    const res = await request(app).get('/api/v1/notifications').set('x-uid', '1');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({ id: '10', status: 'unread', priority: 'normal', createdAt: '2026-06-01T00:00:00.000Z' });
    expect(res.body.data.unreadCount).toBe(2);
    expect(res.body.data.nextCursor).toBeNull();
  });

  it('결과 수가 limit 과 같으면 마지막 id 를 nextCursor 로 돌려준다', async () => {
    listForUser.mockResolvedValue([row(10), row(9)]);
    const res = await request(app).get('/api/v1/notifications?limit=2').set('x-uid', '1');
    expect(res.body.data.nextCursor).toBe('9');
  });

  it('status=unread 필터는 repo 에 UNREAD 로 매핑되어 전달된다', async () => {
    listForUser.mockResolvedValue([]);
    await request(app).get('/api/v1/notifications?status=unread&cursor=100&limit=10').set('x-uid', '1');
    expect(listForUser).toHaveBeenCalledWith(1, { status: 'UNREAD', cursor: 100, limit: 10 });
  });

  it('limit 이 범위를 벗어나면(>50) 422', async () => {
    const res = await request(app).get('/api/v1/notifications?limit=999').set('x-uid', '1');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('인증 없으면 401', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

describe('GET /notifications/unread-count', () => {
  it('unreadCount 를 200으로 반환한다', async () => {
    unreadCount.mockResolvedValue(7);
    const res = await request(app).get('/api/v1/notifications/unread-count').set('x-uid', '1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ unreadCount: 7 });
    expect(unreadCount).toHaveBeenCalledWith(1);
  });
});
