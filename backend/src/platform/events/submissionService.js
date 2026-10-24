/**
 * ManageX URL-Based Submissions Service
 * Strictly adheres to PRD Section 7.3 (EVT-007).
 * 
 * Rules:
 * - Validate http/https URLs and lengths.
 * - Do NOT fetch or probe user-provided URLs from backend (SSRF prevention).
 * - One submission per team (or solo participant) with edits allowed during the submission window.
 * - No file uploads or attachments.
 */

import { withTenantTransaction } from '../database/transaction.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../common/errors.js';
import { recordAuditEvent } from '../audit/auditService.js';

function isValidHttpUrl(string) {
  if (!string) return true;
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatSubmissionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    eventId: row.event_id,
    roundId: row.round_id || null,
    teamId: row.team_id || null,
    teamName: row.team_name || null,
    submitterUserId: row.submitter_user_id,
    submitterName: row.submitter_name || null,
    submitterEmail: row.submitter_email || null,
    title: row.title,
    description: row.description,
    repositoryUrl: row.repository_url,
    demoUrl: row.demo_url,
    customFields: row.custom_fields || {},
    status: row.status,
    submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

/**
 * Creates or updates an event project submission (EVT-007).
 */
export async function createOrUpdateSubmission(
  organisationId,
  eventId,
  userId,
  { title, description, repositoryUrl, demoUrl, customFields = {} },
  { ipAddress, userAgent } = {}
) {
  if (!title || !title.trim()) {
    throw new ValidationError('Submission title is required.');
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length > 255) {
    throw new ValidationError('Submission title cannot exceed 255 characters.');
  }

  if (repositoryUrl && !isValidHttpUrl(repositoryUrl)) {
    throw new ValidationError('Repository URL must be a valid HTTP or HTTPS address.');
  }

  if (demoUrl && !isValidHttpUrl(demoUrl)) {
    throw new ValidationError('Demo URL must be a valid HTTP or HTTPS address.');
  }

  return withTenantTransaction({ organisationId, userId }, async (client) => {
    // 1. Fetch Event and check submission window and status
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];

    // Status check: must be published or in_progress
    if (!['published', 'in_progress'].includes(event.status)) {
      throw new ConflictError(
        `Submissions are not accepted because event is ${event.status}.`,
        'SUBMISSIONS_LOCKED'
      );
    }

    // Window check
    const now = new Date();
    if (event.submission_opens_at && now < new Date(event.submission_opens_at)) {
      throw new ConflictError(
        'Submission window has not opened yet.',
        'SUBMISSION_NOT_OPEN'
      );
    }

    if (event.submission_closes_at && now > new Date(event.submission_closes_at)) {
      throw new ConflictError(
        'Submission window has closed for this event.',
        'SUBMISSION_CLOSED'
      );
    }

    // 2. Submitter must be a registered participant
    const regRes = await client.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 AND status = 'registered'`,
      [eventId, userId]
    );

    if (regRes.rows.length === 0) {
      throw new AuthorizationError(
        'You must be a registered participant to submit a project.',
        'REGISTRATION_REQUIRED'
      );
    }

    // 3. For Hackathon events, determine team membership
    let teamId = null;
    if (event.event_type === 'hackathon') {
      const memberRes = await client.query(
        `SELECT team_id FROM event_team_members WHERE event_id = $1 AND user_id = $2`,
        [eventId, userId]
      );

      if (memberRes.rows.length === 0) {
        throw new ConflictError(
          'You must be a member of a team to submit a project for this hackathon.',
          'TEAM_MEMBERSHIP_REQUIRED'
        );
      }

      teamId = memberRes.rows[0].team_id;
    }

    // Determine default Round 1 if available
    const round1Res = await client.query(
      `SELECT id FROM event_rounds WHERE event_id = $1 AND round_number = 1`,
      [eventId]
    );
    const round1Id = round1Res.rows[0]?.id || null;

    // 4. Check for existing submission
    let existingRes;
    if (teamId) {
      existingRes = await client.query(
        `SELECT * FROM event_submissions WHERE event_id = $1 AND (round_id = $2 OR $2 IS NULL) AND team_id = $3 FOR UPDATE`,
        [eventId, round1Id, teamId]
      );
    } else {
      existingRes = await client.query(
        `SELECT * FROM event_submissions WHERE event_id = $1 AND (round_id = $2 OR $2 IS NULL) AND submitter_user_id = $3 AND team_id IS NULL FOR UPDATE`,
        [eventId, round1Id, userId]
      );
    }

    let submission;
    let isUpdate = false;

    if (existingRes.rows.length > 0) {
      // Update existing submission
      isUpdate = true;
      const existing = existingRes.rows[0];

      const updateRes = await client.query(
        `
        UPDATE event_submissions
        SET
          title = $1,
          description = $2,
          repository_url = $3,
          demo_url = $4,
          custom_fields = $5,
          updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `,
        [
          trimmedTitle,
          description ? description.trim() : null,
          repositoryUrl ? repositoryUrl.trim() : null,
          demoUrl ? demoUrl.trim() : null,
          JSON.stringify(customFields || {}),
          existing.id,
        ]
      );

      submission = updateRes.rows[0];
    } else {
      // Insert new submission
      const insertRes = await client.query(
        `
        INSERT INTO event_submissions (
          organisation_id,
          event_id,
          round_id,
          team_id,
          submitter_user_id,
          title,
          description,
          repository_url,
          demo_url,
          custom_fields
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
        [
          organisationId,
          eventId,
          round1Id,
          teamId,
          userId,
          trimmedTitle,
          description ? description.trim() : null,
          repositoryUrl ? repositoryUrl.trim() : null,
          demoUrl ? demoUrl.trim() : null,
          JSON.stringify(customFields || {}),
        ]
      );

      submission = insertRes.rows[0];
    }

    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: isUpdate ? 'event.submission.updated' : 'event.submission.created',
      entityType: 'event_submission',
      entityId: submission.id,
      metadata: {
        eventId,
        teamId,
        submissionTitle: submission.title,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatSubmissionRow(submission);
  });
}

/**
 * Gets submission for the current user's team or individual participant.
 */
export async function getMySubmission(organisationId, eventId, userId) {
  return withTenantTransaction({ organisationId, userId }, async (client) => {
    // Check team membership first
    const memberRes = await client.query(
      `SELECT team_id FROM event_team_members WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );

    let query;
    let params;

    if (memberRes.rows.length > 0) {
      const teamId = memberRes.rows[0].team_id;
      query = `
        SELECT s.*, t.name AS team_name, u.full_name AS submitter_name, u.email AS submitter_email
        FROM event_submissions s
        LEFT JOIN event_teams t ON t.id = s.team_id
        LEFT JOIN users u ON u.id = s.submitter_user_id
        WHERE s.event_id = $1 AND s.team_id = $2
        ORDER BY s.submitted_at DESC
        LIMIT 1
      `;
      params = [eventId, teamId];
    } else {
      query = `
        SELECT s.*, t.name AS team_name, u.full_name AS submitter_name, u.email AS submitter_email
        FROM event_submissions s
        LEFT JOIN event_teams t ON t.id = s.team_id
        LEFT JOIN users u ON u.id = s.submitter_user_id
        WHERE s.event_id = $1 AND s.submitter_user_id = $2 AND s.team_id IS NULL
        ORDER BY s.submitted_at DESC
        LIMIT 1
      `;
      params = [eventId, userId];
    }

    const res = await client.query(query, params);
    if (res.rows.length === 0) {
      return null;
    }

    const sub = formatSubmissionRow(res.rows[0]);

    // Check own qualification status in round if applicable (Phase 02D)
    if (res.rows[0].round_id) {
      const advRes = await client.query(
        `SELECT status FROM event_round_advancements WHERE round_id = $1 AND (team_id = $2 OR (participant_user_id = $3 AND team_id IS NULL))`,
        [res.rows[0].round_id, res.rows[0].team_id || null, res.rows[0].submitter_user_id]
      );
      sub.qualificationStatus = advRes.rows.length > 0 ? advRes.rows[0].status : null;
    }

    return sub;
  });
}

/**
 * Creates or updates an event project submission scoped to a specific competition round (EVT-010).
 * Server strictly verifies round eligibility (Round 1: open to all; Round N: requires qualification in Round N-1).
 */
export async function createOrUpdateRoundSubmission(
  organisationId,
  eventId,
  roundId,
  userId,
  { title, description, repositoryUrl, demoUrl, customFields = {} },
  { ipAddress, userAgent } = {}
) {
  if (!title || !title.trim()) {
    throw new ValidationError('Submission title is required.');
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length > 255) {
    throw new ValidationError('Submission title cannot exceed 255 characters.');
  }

  if (repositoryUrl && !isValidHttpUrl(repositoryUrl)) {
    throw new ValidationError('Repository URL must be a valid HTTP or HTTPS address.');
  }

  if (demoUrl && !isValidHttpUrl(demoUrl)) {
    throw new ValidationError('Demo URL must be a valid HTTP or HTTPS address.');
  }

  return withTenantTransaction({ organisationId, userId }, async (client) => {
    // 1. Fetch Event
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];

    if (!['published', 'in_progress'].includes(event.status)) {
      throw new ConflictError(
        `Submissions are not accepted because event is ${event.status}.`,
        'SUBMISSIONS_LOCKED'
      );
    }

    // 2. Fetch Round and check round lifecycle
    const roundRes = await client.query(
      `SELECT * FROM event_rounds WHERE id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );

    if (roundRes.rows.length === 0) {
      throw new NotFoundError('Competition round not found for this event.', 'ROUND_NOT_FOUND');
    }

    const round = roundRes.rows[0];

    if (round.status === 'completed') {
      throw new ConflictError('Submissions are closed for this completed round.', 'ROUND_CLOSED');
    }

    if (round.status === 'pending') {
      throw new ConflictError('Round is not yet open for submissions.', 'ROUND_NOT_OPEN');
    }

    // Window check: use round-specific window if defined, otherwise fallback to event window
    const now = new Date();
    const opensAt = round.submission_opens_at || event.submission_opens_at;
    const closesAt = round.submission_closes_at || event.submission_closes_at;

    if (opensAt && now < new Date(opensAt)) {
      throw new ConflictError('Submission window has not opened yet.', 'SUBMISSION_NOT_OPEN');
    }

    if (closesAt && now > new Date(closesAt)) {
      throw new ConflictError('Submission window has closed for this round.', 'SUBMISSION_CLOSED');
    }

    // 3. Submitter must be a registered participant
    const regRes = await client.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 AND status = 'registered'`,
      [eventId, userId]
    );

    if (regRes.rows.length === 0) {
      throw new AuthorizationError(
        'You must be a registered participant to submit a project.',
        'REGISTRATION_REQUIRED'
      );
    }

    // 4. For Hackathon events, determine team membership
    let teamId = null;
    if (event.event_type === 'hackathon') {
      const memberRes = await client.query(
        `SELECT team_id FROM event_team_members WHERE event_id = $1 AND user_id = $2`,
        [eventId, userId]
      );

      if (memberRes.rows.length === 0) {
        throw new ConflictError(
          'You must be a member of a team to submit a project for this hackathon.',
          'TEAM_MEMBERSHIP_REQUIRED'
        );
      }

      teamId = memberRes.rows[0].team_id;
    }

    // 5. Server-Enforced Round Eligibility (PRD Section 7, EVT-010)
    // Round 1: Any registered participant is eligible.
    // Round N (N > 1): Must have qualified in previous round (round_number - 1).
    if (round.round_number > 1) {
      const prevRoundRes = await client.query(
        `SELECT id, round_number FROM event_rounds WHERE event_id = $1 AND round_number = $2`,
        [eventId, round.round_number - 1]
      );

      if (prevRoundRes.rows.length > 0) {
        const prevRound = prevRoundRes.rows[0];
        let qualCheck;
        if (teamId) {
          qualCheck = await client.query(
            `SELECT id, status FROM event_round_advancements WHERE round_id = $1 AND team_id = $2`,
            [prevRound.id, teamId]
          );
        } else {
          qualCheck = await client.query(
            `SELECT id, status FROM event_round_advancements WHERE round_id = $1 AND participant_user_id = $2`,
            [prevRound.id, userId]
          );
        }

        if (qualCheck.rows.length === 0 || qualCheck.rows[0].status !== 'qualified') {
          throw new AuthorizationError(
            'Participant or team has not qualified for this competition round.',
            'ROUND_NOT_ELIGIBLE'
          );
        }
      }
    }

    // 6. Check for existing submission in this round
    let existingRes;
    if (teamId) {
      existingRes = await client.query(
        `SELECT * FROM event_submissions WHERE round_id = $1 AND team_id = $2 FOR UPDATE`,
        [roundId, teamId]
      );
    } else {
      existingRes = await client.query(
        `SELECT * FROM event_submissions WHERE round_id = $1 AND submitter_user_id = $2 AND team_id IS NULL FOR UPDATE`,
        [roundId, userId]
      );
    }

    let submission;
    let isUpdate = false;

    if (existingRes.rows.length > 0) {
      isUpdate = true;
      const existing = existingRes.rows[0];

      const updateRes = await client.query(
        `
        UPDATE event_submissions
        SET
          title = $1,
          description = $2,
          repository_url = $3,
          demo_url = $4,
          custom_fields = $5,
          updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `,
        [
          trimmedTitle,
          description ? description.trim() : null,
          repositoryUrl ? repositoryUrl.trim() : null,
          demoUrl ? demoUrl.trim() : null,
          JSON.stringify(customFields || {}),
          existing.id,
        ]
      );

      submission = updateRes.rows[0];
    } else {
      const insertRes = await client.query(
        `
        INSERT INTO event_submissions (
          organisation_id,
          event_id,
          round_id,
          team_id,
          submitter_user_id,
          title,
          description,
          repository_url,
          demo_url,
          custom_fields
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
        [
          organisationId,
          eventId,
          roundId,
          teamId,
          userId,
          trimmedTitle,
          description ? description.trim() : null,
          repositoryUrl ? repositoryUrl.trim() : null,
          demoUrl ? demoUrl.trim() : null,
          JSON.stringify(customFields || {}),
        ]
      );

      submission = insertRes.rows[0];
    }

    await recordAuditEvent({
      organisationId,
      actorId: userId,
      action: isUpdate ? 'event.round_submission.updated' : 'event.round_submission.created',
      entityType: 'event_submission',
      entityId: submission.id,
      metadata: {
        eventId,
        roundId,
        roundNumber: round.round_number,
        teamId,
        submissionTitle: submission.title,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatSubmissionRow(submission);
  });
}

/**
 * Gets submission for a user's team or individual participant scoped to a round.
 */
export async function getMyRoundSubmission(organisationId, eventId, roundId, userId) {
  return withTenantTransaction({ organisationId, userId }, async (client) => {
    const memberRes = await client.query(
      `SELECT team_id FROM event_team_members WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );

    let query;
    let params;

    if (memberRes.rows.length > 0) {
      const teamId = memberRes.rows[0].team_id;
      query = `
        SELECT s.*, t.name AS team_name, u.full_name AS submitter_name, u.email AS submitter_email
        FROM event_submissions s
        LEFT JOIN event_teams t ON t.id = s.team_id
        LEFT JOIN users u ON u.id = s.submitter_user_id
        WHERE s.event_id = $1 AND s.round_id = $2 AND s.team_id = $3
      `;
      params = [eventId, roundId, teamId];
    } else {
      query = `
        SELECT s.*, t.name AS team_name, u.full_name AS submitter_name, u.email AS submitter_email
        FROM event_submissions s
        LEFT JOIN event_teams t ON t.id = s.team_id
        LEFT JOIN users u ON u.id = s.submitter_user_id
        WHERE s.event_id = $1 AND s.round_id = $2 AND s.submitter_user_id = $3 AND s.team_id IS NULL
      `;
      params = [eventId, roundId, userId];
    }

    const res = await client.query(query, params);
    if (res.rows.length === 0) {
      return null;
    }

    const sub = formatSubmissionRow(res.rows[0]);

    // Check own qualification status in round if applicable (Phase 02D)
    if (res.rows[0].round_id) {
      const advRes = await client.query(
        `SELECT status FROM event_round_advancements WHERE round_id = $1 AND (team_id = $2 OR (participant_user_id = $3 AND team_id IS NULL))`,
        [res.rows[0].round_id, res.rows[0].team_id || null, res.rows[0].submitter_user_id]
      );
      sub.qualificationStatus = advRes.rows.length > 0 ? advRes.rows[0].status : null;
    }

    return sub;
  });
}

/**
 * Lists submissions for a specific round (Organiser view).
 */
export async function listRoundSubmissions(
  organisationId,
  eventId,
  roundId,
  { page = 1, limit = 50 } = {}
) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const boundedPage = Math.max(Number(page) || 1, 1);
  const offset = (boundedPage - 1) * boundedLimit;

  return withTenantTransaction({ organisationId }, async (client) => {
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM event_submissions WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );
    const totalRecords = countRes.rows[0].total;
    const totalPages = Math.ceil(totalRecords / boundedLimit) || 1;

    const listRes = await client.query(
      `
      SELECT 
        s.*,
        t.name AS team_name,
        u.full_name AS submitter_name,
        u.email AS submitter_email
      FROM event_submissions s
      LEFT JOIN event_teams t ON t.id = s.team_id
      LEFT JOIN users u ON u.id = s.submitter_user_id
      WHERE s.round_id = $1 AND s.event_id = $2 AND s.organisation_id = $3
      ORDER BY s.submitted_at ASC
      LIMIT $4 OFFSET $5
    `,
      [roundId, eventId, organisationId, boundedLimit, offset]
    );

    const submissions = listRes.rows.map(formatSubmissionRow);

    return {
      submissions,
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
 * Lists all submissions for an event (Staff / Organiser view).
 */
export async function listEventSubmissions(
  organisationId,
  eventId,
  { page = 1, limit = 20 } = {}
) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const boundedPage = Math.max(Number(page) || 1, 1);
  const offset = (boundedPage - 1) * boundedLimit;

  return withTenantTransaction({ organisationId }, async (client) => {
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM event_submissions WHERE event_id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );
    const totalRecords = countRes.rows[0].total;
    const totalPages = Math.ceil(totalRecords / boundedLimit) || 1;

    const listRes = await client.query(
      `
      SELECT 
        s.*,
        t.name AS team_name,
        u.full_name AS submitter_name,
        u.email AS submitter_email
      FROM event_submissions s
      LEFT JOIN event_teams t ON t.id = s.team_id
      LEFT JOIN users u ON u.id = s.submitter_user_id
      WHERE s.event_id = $1 AND s.organisation_id = $2
      ORDER BY s.submitted_at ASC
      LIMIT $3 OFFSET $4
    `,
      [eventId, organisationId, boundedLimit, offset]
    );

    const submissions = listRes.rows.map(formatSubmissionRow);

    return {
      submissions,
      pagination: {
        page: boundedPage,
        limit: boundedLimit,
        total: totalRecords,
        totalPages,
      },
    };
  });
}
