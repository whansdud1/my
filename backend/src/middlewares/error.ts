import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';

// 404 fallback — 라우터 어느 곳에서도 매칭되지 않은 경우
export function notFound(req: Request, res: Response): void {
  res.status(404).type('application/problem+json').json({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    code: 'NOT_FOUND',
    detail: `${req.method} ${req.path} 경로가 없습니다`,
    instance: (req as Request & { id?: string }).id,
  });
}

// 글로벌 에러 핸들러 — RFC 7807 problem+json + 도메인 code
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const id = (req as Request & { id?: string }).id;

  if (err instanceof DomainError) {
    res
      .status(err.httpStatus)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: err.message,
        status: err.httpStatus,
        code: err.code,
        detail: err.message,
        instance: id,
        ...(err.details ? { details: err.details } : {}),
      });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).type('application/problem+json').json({
      type: 'about:blank',
      title: '입력값이 올바르지 않습니다',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: '요청 스키마 검증 실패',
      instance: id,
      details: err.flatten(),
    });
    return;
  }

  logger.error({ err, reqId: id }, 'unhandled error');
  res.status(500).type('application/problem+json').json({
    type: 'about:blank',
    title: '서버 오류',
    status: 500,
    code: 'INTERNAL',
    detail: '예기치 못한 오류가 발생했습니다',
    instance: id,
  });
}
