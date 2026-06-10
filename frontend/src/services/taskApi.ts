import { api } from './api';

// 015 — 프로젝트 업무/태스크 관리(To-Be ③)

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: TaskStatus;
  dueDate: string | null; // 'YYYY-MM-DD'
  createdBy: string;
  completedAt: string | null;
  createdAt: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  assigneeId?: number | null;
  dueDate?: string | null;
}

export type TaskUpdate = Partial<{
  title: string;
  description: string | null;
  assigneeId: number | null;
  status: TaskStatus;
  dueDate: string | null;
}>;

export const taskApi = {
  async list(projectId: string): Promise<ProjectTask[]> {
    const { data } = await api.get<ProjectTask[]>(`/projects/${projectId}/tasks`);
    return data;
  },
  async create(projectId: string, body: TaskCreate): Promise<ProjectTask> {
    const { data } = await api.post<ProjectTask>(`/projects/${projectId}/tasks`, body);
    return data;
  },
  async update(taskId: string, body: TaskUpdate): Promise<ProjectTask> {
    const { data } = await api.patch<ProjectTask>(`/tasks/${taskId}`, body);
    return data;
  },
  async remove(taskId: string): Promise<void> {
    await api.delete(`/tasks/${taskId}`);
  },
};
