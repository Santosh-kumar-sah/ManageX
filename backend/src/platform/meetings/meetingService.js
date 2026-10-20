/**
 * ManageX Meetings Core Service (Phase 7A)
 * Strictly adheres to PRD Section 8.1 (MTG-001, MTG-002, MTG-003, MTG-004), docs/security.md, and docs/architecture.md.
 */

import { withTenantTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../audit/auditService.js';
import {
  MEETING_STATUSES,
  MEETING_VISIBILITIES,
  MEETING_LOCATION_TYPES,
  MEETING_ATTENDEE_ROLES,
  MEETING_RSVP_STATUSES,
  isValidMeetingTransition,
  isValidIanaTimeZone,
  ACTION_ITEM_STATUSES,
  ACTION_ITEM_PRIORITIES,
  isValidActionItemTransition,
} from './meetingLifecycle.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError,
} from '../common/errors.js';
import { sendEmail } from '../email/emailService.js';
import { logger } from '../middleware/logger.js';

function hasPermission(permissions, key) {
  if (!permissions) return false;
  if (permissions instanceof Set) return permissions.has(key);
  if (Array.isArray(permissions)) return permissions.includes(key);
  return false;
}

function formatMeetingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    title: row.title,
    description: row.description,
    startAt: row.start_at ? row.start_at.toISOString() : null,
    endAt: row.end_at ? row.end_at.toISOString() : null,
    timezone: row.timezone,
    locationType: row.location_type,
    location: row.location,
    virtualUrl: row.virtual_url,
    visibility: row.visibility,
    status: row.status,
    organiserId: row.organiser_id,
    organiserName: row.organiser_name || null,
    organiserEmail: row.organiser_email || null,
    createdById: row.created_by_id,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    attendeeCount: row.attendee_count !== undefined ? Number(row.attendee_count) : undefined,
    agendaCount: row.agenda_count !== undefined ? Number(row.agenda_count) : undefined,
  };
}

function formatNoteRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    meetingId: row.meeting_id,
    content: row.content,
    createdById: row.created_by_id,
    updatedById: row.updated_by_id,
    authorName: row.author_name || null,
    authorEmail: row.author_email || null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

function formatActionItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    meetingId: row.meeting_id,
    title: row.title,
    description: row.description || null,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || null,
    assigneeEmail: row.assignee_email || null,
    dueDate: row.due_date ? (row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date).split('T')[0]) : null,
    priority: row.priority,
    status: row.status,
    agendaItemId: row.agenda_item_id || null,
    agendaItemTitle: row.agenda_item_title || null,
    createdById: row.created_by_id,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

// -----------------------------------------------------------------------------
// 1. Meeting Lifecycle & CRUD (MTG-001, MTG-002)
// -----------------------------------------------------------------------------

export async function createMeeting(
  organisationId,
  data,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const {
    title,
    description,
    startAt,
    endAt,
    timezone = 'UTC',
    locationType = 'in_person',
    location,
    virtualUrl,
    visibility = 'organisation',
    organiserId = actorUserId,
  } = data;

  const startDate = new Date(startAt);
  const endDate = new Date(endAt);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new ValidationError('Valid ISO startAt and endAt timestamps are required.');
  }

  if (endDate <= startDate) {
    throw new ValidationError('Meeting end time must be after the start time.');
  }

  if (!isValidIanaTimeZone(timezone)) {
    throw new ValidationError(`Invalid IANA time-zone identifier: "${timezone}".`);
  }

  if (!MEETING_VISIBILITIES.includes(visibility)) {
    throw new ValidationError(`Invalid visibility "${visibility}". Allowed: ${MEETING_VISIBILITIES.join(', ')}.`);
  }

  if (!MEETING_LOCATION_TYPES.includes(locationType)) {
    throw new ValidationError(`Invalid locationType "${locationType}". Allowed: ${MEETING_LOCATION_TYPES.join(', ')}.`);
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify organiser exists and is an active member of this organisation
    const memRes = await client.query(
      `SELECT m.id, m.status, u.full_name, u.email
       FROM organisation_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organisation_id = $1 AND m.user_id = $2 AND m.status = 'active'`,
      [organisationId, organiserId]
    );

    if (memRes.rows.length === 0) {
      throw new ValidationError('Organiser must be an active member of this organisation.');
    }

    // 2. Insert meeting
    const insertSql = `
      INSERT INTO meetings (
        organisation_id, title, description, start_at, end_at, timezone,
        location_type, location, virtual_url, visibility, status,
        organiser_id, created_by_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, 'scheduled',
        $11, $12
      ) RETURNING *
    `;

    const res = await client.query(insertSql, [
      organisationId,
      title.trim(),
      description ? description.trim() : null,
      startDate.toISOString(),
      endDate.toISOString(),
      timezone.trim(),
      locationType,
      location ? location.trim() : null,
      virtualUrl ? virtualUrl.trim() : null,
      visibility,
      organiserId,
      actorUserId,
    ]);

    const createdMeeting = res.rows[0];

    // 3. Automatically add organiser as accepted attendee (MTG-003)
    await client.query(
      `INSERT INTO meeting_attendees (
        organisation_id, meeting_id, user_id, role, rsvp_status, responded_at
      ) VALUES ($1, $2, $3, 'organiser', 'accepted', NOW())`,
      [organisationId, createdMeeting.id, organiserId]
    );

    // 4. Audit logging
    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.created',
      entityType: 'meeting',
      entityId: createdMeeting.id,
      metadata: {
        title: createdMeeting.title,
        startAt: createdMeeting.start_at.toISOString(),
        visibility: createdMeeting.visibility,
        locationType: createdMeeting.location_type,
      },
      ipAddress,
      userAgent,
      client,
    });

    createdMeeting.organiser_name = memRes.rows[0].full_name;
    createdMeeting.organiser_email = memRes.rows[0].email;
    createdMeeting.attendee_count = 1;
    createdMeeting.agenda_count = 0;

    return formatMeetingRow(createdMeeting);
  });
}

export async function getMeetingById(organisationId, meetingId, viewerUserId, viewerPermissions = []) {
  return withTenantTransaction({ organisationId, userId: viewerUserId }, async (client) => {
    const query = `
      SELECT 
        m.*,
        u.full_name AS organiser_name,
        u.email AS organiser_email,
        (SELECT COUNT(*)::int FROM meeting_attendees a WHERE a.meeting_id = m.id) AS attendee_count,
        (SELECT COUNT(*)::int FROM meeting_agenda_items ag WHERE ag.meeting_id = m.id) AS agenda_count
      FROM meetings m
      JOIN users u ON u.id = m.organiser_id
      WHERE m.id = $1 AND m.organisation_id = $2
    `;

    const res = await client.query(query, [meetingId, organisationId]);
    if (res.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const meeting = res.rows[0];

    // Visibility Check (MTG-003):
    // If attendees_only, user must be organiser, active attendee, or meeting admin / org manager.
    if (meeting.visibility === 'attendees_only') {
      const isOrganiser = meeting.organiser_id === viewerUserId;
      const hasAdminPerm =
        hasPermission(viewerPermissions, 'meeting.edit') ||
        hasPermission(viewerPermissions, 'meeting.status.manage') ||
        hasPermission(viewerPermissions, 'org.admin') ||
        hasPermission(viewerPermissions, 'org.owner');

      if (!isOrganiser && !hasAdminPerm) {
        // Check if viewer is an attendee
        const attRes = await client.query(
          `SELECT id FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2`,
          [meetingId, viewerUserId]
        );
        if (attRes.rows.length === 0) {
          throw new AuthorizationError(
            'Access denied. This meeting is restricted to attendees only.',
            'MEETING_ACCESS_DENIED'
          );
        }
      }
    }

    return formatMeetingRow(meeting);
  });
}

export async function listMeetings(organisationId, query = {}, viewerUserId, viewerPermissions = []) {
  const {
    status,
    timeframe,
    from,
    to,
    organiserId,
    attendeeId,
    search,
    page = 1,
    limit = 20,
  } = query;

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  return withTenantTransaction({ organisationId, userId: viewerUserId }, async (client) => {
    const hasAdminPerm =
      hasPermission(viewerPermissions, 'meeting.edit') ||
      hasPermission(viewerPermissions, 'meeting.status.manage') ||
      hasPermission(viewerPermissions, 'org.admin') ||
      hasPermission(viewerPermissions, 'org.owner');

    const conditions = ['m.organisation_id = $1'];
    const params = [organisationId];
    let pIdx = 2;

    // Visibility filter (MTG-003):
    // For ordinary members without admin permission, exclude attendees_only meetings
    // unless they are the organiser or an attendee.
    if (!hasAdminPerm) {
      conditions.push(`(
        m.visibility = 'organisation'
        OR m.organiser_id = $${pIdx}
        OR EXISTS (
          SELECT 1 FROM meeting_attendees a 
          WHERE a.meeting_id = m.id AND a.user_id = $${pIdx}
        )
      )`);
      params.push(viewerUserId);
      pIdx++;
    }

    if (status && status !== 'all') {
      conditions.push(`m.status = $${pIdx}`);
      params.push(status);
      pIdx++;
    }

    if (timeframe === 'upcoming') {
      conditions.push(`m.start_at >= NOW()`);
    } else if (timeframe === 'past') {
      conditions.push(`m.end_at < NOW()`);
    }

    if (from) {
      conditions.push(`m.start_at >= $${pIdx}`);
      params.push(new Date(from).toISOString());
      pIdx++;
    }

    if (to) {
      conditions.push(`m.start_at <= $${pIdx}`);
      params.push(new Date(to).toISOString());
      pIdx++;
    }

    if (organiserId) {
      conditions.push(`m.organiser_id = $${pIdx}`);
      params.push(organiserId);
      pIdx++;
    }

    if (attendeeId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM meeting_attendees att
        WHERE att.meeting_id = m.id AND att.user_id = $${pIdx}
      )`);
      params.push(attendeeId);
      pIdx++;
    }

    if (search && search.trim()) {
      conditions.push(`(m.title ILIKE $${pIdx} OR m.description ILIKE $${pIdx})`);
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Count total items
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM meetings m WHERE ${whereClause}`,
      params
    );
    const totalItems = countRes.rows[0].total;

    // Fetch paginated rows
    const sql = `
      SELECT 
        m.*,
        u.full_name AS organiser_name,
        u.email AS organiser_email,
        (SELECT COUNT(*)::int FROM meeting_attendees a WHERE a.meeting_id = m.id) AS attendee_count,
        (SELECT COUNT(*)::int FROM meeting_agenda_items ag WHERE ag.meeting_id = m.id) AS agenda_count
      FROM meetings m
      JOIN users u ON u.id = m.organiser_id
      WHERE ${whereClause}
      ORDER BY m.start_at ASC
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    params.push(parsedLimit, offset);

    const res = await client.query(sql, params);
    const meetings = res.rows.map(formatMeetingRow);

    return {
      meetings,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalItems,
        totalPages: Math.ceil(totalItems / parsedLimit) || 1,
        hasNextPage: parsedPage * parsedLimit < totalItems,
        hasPrevPage: parsedPage > 1,
      },
    };
  });
}

export async function updateMeeting(
  organisationId,
  meetingId,
  updates,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Lock meeting row
    const lockRes = await client.query(
      `SELECT * FROM meetings WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
      [meetingId, organisationId]
    );

    if (lockRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const currentMeeting = lockRes.rows[0];

    // Invariant (MTG-002): Terminal states cannot be edited
    if (['completed', 'cancelled'].includes(currentMeeting.status)) {
      throw new ConflictError(
        `Cannot edit meeting in terminal '${currentMeeting.status}' status.`,
        'MEETING_TERMINAL_STATE'
      );
    }

    const newStart = updates.startAt ? new Date(updates.startAt) : currentMeeting.start_at;
    const newEnd = updates.endAt ? new Date(updates.endAt) : currentMeeting.end_at;

    if (newEnd <= newStart) {
      throw new ValidationError('Meeting end time must be after the start time.');
    }

    if (updates.timezone && !isValidIanaTimeZone(updates.timezone)) {
      throw new ValidationError(`Invalid IANA time-zone identifier: "${updates.timezone}".`);
    }

    if (updates.visibility && !MEETING_VISIBILITIES.includes(updates.visibility)) {
      throw new ValidationError(`Invalid visibility "${updates.visibility}". Allowed: ${MEETING_VISIBILITIES.join(', ')}.`);
    }

    if (updates.locationType && !MEETING_LOCATION_TYPES.includes(updates.locationType)) {
      throw new ValidationError(`Invalid locationType "${updates.locationType}".`);
    }

    // Organiser verification if changed
    if (updates.organiserId && updates.organiserId !== currentMeeting.organiser_id) {
      const orgMemberRes = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
        [organisationId, updates.organiserId]
      );
      if (orgMemberRes.rows.length === 0) {
        throw new ValidationError('New organiser must be an active member of this organisation.');
      }
      // Ensure new organiser is recorded as accepted attendee
      await client.query(
        `INSERT INTO meeting_attendees (organisation_id, meeting_id, user_id, role, rsvp_status, responded_at)
         VALUES ($1, $2, $3, 'organiser', 'accepted', NOW())
         ON CONFLICT (meeting_id, user_id) DO UPDATE SET role = 'organiser', rsvp_status = 'accepted'`,
        [organisationId, meetingId, updates.organiserId]
      );
    }

    const title = updates.title !== undefined ? updates.title.trim() : currentMeeting.title;
    const description = updates.description !== undefined ? updates.description : currentMeeting.description;
    const timezone = updates.timezone !== undefined ? updates.timezone.trim() : currentMeeting.timezone;
    const locationType = updates.locationType !== undefined ? updates.locationType : currentMeeting.location_type;
    const location = updates.location !== undefined ? updates.location : currentMeeting.location;
    const virtualUrl = updates.virtualUrl !== undefined ? updates.virtualUrl : currentMeeting.virtual_url;
    const visibility = updates.visibility !== undefined ? updates.visibility : currentMeeting.visibility;
    const organiserId = updates.organiserId !== undefined ? updates.organiserId : currentMeeting.organiser_id;

    const updateSql = `
      UPDATE meetings
      SET title = $1, description = $2, start_at = $3, end_at = $4, timezone = $5,
          location_type = $6, location = $7, virtual_url = $8, visibility = $9,
          organiser_id = $10, updated_at = NOW()
      WHERE id = $11 AND organisation_id = $12
      RETURNING *
    `;

    const res = await client.query(updateSql, [
      title,
      description,
      newStart.toISOString(),
      newEnd.toISOString(),
      timezone,
      locationType,
      location,
      virtualUrl,
      visibility,
      organiserId,
      meetingId,
      organisationId,
    ]);

    // Dispatch reschedule email notifications (MTG-007)
    if (updates.startAt || updates.endAt) {
      try {
        const attRes = await client.query(
          `SELECT a.external_email, u.email as user_email
           FROM meeting_attendees a
           LEFT JOIN users u ON u.id = a.user_id
           WHERE a.meeting_id = $1 AND a.organisation_id = $2
             AND a.rsvp_status != 'declined'`,
          [meetingId, organisationId]
        );
        for (const att of attRes.rows) {
          const toEmail = att.user_email || att.external_email;
          if (toEmail) {
            await sendEmail({
              to: toEmail,
              subject: `Updated: ${title}`,
              text: `The schedule for meeting "${title}" has been updated.\nNew Time: ${newStart.toISOString()} - ${newEnd.toISOString()} (${timezone})`,
            }).catch((e) => logger.warn({ err: e.message, to: toEmail }, 'Failed to deliver meeting update notice'));
          }
        }
      } catch (emailErr) {
        logger.warn({ err: emailErr.message }, 'Meeting update email dispatch error');
      }
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.updated',
      entityType: 'meeting',
      entityId: meetingId,
      metadata: {
        title,
        status: currentMeeting.status,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatMeetingRow(res.rows[0]);
  });
}

export async function transitionMeetingStatus(
  organisationId,
  meetingId,
  nextStatus,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!MEETING_STATUSES.includes(nextStatus)) {
    throw new ValidationError(`Invalid meeting status "${nextStatus}". Allowed: ${MEETING_STATUSES.join(', ')}.`);
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Lock meeting row
    const lockRes = await client.query(
      `SELECT * FROM meetings WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
      [meetingId, organisationId]
    );

    if (lockRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const meeting = lockRes.rows[0];

    // 2. Transition validation (MTG-002)
    if (!isValidMeetingTransition(meeting.status, nextStatus)) {
      throw new ConflictError(
        `Cannot transition meeting from '${meeting.status}' to '${nextStatus}'.`,
        'INVALID_MEETING_STATUS_TRANSITION'
      );
    }

    // 3. Update status
    const updateSql = `
      UPDATE meetings
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND organisation_id = $3
      RETURNING *
    `;

    const res = await client.query(updateSql, [nextStatus, meetingId, organisationId]);

    // Dispatch cancellation email notifications (MTG-007)
    if (nextStatus === 'cancelled') {
      try {
        const attRes = await client.query(
          `SELECT a.external_email, u.email as user_email
           FROM meeting_attendees a
           LEFT JOIN users u ON u.id = a.user_id
           WHERE a.meeting_id = $1 AND a.organisation_id = $2
             AND a.rsvp_status != 'declined'`,
          [meetingId, organisationId]
        );
        for (const att of attRes.rows) {
          const toEmail = att.user_email || att.external_email;
          if (toEmail) {
            await sendEmail({
              to: toEmail,
              subject: `Cancelled: ${meeting.title}`,
              text: `The meeting "${meeting.title}" scheduled for ${meeting.start_at} has been cancelled.`,
            }).catch((e) => logger.warn({ err: e.message, to: toEmail }, 'Failed to deliver meeting cancellation notice'));
          }
        }
      } catch (emailErr) {
        logger.warn({ err: emailErr.message }, 'Meeting cancellation email dispatch error');
      }
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.status_changed',
      entityType: 'meeting',
      entityId: meetingId,
      metadata: {
        fromStatus: meeting.status,
        toStatus: nextStatus,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatMeetingRow(res.rows[0]);
  });
}

// -----------------------------------------------------------------------------
// 2. Attendee Management (MTG-003)
// -----------------------------------------------------------------------------

export async function listMeetingAttendees(organisationId, meetingId, viewerUserId, viewerPermissions = []) {
  // First verify viewer has access to meeting
  await getMeetingById(organisationId, meetingId, viewerUserId, viewerPermissions);

  return withTenantTransaction({ organisationId, userId: viewerUserId }, async (client) => {
    const res = await client.query(
      `SELECT 
        a.id, a.meeting_id, a.organisation_id, a.user_id, a.external_email,
        a.role, a.rsvp_status, a.invited_at, a.responded_at, a.created_at,
        u.full_name AS user_name, u.email AS user_email
      FROM meeting_attendees a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.meeting_id = $1 AND a.organisation_id = $2
      ORDER BY a.created_at ASC`,
      [meetingId, organisationId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      meetingId: row.meeting_id,
      organisationId: row.organisation_id,
      userId: row.user_id,
      userName: row.user_name || null,
      userEmail: row.user_email || row.external_email || null,
      isExternal: !row.user_id,
      role: row.role,
      rsvpStatus: row.rsvp_status,
      invitedAt: row.invited_at ? row.invited_at.toISOString() : null,
      respondedAt: row.responded_at ? row.responded_at.toISOString() : null,
      createdAt: row.created_at ? row.created_at.toISOString() : null,
    }));
  });
}

export async function addMeetingAttendee(
  organisationId,
  meetingId,
  { userId, externalEmail, role = 'participant' },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!userId && !externalEmail) {
    throw new ValidationError('Either userId (internal member) or externalEmail is required.');
  }

  if (userId && externalEmail) {
    throw new ValidationError('Specify either userId or externalEmail, not both.');
  }

  if (!MEETING_ATTENDEE_ROLES.includes(role)) {
    throw new ValidationError(`Invalid attendee role "${role}". Allowed: ${MEETING_ATTENDEE_ROLES.join(', ')}.`);
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify meeting exists in organisation
    const meetRes = await client.query(
      `SELECT id, status FROM meetings WHERE id = $1 AND organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    if (['completed', 'cancelled'].includes(meetRes.rows[0].status)) {
      throw new ConflictError('Cannot add attendees to a completed or cancelled meeting.', 'MEETING_TERMINAL_STATE');
    }

    let insertUserId = null;
    let insertEmail = null;

    if (userId) {
      // Internal attendee: must be active member of the organisation (MTG-003)
      const memRes = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
        [organisationId, userId]
      );
      if (memRes.rows.length === 0) {
        throw new ValidationError('Target user must be an active member of this organisation.');
      }

      // Check duplicate
      const dupRes = await client.query(
        `SELECT id FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2`,
        [meetingId, userId]
      );
      if (dupRes.rows.length > 0) {
        throw new ConflictError('User is already an attendee of this meeting.', 'ATTENDEE_ALREADY_EXISTS');
      }
      insertUserId = userId;
    } else {
      // External attendee: valid email
      const cleanEmail = externalEmail.trim().toLowerCase();
      const dupRes = await client.query(
        `SELECT id FROM meeting_attendees WHERE meeting_id = $1 AND external_email = $2`,
        [meetingId, cleanEmail]
      );
      if (dupRes.rows.length > 0) {
        throw new ConflictError('External email is already invited to this meeting.', 'ATTENDEE_ALREADY_EXISTS');
      }
      insertEmail = cleanEmail;
    }

    const insertSql = `
      INSERT INTO meeting_attendees (
        organisation_id, meeting_id, user_id, external_email, role, rsvp_status
      ) VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *
    `;

    const res = await client.query(insertSql, [
      organisationId,
      meetingId,
      insertUserId,
      insertEmail,
      role,
    ]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.attendee.added',
      entityType: 'meeting_attendee',
      entityId: res.rows[0].id,
      metadata: {
        meetingId,
        userId: insertUserId,
        isExternal: !insertUserId,
        role,
      },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: res.rows[0].id,
      meetingId: res.rows[0].meeting_id,
      organisationId: res.rows[0].organisation_id,
      userId: res.rows[0].user_id,
      externalEmail: res.rows[0].external_email,
      role: res.rows[0].role,
      rsvpStatus: res.rows[0].rsvp_status,
      invitedAt: res.rows[0].invited_at.toISOString(),
    };
  });
}

export async function removeMeetingAttendee(
  organisationId,
  meetingId,
  attendeeId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Fetch attendee
    const attRes = await client.query(
      `SELECT a.*, m.organiser_id 
       FROM meeting_attendees a
       JOIN meetings m ON m.id = a.meeting_id
       WHERE a.id = $1 AND a.meeting_id = $2 AND a.organisation_id = $3`,
      [attendeeId, meetingId, organisationId]
    );

    if (attRes.rows.length === 0) {
      throw new NotFoundError('Attendee not found in this meeting.', 'ATTENDEE_NOT_FOUND');
    }

    const attendee = attRes.rows[0];

    // Cannot remove organiser from attendees without reassigning organiser
    if (attendee.user_id && attendee.user_id === attendee.organiser_id) {
      throw new ConflictError(
        'Cannot remove the meeting organiser from attendees. Change the organiser first.',
        'CANNOT_REMOVE_ORGANISER'
      );
    }

    await client.query(`DELETE FROM meeting_attendees WHERE id = $1`, [attendeeId]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.attendee.removed',
      entityType: 'meeting_attendee',
      entityId: attendeeId,
      metadata: {
        meetingId,
        userId: attendee.user_id,
        isExternal: !attendee.user_id,
      },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

export async function respondToMeetingInvitation(
  organisationId,
  meetingId,
  rsvpStatus,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!MEETING_RSVP_STATUSES.includes(rsvpStatus)) {
    throw new ValidationError(`Invalid RSVP status "${rsvpStatus}". Allowed: ${MEETING_RSVP_STATUSES.join(', ')}.`);
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // Verify caller is an attendee
    const attRes = await client.query(
      `SELECT id FROM meeting_attendees 
       WHERE meeting_id = $1 AND user_id = $2 AND organisation_id = $3`,
      [meetingId, actorUserId, organisationId]
    );

    if (attRes.rows.length === 0) {
      throw new NotFoundError('You are not registered as an attendee for this meeting.', 'ATTENDEE_NOT_FOUND');
    }

    const updateSql = `
      UPDATE meeting_attendees
      SET rsvp_status = $1, responded_at = NOW(), updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const res = await client.query(updateSql, [rsvpStatus, attRes.rows[0].id]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.attendee.responded',
      entityType: 'meeting_attendee',
      entityId: attRes.rows[0].id,
      metadata: {
        meetingId,
        rsvpStatus,
      },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: res.rows[0].id,
      meetingId: res.rows[0].meeting_id,
      rsvpStatus: res.rows[0].rsvp_status,
      respondedAt: res.rows[0].responded_at.toISOString(),
    };
  });
}

// -----------------------------------------------------------------------------
// 3. Ordered Agenda Items Management (MTG-004)
// -----------------------------------------------------------------------------

export async function listMeetingAgenda(organisationId, meetingId, viewerUserId, viewerPermissions = []) {
  // First verify viewer has access to meeting
  await getMeetingById(organisationId, meetingId, viewerUserId, viewerPermissions);

  return withTenantTransaction({ organisationId, userId: viewerUserId }, async (client) => {
    const res = await client.query(
      `SELECT 
        id, meeting_id, organisation_id, title, description, duration_minutes, order_index, created_by_id, created_at, updated_at
      FROM meeting_agenda_items
      WHERE meeting_id = $1 AND organisation_id = $2
      ORDER BY order_index ASC, created_at ASC`,
      [meetingId, organisationId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      meetingId: row.meeting_id,
      organisationId: row.organisation_id,
      title: row.title,
      description: row.description,
      durationMinutes: row.duration_minutes,
      orderIndex: row.order_index,
      createdById: row.created_by_id,
      createdAt: row.created_at ? row.created_at.toISOString() : null,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    }));
  });
}

export async function createMeetingAgendaItem(
  organisationId,
  meetingId,
  { title, description, durationMinutes, orderIndex },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!title || !title.trim()) {
    throw new ValidationError('Agenda item title is required.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // Verify meeting exists in organisation
    const meetRes = await client.query(
      `SELECT id, status FROM meetings WHERE id = $1 AND organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    if (['completed', 'cancelled'].includes(meetRes.rows[0].status)) {
      throw new ConflictError('Cannot add agenda items to a completed or cancelled meeting.', 'MEETING_TERMINAL_STATE');
    }

    // Determine order index if omitted
    let effectiveOrder = orderIndex;
    if (effectiveOrder === undefined || effectiveOrder === null) {
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM meeting_agenda_items WHERE meeting_id = $1`,
        [meetingId]
      );
      effectiveOrder = maxRes.rows[0].next_order;
    }

    const insertSql = `
      INSERT INTO meeting_agenda_items (
        organisation_id, meeting_id, title, description, duration_minutes, order_index, created_by_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const res = await client.query(insertSql, [
      organisationId,
      meetingId,
      title.trim(),
      description ? description.trim() : null,
      durationMinutes || null,
      effectiveOrder,
      actorUserId,
    ]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.agenda.created',
      entityType: 'meeting_agenda_item',
      entityId: res.rows[0].id,
      metadata: {
        meetingId,
        title: res.rows[0].title,
        orderIndex: res.rows[0].order_index,
      },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: res.rows[0].id,
      meetingId: res.rows[0].meeting_id,
      organisationId: res.rows[0].organisation_id,
      title: res.rows[0].title,
      description: res.rows[0].description,
      durationMinutes: res.rows[0].duration_minutes,
      orderIndex: res.rows[0].order_index,
      createdAt: res.rows[0].created_at.toISOString(),
    };
  });
}

export async function updateMeetingAgendaItem(
  organisationId,
  meetingId,
  itemId,
  updates,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const itemRes = await client.query(
      `SELECT a.*, m.status AS meeting_status 
       FROM meeting_agenda_items a
       JOIN meetings m ON m.id = a.meeting_id
       WHERE a.id = $1 AND a.meeting_id = $2 AND a.organisation_id = $3`,
      [itemId, meetingId, organisationId]
    );

    if (itemRes.rows.length === 0) {
      throw new NotFoundError('Agenda item not found.', 'AGENDA_ITEM_NOT_FOUND');
    }

    if (['completed', 'cancelled'].includes(itemRes.rows[0].meeting_status)) {
      throw new ConflictError('Cannot edit agenda items of a completed or cancelled meeting.', 'MEETING_TERMINAL_STATE');
    }

    const current = itemRes.rows[0];
    const title = updates.title !== undefined ? updates.title.trim() : current.title;
    const description = updates.description !== undefined ? updates.description : current.description;
    const durationMinutes = updates.durationMinutes !== undefined ? updates.durationMinutes : current.duration_minutes;
    const orderIndex = updates.orderIndex !== undefined ? updates.orderIndex : current.order_index;

    const updateSql = `
      UPDATE meeting_agenda_items
      SET title = $1, description = $2, duration_minutes = $3, order_index = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;

    const res = await client.query(updateSql, [title, description, durationMinutes, orderIndex, itemId]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.agenda.updated',
      entityType: 'meeting_agenda_item',
      entityId: itemId,
      metadata: { meetingId, title },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: res.rows[0].id,
      meetingId: res.rows[0].meeting_id,
      organisationId: res.rows[0].organisation_id,
      title: res.rows[0].title,
      description: res.rows[0].description,
      durationMinutes: res.rows[0].duration_minutes,
      orderIndex: res.rows[0].order_index,
      updatedAt: res.rows[0].updated_at.toISOString(),
    };
  });
}

export async function deleteMeetingAgendaItem(
  organisationId,
  meetingId,
  itemId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const itemRes = await client.query(
      `SELECT a.*, m.status AS meeting_status 
       FROM meeting_agenda_items a
       JOIN meetings m ON m.id = a.meeting_id
       WHERE a.id = $1 AND a.meeting_id = $2 AND a.organisation_id = $3`,
      [itemId, meetingId, organisationId]
    );

    if (itemRes.rows.length === 0) {
      throw new NotFoundError('Agenda item not found.', 'AGENDA_ITEM_NOT_FOUND');
    }

    if (['completed', 'cancelled'].includes(itemRes.rows[0].meeting_status)) {
      throw new ConflictError('Cannot delete agenda items from a completed or cancelled meeting.', 'MEETING_TERMINAL_STATE');
    }

    await client.query(`DELETE FROM meeting_agenda_items WHERE id = $1`, [itemId]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.agenda.deleted',
      entityType: 'meeting_agenda_item',
      entityId: itemId,
      metadata: { meetingId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

export async function reorderMeetingAgenda(
  organisationId,
  meetingId,
  itemIds,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new ValidationError('itemIds must be a non-empty array of agenda item UUIDs.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const meetRes = await client.query(
      `SELECT id, status FROM meetings WHERE id = $1 AND organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    if (['completed', 'cancelled'].includes(meetRes.rows[0].status)) {
      throw new ConflictError('Cannot reorder agenda of a completed or cancelled meeting.', 'MEETING_TERMINAL_STATE');
    }

    for (let i = 0; i < itemIds.length; i++) {
      await client.query(
        `UPDATE meeting_agenda_items SET order_index = $1, updated_at = NOW()
         WHERE id = $2 AND meeting_id = $3 AND organisation_id = $4`,
        [i, itemIds[i], meetingId, organisationId]
      );
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.agenda.reordered',
      entityType: 'meeting_agenda',
      entityId: meetingId,
      metadata: { meetingId, count: itemIds.length },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

// -----------------------------------------------------------------------------
// 4. Confidential Notes / Minutes (MTG-005, ADR-014)
// -----------------------------------------------------------------------------

export async function getMeetingNotes(organisationId, meetingId, actorUserId, actorPermissions = []) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const meetRes = await client.query(
      `SELECT organiser_id, visibility FROM meetings WHERE id = $1 AND organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const meeting = meetRes.rows[0];

    // Confidential minutes access rule (MTG-005, PRD §8.2, ADR-014):
    // By default only the organiser and users granted meeting.notes.read / meeting.notes.manage
    // (or org.admin / org.owner) can read private notes.
    // Attendee status alone does NOT grant access.
    const isOrganiser = meeting.organiser_id === actorUserId;
    const canRead =
      isOrganiser ||
      hasPermission(actorPermissions, 'meeting.notes.read') ||
      hasPermission(actorPermissions, 'meeting.notes.manage') ||
      hasPermission(actorPermissions, 'org.admin') ||
      hasPermission(actorPermissions, 'org.owner');

    if (!canRead) {
      throw new AuthorizationError(
        'Confidential minutes are restricted to organisers and authorised roles. Attendee status alone does not grant access.',
        'FORBIDDEN_NOTES_ACCESS'
      );
    }

    const notesRes = await client.query(
      `SELECT n.*, u.full_name as author_name, u.email as author_email
       FROM meeting_notes n
       JOIN users u ON u.id = n.created_by_id
       WHERE n.meeting_id = $1 AND n.organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (notesRes.rows.length === 0) {
      return null;
    }

    return formatNoteRow(notesRes.rows[0]);
  });
}

export async function upsertMeetingNotes(
  organisationId,
  meetingId,
  content,
  actorUserId,
  actorPermissions = [],
  { ipAddress, userAgent } = {}
) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ValidationError('Meeting notes content must be a non-empty string.');
  }

  if (content.length > 50000) {
    throw new ValidationError('Meeting notes content exceeds maximum allowed length of 50,000 characters.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Lock meeting row
    const meetRes = await client.query(
      `SELECT organiser_id, status FROM meetings WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const meeting = meetRes.rows[0];

    const isOrganiser = meeting.organiser_id === actorUserId;
    const canEdit =
      isOrganiser ||
      hasPermission(actorPermissions, 'meeting.notes.edit') ||
      hasPermission(actorPermissions, 'meeting.notes.manage') ||
      hasPermission(actorPermissions, 'org.admin') ||
      hasPermission(actorPermissions, 'org.owner');

    if (!canEdit) {
      throw new AuthorizationError(
        'Not authorised to edit confidential meeting minutes.',
        'FORBIDDEN_NOTES_MANAGE'
      );
    }

    if (meeting.status === 'cancelled') {
      throw new ConflictError('Cannot author or edit minutes for a cancelled meeting.', 'MEETING_CANCELLED');
    }

    // 2. Upsert meeting_notes
    const upsertSql = `
      INSERT INTO meeting_notes (
        organisation_id, meeting_id, content, created_by_id, updated_by_id, updated_at
      )
      VALUES ($1, $2, $3, $4, $4, NOW())
      ON CONFLICT (meeting_id) DO UPDATE
      SET content = $3, updated_by_id = $4, updated_at = NOW()
      RETURNING *
    `;

    const res = await client.query(upsertSql, [
      organisationId,
      meetingId,
      content.trim(),
      actorUserId,
    ]);

    // 3. Audit log (MTG-005: Do not put note bodies in audit metadata)
    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.notes_updated',
      entityType: 'meeting_notes',
      entityId: res.rows[0].id,
      metadata: {
        meetingId,
        length: content.trim().length,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatNoteRow(res.rows[0]);
  });
}

// -----------------------------------------------------------------------------
// 5. Action Items (MTG-006)
// -----------------------------------------------------------------------------

export async function createMeetingActionItem(
  organisationId,
  meetingId,
  itemData,
  actorUserId,
  actorPermissions = [],
  { ipAddress, userAgent } = {}
) {
  const { title, description, assigneeId, dueDate, priority = 'medium', agendaItemId } = itemData;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new ValidationError('Action item title is required (1-200 characters).');
  }

  if (title.trim().length > 200) {
    throw new ValidationError('Action item title cannot exceed 200 characters.');
  }

  if (!assigneeId) {
    throw new ValidationError('Action item assigneeId is required.');
  }

  if (!ACTION_ITEM_PRIORITIES.includes(priority)) {
    throw new ValidationError(`Invalid priority "${priority}". Allowed: ${ACTION_ITEM_PRIORITIES.join(', ')}.`);
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify meeting exists and lock
    const meetRes = await client.query(
      `SELECT organiser_id, status FROM meetings WHERE id = $1 AND organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const meeting = meetRes.rows[0];

    const isOrganiser = meeting.organiser_id === actorUserId;
    const canCreate =
      isOrganiser ||
      hasPermission(actorPermissions, 'meeting.action.manage') ||
      hasPermission(actorPermissions, 'org.admin') ||
      hasPermission(actorPermissions, 'org.owner');

    if (!canCreate) {
      throw new AuthorizationError('Not authorised to create action items for this meeting.', 'FORBIDDEN');
    }

    if (meeting.status === 'cancelled') {
      throw new ConflictError('Cannot add action items to a cancelled meeting.', 'MEETING_CANCELLED');
    }

    // 2. Validate assignee is active org member (MTG-006)
    const memberRes = await client.query(
      `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
      [organisationId, assigneeId]
    );

    if (memberRes.rows.length === 0) {
      throw new ValidationError(
        'Action item assignee must be an active organisation member.',
        'INVALID_ASSIGNEE'
      );
    }

    // 3. Validate agendaItemId belongs to same meeting and org if specified
    if (agendaItemId) {
      const agendaRes = await client.query(
        `SELECT id FROM meeting_agenda_items WHERE id = $1 AND meeting_id = $2 AND organisation_id = $3`,
        [agendaItemId, meetingId, organisationId]
      );

      if (agendaRes.rows.length === 0) {
        throw new ValidationError(
          'Source agenda item must belong to this meeting and organisation.',
          'INVALID_AGENDA_ITEM'
        );
      }
    }

    // 4. Insert action item
    const insertSql = `
      INSERT INTO meeting_action_items (
        organisation_id, meeting_id, title, description, assignee_id, due_date,
        priority, status, agenda_item_id, created_by_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9)
      RETURNING *
    `;

    const res = await client.query(insertSql, [
      organisationId,
      meetingId,
      title.trim(),
      description ? description.trim() : null,
      assigneeId,
      dueDate || null,
      priority,
      agendaItemId || null,
      actorUserId,
    ]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.action_item_created',
      entityType: 'meeting_action_item',
      entityId: res.rows[0].id,
      metadata: {
        meetingId,
        title: title.trim(),
        assigneeId,
        priority,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatActionItemRow(res.rows[0]);
  });
}

export async function listMeetingActionItems(organisationId, meetingId, viewerUserId, viewerPermissions = []) {
  // First verify viewer has access to meeting
  await getMeetingById(organisationId, meetingId, viewerUserId, viewerPermissions);

  return withTenantTransaction({ organisationId, userId: viewerUserId }, async (client) => {
    const res = await client.query(
      `SELECT a.*, u.full_name AS assignee_name, u.email AS assignee_email,
              ag.title AS agenda_item_title
       FROM meeting_action_items a
       JOIN users u ON u.id = a.assignee_id
       LEFT JOIN meeting_agenda_items ag ON ag.id = a.agenda_item_id
       WHERE a.meeting_id = $1 AND a.organisation_id = $2
       ORDER BY 
         CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
         a.due_date ASC NULLS LAST,
         a.created_at ASC`,
      [meetingId, organisationId]
    );

    return res.rows.map(formatActionItemRow);
  });
}

export async function updateMeetingActionItem(
  organisationId,
  meetingId,
  actionItemId,
  updates,
  actorUserId,
  actorPermissions = [],
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Fetch meeting
    const meetRes = await client.query(
      `SELECT organiser_id, status FROM meetings WHERE id = $1 AND organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const meeting = meetRes.rows[0];

    // 2. Lock action item
    const itemRes = await client.query(
      `SELECT * FROM meeting_action_items WHERE id = $1 AND meeting_id = $2 AND organisation_id = $3 FOR UPDATE`,
      [actionItemId, meetingId, organisationId]
    );

    if (itemRes.rows.length === 0) {
      throw new NotFoundError('Action item not found.', 'ACTION_ITEM_NOT_FOUND');
    }

    const actionItem = itemRes.rows[0];

    // 3. Check permissions (MTG-006):
    const isOrganiser = meeting.organiser_id === actorUserId;
    const isAssignee = actionItem.assignee_id === actorUserId;
    const canManage =
      isOrganiser ||
      hasPermission(actorPermissions, 'meeting.action.manage') ||
      hasPermission(actorPermissions, 'org.admin') ||
      hasPermission(actorPermissions, 'org.owner');
    const canUpdateStatus = canManage || isAssignee || hasPermission(actorPermissions, 'meeting.action.update');

    if (!canUpdateStatus) {
      throw new AuthorizationError('Not authorised to update this action item.', 'FORBIDDEN');
    }

    // If not a manager/organiser, assignee can ONLY update status
    if (!canManage) {
      if (
        updates.title !== undefined ||
        updates.description !== undefined ||
        updates.assigneeId !== undefined ||
        updates.priority !== undefined ||
        updates.dueDate !== undefined ||
        updates.agendaItemId !== undefined
      ) {
        throw new AuthorizationError(
          'Assignees without management permissions can only update action item status.',
          'FORBIDDEN_ACTION_FIELD_UPDATE'
        );
      }
    }

    // 4. Validate status transition (MTG-006)
    let nextStatus = actionItem.status;
    if (updates.status !== undefined && updates.status !== actionItem.status) {
      if (!ACTION_ITEM_STATUSES.includes(updates.status)) {
        throw new ValidationError(`Invalid action item status "${updates.status}". Allowed: ${ACTION_ITEM_STATUSES.join(', ')}.`);
      }

      if (['done', 'cancelled'].includes(actionItem.status)) {
        throw new ConflictError(
          `Terminal action item in status '${actionItem.status}' cannot be transitioned.`,
          'ACTION_ITEM_TERMINAL_STATE'
        );
      }

      if (!isValidActionItemTransition(actionItem.status, updates.status)) {
        throw new ConflictError(
          `Cannot transition action item from '${actionItem.status}' to '${updates.status}'.`,
          'INVALID_ACTION_TRANSITION'
        );
      }
      nextStatus = updates.status;
    }

    // 5. Validate assignee change if present
    let nextAssigneeId = actionItem.assignee_id;
    if (updates.assigneeId && updates.assigneeId !== actionItem.assignee_id) {
      const memberRes = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
        [organisationId, updates.assigneeId]
      );
      if (memberRes.rows.length === 0) {
        throw new ValidationError('Action item assignee must be an active organisation member.', 'INVALID_ASSIGNEE');
      }
      nextAssigneeId = updates.assigneeId;
    }

    // 6. Validate agenda item change if present
    let nextAgendaItemId = actionItem.agenda_item_id;
    if (updates.agendaItemId !== undefined && updates.agendaItemId !== actionItem.agenda_item_id) {
      if (updates.agendaItemId) {
        const agendaRes = await client.query(
          `SELECT id FROM meeting_agenda_items WHERE id = $1 AND meeting_id = $2 AND organisation_id = $3`,
          [updates.agendaItemId, meetingId, organisationId]
        );
        if (agendaRes.rows.length === 0) {
          throw new ValidationError('Source agenda item must belong to this meeting.', 'INVALID_AGENDA_ITEM');
        }
        nextAgendaItemId = updates.agendaItemId;
      } else {
        nextAgendaItemId = null;
      }
    }

    const title = updates.title !== undefined ? updates.title.trim() : actionItem.title;
    const description = updates.description !== undefined ? updates.description : actionItem.description;
    const priority = updates.priority !== undefined ? updates.priority : actionItem.priority;
    const dueDate = updates.dueDate !== undefined ? updates.dueDate : actionItem.due_date;

    const updateSql = `
      UPDATE meeting_action_items
      SET title = $1, description = $2, assignee_id = $3, priority = $4,
          status = $5, due_date = $6, agenda_item_id = $7, updated_at = NOW()
      WHERE id = $8 AND meeting_id = $9 AND organisation_id = $10
      RETURNING *
    `;

    const res = await client.query(updateSql, [
      title,
      description,
      nextAssigneeId,
      priority,
      nextStatus,
      dueDate || null,
      nextAgendaItemId,
      actionItemId,
      meetingId,
      organisationId,
    ]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.action_item_updated',
      entityType: 'meeting_action_item',
      entityId: actionItemId,
      metadata: {
        meetingId,
        fromStatus: actionItem.status,
        toStatus: nextStatus,
        priority,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatActionItemRow(res.rows[0]);
  });
}

export async function deleteMeetingActionItem(
  organisationId,
  meetingId,
  actionItemId,
  actorUserId,
  actorPermissions = [],
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const meetRes = await client.query(
      `SELECT organiser_id FROM meetings WHERE id = $1 AND organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const isOrganiser = meetRes.rows[0].organiser_id === actorUserId;
    const canDelete =
      isOrganiser ||
      hasPermission(actorPermissions, 'meeting.action.manage') ||
      hasPermission(actorPermissions, 'org.admin') ||
      hasPermission(actorPermissions, 'org.owner');

    if (!canDelete) {
      throw new AuthorizationError('Not authorised to delete action items from this meeting.', 'FORBIDDEN');
    }

    const delRes = await client.query(
      `DELETE FROM meeting_action_items WHERE id = $1 AND meeting_id = $2 AND organisation_id = $3 RETURNING id`,
      [actionItemId, meetingId, organisationId]
    );

    if (delRes.rows.length === 0) {
      throw new NotFoundError('Action item not found.', 'ACTION_ITEM_NOT_FOUND');
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.action_item_deleted',
      entityType: 'meeting_action_item',
      entityId: actionItemId,
      metadata: { meetingId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

// -----------------------------------------------------------------------------
// 6. Email Notifications & Invitations (MTG-007)
// -----------------------------------------------------------------------------

export async function sendMeetingInvitations(
  organisationId,
  meetingId,
  actorUserId,
  actorPermissions = [],
  { attendeeIds } = {},
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const meetRes = await client.query(
      `SELECT m.*, u.full_name as organiser_name, u.email as organiser_email
       FROM meetings m
       LEFT JOIN users u ON u.id = m.organiser_id
       WHERE m.id = $1 AND m.organisation_id = $2`,
      [meetingId, organisationId]
    );

    if (meetRes.rows.length === 0) {
      throw new NotFoundError('Meeting not found.', 'MEETING_NOT_FOUND');
    }

    const meeting = meetRes.rows[0];

    const isOrganiser = meeting.organiser_id === actorUserId;
    const canSend =
      isOrganiser ||
      hasPermission(actorPermissions, 'meeting.edit') ||
      hasPermission(actorPermissions, 'meeting.create') ||
      hasPermission(actorPermissions, 'org.admin') ||
      hasPermission(actorPermissions, 'org.owner');

    if (!canSend) {
      throw new AuthorizationError('Not authorised to send meeting invitations.', 'FORBIDDEN');
    }

    let query = `
      SELECT a.id, a.external_email, a.rsvp_status, u.email as user_email, u.full_name as user_name
      FROM meeting_attendees a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.meeting_id = $1 AND a.organisation_id = $2
    `;
    const params = [meetingId, organisationId];

    if (Array.isArray(attendeeIds) && attendeeIds.length > 0) {
      query += ` AND a.id = ANY($3::uuid[])`;
      params.push(attendeeIds);
    } else {
      query += ` AND a.rsvp_status = 'pending'`;
    }

    const attRes = await client.query(query, params);
    const recipients = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const att of attRes.rows) {
      const toEmail = att.user_email || att.external_email;
      if (!toEmail) continue;

      try {
        const result = await sendEmail({
          to: toEmail,
          subject: `Meeting Invitation: ${meeting.title}`,
          text: `You have been invited to "${meeting.title}".\nTime: ${meeting.start_at.toISOString()} - ${meeting.end_at.toISOString()} (${meeting.timezone})\nLocation: ${meeting.location_type === 'virtual' ? meeting.virtual_url : meeting.location || meeting.location_type}\nOrganiser: ${meeting.organiser_name || 'Meeting Organiser'}`,
        });

        recipients.push({ email: toEmail, delivered: true, inMemory: result.inMemory });
        sentCount++;
      } catch (err) {
        logger.warn({ err: err.message, to: toEmail, meetingId }, 'Meeting invite delivery failed');
        recipients.push({ email: toEmail, delivered: false, error: err.message });
        failedCount++;
      }
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'meeting.invitations_sent',
      entityType: 'meeting',
      entityId: meetingId,
      metadata: { sentCount, failedCount, total: attRes.rows.length },
      ipAddress,
      userAgent,
      client,
    });

    return { sentCount, failedCount, recipients };
  });
}

