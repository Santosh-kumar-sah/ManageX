/**
 * ManageX Organisation Lifecycle & Membership Service
 * Strictly adheres to PRD Section 6.2 (ORG-001 through ORG-010), ADR-001, ADR-002, ADR-004, and docs/security.md.
 * 
 * Rules:
 * - Atomic organisation & owner creation in one database transaction (ORG-001).
 * - Multi-tenant isolation and composite foreign key enforcement.
 * - Strict final-owner protection: final owner cannot be demoted, suspended, or removed (ORG-008).
 * - Step-up reauthentication for high-impact ownership transfer (ORG-008).
 * - Cryptographically random, single-use, 7-day invitations hashed with SHA-256 at rest (ORG-005).
 * - Safe concurrent invitation acceptance and email identity matching (ORG-005, ORG-006).
 * - Immutable audit logging for all mutations without recording sensitive data (AUD-001).
 */

import { randomUUID } from 'node:crypto';
import { getPool } from '../database/pool.js';
import { withTenantTransaction, withSystemTransaction } from '../database/transaction.js';
import { generateSecureToken, hashToken } from '../auth/tokens.js';
import { verifyPassword } from '../auth/passwords.js';
import { recordAuditEvent } from '../audit/auditService.js';
import { sendEmail } from '../email/emailService.js';
import { env } from '../../config/env.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
} from '../common/errors.js';

/**
 * Utility to convert arbitrary string into a clean, URL-safe slug.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

/**
 * Creates a new organisation and assigns the creator as the initial Owner atomically (ORG-001).
 */
export async function createOrganisation({ name, slug: customSlug, userId, ipAddress, userAgent }) {
  const pool = getPool();
  const client = await pool.connect();

  const generatedSlug = customSlug ? slugify(customSlug) : slugify(name);
  if (!generatedSlug || generatedSlug.length < 2) {
    throw new ValidationError('A valid alphanumeric slug is required.');
  }

  try {
    await client.query('BEGIN');
    const newOrgId = randomUUID();

    await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [userId]);
    await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [newOrgId]);

    // 1. Check slug uniqueness across the entire system
    await client.query("SELECT set_config('app.current_is_platform_admin', 'true', true)");
    const existingSlug = await client.query('SELECT id FROM organisations WHERE slug = $1', [generatedSlug]);
    await client.query("SELECT set_config('app.current_is_platform_admin', 'false', true)");
    if (existingSlug.rows.length > 0) {
      throw new ConflictError('An organisation with this slug already exists. Please choose a different slug.', 'SLUG_ALREADY_EXISTS');
    }

    // 2. Insert organisation with pre-generated UUID
    const orgRes = await client.query(`
      INSERT INTO organisations (id, name, slug, status)
      VALUES ($1, $2, $3, 'active')
      RETURNING id, name, slug, status, created_at, updated_at
    `, [newOrgId, name.trim(), generatedSlug]);

    const org = orgRes.rows[0];

    // 3. Insert initial Owner membership
    const memberRes = await client.query(`
      INSERT INTO organisation_memberships (organisation_id, user_id, status)
      VALUES ($1, $2, 'active')
      RETURNING id, organisation_id, user_id, status, created_at
    `, [org.id, userId]);

    const membership = memberRes.rows[0];

    // 4. Find system role `organisation_owner`
    const roleRes = await client.query(`
      SELECT id FROM roles 
      WHERE slug = 'organisation_owner' AND organisation_id IS NULL
    `);

    if (roleRes.rows.length === 0) {
      throw new Error('System role organisation_owner is not seeded in database.');
    }

    const ownerRoleId = roleRes.rows[0].id;

    // 5. Assign Owner role
    await client.query(`
      INSERT INTO membership_roles (organisation_id, membership_id, role_id)
      VALUES ($1, $2, $3)
    `, [org.id, membership.id, ownerRoleId]);

    // 6. Enable all core modules by default for this organisation
    const modulesRes = await client.query('SELECT id FROM modules');
    for (const mod of modulesRes.rows) {
      await client.query(`
        INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled)
        VALUES ($1, $2, true)
        ON CONFLICT DO NOTHING
      `, [org.id, mod.id]);
    }

    // 7. Record immutable audit log (AUD-001)
    await recordAuditEvent({
      organisationId: org.id,
      actorId: userId,
      action: 'org.create',
      entityType: 'organisation',
      entityId: org.id,
      metadata: { name: org.name, slug: org.slug },
      ipAddress,
      userAgent,
      client,
    });

    await client.query('COMMIT');

    return {
      ...org,
      role: {
        slug: 'organisation_owner',
        name: 'Organisation Owner',
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && (err.constraint === 'uq_organisations_slug' || err.message?.includes('slug'))) {
      throw new ConflictError('An organisation with this slug already exists. Please choose a different slug.', 'SLUG_ALREADY_EXISTS');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists all active organisations for the specified user (ORG-002).
 */
export async function listUserOrganisations(userId) {
  return withTenantTransaction({ userId }, async (client) => {
    const query = `
      SELECT 
        o.id,
        o.name,
        o.slug,
        o.status,
        o.created_at,
        r.slug AS role_slug,
        r.name AS role_name,
        (SELECT count(*) FROM organisation_memberships m2 WHERE m2.organisation_id = o.id AND m2.status = 'active')::int AS member_count
      FROM organisations o
      JOIN organisation_memberships m ON m.organisation_id = o.id AND m.user_id = $1
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id AND mr.organisation_id = o.id
      LEFT JOIN roles r ON r.id = mr.role_id
      WHERE m.status = 'active' AND o.status = 'active'
      ORDER BY o.created_at DESC
    `;

    const result = await client.query(query, [userId]);

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdAt: row.created_at,
      memberCount: row.member_count,
      role: {
        slug: row.role_slug || 'organisation_member',
        name: row.role_name || 'Organisation Member',
      },
    }));
  });
}

/**
 * Updates organisation profile/settings (ORG-009). Only approved fields are editable.
 */
export async function updateOrganisation(orgId, { name }, actorId, { ipAddress, userAgent }) {
  return withTenantTransaction({ userId: actorId, organisationId: orgId }, async (client) => {
    const res = await client.query(`
      UPDATE organisations
      SET name = $1, updated_at = NOW()
      WHERE id = $2 AND status = 'active'
      RETURNING id, name, slug, status, updated_at
    `, [name.trim(), orgId]);

    if (res.rows.length === 0) {
      throw new NotFoundError('Organisation not found or inactive.');
    }

    const updatedOrg = res.rows[0];

    await recordAuditEvent({
      organisationId: orgId,
      actorId,
      action: 'org.update',
      entityType: 'organisation',
      entityId: orgId,
      metadata: { name: updatedOrg.name },
      ipAddress,
      userAgent,
      client,
    });

    return updatedOrg;
  });
}

/**
 * Lists all members and pending invitations for an organisation (ORG-004, ORG-007).
 */
export async function listOrganisationMembers(orgId) {
  return withTenantTransaction({ organisationId: orgId }, async (client) => {
    // 1. Members
    const membersQuery = `
      SELECT 
        m.id AS membership_id,
        m.status AS membership_status,
        m.created_at AS joined_at,
        u.id AS user_id,
        u.full_name,
        u.email,
        r.id AS role_id,
        r.slug AS role_slug,
        r.name AS role_name
      FROM organisation_memberships m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id AND mr.organisation_id = m.organisation_id
      LEFT JOIN roles r ON r.id = mr.role_id
      WHERE m.organisation_id = $1 AND m.status != 'removed'
      ORDER BY 
        CASE WHEN r.slug = 'organisation_owner' THEN 1 
             WHEN r.slug = 'organisation_admin' THEN 2 
             ELSE 3 END,
        u.full_name ASC
    `;

    // 2. Pending Invitations
    const invitesQuery = `
      SELECT 
        i.id,
        i.email,
        i.status,
        i.expires_at,
        i.created_at,
        u.full_name AS invited_by_name,
        r.slug AS role_slug,
        r.name AS role_name
      FROM invitations i
      JOIN users u ON u.id = i.invited_by_id
      JOIN roles r ON r.id = i.role_id
      WHERE i.organisation_id = $1 AND i.status = 'pending' AND i.expires_at > NOW()
      ORDER BY i.created_at DESC
    `;

    const [membersRes, invitesRes] = await Promise.all([
      client.query(membersQuery, [orgId]),
      client.query(invitesQuery, [orgId]),
    ]);

    const membersMap = new Map();
    for (const row of membersRes.rows) {
      if (!membersMap.has(row.membership_id)) {
        membersMap.set(row.membership_id, {
          membershipId: row.membership_id,
          userId: row.user_id,
          fullName: row.full_name,
          email: row.email,
          status: row.membership_status,
          joinedAt: row.joined_at,
          role: {
            id: row.role_id,
            slug: row.role_slug || 'organisation_member',
            name: row.role_name || 'Organisation Member',
          },
          roles: [],
        });
      }
      if (row.role_id) {
        const m = membersMap.get(row.membership_id);
        if (!m.roles.some((r) => r.id === row.role_id)) {
          m.roles.push({
            id: row.role_id,
            slug: row.role_slug,
            name: row.role_name,
          });
        }
      }
    }

    const members = Array.from(membersMap.values());

    const invitations = invitesRes.rows.map((row) => ({
      id: row.id,
      email: row.email,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      invitedByName: row.invited_by_name,
      role: {
        slug: row.role_slug,
        name: row.role_name,
      },
    }));

    return { members, invitations };
  });
}

/**
 * Updates a member's role or status, enforcing final-owner protection and anti-escalation (ORG-007, ORG-008).
 */
export async function updateMember({
  organisationId,
  targetUserId,
  roleSlug,
  status,
  actorId,
  actorRoleSlug,
  ipAddress,
  userAgent,
}) {
  if (targetUserId === actorId) {
    throw new ValidationError('You cannot change your own role or status through member management. Use ownership transfer or leave organisation.');
  }

  // Anti-Escalation Check: Non-owners can never grant the Owner role (fail closed before disclosing member existence)
  if (roleSlug === 'organisation_owner' && actorRoleSlug !== 'organisation_owner') {
    throw new AuthorizationError('Only an organisation Owner can grant the Owner role.', 'FORBIDDEN');
  }

  return withTenantTransaction({ userId: actorId, organisationId }, async (client) => {
    // 1. Fetch target membership and current role
    const targetRes = await client.query(`
      SELECT 
        m.id AS membership_id,
        m.status,
        r.id AS role_id,
        r.slug AS role_slug
      FROM organisation_memberships m
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id AND mr.organisation_id = m.organisation_id
      LEFT JOIN roles r ON r.id = mr.role_id
      WHERE m.organisation_id = $1 AND m.user_id = $2
      FOR UPDATE OF m
    `, [organisationId, targetUserId]);

    if (targetRes.rows.length === 0) {
      throw new NotFoundError('Member not found in this organisation.');
    }

    const currentTarget = targetRes.rows[0];

    // 2. Anti-Escalation Check: Only an Owner can modify another Owner
    if (currentTarget.role_slug === 'organisation_owner' && actorRoleSlug !== 'organisation_owner') {
      throw new AuthorizationError('Only an organisation Owner can modify another Owner.', 'FORBIDDEN');
    }

    // 3. FINAL OWNER PROTECTION (ORG-008):
    // If the target is currently an active Owner, and the proposed action would demote or inactivate them,
    // verify whether another active Owner exists.
    const isTargetOwner = currentTarget.role_slug === 'organisation_owner';
    const isDemoting = roleSlug && roleSlug !== 'organisation_owner';
    const isDeactivating = status && status !== 'active';

    if (isTargetOwner && (isDemoting || isDeactivating)) {
      // Concurrency lock: serialize owner changes for this organisation
      await client.query('SELECT id FROM organisations WHERE id = $1 FOR UPDATE', [organisationId]);

      const ownerCountRes = await client.query(`
        SELECT count(*)::int AS active_owner_count
        FROM membership_roles mr
        JOIN roles r ON r.id = mr.role_id
        JOIN organisation_memberships m ON m.id = mr.membership_id
        WHERE mr.organisation_id = $1 
          AND r.slug = 'organisation_owner' 
          AND m.status = 'active'
      `, [organisationId]);

      const activeOwnerCount = ownerCountRes.rows[0].active_owner_count;
      if (activeOwnerCount <= 1) {
        throw new ConflictError(
          'Cannot suspend, demote, or remove the final active owner of an organisation. Transfer ownership first.',
          'FINAL_OWNER_PROTECTION'
        );
      }
    }

    // 4. Update status if specified
    let newStatus = currentTarget.status;
    if (status && status !== currentTarget.status) {
      await client.query(`
        UPDATE organisation_memberships
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `, [status, currentTarget.membership_id]);
      newStatus = status;
    }

    // 5. Update role if specified
    let newRoleSlug = currentTarget.role_slug;
    if (roleSlug && roleSlug !== currentTarget.role_slug) {
      const newRoleRes = await client.query(`
        SELECT id, slug, name FROM roles
        WHERE slug = $1 AND (organisation_id = $2 OR (organisation_id IS NULL AND is_system = true))
      `, [roleSlug, organisationId]);

      if (newRoleRes.rows.length === 0) {
        throw new ValidationError(`Invalid role: '${roleSlug}'`);
      }

      const newRole = newRoleRes.rows[0];

      // Replace role in membership_roles
      await client.query('DELETE FROM membership_roles WHERE membership_id = $1 AND organisation_id = $2', [
        currentTarget.membership_id,
        organisationId,
      ]);

      await client.query(`
        INSERT INTO membership_roles (organisation_id, membership_id, role_id)
        VALUES ($1, $2, $3)
      `, [organisationId, currentTarget.membership_id, newRole.id]);

      newRoleSlug = newRole.slug;
    }

    // 6. Record audit event
    await recordAuditEvent({
      organisationId,
      actorId,
      action: status === 'removed' ? 'org.member.remove' : 'org.member.update',
      entityType: 'membership',
      entityId: currentTarget.membership_id,
      metadata: {
        targetUserId,
        previousStatus: currentTarget.status,
        newStatus,
        previousRole: currentTarget.role_slug,
        newRole: newRoleSlug,
      },
      ipAddress,
      userAgent,
      client,
    });

    return {
      membershipId: currentTarget.membership_id,
      userId: targetUserId,
      status: newStatus,
      roleSlug: newRoleSlug,
    };
  });
}

/**
 * Transfers primary ownership of an organisation with step-up reauthentication (ORG-008).
 */
export async function transferOwnership({
  organisationId,
  targetUserId,
  password,
  actorUser,
  ipAddress,
  userAgent,
}) {
  const pool = getPool();

  // 1. Step-Up Reauthentication: Caller must verify password
  const userPasswordRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [actorUser.id]);
  if (userPasswordRes.rows.length === 0) {
    throw new AuthenticationError('User not found.');
  }

  const isPasswordValid = await verifyPassword(password, userPasswordRes.rows[0].password_hash);
  if (!isPasswordValid) {
    throw new AuthenticationError('Reauthentication failed. Incorrect password.', 'STEP_UP_FAILED');
  }

  if (targetUserId === actorUser.id) {
    throw new ValidationError('You are already the owner of this organisation.');
  }

  return withTenantTransaction({ userId: actorUser.id, organisationId }, async (client) => {
    // 2. Lock organisation row
    await client.query('SELECT id FROM organisations WHERE id = $1 FOR UPDATE', [organisationId]);

    // 3. Find target user membership and verify active status
    const targetMemberRes = await client.query(`
      SELECT m.id AS membership_id, m.status, r.slug AS role_slug
      FROM organisation_memberships m
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id AND mr.organisation_id = m.organisation_id
      LEFT JOIN roles r ON r.id = mr.role_id
      WHERE m.organisation_id = $1 AND m.user_id = $2
      FOR UPDATE OF m
    `, [organisationId, targetUserId]);

    if (targetMemberRes.rows.length === 0 || targetMemberRes.rows[0].status !== 'active') {
      throw new ValidationError('Target user must be an active member of this organisation to receive ownership.');
    }

    const targetMembership = targetMemberRes.rows[0];

    // 4. Find caller membership
    const callerMemberRes = await client.query(`
      SELECT m.id AS membership_id
      FROM organisation_memberships m
      WHERE m.organisation_id = $1 AND m.user_id = $2
      FOR UPDATE OF m
    `, [organisationId, actorUser.id]);

    const callerMembership = callerMemberRes.rows[0];

    // 5. Look up roles
    const ownerRoleRes = await client.query("SELECT id FROM roles WHERE slug = 'organisation_owner' AND organisation_id IS NULL");
    const adminRoleRes = await client.query("SELECT id FROM roles WHERE slug = 'organisation_admin' AND organisation_id IS NULL");

    const ownerRoleId = ownerRoleRes.rows[0].id;
    const adminRoleId = adminRoleRes.rows[0].id;

    // 6. Promote target user to Owner
    await client.query('DELETE FROM membership_roles WHERE membership_id = $1 AND organisation_id = $2', [
      targetMembership.membership_id,
      organisationId,
    ]);
    await client.query(`
      INSERT INTO membership_roles (organisation_id, membership_id, role_id)
      VALUES ($1, $2, $3)
    `, [organisationId, targetMembership.membership_id, ownerRoleId]);

    // 7. Demote caller to Admin
    await client.query('DELETE FROM membership_roles WHERE membership_id = $1 AND organisation_id = $2', [
      callerMembership.membership_id,
      organisationId,
    ]);
    await client.query(`
      INSERT INTO membership_roles (organisation_id, membership_id, role_id)
      VALUES ($1, $2, $3)
    `, [organisationId, callerMembership.membership_id, adminRoleId]);

    // 8. Record audit log (AUD-001)
    await recordAuditEvent({
      organisationId,
      actorId: actorUser.id,
      action: 'org.owner.transfer',
      entityType: 'organisation',
      entityId: organisationId,
      metadata: {
        previousOwnerId: actorUser.id,
        newOwnerId: targetUserId,
      },
      ipAddress,
      userAgent,
      client,
    });

    return {
      success: true,
      message: 'Ownership transferred successfully. Your role is now Organisation Admin.',
    };
  });
}

/**
 * Member leaves the organisation, enforcing the final-owner invariant (ORG-010).
 */
export async function leaveOrganisation(organisationId, userId, { ipAddress, userAgent }) {
  return withTenantTransaction({ userId, organisationId }, async (client) => {
    // Fetch user's membership and role
    const memberRes = await client.query(`
      SELECT m.id AS membership_id, m.status, r.slug AS role_slug
      FROM organisation_memberships m
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id AND mr.organisation_id = m.organisation_id
      LEFT JOIN roles r ON r.id = mr.role_id
      WHERE m.organisation_id = $1 AND m.user_id = $2 AND m.status = 'active'
      FOR UPDATE OF m
    `, [organisationId, userId]);

    if (memberRes.rows.length === 0) {
      throw new NotFoundError('Active membership not found.');
    }

    const member = memberRes.rows[0];

    // Final Owner Protection (ORG-010): If user is an Owner, check if they are the sole active owner
    if (member.role_slug === 'organisation_owner') {
      // Concurrency lock: serialize owner changes for this organisation
      await client.query('SELECT id FROM organisations WHERE id = $1 FOR UPDATE', [organisationId]);

      const ownerCountRes = await client.query(`
        SELECT count(*)::int AS active_owner_count
        FROM membership_roles mr
        JOIN roles r ON r.id = mr.role_id
        JOIN organisation_memberships m ON m.id = mr.membership_id
        WHERE mr.organisation_id = $1 
          AND r.slug = 'organisation_owner' 
          AND m.status = 'active'
      `, [organisationId]);

      if (ownerCountRes.rows[0].active_owner_count <= 1) {
        throw new ConflictError(
          'The final active owner cannot leave the organisation. Please transfer ownership before leaving.',
          'FINAL_OWNER_CANNOT_LEAVE'
        );
      }
    }

    // Set membership status to 'removed'
    await client.query(`
      UPDATE organisation_memberships
      SET status = 'removed', updated_at = NOW()
      WHERE id = $1
    `, [member.membership_id]);

    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: 'org.member.leave',
      entityType: 'membership',
      entityId: member.membership_id,
      metadata: { userId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true, message: 'You have left the organisation.' };
  });
}

/**
 * Creates an invitation for an email address with 7-day expiration (ORG-005).
 */
export async function createInvitation({
  organisationId,
  email,
  roleSlug = 'organisation_member',
  actorUser,
  ipAddress,
  userAgent,
}) {
  const normalizedEmail = email.toLowerCase().trim();

  return withTenantTransaction({ userId: actorUser.id, organisationId }, async (client) => {
    // 1. Verify target is not already an active member
    const existingMemberRes = await client.query(`
      SELECT m.id
      FROM organisation_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.organisation_id = $1 AND LOWER(u.email) = $2 AND m.status = 'active'
    `, [organisationId, normalizedEmail]);

    if (existingMemberRes.rows.length > 0) {
      throw new ConflictError('A user with this email is already an active member of this organisation.', 'ALREADY_MEMBER');
    }

    // 2. Validate role
    const roleRes = await client.query(`
      SELECT id, slug, name FROM roles
      WHERE slug = $1 AND (organisation_id = $2 OR (organisation_id IS NULL AND is_system = true))
    `, [roleSlug, organisationId]);

    if (roleRes.rows.length === 0) {
      throw new ValidationError(`Invalid role: '${roleSlug}'`);
    }

    const role = roleRes.rows[0];

    // 3. Revoke any prior pending invitations for this email in this organisation
    await client.query(`
      UPDATE invitations
      SET status = 'revoked'
      WHERE organisation_id = $1 AND LOWER(email) = $2 AND status = 'pending'
    `, [organisationId, normalizedEmail]);

    // 4. Generate unguessable token and derive SHA-256 hash (256-bit entropy)
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const insertRes = await client.query(`
      INSERT INTO invitations (organisation_id, invited_by_id, email, token_hash, role_id, status, expires_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      RETURNING id, organisation_id, email, status, expires_at, created_at
    `, [organisationId, actorUser.id, normalizedEmail, tokenHash, role.id, expiresAt]);

    const invitation = insertRes.rows[0];

    // 5. Query organisation name for email
    const orgRes = await client.query('SELECT name FROM organisations WHERE id = $1', [organisationId]);
    const orgName = orgRes.rows[0]?.name || 'ManageX Workspace';

    // 6. Deliver invitation email via shared email service (AUTH-008)
    const inviteUrl = `${env.FRONTEND_ORIGIN}/invitations/${rawToken}/accept`;
    await sendEmail({
      to: normalizedEmail,
      subject: `You have been invited to join ${orgName} on ManageX`,
      text: `Hello,\n\n${actorUser.fullName || 'A team member'} has invited you to join ${orgName} as a ${role.name}.\n\nAccept your invitation by clicking the link below:\n${inviteUrl}\n\nThis invitation expires in 7 days.`,
      html: `<p>Hello,</p><p><strong>${actorUser.fullName || 'A team member'}</strong> has invited you to join <strong>${orgName}</strong> as a <strong>${role.name}</strong>.</p><p><a href="${inviteUrl}">Accept Invitation</a></p><p>This invitation expires in 7 days.</p>`,
    });

    // 7. Audit log (AUD-001)
    await recordAuditEvent({
      organisationId,
      actorId: actorUser.id,
      action: 'org.invitation.create',
      entityType: 'invitation',
      entityId: invitation.id,
      metadata: { email: normalizedEmail, roleSlug: role.slug },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: { slug: role.slug, name: role.name },
      expiresAt: invitation.expires_at,
      rawToken, // Provided for testing and development preview
    };
  });
}

/**
 * Inspects an invitation token details (public safe view).
 */
export async function getInvitationByToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new ValidationError('Invitation token is required.');
  }

  const tokenHash = hashToken(rawToken);

  return withSystemTransaction(async (client) => {
    const query = `
      SELECT 
        i.id,
        i.email,
        i.status,
        i.expires_at,
        o.id AS organisation_id,
        o.name AS organisation_name,
        o.slug AS organisation_slug,
        u.full_name AS invited_by_name,
        r.slug AS role_slug,
        r.name AS role_name
      FROM invitations i
      JOIN organisations o ON o.id = i.organisation_id
      JOIN users u ON u.id = i.invited_by_id
      JOIN roles r ON r.id = i.role_id
      WHERE i.token_hash = $1
    `;

    const res = await client.query(query, [tokenHash]);

    if (res.rows.length === 0) {
      throw new NotFoundError('Invitation not found or invalid.', 'INVITATION_NOT_FOUND');
    }

    const row = res.rows[0];
    const isExpired = new Date(row.expires_at) <= new Date();

    return {
      id: row.id,
      email: row.email,
      status: isExpired && row.status === 'pending' ? 'expired' : row.status,
      expiresAt: row.expires_at,
      organisation: {
        id: row.organisation_id,
        name: row.organisation_name,
        slug: row.organisation_slug,
      },
      invitedByName: row.invited_by_name,
      role: {
        slug: row.role_slug,
        name: row.role_name,
      },
    };
  });
}

/**
 * Accepts an invitation, ensuring email match and single-use atomic membership creation (ORG-005, ORG-006).
 */
export async function acceptInvitation({ rawToken, currentUser, ipAddress, userAgent }) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new ValidationError('Invitation token is required.');
  }

  const tokenHash = hashToken(rawToken);

  return withSystemTransaction(async (client) => {
    // 1. Lock invitation row
    const inviteRes = await client.query(`
      SELECT 
        i.id,
        i.organisation_id,
        i.email,
        i.role_id,
        i.status,
        i.expires_at,
        o.slug AS organisation_slug
      FROM invitations i
      JOIN organisations o ON o.id = i.organisation_id
      WHERE i.token_hash = $1
      FOR UPDATE OF i
    `, [tokenHash]);

    if (inviteRes.rows.length === 0) {
      throw new NotFoundError('Invitation not found or invalid.', 'INVITATION_NOT_FOUND');
    }

    const invitation = inviteRes.rows[0];

    // 2. Check status and single-use
    if (invitation.status === 'accepted') {
      throw new ConflictError('This invitation has already been accepted.', 'INVITATION_ALREADY_USED');
    }
    if (invitation.status === 'revoked') {
      throw new AuthorizationError('This invitation has been revoked.', 'INVITATION_REVOKED');
    }
    if (invitation.status !== 'pending' || new Date(invitation.expires_at) <= new Date()) {
      await client.query("UPDATE invitations SET status = 'expired' WHERE id = $1", [invitation.id]);
      throw new ValidationError('This invitation has expired. Please request a new invitation.', [
        { field: 'token', message: 'Invitation has expired.' },
      ]);
    }

    // 3. Email Identity Match (ORG-005): Current user's email MUST match invitation email
    const normalizedUserEmail = currentUser.email.toLowerCase().trim();
    const normalizedInviteEmail = invitation.email.toLowerCase().trim();

    if (normalizedUserEmail !== normalizedInviteEmail) {
      throw new AuthorizationError(
        `This invitation was issued to ${invitation.email}. You are currently logged in as ${currentUser.email}.`,
        'EMAIL_MISMATCH'
      );
    }

    // 4. Set transaction tenant context for membership creation and audit log
    await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [invitation.organisation_id]);
    await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [currentUser.id]);

    // 5. Mark invitation as accepted
    await client.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [invitation.id]);

    // 5. Upsert membership (ORG-006: safe under retry or re-onboarding)
    const existingMembershipRes = await client.query(`
      SELECT id, status FROM organisation_memberships
      WHERE organisation_id = $1 AND user_id = $2
      FOR UPDATE
    `, [invitation.organisation_id, currentUser.id]);

    let membershipId;

    if (existingMembershipRes.rows.length > 0) {
      const existing = existingMembershipRes.rows[0];
      await client.query(`
        UPDATE organisation_memberships
        SET status = 'active', updated_at = NOW()
        WHERE id = $1
      `, [existing.id]);
      membershipId = existing.id;
    } else {
      const newMemberRes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (organisation_id, user_id) DO UPDATE
        SET status = 'active', updated_at = NOW()
        RETURNING id
      `, [invitation.organisation_id, currentUser.id]);
      membershipId = newMemberRes.rows[0].id;
    }

    // 6. Assign invited role in membership_roles
    await client.query('DELETE FROM membership_roles WHERE membership_id = $1 AND organisation_id = $2', [
      membershipId,
      invitation.organisation_id,
    ]);

    await client.query(`
      INSERT INTO membership_roles (organisation_id, membership_id, role_id)
      VALUES ($1, $2, $3)
    `, [invitation.organisation_id, membershipId, invitation.role_id]);

    // 7. Audit log (AUD-001)
    await recordAuditEvent({
      organisationId: invitation.organisation_id,
      actorId: currentUser.id,
      action: 'org.invitation.accept',
      entityType: 'membership',
      entityId: membershipId,
      metadata: { invitationId: invitation.id, email: normalizedUserEmail },
      ipAddress,
      userAgent,
      client,
    });

    return {
      success: true,
      organisationId: invitation.organisation_id,
      organisationSlug: invitation.organisation_slug,
    };
  });
}

/**
 * Revokes a pending invitation (ORG-005).
 */
export async function revokeInvitation(organisationId, invitationId, actorId, { ipAddress, userAgent }) {
  return withTenantTransaction({ userId: actorId, organisationId }, async (client) => {
    const res = await client.query(`
      UPDATE invitations
      SET status = 'revoked'
      WHERE id = $1 AND organisation_id = $2 AND status = 'pending'
      RETURNING id, email
    `, [invitationId, organisationId]);

    if (res.rows.length === 0) {
      throw new NotFoundError('Pending invitation not found or already processed.');
    }

    await recordAuditEvent({
      organisationId,
      actorId,
      action: 'org.invitation.revoke',
      entityType: 'invitation',
      entityId: invitationId,
      metadata: { email: res.rows[0].email },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true, message: 'Invitation revoked.' };
  });
}
