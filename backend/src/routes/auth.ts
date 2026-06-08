import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { authRateLimit } from '../middlewares/rate-limit.js';
import { ok } from '../lib/envelope.js';
import * as AuthSvc from '../services/auth/index.js';
import { rotateRefresh } from '../services/auth/tokens.js';
import { config } from '../config.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'uniteam_rt';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.env === 'production',
  path: '/api/v1/auth',
  maxAge: 14 * 24 * 60 * 60 * 1000,
};

// --- POST /auth/signup ---
const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  name: z.string().min(2).max(50),
  consents: z.array(z.enum(['TOS', 'PRIVACY', 'COLLAB_METADATA', 'MARKETING', 'BODY_NLP'])).min(1),
});

authRouter.post(
  '/auth/signup',
  authRateLimit,
  validate({ body: signupSchema }),
  async (req, res, next) => {
    try {
      const result = await AuthSvc.signup({ ...req.body, ip: req.ip });
      // 이메일 인증 제거 — 가입 즉시 활성화되므로 userId만 반환.
      res.status(201).json(ok({ userId: String(result.userId) }));
    } catch (e) {
      next(e);
    }
  },
);

// --- POST /auth/login ---
const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(72),
});

authRouter.post(
  '/auth/login',
  authRateLimit,
  validate({ body: loginSchema }),
  async (req, res, next) => {
    try {
      const result = await AuthSvc.login({
        email: req.body.email,
        password: req.body.password,
        userAgent: req.header('User-Agent') ?? undefined,
        ip: req.ip,
      });
      res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTS);
      res.json(ok({ accessToken: result.accessToken, user: result.user }));
    } catch (e) {
      next(e);
    }
  },
);

// --- POST /auth/refresh — refresh 토큰 회전 ---
authRouter.post('/auth/refresh', async (req, res, next) => {
  try {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!raw) {
      res.status(401).json({ code: 'UNAUTHORIZED', title: 'no refresh cookie', status: 401 });
      return;
    }
    const rotated = await rotateRefresh(raw);
    res.cookie(REFRESH_COOKIE, rotated.refreshToken, REFRESH_COOKIE_OPTS);
    res.json(
      ok({
        accessToken: rotated.accessToken,
        user: {
          id: String(rotated.user.id),
          email: rotated.user.email,
          role: rotated.user.role,
        },
      }),
    );
  } catch (e) {
    next(e);
  }
});

// --- POST /auth/logout ---
authRouter.post('/auth/logout', async (req, res, next) => {
  try {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await AuthSvc.logout(raw);
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTS);
    res.json(ok({ loggedOut: true }));
  } catch (e) {
    next(e);
  }
});
