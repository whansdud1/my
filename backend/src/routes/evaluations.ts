import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { ok, Errors } from '../lib/envelope.js';
import { submitEvaluation } from '../services/evaluation/peer.js';
import { recomputeRating } from '../services/evaluation/combine.js';
import { submitStarRatings } from '../services/evaluation/stars.js';
import * as PeerRatings from '../repositories/peerRatings.js';
import { getPool } from '../db/connection.js';

export const evaluationsRouter = Router();

// --- POST /projects/:id/evaluations ---
const submitSchema = z.object({
  items: z
    .array(
      z.object({
        ateeId: z.union([z.string(), z.number()]).transform((v) => Number(v)),
        contribution: z.number().int().min(1).max(5),
        communication: z.number().int().min(1).max(5),
        responsibility: z.number().int().min(1).max(5),
        satisfaction: z.number().int().min(1).max(5),
        comment: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(20),
});

evaluationsRouter.post(
  '/projects/:id/evaluations',
  requireAuth,
  validate({ body: submitSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const result = await submitEvaluation({
        projectId,
        evaluatorId: req.user!.id,
        items: req.body.items,
      });

      // 평가가 들어왔으니 PENDING → APPLIED 즉시 전환 (이상탐지는 US8에서 도입)
      await getPool().query(
        `UPDATE evaluations SET review_state = 'APPLIED'
            WHERE project_id = ? AND evaluator_id = ? AND review_state = 'PENDING'`,
        [projectId, req.user!.id],
      );

      // 영향받은 evaluatee 평점 재계산
      for (const it of req.body.items) {
        await recomputeRating(Number(it.ateeId));
      }

      res.status(201).json(ok({ inserted: result.inserted }));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects/:id/evaluations (본인 제출 이력) ---
evaluationsRouter.get('/projects/:id/evaluations', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const [rows] = (await getPool().query(
      `SELECT id, evaluatee_id, contribution, communication, responsibility, satisfaction,
              comment, review_state, submitted_at
         FROM evaluations
         WHERE project_id = ? AND evaluator_id = ?`,
      [projectId, req.user!.id],
    )) as unknown as [Array<{ id: number; evaluatee_id: number; contribution: number; communication: number; responsibility: number; satisfaction: number; comment: string | null; review_state: string; submitted_at: Date }>];
    res.json(
      ok(
        rows.map((r) => ({
          id: String(r.id),
          ateeId: String(r.evaluatee_id),
          contribution: r.contribution,
          communication: r.communication,
          responsibility: r.responsibility,
          satisfaction: r.satisfaction,
          comment: r.comment,
          reviewState: r.review_state,
          submittedAt: r.submitted_at.toISOString(),
        })),
      ),
    );
  } catch (e) {
    next(e);
  }
});

// --- GET /evaluations/pending ---
evaluationsRouter.get('/evaluations/pending', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    // 사용자가 ACCEPTED 였던 프로젝트 중 ends_at 이 있고 14일 이내, 아직 평가 제출 안 한 것
    const [rows] = (await getPool().query(
      `SELECT p.id AS pid, p.title, p.ends_at, p.status,
              EXISTS(SELECT 1 FROM evaluations e WHERE e.project_id = p.id AND e.evaluator_id = ?) AS submitted
         FROM projects p
         JOIN project_members pm ON pm.project_id = p.id
         WHERE pm.user_id = ? AND pm.state = 'ACCEPTED'
           AND p.status IN ('CLOSED','RUNNING')
           AND (p.ends_at IS NULL OR p.ends_at > DATE_SUB(NOW(3), INTERVAL 14 DAY))
         ORDER BY p.ends_at DESC LIMIT 50`,
      [req.user!.id, req.user!.id],
    )) as unknown as [Array<{ pid: number; title: string; ends_at: Date | null; status: string; submitted: number }>];
    res.json(
      ok(
        rows.map((r) => ({
          projectId: String(r.pid),
          projectTitle: r.title,
          endedAt: r.ends_at?.toISOString().slice(0, 10) ?? null,
          dueAt: r.ends_at ? new Date(r.ends_at.getTime() + 14 * 86400_000).toISOString().slice(0, 10) : null,
          submitted: Boolean(r.submitted),
        })),
      ),
    );
  } catch (e) {
    next(e);
  }
});

// --- POST /projects/:id/ratings (팀원 별점 평가, 0.5 단위) ---
const ratingsSchema = z.object({
  items: z
    .array(
      z.object({
        rateeId: z.union([z.string(), z.number()]).transform((v) => Number(v)),
        stars: z
          .number()
          .min(0.5)
          .max(5)
          .refine((n) => Number.isInteger(n * 2), '별점은 0.5 단위여야 합니다'),
        comment: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(20),
});

evaluationsRouter.post(
  '/projects/:id/ratings',
  requireAuth,
  validate({ body: ratingsSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const result = await submitStarRatings({
        projectId,
        raterId: req.user!.id,
        items: req.body.items,
      });
      res.status(201).json(ok(result));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects/:id/ratings/mine (내가 제출한 별점 — 폼 프리필) ---
evaluationsRouter.get('/projects/:id/ratings/mine', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const rows = await PeerRatings.listByRater(projectId, req.user!.id);
    res.json(
      ok(
        rows.map((r) => ({
          rateeId: String(r.ratee_id),
          stars: Number(r.stars),
          comment: r.comment,
        })),
      ),
    );
  } catch (e) {
    next(e);
  }
});

// --- GET /projects/:id/teammates (평가 폼용) ---
evaluationsRouter.get('/projects/:id/teammates', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const [rows] = (await getPool().query(
      `SELECT pm.user_id, pm.role, u.name
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ? AND pm.state = 'ACCEPTED' AND pm.user_id <> ?`,
      [projectId, req.user!.id],
    )) as unknown as [Array<{ user_id: number; role: string; name: string }>];
    res.json(ok(rows.map((r) => ({ userId: String(r.user_id), name: r.name, role: r.role }))));
  } catch (e) {
    next(e);
  }
});

// --- GET /users/:id/reviews — 종합 별점 + 익명 후기(평가자 정보 제외) ---
// 팀장이 지원자를 승인할지 판단할 때 해당 사용자의 평판을 본다.
evaluationsRouter.get('/users/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    const uid = Number(req.params.id);
    if (!Number.isFinite(uid)) throw Errors.Validation();
    const [[summary]] = (await getPool().query(
      `SELECT stars, evaluation_count FROM ratings WHERE user_id = ?`,
      [uid],
    )) as unknown as [Array<{ stars: string; evaluation_count: number } | undefined>];
    const reviews = await PeerRatings.listReviewsForRatee(uid, 50);
    res.json(
      ok({
        stars: summary ? Number(summary.stars) : 0,
        count: summary ? summary.evaluation_count : 0,
        reviews: reviews.map((r) => ({
          stars: Number(r.stars),
          comment: r.comment,
          ratedAt: r.updated_at.toISOString().slice(0, 10),
        })),
      }),
    );
  } catch (e) {
    next(e);
  }
});

// --- GET /users/:id/rating ---
evaluationsRouter.get('/users/:id/rating', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw Errors.Validation();
    const [[r]] = (await getPool().query(
      `SELECT stars, review_summary, evaluation_count FROM ratings WHERE user_id = ?`,
      [id],
    )) as unknown as [Array<{ stars: string; review_summary: string | null; evaluation_count: number } | undefined>];
    res.json(
      ok(
        r
          ? { stars: Number(r.stars), reviewSummary: r.review_summary, evaluationCount: r.evaluation_count }
          : { stars: 0, reviewSummary: null, evaluationCount: 0 },
      ),
    );
  } catch (e) {
    next(e);
  }
});
