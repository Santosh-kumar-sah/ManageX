import express from 'express';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './platform/middleware/requestId.js';
import { httpLoggerMiddleware } from './platform/middleware/logger.js';
import { corsMiddleware } from './platform/middleware/cors.js';
import { csrfMiddleware } from './platform/middleware/csrf.js';
import { authenticateSession } from './platform/middleware/auth.js';
import { notFoundHandler } from './platform/middleware/notFoundHandler.js';
import { errorHandler } from './platform/middleware/errorHandler.js';
import { apiV1Router } from './routes/index.js';

export function createApp() {
  const app = express();

  // Trust proxy for Vercel edge rewrite proxy (X-Forwarded-For, X-Forwarded-Proto)
  app.set('trust proxy', 1);

  // Security headers & basic middleware
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Request correlation ID & structured logging
  app.use(requestIdMiddleware);
  app.use(corsMiddleware());
  app.use(httpLoggerMiddleware);

  // Security & identity layer: CSRF protection and session authentication
  app.use(csrfMiddleware);
  app.use(authenticateSession);

  // Core API routes
  app.use('/api/v1', apiV1Router);

  // Central 404 & error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
