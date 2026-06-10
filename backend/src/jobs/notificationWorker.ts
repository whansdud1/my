import { logger } from '../lib/logger.js';
import * as repo from '../repositories/notifications.js';
import { getChannel, lookupRecipientEmail } from '../services/notification/channels.js';
import { getSettings } from '../repositories/notifications.js';
import { logMetrics } from '../services/notification/metrics.js';

// 002-notification-system — T032/T033/T034
// outbox 폴링 → 채널 전송 → 재시도(지수 백오프) / quiet hours 이연 / 실패 확정.
// + 주기적 보관(archive) 처리.

const INTERVAL_MS = Number.parseInt(process.env.NOTIF_WORKER_INTERVAL_MS ?? '10000', 10);
const ARCHIVE_DAYS = Number.parseInt(process.env.NOTIF_ARCHIVE_DAYS ?? '90', 10);
const BATCH = 50;
const MAX_ATTEMPTS = 4;
// 지수 백오프(ms): 30s, 2m, 10m, 30m
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000];

const METRICS_INTERVAL_MS = Number.parseInt(process.env.NOTIF_METRICS_INTERVAL_MS ?? '3600000', 10);

let timer: NodeJS.Timeout | null = null;
let archiveTimer: NodeJS.Timeout | null = null;
let metricsTimer: NodeJS.Timeout | null = null;
let running = false;

// quiet hours 판정 — critical 이 아니고 email/push 이며 야간/DND면 true(이연)
function isQuietNow(settings: repo.SettingsRow | null): boolean {
  if (!settings) return false;
  if (settings.dnd_enabled) return true;
  // 사용자 타임존 기준 현재 시각(HH:MM)
  const now = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: settings.timezone || 'Asia/Seoul',
  }).format(new Date());
  const start = settings.quiet_start.slice(0, 5);
  const end = settings.quiet_end.slice(0, 5);
  // 자정을 가로지르는 구간(22:00~08:00) 처리
  if (start <= end) return now >= start && now < end;
  return now >= start || now < end;
}

// 다음 발송 가능 시각(quiet hours 종료 시점)
function nextQuietEnd(settings: repo.SettingsRow): Date {
  const end = settings.quiet_end.slice(0, 5);
  const [h = 8, m = 0] = end.split(':').map(Number);
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next;
}

// export: outbox 한 건 처리. tick() 내부 사용 + 통합 테스트(T030)에서 직접 구동.
export async function processOne(item: repo.OutboxRow): Promise<void> {
  const notification = await repo.findById(item.notification_id);
  if (!notification) {
    await repo.markOutboxFailed(item.id, 'notification not found');
    return;
  }

  // quiet hours / DND — critical 제외, email/push 만 이연(FR-B4/FR-E2/EC-08)
  if (notification.priority !== 'CRITICAL' && (item.channel === 'EMAIL' || item.channel === 'PUSH')) {
    const settings = await getSettings(notification.recipient_id);
    if (isQuietNow(settings)) {
      await repo.rescheduleOutbox(item.id, nextQuietEnd(settings!), 'deferred: quiet hours');
      await repo.logDelivery(notification.id, item.channel, 'SUPPRESSED', item.attempt_count);
      return;
    }
  }

  const channel = getChannel(item.channel);
  const recipientEmail = item.channel === 'EMAIL' ? await lookupRecipientEmail(notification.recipient_id) : null;

  try {
    await channel.send({ notification, recipientEmail });
    await repo.markOutboxSent(item.id);
    await repo.logDelivery(notification.id, item.channel, 'SENT', item.attempt_count + 1);
  } catch (e) {
    const err = e as Error & { suppress?: boolean };
    // 재시도 무의미한 실패(예: 잘못된 이메일, EC-07) → 즉시 SUPPRESSED
    if (err.suppress) {
      await repo.markOutboxFailed(item.id, `suppressed: ${err.message}`);
      await repo.logDelivery(notification.id, item.channel, 'SUPPRESSED', item.attempt_count + 1);
      return;
    }
    const attempts = item.attempt_count + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await repo.markOutboxFailed(item.id, err.message);
      await repo.logDelivery(notification.id, item.channel, 'FAILED', attempts);
      logger.warn({ outboxId: item.id, channel: item.channel }, 'notification 전송 최종 실패');
    } else {
      const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? 1_800_000;
      await repo.rescheduleOutbox(item.id, new Date(Date.now() + delay), err.message);
      await repo.logDelivery(notification.id, item.channel, 'RETRIED', attempts);
    }
  }
}

async function tick(): Promise<void> {
  if (running) return; // 중첩 방지
  running = true;
  try {
    const due = await repo.claimDueOutbox(BATCH);
    for (const item of due) {
      await processOne(item);
    }
  } catch (e) {
    logger.error({ err: e }, 'notificationWorker tick 실패');
  } finally {
    running = false;
  }
}

async function archiveTick(): Promise<void> {
  try {
    const n = await repo.archiveOlderThan(ARCHIVE_DAYS);
    if (n > 0) logger.info({ archived: n }, 'notifications 보관 처리');
  } catch (e) {
    logger.error({ err: e }, 'notification 보관 실패');
  }
}

export function startNotificationWorker(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), INTERVAL_MS);
  archiveTimer = setInterval(() => void archiveTick(), 60 * 60_000); // 1시간마다 보관
  metricsTimer = setInterval(() => void logMetrics(60), METRICS_INTERVAL_MS); // 운영 지표 집계 로깅(T037)
  logger.info({ intervalMs: INTERVAL_MS, archiveDays: ARCHIVE_DAYS, metricsMs: METRICS_INTERVAL_MS }, 'notificationWorker 시작');
}

export function stopNotificationWorker(): void {
  if (timer) clearInterval(timer);
  if (archiveTimer) clearInterval(archiveTimer);
  if (metricsTimer) clearInterval(metricsTimer);
  timer = null;
  archiveTimer = null;
  metricsTimer = null;
}
