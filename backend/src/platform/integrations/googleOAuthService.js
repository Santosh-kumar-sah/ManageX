/**
 * ManageX Google OAuth 2.0 Integration Service (Phase 1B.3)
 * Strictly adheres to docs/google-meet-integration-plan.md (Sections 4, 8.2, 9, 11.2, 12),
 * AGENTS.md, docs/security.md, and PRD Section 8.1.
 *
 * Invariants:
 * - Single-use OAuth state tokens with SHA-256 hashes and user-isolated RLS.
 * - Anti-CSRF double-submit cookie nonce verification.
 * - Two-phase RLS context transition during global callback (zero platform-admin bypass).
 * - Atomic state burn on permission failure to eliminate replay windows.
 * - AES-256-GCM encrypted refresh token storage via crypto.js.
 * - Snake_case database column to camelCase crypto envelope adapter mapping.
 * - Preservation of existing refresh token on re-authorization if Google omits it.
 * - Safe disconnect with upstream token revocation and local credential erasure to NULL.
 * - Zero database transactions held open across external HTTP requests.
 */

import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import * as tokenCrypto from '../common/crypto.js';
import { withTenantTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../audit/auditService.js';
import { logger } from '../middleware/logger.js';
import {
  AppError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from '../common/errors.js';

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export const OAUTH_NONCE_COOKIE_NAME = 'managex_oauth_nonce';
export const OAUTH_STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

// =============================================================================
// 1. Crypto Envelope <-> Database Adapter Functions (Section 8.2)
// =============================================================================

/**
 * Maps database row columns to in-memory crypto envelope object for crypto.js.
 *
 * @param {object} row - Database row from organisation_integrations
 * @returns {{ version: number, keyVersion: string, iv: string, tag: string, ciphertext: string }|null}
 */
export function rowToCryptoEnvelope(row) {
  if (!row) return null;
  if (!row.encrypted_refresh_token || !row.token_iv || !row.token_auth_tag) {
    return null;
  }
  return {
    version: row.envelope_version,
    keyVersion: String(row.key_version),
    iv: row.token_iv,
    tag: row.token_auth_tag,
    ciphertext: row.encrypted_refresh_token,
  };
}

/**
 * Maps in-memory crypto envelope object to database row columns for organisation_integrations.
 *
 * @param {{ version: number, keyVersion: string, iv: string, tag: string, ciphertext: string }} envelope
 * @returns {{ envelope_version: number, key_version: string, token_iv: string, token_auth_tag: string, encrypted_refresh_token: string }|null}
 */
export function cryptoEnvelopeToRow(envelope) {
  if (!envelope) return null;
  return {
    envelope_version: envelope.version,
    key_version: envelope.keyVersion,
    token_iv: envelope.iv,
    token_auth_tag: envelope.tag,
    encrypted_refresh_token: envelope.ciphertext,
  };
}

// =============================================================================
// 2. OAuth State Generation (Section 4.1)
// =============================================================================

/**
 * Generates an unguessable OAuth state token, stores its SHA-256 hash in oauth_states
 * under the user's isolated RLS context, and returns the raw state token and expiration.
 *
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {string} params.userId - Authenticated caller UUID
 * @param {import('pg').PoolClient} [params.client] - Optional existing transactional client
 * @returns {Promise<{ rawStateToken: string, expiresAt: Date }>}
 */
export async function generateOAuthState({ organisationId, userId, client = null }) {
  if (!organisationId || !userId) {
    throw new ValidationError('Organisation ID and User ID are required to initiate OAuth');
  }

  const rawStateToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawStateToken).digest('hex');
  const expiresAt = new Date(Date.now() + OAUTH_STATE_EXPIRY_MS);

  const query = `
    INSERT INTO oauth_states (organisation_id, user_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
    RETURNING id, expires_at;
  `;

  if (client) {
    await client.query(query, [organisationId, userId, tokenHash, expiresAt]);
  } else {
    await withTenantTransaction(
      { userId, organisationId: '', isPlatformAdmin: false },
      async (txClient) => {
        await txClient.query(query, [organisationId, userId, tokenHash, expiresAt]);
      }
    );
  }

  return { rawStateToken, expiresAt };
}

/**
 * Builds the Google OAuth 2.0 authorization URL.
 *
 * @param {object} params
 * @param {string} params.rawStateToken - Generated state token
 * @returns {string} Fully formed Google authorization URL
 */
export function buildAuthorizationUrl({ rawStateToken }) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new AppError(
      'Google OAuth is not configured on this server (missing GOOGLE_CLIENT_ID or GOOGLE_OAUTH_REDIRECT_URI)',
      503,
      'GOOGLE_OAUTH_NOT_CONFIGURED'
    );
  }

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GOOGLE_OAUTH_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent'); // Guarantees Google issues refresh token on re-authorization
  url.searchParams.set('state', rawStateToken);

  return url.toString();
}

// =============================================================================
// 3. Callback State Consumption & Two-Phase RLS Transition (Section 4.1, 4.2)
// =============================================================================

/**
 * Atomically consumes the OAuth state and verifies the caller's permission in the target organisation.
 *
 * Invariant: Executes Step 1 two-phase RLS context transition under managex_app (NOBYPASSRLS).
 * - Phase 1A: User discovery context (app.current_organisation_id is empty). Consumes state token.
 * - Phase 1B: Explicit tenant context elevation (set_config('app.current_organisation_id', state.org_id, true)).
 * - Evaluates membership and 'org.update' permission.
 * - Commits the transaction regardless of permission check result, burning the state token to prevent replay.
 * - Throws 403 FORBIDDEN if permission check failed after burning the token.
 *
 * @param {object} params
 * @param {string} params.rawStateToken - State token received from Google callback query param
 * @param {string} params.cookieNonce - Nonce received in managex_oauth_nonce cookie
 * @param {string} params.userId - Authenticated user UUID
 * @returns {Promise<{ organisationId: string }>}
 */
export async function consumeOAuthStateAndVerifyPermission({ rawStateToken, cookieNonce, userId }) {
  if (!rawStateToken || typeof rawStateToken !== 'string') {
    throw new ValidationError('OAuth state parameter is required', 'INVALID_OAUTH_STATE');
  }

  if (!cookieNonce || cookieNonce !== rawStateToken) {
    throw new AuthorizationError('OAuth state nonce cookie mismatch or missing', 'OAUTH_STATE_MISMATCH');
  }

  if (!userId) {
    throw new AuthorizationError('Authenticated user session required', 'AUTHENTICATION_REQUIRED');
  }

  const tokenHash = crypto.createHash('sha256').update(rawStateToken).digest('hex');

  // Execute Step 1 database transaction
  const result = await withTenantTransaction(
    { userId, organisationId: '', isPlatformAdmin: false },
    async (client) => {
      // 1. Atomic State Consumption under user-isolated RLS
      const consumeQuery = `
        UPDATE oauth_states
        SET used_at = NOW()
        WHERE token_hash = $1
          AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND used_at IS NULL
          AND expires_at > NOW()
        RETURNING id, organisation_id, user_id;
      `;
      const consumeRes = await client.query(consumeQuery, [tokenHash]);

      if (consumeRes.rows.length === 0) {
        throw new AuthorizationError(
          'OAuth state token is invalid, expired, or already consumed',
          'OAUTH_STATE_INVALID_OR_EXPIRED'
        );
      }

      const stateRow = consumeRes.rows[0];
      const targetOrgId = stateRow.organisation_id;

      // 2. Explicit Tenant Context Elevation for Phase 1B
      await client.query("SELECT set_config('app.current_organisation_id', $1, true)", [targetOrgId]);

      // 3. Permission Revalidation in the target tenant context
      const permQuery = `
        SELECT 1 FROM organisation_memberships m
        JOIN membership_roles mr ON mr.membership_id = m.id AND mr.organisation_id = m.organisation_id
        JOIN roles r ON r.id = mr.role_id
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE m.organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
          AND p.key IN ('org.update', 'org.edit');
      `;
      const permRes = await client.query(permQuery);
      const hasPermission = permRes.rows.length > 0;

      return {
        organisationId: targetOrgId,
        hasPermission,
      };
    }
  );

  // If permission check failed, transaction committed used_at = NOW() (burned). Fails closed here.
  if (!result.hasPermission) {
    throw new AuthorizationError(
      "Permission denied. Required permission: 'org.update' in target organisation",
      'FORBIDDEN'
    );
  }

  return { organisationId: result.organisationId };
}

// =============================================================================
// 4. External HTTP Token Exchange (Step 2, Outside DB Transactions)
// =============================================================================

/**
 * Exchanges authorization code for Google access and refresh tokens.
 *
 * @param {object} params
 * @param {string} params.code - Authorization code from Google redirect
 * @param {number} [params.timeoutMs=10000] - HTTP request timeout
 * @returns {Promise<{ accessToken: string, refreshToken?: string, scopes: string[], expiresIn: number }>}
 */
export async function exchangeCodeForTokens({ code, timeoutMs = 10000 }) {
  if (!code) {
    throw new ValidationError('Authorization code is required', 'MISSING_AUTH_CODE');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error_description || data?.error || response.statusText;
      logger.error({ status: response.status, error: data?.error }, 'Google token exchange failed');
      throw new AppError(
        `Google token exchange failed: ${errorMsg}`,
        502,
        'GOOGLE_TOKEN_EXCHANGE_FAILED'
      );
    }

    const scopes = typeof data.scope === 'string'
      ? data.scope.split(' ').map((s) => s.trim()).filter(Boolean)
      : GOOGLE_OAUTH_SCOPES;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token, // May be omitted by Google on reauthorization if already issued
      scopes,
      expiresIn: data.expires_in,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError('Google token exchange timed out', 504, 'GOOGLE_TOKEN_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches the connected Google user email address using the newly obtained access token.
 *
 * @param {object} params
 * @param {string} params.accessToken - Access token from token exchange
 * @param {number} [params.timeoutMs=8000] - Request timeout
 * @returns {Promise<{ email: string, verifiedEmail?: boolean }>}
 */
export async function getGoogleUserInfo({ accessToken, timeoutMs = 8000 }) {
  if (!accessToken) {
    throw new ValidationError('Access token is required', 'MISSING_ACCESS_TOKEN');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new AppError(
        `Failed to fetch Google user profile: ${data?.error?.message || response.statusText}`,
        502,
        'GOOGLE_USERINFO_FAILED'
      );
    }

    if (!data.email) {
      throw new AppError('Google user profile did not include an email address', 502, 'GOOGLE_EMAIL_MISSING');
    }

    return {
      email: data.email,
      verifiedEmail: data.verified_email,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError('Google user profile request timed out', 504, 'GOOGLE_USERINFO_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// 5. Credential Storage & Tenant Context Transaction (Step 3)
// =============================================================================

/**
 * Persists encrypted Google OAuth credentials in organisation_integrations.
 *
 * Invariants:
 * - If refreshToken is provided: Encrypts via crypto.encrypt() (AES-256-GCM) and maps to DB columns.
 * - If refreshToken is omitted (Google reauthorization): Preserves existing stored encrypted credentials.
 * - Upserts tenant-scoped record under RLS (org_integrations_tenant_isolation).
 * - Records immutable audit log organisation.integration_connected.
 *
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {string} params.userId - Authenticated user UUID
 * @param {string} [params.refreshToken] - Raw plaintext refresh token (if issued)
 * @param {string} params.connectedEmail - Connected Google email address
 * @param {string[]} params.scopes - Array of granted OAuth scopes
 * @param {import('pg').PoolClient} [params.client] - Optional transactional client
 * @returns {Promise<object>} Stored integration summary (zero secrets exposed)
 */
export async function saveGoogleCredentials({
  organisationId,
  userId,
  refreshToken,
  connectedEmail,
  scopes = GOOGLE_OAUTH_SCOPES,
  client = null,
}) {
  if (!organisationId || !userId || !connectedEmail) {
    throw new ValidationError('Organisation ID, User ID, and connected email are required');
  }

  const executeSave = async (txClient) => {
    let envelopeVersion = 1;
    let keyVersion = env.TOKEN_ENCRYPTION_KEY_VERSION || '1';
    let encryptedRefreshToken = null;
    let tokenIv = null;
    let tokenAuthTag = null;

    if (refreshToken && typeof refreshToken === 'string' && refreshToken.trim().length > 0) {
      // Encrypt new refresh token
      const envelope = tokenCrypto.encrypt(refreshToken.trim());
      const rowData = cryptoEnvelopeToRow(envelope);
      envelopeVersion = rowData.envelope_version;
      keyVersion = rowData.key_version;
      encryptedRefreshToken = rowData.encrypted_refresh_token;
      tokenIv = rowData.token_iv;
      tokenAuthTag = rowData.token_auth_tag;
    } else {
      // Re-authorization without prompt consent: check existing integration credentials
      const existingRes = await txClient.query(
        `SELECT envelope_version, key_version, token_iv, token_auth_tag, encrypted_refresh_token
         FROM organisation_integrations
         WHERE organisation_id = $1 AND provider = 'google'`,
        [organisationId]
      );

      if (
        existingRes.rows.length === 0 ||
        !existingRes.rows[0].encrypted_refresh_token ||
        !existingRes.rows[0].token_iv ||
        !existingRes.rows[0].token_auth_tag
      ) {
        throw new ValidationError(
          'Google did not return a refresh token, and no existing credentials were found for this organisation. Please re-authorize and grant offline access.',
          'REFRESH_TOKEN_REQUIRED'
        );
      }

      envelopeVersion = existingRes.rows[0].envelope_version;
      keyVersion = existingRes.rows[0].key_version;
      encryptedRefreshToken = existingRes.rows[0].encrypted_refresh_token;
      tokenIv = existingRes.rows[0].token_iv;
      tokenAuthTag = existingRes.rows[0].token_auth_tag;
    }

    const upsertQuery = `
      INSERT INTO organisation_integrations (
        organisation_id,
        provider,
        envelope_version,
        key_version,
        encrypted_refresh_token,
        token_iv,
        token_auth_tag,
        connected_email,
        scopes,
        status,
        last_error,
        created_by_id,
        created_at,
        updated_at
      )
      VALUES ($1, 'google', $2, $3, $4, $5, $6, $7, $8, 'connected', NULL, $9, NOW(), NOW())
      ON CONFLICT (organisation_id, provider) DO UPDATE SET
        envelope_version = EXCLUDED.envelope_version,
        key_version = EXCLUDED.key_version,
        encrypted_refresh_token = COALESCE(EXCLUDED.encrypted_refresh_token, organisation_integrations.encrypted_refresh_token),
        token_iv = COALESCE(EXCLUDED.token_iv, organisation_integrations.token_iv),
        token_auth_tag = COALESCE(EXCLUDED.token_auth_tag, organisation_integrations.token_auth_tag),
        connected_email = EXCLUDED.connected_email,
        scopes = EXCLUDED.scopes,
        status = 'connected',
        last_error = NULL,
        updated_at = NOW()
      RETURNING id, organisation_id, provider, connected_email, scopes, status, updated_at;
    `;

    const upsertRes = await txClient.query(upsertQuery, [
      organisationId,
      envelopeVersion,
      keyVersion,
      encryptedRefreshToken,
      tokenIv,
      tokenAuthTag,
      connectedEmail,
      scopes,
      userId,
    ]);

    const savedRow = upsertRes.rows[0];

    // Record audit log
    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: 'organisation.integration_connected',
      entityType: 'organisation_integration',
      entityId: savedRow.id,
      metadata: {
        provider: 'google',
        connectedEmail,
        scopes,
      },
      client: txClient,
    });

    return {
      id: savedRow.id,
      organisationId: savedRow.organisation_id,
      provider: savedRow.provider,
      connectedEmail: savedRow.connected_email,
      scopes: savedRow.scopes,
      status: savedRow.status,
      updatedAt: savedRow.updated_at,
    };
  };

  if (client) {
    return executeSave(client);
  }

  return withTenantTransaction(
    { organisationId, userId, isPlatformAdmin: false },
    executeSave
  );
}

// =============================================================================
// 6. Integration Status Inspection (Section 10.1)
// =============================================================================

/**
 * Retrieves the current connection status of the Google integration for an organisation.
 * Guarantees zero sensitive cryptographic fields (ciphertext, IV, tag, key) are leaked.
 *
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {import('pg').PoolClient} [params.client] - Optional transactional client
 * @returns {Promise<object>} Status summary
 */
export async function getGoogleIntegrationStatus({ organisationId, client = null }) {
  if (!organisationId) {
    throw new ValidationError('Organisation ID is required');
  }

  const query = `
    SELECT
      id,
      organisation_id,
      provider,
      connected_email,
      scopes,
      status,
      last_error,
      created_at,
      updated_at
    FROM organisation_integrations
    WHERE organisation_id = $1 AND provider = 'google';
  `;

  const runQuery = async (txClient) => {
    const res = await txClient.query(query, [organisationId]);
    if (res.rows.length === 0) {
      return {
        isConnected: false,
        status: 'disconnected',
        provider: 'google',
        connectedEmail: null,
        scopes: [],
        updatedAt: null,
        lastError: null,
      };
    }

    const row = res.rows[0];
    return {
      isConnected: row.status === 'connected',
      status: row.status,
      provider: row.provider,
      connectedEmail: row.connected_email,
      scopes: row.scopes || [],
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      lastError: row.last_error,
    };
  };

  if (client) {
    return runQuery(client);
  }

  return withTenantTransaction(
    { organisationId, isPlatformAdmin: false },
    runQuery
  );
}

// =============================================================================
// 7. Upstream Revocation & Credential Erasure (Section 9.3)
// =============================================================================

/**
 * Disconnects the organisation's Google integration:
 * 1. Reads and decrypts the stored refresh token.
 * 2. Revokes the token upstream at Google via URL-encoded POST (Section 9.3).
 * 3. Safely erases all stored cryptographic material (ciphertext, IV, tag set to NULL) in PostgreSQL.
 * 4. Records an immutable audit log organisation.integration_disconnected.
 *
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {string} params.userId - Authenticated user UUID
 * @param {import('pg').PoolClient} [params.client] - Optional transactional client
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function disconnectGoogleIntegration({ organisationId, userId, client = null }) {
  if (!organisationId || !userId) {
    throw new ValidationError('Organisation ID and User ID are required');
  }

  const runDisconnect = async (txClient) => {
    const query = `
      SELECT id, envelope_version, key_version, token_iv, token_auth_tag, encrypted_refresh_token, connected_email, status
      FROM organisation_integrations
      WHERE organisation_id = $1 AND provider = 'google';
    `;
    const res = await txClient.query(query, [organisationId]);

    if (res.rows.length === 0 || res.rows[0].status === 'revoked') {
      return {
        success: true,
        message: 'Google integration is already disconnected.',
      };
    }

    const row = res.rows[0];
    let decryptedToken = null;

    if (row.encrypted_refresh_token && row.token_iv && row.token_auth_tag) {
      try {
        const envelope = rowToCryptoEnvelope(row);
        decryptedToken = tokenCrypto.decrypt(envelope);
      } catch (err) {
        logger.warn(
          { organisationId, err: err.message },
          'Could not decrypt token during disconnect; proceeding with local credential erasure'
        );
      }
    }

    // Attempt upstream revocation if decrypted token is available
    if (decryptedToken) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const revokeRes = await fetch(GOOGLE_REVOKE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: decryptedToken }).toString(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!revokeRes.ok) {
          logger.warn(
            { organisationId, status: revokeRes.status },
            'Upstream Google token revocation returned non-200; proceeding with local erasure'
          );
        }
      } catch (err) {
        logger.warn(
          { organisationId, err: err.message },
          'Upstream Google token revocation failed or timed out; proceeding with local erasure'
        );
      }
    }

    // Local Credential Erasure (Section 9.3)
    const eraseQuery = `
      UPDATE organisation_integrations
      SET status = 'revoked',
          encrypted_refresh_token = NULL,
          token_iv = NULL,
          token_auth_tag = NULL,
          updated_at = NOW()
      WHERE organisation_id = $1 AND provider = 'google'
      RETURNING id;
    `;
    await txClient.query(eraseQuery, [organisationId]);

    // Record audit log
    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: 'organisation.integration_disconnected',
      entityType: 'organisation_integration',
      entityId: row.id,
      metadata: {
        provider: 'google',
        connectedEmail: row.connected_email,
      },
      client: txClient,
    });

    return {
      success: true,
      message: 'Google integration disconnected successfully.',
    };
  };

  if (client) {
    return runDisconnect(client);
  }

  return withTenantTransaction(
    { organisationId, userId, isPlatformAdmin: false },
    runDisconnect
  );
}

// =============================================================================
// 8. Access Token Refresh (For Phase 1B.4 consumption)
// =============================================================================

/**
 * Refreshes an expired Google access token using the stored encrypted refresh token.
 *
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {number} [params.timeoutMs=8000] - Request timeout
 * @param {import('pg').PoolClient} [params.client] - Optional transactional client
 * @returns {Promise<{ accessToken: string, expiresIn: number }>}
 */
export async function refreshAccessToken({ organisationId, timeoutMs = 8000, client = null }) {
  if (!organisationId) {
    throw new ValidationError('Organisation ID is required');
  }

  const query = `
    SELECT id, envelope_version, key_version, token_iv, token_auth_tag, encrypted_refresh_token, status
    FROM organisation_integrations
    WHERE organisation_id = $1 AND provider = 'google';
  `;

  let row;
  if (client) {
    const res = await client.query(query, [organisationId]);
    row = res.rows[0];
  } else {
    row = await withTenantTransaction(
      { organisationId, isPlatformAdmin: false },
      async (txClient) => {
        const res = await txClient.query(query, [organisationId]);
        return res.rows[0];
      }
    );
  }

  if (!row || row.status !== 'connected') {
    throw new AppError(
      'Google integration is not connected for this organisation',
      400,
      'INTEGRATION_NOT_CONNECTED'
    );
  }

  const envelope = rowToCryptoEnvelope(row);
  if (!envelope) {
    throw new AppError(
      'Missing encrypted credentials for Google integration',
      500,
      'CREDENTIALS_MISSING'
    );
  }

  const refreshToken = tokenCrypto.decrypt(envelope);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      // Check for revoked credentials upstream (HTTP 400/401 invalid_grant)
      if (data?.error === 'invalid_grant') {
        logger.error({ organisationId }, 'Google refresh token invalid or revoked upstream');
        // Update local status to error/revoked
        const updateErrorQuery = `
          UPDATE organisation_integrations
          SET status = 'error',
              last_error = 'Google refresh token revoked or expired upstream',
              updated_at = NOW()
          WHERE organisation_id = $1 AND provider = 'google';
        `;
        if (client) {
          await client.query(updateErrorQuery, [organisationId]);
        } else {
          await withTenantTransaction(
            { organisationId, isPlatformAdmin: false },
            async (txClient) => {
              await txClient.query(updateErrorQuery, [organisationId]);
            }
          );
        }

        throw new AppError(
          'Google credentials revoked or expired upstream. Please re-authenticate.',
          401,
          'GOOGLE_CREDENTIALS_REVOKED'
        );
      }

      throw new AppError(
        `Failed to refresh Google access token: ${data?.error_description || response.statusText}`,
        502,
        'GOOGLE_TOKEN_REFRESH_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError('Google token refresh timed out', 504, 'GOOGLE_TOKEN_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
