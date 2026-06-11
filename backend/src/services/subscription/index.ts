import * as repo from '../../repositories/subscriptions.js';
import { notify } from '../notification/index.js';
import { logger } from '../../lib/logger.js';

// 프리미엄 구독 서비스.
// 결제는 모의(mock) — 실제 PG 연동 없이 '구독하기' 시 즉시 활성화하고, 갱신·만료를 워커가 시뮬레이션한다.
// 가격 4,900원 / 30일 주기(월 갱신).

export const PRICE_KRW = 4900;
export const PERIOD_DAYS = 30;
const PROVIDER = 'mock';

// 프리미엄으로 제공되는 기능(프론트 안내·게이팅 문구 공용).
export const PREMIUM_FEATURES = [
  'AI 기반 일정 최적화',
  '프로젝트 진행 관리 및 AI 협업 분석 인사이트',
  '팀 정원 초과 시 우선 팀 매칭',
] as const;

export interface SubscriptionStatus {
  tier: repo.Tier;
  premium: boolean; // 현재 프리미엄 혜택 사용 가능 여부
  billingState: repo.BillingState;
  autoRenew: boolean; // ACTIVE = 자동 갱신 예정
  startedAt: string | null;
  endsAt: string | null;
  priceKrw: number;
  periodDays: number;
  features: string[];
}

function toStatus(row: repo.SubscriptionRow | null): SubscriptionStatus {
  const now = Date.now();
  const endsMs = row?.ends_at ? new Date(row.ends_at).getTime() : null;
  const premium = !!row && row.tier === 'PREMIUM' && (endsMs === null || endsMs > now);
  return {
    tier: row?.tier ?? 'FREE',
    premium,
    billingState: row?.billing_state ?? 'NONE',
    autoRenew: row?.billing_state === 'ACTIVE',
    startedAt: row?.started_at ? new Date(row.started_at).toISOString() : null,
    endsAt: row?.ends_at ? new Date(row.ends_at).toISOString() : null,
    priceKrw: PRICE_KRW,
    periodDays: PERIOD_DAYS,
    features: [...PREMIUM_FEATURES],
  };
}

export async function isPremium(userId: number): Promise<boolean> {
  return repo.isPremium(userId);
}

export async function getStatus(userId: number): Promise<SubscriptionStatus> {
  return toStatus(await repo.getByUser(userId));
}

// 구독하기(모의 결제). 이미 프리미엄이면 그대로 두고 상태만 반환(중복 결제 방지).
export async function subscribe(userId: number): Promise<SubscriptionStatus> {
  if (await repo.isPremium(userId)) {
    // 해지 예약 상태였다면 자동갱신 재개(연장 없이 ACTIVE 로만 되돌림은 activate 가 종료일을 새로 잡으므로 분기)
    const cur = await repo.getByUser(userId);
    if (cur?.billing_state === 'CANCELED') {
      await repo.extend(userId, 0); // billing_state=ACTIVE 로 복귀(연장 0일)
    }
    return getStatus(userId);
  }
  // mock 결제 성공 가정 → 30일 활성화
  await repo.activate(userId, PERIOD_DAYS, PROVIDER);
  logger.info({ userId, priceKrw: PRICE_KRW }, 'subscription: 모의 결제 활성화');
  notify('SYSTEM_NOTICE', {
    recipientId: userId,
    title: '프리미엄 구독이 시작되었습니다',
    body: `월 ${PRICE_KRW.toLocaleString()}원 프리미엄이 활성화되었습니다. AI 일정 최적화·협업 분석·우선 매칭을 이용하세요.`,
    deepLink: '/subscription',
    targetRef: `subscription:${userId}`,
  });
  return getStatus(userId);
}

// 해지(예약) — 남은 기간(ends_at)까지는 프리미엄 유지, 이후 자동 갱신 중단.
export async function cancel(userId: number): Promise<SubscriptionStatus> {
  const cur = await repo.getByUser(userId);
  if (!cur || cur.tier !== 'PREMIUM') return getStatus(userId);
  await repo.cancel(userId);
  notify('SYSTEM_NOTICE', {
    recipientId: userId,
    title: '프리미엄 구독 해지 예약됨',
    body: `남은 이용 기간이 끝나면 자동으로 무료 플랜으로 전환됩니다.`,
    deepLink: '/subscription',
    targetRef: `subscription:${userId}`,
  });
  return getStatus(userId);
}

// 워커가 호출 — 자동 갱신 + 만료 처리(모의 결제).
export async function processBillingCycle(): Promise<{ renewed: number; expired: number }> {
  let renewed = 0;
  let expired = 0;

  for (const sub of await repo.dueForRenewal()) {
    // mock 결제 성공 가정 → 30일 연장
    await repo.extend(sub.user_id, PERIOD_DAYS);
    renewed++;
    notify('SYSTEM_NOTICE', {
      recipientId: sub.user_id,
      title: '프리미엄 구독이 갱신되었습니다',
      body: `월 ${PRICE_KRW.toLocaleString()}원이 결제되어 30일 연장되었습니다.`,
      deepLink: '/subscription',
      targetRef: `subscription-renew:${sub.user_id}`,
    });
  }

  for (const sub of await repo.expiredCanceled()) {
    await repo.downgradeToFree(sub.user_id);
    expired++;
    notify('SYSTEM_NOTICE', {
      recipientId: sub.user_id,
      title: '프리미엄 구독이 만료되었습니다',
      body: `무료 플랜으로 전환되었습니다. 다시 구독하면 프리미엄 기능을 이용할 수 있습니다.`,
      deepLink: '/subscription',
      targetRef: `subscription-expire:${sub.user_id}`,
    });
  }

  if (renewed || expired) logger.info({ renewed, expired }, 'subscription billing cycle 처리');
  return { renewed, expired };
}
