import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

// 라우트에서 사용: router.post('/x', validate({ body: schema }), handler)
// 검증 실패 시 ZodError → errorHandler가 422 problem+json 으로 응답

export interface ValidateSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.assign(req.query as object, parsed);
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.assign(req.params as object, parsed);
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
