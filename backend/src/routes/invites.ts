import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { ok } from '../lib/envelope.js';
import { respond } from '../services/projects/invites.js';

export const invitesRouter = Router();

const respondSchema = z.object({ accept: z.boolean() });

invitesRouter.post(
  '/invites/:id/respond',
  requireAuth,
  validate({ body: respondSchema }),
  async (req: AuthedRequest, res, next) => {
    try {
      const memberId = Number(req.params.id);
      const result = await respond(memberId, req.user!.id, req.body.accept);
      res.json(ok(result));
    } catch (e) {
      next(e);
    }
  },
);
