import { defineStore } from 'pinia';
import { api } from '../services/api';

export interface Project {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  status: 'OPEN' | 'RUNNING' | 'COMPLETED' | 'ARCHIVED';
  capacity: number;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export const useProjectStore = defineStore('projects', {
  state: () => ({
    list: [] as Project[],
    current: null as Project | null,
    loading: false,
  }),
  actions: {
    async fetchList(params: { status?: string; q?: string; page?: number } = {}) {
      this.loading = true;
      try {
        const { data } = await api.get<{ items: Project[]; total: number }>('/projects', {
          params,
        });
        this.list = data.items;
        return data;
      } finally {
        this.loading = false;
      }
    },
    async fetchOne(id: string) {
      const { data } = await api.get<Project>(`/projects/${id}`);
      this.current = data;
      return data;
    },
    async create(payload: Partial<Project>) {
      const { data } = await api.post<Project>('/projects', payload);
      this.list.unshift(data);
      return data;
    },
  },
});
