import { api } from './api';

// 프리미엄 구독(모의 결제 — 월 4,900원 / 30일 갱신).

export interface SubscriptionStatus {
  tier: 'FREE' | 'PREMIUM';
  premium: boolean;
  billingState: 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  autoRenew: boolean;
  startedAt: string | null;
  endsAt: string | null;
  priceKrw: number;
  periodDays: number;
  features: string[];
}

export const subscriptionApi = {
  async get(): Promise<SubscriptionStatus> {
    const { data } = await api.get<SubscriptionStatus>('/subscription');
    return data;
  },
  async subscribe(): Promise<SubscriptionStatus> {
    const { data } = await api.post<SubscriptionStatus>('/subscription/subscribe');
    return data;
  },
  async cancel(): Promise<SubscriptionStatus> {
    const { data } = await api.post<SubscriptionStatus>('/subscription/cancel');
    return data;
  },
};
