import { api } from './api';

// 016 — 팀 활동 모니터링 + 만족도/효율 분석 대시보드(To-Be ④·⑥)

export type ActivityType = 'MEETING_JOIN' | 'UPLOAD' | 'MESSAGE_RESP' | 'DEADLINE_MET' | 'DEADLINE_MISS';

export interface DashboardMember {
  userId: string;
  name: string;
  role: string;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface RiskFactor {
  key: 'OVERDUE' | 'IMBALANCE' | 'TOXIC' | 'INACTIVITY';
  label: string;
  detail: string;
  weight: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  factors: RiskFactor[];
  summary: string;
  assessedAt: string;
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
  risk: RiskAssessment;
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

// 프리미엄 — AI 협업 분석 인사이트
export interface Insight {
  severity: 'positive' | 'info' | 'warn' | 'critical';
  title: string;
  detail: string;
  action: string;
}
export interface InsightReport {
  headline: string;
  riskLevel: string;
  riskScore: number;
  insights: Insight[];
  generatedAt: string;
}

export const dashboardApi = {
  async get(projectId: string, windowDays = 14): Promise<ProjectDashboard> {
    const { data } = await api.get<ProjectDashboard>(`/projects/${projectId}/dashboard`, { params: { windowDays } });
    return data;
  },
  async insights(projectId: string, windowDays = 14): Promise<InsightReport> {
    const { data } = await api.get<InsightReport>(`/projects/${projectId}/insights`, { params: { windowDays } });
    return data;
  },
};
