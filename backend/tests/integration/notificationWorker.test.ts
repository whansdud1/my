// 002-notification-system — T030
// 통합 테스트: outbox 워커의 재시도(지수 백오프)·quiet hours 이연·즉시 suppress,
// 그리고 알림 서비스의 dedup(group) 경로. repo/채널/로거를 모킹해 DB 없이 흐름을 검증한다.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- repo 모킹 (워커 + 서비스 공용) ---
const findById = jest.fn<(id: number) => Promise<unknown>>();
const getSettings = jest.fn<(u: number) => Promise<unknown>>();
const markOutboxSent = jest.fn<(id: number) => Promise<void>>();
const markOutboxFailed = jest.fn<(id: number, e: string) => Promise<void>>();
const rescheduleOutbox = jest.fn<(id: number, at: Date, e: string) => Promise<void>>();
const logDelivery = jest.fn<(n: number, c: string, r: string, a: number) => Promise<void>>();
// 서비스(dedup)용
const getType = jest.fn<(c: string) => Promise<unknown>>();
const bumpDedup = jest.fn<(r: number, k: string) => Promise<number | null>>();
const insertNotification = jest.fn<(n: unknown) => Promise<number>>();
const enqueueOutbox = jest.fn<(id: number, c: string) => Promise<void>>();

jest.unstable_mockModule('../../src/repositories/notifications.js', () => ({
  findById,
  getSettings,
  markOutboxSent,
  markOutboxFailed,
  rescheduleOutbox,
  logDelivery,
  getType,
  bumpDedup,
  insertNotification,
  enqueueOutbox,
}));

// --- 채널 모킹 ---
const send = jest.fn<(ctx: unknown) => Promise<void>>();
const getChannel = jest.fn(() => ({ key: 'EMAIL', send }));
const lookupRecipientEmail = jest.fn<(u: number) => Promise<string | null>>();
jest.unstable_mockModule('../../src/services/notification/channels.js', () => ({
  getChannel,
  lookupRecipientEmail,
}));

// --- 서비스(dedup)가 쓰는 effectiveFor / getPool / logger ---
const effectiveFor = jest.fn<(u: number, t: string) => Promise<unknown>>();
jest.unstable_mockModule('../../src/services/notification/preferences.js', () => ({ effectiveFor }));
jest.unstable_mockModule('../../src/db/connection.js', () => ({ getPool: jest.fn() }));
jest.unstable_mockModule('../../src/lib/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { processOne } = await import('../../src/jobs/notificationWorker.js');
const { handleEvent } = await import('../../src/services/notification/index.js');

const notif = (over: Record<string, unknown> = {}) => ({
  id: 100,
  recipient_id: 1,
  type: 'MATCH_READY',
  priority: 'NORMAL',
  title: 't',
  body: 'b',
  deep_link: null,
  ...over,
});
const outbox = (over: Record<string, unknown> = {}) => ({
  id: 1,
  notification_id: 100,
  channel: 'EMAIL' as const,
  status: 'PENDING' as const,
  attempt_count: 0,
  next_attempt_at: new Date(),
  last_error: null,
  ...over,
});

const FIXED = new Date('2026-06-01T03:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED);
  findById.mockResolvedValue(notif());
  getSettings.mockResolvedValue(null);
  getChannel.mockReturnValue({ key: 'EMAIL', send });
  lookupRecipientEmail.mockResolvedValue('user@example.com');
  send.mockResolvedValue(undefined);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('processOne — 전송 성공', () => {
  it('채널 전송 성공 시 SENT 로 마킹하고 delivery 로그를 남긴다', async () => {
    await processOne(outbox());
    expect(send).toHaveBeenCalled();
    expect(markOutboxSent).toHaveBeenCalledWith(1);
    expect(logDelivery).toHaveBeenCalledWith(100, 'EMAIL', 'SENT', 1);
    expect(rescheduleOutbox).not.toHaveBeenCalled();
  });
});

describe('processOne — 재시도(지수 백오프)', () => {
  it('일시 실패 & 시도횟수 미만이면 30초 뒤로 재예약하고 RETRIED 로그', async () => {
    send.mockRejectedValue(new Error('SMTP 일시 오류'));
    await processOne(outbox({ attempt_count: 0 }));

    expect(markOutboxFailed).not.toHaveBeenCalled();
    expect(rescheduleOutbox).toHaveBeenCalledTimes(1);
    const [, nextAt] = rescheduleOutbox.mock.calls[0]!;
    // 첫 백오프 = 30s
    expect((nextAt as Date).getTime()).toBe(FIXED.getTime() + 30_000);
    expect(logDelivery).toHaveBeenCalledWith(100, 'EMAIL', 'RETRIED', 1);
  });

  it('최대 시도(4회)에 도달하면 FAILED 로 확정한다', async () => {
    send.mockRejectedValue(new Error('계속 실패'));
    await processOne(outbox({ attempt_count: 3 })); // → attempts=4 = MAX

    expect(rescheduleOutbox).not.toHaveBeenCalled();
    expect(markOutboxFailed).toHaveBeenCalledWith(1, '계속 실패');
    expect(logDelivery).toHaveBeenCalledWith(100, 'EMAIL', 'FAILED', 4);
  });
});

describe('processOne — 즉시 suppress(재시도 무의미)', () => {
  it('suppress 플래그 오류(잘못된 이메일 등)는 재시도 없이 SUPPRESSED', async () => {
    const err = new Error('수신자 이메일이 유효하지 않습니다') as Error & { suppress?: boolean };
    err.suppress = true;
    send.mockRejectedValue(err);

    await processOne(outbox({ attempt_count: 0 }));
    expect(rescheduleOutbox).not.toHaveBeenCalled();
    expect(markOutboxFailed).toHaveBeenCalled();
    expect(logDelivery).toHaveBeenCalledWith(100, 'EMAIL', 'SUPPRESSED', 1);
  });
});

describe('processOne — quiet hours / DND 이연', () => {
  it('비-critical EMAIL 이고 DND 켜져 있으면 전송하지 않고 이연(SUPPRESSED)한다', async () => {
    getSettings.mockResolvedValue({
      user_id: 1,
      dnd_enabled: 1,
      quiet_start: '22:00:00',
      quiet_end: '08:00:00',
      timezone: 'Asia/Seoul',
    });

    await processOne(outbox({ channel: 'EMAIL', attempt_count: 0 }));

    expect(send).not.toHaveBeenCalled();
    expect(rescheduleOutbox).toHaveBeenCalledTimes(1);
    expect(logDelivery).toHaveBeenCalledWith(100, 'EMAIL', 'SUPPRESSED', 0);
  });

  it('CRITICAL 우선순위는 quiet hours 를 무시하고 즉시 전송한다', async () => {
    findById.mockResolvedValue(notif({ priority: 'CRITICAL' }));
    getSettings.mockResolvedValue({ user_id: 1, dnd_enabled: 1, quiet_start: '22:00:00', quiet_end: '08:00:00', timezone: 'Asia/Seoul' });

    await processOne(outbox({ channel: 'EMAIL' }));
    expect(send).toHaveBeenCalled();
    expect(markOutboxSent).toHaveBeenCalled();
  });

  it('IN_APP 채널은 quiet hours 대상이 아니다(항상 전달)', async () => {
    getChannel.mockReturnValue({ key: 'IN_APP', send });
    getSettings.mockResolvedValue({ user_id: 1, dnd_enabled: 1, quiet_start: '22:00:00', quiet_end: '08:00:00', timezone: 'Asia/Seoul' });

    await processOne(outbox({ channel: 'IN_APP' }));
    expect(send).toHaveBeenCalled();
    expect(getSettings).not.toHaveBeenCalled();
  });
});

describe('handleEvent — dedup(5분 버킷 group)', () => {
  beforeEach(() => {
    getType.mockResolvedValue({ code: 'MATCH_READY', default_priority: 'NORMAL', default_audience: 'INDIVIDUAL', is_mandatory: 0 });
    effectiveFor.mockResolvedValue({ type: 'MATCH_READY', inApp: true, email: false, push: false, mandatory: false });
    insertNotification.mockResolvedValue(99);
  });

  it('동일 dedup 키의 UNREAD 알림이 있으면 새로 만들지 않고 group_count 만 올린다', async () => {
    bumpDedup.mockResolvedValue(55); // 기존 알림 id

    const ids = await handleEvent({ type: 'MATCH_READY', recipientId: 1, title: 't', body: 'b' });

    expect(ids).toEqual([55]);
    expect(insertNotification).not.toHaveBeenCalled();
    expect(enqueueOutbox).not.toHaveBeenCalled();
  });

  it('중복이 없으면 새 알림을 만들고 IN_APP outbox 를 적재한다(이메일 off면 EMAIL 미적재)', async () => {
    bumpDedup.mockResolvedValue(null);

    const ids = await handleEvent({ type: 'MATCH_READY', recipientId: 1, title: 't', body: 'b' });

    expect(ids).toEqual([99]);
    expect(insertNotification).toHaveBeenCalledTimes(1);
    expect(enqueueOutbox).toHaveBeenCalledTimes(1);
    expect(enqueueOutbox).toHaveBeenCalledWith(99, 'IN_APP');
  });
});
