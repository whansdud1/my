import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { closePool } from './db/connection.js';
import { registerNotificationHandlers } from './services/notification/index.js';
import { startNotificationWorker, stopNotificationWorker } from './jobs/notificationWorker.js';
import { startScheduleReminderWorker, stopScheduleReminderWorker } from './jobs/scheduleReminderWorker.js';

const app = createApp();

// 002-notification-system — 이벤트 구독 등록 + outbox 워커 기동
registerNotificationHandlers();
startNotificationWorker();
// 003-schedule-coordination — 리마인더 워커 기동
startScheduleReminderWorker();

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.env, publicBaseUrl: config.publicBaseUrl },
    `UniTeam backend listening on :${config.port}`,
  );
});

// Graceful shutdown — SIGTERM/SIGINT 받으면 30s 내 종료
const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutdown initiated');
  stopNotificationWorker();
  stopScheduleReminderWorker();
  server.close(async (err) => {
    if (err) logger.error({ err }, 'server.close error');
    await closePool().catch((e) => logger.error({ err: e }, 'pool close error'));
    process.exit(err ? 1 : 0);
  });
  // safety net
  setTimeout(() => {
    logger.error('forced shutdown after 30s');
    process.exit(1);
  }, 30_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException');
  shutdown('uncaughtException');
});
