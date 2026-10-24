/**
 * ManageX Events Core Service
 * Strictly adheres to PRD Section 7.1 (EVT-001, EVT-002, EVT-003), docs/security.md, and ADR-016.
 */

import { withTenantTransaction, withSystemTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../audit/auditService.js';
import {
  EVENT_STATUSES,
  isValidEventTransition,
  isValidIanaTimeZone,
} from './eventLifecycle.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError,
} from '../common/errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    eventType: row.event_type,
    status: row.status,
    visibility: row.visibility,
    startAt: row.start_at ? row.start_at.toISOString() : null,
    endAt: row.end_at ? row.end_at.toISOString() : null,
    timezone: row.timezone,
    locationType: row.location_type,
    location: row.location,
    virtualUrl: row.virtual_url,
    registrationOpensAt: row.registration_opens_at ? row.registration_opens_at.toISOString() : null,
    registrationClosesAt: row.registration_closes_at ? row.registration_closes_at.toISOString() : null,
    capacity: row.capacity,
    teamSizeMin: row.team_size_min,
    teamSizeMax: row.team_size_max,
    submissionOpensAt: row.submission_opens_at ? row.submission_opens_at.toISOString() : null,
    submissionClosesAt: row.submission_closes_at ? row.submission_closes_at.toISOString() : null,
    participantInstructions: row.participant_instructions,
    createdById: row.created_by_id,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    organisation: row.org_name
      ? {
          id: row.organisation_id,
          name: row.org_name,
          slug: row.org_slug,
        }
      : undefined,
  };
}

/**
 * Public response allowlist serialization (EVT-003, ADR-020).
 * Excludes internal creator metadata and private participant instructions.
 */
function formatPublicEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    eventType: row.event_type,
    status: row.status,
    visibility: row.visibility,
    startAt: row.start_at ? row.start_at.toISOString() : null,
    endAt: row.end_at ? row.end_at.toISOString() : null,
    timezone: row.timezone,
    locationType: row.location_type,
    location: row.location,
    virtualUrl: row.virtual_url,
    registrationOpensAt: row.registration_opens_at ? row.registration_opens_at.toISOString() : null,
    registrationClosesAt: row.registration_closes_at ? row.registration_closes_at.toISOString() : null,
    capacity: row.capacity,
    teamSizeMin: row.team_size_min,
    teamSizeMax: row.team_size_max,
    submissionOpensAt: row.submission_opens_at ? row.submission_opens_at.toISOString() : null,
    submissionClosesAt: row.submission_closes_at ? row.submission_closes_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    organisation: row.org_name
      ? {
          id: row.organisation_id,
          name: row.org_name,
          slug: row.org_slug,
        }
      : undefined,
  };
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * Creates a new event in 'draft' status (EVT-001).
 */
export async function createEvent(orgId, data, actorId, { ipAddress, userAgent } = {}) {
  const {
    title,
    slug: customSlug,
    description,
    eventType = 'general_event',
    visibility = 'private',
    startAt,
    endAt,
    timezone,
    locationType = 'in_person',
    location,
    virtualUrl,
    registrationOpensAt,
    registrationClosesAt,
    capacity,
    participantInstructions,
  } = data;

  // 1. Validation
  if (!title || title.trim().length < 2) {
    throw new ValidationError('Event title must be at least 2 characters long.');
  }

  const startDate = new Date(startAt);
  const endDate = new Date(endAt);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new ValidationError('Valid start and end date-times are required.');
  }

  if (endDate <= startDate) {
    throw new ValidationError('Event end time must be after the start time.');
  }

  if (!timezone || !isValidIanaTimeZone(timezone)) {
    throw new ValidationError(`Invalid IANA time-zone identifier: "${timezone}".`);
  }

  let regOpenDate = null;
  let regCloseDate = null;

  if (registrationOpensAt) {
    regOpenDate = new Date(registrationOpensAt);
    if (isNaN(regOpenDate.getTime())) {
      throw new ValidationError('Invalid registration opening date-time.');
    }
  }

  if (registrationClosesAt) {
    regCloseDate = new Date(registrationClosesAt);
    if (isNaN(regCloseDate.getTime())) {
      throw new ValidationError('Invalid registration closing date-time.');
    }
    if (regCloseDate > startDate) {
      throw new ValidationError('Registration closing time cannot be after the event start time.');
    }
    if (regOpenDate && regCloseDate <= regOpenDate) {
      throw new ValidationError('Registration closing time must be after opening time.');
    }
  }

  if (capacity !== undefined && capacity !== null) {
    const capNum = Number(capacity);
    if (!Number.isInteger(capNum) || capNum <= 0) {
      throw new ValidationError('Capacity must be a positive integer.');
    }
  }

  const baseSlug = (customSlug || generateSlug(title)) || 'event';

  return withTenantTransaction({ organisationId: orgId, userId: actorId }, async (client) => {
    // Generate unique slug within organisation
    let finalSlug = baseSlug;
    let counter = 1;
    while (true) {
      const checkRes = await client.query(
        'SELECT id FROM events WHERE organisation_id = $1 AND slug = $2',
        [orgId, finalSlug]
      );
      if (checkRes.rows.length === 0) break;
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const insertSql = `
      INSERT INTO events (
        organisation_id,
        title,
        slug,
        description,
        event_type,
        status,
        visibility,
        start_at,
        end_at,
        timezone,
        location_type,
        location,
        virtual_url,
        registration_opens_at,
        registration_closes_at,
        capacity,
        participant_instructions,
        created_by_id
      )
      VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const res = await client.query(insertSql, [
      orgId,
      title.trim(),
      finalSlug,
      description ? description.trim() : null,
      eventType,
      visibility,
      startDate.toISOString(),
      endDate.toISOString(),
      timezone.trim(),
      locationType,
      location ? location.trim() : null,
      virtualUrl ? virtualUrl.trim() : null,
      regOpenDate ? regOpenDate.toISOString() : null,
      regCloseDate ? regCloseDate.toISOString() : null,
      capacity ? Number(capacity) : null,
      participantInstructions ? participantInstructions.trim() : null,
      actorId,
    ]);

    const createdEvent = formatEventRow(res.rows[0]);

    await recordAuditEvent({
      organisationId: orgId,
      actorId,
      action: 'event.created',
      entityType: 'event',
      entityId: createdEvent.id,
      metadata: {
        title: createdEvent.title,
        eventType: createdEvent.eventType,
        status: createdEvent.status,
      },
      ipAddress,
      userAgent,
      client,
    });

    return createdEvent;
  });
}

/**
 * Lists organisation events with pagination, status filters, and draft protection (EVT-003).
 */
export async function listEvents(
  orgId,
  { status, search, page = 1, limit = 20, canViewDrafts = false }
) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const boundedPage = Math.max(Number(page) || 1, 1);
  const offset = (boundedPage - 1) * boundedLimit;

  return withTenantTransaction({ organisationId: orgId }, async (client) => {
    const conditions = ['organisation_id = $1'];
    const params = [orgId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (!canViewDrafts && status !== 'draft') {
      conditions.push("status != 'draft'");
    }

    if (search && search.trim()) {
      conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*)::int AS total FROM events WHERE ${whereClause}`;
    const countRes = await client.query(countSql, params);
    const totalRecords = countRes.rows[0].total;
    const totalPages = Math.ceil(totalRecords / boundedLimit) || 1;

    const listSql = `
      SELECT *
      FROM events
      WHERE ${whereClause}
      ORDER BY start_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(boundedLimit, offset);

    const listRes = await client.query(listSql, params);
    const events = listRes.rows.map(formatEventRow);

    return {
      events,
      pagination: {
        page: boundedPage,
        limit: boundedLimit,
        totalRecords,
        totalPages,
      },
    };
  });
}

/**
 * Gets event details by ID, validating draft view authorization (EVT-003).
 */
export async function getEventById(orgId, eventId, { canViewDrafts = false, userId = null } = {}) {
  return withTenantTransaction({ organisationId: orgId, userId }, async (client) => {
    const res = await client.query(
      'SELECT * FROM events WHERE id = $1 AND organisation_id = $2',
      [eventId, orgId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Event not found.');
    }

    const event = formatEventRow(res.rows[0]);

    if (event.status === 'draft' && !canViewDrafts) {
      throw new AuthorizationError('Draft events are only visible to authorized event managers.');
    }

    // Private events require organisation membership to view (EVT-003, ADR-003)
    if (event.visibility === 'private' && !canViewDrafts) {
      const effectiveUserId = userId || client.userId;
      if (!effectiveUserId) {
        throw new AuthorizationError('Private events are restricted to organisation members.');
      }
      const isMember = await client.query(
        'SELECT 1 FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2 AND status = $3',
        [orgId, effectiveUserId, 'active']
      );
      if (isMember.rows.length === 0) {
        throw new AuthorizationError('Private events are restricted to organisation members.');
      }
    }

    return event;
  });
}

/**
 * Updates an event's details (EVT-001).
 */
export async function updateEvent(orgId, eventId, updateData, actorId, { ipAddress, userAgent } = {}) {
  return withTenantTransaction({ organisationId: orgId, userId: actorId }, async (client) => {
    const existingRes = await client.query(
      'SELECT * FROM events WHERE id = $1 AND organisation_id = $2 FOR UPDATE',
      [eventId, orgId]
    );

    if (existingRes.rows.length === 0) {
      throw new NotFoundError('Event not found.');
    }

    const current = existingRes.rows[0];

    if (['completed', 'archived'].includes(current.status)) {
      throw new ConflictError(`Events in "${current.status}" status cannot be modified.`);
    }

    const nextTitle = updateData.title !== undefined ? updateData.title.trim() : current.title;
    const nextDesc = updateData.description !== undefined ? updateData.description?.trim() : current.description;
    const nextType = updateData.eventType !== undefined ? updateData.eventType : current.event_type;
    const nextVisibility = updateData.visibility !== undefined ? updateData.visibility : current.visibility;
    const nextStart = updateData.startAt !== undefined ? new Date(updateData.startAt) : new Date(current.start_at);
    const nextEnd = updateData.endAt !== undefined ? new Date(updateData.endAt) : new Date(current.end_at);
    const nextTimezone = updateData.timezone !== undefined ? updateData.timezone.trim() : current.timezone;
    const nextLocType = updateData.locationType !== undefined ? updateData.locationType : current.location_type;
    const nextLocation = updateData.location !== undefined ? updateData.location?.trim() : current.location;
    const nextVirtualUrl = updateData.virtualUrl !== undefined ? updateData.virtualUrl?.trim() : current.virtual_url;
    const nextInstructions = updateData.participantInstructions !== undefined ? updateData.participantInstructions?.trim() : current.participant_instructions;

    let nextRegOpen = current.registration_opens_at ? new Date(current.registration_opens_at) : null;
    if (updateData.registrationOpensAt !== undefined) {
      nextRegOpen = updateData.registrationOpensAt ? new Date(updateData.registrationOpensAt) : null;
    }

    let nextRegClose = current.registration_closes_at ? new Date(current.registration_closes_at) : null;
    if (updateData.registrationClosesAt !== undefined) {
      nextRegClose = updateData.registrationClosesAt ? new Date(updateData.registrationClosesAt) : null;
    }

    let nextCapacity = current.capacity;
    if (updateData.capacity !== undefined) {
      nextCapacity = updateData.capacity !== null ? Number(updateData.capacity) : null;
    }

    // Validation
    if (nextTitle.length < 2) {
      throw new ValidationError('Event title must be at least 2 characters long.');
    }

    if (isNaN(nextStart.getTime()) || isNaN(nextEnd.getTime())) {
      throw new ValidationError('Valid start and end date-times are required.');
    }

    if (nextEnd <= nextStart) {
      throw new ValidationError('Event end time must be after the start time.');
    }

    if (!isValidIanaTimeZone(nextTimezone)) {
      throw new ValidationError(`Invalid IANA time-zone identifier: "${nextTimezone}".`);
    }

    if (nextRegClose) {
      if (nextRegClose > nextStart) {
        throw new ValidationError('Registration closing time cannot be after the event start time.');
      }
      if (nextRegOpen && nextRegClose <= nextRegOpen) {
        throw new ValidationError('Registration closing time must be after opening time.');
      }
    }

    if (nextCapacity !== null && (!Number.isInteger(nextCapacity) || nextCapacity <= 0)) {
      throw new ValidationError('Capacity must be a positive integer.');
    }

    const updateSql = `
      UPDATE events
      SET
        title = $1,
        description = $2,
        event_type = $3,
        visibility = $4,
        start_at = $5,
        end_at = $6,
        timezone = $7,
        location_type = $8,
        location = $9,
        virtual_url = $10,
        registration_opens_at = $11,
        registration_closes_at = $12,
        capacity = $13,
        participant_instructions = $14,
        updated_at = NOW()
      WHERE id = $15 AND organisation_id = $16
      RETURNING *
    `;

    const res = await client.query(updateSql, [
      nextTitle,
      nextDesc,
      nextType,
      nextVisibility,
      nextStart.toISOString(),
      nextEnd.toISOString(),
      nextTimezone,
      nextLocType,
      nextLocation,
      nextVirtualUrl,
      nextRegOpen ? nextRegOpen.toISOString() : null,
      nextRegClose ? nextRegClose.toISOString() : null,
      nextCapacity,
      nextInstructions,
      eventId,
      orgId,
    ]);

    const updatedEvent = formatEventRow(res.rows[0]);

    await recordAuditEvent({
      organisationId: orgId,
      actorId,
      action: 'event.updated',
      entityType: 'event',
      entityId: eventId,
      metadata: { title: updatedEvent.title, status: updatedEvent.status },
      ipAddress,
      userAgent,
      client,
    });

    return updatedEvent;
  });
}

/**
 * Transitions event lifecycle status strictly adhering to the 7-status state machine (EVT-002).
 */
export async function transitionEventStatus(orgId, eventId, targetStatus, actorId, { ipAddress, userAgent } = {}) {
  if (!EVENT_STATUSES.includes(targetStatus)) {
    throw new ValidationError(
      `Invalid status "${targetStatus}". Must be one of: ${EVENT_STATUSES.join(', ')}.`
    );
  }

  return withTenantTransaction({ organisationId: orgId, userId: actorId }, async (client) => {
    const res = await client.query(
      'SELECT * FROM events WHERE id = $1 AND organisation_id = $2 FOR UPDATE',
      [eventId, orgId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Event not found.');
    }

    const currentEvent = res.rows[0];
    const currentStatus = currentEvent.status;

    // Idempotent transition
    if (currentStatus === targetStatus) {
      return formatEventRow(currentEvent);
    }

    // Validate state machine
    if (!isValidEventTransition(currentStatus, targetStatus)) {
      throw new ConflictError(
        `Invalid lifecycle transition from "${currentStatus}" to "${targetStatus}".`
      );
    }

    // Transition-specific guards
    if (currentStatus === 'draft' && targetStatus === 'published') {
      if (!currentEvent.title || !currentEvent.start_at || !currentEvent.end_at || !currentEvent.timezone) {
        throw new ValidationError('Cannot publish event with incomplete schedule or metadata.');
      }
    }

    const updateRes = await client.query(
      'UPDATE events SET status = $1, updated_at = NOW() WHERE id = $2 AND organisation_id = $3 RETURNING *',
      [targetStatus, eventId, orgId]
    );

    const updatedEvent = formatEventRow(updateRes.rows[0]);

    await recordAuditEvent({
      organisationId: orgId,
      actorId,
      action: 'event.status_changed',
      entityType: 'event',
      entityId: eventId,
      metadata: {
        previousStatus: currentStatus,
        newStatus: targetStatus,
        title: updatedEvent.title,
      },
      ipAddress,
      userAgent,
      client,
    });

    return updatedEvent;
  });
}

/**
 * Public listing of published public events across organisations (EVT-003).
 */
export async function listPublicEvents({ page = 1, limit = 20, search } = {}) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const boundedPage = Math.max(Number(page) || 1, 1);
  const offset = (boundedPage - 1) * boundedLimit;

  return withSystemTransaction(async (client) => {
    const conditions = ["e.status = 'published'", "e.visibility = 'public'"];
    const params = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      conditions.push(`(e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*)::int AS total FROM events e WHERE ${whereClause}`;
    const countRes = await client.query(countSql, params);
    const totalRecords = countRes.rows[0].total;
    const totalPages = Math.ceil(totalRecords / boundedLimit) || 1;

    const listSql = `
      SELECT 
        e.*,
        o.name AS org_name,
        o.slug AS org_slug
      FROM events e
      JOIN organisations o ON o.id = e.organisation_id
      WHERE ${whereClause}
      ORDER BY e.start_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(boundedLimit, offset);

    const listRes = await client.query(listSql, params);
    const events = listRes.rows.map(formatPublicEventRow);

    return {
      events,
      pagination: {
        page: boundedPage,
        limit: boundedLimit,
        totalRecords,
        totalPages,
      },
    };
  });
}

/**
 * Public retrieval of a single published public event (EVT-003).
 * Enforces status = 'published' AND visibility = 'public'.
 * Returns 404 NotFoundError if the event doesn't exist or is not public/published.
 * Does not expose participant rosters, judge lists, private submissions, or draft events.
 */
export async function getPublicEventById(eventId) {
  if (!eventId) {
    throw new NotFoundError('Event not found or is not publicly accessible.');
  }

  return withSystemTransaction(async (client) => {
    const isUuid = UUID_REGEX.test(eventId);
    const sql = isUuid
      ? `
        SELECT 
          e.*,
          o.name AS org_name,
          o.slug AS org_slug
        FROM events e
        JOIN organisations o ON o.id = e.organisation_id
        WHERE e.id = $1
          AND e.status = 'published'
          AND e.visibility = 'public'
      `
      : `
        SELECT 
          e.*,
          o.name AS org_name,
          o.slug AS org_slug
        FROM events e
        JOIN organisations o ON o.id = e.organisation_id
        WHERE e.slug = $1
          AND e.status = 'published'
          AND e.visibility = 'public'
      `;

    const res = await client.query(sql, [eventId]);
    if (res.rows.length === 0) {
      throw new NotFoundError('Event not found or is not publicly accessible.');
    }

    return formatPublicEventRow(res.rows[0]);
  });
}

function formatRegistrationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    eventId: row.event_id,
    userId: row.user_id,
    status: row.status,
    registeredAt: row.registered_at ? row.registered_at.toISOString() : null,
    withdrawnAt: row.withdrawn_at ? row.withdrawn_at.toISOString() : null,
    reactivatedAt: row.reactivated_at ? row.reactivated_at.toISOString() : null,
    customAnswers: row.custom_answers || {},
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    participantInstructions:
      row.participant_instructions !== undefined ? row.participant_instructions : undefined,
    user: row.user_email
      ? {
          id: row.user_id,
          email: row.user_email,
          fullName: row.user_full_name,
        }
      : undefined,
  };
}

/**
 * Calculates the effective registration window for an event (EVT-005, ADR-008).
 * - If registration_opens_at is null, effective opening is publication instant (or event created_at).
 * - If registration_closes_at is null, effective closing is event start_at.
 */
export function getEffectiveRegistrationWindow(event) {
  const opensAt = event.registration_opens_at || event.published_at || event.created_at;
  const closesAt = event.registration_closes_at || event.end_at || event.start_at;
  return {
    effectiveOpensAt: new Date(opensAt),
    effectiveClosesAt: new Date(closesAt),
  };
}

/**
 * Register the authenticated user for an event (EVT-004, EVT-005).
 * - Event must be published (other statuses reject).
 * - Current instant must be within [effectiveOpensAt, effectiveClosesAt].
 * - Enforces capacity transactionally under concurrency with FOR UPDATE lock.
 * - If previously withdrawn, reactivates the registration row preserving original registered_at.
 */
export async function registerForEvent(
  organisationId,
  eventId,
  userId,
  customAnswers = {},
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId }, async (client) => {
    // 1. Lock the event row for concurrency-safe capacity check
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];

    // 2. Event status check: ONLY 'published' allows registrations
    if (event.status !== 'published') {
      throw new ConflictError(
        `Registration is closed because this event is currently ${event.status}.`,
        'REGISTRATION_NOT_AVAILABLE'
      );
    }

    // 3. Time window check
    const now = new Date();
    const { effectiveOpensAt, effectiveClosesAt } = getEffectiveRegistrationWindow(event);

    if (now < effectiveOpensAt) {
      throw new ConflictError(
        'Registration has not opened yet for this event.',
        'REGISTRATION_NOT_OPEN'
      );
    }

    if (now > effectiveClosesAt) {
      throw new ConflictError(
        'Registration window has closed for this event.',
        'REGISTRATION_CLOSED'
      );
    }

    // 4. Check existing registration record for this user
    const existingRes = await client.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 FOR UPDATE`,
      [eventId, userId]
    );

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.status === 'registered') {
        throw new ConflictError(
          'You are already registered for this event.',
          'ALREADY_REGISTERED'
        );
      }

      // 4b. Capacity check before reactivating
      if (event.capacity) {
        const countRes = await client.query(
          `SELECT COUNT(*)::int AS count FROM event_registrations WHERE event_id = $1 AND status = 'registered'`,
          [eventId]
        );
        const currentActive = countRes.rows[0].count;
        if (currentActive >= event.capacity) {
          throw new ConflictError(
            'This event has reached its maximum participant capacity.',
            'EVENT_CAPACITY_FULL'
          );
        }
      }

      // Reactivate existing registration (EVT-005)
      const updateRes = await client.query(
        `
        UPDATE event_registrations
        SET status = 'registered',
            reactivated_at = NOW(),
            withdrawn_at = NULL,
            custom_answers = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
        [JSON.stringify(customAnswers || {}), existing.id]
      );

      const reactivated = updateRes.rows[0];

      await recordAuditEvent({
        organisationId,
        actorId: userId,
        action: 'event.participant.registered',
        entityType: 'event_registration',
        entityId: reactivated.id,
        metadata: {
          eventId,
          eventTitle: event.title,
          reactivated: true,
        },
        ipAddress,
        userAgent,
        client,
      });

      reactivated.participant_instructions = event.participant_instructions;
      return formatRegistrationRow(reactivated);
    }

    // 5. Check capacity for new registration
    if (event.capacity) {
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM event_registrations WHERE event_id = $1 AND status = 'registered'`,
        [eventId]
      );
      const currentActive = countRes.rows[0].count;
      if (currentActive >= event.capacity) {
        throw new ConflictError(
          'This event has reached its maximum participant capacity.',
          'EVENT_CAPACITY_FULL'
        );
      }
    }

    // 6. Insert new registration row
    const insertRes = await client.query(
      `
      INSERT INTO event_registrations (
        organisation_id,
        event_id,
        user_id,
        status,
        registered_at,
        custom_answers
      )
      VALUES ($1, $2, $3, 'registered', NOW(), $4)
      RETURNING *
    `,
      [organisationId, eventId, userId, JSON.stringify(customAnswers || {})]
    );

    const created = insertRes.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: 'event.participant.registered',
      entityType: 'event_registration',
      entityId: created.id,
      metadata: {
        eventId,
        eventTitle: event.title,
        reactivated: false,
      },
      ipAddress,
      userAgent,
      client,
    });

    created.participant_instructions = event.participant_instructions;
    return formatRegistrationRow(created);
  });
}

/**
 * Withdraw an existing event registration (EVT-005).
 * - Registration must exist and be in 'registered' status.
 * - Allowed only while the registration window permits it.
 */
export async function withdrawRegistration(
  organisationId,
  eventId,
  userId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId }, async (client) => {
    // 1. Fetch event to verify registration window
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];

    // Statuses beyond 'published' or after window close reject withdrawal
    const now = new Date();
    const { effectiveClosesAt } = getEffectiveRegistrationWindow(event);

    if (event.status !== 'published' || now > effectiveClosesAt) {
      throw new ConflictError(
        'Registrations cannot be withdrawn after the registration window has closed.',
        'WITHDRAWAL_WINDOW_CLOSED'
      );
    }

    // 2. Fetch and lock registration
    const regRes = await client.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 FOR UPDATE`,
      [eventId, userId]
    );

    if (regRes.rows.length === 0) {
      throw new NotFoundError('No registration record found for this event.', 'REGISTRATION_NOT_FOUND');
    }

    const registration = regRes.rows[0];

    if (registration.status === 'withdrawn') {
      throw new ConflictError('Registration is already withdrawn.', 'ALREADY_WITHDRAWN');
    }

    // 3. Mark status as 'withdrawn' and preserve record for history
    const updateRes = await client.query(
      `
      UPDATE event_registrations
      SET status = 'withdrawn',
          withdrawn_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
      [registration.id]
    );

    const withdrawn = updateRes.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: 'event.participant.withdrawn',
      entityType: 'event_registration',
      entityId: withdrawn.id,
      metadata: {
        eventId,
        eventTitle: event.title,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatRegistrationRow(withdrawn);
  });
}

/**
 * Get the current user's registration status for an event (EVT-004).
 */
export async function getRegistrationStatus(organisationId, eventId, userId) {
  return withTenantTransaction({ organisationId, userId }, async (client) => {
    const regRes = await client.query(
      `
      SELECT 
        r.*,
        u.email AS user_email,
        u.full_name AS user_full_name,
        CASE WHEN r.status = 'registered' THEN e.participant_instructions ELSE NULL END AS participant_instructions
      FROM event_registrations r
      JOIN users u ON u.id = r.user_id
      JOIN events e ON e.id = r.event_id AND e.organisation_id = r.organisation_id
      WHERE r.event_id = $1 AND r.user_id = $2 AND r.organisation_id = $3
    `,
      [eventId, userId, organisationId]
    );

    if (regRes.rows.length === 0) {
      return null;
    }

    return formatRegistrationRow(regRes.rows[0]);
  });
}

/**
 * List participants for an event (Staff only: requires event.participant.manage or event.view).
 * - Bounded pagination, search by user name/email, filter by registration status.
 */
export async function listEventParticipants(
  organisationId,
  eventId,
  { page = 1, limit = 20, status, search } = {}
) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const boundedPage = Math.max(Number(page) || 1, 1);
  const offset = (boundedPage - 1) * boundedLimit;

  return withTenantTransaction({ organisationId }, async (client) => {
    // Verify event belongs to tenant
    const eventRes = await client.query(
      `SELECT id, title, capacity FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const conditions = ['r.event_id = $1', 'r.organisation_id = $2'];
    const params = [eventId, organisationId];
    let paramIndex = 3;

    if (status && (status === 'registered' || status === 'withdrawn')) {
      conditions.push(`r.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (search && search.trim()) {
      conditions.push(`(u.full_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM event_registrations r
      JOIN users u ON u.id = r.user_id
      WHERE ${whereClause}
    `;
    const countRes = await client.query(countSql, params);
    const totalRecords = countRes.rows[0].total;
    const totalPages = Math.ceil(totalRecords / boundedLimit) || 1;

    // 2. Active registered count
    const activeRes = await client.query(
      `SELECT COUNT(*)::int AS active_count FROM event_registrations WHERE event_id = $1 AND status = 'registered'`,
      [eventId]
    );
    const activeCount = activeRes.rows[0].active_count;

    // 3. Paginated list
    const listSql = `
      SELECT 
        r.*,
        u.email AS user_email,
        u.full_name AS user_full_name
      FROM event_registrations r
      JOIN users u ON u.id = r.user_id
      WHERE ${whereClause}
      ORDER BY r.registered_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(boundedLimit, offset);

    const listRes = await client.query(listSql, params);
    const participants = listRes.rows.map(formatRegistrationRow);

    return {
      participants,
      summary: {
        activeCount,
        capacity: eventRes.rows[0].capacity,
      },
      pagination: {
        page: boundedPage,
        limit: boundedLimit,
        totalRecords,
        totalPages,
      },
    };
  });
}

/**
 * Retrieves the comprehensive student/participant dashboard data for an authenticated user.
 * Strictly adheres to EVT-004, EVT-006, EVT-007, EVT-010, and tenant isolation invariants.
 */
export async function getParticipantDashboard(userId) {
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  return withSystemTransaction(async (client) => {
    // 1. Fetch user's registrations along with event details
    const regRes = await client.query(
      `
      SELECT 
        r.id AS registration_id,
        r.status AS registration_status,
        r.registered_at,
        r.withdrawn_at,
        r.reactivated_at,
        r.custom_answers,
        e.id AS event_id,
        e.organisation_id,
        e.title,
        e.slug,
        e.description,
        e.event_type,
        e.status AS event_status,
        e.visibility,
        e.start_at,
        e.end_at,
        e.timezone,
        e.location_type,
        e.location,
        e.virtual_url,
        e.registration_opens_at,
        e.registration_closes_at,
        e.submission_opens_at,
        e.submission_closes_at,
        e.results_published_at,
        CASE WHEN r.status = 'registered' THEN e.participant_instructions ELSE NULL END AS participant_instructions,
        o.name AS org_name,
        o.slug AS org_slug
      FROM event_registrations r
      JOIN events e ON e.id = r.event_id
      JOIN organisations o ON o.id = e.organisation_id
      WHERE r.user_id = $1
      ORDER BY e.start_at ASC
    `,
      [userId]
    );

    const items = [];

    for (const row of regRes.rows) {
      const eventId = row.event_id;

      // 2. Hackathon Team (if applicable)
      let team = null;
      if (row.event_type === 'hackathon') {
        const teamRes = await client.query(
          `
          SELECT 
            t.id,
            t.name,
            t.slug,
            t.description,
            t.created_by_id,
            tm.is_owner,
            tm.joined_at
          FROM event_team_members tm
          JOIN event_teams t ON t.id = tm.team_id
          WHERE tm.event_id = $1 AND tm.user_id = $2
          LIMIT 1
        `,
          [eventId, userId]
        );

        if (teamRes.rows.length > 0) {
          const tRow = teamRes.rows[0];
          const membersRes = await client.query(
            `
            SELECT 
              tm.user_id,
              tm.is_owner,
              tm.joined_at,
              u.full_name,
              u.email
            FROM event_team_members tm
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1
            ORDER BY tm.is_owner DESC, tm.joined_at ASC
          `,
            [tRow.id]
          );

          team = {
            id: tRow.id,
            name: tRow.name,
            slug: tRow.slug,
            description: tRow.description,
            isOwner: tRow.is_owner,
            members: membersRes.rows.map((m) => ({
              userId: m.user_id,
              fullName: m.full_name,
              email: m.email,
              isOwner: m.is_owner,
              joinedAt: m.joined_at ? m.joined_at.toISOString() : null,
            })),
          };
        }
      }

      // 3. Rounds list
      const roundsRes = await client.query(
        `
        SELECT id, round_number, name, description, submission_opens_at, submission_closes_at, advancement_rule, status
        FROM event_rounds
        WHERE event_id = $1
        ORDER BY round_number ASC
      `,
        [eventId]
      );

      const rounds = roundsRes.rows.map((r) => ({
        id: r.id,
        roundNumber: r.round_number,
        name: r.name,
        description: r.description,
        submissionOpensAt: r.submission_opens_at ? r.submission_opens_at.toISOString() : null,
        submissionClosesAt: r.submission_closes_at ? r.submission_closes_at.toISOString() : null,
        advancementRule: r.advancement_rule,
        status: r.status,
      }));

      // 4. Submissions by this user or team
      const teamId = team ? team.id : null;
      const subParams = [eventId, userId];
      let subQuery = `
        SELECT 
          s.id,
          s.round_id,
          s.team_id,
          s.submitter_user_id,
          s.title,
          s.description,
          s.repository_url,
          s.demo_url,
          s.status,
          s.submitted_at,
          s.updated_at,
          er.round_number,
          er.name AS round_name
        FROM event_submissions s
        LEFT JOIN event_rounds er ON er.id = s.round_id
        WHERE s.event_id = $1
          AND (s.submitter_user_id = $2 ${teamId ? 'OR s.team_id = $3' : ''})
        ORDER BY s.submitted_at DESC
      `;
      if (teamId) subParams.push(teamId);

      const subsRes = await client.query(subQuery, subParams);
      const submissions = subsRes.rows.map((s) => ({
        id: s.id,
        roundId: s.round_id,
        roundNumber: s.round_number,
        roundName: s.round_name,
        teamId: s.team_id,
        submitterUserId: s.submitter_user_id,
        title: s.title,
        description: s.description,
        repositoryUrl: s.repository_url,
        demoUrl: s.demo_url,
        status: s.status,
        submittedAt: s.submitted_at ? s.submitted_at.toISOString() : null,
        updatedAt: s.updated_at ? s.updated_at.toISOString() : null,
      }));

      // 5. Advancements
      const advParams = [eventId, userId];
      let advQuery = `
        SELECT 
          a.id,
          a.round_id,
          a.status,
          a.qualification_rank,
          a.is_manual,
          a.created_at,
          er.round_number,
          er.name AS round_name
        FROM event_round_advancements a
        JOIN event_rounds er ON er.id = a.round_id
        WHERE a.event_id = $1
          AND (a.participant_user_id = $2 ${teamId ? 'OR a.team_id = $3' : ''})
        ORDER BY er.round_number ASC
      `;
      if (teamId) advParams.push(teamId);

      const advRes = await client.query(advQuery, advParams);
      const advancements = advRes.rows.map((a) => ({
        id: a.id,
        roundId: a.round_id,
        roundNumber: a.round_number,
        roundName: a.round_name,
        status: a.status,
        qualificationRank: a.qualification_rank,
        isManual: a.is_manual,
        createdAt: a.created_at ? a.created_at.toISOString() : null,
      }));

      items.push({
        registration: {
          id: row.registration_id,
          status: row.registration_status,
          registeredAt: row.registered_at ? row.registered_at.toISOString() : null,
          withdrawnAt: row.withdrawn_at ? row.withdrawn_at.toISOString() : null,
          reactivatedAt: row.reactivated_at ? row.reactivated_at.toISOString() : null,
          customAnswers: row.custom_answers || {},
          participantInstructions: row.participant_instructions || null,
        },
        event: {
          id: row.event_id,
          organisationId: row.organisation_id,
          title: row.title,
          slug: row.slug,
          description: row.description,
          eventType: row.event_type,
          status: row.event_status,
          visibility: row.visibility,
          startAt: row.start_at ? row.start_at.toISOString() : null,
          endAt: row.end_at ? row.end_at.toISOString() : null,
          timezone: row.timezone,
          locationType: row.location_type,
          location: row.location,
          virtualUrl: row.virtual_url,
          registrationOpensAt: row.registration_opens_at ? row.registration_opens_at.toISOString() : null,
          registrationClosesAt: row.registration_closes_at ? row.registration_closes_at.toISOString() : null,
          submissionOpensAt: row.submission_opens_at ? row.submission_opens_at.toISOString() : null,
          submissionClosesAt: row.submission_closes_at ? row.submission_closes_at.toISOString() : null,
          resultsPublishedAt: row.results_published_at ? row.results_published_at.toISOString() : null,
          organisation: {
            name: row.org_name,
            slug: row.org_slug,
          },
        },
        team,
        rounds,
        submissions,
        advancements,
        resultsPublished: Boolean(row.results_published_at),
      });
    }

    return { registrations: items };
  });
}


