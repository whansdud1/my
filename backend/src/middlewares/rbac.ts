import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from './auth.js';
import { Errors } from '../lib/envelope.js';
import type { AccessPayload } from '../services/auth/tokens.js';

type Role = AccessPayload['role'];

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(Errors.Unauthorized());
    if (!roles.includes(req.user.role)) return next(Errors.Forbidden(`필요 권한: ${roles.join(', ')}`));
    next();
  };
}

// 객체 수준 가드 — 라우트 핸들러 내부에서 호출
// 예: assertOwner(project.ownerId, req.user.id)
export function assertOwner(ownerId: number, actorId: number | undefined, actorRole?: Role): void {
  if (actorRole === 'ADMIN') return;
  if (!actorId || ownerId !== actorId) throw Errors.Forbidden('해당 리소스의 소유자만 수행할 수 있습니다');
}

// 본인 또는 관리자만 허용 (예: PATCH /users/:id)
export function assertSelfOrAdmin(targetId: number, actorId: number | undefined, actorRole?: Role): void {
  if (actorRole === 'ADMIN') return;
  if (!actorId || targetId !== actorId) throw Errors.Forbidden('본인만 접근할 수 있습니다');
}
