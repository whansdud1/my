import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { ok } from '../lib/envelope.js';
import { audit } from '../services/audit.js';
import * as Sub from '../services/subscription/index.js';

// 프리미엄 구독 — 모의 결제(월 4,900원 / 30일 갱신).
export const subscriptionRouter = Router();

// --- GET /subscription — 내 구독 상태 ---
subscriptionRouter.get('/subscription', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(ok(await Sub.getStatus(req.user!.id)));
  } catch (e) {
    next(e);
  }
});

// --- POST /subscription/subscribe — 구독하기(모의 결제) ---
subscriptionRouter.post('/subscription/subscribe', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const status = await Sub.subscribe(req.user!.id);
    await audit({
      actorId: req.user!.id,
      action: 'SUBSCRIPTION_SUBSCRIBE',
      targetType: 'subscription',
      targetId: req.user!.id,
      meta: { priceKrw: Sub.PRICE_KRW, periodDays: Sub.PERIOD_DAYS },
    });
    res.json(ok(status));
  } catch (e) {
    next(e);
  }
});

// --- POST /subscription/cancel — 해지(예약) ---
subscriptionRouter.post('/subscription/cancel', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const status = await Sub.cancel(req.user!.id);
    await audit({
      actorId: req.user!.id,
      action: 'SUBSCRIPTION_CANCEL',
      targetType: 'subscription',
      targetId: req.user!.id,
    });
    res.json(ok(status));
  } catch (e) {
    next(e);
  }
});
