/**
 * ManageX Rate Limiting Middleware
 * Strictly adheres to PRD Section 6.1 (AUTH-006).
 * 
 * Rules:
 * - In-memory sliding window rate-limiter for sensitive public/auth routes.
 * - Protects login, registration, password recovery, and email verification resends.
 * - Keyed by client IP (or composite key) to prevent brute-force attacks.
 * - Returns consistent RFC-7807/ManageX JSON envelope with status 429.
 */

import { sendError } from '../common/responses.js';

/**
 * Creates an Express rate-limiting middleware instance.
 * @param {object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Max requests allowed within window
 * @param {string} options.message - User-facing error message
 * @param {string} [options.keyPrefix='rl'] - Key prefix to namespace limits
 */
export function createRateLimiter({ windowMs, maxRequests, message, keyPrefix = 'rl' }) {
  const hits = new Map();

  // Periodic cleanup of expired entries (every 60s)
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, 60000);

  // Allow timer to not prevent clean node shutdown in tests
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return function rateLimiterMiddleware(req, res, next) {
    // Determine client identifier (respecting trust proxy)
    const clientIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();

    const timestamps = hits.get(key) || [];
    const validTimestamps = timestamps.filter((t) => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      const oldestHit = validTimestamps[0];
      const retryAfterSeconds = Math.ceil((windowMs - (now - oldestHit)) / 1000);

      res.setHeader('Retry-After', retryAfterSeconds);
      return sendError(
        res,
        429,
        'RATE_LIMIT_EXCEEDED',
        message || 'Too many requests. Please try again later.'
      );
    }

    validTimestamps.push(now);
    hits.set(key, validTimestamps);
    next();
  };
}
