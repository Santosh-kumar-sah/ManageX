/**
 * ManageX CSRF Protection Middleware
 * Strictly adheres to ADR-011 and PRD Section 6.1 (AUTH-007).
 * 
 * Rules:
 * - Issues a cryptographically signed or random CSRF token via a readable cookie `managex_csrf`.
 * - State-changing mutations (POST, PUT, PATCH, DELETE) authenticated via cookies
 *   MUST supply the matching CSRF token in the `X-CSRF-Token` header.
 * - Safe idempotent methods (GET, HEAD, OPTIONS) do not require CSRF token headers.
 * - Exempts public unauthenticated auth routes (login, register, verify-email, forgot-password)
 *   from CSRF token checks to avoid blocking legitimate visitor onboarding before a session exists.
 */

import { generateSecureToken } from '../auth/tokens.js';
import { AuthenticationError } from '../common/errors.js';
import { env } from '../../config/env.js';

export const CSRF_COOKIE_NAME = 'managex_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Routes exempt from CSRF validation (public bootstrap actions)
const CSRF_EXEMPT_PATHS = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/resend-verification',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/health',
  '/api/v1/ready',
]);

/**
 * Middleware ensuring every client has a CSRF cookie and verifying CSRF on mutations.
 */
export function csrfMiddleware(req, res, next) {
  let csrfToken = req.cookies?.[CSRF_COOKIE_NAME];

  if (!csrfToken) {
    csrfToken = generateSecureToken(24);
    const isProduction = env.NODE_ENV === 'production';

    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // Must be readable by client JS to send in X-CSRF-Token header
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  // Safe read requests pass through
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Exempt unauthenticated bootstrap auth paths
  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  // If request has no session cookie, CSRF check is not applicable (e.g. unauthenticated)
  if (!req.cookies?.['managex_session']) {
    return next();
  }

  // Validate CSRF header against cookie
  const headerToken = req.headers[CSRF_HEADER_NAME] || req.headers[CSRF_HEADER_NAME.toLowerCase()];

  if (!headerToken || headerToken !== csrfToken) {
    return next(new AuthenticationError('Invalid or missing CSRF token. State-changing requests require X-CSRF-Token header.'));
  }

  next();
}
