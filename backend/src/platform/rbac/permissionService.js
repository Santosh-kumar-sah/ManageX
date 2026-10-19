/**
 * ManageX Central Permission Catalogue & Scoped RBAC Service
 * Strictly adheres to PRD Section 6.3 (RBAC-001 through RBAC-007), ADR-004, and docs/security.md.
 * 
 * Rules:
 * - Scopes are strictly segregated: Platform, Organisation, Module (RBAC-001).
 * - Central permission catalogue is immutable at runtime (RBAC-002).
 * - Server-authoritative checks evaluated dynamically on every request (RBAC-004, RBAC-006).
 * - Delegation anti-escalation controls: actors can only grant roles/permissions they themselves possess (RBAC-005).
 * - Final-owner protection invariant maintained (ORG-008).
 */

import { getPool } from '../database/pool.js';
import { withTenantTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../audit/auditService.js';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  ConflictError,
} from '../common/errors.js';

/**
 * Returns the entire central machine-readable permission catalogue grouped by scope (RBAC-002).
 * 
 * @returns {Promise<{ platform: Array<object>, organisation: Array<object>, module: Array<object> }>}
 */
export async function listPermissionsCatalogue() {
  const pool = getPool();
  const res = await pool.query(`
    SELECT id, key, name, description, scope, created_at
    FROM permissions
    ORDER BY scope ASC, key ASC
  `);

  const platform = [];
  const organisation = [];
  const moduleScope = [];

  for (const perm of res.rows) {
    const item = {
      id: perm.id,
      key: perm.key,
      name: perm.name,
      description: perm.description,
      scope: perm.scope,
    };

    if (perm.scope === 'platform') platform.push(item);
    else if (perm.scope === 'organisation') organisation.push(item);
    else if (perm.scope === 'module') moduleScope.push(item);
  }

  return { platform, organisation, module: moduleScope };
}

/**
 * Lists available roles for an organisation (system roles + tenant custom roles)
 * with their associated permission keys (RBAC-003).
 * 
 * @param {string} organisationId
 * @returns {Promise<Array<object>>}
 */
export async function listRolesForOrganisation(organisationId) {
  const query = `
    SELECT 
      r.id,
      r.name,
      r.slug,
      r.scope,
      r.is_system,
      r.organisation_id,
      COALESCE(
        json_agg(p.key) FILTER (WHERE p.key IS NOT NULL),
        '[]'::json
      ) AS permissions
    FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE (r.organisation_id IS NULL AND r.is_system = true AND r.scope IN ('organisation', 'module'))
       OR r.organisation_id = $1
    GROUP BY r.id, r.name, r.slug, r.scope, r.is_system, r.organisation_id
    ORDER BY r.scope ASC, r.name ASC
  `;

  return withTenantTransaction(
    { organisationId },
    async (client) => {
      const res = await client.query(query, [organisationId]);
      return res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        scope: row.scope,
        isSystem: row.is_system,
        isCustom: row.organisation_id !== null,
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
      }));
    }
  );
}

/**
 * Assigns an organisation or module role to a member with strict anti-escalation enforcement (RBAC-005).
 * 
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.targetUserId
 * @param {string} params.roleSlug
 * @param {string} params.actorId
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<object>}
 */
export async function assignRoleToMember({
  organisationId,
  targetUserId,
  roleSlug,
  actorId,
  ipAddress,
  userAgent,
}) {
  if (!roleSlug) {
    throw new ValidationError('Role slug is required.');
  }

  return withTenantTransaction(
    { organisationId, userId: actorId },
    async (client) => {
      // 1. Resolve target role
      const roleRes = await client.query(`
        SELECT id, name, slug, scope, is_system, organisation_id
        FROM roles
        WHERE slug = $1 
          AND ((organisation_id IS NULL AND is_system = true) OR organisation_id = $2)
      `, [roleSlug, organisationId]);

      if (roleRes.rows.length === 0) {
        throw new NotFoundError(`Role '${roleSlug}' not found for this organisation.`, 'ROLE_NOT_FOUND');
      }

      const role = roleRes.rows[0];

      // PRD RBAC-001: Platform roles cannot be assigned to organisation members
      if (role.scope === 'platform') {
        throw new AuthorizationError(
          'Platform roles cannot be assigned to organisation memberships.',
          'INVALID_ROLE_SCOPE'
        );
      }

      // 2. Fetch actor's permissions and role in this org for delegation check (RBAC-005)
      const actorPermRes = await client.query(`
        SELECT DISTINCT p.key
        FROM membership_roles mr
        JOIN organisation_memberships m ON m.id = mr.membership_id
        JOIN role_permissions rp ON rp.role_id = mr.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE m.organisation_id = $1 AND m.user_id = $2 AND m.status = 'active'
      `, [organisationId, actorId]);

      const actorPermissions = new Set(actorPermRes.rows.map((r) => r.key));

      // Fetch target role's permissions
      const targetRolePermRes = await client.query(`
        SELECT p.key
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
      `, [role.id]);

      const targetRolePermissions = targetRolePermRes.rows.map((r) => r.key);

      // Anti-escalation: Actor can only delegate permissions they possess (RBAC-005)
      const missingPermissions = targetRolePermissions.filter((p) => !actorPermissions.has(p));
      if (missingPermissions.length > 0) {
        throw new AuthorizationError(
          `Anti-escalation violation: You cannot grant role '${role.name}' because you lack the following permissions: ${missingPermissions.join(', ')}`,
          'PRIVILEGE_ESCALATION_BLOCKED'
        );
      }

      // 3. Resolve target membership
      const memRes = await client.query(`
        SELECT id, user_id, status
        FROM organisation_memberships
        WHERE organisation_id = $1 AND user_id = $2
      `, [organisationId, targetUserId]);

      if (memRes.rows.length === 0) {
        throw new NotFoundError('Target user is not a member of this organisation.', 'MEMBER_NOT_FOUND');
      }

      const membership = memRes.rows[0];
      if (membership.status !== 'active') {
        throw new AuthorizationError('Cannot assign roles to inactive or suspended members.', 'INACTIVE_MEMBER');
      }

      // 4. Insert into membership_roles
      await client.query(`
        INSERT INTO membership_roles (organisation_id, membership_id, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (membership_id, role_id) DO NOTHING
      `, [organisationId, membership.id, role.id]);

      // 5. Audit event
      await recordAuditEvent({
        organisationId,
        actorId,
        action: 'org.member.role.assign',
        entityType: 'membership_role',
        entityId: `${membership.id}:${role.id}`,
        metadata: {
          targetUserId,
          membershipId: membership.id,
          roleSlug: role.slug,
          roleName: role.name,
          roleScope: role.scope,
        },
        ipAddress,
        userAgent,
        client,
      });

      return {
        membershipId: membership.id,
        userId: targetUserId,
        role: {
          id: role.id,
          name: role.name,
          slug: role.slug,
          scope: role.scope,
        },
      };
    }
  );
}

/**
 * Removes a role from a member, enforcing final-owner protection (ORG-008, RBAC-005).
 * 
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.targetUserId
 * @param {string} params.roleSlug
 * @param {string} params.actorId
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<object>}
 */
export async function removeRoleFromMember({
  organisationId,
  targetUserId,
  roleSlug,
  actorId,
  ipAddress,
  userAgent,
}) {
  return withTenantTransaction(
    { organisationId, userId: actorId },
    async (client) => {
      // 1. Lock organisation row to prevent race conditions with other owner operations
      await client.query('SELECT id FROM organisations WHERE id = $1 FOR UPDATE', [organisationId]);

      // 2. Resolve target membership and role
      const memRes = await client.query(`
        SELECT id, user_id, status
        FROM organisation_memberships
        WHERE organisation_id = $1 AND user_id = $2
      `, [organisationId, targetUserId]);

      if (memRes.rows.length === 0) {
        throw new NotFoundError('Target member not found in this organisation.', 'MEMBER_NOT_FOUND');
      }

      const membership = memRes.rows[0];

      const roleRes = await client.query(`
        SELECT id, name, slug, scope
        FROM roles
        WHERE slug = $1 
          AND ((organisation_id IS NULL AND is_system = true) OR organisation_id = $2)
      `, [roleSlug, organisationId]);

      if (roleRes.rows.length === 0) {
        throw new NotFoundError(`Role '${roleSlug}' not found.`, 'ROLE_NOT_FOUND');
      }

      const role = roleRes.rows[0];

      // 3. Final owner protection invariant check (ORG-008)
      if (role.slug === 'organisation_owner') {
        const ownerCountRes = await client.query(`
          SELECT COUNT(DISTINCT m.id) AS count
          FROM organisation_memberships m
          JOIN membership_roles mr ON mr.membership_id = m.id AND mr.organisation_id = m.organisation_id
          JOIN roles r ON r.id = mr.role_id
          WHERE m.organisation_id = $1 
            AND m.status = 'active' 
            AND r.slug = 'organisation_owner'
        `, [organisationId]);

        const activeOwnerCount = parseInt(ownerCountRes.rows[0].count, 10);
        if (activeOwnerCount <= 1) {
          throw new ConflictError(
            'Cannot remove the Owner role: The organisation must have at least one active owner.',
            'FINAL_OWNER_PROTECTION'
          );
        }
      }

      // 4. Remove role assignment
      const deleteRes = await client.query(`
        DELETE FROM membership_roles
        WHERE organisation_id = $1 AND membership_id = $2 AND role_id = $3
        RETURNING id
      `, [organisationId, membership.id, role.id]);

      if (deleteRes.rowCount === 0) {
        throw new NotFoundError('Member does not possess this role.', 'ROLE_ASSIGNMENT_NOT_FOUND');
      }

      // 5. Record audit event
      await recordAuditEvent({
        organisationId,
        actorId,
        action: 'org.member.role.remove',
        entityType: 'membership_role',
        entityId: `${membership.id}:${role.id}`,
        metadata: {
          targetUserId,
          membershipId: membership.id,
          roleSlug: role.slug,
          roleName: role.name,
        },
        ipAddress,
        userAgent,
        client,
      });

      return {
        success: true,
        message: `Role '${role.name}' removed from member.`,
      };
    }
  );
}
