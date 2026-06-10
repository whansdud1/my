// 002-notification-system — T021
// 알림 센터 스토어(WA-02: 30초 폴링 + 안읽음 카운트) 단위 테스트.
// notificationApi 를 모킹해 네트워크 없이 폴링·읽음 상태 전이를 검증한다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { NotificationDto } from '@/services/notificationApi';

const list = vi.fn();
const unreadCount = vi.fn();
const markRead = vi.fn();
const markAllRead = vi.fn();

vi.mock('@/services/notificationApi', () => ({
  notificationApi: { list, unreadCount, markRead, markAllRead },
}));

const { useNotificationCenter } = await import('@/stores/notificationCenter');

const dto = (id: string, status: NotificationDto['status'] = 'unread'): NotificationDto => ({
  id,
  type: 'MATCH_READY',
  priority: 'normal',
  title: `알림 ${id}`,
  body: '본문',
  deepLink: null,
  groupCount: 1,
  status,
  createdAt: '2026-06-01T00:00:00.000Z',
  readAt: status === 'read' ? '2026-06-01T01:00:00.000Z' : null,
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('loadList', () => {
  it('목록·커서·안읽음 카운트를 채우고 loading 을 해제한다', async () => {
    list.mockResolvedValue({ items: [dto('3'), dto('2')], nextCursor: '2', unreadCount: 2 });
    const store = useNotificationCenter();

    await store.loadList();

    expect(store.items).toHaveLength(2);
    expect(store.nextCursor).toBe('2');
    expect(store.unreadCount).toBe(2);
    expect(store.loading).toBe(false);
  });
});

describe('loadMore', () => {
  it('nextCursor 가 있으면 다음 페이지를 이어붙인다', async () => {
    list.mockResolvedValueOnce({ items: [dto('3')], nextCursor: '3', unreadCount: 1 });
    const store = useNotificationCenter();
    await store.loadList();

    list.mockResolvedValueOnce({ items: [dto('2'), dto('1')], nextCursor: null, unreadCount: 1 });
    await store.loadMore();

    expect(store.items.map((n) => n.id)).toEqual(['3', '2', '1']);
    expect(store.nextCursor).toBeNull();
  });

  it('nextCursor 가 null 이면 추가 요청을 보내지 않는다', async () => {
    const store = useNotificationCenter();
    store.nextCursor = null;
    await store.loadMore();
    expect(list).not.toHaveBeenCalled();
  });
});

describe('markRead — 읽음 상태 전이', () => {
  it('해당 항목을 서버가 돌려준 read DTO 로 교체하고 안읽음 카운트를 재조회한다', async () => {
    list.mockResolvedValue({ items: [dto('3'), dto('2')], nextCursor: null, unreadCount: 2 });
    const store = useNotificationCenter();
    await store.loadList();

    markRead.mockResolvedValue(dto('3', 'read'));
    unreadCount.mockResolvedValue(1);

    await store.markRead('3');

    const updated = store.items.find((n) => n.id === '3')!;
    expect(updated.status).toBe('read');
    expect(updated.readAt).not.toBeNull();
    expect(store.unreadCount).toBe(1);
    expect(markRead).toHaveBeenCalledWith('3');
  });
});

describe('markAllRead — 전체 읽음 전이', () => {
  it('unread 항목을 모두 read 로 바꾸고 카운트를 0 으로 만든다', async () => {
    list.mockResolvedValue({ items: [dto('3'), dto('2'), dto('1', 'read')], nextCursor: null, unreadCount: 2 });
    const store = useNotificationCenter();
    await store.loadList();

    markAllRead.mockResolvedValue(2);
    await store.markAllRead();

    expect(store.items.every((n) => n.status === 'read')).toBe(true);
    expect(store.unreadCount).toBe(0);
  });
});

describe('폴링(startPolling/stopPolling)', () => {
  afterEach(() => {
    useNotificationCenter().stopPolling();
    vi.useRealTimers();
  });

  it('시작 즉시 1회 조회하고, 30초마다 안읽음 카운트를 재조회한다', async () => {
    vi.useFakeTimers();
    unreadCount.mockResolvedValue(5);
    const store = useNotificationCenter();

    store.startPolling();
    await vi.advanceTimersByTimeAsync(0); // 즉시 1회
    expect(unreadCount).toHaveBeenCalledTimes(1);
    expect(store.unreadCount).toBe(5);

    await vi.advanceTimersByTimeAsync(30_000); // +1
    await vi.advanceTimersByTimeAsync(30_000); // +1
    expect(unreadCount).toHaveBeenCalledTimes(3);
  });

  it('중복 startPolling 은 타이머를 하나만 유지한다', async () => {
    vi.useFakeTimers();
    unreadCount.mockResolvedValue(0);
    const store = useNotificationCenter();

    store.startPolling();
    store.startPolling(); // 가드로 무시
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    // 즉시 1 + 30초 1 = 2 (타이머가 둘이면 3 이상)
    expect(unreadCount).toHaveBeenCalledTimes(2);
  });
});
