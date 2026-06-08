import { defineStore } from 'pinia';
import { api } from '../services/api';

export interface RoleStatus {
  role: string;
  needed: number;
  filled: number;
  remaining: number;
}

export interface Applicant {
  userId: string;
  name: string;
  role: string;
  appliedAt: string | null;
}

export interface MyProject {
  id: string;
  title: string;
  status: 'RECRUIT' | 'RUNNING' | 'CLOSED' | 'ARCHIVED';
  endDate: string | null;
  myRole: string;
  myState: 'INVITED' | 'ACCEPTED' | 'APPLIED';
  started: boolean;
  recruitClosed: boolean;
  finished: boolean;
}

export interface MyMembership {
  role: string;
  state: 'INVITED' | 'ACCEPTED' | 'LEFT' | 'REJECTED' | 'APPLIED';
}

export interface Project {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  status: 'OPEN' | 'RUNNING' | 'COMPLETED' | 'ARCHIVED' | 'RECRUIT' | 'CLOSED';
  capacity: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  // GET /projects/:id 에서만 채워지는 필드
  roles?: RoleStatus[];
  isOwner?: boolean;
  myMembership?: MyMembership | null;
  recruitClosed?: boolean;
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
    async create(
      payload: Partial<Project> & {
        requiredRoles?: Array<{ role: string; count: number }>;
        preferredTimeNote?: string;
      },
    ) {
      const { data } = await api.post<Project>('/projects', payload);
      this.list.unshift(data);
      return data;
    },
    // 내가 지원/참여 중인 프로젝트 목록
    async fetchMine() {
      const { data } = await api.get<MyProject[]>('/projects/mine');
      return data;
    },
    // 지원자: 남은 역할 중 하나를 골라 지원
    async apply(id: string, role: string) {
      const { data } = await api.post(`/projects/${id}/apply`, { role });
      return data;
    },
    // 팀장: 지원자(대기) 목록 조회
    async fetchApplicants(id: string) {
      const { data } = await api.get<Applicant[]>(`/projects/${id}/applicants`);
      return data;
    },
    // 팀장: 지원 수락/거절
    async decide(id: string, userId: string, action: 'ACCEPT' | 'REJECT') {
      const { data } = await api.post(`/projects/${id}/applicants/${userId}/decision`, { action });
      return data;
    },
    // 팀장: 프로젝트 시작(RECRUIT→RUNNING) → 팀 채팅 오픈
    async start(id: string) {
      const { data } = await api.post<Project>(`/projects/${id}/start`);
      if (this.current?.id === id) this.current = data;
      return data;
    },
    // 팀장: 프로젝트 완료(RUNNING→CLOSED) → 팀원 별점 평가 오픈
    async complete(id: string) {
      const { data } = await api.post<Project>(`/projects/${id}/complete`);
      if (this.current?.id === id) this.current = data;
      return data;
    },
    // 팀장: 모집 중 프로젝트 삭제
    async remove(id: string) {
      await api.delete(`/projects/${id}`);
      this.list = this.list.filter((p) => p.id !== id);
    },
  },
});
