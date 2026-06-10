import { getPool } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';

// 002-notification-system — T037
// delivery_logs 기반 운영 지표 측정. 주기적으로 집계해 로깅한다(SC-01/02/05 모니터링).
//  - SC-01: 인앱 알림 95%가 5초 이내 도달
//  - SC-02: 긴급(CRITICAL) 99%가 1분 이내 1개 채널 이상 전달
//  - SC-05: 중복(5분 내 동일 이벤트) 비율 1% 미만 → dedup grouping 으로 제어

export interface NotificationMetrics {
  windowMin: number;
  // 전송 신뢰성
  deliveryTotal: number;
  deliveryFailed: number;
  failureRate: number; // 0..1
  // SC-01: 인앱 5초 내 도달 비율
  inAppTotal: number;
  inAppWithin5s: number;
  inAppWithin5sRatio: number | null; // 표본 없으면 null
  // SC-02: 긴급 1분 내 도달 비율
  criticalTotal: number;
  criticalWithin1m: number;
  criticalWithin1mRatio: number | null;
  // SC-05: dedup 으로 묶인(억제된) 중복 비율
  eventsTotal: number;
  dedupedEvents: number;
  duplicateRatio: number | null;
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export async function collectMetrics(windowMin = 60): Promise<NotificationMetrics> {
  const pool = getPool();

  // 전송 결과 분포(채널 무관)
  const [dlv] = (await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(result = 'FAILED') AS failed
     FROM delivery_logs
     WHERE created_at >= NOW(3) - INTERVAL ? MINUTE`,
    [windowMin],
  )) as unknown as [Array<{ total: number; failed: number | null }>];

  // SC-01: 인앱 첫 SENT 까지 지연(ms) ≤ 5000 비율
  const [inApp] = (await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(latency_ms <= 5000) AS within
     FROM (
       SELECT TIMESTAMPDIFF(MICROSECOND, n.created_at, MIN(d.created_at)) / 1000 AS latency_ms
       FROM notifications n
       JOIN delivery_logs d
         ON d.notification_id = n.id AND d.channel = 'IN_APP' AND d.result = 'SENT'
       WHERE n.created_at >= NOW(3) - INTERVAL ? MINUTE
       GROUP BY n.id
     ) t`,
    [windowMin],
  )) as unknown as [Array<{ total: number; within: number | null }>];

  // SC-02: 긴급 알림이 1분 내 어느 채널로든 전달(SENT)된 비율
  const [crit] = (await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(latency_ms <= 60000) AS within
     FROM (
       SELECT TIMESTAMPDIFF(MICROSECOND, n.created_at, MIN(d.created_at)) / 1000 AS latency_ms
       FROM notifications n
       JOIN delivery_logs d ON d.notification_id = n.id AND d.result = 'SENT'
       WHERE n.priority = 'CRITICAL' AND n.created_at >= NOW(3) - INTERVAL ? MINUTE
       GROUP BY n.id
     ) t`,
    [windowMin],
  )) as unknown as [Array<{ total: number; within: number | null }>];

  // SC-05: dedup 으로 한 알림에 묶인 추가 이벤트(group_count-1)의 전체 대비 비율
  const [dedup] = (await pool.query(
    `SELECT
       COALESCE(SUM(group_count), 0) AS events,
       COALESCE(SUM(group_count - 1), 0) AS deduped
     FROM notifications
     WHERE created_at >= NOW(3) - INTERVAL ? MINUTE`,
    [windowMin],
  )) as unknown as [Array<{ events: number; deduped: number }>];

  const deliveryTotal = Number(dlv[0]?.total ?? 0);
  const deliveryFailed = Number(dlv[0]?.failed ?? 0);
  const inAppTotal = Number(inApp[0]?.total ?? 0);
  const inAppWithin5s = Number(inApp[0]?.within ?? 0);
  const criticalTotal = Number(crit[0]?.total ?? 0);
  const criticalWithin1m = Number(crit[0]?.within ?? 0);
  const eventsTotal = Number(dedup[0]?.events ?? 0);
  const dedupedEvents = Number(dedup[0]?.deduped ?? 0);

  return {
    windowMin,
    deliveryTotal,
    deliveryFailed,
    failureRate: ratio(deliveryFailed, deliveryTotal) ?? 0,
    inAppTotal,
    inAppWithin5s,
    inAppWithin5sRatio: ratio(inAppWithin5s, inAppTotal),
    criticalTotal,
    criticalWithin1m,
    criticalWithin1mRatio: ratio(criticalWithin1m, criticalTotal),
    eventsTotal,
    dedupedEvents,
    duplicateRatio: ratio(dedupedEvents, eventsTotal),
  };
}

// 집계 후 구조화 로깅. 운영 대시보드/알람이 이 로그를 수집한다.
export async function logMetrics(windowMin = 60): Promise<void> {
  try {
    const m = await collectMetrics(windowMin);
    logger.info({ notificationMetrics: m }, 'notification metrics');
  } catch (e) {
    logger.error({ err: e }, 'notification metrics 집계 실패');
  }
}
