import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { ok, Errors } from '../lib/envelope.js';
import * as Users from '../repositories/users.js';
import * as Availabilities from '../repositories/availabilities.js';
import * as Consents from '../repositories/consents.js';
import * as Subscriptions from '../repositories/subscriptions.js';
import { getPool } from '../db/connection.js';
import { audit } from '../services/audit.js';

export const usersRouter = Router();

function projectMe(u: Users.UserRow) {
  return {
    id: String(u.id),
    email: u.email,
    name: u.name,
    role: u.role_user,
    emailVerified: !!u.email_verified_at,
    gender: u.gender,
    grade: u.grade,
    department: u.department,
    university: u.university,
    preferredRoles: u.preferred_roles ?? [],
    collaborationStyle: u.collaboration_style ?? {},
    selfIntro: u.self_intro,
    trustScore: Number(u.trust_score),
    status: u.status,
  };
}

// --- GET /users/me ---
usersRouter.get('/users/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await Users.findById(req.user!.id);
    if (!user) throw Errors.NotFound();
    const premium = await Subscriptions.isPremium(req.user!.id);
    res.json(ok({ ...projectMe(user), premium }));
  } catch (e) {
    next(e);
  }
});

// --- PATCH /users/me ---
const patchSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  gender: z.enum(['M', 'F', 'OTHER', 'UNSPEC']).optional(),
  grade: z.number().int().min(1).max(8).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  university: z.string().max(100).nullable().optional(),
  preferredRoles: z.array(z.string().max(40)).max(20).optional(),
  selfIntro: z.string().max(1000).nullable().optional(),
});

usersRouter.patch(
  '/users/me',
  requireAuth,
  validate({ body: patchSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      await Users.updateProfile(req.user!.id, req.body);
      const user = await Users.findById(req.user!.id);
      await audit({ actorId: req.user!.id, action: 'USER_UPDATE', targetType: 'user', targetId: req.user!.id });
      res.json(ok(projectMe(user!)));
    } catch (e) {
      next(e);
    }
  },
);

// --- DELETE /users/me (DSR 큐 위임) ---
usersRouter.delete('/users/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await getPool().query(
      `INSERT INTO dsr_requests (user_id, request_type, due_at) VALUES (?, 'DELETE', ?)`,
      [req.user!.id, due],
    );
    await audit({ actorId: req.user!.id, action: 'DSR_DELETE_REQUEST', targetId: req.user!.id });
    res.json(ok({ queued: true, slaDays: 30 }));
  } catch (e) {
    next(e);
  }
});

// --- PUT /users/me/availability ---
const availSchema = z.object({
  // 프론트(GET 응답과 동일)는 dayOfWeek 로 전송한다.
  slots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(1).max(24),
      }),
    )
    .max(7 * 24),
  nightPreferred: z.boolean().default(false),
});

usersRouter.put(
  '/users/me/availability',
  requireAuth,
  validate({ body: availSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const slots = (req.body.slots as Array<{ dayOfWeek: number; startHour: number; endHour: number }>).map(
        (s) => ({
          weekday: s.dayOfWeek,
          startMin: s.startHour * 60,
          endMin: s.endHour * 60,
          prefNight: req.body.nightPreferred as boolean,
        }),
      );
      for (const s of slots) {
        if (s.endMin <= s.startMin) throw Errors.Validation('종료가 시작보다 같거나 작습니다');
      }
      await Availabilities.bulkReplace(req.user!.id, slots);
      res.json(ok({ count: slots.length }));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /users/me/availability ---
usersRouter.get('/users/me/availability', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const slotsRaw = await Availabilities.listByUser(req.user!.id);
    const slots = slotsRaw.map((s) => ({
      dayOfWeek: s.weekday,
      startHour: Math.floor(s.startMin / 60),
      endHour: Math.ceil(s.endMin / 60),
    }));
    const nightPreferred = slotsRaw.some((s) => s.prefNight);
    res.json(ok({ slots, nightPreferred }));
  } catch (e) {
    next(e);
  }
});

// --- POST /users/me/survey ---
const surveySchema = z.object({
  answers: z.array(z.number().int().min(1).max(5)).length(12),
});
usersRouter.post(
  '/users/me/survey',
  requireAuth,
  validate({ body: surveySchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const answers = req.body.answers as number[];
      // 12문항을 4개 축(평균)으로 압축 — matching/style 가중치 계산용
      const axes = {
        planning: avg([answers[0]!, answers[5]!, answers[8]!]),
        communication: avg([answers[1]!, answers[7]!, answers[9]!]),
        adaptability: avg([answers[4]!, answers[6]!, answers[10]!]),
        rigor: avg([answers[2]!, answers[3]!, answers[11]!]),
      };
      await Users.updateProfile(req.user!.id, { collaborationStyle: { axes, raw: answers } });
      res.json(ok({ axes }));
    } catch (e) {
      next(e);
    }
  },
);

function avg(arr: number[]): number {
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

// --- GET /users/:id (공개 프로필) ---
usersRouter.get('/users/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw Errors.Validation('잘못된 사용자 id');
    const u = await Users.findById(id);
    if (!u || u.status === 'DELETED') throw Errors.NotFound();
    const [[rating]] = (await getPool().query(
      `SELECT stars, review_summary, evaluation_count FROM ratings WHERE user_id = ?`,
      [id],
    )) as unknown as [Array<{ stars: string; review_summary: string | null; evaluation_count: number }>];
    res.json(
      ok({
        id: String(u.id),
        name: u.name,
        grade: u.grade,
        department: u.department,
        preferredRoles: u.preferred_roles,
        rating: rating
          ? {
              stars: Number(rating.stars),
              reviewSummary: rating.review_summary,
              evaluationCount: rating.evaluation_count,
            }
          : { stars: 0, reviewSummary: null, evaluationCount: 0 },
      }),
    );
  } catch (e) {
    next(e);
  }
});

// --- GET /users/me/consents / DELETE :type ---
usersRouter.get('/users/me/consents', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const rows = await Consents.listByUser(req.user!.id);
    res.json(ok({ items: rows }));
  } catch (e) {
    next(e);
  }
});
