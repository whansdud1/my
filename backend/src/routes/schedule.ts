import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { ok } from '../lib/envelope.js';
import * as repo from '../repositories/schedule.js';
import { computeCommonSlots } from '../services/schedule/commonSlots.js';
import { optimizeMeetings } from '../services/schedule/optimize.js';
import { requirePremium } from '../middlewares/premium.js';
import * as svc from '../services/schedule/scheduleService.js';

// 003-schedule-coordination — T005/T007/T011/T016
export const scheduleRouter = Router();

function serializeEvent(e: repo.ScheduleEventRow, rsvps: Array<{ user_id: number; name: string; response: string }>) {
  return {
    id: String(e.id),
    projectId: String(e.project_id),
    type: e.type,
    title: e.title,
    description: e.description,
    startsAt: e.starts_at.toISOString(),
    endsAt: e.ends_at ? e.ends_at.toISOString() : null,
    status: e.status,
    rsvps: rsvps.map((r) => ({ userId: String(r.user_id), name: r.name, response: r.response })),
  };
}

// --- GET /projects/:id/schedule/common-slots ---
const slotsQuery = z.object({ minMinutes: z.coerce.number().int().min(15).max(480).optional().default(30) });
scheduleRouter.get(
  '/projects/:id/schedule/common-slots',
  requireAuth,
  validate({ query: slotsQuery }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const q = req.query as unknown as z.infer<typeof slotsQuery>;
      const [avail, total] = await Promise.all([
        repo.memberAvailabilities(projectId),
        repo.memberCount(projectId),
      ]);
      const slots = computeCommonSlots(
        avail.map((a) => ({ userId: a.user_id, weekday: a.weekday, startMin: a.start_min, endMin: a.end_min })),
        total,
        q.minMinutes,
      );
      res.json(ok({ totalMembers: total, slots }));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects/:id/schedule/optimize — 프리미엄: AI 일정 최적화(최적 회의시간 추천) ---
const optimizeQuery = z.object({
  durationMin: z.coerce.number().int().min(30).max(240).optional().default(60),
});
scheduleRouter.get(
  '/projects/:id/schedule/optimize',
  requireAuth,
  requirePremium,
  validate({ query: optimizeQuery }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const q = req.query as unknown as z.infer<typeof optimizeQuery>;
      res.json(ok(await optimizeMeetings(projectId, q.durationMin)));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects/:id/schedule/events ---
scheduleRouter.get('/projects/:id/schedule/events', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const events = await repo.listEvents(projectId);
    const out = [];
    for (const e of events) out.push(serializeEvent(e, await repo.listRsvps(e.id)));
    res.json(ok(out));
  } catch (e) {
    next(e);
  }
});

// --- POST /projects/:id/schedule/events ---
const createSchema = z.object({
  type: z.enum(['MEETING', 'DEADLINE', 'MILESTONE']),
  title: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  reminderOffsetMin: z.number().int().min(0).max(10080).optional(),
  repeatWeeks: z.number().int().min(0).max(52).optional(),
});
scheduleRouter.post(
  '/projects/:id/schedule/events',
  requireAuth,
  validate({ body: createSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const b = req.body as z.infer<typeof createSchema>;
      const ids = await svc.createEvent({
        projectId,
        actorId: req.user!.id,
        type: b.type,
        title: b.title,
        description: b.description,
        startsAt: new Date(b.startsAt),
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
        reminderOffsetMin: b.reminderOffsetMin,
        repeatWeeks: b.repeatWeeks,
      });
      const ev = await repo.findEvent(ids[0]!);
      res.status(201).json(ok(serializeEvent(ev!, await repo.listRsvps(ids[0]!))));
    } catch (e) {
      next(e);
    }
  },
);

// --- PATCH /schedule/events/:eid ---
const updateSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});
scheduleRouter.patch(
  '/schedule/events/:eid',
  requireAuth,
  validate({ body: updateSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const eid = Number(req.params.eid);
      const b = req.body as z.infer<typeof updateSchema>;
      await svc.updateEvent(eid, req.user!.id, {
        title: b.title,
        startsAt: b.startsAt ? new Date(b.startsAt) : undefined,
        endsAt: b.endsAt === undefined ? undefined : b.endsAt ? new Date(b.endsAt) : null,
      });
      const ev = await repo.findEvent(eid);
      res.json(ok(serializeEvent(ev!, await repo.listRsvps(eid))));
    } catch (e) {
      next(e);
    }
  },
);

// --- DELETE /schedule/events/:eid ---
scheduleRouter.delete('/schedule/events/:eid', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await svc.cancelEvent(Number(req.params.eid), req.user!.id);
    res.json(ok({ cancelled: true }));
  } catch (e) {
    next(e);
  }
});

// --- POST /schedule/events/:eid/rsvp ---
const rsvpSchema = z.object({ response: z.enum(['ATTEND', 'DECLINE']) });
scheduleRouter.post(
  '/schedule/events/:eid/rsvp',
  requireAuth,
  validate({ body: rsvpSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const eid = Number(req.params.eid);
      await svc.respondRsvp(eid, req.user!.id, (req.body as z.infer<typeof rsvpSchema>).response);
      res.json(ok({ recorded: true }));
    } catch (e) {
      next(e);
    }
  },
);

