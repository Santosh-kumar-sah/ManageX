import { Router } from 'express';
import { z } from 'zod';
import { successResponse } from '../platform/common/responses.js';

export const healthRouter = Router();

const healthQuerySchema = z.object({
  verbose: z.enum(['true', 'false']).optional(),
});

/**
 * GET /api/v1/health
 * Liveness probe. Proves Express process is running and accepting HTTP requests.
 */
healthRouter.get('/', (req, res, next) => {
  try {
    const query = healthQuerySchema.parse(req.query);
    const isVerbose = query.verbose === 'true';

    const payload = {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      ...(isVerbose ? { environment: process.env.NODE_ENV } : {}),
    };

    return res.status(200).json(
      successResponse({
        data: payload,
        requestId: req.id,
      })
    );
  } catch (err) {
    return next(err);
  }
});
