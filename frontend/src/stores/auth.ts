import { defineStore } from 'pinia';
import { api, writeAccessToken } from '../services/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'PROFESSOR' | 'ADMIN';
  emailVerified: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    user: null as User | null,
  }),
  persist: {
    storage: sessionStorage,
    paths: ['accessToken', 'user'],
  },
  actions: {
    setToken(token: string | null) {
      this.accessToken = token;
      writeAccessToken(token);
    },
    async signup(payload: { email: string; password: string; name: string; consents: string[] }) {
      const { data } = await api.post('/auth/signup', payload);
      return data;
    },
    async login(email: string, password: string) {
      const { data } = await api.post<{ accessToken: string; user: User }>('/auth/login', {
        email,
        password,
      });
      this.setToken(data.accessToken);
      this.user = data.user;
      return data;
    },
    async logout() {
      try {
        await api.post('/auth/logout');
      } catch {
        /* refresh 만료 등 무시 */
      }
      this.setToken(null);
      this.user = null;
    },
    async fetchMe() {
      const { data } = await api.get<User>('/users/me');
      this.user = data;
      return data;
    },
  },
});
