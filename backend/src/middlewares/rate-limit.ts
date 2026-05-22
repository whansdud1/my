import rateLimit from 'express-rate-limit';
import type { AuthedRequest } from './auth.js';

// FR-A8 / FR-B7: 인증 사용자 60/min, 익명 20/min — 동일 라우트에 적용
export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: (req) => ((req as AuthedRequest).user ? 60 : 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const u = (req as AuthedRequest).user;
    if (u) return `u:${u.id}`;
    return `ip:${req.ip ?? 'unknown'}`;
  },
  message: {
    type: 'about:blank',
    title: '요청이 너무 잦습니다',
    status: 429,
    code: 'RATE_LIMITED',
    detail: '잠시 후 다시 시도해주세요',
  },
});

// 인증 엔드포인트(/auth/*) — IP 기준 더 엄격 (10/min)
export const authRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `auth:${req.ip ?? 'unknown'}`,
  message: {
    type: 'about:blank',
    title: '인증 시도가 너무 많습니다',
    status: 429,
    code: 'RATE_LIMITED',
    detail: '잠시 후 다시 시도해주세요',
  },
});
