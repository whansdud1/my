import { defineStore } from 'pinia';
import { notificationApi, type NotificationDto } from '../services/notificationApi';

// 002-notification-system — T017 알림 센터 스토어
// WA-02: 실시간 대신 30초 폴링 + 안읽음 카운트. 서버가 읽음 상태의 권위.

const POLL_MS = 30_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useNotificationCenter = defineStore('notificationCenter', {
  state: () => ({
    items: [] as NotificationDto[],
    unreadCount: 0,
    nextCursor: null as string | null,
    loading: false,
    open: false,
  }),
  actions: {
    async fetchUnread() {
      try {
        this.unreadCount = await notificationApi.unreadCount();
      } catch {
        /* 폴링 실패는 조용히 무시 */
      }
    },

    async loadList() {
      this.loading = true;
      try {
        const res = await notificationApi.list({ limit: 20 });
        this.items = res.items;
        this.nextCursor = res.nextCursor;
        this.unreadCount = res.unreadCount;
      } finally {
        this.loading = false;
      }
    },

    async loadMore() {
      if (!this.nextCursor) return;
      const res = await notificationApi.list({ cursor: this.nextCursor, limit: 20 });
      this.items.push(...res.items);
      this.nextCursor = res.nextCursor;
    },

    async markRead(id: string) {
      const updated = await notificationApi.markRead(id);
      const idx = this.items.findIndex((n) => n.id === id);
      if (idx >= 0) this.items[idx] = updated;
      this.unreadCount = await notificationApi.unreadCount();
    },

    async markAllRead() {
      await notificationApi.markAllRead();
      this.items = this.items.map((n) => (n.status === 'unread' ? { ...n, status: 'read' as const } : n));
      this.unreadCount = 0;
    },

    toggle() {
      this.open = !this.open;
      if (this.open) void this.loadList();
    },

    startPolling() {
      if (pollTimer) return;
      void this.fetchUnread();
      pollTimer = setInterval(() => void this.fetchUnread(), POLL_MS);
    },

    stopPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    },
  },
});
