import { api } from './api';

// 002-notification-system — T016 알림 API 클라이언트

export interface NotificationDto {
  id: string;
  type: string;
  priority: 'critical' | 'normal' | 'info';
  title: string;
  body: string;
  deepLink: string | null;
  groupCount: number;
  status: 'unread' | 'read' | 'archived';
  createdAt: string;
  readAt: string | null;
}

export interface NotificationListResponse {
  items: NotificationDto[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface ChannelPreference {
  type: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  mandatory: boolean;
}

export interface GlobalSettings {
  dndEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
}

export interface PreferenceBundle {
  preferences: ChannelPreference[];
  global: GlobalSettings;
}

export const notificationApi = {
  async list(params: { status?: string; cursor?: string; limit?: number } = {}): Promise<NotificationListResponse> {
    const { data } = await api.get<NotificationListResponse>('/notifications', { params });
    return data;
  },

  async unreadCount(): Promise<number> {
    const { data } = await api.get<{ unreadCount: number }>('/notifications/unread-count');
    return data.unreadCount;
  },

  async markRead(id: string): Promise<NotificationDto> {
    const { data } = await api.post<NotificationDto>(`/notifications/${id}/read`);
    return data;
  },

  async markAllRead(): Promise<number> {
    const { data } = await api.post<{ updated: number }>('/notifications/read-all');
    return data.updated;
  },

  async getPreferences(): Promise<PreferenceBundle> {
    const { data } = await api.get<PreferenceBundle>('/notifications/preferences');
    return data;
  },

  async updatePreferences(bundle: PreferenceBundle): Promise<PreferenceBundle> {
    const { data } = await api.put<PreferenceBundle>('/notifications/preferences', bundle);
    return data;
  },
};
