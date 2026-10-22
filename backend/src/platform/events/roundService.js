/**
-- ==============================================================================
-- ManageX Multi-Round Hackathon Service
-- Phase 02B: Round Lifecycle, Configuration & Tenant Isolation
-- Strictly adheres to docs/security.md, ADR-001, ADR-003, and PRD Section 7.
-- ==============================================================================
*/

import { withTenantTransaction, withSystemTransaction } from '../database/transaction.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../common/errors.js';
import { recordAuditEvent } from '../audit/auditService.js';

export function formatRoundRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    eventId: row.event_id,
    roundNumber: Number(row.round_number),
    name: row.name,
    description: row.description || null,
    instructions: row.instructions || null,
    submissionOpensAt: row.submission_opens_at ? row.submission_opens_at.toISOString() : null,
    submissionClosesAt: row.submission_closes_at ? row.submission_closes_at.toISOString() : null,
    advancementRule: row.advancement_rule,
    advancementThreshold: row.advancement_threshold != null ? Number(row.advancement_threshold) : null,
    advancementTopN: row.advancement_top_n != null ? Number(row.advancement_top_n) : null,
    status: row.status,
    resultsPublishedAt: row.results_published_at ? row.results_published_at.toISOString() : null,
    resultsPublishedById: row.results_published_by_id || null,
    resultsScheduledAt: row.results_scheduled_at ? row.results_scheduled_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    submissionCount: row.submission_count != null ? Number(row.submission_count) : undefined,
    criteriaCount: row.criteria_count != null ? Number(row.criteria_count) : undefined,
    advancementCount: row.advancement_count != null ? Number(row.advancement_count) : undefined,
  };
}

/**
 * Lists all rounds for an event, ordered by round_number ascending.
 */
export async function listEventRounds(organisationId, eventId) {
  return withTenantTransaction({ organisationId }, async (client) => {
    // 1. Verify Event exists
    const eventRes = await client.query(
      `SELECT id FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    // 2. Fetch rounds with counts
    const query = `
      SELECT
        r.*,
        COUNT(DISTINCT s.id)::int AS submission_count,
        COUNT(DISTINCT c.id)::int AS criteria_count,
        COUNT(DISTINCT a.id)::int AS advancement_count
      FROM event_rounds r
      LEFT JOIN event_submissions s ON s.round_id = r.id
      LEFT JOIN event_scoring_criteria c ON c.round_id = r.id
      LEFT JOIN event_round_advancements a ON a.round_id = r.id
      WHERE r.event_id = $1 AND r.organisation_id = $2
      GROUP BY r.id
      ORDER BY r.round_number ASC
    `;

    const res = await client.query(query, [eventId, organisationId]);
    return res.rows.map(formatRoundRow);
  });
}

/**
 * Gets a specific round by ID.
 */
export async function getEventRoundById(organisationId, eventId, roundId) {
  return withTenantTransaction({ organisationId }, async (client) => {
    const query = `
      SELECT
        r.*,
        COUNT(DISTINCT s.id)::int AS submission_count,
        COUNT(DISTINCT c.id)::int AS criteria_count,
        COUNT(DISTINCT a.id)::int AS advancement_count
      FROM event_rounds r
      LEFT JOIN event_submissions s ON s.round_id = r.id
      LEFT JOIN event_scoring_criteria c ON c.round_id = r.id
      LEFT JOIN event_round_advancements a ON a.round_id = r.id
      WHERE r.id = $1 AND r.event_id = $2 AND r.organisation_id = $3
      GROUP BY r.id
    `;

    const res = await client.query(query, [roundId, eventId, organisationId]);
    if (res.rows.length === 0) {
      throw new NotFoundError('Round not found.', 'ROUND_NOT_FOUND');
    }

    return formatRoundRow(res.rows[0]);
  });
}

/**
 * Creates a new round for an event.
 */
export async function createEventRound(
  organisationId,
  eventId,
  roundData,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const {
    name,
    description,
    instructions,
    roundNumber,
    submissionOpensAt,
    submissionClosesAt,
    advancementRule = 'manual',
    advancementThreshold,
    advancementTopN,
    status = 'pending',
  } = roundData;

  // Validate dates
  if (submissionOpensAt && submissionClosesAt) {
    const opens = new Date(submissionOpensAt);
    const closes = new Date(submissionClosesAt);
    if (closes <= opens) {
      throw new ValidationError('submissionClosesAt must be after submissionOpensAt.');
    }
  }

  // Validate advancement rules
  if (advancementRule === 'score_threshold') {
    if (advancementThreshold == null || Number(advancementThreshold) < 0) {
      throw new ValidationError('advancementThreshold must be a non-negative number when rule is score_threshold.');
    }
  }

  if (advancementRule === 'top_n') {
    if (advancementTopN == null || Number(advancementTopN) < 1) {
      throw new ValidationError('advancementTopN must be a positive integer when rule is top_n.');
    }
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify Event exists and is not cancelled or archived
    const eventRes = await client.query(
      `SELECT id, status, start_at, end_at FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];
    if (['cancelled', 'archived'].includes(event.status)) {
      throw new ConflictError(
        `Cannot create rounds because event is ${event.status}.`,
        'EVENT_LOCKED'
      );
    }

    // 2. Determine round number if not provided
    let effectiveRoundNumber = roundNumber;
    if (effectiveRoundNumber == null) {
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(round_number), 0) + 1 AS next_num FROM event_rounds WHERE event_id = $1`,
        [eventId]
      );
      effectiveRoundNumber = maxRes.rows[0].next_num;
    } else {
      effectiveRoundNumber = Number(effectiveRoundNumber);
      if (!Number.isInteger(effectiveRoundNumber) || effectiveRoundNumber < 1) {
        throw new ValidationError('roundNumber must be a positive integer.');
      }

      // Check uniqueness
      const existingRes = await client.query(
        `SELECT id FROM event_rounds WHERE event_id = $1 AND round_number = $2`,
        [eventId, effectiveRoundNumber]
      );
      if (existingRes.rows.length > 0) {
        throw new ConflictError(
          `Round number ${effectiveRoundNumber} already exists in this event.`,
          'ROUND_NUMBER_EXISTS'
        );
      }
    }

    // 3. Insert round
    const insertQuery = `
      INSERT INTO event_rounds (
        organisation_id,
        event_id,
        round_number,
        name,
        description,
        instructions,
        submission_opens_at,
        submission_closes_at,
        advancement_rule,
        advancement_threshold,
        advancement_top_n,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const res = await client.query(insertQuery, [
      organisationId,
      eventId,
      effectiveRoundNumber,
      name.trim(),
      description ? description.trim() : null,
      instructions ? instructions.trim() : null,
      submissionOpensAt ? new Date(submissionOpensAt) : null,
      submissionClosesAt ? new Date(submissionClosesAt) : null,
      advancementRule,
      advancementThreshold != null ? Number(advancementThreshold) : null,
      advancementTopN != null ? Number(advancementTopN) : null,
      status,
    ]);

    const createdRound = res.rows[0];

    // Audit log
    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.round.created',
      entityType: 'event_round',
      entityId: createdRound.id,
      metadata: {
        eventId,
        roundNumber: effectiveRoundNumber,
        name: createdRound.name,
      },
      ipAddress,
      userAgent,
      client,
    });

    return formatRoundRow(createdRound);
  });
}

/**
 * Updates an existing round's details and deadlines.
 */
export async function updateEventRound(
  organisationId,
  eventId,
  roundId,
  updates,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Fetch current round
    const roundRes = await client.query(
      `SELECT * FROM event_rounds WHERE id = $1 AND event_id = $2 AND organisation_id = $3 FOR UPDATE`,
      [roundId, eventId, organisationId]
    );

    if (roundRes.rows.length === 0) {
      throw new NotFoundError('Round not found.', 'ROUND_NOT_FOUND');
    }

    const current = roundRes.rows[0];

    // Verify dates
    const effectiveOpens = updates.submissionOpensAt !== undefined
      ? (updates.submissionOpensAt ? new Date(updates.submissionOpensAt) : null)
      : current.submission_opens_at;

    const effectiveCloses = updates.submissionClosesAt !== undefined
      ? (updates.submissionClosesAt ? new Date(updates.submissionClosesAt) : null)
      : current.submission_closes_at;

    if (effectiveOpens && effectiveCloses && effectiveCloses <= effectiveOpens) {
      throw new ValidationError('submissionClosesAt must be after submissionOpensAt.');
    }

    // Advancement rule validation
    const effectiveRule = updates.advancementRule || current.advancement_rule;
    const effectiveThreshold = updates.advancementThreshold !== undefined
      ? updates.advancementThreshold
      : current.advancement_threshold;
    const effectiveTopN = updates.advancementTopN !== undefined
      ? updates.advancementTopN
      : current.advancement_top_n;

    if (effectiveRule === 'score_threshold' && (effectiveThreshold == null || Number(effectiveThreshold) < 0)) {
      throw new ValidationError('advancementThreshold must be a non-negative number when rule is score_threshold.');
    }

    if (effectiveRule === 'top_n' && (effectiveTopN == null || Number(effectiveTopN) < 1)) {
      throw new ValidationError('advancementTopN must be a positive integer when rule is top_n.');
    }

    // Check round number uniqueness if changing
    if (updates.roundNumber !== undefined && Number(updates.roundNumber) !== current.round_number) {
      const newNum = Number(updates.roundNumber);
      if (!Number.isInteger(newNum) || newNum < 1) {
        throw new ValidationError('roundNumber must be a positive integer.');
      }
      const numCheck = await client.query(
        `SELECT id FROM event_rounds WHERE event_id = $1 AND round_number = $2 AND id != $3`,
        [eventId, newNum, roundId]
      );
      if (numCheck.rows.length > 0) {
        throw new ConflictError(
          `Round number ${newNum} already exists in this event.`,
          'ROUND_NUMBER_EXISTS'
        );
      }
    }

    const updateQuery = `
      UPDATE event_rounds
      SET
        round_number = COALESCE($1, round_number),
        name = COALESCE($2, name),
        description = CASE WHEN $3::boolean THEN $4 ELSE description END,
        instructions = CASE WHEN $5::boolean THEN $6 ELSE instructions END,
        submission_opens_at = CASE WHEN $7::boolean THEN $8 ELSE submission_opens_at END,
        submission_closes_at = CASE WHEN $9::boolean THEN $10 ELSE submission_closes_at END,
        advancement_rule = COALESCE($11, advancement_rule),
        advancement_threshold = CASE WHEN $12::boolean THEN $13 ELSE advancement_threshold END,
        advancement_top_n = CASE WHEN $14::boolean THEN $15 ELSE advancement_top_n END,
        status = COALESCE($16, status),
        updated_at = NOW()
      WHERE id = $17
      RETURNING *
    `;

    const res = await client.query(updateQuery, [
      updates.roundNumber !== undefined ? Number(updates.roundNumber) : null,
      updates.name !== undefined ? updates.name.trim() : null,
      updates.description !== undefined,
      updates.description ? updates.description.trim() : null,
      updates.instructions !== undefined,
      updates.instructions ? updates.instructions.trim() : null,
      updates.submissionOpensAt !== undefined,
      updates.submissionOpensAt ? new Date(updates.submissionOpensAt) : null,
      updates.submissionClosesAt !== undefined,
      updates.submissionClosesAt ? new Date(updates.submissionClosesAt) : null,
      updates.advancementRule || null,
      updates.advancementThreshold !== undefined,
      updates.advancementThreshold != null ? Number(updates.advancementThreshold) : null,
      updates.advancementTopN !== undefined,
      updates.advancementTopN != null ? Number(updates.advancementTopN) : null,
      updates.status || null,
      roundId,
    ]);

    const updated = res.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.round.updated',
      entityType: 'event_round',
      entityId: roundId,
      metadata: { eventId, roundNumber: updated.round_number, name: updated.name },
      ipAddress,
      userAgent,
      client,
    });

    return formatRoundRow(updated);
  });
}

/**
 * Safely deletes a round only when it has no submissions, scores, or qualification decisions.
 */
export async function deleteEventRound(
  organisationId,
  eventId,
  roundId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify round exists
    const roundRes = await client.query(
      `SELECT * FROM event_rounds WHERE id = $1 AND event_id = $2 AND organisation_id = $3 FOR UPDATE`,
      [roundId, eventId, organisationId]
    );

    if (roundRes.rows.length === 0) {
      throw new NotFoundError('Round not found.', 'ROUND_NOT_FOUND');
    }

    const round = roundRes.rows[0];

    // 2. Safety check: Check for dependent submissions
    const subRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM event_submissions WHERE round_id = $1`,
      [roundId]
    );
    if (subRes.rows[0].count > 0) {
      throw new ConflictError(
        'Cannot delete round: submissions have already been received for this round.',
        'ROUND_HAS_SUBMISSIONS'
      );
    }

    // 3. Safety check: Check for scores
    const scoreRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM event_scores WHERE round_id = $1`,
      [roundId]
    );
    if (scoreRes.rows[0].count > 0) {
      throw new ConflictError(
        'Cannot delete round: evaluation scores have already been recorded.',
        'ROUND_HAS_SCORES'
      );
    }

    // 4. Safety check: Check for advancement records
    const advRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM event_round_advancements WHERE round_id = $1`,
      [roundId]
    );
    if (advRes.rows[0].count > 0) {
      throw new ConflictError(
        'Cannot delete round: qualification or advancement decisions have already been made.',
        'ROUND_HAS_ADVANCEMENTS'
      );
    }

    // 5. Delete round
    await client.query(`DELETE FROM event_rounds WHERE id = $1`, [roundId]);

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.round.deleted',
      entityType: 'event_round',
      entityId: roundId,
      metadata: { eventId, roundNumber: round.round_number, name: round.name },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

/**
 * Lists public rounds for a published public event (EVT-003, EVT-010).
 */
export async function listPublicEventRounds(eventId) {
  return withSystemTransaction(async (client) => {
    // 1. Verify event is published and public
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUuid = UUID_REGEX.test(eventId);

    const eventCheckSql = isUuid
      ? `SELECT id FROM events WHERE id = $1 AND status = 'published' AND visibility = 'public'`
      : `SELECT id FROM events WHERE slug = $1 AND status = 'published' AND visibility = 'public'`;

    const eventRes = await client.query(eventCheckSql, [eventId]);
    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found or is not publicly accessible.', 'EVENT_NOT_FOUND');
    }

    const actualEventId = eventRes.rows[0].id;

    // 2. Fetch public rounds
    const roundsSql = `
      SELECT
        id, event_id, round_number, name, description, instructions,
        submission_opens_at, submission_closes_at, status, results_published_at
      FROM event_rounds
      WHERE event_id = $1
      ORDER BY round_number ASC
    `;

    const res = await client.query(roundsSql, [actualEventId]);
    return res.rows.map((r) => ({
      id: r.id,
      eventId: r.event_id,
      roundNumber: Number(r.round_number),
      name: r.name,
      description: r.description || null,
      instructions: r.instructions || null,
      submissionOpensAt: r.submission_opens_at ? r.submission_opens_at.toISOString() : null,
      submissionClosesAt: r.submission_closes_at ? r.submission_closes_at.toISOString() : null,
      status: r.status,
      resultsPublishedAt: r.results_published_at ? r.results_published_at.toISOString() : null,
    }));
  });
}

