import { nanoid } from 'nanoid';
import { Errors } from '../../lib/envelope.js';
import { logger } from '../../lib/logger.js';
import * as repo from '../../repositories/schedule.js';
import * as Projects from '../../repositories/projects.js';
import { notify } from '../notification/index.js';
import { getCalendarProvider } from './calendar/provider.js';

// 003-schedule-coordination — T010/T012/T017
// 일정 생성·변경·취소·RSVP + 002 알림 연동 + 캘린더 단방향 동기화

const REPEAT_MAX = Number.parseInt(process.env.SCHEDULE_REPEAT_MAX_WEEKS ?? '8', 10);

export interface CreateEventInput {
  projectId: number;
  actorId: number;
  type: repo.EventType;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt?: Date | null;
  reminderOffsetMin?: number;
  repeatWeeks?: number; // 0=단일, N=주간 반복 N회
}

// 팀장(owner) 권한 확인
async function assertOwner(projectId: number, actorId: number): Promise<Projects.ProjectRow> {
  const project = await Projects.findById(projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');
  if (project.owner_id !== actorId) throw Errors.Forbidden('일정 생성·관리는 팀장만 가능합니다'); // WA-03
  return project;
}

export async function createEvent(input: CreateEventInput): Promise<number[]> {
  await assertOwner(input.projectId, input.actorId);

  if (input.startsAt.getTime() <= Date.now()) throw Errors.Validation('과거 시각으로 일정을 만들 수 없습니다'); // EC-07/FR-B5
  if (input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime())
    throw Errors.Validation('종료 시각은 시작 이후여야 합니다');

  const reminderOffset = input.reminderOffsetMin ?? (input.type === 'DEADLINE' ? 1440 : 60);
  const repeat = input.type === 'MEETING' ? Math.max(0, Math.min(input.repeatWeeks ?? 0, REPEAT_MAX)) : 0;
  const groupId = repeat > 0 ? nanoid() : null;
  const memberIds = await repo.memberUserIds(input.projectId);

  const ids: number[] = [];
  const occurrences = repeat > 0 ? repeat : 1;
  for (let i = 0; i < occurrences; i++) {
    const offsetMs = i * 7 * 86400_000; // 주간
    const startsAt = new Date(input.startsAt.getTime() + offsetMs);
    const endsAt = input.endsAt ? new Date(input.endsAt.getTime() + offsetMs) : null;
    const id = await repo.insertEvent({
      projectId: input.projectId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      startsAt,
      endsAt,
      createdBy: input.actorId,
      recurrenceGroupId: groupId,
      reminderOffsetMin: reminderOffset,
    });
    await repo.seedRsvps(id, memberIds);
    ids.push(id);
  }

  // 알림 — 팀 전체에 일정 생성 공유(002 SCHEDULE_CHANGE)
  notify('SCHEDULE_CHANGE', {
    projectId: input.projectId,
    title: `새 일정: ${input.title}`,
    body: `${describeType(input.type)} 일정이 ${fmt(input.startsAt)}에 등록되었습니다.`,
    deepLink: `/projects/${input.projectId}/schedule`,
    targetRef: `event:${ids[0]}`,
  });

  // 캘린더 동기화(연동 사용자만, 단방향)
  for (const id of ids) void syncEventToCalendars(id).catch((e) => logger.error({ err: e, id }, 'calendar sync 실패'));

  return ids;
}

export async function updateEvent(
  eventId: number,
  actorId: number,
  patch: { title?: string; startsAt?: Date; endsAt?: Date | null },
): Promise<void> {
  const ev = await repo.findEvent(eventId);
  if (!ev) throw Errors.NotFound('일정이 없습니다');
  await assertOwner(ev.project_id, actorId);
  if (patch.startsAt && patch.startsAt.getTime() <= Date.now())
    throw Errors.Validation('과거 시각으로 변경할 수 없습니다');

  await repo.updateEvent(eventId, patch);

  notify('SCHEDULE_CHANGE', {
    projectId: ev.project_id,
    title: `일정 변경: ${patch.title ?? ev.title}`,
    body: `'${ev.title}' 일정이 변경되었습니다.`,
    deepLink: `/projects/${ev.project_id}/schedule`,
    targetRef: `event:${eventId}`,
  });

  void syncEventToCalendars(eventId).catch((e) => logger.error({ err: e, eventId }, 'calendar sync 실패'));
}

export async function cancelEvent(eventId: number, actorId: number): Promise<void> {
  const ev = await repo.findEvent(eventId);
  if (!ev) throw Errors.NotFound('일정이 없습니다');
  await assertOwner(ev.project_id, actorId);

  await repo.cancelEvent(eventId);

  // 캘린더에서 제거
  const maps = await repo.getSyncMaps(eventId);
  const provider = getCalendarProvider();
  for (const m of maps) await provider.deleteEvent(m.user_id, m.external_event_id).catch(() => undefined);

  notify('SCHEDULE_CHANGE', {
    projectId: ev.project_id,
    title: `일정 취소: ${ev.title}`,
    body: `'${ev.title}' 일정이 취소되었습니다.`,
    deepLink: `/projects/${ev.project_id}/schedule`,
    targetRef: `event:${eventId}`,
  });
}

export async function respondRsvp(
  eventId: number,
  userId: number,
  response: 'ATTEND' | 'DECLINE',
): Promise<void> {
  const ev = await repo.findEvent(eventId);
  if (!ev || ev.status !== 'SCHEDULED') throw Errors.NotFound('일정이 없습니다');
  const members = await repo.memberUserIds(ev.project_id);
  if (!members.includes(userId)) throw Errors.Forbidden('팀원만 응답할 수 있습니다');
  await repo.setRsvp(eventId, userId, response);
}

// 연동 사용자 캘린더에 일정 반영(생성/수정) — 단방향
export async function syncEventToCalendars(eventId: number): Promise<void> {
  const ev = await repo.findEvent(eventId);
  if (!ev || ev.status !== 'SCHEDULED') return;
  const members = await repo.memberUserIds(ev.project_id);
  const active = await repo.activeConnectionUserIds(members);
  if (!active.length) return;
  const provider = getCalendarProvider();
  const existing = new Map((await repo.getSyncMaps(eventId)).map((m) => [m.user_id, m.external_event_id]));
  for (const uid of active) {
    const ext = await provider.upsertEvent(uid, {
      title: ev.title,
      description: ev.description,
      startsAt: ev.starts_at,
      endsAt: ev.ends_at,
      externalEventId: existing.get(uid) ?? null,
    });
    await repo.upsertSyncMap(eventId, uid, ext);
  }
}

function describeType(t: repo.EventType): string {
  return t === 'MEETING' ? '회의' : t === 'DEADLINE' ? '마감' : '산출물';
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
