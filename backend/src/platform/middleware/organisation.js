/**
 * ManageX Organisation Context & Membership Authorization Middleware
 * Strictly adheres to PRD Section 6.2 (ORG-002, ORG-004), Section 6.3 (RBAC-001, RBAC-004), and docs/security.md.
 * 
 * Rules:
 * - Client-supplied organisation ID is NEVER proof of authorization.
 * - Always derives effective membership and role from trusted server-side PostgreSQL state.
 * - Suspended or removed memberships immediately fail closed (403).
 * - Enforces scoped permission keys without hardcoded string shortcuts.
 * - Supports multi-role permission aggregation across organisation and module roles.
 */

import { withTenantTransaction } from '../database/transaction.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../common/errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Canonical permission aliases for backwards-compatibility across PRD, API contracts and specs
const PERMISSION_ALIASES = {
  'org.read': 'org.view',
  'org.view': 'org.read',
  'org.update': 'org.edit',
  'org.edit': 'org.update',
  'org.member.read': 'org.members.view',
  'org.members.view': 'org.member.read',
  'org.member.manage': 'org.members.manage',
  'org.members.manage': 'org.member.manage',
  'org.module.manage': 'org.modules.manage',
  'org.modules.manage': 'org.module.manage',
  'event.read': 'event.view',
  'event.view': 'event.read',
  'event.update': 'event.edit',
  'event.edit': 'event.update',
  'event.judge.evaluate': 'event.judge',
  'event.judge': 'event.judge.evaluate',
  'meeting.read': 'meeting.view',
  'meeting.view': 'meeting.read',
  'meeting.update': 'meeting.edit',
  'meeting.edit': 'meeting.update',
  'meeting.notes.manage': 'meeting.notes.edit',
  'meeting.notes.edit': 'meeting.notes.manage',
  'project.read': 'project.view',
  'project.view': 'project.read',
  'project.update': 'project.edit',
  'project.edit': 'project.update',
  'task.read': 'task.view',
  'task.view': 'task.read',
  'task.update': 'task.edit',
  'task.edit': 'task.update',
};

/**
 * Middleware requiring active membership in the organisation specified by `req.params.orgId` or `req.params.id`.
 * Populates `req.organisation` and `req.membership` with verified role and permission sets.
 */
export async function requireOrgMembership(req, res, next) {
  try {
    const orgIdentifier = req.params.orgId || req.params.id;

    if (!orgIdentifier) {
      throw new ValidationError('Organisation identifier parameter is required.');
    }

    const isUuid = UUID_REGEX.test(orgIdentifier);

    // Query organisation, membership, all assigned roles and all assigned permissions in one round-trip
    const query = `
      SELECT 
        o.id AS org_id,
        o.name AS org_name,
        o.slug AS org_slug,
        o.status AS org_status,
        m.id AS membership_id,
        m.status AS membership_status,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('id', r.id, 'slug', r.slug, 'name', r.name, 'scope', r.scope))
          FILTER (WHERE r.id IS NOT NULL),
          '[]'::json
        ) AS roles,
        COALESCE(
          json_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL),
          '[]'::json
        ) AS permissions
      FROM organisations o
      LEFT JOIN organisation_memberships m 
        ON m.organisation_id = o.id AND m.user_id = $1
      LEFT JOIN membership_roles mr 
        ON mr.membership_id = m.id AND mr.organisation_id = o.id
      LEFT JOIN roles r 
        ON r.id = mr.role_id
      LEFT JOIN role_permissions rp 
        ON rp.role_id = r.id
      LEFT JOIN permissions p 
        ON p.id = rp.permission_id
      WHERE ${isUuid ? 'o.id = $2' : 'o.slug = $2'}
      GROUP BY o.id, o.name, o.slug, o.status, m.id, m.status
    `;

    const result = await withTenantTransaction(
      {
        userId: req.user.id,
        organisationId: isUuid ? orgIdentifier : undefined,
      },
      async (client) => {
        return client.query(query, [req.user.id, orgIdentifier]);
      }
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Organisation not found.', 'ORG_NOT_FOUND');
    }

    const row = result.rows[0];

    // Check organisation status
    if (row.org_status !== 'active') {
      throw new AuthorizationError('This organisation is suspended or archived.', 'ORG_INACTIVE');
    }

    // Check membership status (fails closed per ORG-004)
    if (!row.membership_id || row.membership_status !== 'active') {
      throw new AuthorizationError(
        'You do not have active membership in this organisation.',
        'MEMBERSHIP_REQUIRED'
      );
    }

    const rawPermissions = Array.isArray(row.permissions) ? row.permissions : [];
    const permissions = new Set(rawPermissions);

    // Expand permission aliases into set for robust evaluation
    for (const p of rawPermissions) {
      if (PERMISSION_ALIASES[p]) {
        permissions.add(PERMISSION_ALIASES[p]);
      }
    }

    const roles = Array.isArray(row.roles) ? row.roles : [];
    // Identify primary organisation role
    const primaryRole = roles.find((r) => r.slug === 'organisation_owner') ||
                        roles.find((r) => r.slug === 'organisation_admin') ||
                        roles.find((r) => r.slug === 'organisation_member') ||
                        roles[0] ||
                        { id: null, slug: 'organisation_member', name: 'Organisation Member', scope: 'organisation' };

    req.organisation = {
      id: row.org_id,
      name: row.org_name,
      slug: row.org_slug,
      status: row.org_status,
    };

    req.membership = {
      id: row.membership_id,
      organisationId: row.org_id,
      userId: req.user.id,
      status: row.membership_status,
      roleId: primaryRole.id,
      roleSlug: primaryRole.slug,
      roleName: primaryRole.name,
      roles,
      permissions,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guard requiring a specific permission key in the active organisation context.
 * Checks caller's effective aggregated permission set (RBAC-002, RBAC-004).
 * 
 * @param {string} permissionKey - e.g. 'org.members.manage', 'org.edit', 'event.create'
 */
export function requireOrgPermission(permissionKey) {
  return function permissionGuard(req, res, next) {
    if (!req.membership) {
      return next(new AuthorizationError('Organisation membership context required.', 'MEMBERSHIP_REQUIRED'));
    }

    // Platform Super Admin bypass or user possess permission (or alias)
    const hasPermission = req.user?.isPlatformAdmin ||
      req.membership.permissions.has(permissionKey) ||
      (PERMISSION_ALIASES[permissionKey] && req.membership.permissions.has(PERMISSION_ALIASES[permissionKey]));

    if (hasPermission) {
      return next();
    }

    next(new AuthorizationError(
      `Permission denied. Required permission: '${permissionKey}'`,
      'FORBIDDEN'
    ));
  };
}

/**
 * Middleware that resolves organisation context without requiring membership.
 * Populates req.organisation, and optionally req.membership if the user is a member.
 * Used for public event endpoints where external participants have a verified account
 * but no membership in the hosting organisation (EVT-004, ADR-003).
 */
export async function resolveOrgContext(req, res, next) {
  try {
    const orgIdentifier = req.params.orgId || req.params.id;

    if (!orgIdentifier) {
      throw new ValidationError('Organisation identifier parameter is required.');
    }

    const isUuid = UUID_REGEX.test(orgIdentifier);

    const query = `
      SELECT 
        o.id AS org_id,
        o.name AS org_name,
        o.slug AS org_slug,
        o.status AS org_status,
        m.id AS membership_id,
        m.status AS membership_status,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('id', r.id, 'slug', r.slug, 'name', r.name, 'scope', r.scope))
          FILTER (WHERE r.id IS NOT NULL),
          '[]'::json
        ) AS roles,
        COALESCE(
          json_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL),
          '[]'::json
        ) AS permissions
      FROM organisations o
      LEFT JOIN organisation_memberships m 
        ON m.organisation_id = o.id AND m.user_id = $1
      LEFT JOIN membership_roles mr 
        ON mr.membership_id = m.id AND mr.organisation_id = o.id
      LEFT JOIN roles r 
        ON r.id = mr.role_id
      LEFT JOIN role_permissions rp 
        ON rp.role_id = r.id
      LEFT JOIN permissions p 
        ON p.id = rp.permission_id
      WHERE ${isUuid ? 'o.id = $2' : 'o.slug = $2'}
      GROUP BY o.id, o.name, o.slug, o.status, m.id, m.status
    `;

    const result = await withTenantTransaction(
      {
        userId: req.user?.id,
        organisationId: isUuid ? orgIdentifier : undefined,
      },
      async (client) => {
        return client.query(query, [req.user?.id || null, orgIdentifier]);
      }
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Organisation not found.', 'ORG_NOT_FOUND');
    }

    const row = result.rows[0];

    if (row.org_status !== 'active') {
      throw new AuthorizationError('This organisation is suspended or archived.', 'ORG_INACTIVE');
    }

    req.organisation = {
      id: row.org_id,
      name: row.org_name,
      slug: row.org_slug,
      status: row.org_status,
    };

    if (row.membership_id && row.membership_status === 'active') {
      const rawPermissions = Array.isArray(row.permissions) ? row.permissions : [];
      const permissions = new Set(rawPermissions);
      for (const p of rawPermissions) {
        if (PERMISSION_ALIASES[p]) {
          permissions.add(PERMISSION_ALIASES[p]);
        }
      }
      const roles = Array.isArray(row.roles) ? row.roles : [];
      const primaryRole = roles.find((r) => r.slug === 'organisation_owner') ||
        roles.find((r) => r.slug === 'organisation_admin') ||
        roles[0] || { id: null, slug: 'organisation_member', name: 'Member' };

      req.membership = {
        id: row.membership_id,
        organisationId: row.org_id,
        userId: req.user.id,
        status: row.membership_status,
        roleId: primaryRole.id,
        roleSlug: primaryRole.slug,
        roleName: primaryRole.name,
        roles,
        permissions,
      };
    } else {
      req.membership = null;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guard requiring one of the specified organisation roles.
 * @param {string[]} allowedRoleSlugs - e.g. ['organisation_owner', 'organisation_admin']
 */
export function requireOrgRole(allowedRoleSlugs) {
  return function roleGuard(req, res, next) {
    if (!req.membership) {
      return next(new AuthorizationError('Organisation membership context required.', 'MEMBERSHIP_REQUIRED'));
    }

    const userRoles = req.membership.roles ? req.membership.roles.map((r) => r.slug) : [req.membership.roleSlug];
    const hasRole = req.user?.isPlatformAdmin || allowedRoleSlugs.some((r) => userRoles.includes(r));

    if (hasRole) {
      return next();
    }

    next(new AuthorizationError(
      `Access denied. Requires one of the following roles: ${allowedRoleSlugs.join(', ')}`,
      'FORBIDDEN'
    ));
  };
}

