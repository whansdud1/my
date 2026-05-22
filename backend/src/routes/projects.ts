import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { assertOwner } from '../middlewares/rbac.js';
import { ok, Errors } from '../lib/envelope.js';
import * as Projects from '../repositories/projects.js';
import * as Members from '../repositories/projectMembers.js';
import * as Invites from '../services/projects/invites.js';
import { recommend } from '../services/matching/index.js';
import { audit } from '../services/audit.js';

export const projectsRouter = Router();

function projectDto(p: Projects.ProjectRow) {
  return {
    id: String(p.id),
    title: p.title,
    description: p.description,
    type: p.type,
    requiredRoles: p.required_roles,
    targetSize: p.target_size,
    capacity: p.target_size,
    startDate: p.starts_at ? p.starts_at.toISOString().slice(0, 10) : null,
    endDate: p.ends_at ? p.ends_at.toISOString().slice(0, 10) : null,
    workTimePref: p.work_time_pref,
    status: p.status,
    ownerId: String(p.owner_id),
    createdAt: p.created_at.toISOString(),
  };
}

// --- POST /projects ---
const createSchema = z.object({
  title: z.string().min(2).max(150),
  description: z.string().max(2000).optional(),
  type: z.enum(['CONTEST', 'CLASS', 'SELF']).optional(),
  capacity: z.number().int().min(2).max(20),
  requiredRoles: z
    .array(z.union([z.string().max(40), z.object({ role: z.string().max(40), count: z.number().int().min(1).max(20) })]))
    .max(20)
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  workTimePref: z.enum(['DAY', 'NIGHT', 'ANY']).optional(),
  preferredTimeNote: z.string().max(200).optional(),
});

projectsRouter.post(
  '/projects',
  requireAuth,
  validate({ body: createSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      // requiredRoles: string[] → {role,count:1}[] 변환
      const roles = (req.body.requiredRoles ?? []).map(
        (r: string | { role: string; count: number }) =>
          typeof r === 'string' ? { role: r, count: 1 } : r,
      );
      const id = await Projects.create({
        ownerId: req.user!.id,
        title: req.body.title,
        description: req.body.description,
        type: req.body.type,
        requiredRoles: roles,
        targetSize: req.body.capacity,
        startsAt: req.body.startDate ?? null,
        endsAt: req.body.endDate ?? null,
        workTimePref: req.body.workTimePref ?? 'ANY',
      });
      // 등록자는 자동 ACCEPTED
      const conn = await (await import('../db/connection.js')).getPool().getConnection();
      try {
        await conn.query(
          `INSERT INTO project_members (project_id, user_id, role, state, joined_at)
           VALUES (?, ?, 'OWNER', 'ACCEPTED', NOW(3))`,
          [id, req.user!.id],
        );
      } finally {
        conn.release();
      }
      const project = await Projects.findById(id);
      await audit({ actorId: req.user!.id, action: 'PROJECT_CREATE', targetType: 'project', targetId: id });
      res.status(201).json(ok(projectDto(project!)));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects ---
const listQuerySchema = z.object({
  status: z.enum(['RECRUIT', 'RUNNING', 'CLOSED', 'ARCHIVED']).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

projectsRouter.get(
  '/projects',
  requireAuth,
  validate({ query: listQuerySchema }),
  async (req, res, next) => {
    try {
      const { status, q, page, pageSize } = req.query as {
        status?: Projects.ProjectRow['status'];
        q?: string;
        page?: number;
        pageSize?: number;
      };
      const result = await Projects.list({ status, q, page, pageSize });
      res.json(ok({ items: result.items.map(projectDto), total: result.total }));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects/:id ---
projectsRouter.get('/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw Errors.Validation('잘못된 id');
    const p = await Projects.findById(id);
    if (!p) throw Errors.NotFound();
    res.json(ok(projectDto(p)));
  } catch (e) {
    next(e);
  }
});

// --- PATCH /projects/:id ---
const patchSchema = z.object({
  title: z.string().min(2).max(150).optional(),
  description: z.string().max(2000).nullable().optional(),
  targetSize: z.number().int().min(2).max(20).optional(),
  workTimePref: z.enum(['DAY', 'NIGHT', 'ANY']).optional(),
  status: z.enum(['RECRUIT', 'RUNNING', 'CLOSED', 'ARCHIVED']).optional(),
});
projectsRouter.patch(
  '/projects/:id',
  requireAuth,
  validate({ body: patchSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      const p = await Projects.findById(id);
      if (!p) throw Errors.NotFound();
      assertOwner(p.owner_id, req.user!.id, req.user!.role);
      await Projects.patch(id, req.body);
      const after = await Projects.findById(id);
      res.json(ok(projectDto(after!)));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects/:id/members ---
projectsRouter.get('/projects/:id/members', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await Members.findByProject(id);
    // 이름 합치기
    const { getPool } = await import('../db/connection.js');
    const userIds = rows.map((r) => r.user_id);
    const names: Record<number, string> = {};
    if (userIds.length > 0) {
      const [urows] = (await getPool().query(
        `SELECT id, name FROM users WHERE id IN (?)`,
        [userIds],
      )) as unknown as [Array<{ id: number; name: string }>];
      for (const u of urows) names[u.id] = u.name;
    }
    res.json(
      ok(
        rows
          .filter((r) => r.state === 'ACCEPTED' || r.state === 'INVITED')
          .map((r) => ({
            userId: String(r.user_id),
            name: names[r.user_id] ?? '익명',
            role: r.role,
            state: r.state,
            joinedAt: r.joined_at?.toISOString() ?? null,
          })),
      ),
    );
  } catch (e) {
    next(e);
  }
});

// --- POST /projects/:id/invites ---
const inviteSchema = z.object({
  userId: z.union([z.string(), z.number()]).optional(),
  email: z.string().email().optional(),
  role: z.string().max(40).default('MEMBER'),
});
projectsRouter.post(
  '/projects/:id/invites',
  requireAuth,
  validate({ body: inviteSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const project = await Projects.findById(projectId);
      if (!project) throw Errors.NotFound();
      // 소유자 또는 ADMIN
      if (project.owner_id !== req.user!.id && req.user!.role !== 'ADMIN') {
        throw Errors.Forbidden('초대 권한이 없습니다');
      }
      const result = await Invites.sendInvite({
        projectId,
        inviterId: req.user!.id,
        invitedUserId: req.body.userId !== undefined ? Number(req.body.userId) : undefined,
        invitedEmail: req.body.email,
        role: req.body.role ?? 'MEMBER',
      });
      res.status(201).json(ok({ memberId: String(result.memberId), userId: String(result.userId) }));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects/:id/recommendations ---
const recSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
projectsRouter.get(
  '/projects/:id/recommendations',
  requireAuth,
  validate({ query: recSchema }),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const limit = Number((req.query as { limit?: number }).limit ?? 10);
      const list = await recommend(id, limit);
      res.json(ok(list));
    } catch (e) {
      next(e);
    }
  },
);
