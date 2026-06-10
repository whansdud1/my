import { Errors } from '../../lib/envelope.js';
import { logger } from '../../lib/logger.js';
import { getPool } from '../../db/connection.js';
import * as repo from '../../repositories/tasks.js';
import * as Projects from '../../repositories/projects.js';
import * as Members from '../../repositories/projectMembers.js';
import { notify } from '../notification/index.js';

// 015 — 업무/태스크 관리(To-Be ③).
// 일정과 달리 팀원 누구나 업무를 만들고 자신의 상태를 갱신할 수 있다(협업 보드).
// 완료 시 마감 준수 여부를 collaboration_activities 에 적재 → AI 평점/추천에 반영.

// 팀장(owner) 또는 ACCEPTED 멤버인지 확인
async function assertMember(projectId: number, userId: number): Promise<Projects.ProjectRow> {
  const project = await Projects.findById(projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');
  if (project.owner_id === userId) return project;
  const m = await Members.findOne(projectId, userId);
  if (!m || m.state !== 'ACCEPTED') throw Errors.Forbidden('팀원만 업무를 관리할 수 있습니다');
  return project;
}

async function assertAcceptedAssignee(projectId: number, assigneeId: number): Promise<void> {
  const project = await Projects.findById(projectId);
  if (project && project.owner_id === assigneeId) return;
  const m = await Members.findOne(projectId, assigneeId);
  if (!m || m.state !== 'ACCEPTED') throw Errors.Validation('담당자는 이 프로젝트의 팀원이어야 합니다');
}

export interface CreateTaskInput {
  projectId: number;
  actorId: number;
  title: string;
  description?: string | null;
  assigneeId?: number | null;
  dueDate?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<repo.TaskRow> {
  await assertMember(input.projectId, input.actorId);
  if (input.assigneeId) await assertAcceptedAssignee(input.projectId, input.assigneeId);

  const id = await repo.insert({
    projectId: input.projectId,
    title: input.title,
    description: input.description ?? null,
    assigneeId: input.assigneeId ?? null,
    dueDate: input.dueDate ?? null,
    createdBy: input.actorId,
  });

  // 담당자가 본인이 아니면 배정 알림
  if (input.assigneeId && input.assigneeId !== input.actorId) {
    notify('TASK_ASSIGNED', {
      recipientId: input.assigneeId,
      projectId: input.projectId,
      title: '새 업무가 배정되었습니다',
      body: `"${input.title}"${input.dueDate ? ` (마감 ${input.dueDate})` : ''}`,
      deepLink: `/projects/${input.projectId}/tasks`,
      targetRef: `task:${id}`,
    });
  }

  const created = await repo.findById(id);
  return created!;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assigneeId?: number | null;
  status?: repo.TaskStatus;
  dueDate?: string | null;
}

export async function updateTask(taskId: number, actorId: number, fields: UpdateTaskInput): Promise<repo.TaskRow> {
  const task = await repo.findById(taskId);
  if (!task) throw Errors.NotFound('업무가 없습니다');
  await assertMember(task.project_id, actorId);

  if (fields.assigneeId) await assertAcceptedAssignee(task.project_id, fields.assigneeId);

  // 완료 전이(→ DONE) 처리: completed_at 기록 + 마감 준수 협업활동 적재
  let completedAt: Date | null | undefined;
  const becomingDone = fields.status === 'DONE' && task.status !== 'DONE';
  const leavingDone = fields.status && fields.status !== 'DONE' && task.status === 'DONE';
  if (becomingDone) completedAt = new Date();
  else if (leavingDone) completedAt = null;

  await repo.update(taskId, {
    title: fields.title,
    description: fields.description,
    assigneeId: fields.assigneeId,
    status: fields.status,
    dueDate: fields.dueDate,
    completedAt,
  });

  // 마감 있는 업무 완료 시 — 담당자(없으면 완료자)의 마감 준수/지연을 협업활동으로 적재
  if (becomingDone && task.due_date) {
    const subjectId = task.assignee_id ?? actorId;
    const onTime = new Date() <= endOfDay(task.due_date);
    await recordActivity(task.project_id, subjectId, onTime ? 'DEADLINE_MET' : 'DEADLINE_MISS', {
      taskId,
      dueDate: task.due_date,
    });
  }

  const updated = await repo.findById(taskId);
  return updated!;
}

export async function deleteTask(taskId: number, actorId: number): Promise<void> {
  const task = await repo.findById(taskId);
  if (!task) throw Errors.NotFound('업무가 없습니다');
  const project = await Projects.findById(task.project_id);
  // 삭제는 작성자 또는 팀장만
  if (task.created_by !== actorId && project?.owner_id !== actorId)
    throw Errors.Forbidden('업무 삭제는 작성자 또는 팀장만 가능합니다');
  await repo.remove(taskId);
}

export async function listTasks(projectId: number, actorId: number): Promise<repo.TaskRow[]> {
  await assertMember(projectId, actorId);
  return repo.listByProject(projectId);
}

function endOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999`);
}

async function recordActivity(
  projectId: number,
  userId: number,
  type: 'DEADLINE_MET' | 'DEADLINE_MISS',
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO collaboration_activities (project_id, user_id, provider, activity_type, occurred_at, meta)
         VALUES (?, ?, 'MANUAL', ?, NOW(3), ?)`,
      [projectId, userId, type, JSON.stringify(meta)],
    );
  } catch (e) {
    // 협업활동 적재 실패가 업무 갱신을 막지 않도록 로깅만.
    logger.warn({ err: e, projectId, userId, type }, 'task: collaboration_activity 적재 실패');
  }
}
