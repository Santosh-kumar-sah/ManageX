/**
 * ManageX Integrations Router (Phase 1B.3)
 * Strictly adheres to docs/google-meet-integration-plan.md (Sections 4, 10.1, 11.2, 12).
 *
 * Mounts:
 * - orgIntegrationsRouter: /api/v1/organisations/:orgId/integrations
 * - globalIntegrationsRouter: /api/v1/integrations
 */

import { Router } from 'express';
import { env } from '../config/env.js';
import {
  requireOrgMembership,
  requireOrgPermission,
} from '../platform/middleware/organisation.js';
import { requireAuth } from '../platform/middleware/auth.js';
import { sendSuccess } from '../platform/common/responses.js';
import { logger } from '../platform/middleware/logger.js';
import { ValidationError } from '../platform/common/errors.js';
import {
  generateOAuthState,
  buildAuthorizationUrl,
  consumeOAuthStateAndVerifyPermission,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  saveGoogleCredentials,
  getGoogleIntegrationStatus,
  disconnectGoogleIntegration,
  OAUTH_NONCE_COOKIE_NAME,
  OAUTH_STATE_EXPIRY_MS,
} from '../platform/integrations/googleOAuthService.js';

// =============================================================================
// Organisation Integrations Router (Scoped to :orgId)
// =============================================================================
export const orgIntegrationsRouter = Router({ mergeParams: true });

/**
 * GET /api/v1/organisations/:orgId/integrations/google/authorize
 * Initiates the Google OAuth 2.0 connection flow for an organisation.
 * Requires: active organisation membership and 'org.update' permission.
 */
orgIntegrationsRouter.get(
  '/google/authorize',
  requireOrgMembership,
  requireOrgPermission('org.update'),
  async (req, res, next) => {
    try {
      const organisationId = req.organisation.id;
      const userId = req.user.id;

      // Generate single-use state and store hash in DB under user-isolated RLS
      const { rawStateToken } = await generateOAuthState({
        organisationId,
        userId,
      });

      // Set anti-CSRF double-submit nonce cookie
      res.cookie(OAUTH_NONCE_COOKIE_NAME, rawStateToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: OAUTH_STATE_EXPIRY_MS,
        path: '/',
      });

      const url = buildAuthorizationUrl({ rawStateToken });

      // Support direct JSON query or browser redirect
      if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
        return sendSuccess(res, 200, { url });
      }

      return res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/organisations/:orgId/integrations/google/status
 * Returns current status of Google integration for the organisation.
 * Requires: active organisation membership.
 */
orgIntegrationsRouter.get(
  '/google/status',
  requireOrgMembership,
  async (req, res, next) => {
    try {
      const status = await getGoogleIntegrationStatus({
        organisationId: req.organisation.id,
      });

      return sendSuccess(res, 200, status);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/organisations/:orgId/integrations/google/disconnect
 * Disconnects Google integration: revokes token upstream and erases local credentials to NULL.
 * Requires: active organisation membership and 'org.update' permission.
 */
orgIntegrationsRouter.post(
  '/google/disconnect',
  requireOrgMembership,
  requireOrgPermission('org.update'),
  async (req, res, next) => {
    try {
      const result = await disconnectGoogleIntegration({
        organisationId: req.organisation.id,
        userId: req.user.id,
      });

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// Global Integrations Router (Top-level /api/v1/integrations)
// =============================================================================
export const globalIntegrationsRouter = Router();

/**
 * GET /api/v1/integrations/google/callback
 * Global OAuth 2.0 callback endpoint from Google.
 *
 * Sequence:
 * 1. authenticateSession & requireAuth verify user session.
 * 2. Step 1: User context DB transaction consumes oauth_states and verifies org.update.
 * 3. Step 2: HTTP token exchange with Google (outside DB).
 * 4. Step 3: Tenant context DB transaction encrypts & stores credentials.
 * 5. 302 Redirect to organisation settings tab.
 */
globalIntegrationsRouter.get(
  '/google/callback',
  requireAuth,
  async (req, res, next) => {
    const cookieNonce = req.cookies?.[OAUTH_NONCE_COOKIE_NAME];
    // Always clear the nonce cookie once received
    res.clearCookie(OAUTH_NONCE_COOKIE_NAME, { path: '/' });

    const frontendBase = env.FRONTEND_ORIGIN || 'http://localhost:5173';

    // Handle Google denial or error parameter
    if (req.query.error) {
      logger.warn({ error: req.query.error }, 'Google OAuth authorization returned error');
      return res.redirect(
        302,
        `${frontendBase}/app/organisations?status=error&message=${encodeURIComponent(String(req.query.error))}`
      );
    }

    const { code, state } = req.query;
    if (!code || !state) {
      return next(
        new ValidationError('Missing required OAuth callback parameters: code, state')
      );
    }

    try {
      // Step 1: Atomically consume state and verify tenant permission (burns state token)
      const { organisationId } = await consumeOAuthStateAndVerifyPermission({
        rawStateToken: String(state),
        cookieNonce,
        userId: req.user.id,
      });

      // Step 2: External HTTP Token Exchange (Outside any DB transaction)
      const tokenResult = await exchangeCodeForTokens({
        code: String(code),
      });

      // Fetch user profile email
      const userInfo = await getGoogleUserInfo({
        accessToken: tokenResult.accessToken,
      });

      // Step 3: Tenant Context Database Transaction (Encrypt & Store)
      await saveGoogleCredentials({
        organisationId,
        userId: req.user.id,
        refreshToken: tokenResult.refreshToken,
        connectedEmail: userInfo.email,
        scopes: tokenResult.scopes,
      });

      // Redirect to organisation settings integrations tab
      return res.redirect(
        302,
        `${frontendBase}/app/organisations/${organisationId}/settings?tab=integrations&status=connected`
      );
    } catch (err) {
      logger.error({ err }, 'Google OAuth callback handling failed');
      // If client is a browser receiving redirect, redirect back to settings or error page with message
      if (req.headers.accept?.includes('text/html') || !req.headers.accept?.includes('application/json')) {
        return res.redirect(
          302,
          `${frontendBase}/app/organisations?status=error&message=${encodeURIComponent(err.message || 'OAuth callback failed')}`
        );
      }
      return next(err);
    }
  }
);
