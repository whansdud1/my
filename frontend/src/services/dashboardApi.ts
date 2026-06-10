import { api } from './api';

// 016 — 팀 활동 모니터링 + 만족도/효율 분석 대시보드(To-Be ④·⑥)

export type ActivityType = 'MEETING_JOIN' | 'UPLOAD' | 'MESSAGE_RESP' | 'DEADLINE_MET' | 'DEADLINE_MISS';

export interface DashboardMember {
  userId: string;
  name: string;
  role: string;
}

export interface ProjectDashboard {
  project: { id: string; title: string; status: string; startsAt: string | null; endsAt: string | null };
  windowDays: number;
  members: DashboardMember[];
  activity: {
    totals: Record<ActivityType, number>;
    byMember: Array<{ userId: string; name: string; total: number; byType: Record<ActivityType, number> }>;
    recent: Array<{ userId: string; name: string; activityType: ActivityType; occurredAt: string }>;
  };
  tasks: {
    stats: { total: number; todo: number; inProgress: number; done: number; overdue: number };
    byMember: Array<{ userId: string; name: string; assigned: number; done: number; completionRate: number }>;
  };
  schedule: {
    upcoming: Array<{ id: string; type: string; title: string; startsAt: string }>;
  };
  analysis: {
    evaluation: {
      count: number;
      avgSatisfaction: number;
      avgContribution: number;
      avgCommunication: number;
      avgResponsibility: number;
      overall: number;
    } | null;
    peerStars: { avg: number; count: number } | null;
    efficiency: Array<{
      userId: string;
      name: string;
      total: number;
      meetingRate: number;
      uploadRate: number;
      deadlineRate: number;
      responseScore: number;
      completionScore: number;
    }>;
  };
}

export const dashboardApi = {
  async get(projectId: string, windowDays = 14): Promise<ProjectDashboard> {
    const { data } = await api.get<ProjectDashboard>(`/projects/${projectId}/dashboard`, { params: { windowDays } });
    return data;
  },
};
