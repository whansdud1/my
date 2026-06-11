import { logger } from '../lib/logger.js';
import { processBillingCycle } from '../services/subscription/index.js';

// 프리미엄 구독 자동 갱신/만료 워커.
// ACTIVE 구독이 종료일을 지나면 모의 결제로 30일 연장하고,
// 해지 예약(CANCELED)이 종료일을 지나면 무료로 강등한다.
// 결제 주기(일)에 비해 자주 돌 필요는 없으나, 데모 편의를 위해 기본 1시간마다 점검한다.

const INTERVAL_MS = Number.parseInt(process.env.SUBSCRIPTION_WORKER_INTERVAL_MS ?? '3600000', 10);

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await processBillingCycle();
  } catch (e) {
    logger.error({ err: e }, 'subscriptionWorker tick 실패');
  } finally {
    running = false;
  }
}

export function startSubscriptionWorker(): void {
  if (timer) return;
  void tick(); // 부팅 직후 1회 점검
  timer = setInterval(() => void tick(), INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, 'subscriptionWorker 시작');
}

export function stopSubscriptionWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
