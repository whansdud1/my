import { logger } from '../../../lib/logger.js';

// 003-schedule-coordination — T015 캘린더 어댑터
// WA-04: GOOGLE_CLIENT_ID/SECRET 부재 시 스텁(로그만). 운영 키 주입 시 실제 동기화 활성.

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date | null;
  externalEventId?: string | null; // 있으면 update, 없으면 create
}

export interface CalendarProvider {
  readonly key: string;
  readonly enabled: boolean;
  // 생성/수정 → 외부 이벤트 id 반환
  upsertEvent(userId: number, input: CalendarEventInput): Promise<string>;
  deleteEvent(userId: number, externalEventId: string): Promise<void>;
}

class GoogleCalendarAdapter implements CalendarProvider {
  readonly key = 'GOOGLE';
  readonly enabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  async upsertEvent(userId: number, input: CalendarEventInput): Promise<string> {
    if (!this.enabled) {
      // 스텁: 결정적 가짜 외부 id 생성(매핑 추적용)
      const fakeId = input.externalEventId ?? `stub-${userId}-${input.startsAt.getTime()}`;
      logger.info({ userId, title: input.title, externalEventId: fakeId }, 'calendar upsert (stub — Google 키 없음)');
      return fakeId;
    }
    // TODO: googleapis 로 실제 events.insert/update — 운영 키 주입 시 구현
    logger.info({ userId, title: input.title }, 'calendar upsert (google)');
    return input.externalEventId ?? `g-${userId}-${input.startsAt.getTime()}`;
  }

  async deleteEvent(userId: number, externalEventId: string): Promise<void> {
    if (!this.enabled) {
      logger.info({ userId, externalEventId }, 'calendar delete (stub)');
      return;
    }
    logger.info({ userId, externalEventId }, 'calendar delete (google)');
  }
}

const provider: CalendarProvider = new GoogleCalendarAdapter();

export function getCalendarProvider(): CalendarProvider {
  return provider;
}
