/**
 * ManageX Server-Managed Session Service
 * Strictly adheres to ADR-011, PRD Section 6.1 (AUTH-003, AUTH-005), and security invariants.
 * 
 * Rules:
 * - 30-minute idle sliding timeout.
 * - 7-day absolute lifetime cap.
 * - Session token stored only as SHA-256 hash in database.
 * - Raw token returned once to client as secure HttpOnly cookie.
 * - Session rotation on login and privilege change.
 * - Immediate server-side invalidation on logout and password reset.
 */

import { generateSecureToken, hashToken } from './tokens.js';
import { getPool } from '../database/pool.js';

const IDLE_TIMEOUT_MINUTES = 30;
const ABSOLUTE_LIFETIME_DAYS = 7;

export const SESSION_COOKIE_NAME = 'managex_session';

/**
 * Creates a new active session for a user.
 * @param {object} params
 * @param {string} params.userId - User UUID
 * @param {string} [params.ipAddress] - Client IP address
 * @param {string} [params.userAgent] - Client User Agent
 * @param {import('pg').PoolClient} [params.client] - Optional transactional client
 * @returns {Promise<{ rawToken: string, session: object }>}
 */
export async function createSession({ userId, ipAddress, userAgent, client }) {
  const pool = getPool();
  const db = client || pool;

  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);

  const now = new Date();
  const idleExpiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MINUTES * 60 * 1000);
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  const query = `
    INSERT INTO sessions (user_id, token_hash, idle_expires_at, absolute_expires_at, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, user_id, idle_expires_at, absolute_expires_at, created_at
  `;

  const res = await db.query(query, [
    userId,
    tokenHash,
    idleExpiresAt,
    absoluteExpiresAt,
    ipAddress || null,
    userAgent ? userAgent.substring(0, 500) : null,
  ]);

  return {
    rawToken,
    session: res.rows[0],
  };
}

/**
 * Validates a session token, sliding the idle window if valid.
 * @param {string} rawToken - Plaintext session token from cookie
 * @returns {Promise<{ user: object, session: object } | null>}
 */
export async function validateSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return null;
  }

  const pool = getPool();
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Query user and session together
  const query = `
    SELECT 
      s.id AS session_id,
      s.user_id,
      s.idle_expires_at,
      s.absolute_expires_at,
      s.revoked_at,
      u.id AS user_id,
      u.email,
      u.full_name,
      u.is_platform_admin,
      u.status AS user_status,
      u.email_verified_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1
  `;

  const res = await pool.query(query, [tokenHash]);

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];

  // Check revocation
  if (row.revoked_at !== null) {
    return null;
  }

  // Check idle expiry
  if (new Date(row.idle_expires_at) <= now) {
    return null;
  }

  // Check absolute expiry
  if (new Date(row.absolute_expires_at) <= now) {
    return null;
  }

  // Check user account status (disabled/suspended accounts fail closed per AUTH-005)
  if (row.user_status !== 'active') {
    return null;
  }

  // Slide idle timeout: min(now + 30m, absolute_expires_at)
  const newIdle = new Date(now.getTime() + IDLE_TIMEOUT_MINUTES * 60 * 1000);
  const effectiveIdle = newIdle < new Date(row.absolute_expires_at) ? newIdle : new Date(row.absolute_expires_at);

  await pool.query(
    'UPDATE sessions SET idle_expires_at = $1 WHERE id = $2',
    [effectiveIdle, row.session_id]
  );

  return {
    user: {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name,
      isPlatformAdmin: row.is_platform_admin,
      status: row.user_status,
      emailVerifiedAt: row.email_verified_at,
    },
    session: {
      id: row.session_id,
      idleExpiresAt: effectiveIdle,
      absoluteExpiresAt: row.absolute_expires_at,
    },
  };
}

/**
 * Revokes a single session by its raw token (used on logout).
 * @param {string} rawToken
 * @returns {Promise<boolean>}
 */
export async function revokeSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return false;
  }

  const pool = getPool();
  const tokenHash = hashToken(rawToken);

  const res = await pool.query(
    'UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [tokenHash]
  );

  return res.rowCount > 0;
}

/**
 * Revokes all active sessions for a user (used on password reset per AUTH-004).
 * @param {string} userId - User UUID
 * @param {import('pg').PoolClient} [client] - Optional transactional client
 * @returns {Promise<number>} - Count of revoked sessions
 */
export async function revokeAllUserSessions(userId, client) {
  const pool = getPool();
  const db = client || pool;

  const res = await db.query(
    'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );

  return res.rowCount;
}
