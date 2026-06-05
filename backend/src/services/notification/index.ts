import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { getPool } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';
import * as repo from '../../repositories/notifications.js';
import { effectiveFor } from './preferences.js';

// 002-notification-system — T008/T012/T031
// 이벤트버스 + notificationService(생성·dedup·채널 outbox 적재).
// 이벤트 소스(001 모듈)는 emit만 호출하고 채널/전송을 모른다.

export const notificationEvents = new EventEmitter();

export interface NotificationEvent {
  type: string; // notification_types.code
  recipientId?: number; // 직접 지정(개인 알림)
  projectId?: number; // 팀 기반 수신자 결정용
  title: string;
  body: string;
  deepLink?: string;
  targetRef?: string; // dedup·삭제 참조 (예: 'project:12')
}

// 5분 버킷 dedup 키 (FR-E1 / SC-05)
function dedupKey(recipientId: number, type: string, targetRef?: string): string {
  const bucket = Math.floor(Date.now() / (5 * 60_000));
  return createHash('sha256').update(`${recipientId}|${type}|${targetRef ?? ''}|${bucket}`).digest('hex');
}

// audience → 실제 수신자 id 목록 결정 (WA-03: COLLAB_RISK 는 팀장만)
async function resolveRecipients(ev: NotificationEvent, audience: repo.Audience): Promise<number[]> {
  if (ev.recipientId) return [ev.recipientId];

  if (audience === 'ADMIN') {
    const [rows] = (await getPool().query(
      `SELECT id FROM users WHERE role_user = 'ADMIN' AND status = 'ACTIVE'`,
    )) as unknown as [Array<{ id: number }>];
    return rows.map((r) => r.id);
  }

  if (ev.projectId && (audience === 'TEAM' || audience === 'TEAM_LEAD')) {
    if (audience === 'TEAM_LEAD') {
      // 프로젝트 생성자(팀장)
      const [rows] = (await getPool().query(`SELECT owner_id FROM projects WHERE id = ? LIMIT 1`, [
        ev.projectId,
      ])) as unknown as [Array<{ owner_id: number }>];
      return rows[0] ? [rows[0].owner_id] : [];
    }
    // TEAM: ACCEPTED 멤버 전원
    const [rows] = (await getPool().query(
      `SELECT user_id FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'`,
      [ev.projectId],
    )) as unknown as [Array<{ user_id: number }>];
    return rows.map((r) => r.user_id);
  }

  logger.warn({ type: ev.type, audience }, 'notification: 수신자를 결정할 수 없음');
  return [];
}

// 단일 수신자에 대한 알림 생성 + 채널 outbox 적재
async function createForRecipient(
  recipientId: number,
  ev: NotificationEvent,
  priority: repo.Priority,
): Promise<number | null> {
  const key = dedupKey(recipientId, ev.type, ev.targetRef);

  // dedup: 동일 키 UNREAD 존재 시 묶음(group_count++) 후 종료
  const bumped = await repo.bumpDedup(recipientId, key);
  if (bumped) {
    logger.debug({ id: bumped, type: ev.type }, 'notification deduped (grouped)');
    return bumped;
  }

  const id = await repo.insertNotification({
    recipientId,
    type: ev.type,
    priority,
    title: ev.title,
    body: ev.body,
    deepLink: ev.deepLink ?? null,
    targetRef: ev.targetRef ?? null,
    dedupKey: key,
  });

  // 채널 라우팅 — 사용자 설정 적용(FR-C). 인앱은 항상(FR-B2).
  const pref = await effectiveFor(recipientId, ev.type);
  await repo.enqueueOutbox(id, 'IN_APP');
  if (pref.email) await repo.enqueueOutbox(id, 'EMAIL');
  if (pref.push) await repo.enqueueOutbox(id, 'PUSH');

  return id;
}

// 이벤트 처리 진입점
export async function handleEvent(ev: NotificationEvent): Promise<number[]> {
  const type = await repo.getType(ev.type);
  if (!type) {
    logger.warn({ type: ev.type }, 'notification: 알 수 없는 종류 — 무시');
    return [];
  }
  const recipients = await resolveRecipients(ev, type.default_audience);
  const ids: number[] = [];
  for (const rid of recipients) {
    const id = await createForRecipient(rid, ev, type.default_priority);
    if (id) ids.push(id);
  }
  return ids;
}

// 이벤트 소스가 호출하는 공개 API: notify('MATCH_READY', {...})
export function notify(type: string, payload: Omit<NotificationEvent, 'type'>): void {
  notificationEvents.emit('notify', { type, ...payload } satisfies NotificationEvent);
}

// 구독 등록 (server 부팅 시 1회). 핸들러 예외는 이벤트 소스로 전파하지 않음.
let subscribed = false;
export function registerNotificationHandlers(): void {
  if (subscribed) return;
  subscribed = true;
  notificationEvents.on('notify', (ev: NotificationEvent) => {
    handleEvent(ev).catch((e) => logger.error({ err: e, type: ev.type }, 'notification handleEvent 실패'));
  });
  logger.info('notification event handlers registered');
}
