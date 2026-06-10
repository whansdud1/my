import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { ok, Errors } from '../lib/envelope.js';
import * as ModFlags from '../repositories/moderationFlags.js';
import * as PeerRatings from '../repositories/peerRatings.js';
import { recomputeStarRating } from '../services/evaluation/stars.js';
import { audit } from '../services/audit.js';

// 관리자 전용 — 평가 리뷰 악성 탐지 검토 큐(US8).
// 모든 라우트는 ADMIN 권한 필요.

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

// --- GET /admin/moderation/flags?state=pending ---
adminRouter.get('/admin/moderation/flags', async (req, res, next) => {
  try {
    const state = (req.query.state as string) ?? 'pending';
    const allowed = ['pending', 'kept', 'removed', 'all'];
    const s = (allowed.includes(state) ? state : 'pending') as 'pending' | 'kept' | 'removed' | 'all';
    const rows = await ModFlags.listFlags(s, 200);
    res.json(
      ok({
        pendingCount: await ModFlags.pendingCount(),
        flags: rows.map((r) => ({
          id: String(r.id),
          targetType: r.target_type,
          targetId: String(r.target_id),
          projectId: r.project_id ? String(r.project_id) : null,
          raterId: r.rater_id ? String(r.rater_id) : null,
          rateeId: r.ratee_id ? String(r.ratee_id) : null,
          kind: r.kind,
          severity: r.severity,
          score: r.score !== null ? Number(r.score) : null,
          snippet: r.snippet,
          detail: typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail,
          state: r.state,
          createdAt: r.created_at.toISOString(),
        })),
      }),
    );
  } catch (e) {
    next(e);
  }
});

// --- POST /admin/moderation/flags/:id/resolve { decision: 'keep' | 'remove' } ---
const resolveSchema = z.object({ decision: z.enum(['keep', 'remove']) });

adminRouter.post(
  '/admin/moderation/flags/:id/resolve',
  validate({ body: resolveSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      const flag = await ModFlags.findFlag(id);
      if (!flag) throw Errors.NotFound('검토 항목이 없습니다');
      if (flag.state !== 'pending') throw Errors.Conflict('이미 처리된 항목입니다');

      const decision = req.body.decision as 'keep' | 'remove';

      if (flag.target_type === 'peer_rating') {
        if (decision === 'keep') {
          // 문제 없음 → 코멘트 노출 복원(별점은 그대로). 이상치 플래그면 상태 변화 없음.
          if (flag.kind === 'TOXIC_TEXT') {
            await PeerRatings.setModState(flag.target_id, 'approved');
          }
        } else {
          // 악성 확정 → 차단(코멘트 제거 + 평균 제외), 피평가자 평점 재계산
          await PeerRatings.setModState(flag.target_id, 'blocked', flag.kind === 'TOXIC_TEXT');
          if (flag.ratee_id) await recomputeStarRating(flag.ratee_id);
        }
      }

      await ModFlags.resolveFlag(id, decision === 'keep' ? 'kept' : 'removed', req.user!.id);
      await audit({
        actorId: req.user!.id,
        action: decision === 'keep' ? 'MODERATION_KEEP' : 'MODERATION_REMOVE',
        targetType: 'moderation_flag',
        targetId: id,
        meta: { kind: flag.kind },
      });

      res.json(ok({ id: String(id), state: decision === 'keep' ? 'kept' : 'removed' }));
    } catch (e) {
      next(e);
    }
  },
);
