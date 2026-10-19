/**
 * ManageX Hackathon Teams Service
 * Strictly adheres to PRD Section 7.3 (EVT-006) and ADR-007.
 */

import crypto from 'crypto';
import { withTenantTransaction } from '../database/transaction.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../common/errors.js';
import { recordAuditEvent } from '../audit/auditService.js';
import { sendEmail } from '../email/emailService.js';

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'team';
}

function formatTeamRow(row, members = []) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    eventId: row.event_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdById: row.created_by_id,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    memberCount: Number(row.member_count || members.length || 0),
    members,
    owner: row.owner_email
      ? {
          id: row.created_by_id,
          email: row.owner_email,
          fullName: row.owner_full_name,
        }
      : undefined,
  };
}

/**
 * Creates a hackathon team for an event (EVT-006).
 */
export async function createEventTeam(
  organisationId,
  eventId,
  userId,
  { name, description },
  { ipAddress, userAgent } = {}
) {
  if (!name || !name.trim()) {
    throw new ValidationError('Team name is required.');
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 120) {
    throw new ValidationError('Team name cannot exceed 120 characters.');
  }

  const baseSlug = slugify(trimmedName);
  const slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;

  return withTenantTransaction({ organisationId, userId }, async (client) => {
    // 1. Verify Event exists and is of type 'hackathon'
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];
    if (event.event_type !== 'hackathon') {
      throw new ValidationError(
        'Teams are only available for hackathon events.',
        'TEAMS_NOT_SUPPORTED'
      );
    }

    if (['completed', 'cancelled', 'archived'].includes(event.status)) {
      throw new ConflictError(
        `Cannot create teams because event is ${event.status}.`,
        'EVENT_LOCKED'
      );
    }

    // 2. Caller must be an active registered participant for this event (EVT-006)
    const regRes = await client.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 AND status = 'registered'`,
      [eventId, userId]
    );

    if (regRes.rows.length === 0) {
      throw new AuthorizationError(
        'You must be a registered participant of this event to create a team.',
        'REGISTRATION_REQUIRED'
      );
    }

    // 3. User cannot already belong to an active team in this event (EVT-006)
    const existingMemberRes = await client.query(
      `SELECT * FROM event_team_members WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );

    if (existingMemberRes.rows.length > 0) {
      throw new ConflictError(
        'You are already a member of a team for this event. You must leave your current team before creating a new one.',
        'ALREADY_IN_TEAM'
      );
    }

    // 4. Team name uniqueness in event
    const nameCheck = await client.query(
      `SELECT id FROM event_teams WHERE event_id = $1 AND LOWER(name) = LOWER($2)`,
      [eventId, trimmedName]
    );

    if (nameCheck.rows.length > 0) {
      throw new ConflictError(
        'A team with this name already exists in this event.',
        'TEAM_NAME_EXISTS'
      );
    }

    // 5. Create team record
    const teamInsertRes = await client.query(
      `
      INSERT INTO event_teams (
        organisation_id,
        event_id,
        name,
        slug,
        description,
        created_by_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [organisationId, eventId, trimmedName, slug, description ? description.trim() : null, userId]
    );

    const team = teamInsertRes.rows[0];

    // 6. Insert creator as team owner member
    const memberInsertRes = await client.query(
      `
      INSERT INTO event_team_members (
        organisation_id,
        event_id,
        team_id,
        user_id,
        is_owner
      )
      VALUES ($1, $2, $3, $4, true)
      RETURNING *
    `,
      [organisationId, eventId, team.id, userId]
    );

    const ownerMember = memberInsertRes.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: 'event.team.created',
      entityType: 'event_team',
      entityId: team.id,
      metadata: {
        eventId,
        teamName: team.name,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatTeamRow(team, [
      {
        id: ownerMember.id,
        userId,
        isOwner: true,
        joinedAt: ownerMember.joined_at.toISOString(),
      },
    ]);
  });
}

/**
 * Lists teams for a hackathon event with pagination and member counts.
 */
export async function listEventTeams(
  organisationId,
  eventId,
  { search, page = 1, limit = 20 } = {}
) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const boundedPage = Math.max(Number(page) || 1, 1);
  const offset = (boundedPage - 1) * boundedLimit;

  return withTenantTransaction({ organisationId }, async (client) => {
    const conditions = ['t.organisation_id = $1', 't.event_id = $2'];
    const params = [organisationId, eventId];
    let paramIndex = 3;

    if (search && search.trim()) {
      conditions.push(`(t.name ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*)::int AS total FROM event_teams t WHERE ${whereClause}`;
    const countRes = await client.query(countSql, params);
    const totalRecords = countRes.rows[0].total;
    const totalPages = Math.ceil(totalRecords / boundedLimit) || 1;

    const listSql = `
      SELECT 
        t.*,
        u.email AS owner_email,
        u.full_name AS owner_full_name,
        COUNT(m.id)::int AS member_count
      FROM event_teams t
      JOIN users u ON u.id = t.created_by_id
      LEFT JOIN event_team_members m ON m.team_id = t.id
      WHERE ${whereClause}
      GROUP BY t.id, u.email, u.full_name
      ORDER BY t.created_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(boundedLimit, offset);

    const listRes = await client.query(listSql, params);
    const teams = listRes.rows.map((row) => formatTeamRow(row));

    return {
      teams,
      pagination: {
        page: boundedPage,
        limit: boundedLimit,
        total: totalRecords,
        totalPages,
      },
    };
  });
}

/**
 * Retrieves details for a specific hackathon team, including members and pending invites.
 */
export async function getEventTeamById(organisationId, eventId, teamId) {
  return withTenantTransaction({ organisationId }, async (client) => {
    const teamRes = await client.query(
      `
      SELECT 
        t.*,
        u.email AS owner_email,
        u.full_name AS owner_full_name,
        COUNT(m.id)::int AS member_count
      FROM event_teams t
      JOIN users u ON u.id = t.created_by_id
      LEFT JOIN event_team_members m ON m.team_id = t.id
      WHERE t.id = $1 AND t.event_id = $2 AND t.organisation_id = $3
      GROUP BY t.id, u.email, u.full_name
    `,
      [teamId, eventId, organisationId]
    );

    if (teamRes.rows.length === 0) {
      throw new NotFoundError('Team not found.', 'TEAM_NOT_FOUND');
    }

    const teamRow = teamRes.rows[0];

    // Fetch members with user info
    const membersRes = await client.query(
      `
      SELECT 
        m.id,
        m.user_id,
        m.is_owner,
        m.joined_at,
        u.email,
        u.full_name
      FROM event_team_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.team_id = $1
      ORDER BY m.is_owner DESC, m.joined_at ASC
    `,
      [teamId]
    );

    const members = membersRes.rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      isOwner: m.is_owner,
      joinedAt: m.joined_at.toISOString(),
      user: {
        id: m.user_id,
        email: m.email,
        fullName: m.full_name,
      },
    }));

    return formatTeamRow(teamRow, members);
  });
}

/**
 * Invites a registered participant to join a hackathon team (EVT-006, ADR-007).
 * Invitations expire after 7 days and are single-use.
 */
export async function inviteTeamMember(
  organisationId,
  eventId,
  teamId,
  actorUserId,
  { email },
  { ipAddress, userAgent } = {}
) {
  if (!email || !email.trim()) {
    throw new ValidationError('Invitee email is required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Lock team row and check caller is owner or has event participant management permission
    const teamRes = await client.query(
      `SELECT * FROM event_teams WHERE id = $1 AND event_id = $2 AND organisation_id = $3 FOR UPDATE`,
      [teamId, eventId, organisationId]
    );

    if (teamRes.rows.length === 0) {
      throw new NotFoundError('Team not found.', 'TEAM_NOT_FOUND');
    }

    const team = teamRes.rows[0];

    // Check caller is owner
    const callerMemberRes = await client.query(
      `SELECT * FROM event_team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, actorUserId]
    );

    const isTeamOwner = callerMemberRes.rows.length > 0 && callerMemberRes.rows[0].is_owner;
    if (!isTeamOwner) {
      throw new AuthorizationError(
        'Only the team owner can send invitations to join this team.',
        'TEAM_OWNER_REQUIRED'
      );
    }

    // 2. Fetch event to verify team size limits
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1`,
      [eventId]
    );
    const event = eventRes.rows[0];
    const teamSizeMax = event.team_size_max || 10;

    // Check current team size
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM event_team_members WHERE team_id = $1`,
      [teamId]
    );
    const currentMemberCount = countRes.rows[0].count;

    if (currentMemberCount >= teamSizeMax) {
      throw new ConflictError(
        `Team has reached its maximum configured size of ${teamSizeMax} members.`,
        'TEAM_MAX_SIZE_REACHED'
      );
    }

    // 3. Find target user by email
    const userRes = await client.query(
      `SELECT id, email, status FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (userRes.rows.length === 0) {
      throw new NotFoundError(
        'No registered user found with that email. The invitee must create a ManageX account and register for the event first.',
        'USER_NOT_FOUND'
      );
    }

    const targetUser = userRes.rows[0];

    // 4. Target user must be a registered participant of the event (EVT-006)
    const regRes = await client.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 AND status = 'registered'`,
      [eventId, targetUser.id]
    );

    if (regRes.rows.length === 0) {
      throw new ConflictError(
        'The invitee is not registered for this event. They must register before joining a team.',
        'PARTICIPANT_NOT_REGISTERED'
      );
    }

    // 5. Target user cannot already be in a team for this event
    const memberCheck = await client.query(
      `SELECT team_id FROM event_team_members WHERE event_id = $1 AND user_id = $2`,
      [eventId, targetUser.id]
    );

    if (memberCheck.rows.length > 0) {
      throw new ConflictError(
        'This participant is already a member of a team in this event.',
        'USER_ALREADY_IN_TEAM'
      );
    }

    // 6. Check for existing pending invitation
    const pendingInviteRes = await client.query(
      `
      SELECT id FROM event_team_invitations
      WHERE team_id = $1 AND LOWER(invited_email) = $2 AND status = 'pending' AND expires_at > NOW()
    `,
      [teamId, normalizedEmail]
    );

    if (pendingInviteRes.rows.length > 0) {
      throw new ConflictError(
        'A pending invitation has already been sent to this email address.',
        'INVITATION_ALREADY_PENDING'
      );
    }

    // 7. Generate 32-byte secure token (ADR-007)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const insertInviteRes = await client.query(
      `
      INSERT INTO event_team_invitations (
        organisation_id,
        event_id,
        team_id,
        invited_email,
        invited_user_id,
        token_hash,
        status,
        invited_by_id,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
      RETURNING *
    `,
      [
        organisationId,
        eventId,
        teamId,
        normalizedEmail,
        targetUser.id,
        tokenHash,
        actorUserId,
        expiresAt.toISOString(),
      ]
    );

    const invitation = insertInviteRes.rows[0];

    // 8. Dispatch notification email
    await sendEmail({
      to: normalizedEmail,
      subject: `You have been invited to join team "${team.name}" on ManageX`,
      text: `Hello,\n\nYou have been invited to join team "${team.name}" for ${event.title}.\n\nInvitation Token: ${rawToken}\nThis invitation expires in 7 days.\n\nManageX Team`,
    });

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.team.member_invited',
      entityType: 'event_team_invitation',
      entityId: invitation.id,
      metadata: {
        eventId,
        teamId,
        invitedEmail: normalizedEmail,
      },
      ipAddress,
      userAgent,
      client,
    });

    return {
      invitationId: invitation.id,
      email: normalizedEmail,
      expiresAt: invitation.expires_at.toISOString(),
      token: rawToken, // returned for test/dev inspection
    };
  });
}

/**
 * Accepts a team invitation token (EVT-006, ADR-007).
 */
export async function acceptTeamInvitation(
  organisationId,
  eventId,
  token,
  userId,
  { ipAddress, userAgent } = {}
) {
  if (!token) {
    throw new ValidationError('Invitation token is required.');
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

  return withTenantTransaction({ organisationId, userId }, async (client) => {
    // 1. Fetch user to verify email
    const userRes = await client.query(`SELECT email FROM users WHERE id = $1`, [userId]);
    if (userRes.rows.length === 0) {
      throw new NotFoundError('User not found.');
    }
    const userEmail = userRes.rows[0].email.toLowerCase();

    // 2. Fetch invitation by token_hash
    const inviteRes = await client.query(
      `
      SELECT * FROM event_team_invitations
      WHERE token_hash = $1 AND event_id = $2 AND organisation_id = $3
      FOR UPDATE
    `,
      [tokenHash, eventId, organisationId]
    );

    if (inviteRes.rows.length === 0) {
      throw new NotFoundError('Invitation token not found or invalid.', 'INVITATION_NOT_FOUND');
    }

    const invitation = inviteRes.rows[0];

    if (invitation.status !== 'pending') {
      throw new ConflictError(
        `This invitation has already been ${invitation.status}.`,
        'INVITATION_ALREADY_USED'
      );
    }

    if (new Date() > new Date(invitation.expires_at)) {
      await client.query(
        `UPDATE event_team_invitations SET status = 'expired' WHERE id = $1`,
        [invitation.id]
      );
      throw new ConflictError('This invitation has expired.', 'INVITATION_EXPIRED');
    }

    // Verify email match
    if (invitation.invited_email.toLowerCase() !== userEmail) {
      throw new AuthorizationError(
        'This invitation was sent to a different email address.',
        'EMAIL_MISMATCH'
      );
    }

    // 3. User must be a registered participant in the event
    const regRes = await client.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 AND status = 'registered'`,
      [eventId, userId]
    );

    if (regRes.rows.length === 0) {
      throw new AuthorizationError(
        'You must register for this event before joining a team.',
        'REGISTRATION_REQUIRED'
      );
    }

    // 4. User cannot already belong to another team
    const memberCheck = await client.query(
      `SELECT team_id FROM event_team_members WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );

    if (memberCheck.rows.length > 0) {
      throw new ConflictError(
        'You are already a member of a team in this event.',
        'ALREADY_IN_TEAM'
      );
    }

    // 5. Check team size limit (serialize concurrent joins under row lock)
    await client.query(`SELECT id FROM event_teams WHERE id = $1 FOR UPDATE`, [invitation.team_id]);

    const eventRes = await client.query(`SELECT team_size_max FROM events WHERE id = $1`, [eventId]);
    const teamSizeMax = eventRes.rows[0]?.team_size_max || 10;

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM event_team_members WHERE team_id = $1`,
      [invitation.team_id]
    );

    if (countRes.rows[0].count >= teamSizeMax) {
      throw new ConflictError(
        `This team has reached its maximum size of ${teamSizeMax} members.`,
        'TEAM_MAX_SIZE_REACHED'
      );
    }

    // 6. Update invitation status to accepted
    await client.query(
      `UPDATE event_team_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
      [invitation.id]
    );

    // 7. Insert member
    const memberInsertRes = await client.query(
      `
      INSERT INTO event_team_members (
        organisation_id,
        event_id,
        team_id,
        user_id,
        is_owner
      )
      VALUES ($1, $2, $3, $4, false)
      RETURNING *
    `,
      [organisationId, eventId, invitation.team_id, userId]
    );

    const member = memberInsertRes.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: 'event.team.member_joined',
      entityType: 'event_team_member',
      entityId: member.id,
      metadata: {
        eventId,
        teamId: invitation.team_id,
      },
      ipAddress,
      userAgent,
      client,
    });

    return {
      message: 'Successfully joined team!',
      teamId: invitation.team_id,
      memberId: member.id,
    };
  });
}

/**
 * Leaves a hackathon team (EVT-006).
 */
export async function leaveEventTeam(
  organisationId,
  eventId,
  teamId,
  userId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId }, async (client) => {
    // Row-lock the team to serialize concurrent member leave/remove mutations
    await client.query(`SELECT id FROM event_teams WHERE id = $1 FOR UPDATE`, [teamId]);

    const memberRes = await client.query(
      `SELECT * FROM event_team_members WHERE team_id = $1 AND user_id = $2 AND organisation_id = $3`,
      [teamId, userId, organisationId]
    );

    if (memberRes.rows.length === 0) {
      throw new NotFoundError('You are not a member of this team.', 'MEMBER_NOT_FOUND');
    }

    const membership = memberRes.rows[0];

    // If caller is owner
    if (membership.is_owner) {
      const allMembersRes = await client.query(
        `SELECT * FROM event_team_members WHERE team_id = $1 ORDER BY joined_at ASC FOR UPDATE`,
        [teamId]
      );

      // If sole member, delete team
      if (allMembersRes.rows.length <= 1) {
        await client.query(`DELETE FROM event_teams WHERE id = $1`, [teamId]);
      } else {
        // Promote next oldest member to owner
        const nextOwner = allMembersRes.rows.find((m) => m.user_id !== userId);
        if (nextOwner) {
          await client.query(
            `UPDATE event_team_members SET is_owner = true WHERE id = $1`,
            [nextOwner.id]
          );
          await client.query(
            `UPDATE event_teams SET created_by_id = $1 WHERE id = $2`,
            [nextOwner.user_id, teamId]
          );
        }
        await client.query(`DELETE FROM event_team_members WHERE id = $1`, [membership.id]);
      }
    } else {
      await client.query(`DELETE FROM event_team_members WHERE id = $1`, [membership.id]);
    }

    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: 'event.team.member_left',
      entityType: 'event_team',
      entityId: teamId,
      metadata: { eventId, teamId, userId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

/**
 * Removes a member from a team (team owner or event manager) (EVT-006).
 */
export async function removeTeamMember(
  organisationId,
  eventId,
  teamId,
  actorUserId,
  targetUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // Row-lock the team to serialize concurrent mutations
    await client.query(`SELECT id FROM event_teams WHERE id = $1 FOR UPDATE`, [teamId]);

    // Check target is member
    const targetMemberRes = await client.query(
      `SELECT * FROM event_team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, targetUserId]
    );

    if (targetMemberRes.rows.length === 0) {
      throw new NotFoundError('Target user is not a member of this team.', 'MEMBER_NOT_FOUND');
    }

    const targetMembership = targetMemberRes.rows[0];

    // Check caller is owner
    const callerMemberRes = await client.query(
      `SELECT * FROM event_team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, actorUserId]
    );

    const isCallerOwner = callerMemberRes.rows.length > 0 && callerMemberRes.rows[0].is_owner;
    if (!isCallerOwner) {
      throw new AuthorizationError('Only the team owner can remove team members.', 'TEAM_OWNER_REQUIRED');
    }

    if (targetMembership.is_owner) {
      throw new ConflictError('Cannot remove the team owner. Transfer ownership or leave the team.', 'CANNOT_REMOVE_OWNER');
    }

    await client.query(`DELETE FROM event_team_members WHERE id = $1`, [targetMembership.id]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.team.member_removed',
      entityType: 'event_team_member',
      entityId: targetMembership.id,
      metadata: { eventId, teamId, removedUserId: targetUserId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}
