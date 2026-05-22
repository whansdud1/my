import { defineStore } from 'pinia';

interface Toast {
  id: number;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

let seq = 0;

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    toasts: [] as Toast[],
    unreadCount: 0,
  }),
  actions: {
    push(level: Toast['level'], message: string, ttlMs = 4000) {
      const id = ++seq;
      this.toasts.push({ id, level, message });
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, ttlMs);
    },
    info(m: string) {
      this.push('info', m);
    },
    success(m: string) {
      this.push('success', m);
    },
    warn(m: string) {
      this.push('warning', m);
    },
    error(m: string) {
      this.push('error', m);
    },
  },
});
