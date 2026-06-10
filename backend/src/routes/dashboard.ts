import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { ok } from '../lib/envelope.js';
import { getDashboard } from '../services/dashboard/dashboardService.js';

// 016 — 팀 활동 모니터링 + 만족도/효율 분석 대시보드(To-Be ④·⑥)
export const dashboardRouter = Router();

const query = z.object({ windowDays: z.coerce.number().int().min(1).max(90).optional().default(14) });

// --- GET /projects/:id/dashboard ---
dashboardRouter.get(
  '/projects/:id/dashboard',
  requireAuth,
  validate({ query }),
  async (req: AuthedRequest, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof query>;
      const data = await getDashboard(Number(req.params.id), req.user!.id, q.windowDays);
      res.json(ok(data));
    } catch (e) {
      next(e);
    }
  },
);
