import { Router } from 'express';
import { ok } from '../lib/envelope.js';
import { ping } from '../db/connection.js';

export const healthRouter = Router();

// Liveness — 프로세스 살아있는지만 확인. K8s livenessProbe/Nginx upstream용
healthRouter.get('/health', (_req, res) => {
  res.json(ok({ status: 'UP', uptime: process.uptime() }));
});

// Readiness — DB 도달성까지 확인. K8s readinessProbe
healthRouter.get('/health/ready', async (_req, res, next) => {
  try {
    const db = await ping();
    res.json(ok({ status: 'READY', db }));
  } catch (e) {
    next(e);
  }
});
