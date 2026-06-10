import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';

import { config } from './config.js';
import { requestId, httpLogger } from './middlewares/logging.js';
import { errorHandler, notFound } from './middlewares/error.js';
import { apiRateLimit } from './middlewares/rate-limit.js';
import { optionalAuth } from './middlewares/auth.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { projectsRouter } from './routes/projects.js';
import { invitesRouter } from './routes/invites.js';
import { evaluationsRouter } from './routes/evaluations.js';
import { notificationsRouter } from './routes/notifications.js';
import { scheduleRouter } from './routes/schedule.js';
import { tasksRouter } from './routes/tasks.js';
import { dashboardRouter } from './routes/dashboard.js';

export function createApp(): Express {
  const app = express();

  // Trust proxy — Nginx (p18.sumzip.com) 뒤에서 X-Forwarded-* 신뢰
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // 동일 origin(Nginx 경유) / curl 등 origin 없음 / 화이트리스트
        if (!origin || config.cors.origins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS blocked: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // API v1 — optionalAuth로 rate limit이 사용자별 키 사용 가능
  app.use('/api/v1', optionalAuth, apiRateLimit);
  app.use('/api/v1', healthRouter);
  app.use('/api/v1', authRouter);
  app.use('/api/v1', usersRouter);
  app.use('/api/v1', projectsRouter);
  app.use('/api/v1', invitesRouter);
  app.use('/api/v1', evaluationsRouter);
  app.use('/api/v1', notificationsRouter);
  app.use('/api/v1', scheduleRouter);
  app.use('/api/v1', tasksRouter);
  app.use('/api/v1', dashboardRouter);

  // 루트는 운영에서는 Nginx가 frontend로 라우팅 — 백엔드 단독 호출 시 단순 응답
  app.get('/', (_req, res) => {
    res.json({
      service: 'uniteam-backend',
      version: '0.1.0',
      port: config.port,
      docs: '/api/v1/health',
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
