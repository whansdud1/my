import { api } from './api';

// US8 — 관리자 평가 리뷰 악성 탐지 검토 큐 API 클라이언트.

export interface ModerationFlag {
  id: string;
  targetType: 'peer_rating' | 'evaluation';
  targetId: string;
  projectId: string | null;
  raterId: string | null;
  rateeId: string | null;
  kind: 'TOXIC_TEXT' | 'RATING_ANOMALY';
  severity: 'low' | 'medium' | 'high';
  score: number | null;
  snippet: string | null;
  detail: Record<string, unknown> | null;
  state: 'pending' | 'kept' | 'removed';
  createdAt: string;
}

export interface FlagList {
  pendingCount: number;
  flags: ModerationFlag[];
}

export const moderationApi = {
  async list(state: 'pending' | 'kept' | 'removed' | 'all' = 'pending'): Promise<FlagList> {
    const { data } = await api.get<FlagList>('/admin/moderation/flags', { params: { state } });
    return data;
  },

  async resolve(id: string, decision: 'keep' | 'remove'): Promise<void> {
    await api.post(`/admin/moderation/flags/${id}/resolve`, { decision });
  },
};
