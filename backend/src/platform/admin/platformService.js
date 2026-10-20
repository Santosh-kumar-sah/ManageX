/**
 * ManageX Platform Administration Service
 * Strictly adheres to PRD Section 10 (PLAT-001 through PLAT-007), docs/security.md Section 4.B, and SEC-009.
 * 
 * Invariants:
 * - PLAT-001: Distinct platform namespace; platform roles do not imply organisation membership.
 * - PLAT-002: Account inspection & status management. Never returns password hashes, tokens, or secrets.
 *             No impersonation or silent login-as-user.
 * - PLAT-003: Organisation operational metadata only. Never exposes private tenant data.
 * - PLAT-004: Module availability toggling limited strictly to fixed MVP modules (events, meetings, projects).
 *             Disabling availability cascades to block activation & use; preserves data.
 * - PLAT-005: Support Agent restricted to read-only operational metadata. Mutations fail closed (403).
 * - PLAT-006: Strictly no ticketing product, ticket queues, or case-management workflows.
 * - PLAT-007: High-impact actions require audit trail; module deactivation preserves data.
 * - SEC-009: Runtime role `managex_app` has NOBYPASSRLS.
 */

import { getPool } from '../database/pool.js';
import { withTenantTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../audit/auditService.js';
import { revokeAllUserSessions } from '../auth/sessionService.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../common/errors.js';

// Approved fixed MVP modules (PLAT-004)
const ALLOWED_MODULE_SLUGS = new Set(['events', 'meetings', 'projects']);

/**
 * Retrieves high-level operational overview metrics for platform console.
 * Accessible to Super Admin and Support Agent.
 */
export async function getPlatformOverview() {
  const pool = getPool();

  const [usersRes, orgsRes, modulesRes] = await Promise.all([
    pool.query(`
      SELECT 
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_users,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended_users,
        COUNT(*) FILTER (WHERE status = 'pending_verification')::int AS pending_users
      FROM users
    `),
    pool.query(`
      SELECT 
        COUNT(*)::int AS total_organisations,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_organisations,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended_organisations
      FROM organisations
    `),
    pool.query(`
      SELECT 
        m.id,
        m.slug,
        m.name,
        m.description,
        m.is_core,
        m.is_platform_available,
        COUNT(DISTINCT e.organisation_id) FILTER (WHERE e.is_enabled = true)::int AS active_organisations_count
      FROM modules m
      LEFT JOIN organisation_module_entitlements e ON e.module_id = m.id
      GROUP BY m.id
      ORDER BY m.name ASC
    `),
  ]);

  const userStats = usersRes.rows[0] || {};
  const orgStats = orgsRes.rows[0] || {};

  return {
    users: {
      total: userStats.total_users || 0,
      active: userStats.active_users || 0,
      suspended: userStats.suspended_users || 0,
      pendingVerification: userStats.pending_users || 0,
    },
    organisations: {
      total: orgStats.total_organisations || 0,
      active: orgStats.active_organisations || 0,
      suspended: orgStats.suspended_organisations || 0,
    },
    modules: modulesRes.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isCore: row.is_core,
      isPlatformAvailable: row.is_platform_available,
      activeOrganisationsCount: row.active_organisations_count || 0,
    })),
  };
}

/**
 * Lists user accounts with allowlisted operational fields only (PLAT-002, SEC-007).
 * Strictly omits password hashes, verification tokens, or secrets.
 */
export async function listAccounts({ page = 1, limit = 20, search, status } = {}) {
  const pool = getPool();
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (status && ['active', 'suspended', 'pending_verification'].includes(status)) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }

  if (search && typeof search === 'string' && search.trim().length > 0) {
    conditions.push(`(full_name ILIKE $${paramIdx} OR email ILIKE $${paramIdx})`);
    params.push(`%${search.trim()}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*)::int AS total FROM users ${whereClause}`;
  const dataQuery = `
    SELECT 
      id,
      full_name,
      email,
      status,
      is_platform_admin,
      platform_role,
      email_verified_at,
      created_at,
      updated_at
    FROM users
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;

  const [countRes, dataRes] = await Promise.all([
    pool.query(countQuery, params),
    pool.query(dataQuery, [...params, safeLimit, offset]),
  ]);

  const total = countRes.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / safeLimit) || 1;

  const accounts = dataRes.rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    status: r.status,
    isPlatformAdmin: Boolean(r.is_platform_admin),
    platformRole: r.platform_role || (r.is_platform_admin ? 'platform_super_admin' : null),
    emailVerifiedAt: r.email_verified_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return {
    accounts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    },
  };
}

/**
 * Updates a user account status (active/suspended) with session revocation and audit logging (PLAT-002, PLAT-007).
 * Super Admin only.
 */
export async function updateAccountStatus({
  actorId,
  userId,
  status,
  reason,
  ipAddress,
  userAgent,
}) {
  if (!['active', 'suspended'].includes(status)) {
    throw new ValidationError("Account status must be 'active' or 'suspended'.");
  }

  // Prevent self-suspension
  if (actorId === userId && status === 'suspended') {
    throw new ConflictError('You cannot suspend your own platform administrator account.', 'CANNOT_SUSPEND_SELF');
  }

  return withTenantTransaction(
    { userId: actorId, isPlatformAdmin: true },
    async (client) => {
      // Fetch existing user record
      const userRes = await client.query(
        `SELECT id, email, full_name, status, is_platform_admin, platform_role FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );

      if (userRes.rows.length === 0) {
        throw new NotFoundError('User account not found.', 'USER_NOT_FOUND');
      }

      const targetUser = userRes.rows[0];
      const previousStatus = targetUser.status;

      // Update user status
      await client.query(
        `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, userId]
      );

      // If suspended, revoke all active sessions immediately (AUTH-004, PLAT-002)
      let revokedSessionCount = 0;
      if (status === 'suspended') {
        revokedSessionCount = await revokeAllUserSessions(userId, client);
      }

      // Record immutable audit event
      await recordAuditEvent({
        organisationId: null, // Platform scope
        actorId,
        action: 'platform.account.status_updated',
        entityType: 'user',
        entityId: userId,
        metadata: {
          target_email: targetUser.email,
          previous_status: previousStatus,
          new_status: status,
          reason: reason || null,
          revoked_sessions: revokedSessionCount,
        },
        ipAddress,
        userAgent,
        client,
      });

      return {
        id: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.full_name,
        status,
        previousStatus,
        isPlatformAdmin: Boolean(targetUser.is_platform_admin),
        platformRole: targetUser.platform_role || (targetUser.is_platform_admin ? 'platform_super_admin' : null),
        revokedSessionCount,
      };
    }
  );
}

/**
 * Lists organisations with operational metadata only (PLAT-003, SEC-009).
 * Strictly does NOT return private tenant contents (events, notes, tasks).
 */
export async function listOrganisations({ page = 1, limit = 20, search, status } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (status && ['active', 'suspended'].includes(status)) {
    conditions.push(`o.status = $${paramIdx++}`);
    params.push(status);
  }

  if (search && typeof search === 'string' && search.trim().length > 0) {
    conditions.push(`(o.name ILIKE $${paramIdx} OR o.slug ILIKE $${paramIdx})`);
    params.push(`%${search.trim()}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*)::int AS total FROM organisations o ${whereClause}`;
  const dataQuery = `
    SELECT 
      o.id,
      o.name,
      o.slug,
      o.status,
      o.created_at,
      o.updated_at,
      COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'active')::int AS member_count,
      COUNT(DISTINCT e.id) FILTER (WHERE e.is_enabled = true)::int AS active_modules_count
    FROM organisations o
    LEFT JOIN organisation_memberships m ON m.organisation_id = o.id
    LEFT JOIN organisation_module_entitlements e ON e.organisation_id = o.id
    ${whereClause}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;

  // Use platform transaction setting to satisfy RLS for organisations table
  return withTenantTransaction(
    { isPlatformAdmin: true },
    async (client) => {
      const [countRes, dataRes] = await Promise.all([
        client.query(countQuery, params),
        client.query(dataQuery, [...params, safeLimit, offset]),
      ]);

      const total = countRes.rows[0]?.total || 0;
      const totalPages = Math.ceil(total / safeLimit) || 1;

      const organisations = dataRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        memberCount: row.member_count || 0,
        activeModulesCount: row.active_modules_count || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return {
        organisations,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
      };
    }
  );
}

/**
 * Retrieves single organisation operational metadata and active modules (PLAT-003).
 */
export async function getOrganisationDetails({ orgId }) {
  return withTenantTransaction(
    { isPlatformAdmin: true },
    async (client) => {
      const orgRes = await client.query(
        `
        SELECT 
          o.id,
          o.name,
          o.slug,
          o.status,
          o.created_at,
          o.updated_at,
          COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'active')::int AS member_count
        FROM organisations o
        LEFT JOIN organisation_memberships m ON m.organisation_id = o.id
        WHERE o.id = $1
        GROUP BY o.id
        `,
        [orgId]
      );

      if (orgRes.rows.length === 0) {
        throw new NotFoundError('Organisation not found.', 'ORG_NOT_FOUND');
      }

      const org = orgRes.rows[0];

      // Fetch module entitlement statuses
      const modRes = await client.query(
        `
        SELECT 
          m.id,
          m.slug,
          m.name,
          m.is_platform_available,
          COALESCE(e.is_enabled, false) AS is_enabled
        FROM modules m
        LEFT JOIN organisation_module_entitlements e 
          ON e.module_id = m.id AND e.organisation_id = $1
        ORDER BY m.name ASC
        `,
        [orgId]
      );

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        memberCount: org.member_count || 0,
        createdAt: org.created_at,
        updatedAt: org.updated_at,
        modules: modRes.rows.map((m) => ({
          id: m.id,
          slug: m.slug,
          name: m.name,
          isPlatformAvailable: m.is_platform_available,
          isEnabled: m.is_enabled,
        })),
      };
    }
  );
}

/**
 * Updates an organisation status (active/suspended) with audit logging (PLAT-003, PLAT-007).
 * Non-destructive: preserves all data intact.
 * Super Admin only.
 */
export async function updateOrganisationStatus({
  actorId,
  orgId,
  status,
  reason,
  ipAddress,
  userAgent,
}) {
  if (!['active', 'suspended'].includes(status)) {
    throw new ValidationError("Organisation status must be 'active' or 'suspended'.");
  }

  return withTenantTransaction(
    { userId: actorId, isPlatformAdmin: true },
    async (client) => {
      const orgRes = await client.query(
        `SELECT id, name, slug, status FROM organisations WHERE id = $1 FOR UPDATE`,
        [orgId]
      );

      if (orgRes.rows.length === 0) {
        throw new NotFoundError('Organisation not found.', 'ORG_NOT_FOUND');
      }

      const org = orgRes.rows[0];
      const previousStatus = org.status;

      await client.query(
        `UPDATE organisations SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, orgId]
      );

      // Record immutable audit event
      await recordAuditEvent({
        organisationId: null, // Platform scope
        actorId,
        action: 'platform.org.status_updated',
        entityType: 'organisation',
        entityId: orgId,
        metadata: {
          org_name: org.name,
          org_slug: org.slug,
          previous_status: previousStatus,
          new_status: status,
          reason: reason || null,
        },
        ipAddress,
        userAgent,
        client,
      });

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status,
        previousStatus,
      };
    }
  );
}

/**
 * Lists the fixed platform module catalogue with platform availability (PLAT-004).
 */
export async function listPlatformModules() {
  const pool = getPool();
  const res = await pool.query(`
    SELECT 
      m.id,
      m.slug,
      m.name,
      m.description,
      m.is_core,
      m.is_platform_available,
      COUNT(DISTINCT e.organisation_id) FILTER (WHERE e.is_enabled = true)::int AS active_organisations_count
    FROM modules m
    LEFT JOIN organisation_module_entitlements e ON e.module_id = m.id
    GROUP BY m.id
    ORDER BY m.name ASC
  `);

  return res.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isCore: row.is_core,
    isPlatformAvailable: row.is_platform_available,
    activeOrganisationsCount: row.active_organisations_count || 0,
  }));
}

/**
 * Updates platform-wide availability of a module (PLAT-004, PLAT-007).
 * Super Admin only. Strictly restricted to fixed MVP modules: events, meetings, projects.
 */
export async function updatePlatformModuleAvailability({
  actorId,
  slug,
  isAvailable,
  reason,
  ipAddress,
  userAgent,
}) {
  if (!ALLOWED_MODULE_SLUGS.has(slug)) {
    throw new NotFoundError(
      `Module '${slug}' not recognized. Platform management is restricted to MVP modules: events, meetings, projects.`,
      'MODULE_NOT_FOUND'
    );
  }

  if (typeof isAvailable !== 'boolean') {
    throw new ValidationError("Parameter 'is_available' must be a boolean.");
  }

  return withTenantTransaction(
    { userId: actorId, isPlatformAdmin: true },
    async (client) => {
      const modRes = await client.query(
        `SELECT id, slug, name, description, is_platform_available FROM modules WHERE slug = $1 FOR UPDATE`,
        [slug]
      );

      if (modRes.rows.length === 0) {
        throw new NotFoundError(`Module '${slug}' not found in platform catalogue.`, 'MODULE_NOT_FOUND');
      }

      const mod = modRes.rows[0];
      const previousAvailability = mod.is_platform_available;

      // Update module platform availability
      await client.query(
        `UPDATE modules SET is_platform_available = $1 WHERE slug = $2`,
        [isAvailable, slug]
      );

      // Record immutable audit event
      await recordAuditEvent({
        organisationId: null, // Platform scope
        actorId,
        action: 'platform.module.availability_updated',
        entityType: 'module',
        entityId: mod.id,
        metadata: {
          module_slug: slug,
          module_name: mod.name,
          previous_availability: previousAvailability,
          new_availability: isAvailable,
          reason: reason || null,
        },
        ipAddress,
        userAgent,
        client,
      });

      return {
        id: mod.id,
        slug: mod.slug,
        name: mod.name,
        isPlatformAvailable: isAvailable,
        previousAvailability,
      };
    }
  );
}

/**
 * Lists platform-level audit logs (organisation_id IS NULL) with pagination (PLAT-007).
 * Accessible to Super Admin.
 */
export async function listPlatformAuditLogs({ page = 1, limit = 50, action, entityType } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const conditions = ['a.organisation_id IS NULL'];
  const params = [];
  let paramIdx = 1;

  if (action && typeof action === 'string') {
    conditions.push(`a.action = $${paramIdx++}`);
    params.push(action);
  }

  if (entityType && typeof entityType === 'string') {
    conditions.push(`a.entity_type = $${paramIdx++}`);
    params.push(entityType);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  return withTenantTransaction(
    { isPlatformAdmin: true },
    async (client) => {
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM audit_logs a ${whereClause}`,
        params
      );

      const dataRes = await client.query(
        `
        SELECT 
          a.id,
          a.action,
          a.entity_type,
          a.entity_id,
          a.metadata,
          a.ip_address,
          a.user_agent,
          a.created_at,
          u.id AS actor_id,
          u.full_name AS actor_name,
          u.email AS actor_email
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
        `,
        [...params, safeLimit, offset]
      );

      const total = countRes.rows[0]?.total || 0;
      const totalPages = Math.ceil(total / safeLimit) || 1;

      return {
        logs: dataRes.rows.map((row) => ({
          id: row.id,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          metadata: row.metadata,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at,
          actor: row.actor_id
            ? {
                id: row.actor_id,
                fullName: row.actor_name,
                email: row.actor_email,
              }
            : null,
        })),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
      };
    }
  );
}
