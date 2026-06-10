// 002-notification-system — T022
// 계약 테스트: GET/PUT /notifications/preferences + 필수 종류 비활성 거부(FR-C3 → 422).
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { type Express } from 'express';
import request from 'supertest';
import { Errors } from '../../src/lib/envelope.js';
import { errorHandler } from '../../src/middlewares/error.js';

const bundleFor = jest.fn<(u: number) => Promise<unknown>>();
const updateBundle = jest.fn<(u: number, p: unknown, g: unknown) => Promise<void>>();

jest.unstable_mockModule('../../src/services/notification/preferences.js', () => ({ bundleFor, updateBundle }));
// 라우트가 repo 를 직접 import 하므로(다른 핸들러용) 빈 모킹 제공
jest.unstable_mockModule('../../src/repositories/notifications.js', () => ({}));
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

const sampleBundle = {
  preferences: [
    { type: 'SYSTEM', inApp: true, email: true, push: false, mandatory: true },
    { type: 'MATCH_READY', inApp: true, email: false, push: false, mandatory: false },
  ],
  global: { dndEnabled: false, quietStart: '22:00', quietEnd: '08:00', timezone: 'Asia/Seoul' },
};

const validBody = {
  preferences: [{ type: 'MATCH_READY', inApp: true, email: false, push: false }],
  global: { dndEnabled: true, quietStart: '23:00', quietEnd: '07:00', timezone: 'Asia/Seoul' },
};

let app: Express;
beforeEach(() => {
  app = buildApp();
});

describe('GET /notifications/preferences', () => {
  it('사용자 설정 번들을 200으로 반환한다', async () => {
    bundleFor.mockResolvedValue(sampleBundle);
    const res = await request(app).get('/api/v1/notifications/preferences').set('x-uid', '1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(sampleBundle);
    expect(bundleFor).toHaveBeenCalledWith(1);
  });

  it('인증 없으면 401', async () => {
    const res = await request(app).get('/api/v1/notifications/preferences');
    expect(res.status).toBe(401);
  });
});

describe('PUT /notifications/preferences', () => {
  it('갱신 후 최신 번들을 200으로 반환한다', async () => {
    updateBundle.mockResolvedValue(undefined);
    bundleFor.mockResolvedValue(sampleBundle);

    const res = await request(app).put('/api/v1/notifications/preferences').set('x-uid', '1').send(validBody);
    expect(res.status).toBe(200);
    expect(updateBundle).toHaveBeenCalledWith(1, validBody.preferences, validBody.global);
    expect(res.body.data).toEqual(sampleBundle);
  });

  it('필수 종류 비활성 시도(MANDATORY_PREF)는 422 VALIDATION_FAILED 로 매핑된다', async () => {
    const err = new Error('필수 알림(SYSTEM)은 비활성화할 수 없습니다') as Error & { code?: string };
    err.code = 'MANDATORY_PREF';
    updateBundle.mockRejectedValue(err);

    const res = await request(app).put('/api/v1/notifications/preferences').set('x-uid', '1').send(validBody);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.detail).toContain('SYSTEM');
  });

  it('quietStart 형식이 HH:MM 이 아니면 422(스키마 검증)', async () => {
    const bad = { ...validBody, global: { ...validBody.global, quietStart: '9시' } };
    const res = await request(app).put('/api/v1/notifications/preferences').set('x-uid', '1').send(bad);
    expect(res.status).toBe(422);
    expect(updateBundle).not.toHaveBeenCalled();
  });
});
