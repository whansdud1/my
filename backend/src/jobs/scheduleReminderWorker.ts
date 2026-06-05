import { logger } from '../lib/logger.js';
import * as repo from '../repositories/schedule.js';
import { notify } from '../services/notification/index.js';

// 003-schedule-coordination — T019
// 리마인더 시점(starts_at - offset)이 도래한 일정을 스캔해 002 알림으로 리마인더 전송.
// reminder_sent_at 으로 멱등 보장.

const INTERVAL_MS = Number.parseInt(process.env.SCHEDULE_REMINDER_INTERVAL_MS ?? '60000', 10);

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await repo.dueReminders(new Date());
    for (const ev of due) {
      notify('SCHEDULE_CHANGE', {
        projectId: ev.project_id,
        title: `리마인더: ${ev.title}`,
        body: `${describe(ev.type)} '${ev.title}'이(가) 곧 시작됩니다 (${fmt(ev.starts_at)}).`,
        deepLink: `/projects/${ev.project_id}/schedule`,
        targetRef: `reminder:${ev.id}`,
      });
      await repo.markReminderSent(ev.id);
    }
    if (due.length) logger.info({ count: due.length }, 'schedule 리마인더 전송');
  } catch (e) {
    logger.error({ err: e }, 'scheduleReminderWorker tick 실패');
  } finally {
    running = false;
  }
}

export function startScheduleReminderWorker(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, 'scheduleReminderWorker 시작');
}

export function stopScheduleReminderWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function describe(t: repo.EventType): string {
  return t === 'MEETING' ? '회의' : t === 'DEADLINE' ? '마감' : '산출물';
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
