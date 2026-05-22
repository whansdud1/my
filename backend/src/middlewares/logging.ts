import type { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { nanoid } from 'nanoid';
import { logger } from '../lib/logger.js';

// X-Request-Id: 클라이언트가 제공하면 신뢰, 없으면 12자 nanoid 발급
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('X-Request-Id');
  const id = incoming && incoming.length <= 64 ? incoming : nanoid(12);
  (req as Request & { id: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id?: string }).id ?? nanoid(12),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
