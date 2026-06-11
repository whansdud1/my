import type { Response, NextFunction } from 'express';
import { type AuthedRequest } from './auth.js';
import { Errors } from '../lib/envelope.js';
import { isPremium } from '../services/subscription/index.js';

// 프리미엄 전용 기능 게이트. requireAuth 뒤에 사용한다.
// 비구독자는 402 PAYMENT_REQUIRED → 프론트가 업그레이드 안내를 띄운다.
export async function requirePremium(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw Errors.Unauthorized();
    if (!(await isPremium(req.user.id))) {
      throw Errors.PaymentRequired('프리미엄 구독자만 이용할 수 있는 기능입니다');
    }
    next();
  } catch (e) {
    next(e);
  }
}
