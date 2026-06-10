-- 002-notification-system — T037
-- delivery_logs / notifications 기반 운영 지표 & Success Criteria 검증 쿼리.
-- 애플리케이션 측 자동 집계는 src/services/notification/metrics.ts (워커가 1시간 주기 로깅).
-- 아래는 수동 검증·대시보드용 원본 SQL. :window 는 분 단위(예: 60).

-- ============================================================
-- SC-01: 인앱 알림이 이벤트 후 5초 이내 도달하는 비율(목표 ≥ 95%)
--   지연 = notifications.created_at → 첫 IN_APP SENT delivery_logs.created_at
-- ============================================================
SELECT
  COUNT(*)                              AS in_app_total,
  SUM(latency_ms <= 5000)               AS within_5s,
  ROUND(100 * SUM(latency_ms <= 5000) / NULLIF(COUNT(*), 0), 2) AS pct_within_5s
FROM (
  SELECT TIMESTAMPDIFF(MICROSECOND, n.created_at, MIN(d.created_at)) / 1000 AS latency_ms
  FROM notifications n
  JOIN delivery_logs d
    ON d.notification_id = n.id AND d.channel = 'IN_APP' AND d.result = 'SENT'
  WHERE n.created_at >= NOW(3) - INTERVAL 60 MINUTE
  GROUP BY n.id
) t;

-- ============================================================
-- SC-02: 긴급(CRITICAL) 알림이 1분 이내 1개 채널 이상으로 전달된 비율(목표 ≥ 99%)
-- ============================================================
SELECT
  COUNT(*)                              AS critical_total,
  SUM(latency_ms <= 60000)              AS within_1m,
  ROUND(100 * SUM(latency_ms <= 60000) / NULLIF(COUNT(*), 0), 2) AS pct_within_1m
FROM (
  SELECT TIMESTAMPDIFF(MICROSECOND, n.created_at, MIN(d.created_at)) / 1000 AS latency_ms
  FROM notifications n
  JOIN delivery_logs d ON d.notification_id = n.id AND d.result = 'SENT'
  WHERE n.priority = 'CRITICAL' AND n.created_at >= NOW(3) - INTERVAL 60 MINUTE
  GROUP BY n.id
) t;

-- ============================================================
-- SC-05: 중복(5분 내 동일 이벤트) 비율(목표 < 1%)
--   dedup 으로 묶인 이벤트(group_count-1) 가 전체 이벤트 중 차지하는 비율.
--   비율이 높을수록 "중복 폭주"를 그만큼 억제했다는 의미(억제 효과 가시화).
-- ============================================================
SELECT
  COALESCE(SUM(group_count), 0)                                              AS events_total,
  COALESCE(SUM(group_count - 1), 0)                                          AS deduped_events,
  ROUND(100 * COALESCE(SUM(group_count - 1), 0) / NULLIF(SUM(group_count), 0), 2) AS pct_deduped
FROM notifications
WHERE created_at >= NOW(3) - INTERVAL 60 MINUTE;

-- ============================================================
-- 보조 지표: 채널별 전송 결과 분포 & 실패율
-- ============================================================
SELECT
  channel,
  result,
  COUNT(*) AS cnt
FROM delivery_logs
WHERE created_at >= NOW(3) - INTERVAL 60 MINUTE
GROUP BY channel, result
ORDER BY channel, result;

-- 전체 실패율
SELECT
  COUNT(*)                                                          AS delivery_total,
  SUM(result = 'FAILED')                                           AS failed,
  ROUND(100 * SUM(result = 'FAILED') / NULLIF(COUNT(*), 0), 2)      AS failure_rate_pct
FROM delivery_logs
WHERE created_at >= NOW(3) - INTERVAL 60 MINUTE;
