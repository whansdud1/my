import { api } from './api';

// 003-schedule-coordination — T008

export interface CommonSlot {
  weekday: number;
  startMin: number;
  endMin: number;
  availableCount: number;
  totalMembers: number;
}

export interface Rsvp {
  userId: string;
  name: string;
  response: 'ATTEND' | 'DECLINE' | 'PENDING';
}

export interface ScheduleEvent {
  id: string;
  projectId: string;
  type: 'MEETING' | 'DEADLINE' | 'MILESTONE';
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: 'SCHEDULED' | 'CANCELLED';
  rsvps: Rsvp[];
}

export interface EventCreate {
  type: ScheduleEvent['type'];
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  reminderOffsetMin?: number;
  repeatWeeks?: number;
}

export interface MeetingRecommendation {
  weekday: number;
  weekdayLabel: string;
  startMin: number;
  endMin: number;
  windowEndMin: number;
  timeLabel: string;
  availableCount: number;
  totalMembers: number;
  allAvailable: boolean;
  score: number;
  reasons: string[];
}

export interface OptimizeResult {
  totalMembers: number;
  durationMin: number;
  workTimePref: 'DAY' | 'NIGHT' | 'ANY';
  recommendations: MeetingRecommendation[];
  note: string;
}

export const scheduleApi = {
  async commonSlots(projectId: string, minMinutes = 30): Promise<{ totalMembers: number; slots: CommonSlot[] }> {
    const { data } = await api.get(`/projects/${projectId}/schedule/common-slots`, { params: { minMinutes } });
    return data;
  },
  // 프리미엄: AI 일정 최적화(최적 회의시간 추천)
  async optimize(projectId: string, durationMin = 60): Promise<OptimizeResult> {
    const { data } = await api.get<OptimizeResult>(`/projects/${projectId}/schedule/optimize`, {
      params: { durationMin },
    });
    return data;
  },
  async listEvents(projectId: string): Promise<ScheduleEvent[]> {
    const { data } = await api.get<ScheduleEvent[]>(`/projects/${projectId}/schedule/events`);
    return data;
  },
  async createEvent(projectId: string, body: EventCreate): Promise<ScheduleEvent> {
    const { data } = await api.post<ScheduleEvent>(`/projects/${projectId}/schedule/events`, body);
    return data;
  },
  async updateEvent(eid: string, body: Partial<EventCreate>): Promise<ScheduleEvent> {
    const { data } = await api.patch<ScheduleEvent>(`/schedule/events/${eid}`, body);
    return data;
  },
  async cancelEvent(eid: string): Promise<void> {
    await api.delete(`/schedule/events/${eid}`);
  },
  async rsvp(eid: string, response: 'ATTEND' | 'DECLINE'): Promise<void> {
    await api.post(`/schedule/events/${eid}/rsvp`, { response });
  },
};
