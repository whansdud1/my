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
      res.status(201).json(
        ok({
          userId: String(result.userId),
          // 운영에서는 verifyUrl 노출하지 않음(메일로만). 개발 편의로 dev에서만 포함.
          ...(config.env !== 'production' ? { verifyUrl: result.verifyUrl } : {}),
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

// --- POST /auth/verify-email ---
const verifySchema = z.object({ token: z.string().min(10).max(128) });
authRouter.post(
  '/auth/verify-email',
  authRateLimit,
  validate({ body: verifySchema }),
  async (req, res, next) => {
    try {
      const result = await AuthSvc.verifyEmail(req.body.token);
      res.json(ok({ userId: String(result.userId), verified: true }));
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
    if (!raw) return res.status(401).json({ code: 'UNAUTHORIZED', title: 'no refresh cookie', status: 401 });
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
