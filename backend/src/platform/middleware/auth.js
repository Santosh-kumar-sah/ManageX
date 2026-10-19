/**
 * ManageX Authentication Middleware
 * Strictly adheres to PRD Section 6.1 (AUTH-003, AUTH-005) and security invariants.
 * 
 * Rules:
 * - Reads session cookie `managex_session`.
 * - Validates session against database in constant-safe manner.
 * - Injects verified user and session into `req.user` and `req.session`.
 * - Never trusts client-supplied headers or body for identity or platform-admin status.
 * - Provides `authenticateSession`, `requireAuth`, and `requireVerifiedUser` guards.
 */

import { validateSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { AuthenticationError, AuthorizationError } from '../common/errors.js';

/**
 * Optional session resolution middleware: populates `req.user` if valid session exists.
 */
export async function authenticateSession(req, res, next) {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken) {
      req.user = null;
      req.session = null;
      return next();
    }

    const authResult = await validateSession(rawToken);
    if (!authResult) {
      req.user = null;
      req.session = null;
      return next();
    }

    req.user = authResult.user;
    req.session = authResult.session;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Strict guard requiring an active authenticated session.
 */
export function requireAuth(req, res, next) {
  if (!req.user || !req.session) {
    return next(new AuthenticationError('Authentication required to access this resource.'));
  }
  next();
}

/**
 * Strict guard requiring verified email status (AUTH-002).
 */
export function requireVerifiedUser(req, res, next) {
  if (!req.user || !req.session) {
    return next(new AuthenticationError('Authentication required to access this resource.'));
  }

  if (req.user.status !== 'active' || !req.user.emailVerifiedAt) {
    return next(new AuthorizationError('Email verification required before accessing this resource.'));
  }

  next();
}
