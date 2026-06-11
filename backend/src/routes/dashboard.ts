import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { requirePremium } from '../middlewares/premium.js';
import { ok, Errors } from '../lib/envelope.js';
import { getDashboard } from '../services/dashboard/dashboardService.js';
import { generateInsights } from '../services/insights/index.js';
import * as Projects from '../repositories/projects.js';
import * as Members from '../repositories/projectMembers.js';

// 016 — 팀 활동 모니터링 + 만족도/효율 분석 대시보드(To-Be ④·⑥)
export const dashboardRouter = Router();

const query = z.object({ windowDays: z.coerce.number().int().min(1).max(90).optional().default(14) });

// 팀원(팀장 또는 ACCEPTED 멤버)만 접근 보장
async function assertMember(projectId: number, userId: number): Promise<void> {
  const project = await Projects.findById(projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');
  if (project.owner_id === userId) return;
  const m = await Members.findOne(projectId, userId);
  if (!m || m.state !== 'ACCEPTED') throw Errors.Forbidden('팀원만 볼 수 있습니다');
}

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

// --- GET /projects/:id/insights — 프리미엄: AI 협업 분석 인사이트(실행 가능한 추천) ---
dashboardRouter.get(
  '/projects/:id/insights',
  requireAuth,
  requirePremium,
  validate({ query }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const q = req.query as unknown as z.infer<typeof query>;
      await assertMember(projectId, req.user!.id);
      res.json(ok(await generateInsights(projectId, q.windowDays)));
    } catch (e) {
      next(e);
    }
  },
);
