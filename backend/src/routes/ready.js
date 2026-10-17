import { Router } from 'express';
import { successResponse } from '../platform/common/responses.js';
import { env } from '../config/env.js';
import { checkDatabaseHealth } from '../platform/database/pool.js';

export const readyRouter = Router();

/**
 * GET /api/v1/ready
 * Readiness probe. Verifies configuration secrets and PostgreSQL connectivity.
 * Fails truthfully with HTTP 503 if the database is unreachable or pool times out.
 */
readyRouter.get('/', async (req, res) => {
  // 1. Process-level readiness: configuration secrets
  const hasSecrets = Boolean(env.SESSION_SECRET && env.CSRF_SECRET);
  if (!hasSecrets) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Application configuration is incomplete.',
        requestId: req.id,
      },
    });
  }

  // 2. Database readiness: bounded probe (3s limit)
  const isDbReady = await checkDatabaseHealth(3000);
  if (!isDbReady) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database service is not ready to serve traffic.',
        requestId: req.id,
      },
    });
  }

  return res.status(200).json(
    successResponse({
      data: {
        status: 'ready',
        database: 'connected',
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
      requestId: req.id,
    })
  );
});
