import { getPool } from '../db/connection.js';

// 005_subscription — 프리미엄 구독 저장소.
// 한 사용자당 한 행(user_id PK). tier=PREMIUM 이고 ends_at 이 미래면 '구독 중'으로 본다.
// billing_state: ACTIVE(자동갱신) / CANCELED(해지 예약 — ends_at 까지는 유지) / NONE(무료).

export type Tier = 'FREE' | 'PREMIUM';
export type BillingState = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export interface SubscriptionRow {
  user_id: number;
  tier: Tier;
  started_at: Date | null;
  ends_at: Date | null;
  billing_state: BillingState;
  pg_provider: string | null;
  pg_subscription_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function getByUser(userId: number): Promise<SubscriptionRow | null> {
  const [rows] = (await getPool().query(`SELECT * FROM subscriptions WHERE user_id = ? LIMIT 1`, [
    userId,
  ])) as unknown as [SubscriptionRow[]];
  return rows[0] ?? null;
}

// 구독 중 판정 — tier=PREMIUM 이고 만료(ends_at) 전. (해지 예약이어도 ends_at 까지는 true)
export async function isPremium(userId: number): Promise<boolean> {
  const [rows] = (await getPool().query(
    `SELECT 1 FROM subscriptions
       WHERE user_id = ? AND tier = 'PREMIUM' AND (ends_at IS NULL OR ends_at > NOW(3)) LIMIT 1`,
    [userId],
  )) as unknown as [Array<{ 1: number }>];
  return rows.length > 0;
}

// 여러 사용자의 프리미엄 여부를 한 번에(지원자 정렬 등 배치용).
export async function premiumUserIds(userIds: number[]): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  const ph = userIds.map(() => '?').join(',');
  const [rows] = (await getPool().query(
    `SELECT user_id FROM subscriptions
       WHERE user_id IN (${ph}) AND tier = 'PREMIUM' AND (ends_at IS NULL OR ends_at > NOW(3))`,
    userIds,
  )) as unknown as [Array<{ user_id: number }>];
  return new Set(rows.map((r) => Number(r.user_id)));
}

// 신규 구독/재구독 — PREMIUM 활성화, 종료일 = now + days.
export async function activate(userId: number, days: number, provider: string): Promise<void> {
  await getPool().query(
    `INSERT INTO subscriptions (user_id, tier, started_at, ends_at, billing_state, pg_provider)
       VALUES (?, 'PREMIUM', NOW(3), NOW(3) + INTERVAL ? DAY, 'ACTIVE', ?)
     ON DUPLICATE KEY UPDATE
       tier = 'PREMIUM',
       started_at = COALESCE(started_at, NOW(3)),
       ends_at = NOW(3) + INTERVAL ? DAY,
       billing_state = 'ACTIVE',
       pg_provider = VALUES(pg_provider)`,
    [userId, days, provider, days],
  );
}

// 자동 갱신 — 종료일을 현재 종료일(또는 now) 기준 +days 연장.
export async function extend(userId: number, days: number): Promise<void> {
  await getPool().query(
    `UPDATE subscriptions
       SET ends_at = GREATEST(COALESCE(ends_at, NOW(3)), NOW(3)) + INTERVAL ? DAY,
           billing_state = 'ACTIVE'
       WHERE user_id = ?`,
    [days, userId],
  );
}

// 해지 예약 — billing_state=CANCELED. tier/ends_at 은 유지(만료일까지 프리미엄 유지).
export async function cancel(userId: number): Promise<void> {
  await getPool().query(`UPDATE subscriptions SET billing_state = 'CANCELED' WHERE user_id = ?`, [
    userId,
  ]);
}

// 만료 처리 — FREE 로 강등.
export async function downgradeToFree(userId: number): Promise<void> {
  await getPool().query(
    `UPDATE subscriptions SET tier = 'FREE', billing_state = 'NONE' WHERE user_id = ?`,
    [userId],
  );
}

// 자동 갱신 대상 — ACTIVE 인데 종료일이 지난 구독.
export async function dueForRenewal(): Promise<SubscriptionRow[]> {
  const [rows] = (await getPool().query(
    `SELECT * FROM subscriptions
       WHERE tier = 'PREMIUM' AND billing_state = 'ACTIVE' AND ends_at IS NOT NULL AND ends_at <= NOW(3)`,
  )) as unknown as [SubscriptionRow[]];
  return rows;
}

// 만료 대상 — 해지 예약(CANCELED)이고 종료일이 지난 구독.
export async function expiredCanceled(): Promise<SubscriptionRow[]> {
  const [rows] = (await getPool().query(
    `SELECT * FROM subscriptions
       WHERE tier = 'PREMIUM' AND billing_state = 'CANCELED' AND ends_at IS NOT NULL AND ends_at <= NOW(3)`,
  )) as unknown as [SubscriptionRow[]];
  return rows;
}
