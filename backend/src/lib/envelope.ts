// 표준 응답 envelope (T015 일부 — 라우트가 일관된 형태로 응답하도록 강제)
//
// 성공: { ok: true, data: <payload>, meta?: { ... } }
// 실패: RFC 7807 + 도메인 코드 — middlewares/error.ts 가 직접 생성

export interface OkEnvelope<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export function ok<T>(data: T, meta?: Record<string, unknown>): OkEnvelope<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

// 도메인 에러 코드 — 라우트/서비스에서 throw 시 에러 핸들러가 매핑
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const Errors = {
  Unauthorized: (msg = '인증이 필요합니다') => new DomainError('UNAUTHORIZED', 401, msg),
  Forbidden: (msg = '권한이 없습니다') => new DomainError('FORBIDDEN', 403, msg),
  NotFound: (msg = '리소스를 찾을 수 없습니다') => new DomainError('NOT_FOUND', 404, msg),
  Conflict: (msg = '리소스 충돌') => new DomainError('CONFLICT', 409, msg),
  Validation: (msg = '입력값이 올바르지 않습니다', details?: Record<string, unknown>) =>
    new DomainError('VALIDATION_FAILED', 422, msg, details),
  RateLimited: (msg = '요청이 너무 잦습니다') => new DomainError('RATE_LIMITED', 429, msg),
  Internal: (msg = '서버 오류') => new DomainError('INTERNAL', 500, msg),
};
