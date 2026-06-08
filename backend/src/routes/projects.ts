import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { assertOwner } from '../middlewares/rbac.js';
import { chatUploadArray, uploadsRoot } from '../middlewares/upload.js';
import { ok, Errors } from '../lib/envelope.js';
import * as Projects from '../repositories/projects.js';
import * as Members from '../repositories/projectMembers.js';
import * as Attachments from '../repositories/messageAttachments.js';
import * as Invites from '../services/projects/invites.js';
import * as Chat from '../services/chat/index.js';
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

// 프로젝트가 정한 필요 역할별 needed/filled/remaining 현황.
function roleSummary(
  requiredRoles: Array<{ role: string; count: number }>,
  acceptedCounts: Record<string, number>,
) {
  return (requiredRoles ?? []).map((r) => {
    const filled = acceptedCounts[r.role] ?? 0;
    return {
      role: r.role,
      needed: r.count,
      filled,
      remaining: Math.max(r.count - filled, 0),
    };
  });
}

// 팀원을 다 구했는지: 필요 역할이 있으면 모든 역할 충원, 없으면 정원 도달.
function isFullyRecruited(
  requiredRoles: Array<{ role: string; count: number }>,
  acceptedCounts: Record<string, number>,
  acceptedTotal: number,
  targetSize: number,
): boolean {
  const roles = requiredRoles ?? [];
  const allRolesFilled =
    roles.length > 0 && roles.every((r) => (acceptedCounts[r.role] ?? 0) >= r.count);
  return allRolesFilled || acceptedTotal >= targetSize;
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
      // requiredRoles: string[] → {role,count:1}[] 변환 (문자열은 1명으로 간주)
      const roles = (req.body.requiredRoles ?? []).map(
        (r: string | { role: string; count: number }) =>
          typeof r === 'string' ? { role: r, count: 1 } : r,
      );

      // 역할별 모집 인원 합계 + 팀장 본인 1명 = 총 모집 인원(capacity) 검증
      if (roles.length > 0) {
        const roleSum = roles.reduce((s: number, r: { count: number }) => s + r.count, 0);
        if (roleSum !== req.body.capacity - 1) {
          throw Errors.Validation(
            `역할별 모집 인원 합계(${roleSum}명)에 팀장 1명을 더한 값이 총 모집 인원(${req.body.capacity}명)과 일치해야 합니다`,
          );
        }
      }

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

// --- GET /projects/mine — 내가 지원/참여 중인 프로젝트 (':id'보다 먼저 등록) ---
projectsRouter.get('/projects/mine', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const rows = await Members.findProjectsByUser(req.user!.id);
    const now = Date.now();
    res.json(
      ok(
        rows.map((r) => ({
          id: String(r.project_id),
          title: r.title,
          status: r.status,
          endDate: r.ends_at ? r.ends_at.toISOString().slice(0, 10) : null,
          myRole: r.role,
          myState: r.state, // APPLIED(대기) | ACCEPTED(참여) | INVITED(초대됨)
          recruitClosed: r.status !== 'RECRUIT',
          // 프로젝트 종료 = CLOSED/ARCHIVED 이거나 종료일이 지남
          finished:
            r.status === 'CLOSED' ||
            r.status === 'ARCHIVED' ||
            (r.ends_at !== null && r.ends_at.getTime() < now),
        })),
      ),
    );
  } catch (e) {
    next(e);
  }
});

// --- GET /projects/chat-unread — 내 모든 프로젝트 안읽음 합계(':id'보다 먼저 등록) ---
projectsRouter.get('/projects/chat-unread', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const summary = await Chat.unreadSummary(req.user!.id);
    res.json(ok(summary));
  } catch (e) {
    next(e);
  }
});

// --- GET /projects/:id ---
projectsRouter.get('/projects/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw Errors.Validation('잘못된 id');
    const p = await Projects.findById(id);
    if (!p) throw Errors.NotFound();

    const acceptedCounts = await Members.acceptedRoleCounts(id);
    const acceptedTotal = await Members.countAcceptedByProject(id);
    const mine = await Members.findOne(id, req.user!.id);
    // 모집 종료 = 상태가 RECRUIT 가 아니거나, 팀원을 다 구한 경우
    const recruitClosed =
      p.status !== 'RECRUIT' ||
      isFullyRecruited(p.required_roles, acceptedCounts, acceptedTotal, p.target_size);
    res.json(
      ok({
        ...projectDto(p),
        roles: roleSummary(p.required_roles, acceptedCounts),
        isOwner: p.owner_id === req.user!.id,
        myMembership: mine ? { role: mine.role, state: mine.state } : null,
        recruitClosed,
      }),
    );
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

// --- DELETE /projects/:id — 팀장이 모집 중(RECRUIT)인 본인 프로젝트 삭제 ---
projectsRouter.delete('/projects/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw Errors.Validation('잘못된 id');
    const p = await Projects.findById(id);
    if (!p) throw Errors.NotFound();
    assertOwner(p.owner_id, req.user!.id, req.user!.role);
    if (p.status !== 'RECRUIT') {
      throw Errors.Validation('모집 중인 프로젝트만 삭제할 수 있습니다');
    }
    await Projects.remove(id);
    await audit({ actorId: req.user!.id, action: 'PROJECT_DELETE', targetType: 'project', targetId: id });
    res.json(ok({ deleted: true }));
  } catch (e) {
    next(e);
  }
});

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

// --- POST /projects/:id/apply — 지원자가 남은 역할 중 하나를 골라 지원 ---
const applySchema = z.object({ role: z.string().min(1).max(40) });
projectsRouter.post(
  '/projects/:id/apply',
  requireAuth,
  validate({ body: applySchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      if (!Number.isFinite(projectId)) throw Errors.Validation('잘못된 id');
      const project = await Projects.findById(projectId);
      if (!project) throw Errors.NotFound();

      const userId = req.user!.id;
      if (project.owner_id === userId) throw Errors.Validation('본인 프로젝트에는 지원할 수 없습니다');
      if (project.status !== 'RECRUIT') throw Errors.Validation('모집 중인 프로젝트가 아닙니다');

      const role = req.body.role as string;
      const required = (project.required_roles ?? []) as Array<{ role: string; count: number }>;
      const reqRole = required.find((r) => r.role === role);
      if (!reqRole) throw Errors.Validation('이 프로젝트에서 모집하지 않는 역할입니다');

      // 이미 활성/대기 멤버면 중복 지원 차단 (LEFT/REJECTED 는 재지원 허용)
      const existing = await Members.findOne(projectId, userId);
      if (existing && ['ACCEPTED', 'INVITED', 'APPLIED'].includes(existing.state)) {
        const msg =
          existing.state === 'ACCEPTED'
            ? '이미 이 팀의 멤버입니다'
            : existing.state === 'APPLIED'
              ? '이미 지원한 프로젝트입니다'
              : '이미 초대를 받은 프로젝트입니다';
        throw Errors.Conflict(msg);
      }

      // 역할 잔여 슬롯 확인
      const acceptedCounts = await Members.acceptedRoleCounts(projectId);
      const filled = acceptedCounts[role] ?? 0;
      if (reqRole.count - filled <= 0) throw Errors.Conflict('해당 역할은 이미 마감되었습니다');

      // 팀 정원 확인
      const acceptedTotal = await Members.countAcceptedByProject(projectId);
      if (acceptedTotal >= project.target_size) throw Errors.Conflict('팀 정원이 가득 찼습니다');

      const memberId = await Members.apply(projectId, userId, role);
      await audit({
        actorId: userId,
        action: 'PROJECT_APPLY',
        targetType: 'project',
        targetId: projectId,
        meta: { role },
      });
      res.status(201).json(ok({ memberId: String(memberId), role, state: 'APPLIED' }));
    } catch (e) {
      next(e);
    }
  },
);

// --- GET /projects/:id/applicants — 팀장: 지원자(대기) 목록 ---
projectsRouter.get(
  '/projects/:id/applicants',
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      if (!Number.isFinite(projectId)) throw Errors.Validation('잘못된 id');
      const project = await Projects.findById(projectId);
      if (!project) throw Errors.NotFound();
      if (project.owner_id !== req.user!.id && req.user!.role !== 'ADMIN') {
        throw Errors.Forbidden('지원자 조회 권한이 없습니다');
      }
      const rows = await Members.findApplicants(projectId);
      res.json(
        ok(
          rows.map((r) => ({
            userId: String(r.user_id),
            name: r.name ?? '익명',
            role: r.role,
            appliedAt: r.created_at?.toISOString() ?? null,
          })),
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// --- POST /projects/:id/applicants/:userId/decision — 팀장: 수락/거절 ---
const decisionSchema = z.object({ action: z.enum(['ACCEPT', 'REJECT']) });
projectsRouter.post(
  '/projects/:id/applicants/:userId/decision',
  requireAuth,
  validate({ body: decisionSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const applicantId = Number(req.params.userId);
      if (!Number.isFinite(projectId) || !Number.isFinite(applicantId)) {
        throw Errors.Validation('잘못된 id');
      }
      const project = await Projects.findById(projectId);
      if (!project) throw Errors.NotFound();
      if (project.owner_id !== req.user!.id && req.user!.role !== 'ADMIN') {
        throw Errors.Forbidden('지원자 처리 권한이 없습니다');
      }

      const member = await Members.findOne(projectId, applicantId);
      if (!member || member.state !== 'APPLIED') throw Errors.NotFound('대기 중인 지원자가 아닙니다');

      if (req.body.action === 'REJECT') {
        await Members.setState(member.id, 'REJECTED');
        await audit({
          actorId: req.user!.id,
          action: 'PROJECT_APPLY_REJECT',
          targetType: 'project',
          targetId: projectId,
          meta: { applicantId, role: member.role },
        });
        res.json(ok({ userId: String(applicantId), state: 'REJECTED' }));
        return;
      }

      // ACCEPT — 수락 직전 역할 잔여/정원 재확인
      const required = (project.required_roles ?? []) as Array<{ role: string; count: number }>;
      const reqRole = required.find((r) => r.role === member.role);
      const acceptedCounts = await Members.acceptedRoleCounts(projectId);
      const filled = acceptedCounts[member.role] ?? 0;
      if (reqRole && reqRole.count - filled <= 0) throw Errors.Conflict('해당 역할은 이미 마감되었습니다');
      const acceptedTotal = await Members.countAcceptedByProject(projectId);
      if (acceptedTotal >= project.target_size) throw Errors.Conflict('팀 정원이 가득 찼습니다');

      await Members.setState(member.id, 'ACCEPTED', new Date());
      await audit({
        actorId: req.user!.id,
        action: 'PROJECT_APPLY_ACCEPT',
        targetType: 'project',
        targetId: projectId,
        meta: { applicantId, role: member.role },
      });

      // 팀원을 다 구했으면 자동으로 모집 종료(RECRUIT→RUNNING) → 이후 지원 차단
      const countsAfter = await Members.acceptedRoleCounts(projectId);
      const totalAfter = await Members.countAcceptedByProject(projectId);
      let recruitClosed = project.status !== 'RECRUIT';
      if (
        project.status === 'RECRUIT' &&
        isFullyRecruited(project.required_roles, countsAfter, totalAfter, project.target_size)
      ) {
        await Projects.closeRecruit(projectId);
        await audit({
          actorId: req.user!.id,
          action: 'PROJECT_RECRUIT_CLOSE',
          targetType: 'project',
          targetId: projectId,
        });
        recruitClosed = true;
      }
      res.json(ok({ userId: String(applicantId), state: 'ACCEPTED', recruitClosed }));
    } catch (e) {
      next(e);
    }
  },
);

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

// --- 팀 채팅: GET /projects/:id/messages — 히스토리(시간 오름차순) ---
// 실시간 수신은 socket.io(message:new) 가 담당하고, 이 엔드포인트는 초기 로드와
// 위로 더 불러오기(before=가장 오래된 메시지 id) 페이지네이션에 사용한다.
const messagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
projectsRouter.get(
  '/projects/:id/messages',
  requireAuth,
  validate({ query: messagesQuerySchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const { before, after, limit } = req.query as {
        before?: number;
        after?: number;
        limit?: number;
      };
      const items = await Chat.listMessages(projectId, req.user!.id, {
        beforeId: before,
        afterId: after,
        limit,
      });
      res.json(ok(items));
    } catch (e) {
      next(e);
    }
  },
);

// --- 팀 채팅: POST /projects/:id/messages — 메시지 전송(소켓 미연결 폴백) ---
// 정상 경로는 소켓 message:send 지만, 웹소켓 실패 시에도 전송되도록 REST 도 제공.
// 저장 후 동일 room 에 message:new 브로드캐스트(Chat.postMessage 내부).
const sendMessageSchema = z.object({ body: z.string().min(1).max(2000) });
projectsRouter.post(
  '/projects/:id/messages',
  requireAuth,
  validate({ body: sendMessageSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const dto = await Chat.postMessage(projectId, req.user!.id, req.body.body);
      res.status(201).json(ok(dto));
    } catch (e) {
      next(e);
    }
  },
);

// --- 팀 채팅: GET /projects/:id/read-state — 멤버별 읽음 커서 + 내 안읽음 ---
projectsRouter.get(
  '/projects/:id/read-state',
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      const state = await Chat.getReadState(Number(req.params.id), req.user!.id);
      res.json(ok(state));
    } catch (e) {
      next(e);
    }
  },
);

// --- 팀 채팅: POST /projects/:id/messages/read — 읽음 커서 전진(소켓 미연결 폴백) ---
const readSchema = z.object({ messageId: z.coerce.number().int().positive() });
projectsRouter.post(
  '/projects/:id/messages/read',
  requireAuth,
  validate({ body: readSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const result = await Chat.markRead(Number(req.params.id), req.user!.id, req.body.messageId);
      res.json(ok(result));
    } catch (e) {
      next(e);
    }
  },
);

// --- 팀 채팅: POST /projects/:id/messages/attachments — 사진/파일 첨부 메시지 ---
// multipart/form-data: files[](최대 N개) + body(선택). 저장 후 동일 room 에 message:new 브로드캐스트.
// 소켓으로 바이너리를 보내기 어려우므로 첨부는 항상 이 REST 경로를 사용한다.
projectsRouter.post(
  '/projects/:id/messages/attachments',
  requireAuth,
  chatUploadArray('files'),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw Errors.Validation('첨부할 파일을 선택해주세요');
      const items: Attachments.NewAttachment[] = files.map((f) => ({
        kind: f.mimetype.startsWith('image/') ? 'image' : 'file',
        // multer 가 latin1 로 디코드한 한글 파일명을 utf-8 로 복원
        originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
        mimeType: f.mimetype,
        byteSize: f.size,
        storageKey: path.relative(uploadsRoot, f.path),
      }));
      const body = typeof req.body?.body === 'string' ? req.body.body : '';
      const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : undefined;
      const dto = await Chat.postMessageWithAttachments(
        projectId,
        req.user!.id,
        body,
        items,
        clientId,
      );
      res.status(201).json(ok(dto));
    } catch (e) {
      next(e);
    }
  },
);

// --- 팀 채팅: GET /projects/:id/attachments/:attId — 첨부 다운로드/보기(멤버십 검증) ---
// 디스크 경로는 노출하지 않고 이 라우트로만 접근. 이미지는 inline, 그 외는 다운로드.
const attachmentParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  attId: z.coerce.number().int().positive(),
});
projectsRouter.get(
  '/projects/:id/attachments/:attId',
  requireAuth,
  validate({ params: attachmentParamsSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const projectId = Number(req.params.id);
      const att = await Attachments.findWithProject(Number(req.params.attId));
      if (!att || att.project_id !== projectId) throw Errors.NotFound('첨부를 찾을 수 없습니다');
      await Chat.assertMember(projectId, req.user!.id); // ACCEPTED 멤버만

      // 경로 조작 방지 — 저장 키를 절대경로화한 뒤 업로드 루트 밖이면 거부.
      const absPath = path.resolve(uploadsRoot, att.storage_key);
      if (absPath !== uploadsRoot && !absPath.startsWith(uploadsRoot + path.sep)) {
        throw Errors.NotFound('첨부를 찾을 수 없습니다');
      }
      const filenameStar = encodeURIComponent(att.original_name);
      const disposition = att.kind === 'image' ? 'inline' : 'attachment';
      res.sendFile(absPath, {
        headers: {
          'Content-Type': att.mime_type,
          'Content-Disposition': `${disposition}; filename*=UTF-8''${filenameStar}`,
          'Cache-Control': 'private, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
        },
      }, (err) => {
        if (err && !res.headersSent) next(Errors.NotFound('첨부 파일을 읽을 수 없습니다'));
      });
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
