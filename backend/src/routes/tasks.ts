import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { ok } from '../lib/envelope.js';
import * as svc from '../services/tasks/taskService.js';
import type { TaskRow } from '../repositories/tasks.js';

// 015 — 프로젝트 업무/태스크 관리(To-Be ③)
export const tasksRouter = Router();

function serialize(t: TaskRow) {
  return {
    id: String(t.id),
    projectId: String(t.project_id),
    title: t.title,
    description: t.description,
    assigneeId: t.assignee_id ? String(t.assignee_id) : null,
    assigneeName: t.assignee_name,
    status: t.status,
    dueDate: t.due_date,
    createdBy: String(t.created_by),
    completedAt: t.completed_at ? t.completed_at.toISOString() : null,
    createdAt: t.created_at.toISOString(),
  };
}

// --- GET /projects/:id/tasks ---
tasksRouter.get('/projects/:id/tasks', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const rows = await svc.listTasks(Number(req.params.id), req.user!.id);
    res.json(ok(rows.map(serialize)));
  } catch (e) {
    next(e);
  }
});

// --- POST /projects/:id/tasks ---
const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assigneeId: z.coerce.number().int().positive().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다')
    .nullable()
    .optional(),
});
tasksRouter.post(
  '/projects/:id/tasks',
  requireAuth,
  validate({ body: createSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const b = req.body as z.infer<typeof createSchema>;
      const task = await svc.createTask({
        projectId: Number(req.params.id),
        actorId: req.user!.id,
        title: b.title,
        description: b.description,
        assigneeId: b.assigneeId ?? null,
        dueDate: b.dueDate ?? null,
      });
      res.status(201).json(ok(serialize(task)));
    } catch (e) {
      next(e);
    }
  },
);

// --- PATCH /tasks/:tid ---
const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  assigneeId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
tasksRouter.patch(
  '/tasks/:tid',
  requireAuth,
  validate({ body: updateSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const b = req.body as z.infer<typeof updateSchema>;
      const task = await svc.updateTask(Number(req.params.tid), req.user!.id, {
        title: b.title,
        description: b.description,
        assigneeId: b.assigneeId,
        status: b.status,
        dueDate: b.dueDate,
      });
      res.json(ok(serialize(task)));
    } catch (e) {
      next(e);
    }
  },
);

// --- DELETE /tasks/:tid ---
tasksRouter.delete('/tasks/:tid', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await svc.deleteTask(Number(req.params.tid), req.user!.id);
    res.json(ok({ deleted: true }));
  } catch (e) {
    next(e);
  }
});
