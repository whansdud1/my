import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { ok, Errors } from '../lib/envelope.js';
import * as repo from '../repositories/notifications.js';
import * as prefs from '../services/notification/preferences.js';

// 002-notification-system — T014/T015/T024
// /api/v1/notifications

export const notificationsRouter = Router();

function serialize(n: repo.NotificationRow) {
  return {
    id: String(n.id),
    type: n.type,
    priority: n.priority.toLowerCase(),
    title: n.title,
    body: n.body,
    deepLink: n.deep_link,
    groupCount: n.group_count,
    status: n.status.toLowerCase(),
    createdAt: n.created_at.toISOString(),
    readAt: n.read_at ? n.read_at.toISOString() : null,
  };
}

// --- GET /notifications ---
const listQuery = z.object({
  status: z.enum(['unread', 'read', 'archived', 'all']).optional().default('all'),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

notificationsRouter.get(
  '/notifications',
  requireAuth,
  validate({ query: listQuery }),
  async (req: AuthedRequest, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof listQuery>;
      const statusMap = { unread: 'UNREAD', read: 'READ', archived: 'ARCHIVED', all: 'ALL' } as const;
      const rows = await repo.listForUser(req.user!.id, {
        status: statusMap[q.status],
        cursor: q.cursor,
        limit: q.limit,
      });
      const unread = await repo.unreadCount(req.user!.id);
      const last = rows[rows.length - 1];
      const nextCursor = last && rows.length === q.limit ? String(last.id) : null;
      res.json(ok({ items: rows.map(serialize), nextCursor, unreadCount: unread }));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /notifications/unread-count ---
notificationsRouter.get('/notifications/unread-count', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const unread = await repo.unreadCount(req.user!.id);
    res.json(ok({ unreadCount: unread }));
  } catch (e) {
    next(e);
  }
});

// --- POST /notifications/:id/read (멱등) ---
notificationsRouter.post('/notifications/:id/read', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw Errors.Validation();
    const n = await repo.markRead(req.user!.id, id);
    if (!n) throw Errors.NotFound('알림을 찾을 수 없습니다');
    res.json(ok(serialize(n)));
  } catch (e) {
    next(e);
  }
});

// --- POST /notifications/read-all ---
notificationsRouter.post('/notifications/read-all', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const updated = await repo.markAllRead(req.user!.id);
    res.json(ok({ updated }));
  } catch (e) {
    next(e);
  }
});

// --- GET /notifications/preferences ---
notificationsRouter.get('/notifications/preferences', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const bundle = await prefs.bundleFor(req.user!.id);
    res.json(ok(bundle));
  } catch (e) {
    next(e);
  }
});

// --- PUT /notifications/preferences ---
const prefSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.string().max(50),
        inApp: z.boolean(),
        email: z.boolean(),
        push: z.boolean(),
      }),
    )
    .max(50),
  global: z.object({
    dndEnabled: z.boolean(),
    quietStart: z.string().regex(/^\d{2}:\d{2}$/),
    quietEnd: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().max(50),
  }),
});

notificationsRouter.put(
  '/notifications/preferences',
  requireAuth,
  validate({ body: prefSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body as z.infer<typeof prefSchema>;
      await prefs.updateBundle(req.user!.id, body.preferences, body.global);
      const bundle = await prefs.bundleFor(req.user!.id);
      res.json(ok(bundle));
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'MANDATORY_PREF') return next(Errors.Validation(err.message));
      next(e);
    }
  },
);
