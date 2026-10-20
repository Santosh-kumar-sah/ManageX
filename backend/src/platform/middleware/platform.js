/**
 * ManageX Platform Administration Middleware
 * Strictly adheres to PRD Section 10 (PLAT-001, PLAT-005), docs/security.md Section 4.B, and SEC-009.
 * 
 * Rules:
 * - Direct requests to /platform and /api/v1/platform/* require an authenticated session
 *   and verified platform credentials (platform_super_admin or platform_support_agent).
 * - Non-platform users (including organisation owners/admins) fail closed with HTTP 403 Forbidden.
 * - Resolves server-authoritative platform permissions from database reference tables.
 * - Enforces least-privilege: Support Agents cannot perform state mutations.
 */

import { AuthenticationError, AuthorizationError } from '../common/errors.js';
import { getPool } from '../database/pool.js';

/**
 * Middleware ensuring the authenticated user possesses valid platform credentials.
 * Injects `req.platform = { role, permissions }`.
 */
export async function requirePlatformSession(req, res, next) {
  try {
    if (!req.user || !req.session) {
      throw new AuthenticationError('Authentication required to access the platform console.');
    }

    // Identify effective platform role
    const effectiveRole = req.user.platformRole || (req.user.isPlatformAdmin ? 'platform_super_admin' : null);

    if (!effectiveRole || (effectiveRole !== 'platform_super_admin' && effectiveRole !== 'platform_support_agent')) {
      throw new AuthorizationError(
        'Platform console access denied. Operator credentials required.',
        'PLATFORM_ACCESS_DENIED'
      );
    }

    // Resolve platform permissions for this system role from database
    const pool = getPool();
    const resRole = await pool.query(
      `
      SELECT p.key
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organisation_id IS NULL AND r.slug = $1
      `,
      [effectiveRole]
    );

    const permissions = new Set(resRole.rows.map((r) => r.key));

    // Ensure Super Admin has super admin umbrella keys
    if (effectiveRole === 'platform_super_admin') {
      permissions.add('platform.admin');
    }

    req.platform = {
      role: effectiveRole,
      isSuperAdmin: effectiveRole === 'platform_super_admin',
      isSupportAgent: effectiveRole === 'platform_support_agent',
      permissions,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware asserting the caller holds a specific platform permission key.
 * @param {string} permissionKey
 */
export function requirePlatformPermission(permissionKey) {
  return function platformPermissionGuard(req, res, next) {
    if (!req.platform) {
      return next(
        new AuthorizationError('Platform session context required.', 'PLATFORM_SESSION_REQUIRED')
      );
    }

    // Super Admin passes all platform permission gates
    if (req.platform.isSuperAdmin || req.platform.permissions.has(permissionKey)) {
      return next();
    }

    return next(
      new AuthorizationError(
        `Insufficient platform privileges. Required: '${permissionKey}'.`,
        'FORBIDDEN'
      )
    );
  };
}
