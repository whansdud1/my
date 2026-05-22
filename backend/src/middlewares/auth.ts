import type { Request, Response, NextFunction } from 'express';
import { verifyAccess, type AccessPayload } from '../services/auth/tokens.js';
import { Errors } from '../lib/envelope.js';

export interface AuthedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: AccessPayload['role'];
  };
}

// 필수 인증 — 토큰 없거나 만료면 401
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(Errors.Unauthorized());
  }
  const token = header.slice(7).trim();
  try {
    const payload = verifyAccess(token);
    req.user = { id: Number(payload.sub), email: payload.email, role: payload.role };
    next();
  } catch (e) {
    next(e);
  }
}

// 선택 인증 — 토큰 있으면 검증, 없어도 진행
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) return next();
  const token = header.slice(7).trim();
  try {
    const payload = verifyAccess(token);
    req.user = { id: Number(payload.sub), email: payload.email, role: payload.role };
  } catch {
    /* 무시 — 만료된 토큰이어도 익명 진행 */
  }
  next();
}
