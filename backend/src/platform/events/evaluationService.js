/**
-- ==============================================================================
-- ManageX Event Evaluation, Judge Scheduling & Panel Service
-- Strictly adheres to PRD Section 7, ADR-001, ADR-003, ADR-008, ADR-009,
-- and Phase 2A/2A.1/2B specifications.
-- ==============================================================================
*/

import { randomUUID } from 'node:crypto';
import { withTenantTransaction, withSystemTransaction } from '../database/transaction.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../common/errors.js';
import { recordAuditEvent } from '../audit/auditService.js';
import { generateSecureToken, hashToken } from '../auth/tokens.js';
import { sendEmail } from '../email/emailService.js';
import { env } from '../../config/env.js';
import { refreshAccessToken } from '../integrations/googleOAuthService.js';
import { createCalendarEvent } from '../integrations/googleCalendarClient.js';

// Meeting URL release window: 10 minutes prior to session start
const MEETING_LINK_RELEASE_WINDOW_MS = 10 * 60 * 1000;

function assertValidDate(value, fieldName) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date-time.`);
  }
  return date;
}

/**
 * Projects an evaluation session according to the caller's authorized scope.
 * Redacts meeting_url until release window for participants.
 * Never exposes private notes, default URLs, or judge identities to participants.
 */
export function projectSessionForCaller(session, { isOrganiser = false, isJudge = false, callerUserId = null } = {}) {
  if (!session) return null;

  const now = Date.now();
  const startsAtMs = new Date(session.starts_at).getTime();
  const isWithinReleaseWindow = now >= startsAtMs - MEETING_LINK_RELEASE_WINDOW_MS;
  const isSessionActive = session.status !== 'cancelled' && session.status !== 'no_show';

  let visibleMeetingUrl = null;
  if (isSessionActive && (isOrganiser || isJudge)) {
    visibleMeetingUrl = session.meeting_url || null;
  } else if (isSessionActive && isWithinReleaseWindow) {
    visibleMeetingUrl = session.meeting_url || null;
  }

  const base = {
    id: session.id,
    organisationId: session.organisation_id,
    eventId: session.event_id,
    roundEvaluationId: session.round_evaluation_id,
    panelId: session.panel_id,
    panelNumber: session.panel_number,
    panelName: session.panel_name,
    teamId: session.team_id,
    teamName: session.team_name,
    slotIndex: session.slot_index,
    startsAt: session.starts_at ? new Date(session.starts_at).toISOString() : null,
    endsAt: session.ends_at ? new Date(session.ends_at).toISOString() : null,
    status: session.status,
    meetingUrl: visibleMeetingUrl,
    meetingLinkAvailableAt: session.starts_at && !visibleMeetingUrl && isSessionActive
      ? new Date(startsAtMs - MEETING_LINK_RELEASE_WINDOW_MS).toISOString()
      : null,
    evaluationOrder: session.slot_index,
  };

  if (isOrganiser || isJudge) {
    base.judges = session.judges || [];
    base.notes = session.notes || null;
    base.createdAt = session.created_at ? new Date(session.created_at).toISOString() : null;
    base.updatedAt = session.updated_at ? new Date(session.updated_at).toISOString() : null;
  }

  return base;
}

// -----------------------------------------------------------------------------
// 1. Round Evaluation Configuration (1:0..1 with event_rounds)
// -----------------------------------------------------------------------------

/**
 * Fetches the evaluation configuration for a competition round.
 */
export async function getRoundEvaluation(organisationId, eventId, roundId, callerContext = {}) {
  return withTenantTransaction({ organisationId, userId: callerContext.userId }, async (client) => {
    // 1. Verify round exists in this event
    const roundRes = await client.query(
      `SELECT id, name, round_number, status FROM event_rounds WHERE id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );

    if (roundRes.rows.length === 0) {
      throw new NotFoundError('Competition round not found.', 'ROUND_NOT_FOUND');
    }

    const round = roundRes.rows[0];

    // 2. Fetch round_evaluations record
    const evalRes = await client.query(
      `SELECT * FROM round_evaluations WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );

    if (evalRes.rows.length === 0) {
      return {
        configured: false,
        roundId,
        roundNumber: round.round_number,
        roundName: round.name,
        evaluation: null,
      };
    }

    const ev = evalRes.rows[0];

    // Fetch panels count and sessions count
    const panelsRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM evaluation_panels WHERE round_evaluation_id = $1`,
      [ev.id]
    );
    const sessionsRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM evaluation_sessions WHERE round_evaluation_id = $1 AND status != 'cancelled'`,
      [ev.id]
    );

    let isOrganiser = callerContext.isOrganiser === true;
    let isJudge = callerContext.isJudge === true;

    if (!isOrganiser && !isJudge && callerContext.userId) {
      const judgeCheck = await client.query(
        `SELECT 1 FROM evaluation_panel_judges WHERE round_evaluation_id = $1 AND judge_user_id = $2`,
        [ev.id, callerContext.userId]
      );
      if (judgeCheck.rows.length > 0) {
        isJudge = true;
      }
    }
    return {
      configured: true,
      roundId,
      roundNumber: round.round_number,
      roundName: round.name,
      evaluation: {
        id: ev.id,
        organisationId: ev.organisation_id,
        eventId: ev.event_id,
        roundId: ev.round_id,
        evaluationMode: ev.evaluation_mode,
        status: ev.status,
        sessionDurationMinutes: ev.session_duration_minutes,
        bufferMinutes: ev.buffer_minutes,
        judgesPerPanel: ev.judges_per_panel,
        evaluationsPerTeam: ev.evaluations_per_team,
        scheduleStartsAt: ev.schedule_starts_at ? new Date(ev.schedule_starts_at).toISOString() : null,
        scheduleEndsAt: ev.schedule_ends_at ? new Date(ev.schedule_ends_at).toISOString() : null,
        defaultMeetingUrl: (isOrganiser || isJudge) ? ev.default_meeting_url : null,
        panelsCount: panelsRes.rows[0].count,
        sessionsCount: sessionsRes.rows[0].count,
        createdAt: ev.created_at.toISOString(),
        updatedAt: ev.updated_at.toISOString(),
      },
    };
  });
}

/**
 * Creates or initialises evaluation configuration for an event round.
 */
export async function createRoundEvaluation(
  organisationId,
  eventId,
  roundId,
  data,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const {
    evaluationMode = 'submission_based',
    sessionDurationMinutes = 15,
    bufferMinutes = 3,
    judgesPerPanel = 2,
    evaluationsPerTeam = 1,
    scheduleStartsAt = null,
    scheduleEndsAt = null,
    defaultMeetingUrl = null,
  } = data;

  const validModes = ['submission_based', 'live_showcase', 'hybrid'];
  if (!validModes.includes(evaluationMode)) {
    throw new ValidationError(`Invalid evaluation mode: ${evaluationMode}. Must be one of: ${validModes.join(', ')}.`);
  }

  const duration = Number(sessionDurationMinutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    throw new ValidationError('Session duration must be an integer between 5 and 480 minutes.');
  }

  const buffer = Number(bufferMinutes);
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120) {
    throw new ValidationError('Buffer must be an integer between 0 and 120 minutes.');
  }

  const judgesCount = Number(judgesPerPanel);
  if (!Number.isInteger(judgesCount) || judgesCount < 1 || judgesCount > 20) {
    throw new ValidationError('Judges per panel must be an integer between 1 and 20.');
  }

  const evalsCount = Number(evaluationsPerTeam);
  if (!Number.isInteger(evalsCount) || evalsCount < 1 || evalsCount > 20) {
    throw new ValidationError('Evaluations per team must be an integer between 1 and 20.');
  }

  if (scheduleStartsAt && scheduleEndsAt) {
    const startMs = new Date(scheduleStartsAt).getTime();
    const endMs = new Date(scheduleEndsAt).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
      throw new ValidationError('Schedule ends_at must be strictly after starts_at.');
    }
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify round exists
    const roundRes = await client.query(
      `SELECT id, event_id FROM event_rounds WHERE id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );
    if (roundRes.rows.length === 0) {
      throw new NotFoundError('Competition round not found.', 'ROUND_NOT_FOUND');
    }

    // 2. Check for existing evaluation (1:0..1)
    const existing = await client.query(
      `SELECT id FROM round_evaluations WHERE round_id = $1`,
      [roundId]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('Evaluation configuration already exists for this round. Use update instead.', 'EVALUATION_EXISTS');
    }

    // 3. Insert round_evaluations
    const insertRes = await client.query(
      `
      INSERT INTO round_evaluations (
        organisation_id, event_id, round_id, evaluation_mode, status,
        session_duration_minutes, buffer_minutes, judges_per_panel, evaluations_per_team,
        schedule_starts_at, schedule_ends_at, default_meeting_url
      ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `,
      [
        organisationId,
        eventId,
        roundId,
        evaluationMode,
        duration,
        buffer,
        judgesCount,
        evalsCount,
        scheduleStartsAt ? new Date(scheduleStartsAt) : null,
        scheduleEndsAt ? new Date(scheduleEndsAt) : null,
        defaultMeetingUrl ? defaultMeetingUrl.trim() : null,
      ]
    );

    const ev = insertRes.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.created',
      entityType: 'round_evaluation',
      entityId: ev.id,
      metadata: { eventId, roundId, evaluationMode: ev.evaluation_mode },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: ev.id,
      organisationId: ev.organisation_id,
      eventId: ev.event_id,
      roundId: ev.round_id,
      evaluationMode: ev.evaluation_mode,
      status: ev.status,
      sessionDurationMinutes: ev.session_duration_minutes,
      bufferMinutes: ev.buffer_minutes,
      judgesPerPanel: ev.judges_per_panel,
      evaluationsPerTeam: ev.evaluations_per_team,
      scheduleStartsAt: ev.schedule_starts_at ? ev.schedule_starts_at.toISOString() : null,
      scheduleEndsAt: ev.schedule_ends_at ? ev.schedule_ends_at.toISOString() : null,
      defaultMeetingUrl: ev.default_meeting_url,
      createdAt: ev.created_at.toISOString(),
      updatedAt: ev.updated_at.toISOString(),
    };
  });
}

/**
 * Updates round evaluation configuration.
 */
export async function updateRoundEvaluation(
  organisationId,
  eventId,
  roundId,
  updates,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const curRes = await client.query(
      `SELECT * FROM round_evaluations WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3 FOR UPDATE`,
      [roundId, eventId, organisationId]
    );

    if (curRes.rows.length === 0) {
      throw new NotFoundError('Round evaluation not found.', 'EVALUATION_NOT_FOUND');
    }

    const current = curRes.rows[0];

    let newMode = current.evaluation_mode;
    if (updates.evaluationMode) {
      const validModes = ['submission_based', 'live_showcase', 'hybrid'];
      if (!validModes.includes(updates.evaluationMode)) {
        throw new ValidationError(`Invalid evaluation mode: ${updates.evaluationMode}`);
      }
      newMode = updates.evaluationMode;
    }

    let duration = current.session_duration_minutes;
    if (updates.sessionDurationMinutes !== undefined) {
      duration = Number(updates.sessionDurationMinutes);
      if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
        throw new ValidationError('Session duration must be between 5 and 480 minutes.');
      }
    }

    let buffer = current.buffer_minutes;
    if (updates.bufferMinutes !== undefined) {
      buffer = Number(updates.bufferMinutes);
      if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120) {
        throw new ValidationError('Buffer must be between 0 and 120 minutes.');
      }
    }

    let judgesCount = current.judges_per_panel;
    if (updates.judgesPerPanel !== undefined) {
      judgesCount = Number(updates.judgesPerPanel);
      if (!Number.isInteger(judgesCount) || judgesCount < 1 || judgesCount > 20) {
        throw new ValidationError('Judges per panel must be between 1 and 20.');
      }
    }

    let evalsCount = current.evaluations_per_team;
    if (updates.evaluationsPerTeam !== undefined) {
      evalsCount = Number(updates.evaluationsPerTeam);
      if (!Number.isInteger(evalsCount) || evalsCount < 1 || evalsCount > 20) {
        throw new ValidationError('Evaluations per team must be between 1 and 20.');
      }
    }

    let startAt = current.schedule_starts_at;
    if (updates.scheduleStartsAt !== undefined) {
      startAt = updates.scheduleStartsAt ? new Date(updates.scheduleStartsAt) : null;
    }

    let endAt = current.schedule_ends_at;
    if (updates.scheduleEndsAt !== undefined) {
      endAt = updates.scheduleEndsAt ? new Date(updates.scheduleEndsAt) : null;
    }

    if (startAt && endAt && endAt <= startAt) {
      throw new ValidationError('Schedule ends_at must be strictly after starts_at.');
    }

    let defaultUrl = current.default_meeting_url;
    if (updates.defaultMeetingUrl !== undefined) {
      defaultUrl = updates.defaultMeetingUrl ? updates.defaultMeetingUrl.trim() : null;
    }

    const updateRes = await client.query(
      `
      UPDATE round_evaluations
      SET
        evaluation_mode = $1,
        session_duration_minutes = $2,
        buffer_minutes = $3,
        judges_per_panel = $4,
        evaluations_per_team = $5,
        schedule_starts_at = $6,
        schedule_ends_at = $7,
        default_meeting_url = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `,
      [newMode, duration, buffer, judgesCount, evalsCount, startAt, endAt, defaultUrl, current.id]
    );

    const updated = updateRes.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.updated',
      entityType: 'round_evaluation',
      entityId: updated.id,
      metadata: { eventId, roundId, evaluationMode: updated.evaluation_mode },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: updated.id,
      organisationId: updated.organisation_id,
      eventId: updated.event_id,
      roundId: updated.round_id,
      evaluationMode: updated.evaluation_mode,
      status: updated.status,
      sessionDurationMinutes: updated.session_duration_minutes,
      bufferMinutes: updated.buffer_minutes,
      judgesPerPanel: updated.judges_per_panel,
      evaluationsPerTeam: updated.evaluations_per_team,
      scheduleStartsAt: updated.schedule_starts_at ? updated.schedule_starts_at.toISOString() : null,
      scheduleEndsAt: updated.schedule_ends_at ? updated.schedule_ends_at.toISOString() : null,
      defaultMeetingUrl: updated.default_meeting_url,
      updatedAt: updated.updated_at.toISOString(),
    };
  });
}

// -----------------------------------------------------------------------------
// 2. Evaluation Panels Management
// -----------------------------------------------------------------------------

/**
 * Creates an evaluation panel attached to a round evaluation.
 */
export async function createEvaluationPanel(
  organisationId,
  eventId,
  roundId,
  data,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const { name, meetingUrl = null, orderIndex = 0, panelNumber = null } = data;

  if (!name || !name.trim()) {
    throw new ValidationError('Panel name is required.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Get round evaluation
    const evalRes = await client.query(
      `SELECT id FROM round_evaluations WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );
    if (evalRes.rows.length === 0) {
      throw new NotFoundError('Evaluation configuration not found. Create evaluation first.', 'EVALUATION_NOT_FOUND');
    }
    const evalId = evalRes.rows[0].id;

    // 2. Compute orderIndex
    let num = Number(orderIndex) || Number(panelNumber);
    if (!num) {
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(order_index), 0) + 1 AS next_num FROM evaluation_panels WHERE round_evaluation_id = $1`,
        [evalId]
      );
      num = maxRes.rows[0].next_num;
    }

    if (num < 1 || num > 100) {
      throw new ValidationError('Panel number must be an integer between 1 and 100.');
    }

    // 3. Insert panel
    const insertRes = await client.query(
      `
      INSERT INTO evaluation_panels (
        organisation_id, event_id, round_evaluation_id, name, meeting_url, order_index
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [organisationId, eventId, evalId, name.trim(), meetingUrl ? meetingUrl.trim() : null, num]
    );

    const panel = insertRes.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.panel.created',
      entityType: 'evaluation_panel',
      entityId: panel.id,
      metadata: { eventId, roundId, panelNumber: panel.order_index, panelName: panel.name },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: panel.id,
      roundEvaluationId: panel.round_evaluation_id,
      panelNumber: panel.order_index,
      name: panel.name,
      meetingUrl: panel.meeting_url,
      orderIndex: panel.order_index,
      judges: [],
      createdAt: panel.created_at.toISOString(),
      updatedAt: panel.updated_at.toISOString(),
    };
  });
}

/**
 * Lists evaluation panels for a round evaluation, including assigned judges.
 */
export async function listEvaluationPanels(organisationId, eventId, roundId, callerContext = {}) {
  return withTenantTransaction({ organisationId, userId: callerContext.userId }, async (client) => {
    const evalRes = await client.query(
      `SELECT id, status FROM round_evaluations WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );

    if (evalRes.rows.length === 0) {
      return { panels: [] };
    }

    const evalId = evalRes.rows[0].id;
    let isOrganiser = callerContext.isOrganiser === true;
    let isJudge = callerContext.isJudge === true;
    let assignedPanelIds = new Set();

    if (!isOrganiser && !isJudge && callerContext.userId) {
      const judgeCheck = await client.query(
        `SELECT panel_id FROM evaluation_panel_judges WHERE round_evaluation_id = $1 AND judge_user_id = $2`,
        [evalId, callerContext.userId]
      );
      if (judgeCheck.rows.length > 0) {
        isJudge = true;
        assignedPanelIds = new Set(judgeCheck.rows.map((row) => row.panel_id));
      }
    }

    if (!isOrganiser && !isJudge) {
      return { panels: [] };
    }

    // Fetch panels
    const panelsRes = await client.query(
      `
      SELECT id, round_evaluation_id, name, meeting_url, order_index, created_at, updated_at
      FROM evaluation_panels
      WHERE round_evaluation_id = $1 AND organisation_id = $2
      ORDER BY order_index ASC
    `,
      [evalId, organisationId]
    );

    // Fetch assigned judges for these panels
    const judgesRes = await client.query(
      `
      SELECT epj.panel_id, epj.judge_user_id, epj.created_at, u.full_name, u.email
      FROM evaluation_panel_judges epj
      JOIN users u ON u.id = epj.judge_user_id
      WHERE epj.round_evaluation_id = $1
      ORDER BY epj.created_at ASC
    `,
      [evalId]
    );

    const judgesByPanel = {};
    for (const j of judgesRes.rows) {
      if (!judgesByPanel[j.panel_id]) judgesByPanel[j.panel_id] = [];
      judgesByPanel[j.panel_id].push({
        judgeUserId: j.judge_user_id,
        judgeName: j.full_name,
        judgeEmail: (isOrganiser || j.judge_user_id === callerContext.userId) ? j.email : null,
        assignedAt: j.created_at.toISOString(),
      });
    }

    const visiblePanels = isOrganiser
      ? panelsRes.rows
      : panelsRes.rows.filter((panel) => assignedPanelIds.has(panel.id));

    const panels = visiblePanels.map((p) => {
      const panelJudges = judgesByPanel[p.id] || [];
      const callerAssigned = panelJudges.some((j) => j.judgeUserId === callerContext.userId);

      return {
        id: p.id,
        roundEvaluationId: p.round_evaluation_id,
        panelNumber: p.order_index,
        name: p.name,
        meetingUrl: (isOrganiser || callerAssigned) ? p.meeting_url : null,
        orderIndex: p.order_index,
        judges: isOrganiser || callerAssigned ? panelJudges : [],
        createdAt: p.created_at.toISOString(),
        updatedAt: p.updated_at.toISOString(),
      };
    });

    return { panels };
  });
}

/**
 * Updates an evaluation panel.
 */
export async function updateEvaluationPanel(
  organisationId,
  eventId,
  roundId,
  panelId,
  updates,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const curRes = await client.query(
      `SELECT * FROM evaluation_panels WHERE id = $1 AND event_id = $2 AND organisation_id = $3 FOR UPDATE`,
      [panelId, eventId, organisationId]
    );

    if (curRes.rows.length === 0) {
      throw new NotFoundError('Evaluation panel not found.', 'PANEL_NOT_FOUND');
    }

    const current = curRes.rows[0];
    const newName = updates.name !== undefined ? updates.name.trim() : current.name;
    const newMeetingUrl = updates.meetingUrl !== undefined
      ? (updates.meetingUrl ? updates.meetingUrl.trim() : null)
      : current.meeting_url;
    const newOrderIndex = updates.orderIndex !== undefined ? Number(updates.orderIndex) : current.order_index;

    const res = await client.query(
      `
      UPDATE evaluation_panels
      SET name = $1, meeting_url = $2, order_index = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `,
      [newName, newMeetingUrl, newOrderIndex, panelId]
    );

    const updated = res.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.panel.updated',
      entityType: 'evaluation_panel',
      entityId: panelId,
      metadata: { eventId, roundId, panelName: updated.name },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: updated.id,
      roundEvaluationId: updated.round_evaluation_id,
      panelNumber: updated.order_index,
      name: updated.name,
      meetingUrl: updated.meeting_url,
      orderIndex: updated.order_index,
      updatedAt: updated.updated_at.toISOString(),
    };
  });
}

/**
 * Deletes an evaluation panel with dependency safety check.
 */
export async function deleteEvaluationPanel(
  organisationId,
  eventId,
  roundId,
  panelId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Check for active sessions
    const activeSessions = await client.query(
      `SELECT COUNT(*)::int AS count FROM evaluation_sessions WHERE panel_id = $1 AND status != 'cancelled'`,
      [panelId]
    );

    if (activeSessions.rows[0].count > 0) {
      throw new ConflictError(
        'Cannot delete panel that has scheduled or completed sessions. Cancel or reschedule sessions first.',
        'PANEL_HAS_ACTIVE_SESSIONS'
      );
    }

    const delRes = await client.query(
      `DELETE FROM evaluation_panels WHERE id = $1 AND event_id = $2 AND organisation_id = $3 RETURNING *`,
      [panelId, eventId, organisationId]
    );

    if (delRes.rows.length === 0) {
      throw new NotFoundError('Evaluation panel not found.', 'PANEL_NOT_FOUND');
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.panel.deleted',
      entityType: 'evaluation_panel',
      entityId: panelId,
      metadata: { eventId, roundId, panelName: delRes.rows[0].name },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

// -----------------------------------------------------------------------------
// 3. Panel Judge Assignments & Synchronisation
// -----------------------------------------------------------------------------

/**
 * Assigns an active judge to an evaluation panel.
 * Safely synchronises assignment with event_judge_assignments with source = 'evaluation_panel'.
 */
export async function assignJudgeToPanel(
  organisationId,
  eventId,
  roundId,
  panelId,
  { judgeUserId },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!judgeUserId) {
    throw new ValidationError('Judge user ID is required.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify panel exists
    const panelRes = await client.query(
      `SELECT ep.*, re.id AS round_evaluation_id
       FROM evaluation_panels ep
       JOIN round_evaluations re ON re.id = ep.round_evaluation_id
       WHERE ep.id = $1 AND ep.event_id = $2 AND ep.organisation_id = $3 AND re.round_id = $4`,
      [panelId, eventId, organisationId, roundId]
    );

    if (panelRes.rows.length === 0) {
      throw new NotFoundError('Evaluation panel not found in this round.', 'PANEL_NOT_FOUND');
    }

    const panel = panelRes.rows[0];

    // 2. Verify target user exists and is active
    const userRes = await client.query(
      `SELECT id, full_name, email, status FROM users WHERE id = $1`,
      [judgeUserId]
    );
    if (userRes.rows.length === 0) {
      throw new NotFoundError('Target user not found.', 'USER_NOT_FOUND');
    }
    if (userRes.rows[0].status !== 'active') {
      throw new ConflictError('Cannot assign inactive user as judge.', 'USER_NOT_ACTIVE');
    }

    // 3. Check for existing panel assignment in this evaluation (uq_pjudges_eval_judge)
    const existing = await client.query(
      `SELECT panel_id FROM evaluation_panel_judges WHERE round_evaluation_id = $1 AND judge_user_id = $2`,
      [panel.round_evaluation_id, judgeUserId]
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].panel_id === panelId) {
        throw new ConflictError('Judge is already assigned to this panel.', 'JUDGE_ALREADY_ON_PANEL');
      }
      throw new ConflictError('Judge is already assigned to another panel in this round evaluation.', 'JUDGE_ASSIGNED_ANOTHER_PANEL');
    }

    // 4. Insert into evaluation_panel_judges
    const insertRes = await client.query(
      `
      INSERT INTO evaluation_panel_judges (
        organisation_id, round_evaluation_id, panel_id, judge_user_id
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [organisationId, panel.round_evaluation_id, panelId, judgeUserId]
    );

    const assignment = insertRes.rows[0];

    // 5. Synchronise with event_judge_assignments (round-scoped baseline assignment)
    // Marks source = 'evaluation_panel' and records evaluation_panel_id
    await client.query(
      `
      INSERT INTO event_judge_assignments (
        organisation_id, event_id, round_id, judge_user_id, submission_id,
        assigned_by_id, source, evaluation_panel_id
      ) VALUES ($1, $2, $3, $4, NULL, $5, 'evaluation_panel', $6)
      ON CONFLICT (event_id, round_id, judge_user_id, submission_id) DO NOTHING
    `,
      [organisationId, eventId, roundId, judgeUserId, actorUserId, panelId]
    );

    // Also synchronise for any existing scheduled team sessions with submissions
    await client.query(
      `
      INSERT INTO event_judge_assignments (
        organisation_id, event_id, round_id, judge_user_id, submission_id,
        assigned_by_id, source, evaluation_panel_id, evaluation_session_id
      )
      SELECT 
        $1, $2, $3, $4, s.id, $5, 'evaluation_panel', $6, es.id
      FROM evaluation_sessions es
      JOIN event_submissions s ON s.team_id = es.team_id AND s.round_id = $3
      WHERE es.panel_id = $6 AND es.status != 'cancelled'
      ON CONFLICT (event_id, round_id, judge_user_id, submission_id) DO NOTHING
    `,
      [organisationId, eventId, roundId, judgeUserId, actorUserId, panelId]
    );

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.judge.assigned',
      entityType: 'evaluation_panel_judge',
      entityId: assignment.id,
      metadata: { eventId, roundId, panelId, judgeUserId },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: assignment.id,
      panelId: assignment.panel_id,
      judgeUserId: assignment.judge_user_id,
      judgeName: userRes.rows[0].full_name,
      judgeEmail: userRes.rows[0].email,
      assignedAt: assignment.created_at.toISOString(),
    };
  });
}

/**
 * Removes a judge from an evaluation panel.
 * Safely removes synchronized assignments while preserving any manual assignments.
 */
export async function removeJudgeFromPanel(
  organisationId,
  eventId,
  roundId,
  panelId,
  judgeUserId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Delete from evaluation_panel_judges
    const delRes = await client.query(
      `
      DELETE FROM evaluation_panel_judges
      WHERE panel_id = $1 AND judge_user_id = $2 AND organisation_id = $3
      RETURNING id
    `,
      [panelId, judgeUserId, organisationId]
    );

    if (delRes.rows.length === 0) {
      throw new NotFoundError('Judge is not assigned to this panel.', 'PANEL_JUDGE_NOT_FOUND');
    }

    // 2. Synchronised removal: Delete ONLY generated assignments from this panel
    // Never touches assignments where source = 'manual'
    await client.query(
      `
      DELETE FROM event_judge_assignments
      WHERE evaluation_panel_id = $1
        AND judge_user_id = $2
        AND source = 'evaluation_panel'
    `,
      [panelId, judgeUserId]
    );

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.judge.removed',
      entityType: 'evaluation_panel_judge',
      entityId: delRes.rows[0].id,
      metadata: { eventId, roundId, panelId, judgeUserId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

// -----------------------------------------------------------------------------
// 4. Scheduling & Conflict Detection
// -----------------------------------------------------------------------------

/**
 * Validates transactional scheduling conflicts for panel judges and teams.
 * Checks bufferMinutes on both sides of the window.
 */
async function assertNoScheduleConflicts(
  client,
  { panelId, teamId, startsAt, endsAt, bufferMinutes = 0, excludeSessionId = null }
) {
  const startIso = startsAt.toISOString();
  const endIso = endsAt.toISOString();

  // 1. Check if any judge on this panel has an overlapping session on another panel/evaluation
  const judgeConflictRes = await client.query(
    `
    SELECT es.id, es.panel_id, es.starts_at, es.ends_at, epj.judge_user_id, u.full_name AS judge_name
    FROM evaluation_sessions es
    JOIN evaluation_panel_judges epj ON epj.panel_id = es.panel_id
    JOIN users u ON u.id = epj.judge_user_id
    WHERE epj.judge_user_id IN (
      SELECT judge_user_id FROM evaluation_panel_judges WHERE panel_id = $1
    )
    AND ($2::uuid IS NULL OR es.id != $2::uuid)
    AND es.status != 'cancelled'
    AND (es.starts_at - ($3 || ' minutes')::interval) < $4::timestamptz
    AND (es.ends_at + ($3 || ' minutes')::interval) > $5::timestamptz
    LIMIT 1
  `,
    [panelId, excludeSessionId, bufferMinutes, endIso, startIso]
  );

  if (judgeConflictRes.rows.length > 0) {
    const c = judgeConflictRes.rows[0];
    throw new ConflictError(
      `Judge ${c.judge_name} has a conflicting session scheduled between ${c.starts_at.toISOString()} and ${c.ends_at.toISOString()} (including ${bufferMinutes}m buffer).`,
      'JUDGE_SCHEDULE_CONFLICT'
    );
  }

  // 2. Check if the team is already scheduled for an overlapping session
  if (teamId) {
    const teamConflictRes = await client.query(
      `
      SELECT id, starts_at, ends_at
      FROM evaluation_sessions
      WHERE team_id = $1
        AND ($2::uuid IS NULL OR id != $2::uuid)
        AND status != 'cancelled'
        AND starts_at < $3::timestamptz
        AND ends_at > $4::timestamptz
      LIMIT 1
    `,
      [teamId, excludeSessionId, endIso, startIso]
    );

    if (teamConflictRes.rows.length > 0) {
      const tc = teamConflictRes.rows[0];
      throw new ConflictError(
        `This team is already scheduled for another session between ${tc.starts_at.toISOString()} and ${tc.ends_at.toISOString()}.`,
        'TEAM_SCHEDULE_CONFLICT'
      );
    }
  }

}

async function lockScheduleResources(client, { panelId, teamId }) {
  const resourceIds = [];
  if (teamId) {
    resourceIds.push(`team:${teamId}`);
  }

  const judgeRes = await client.query(
    `SELECT judge_user_id
     FROM evaluation_panel_judges
     WHERE panel_id = $1
     ORDER BY judge_user_id`,
    [panelId]
  );
  for (const row of judgeRes.rows) {
    resourceIds.push(`judge:${row.judge_user_id}`);
  }

  for (const resourceId of resourceIds) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [resourceId]);
  }
}

/**
 * Creates a single evaluation session.
 */
export async function createEvaluationSession(
  organisationId,
  eventId,
  roundId,
  data,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const {
    panelId,
    teamId,
    startsAt,
    endsAt,
    slotIndex = 1,
    meetingUrl = null,
    evaluationOrder = 1,
  } = data;

  if (!panelId || !teamId || !startsAt || !endsAt) {
    throw new ValidationError('panelId, teamId, startsAt, and endsAt are required.');
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    throw new ValidationError('endsAt must be strictly after startsAt.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify round evaluation
    const evalRes = await client.query(
      `SELECT id, buffer_minutes, evaluation_mode FROM round_evaluations WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );
    if (evalRes.rows.length === 0) {
      throw new NotFoundError('Evaluation configuration not found.', 'EVALUATION_NOT_FOUND');
    }
    const { id: evalId, buffer_minutes: bufferMinutes } = evalRes.rows[0];

    // 2. Verify panel belongs to evaluation and lock
    const panelRes = await client.query(
      `SELECT id, meeting_url FROM evaluation_panels WHERE id = $1 AND round_evaluation_id = $2 FOR UPDATE`,
      [panelId, evalId]
    );
    if (panelRes.rows.length === 0) {
      throw new NotFoundError('Evaluation panel not found in this evaluation.', 'PANEL_NOT_FOUND');
    }
    const defaultUrl = panelRes.rows[0].meeting_url;

    // 3. Verify team belongs to event
    const teamRes = await client.query(
      `SELECT id, name FROM event_teams WHERE id = $1 AND event_id = $2`,
      [teamId, eventId]
    );
    if (teamRes.rows.length === 0) {
      throw new NotFoundError('Team not found in this event.', 'TEAM_NOT_FOUND');
    }

    const submissionRes = await client.query(
      `SELECT id, event_id, team_id, round_id
       FROM event_submissions
       WHERE id = COALESCE($1::uuid, NULL)
         AND organisation_id = $2
         AND event_id = $3`,
      [data.submissionId || null, organisationId, eventId]
    );
    if (data.submissionId && submissionRes.rows.length === 0) {
      throw new NotFoundError('Submission not found in this event.', 'SUBMISSION_NOT_FOUND');
    }
    if (data.submissionId) {
      const submission = submissionRes.rows[0];
      if (submission.team_id !== teamId || submission.round_id !== roundId) {
        throw new ValidationError('Submission must belong to the selected team and round.', 'SUBMISSION_SCOPE_MISMATCH');
      }
    }

    // Serialize reservations for the team and all judges assigned to the panel.
    await lockScheduleResources(client, { panelId, teamId });

    // 4. Assert zero conflict with transaction-scoped resource locks
    await assertNoScheduleConflicts(client, {
      panelId,
      teamId,
      startsAt: start,
      endsAt: end,
      bufferMinutes,
    });

    // 5. Insert session
    const insertRes = await client.query(
      `
      INSERT INTO evaluation_sessions (
        organisation_id, event_id, round_evaluation_id, panel_id, team_id,
        slot_index, starts_at, ends_at, meeting_url, status, submission_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10)
      RETURNING *
    `,
      [
        organisationId,
        eventId,
        evalId,
        panelId,
        teamId,
        Number(slotIndex) || 1,
        start,
        end,
        meetingUrl ? meetingUrl.trim() : (defaultUrl || null),
        data.submissionId || null,
      ]
    );

    const session = insertRes.rows[0];

    // 6. Synchronise panel judges with event_judge_assignments for this team's submission
    await client.query(
      `
      INSERT INTO event_judge_assignments (
        organisation_id, event_id, round_id, judge_user_id, submission_id,
        assigned_by_id, source, evaluation_panel_id, evaluation_session_id
      )
      SELECT 
        $1, $2, $3, epj.judge_user_id, s.id, $4, 'evaluation_panel', $5, $6
      FROM evaluation_panel_judges epj
      JOIN event_submissions s ON s.team_id = $7 AND s.round_id = $3
      WHERE epj.panel_id = $5
      ON CONFLICT (event_id, round_id, judge_user_id, submission_id) DO NOTHING
    `,
      [organisationId, eventId, roundId, actorUserId, panelId, session.id, teamId]
    );

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.session.created',
      entityType: 'evaluation_session',
      entityId: session.id,
      metadata: { eventId, roundId, panelId, teamId, startsAt: start.toISOString() },
      ipAddress,
      userAgent,
      client,
    });

    return projectSessionForCaller(session, { isOrganiser: true });
  });
}

export async function createEvaluationJudgeInvitation(
  organisationId,
  eventId,
  roundId,
  panelId,
  invitedEmail,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const email = String(invitedEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new ValidationError('A valid invited email is required.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const scopeRes = await client.query(
      `SELECT re.id AS evaluation_id, p.id AS panel_id
       FROM round_evaluations re
       JOIN evaluation_panels p ON p.round_evaluation_id = re.id
       WHERE re.organisation_id = $1 AND re.event_id = $2 AND re.round_id = $3 AND p.id = $4`,
      [organisationId, eventId, roundId, panelId]
    );
    if (scopeRes.rows.length === 0) throw new NotFoundError('Evaluation panel not found.', 'PANEL_NOT_FOUND');

    const existing = await client.query(
      `SELECT epj.id FROM evaluation_panel_judges epj
       JOIN users u ON u.id = epj.judge_user_id
       WHERE epj.panel_id = $1 AND LOWER(u.email) = $2`,
      [panelId, email]
    );
    if (existing.rows.length > 0) throw new ConflictError('This user is already assigned to the panel.', 'JUDGE_ALREADY_ASSIGNED');

    await client.query(
      `UPDATE evaluation_judge_invitations
       SET status = 'revoked'
       WHERE organisation_id = $1 AND panel_id = $2 AND LOWER(invited_email) = $3 AND status = 'pending'`,
      [organisationId, panelId, email]
    );

    const rawToken = generateSecureToken(32);
    const insertRes = await client.query(
      `INSERT INTO evaluation_judge_invitations
       (organisation_id, event_id, round_evaluation_id, panel_id, invited_by_id, invited_email, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '7 days')
       RETURNING id, expires_at`,
      [organisationId, eventId, scopeRes.rows[0].evaluation_id, panelId, actorUserId, email, hashToken(rawToken)]
    );

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.judge.invitation.created',
      entityType: 'evaluation_judge_invitation',
      entityId: insertRes.rows[0].id,
      metadata: { eventId, roundId, panelId, invitedEmail: email },
      ipAddress,
      userAgent,
      client,
    });

    await sendEmail({
      to: email,
      subject: 'ManageX evaluation judge invitation',
      text: `You have been invited to judge an evaluation. Accept this invitation: ${env.FRONTEND_ORIGIN}/invitations/evaluation/${rawToken}`,
    });

    return { id: insertRes.rows[0].id, invitedEmail: email, expiresAt: insertRes.rows[0].expires_at };
  });
}

export async function acceptEvaluationJudgeInvitation(rawToken, currentUser, { ipAddress, userAgent } = {}) {
  if (!rawToken) throw new ValidationError('Invitation token is required.');
  if (!currentUser?.emailVerifiedAt) {
    throw new AuthorizationError('A verified account is required to accept this invitation.', 'EMAIL_NOT_VERIFIED');
  }
  const tokenHash = hashToken(rawToken);

  return withSystemTransaction(async (client) => {
    const invitationRes = await client.query(
      `SELECT * FROM evaluation_judge_invitations
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );
    if (invitationRes.rows.length === 0) throw new NotFoundError('Invitation not found or invalid.', 'INVITATION_NOT_FOUND');
    const invitation = invitationRes.rows[0];
    if (invitation.status !== 'pending') throw new ConflictError('This invitation is no longer active.', 'INVITATION_NOT_ACTIVE');
    if (new Date(invitation.expires_at) <= new Date()) {
      await client.query(
        "SELECT set_config('app.current_organisation_id', $1::text, true)",
        [invitation.organisation_id]
      );
      await client.query(`UPDATE evaluation_judge_invitations SET status = 'expired' WHERE id = $1`, [invitation.id]);
      throw new ValidationError('This invitation has expired.');
    }
    if (currentUser.email.toLowerCase().trim() !== invitation.invited_email.toLowerCase().trim()) {
      throw new AuthorizationError('The authenticated email does not match this invitation.', 'EMAIL_MISMATCH');
    }

    await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [invitation.organisation_id]);
    await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [currentUser.id]);
    await client.query(
      `UPDATE evaluation_judge_invitations
       SET status = 'accepted', invited_user_id = $2, accepted_at = NOW()
       WHERE id = $1`,
      [invitation.id, currentUser.id]
    );
    const assignment = await client.query(
      `INSERT INTO evaluation_panel_judges (organisation_id, round_evaluation_id, panel_id, judge_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (round_evaluation_id, judge_user_id) DO NOTHING
       RETURNING id`,
      [invitation.organisation_id, invitation.round_evaluation_id, invitation.panel_id, currentUser.id]
    );
    if (assignment.rows.length === 0) throw new ConflictError('Judge is already assigned in this evaluation.', 'JUDGE_ALREADY_ASSIGNED');
    await recordAuditEvent({
      organisationId: invitation.organisation_id,
      actorId: currentUser.id,
      action: 'evaluation.judge.invitation.accepted',
      entityType: 'evaluation_judge_invitation',
      entityId: invitation.id,
      metadata: { eventId: invitation.event_id, panelId: invitation.panel_id },
      ipAddress,
      userAgent,
      client,
    });
    return { success: true, panelId: invitation.panel_id };
  });
}

export async function revokeEvaluationJudgeInvitation(
  organisationId,
  invitationId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const result = await client.query(
      `UPDATE evaluation_judge_invitations
       SET status = 'revoked'
       WHERE id = $1 AND organisation_id = $2 AND status IN ('pending', 'accepted')
       RETURNING id, panel_id, round_evaluation_id, invited_user_id, status`,
      [invitationId, organisationId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Active evaluation invitation not found.', 'INVITATION_NOT_FOUND');
    const invitation = result.rows[0];
    if (invitation.invited_user_id) {
      await client.query(
        `DELETE FROM evaluation_panel_judges
         WHERE organisation_id = $1
           AND round_evaluation_id = $2
           AND panel_id = $3
           AND judge_user_id = $4`,
        [organisationId, invitation.round_evaluation_id, invitation.panel_id, invitation.invited_user_id]
      );
    }
    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.judge.invitation.revoked',
      entityType: 'evaluation_judge_invitation',
      entityId: invitationId,
      metadata: { panelId: invitation.panel_id, previousStatus: invitation.status },
      ipAddress,
      userAgent,
      client,
    });
    return { success: true };
  });
}

export async function completeRoundEvaluation(
  organisationId,
  eventId,
  roundId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const evaluation = await client.query(
      `SELECT * FROM round_evaluations WHERE organisation_id = $1 AND event_id = $2 AND round_id = $3 FOR UPDATE`,
      [organisationId, eventId, roundId]
    );
    if (!evaluation.rows.length) throw new NotFoundError('Evaluation configuration not found.', 'EVALUATION_NOT_FOUND');
    const ev = evaluation.rows[0];
    if (ev.status === 'completed') {
      return { success: true, status: 'completed', alreadyCompleted: true };
    }

    const incomplete = await client.query(
      `SELECT id FROM evaluation_sessions
       WHERE round_evaluation_id = $1 AND status NOT IN ('completed', 'no_show', 'cancelled')
       LIMIT 1`,
      [ev.id]
    );
    if (incomplete.rows.length) throw new ConflictError('All evaluation sessions must reach a terminal status first.', 'EVALUATION_SESSIONS_INCOMPLETE');

    const criteria = await client.query(
      `SELECT id FROM event_scoring_criteria WHERE organisation_id = $1 AND event_id = $2`,
      [organisationId, eventId]
    );
    if (!criteria.rows.length) throw new ConflictError('At least one scoring criterion is required.', 'NO_SCORING_CRITERIA');

    const missingSubmission = await client.query(
      `SELECT id FROM evaluation_sessions
       WHERE round_evaluation_id = $1 AND status = 'completed' AND submission_id IS NULL
       LIMIT 1`,
      [ev.id]
    );
    if (missingSubmission.rows.length) {
      throw new ConflictError('Every completed appointment must identify a compatible submission.', 'SUBMISSION_REQUIRED');
    }
    const missing = await client.query(
      `SELECT es.id
       FROM evaluation_sessions es
       WHERE es.round_evaluation_id = $1 AND es.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM event_scores sc
           WHERE sc.submission_id = es.submission_id AND sc.event_id = $2
           GROUP BY sc.submission_id
           HAVING COUNT(DISTINCT sc.criterion_id) >= $3
         )
       LIMIT 1`,
      [ev.id, eventId, criteria.rows.length]
    );
    if (missing.rows.length) throw new ConflictError('Required scores are incomplete.', 'EVALUATION_SCORES_INCOMPLETE');

    const updated = await client.query(
      `UPDATE round_evaluations SET status = 'completed', updated_at = NOW() WHERE id = $1 RETURNING status`,
      [ev.id]
    );
    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.completed',
      entityType: 'round_evaluation',
      entityId: ev.id,
      metadata: { eventId, roundId },
      ipAddress,
      userAgent,
      client,
    });
    return { success: true, status: updated.rows[0].status };
  });
}

/**
 * Auto-generates a complete evaluation schedule using the
 * "Fixed Judge Panels with Rotating Teams" algorithm.
 */
export async function generateEvaluationSchedule(
  organisationId,
  eventId,
  roundId,
  options = {},
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Lock round_evaluations row
    const evalRes = await client.query(
      `SELECT * FROM round_evaluations WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3 FOR UPDATE`,
      [roundId, eventId, organisationId]
    );

    if (evalRes.rows.length === 0) {
      throw new NotFoundError('Evaluation configuration not found.', 'EVALUATION_NOT_FOUND');
    }

    const ev = evalRes.rows[0];

    // 2. Fetch panels and lock
    const panelsRes = await client.query(
      `SELECT * FROM evaluation_panels WHERE round_evaluation_id = $1 ORDER BY order_index ASC FOR UPDATE`,
      [ev.id]
    );

    if (panelsRes.rows.length === 0) {
      throw new ConflictError('Cannot generate schedule without at least one evaluation panel. Create panels first.', 'NO_PANELS');
    }

    const panels = panelsRes.rows;

    // 3. Determine eligible teams
    let teamIds = options.teamIds;
    if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
      // Find teams that submitted in this round, or are registered for the event
      const teamRes = await client.query(
        `
        SELECT DISTINCT t.id, t.name
        FROM event_teams t
        WHERE t.event_id = $1 AND t.organisation_id = $2
        ORDER BY t.name ASC
      `,
        [eventId, organisationId]
      );
      teamIds = teamRes.rows.map((r) => r.id);
    }

    if (teamIds.length === 0) {
      throw new ConflictError('No eligible teams found to schedule for evaluation.', 'NO_TEAMS_FOUND');
    }

    const validTeamsRes = await client.query(
      `SELECT id FROM event_teams WHERE organisation_id = $1 AND event_id = $2 AND id = ANY($3::uuid[])`,
      [organisationId, eventId, teamIds]
    );
    if (validTeamsRes.rows.length !== teamIds.length) {
      throw new ValidationError('All scheduled teams must belong to the selected event.');
    }
    const submissionsRes = await client.query(
      `SELECT id, team_id
       FROM event_submissions
       WHERE organisation_id = $1 AND event_id = $2 AND round_id = $3
         AND team_id = ANY($4::uuid[]) AND status = 'submitted'`,
      [organisationId, eventId, roundId, teamIds]
    );
    const submissionByTeam = new Map(submissionsRes.rows.map((row) => [row.team_id, row.id]));

    // 4. Determine schedule start instant
    let startInstant = ev.schedule_starts_at ? new Date(ev.schedule_starts_at) : null;
    if (options.scheduleStartsAt) {
      startInstant = new Date(options.scheduleStartsAt);
    }
    if (!startInstant || isNaN(startInstant.getTime())) {
      startInstant = new Date(Date.now() + 60 * 60 * 1000); // Default: 1 hour from now
    }

    const durationMins = ev.session_duration_minutes;
    const bufferMins = ev.buffer_minutes;
    const slotDurationMs = (durationMins + bufferMins) * 60 * 1000;

    // 5. Clean up existing uncompleted sessions if overwrite requested
    if (options.overwriteExisting === true) {
      await client.query(
        `DELETE FROM evaluation_sessions WHERE round_evaluation_id = $1 AND status = 'scheduled'`,
        [ev.id]
      );
      await client.query(
        `DELETE FROM event_judge_assignments WHERE round_id = $1 AND source = 'evaluation_panel' AND evaluation_session_id IS NOT NULL`,
        [roundId]
      );
    }

    // 6. Scheduling Algorithm: Distribute teams across panels and time slots
    // "Fixed Judge Panels with Rotating Teams"
    const scheduledSessions = [];
    const evalsPerTeam = ev.evaluations_per_team || 1;

    for (let evalOrder = 1; evalOrder <= evalsPerTeam; evalOrder++) {
      let panelIndex = 0;
      let slotIndex = 1;

      for (let i = 0; i < teamIds.length; i++) {
        const teamId = teamIds[i];
        const assignedPanel = panels[(panelIndex + evalOrder - 1) % panels.length];

        const sessionStartMs = startInstant.getTime() + (slotIndex - 1) * slotDurationMs;
        const sessionStartsAt = new Date(sessionStartMs);
        const sessionEndsAt = new Date(sessionStartMs + durationMins * 60 * 1000);

        scheduledSessions.push({
          panelId: assignedPanel.id,
          teamId,
          slotIndex,
          startsAt: sessionStartsAt,
          endsAt: sessionEndsAt,
          meetingUrl: assignedPanel.meeting_url || ev.default_meeting_url,
          submissionId: submissionByTeam.get(teamId) || null,
          evaluationOrder: evalOrder,
        });

        panelIndex++;
        if (panelIndex >= panels.length) {
          panelIndex = 0;
          slotIndex++;
        }

        if (ev.schedule_ends_at && scheduledSessions.some((session) => session.endsAt > new Date(ev.schedule_ends_at))) {
          throw new ConflictError('The configured schedule window cannot fit all required appointments.', 'SCHEDULE_CAPACITY_EXCEEDED');
        }
      }
    }

    // 7. Insert all generated sessions
    const createdSessionIds = [];
    for (const s of scheduledSessions) {
      await lockScheduleResources(client, { panelId: s.panelId, teamId: s.teamId });
      await assertNoScheduleConflicts(client, {
        panelId: s.panelId,
        teamId: s.teamId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        bufferMinutes: bufferMins,
      });

      const ins = await client.query(
        `
        INSERT INTO evaluation_sessions (
          organisation_id, event_id, round_evaluation_id, panel_id, team_id,
          slot_index, starts_at, ends_at, meeting_url, status, submission_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10)
        RETURNING id
      `,
        [
          organisationId,
          eventId,
          ev.id,
          s.panelId,
          s.teamId,
          s.slotIndex,
          s.startsAt,
          s.endsAt,
          s.meetingUrl,
          s.submissionId,
        ]
      );
      createdSessionIds.push(ins.rows[0].id);

      // Synchronise judge assignments for this team's submission
      await client.query(
        `
        INSERT INTO event_judge_assignments (
          organisation_id, event_id, round_id, judge_user_id, submission_id,
          assigned_by_id, source, evaluation_panel_id, evaluation_session_id
        )
        SELECT 
          $1, $2, $3, epj.judge_user_id, s.id, $4, 'evaluation_panel', $5, $6
        FROM evaluation_panel_judges epj
        JOIN event_submissions s ON s.team_id = $7 AND s.round_id = $3
        WHERE epj.panel_id = $5
        ON CONFLICT (event_id, round_id, judge_user_id, submission_id) DO NOTHING
      `,
        [organisationId, eventId, roundId, actorUserId, s.panelId, ins.rows[0].id, s.teamId]
      );
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.schedule.generated',
      entityType: 'round_evaluation',
      entityId: ev.id,
      metadata: { eventId, roundId, sessionsCount: createdSessionIds.length, teamsCount: teamIds.length },
      ipAddress,
      userAgent,
      client,
    });

    return {
      success: true,
      roundId,
      sessionsGenerated: createdSessionIds.length,
      teamsScheduled: teamIds.length,
      panelsUsed: panels.length,
    };
  });
}

/**
 * Reschedules an evaluation session.
 */
export async function rescheduleEvaluationSession(
  organisationId,
  eventId,
  roundId,
  sessionId,
  { startsAt, endsAt, panelId = null },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!startsAt || !endsAt) {
    throw new ValidationError('startsAt and endsAt are required to reschedule.');
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    throw new ValidationError('endsAt must be strictly after startsAt.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Fetch session and lock
    const sessionRes = await client.query(
      `
      SELECT es.*, re.buffer_minutes
      FROM evaluation_sessions es
      JOIN round_evaluations re ON re.id = es.round_evaluation_id
      WHERE es.id = $1 AND es.event_id = $2 AND es.organisation_id = $3 AND re.round_id = $4
      FOR UPDATE
    `,
      [sessionId, eventId, organisationId, roundId]
    );

    if (sessionRes.rows.length === 0) {
      throw new NotFoundError('Evaluation session not found.', 'SESSION_NOT_FOUND');
    }

    const session = sessionRes.rows[0];
    if (session.status === 'cancelled') {
      throw new ConflictError('Cannot reschedule a cancelled session.', 'SESSION_ALREADY_CANCELLED');
    }

    const targetPanelId = panelId || session.panel_id;

    // 2. Lock target panel and verify
    const panelRes = await client.query(
      `SELECT id, meeting_url FROM evaluation_panels WHERE id = $1 AND round_evaluation_id = $2 FOR UPDATE`,
      [targetPanelId, session.round_evaluation_id]
    );
    if (panelRes.rows.length === 0) {
      throw new NotFoundError('Target evaluation panel not found.', 'PANEL_NOT_FOUND');
    }

    await lockScheduleResources(client, { panelId: targetPanelId, teamId: session.team_id });

    // 3. Concurrency-safe conflict check
    await assertNoScheduleConflicts(client, {
      panelId: targetPanelId,
      teamId: session.team_id,
      startsAt: start,
      endsAt: end,
      bufferMinutes: session.buffer_minutes,
      excludeSessionId: sessionId,
    });

    // 4. Update session
    const updateRes = await client.query(
      `
      UPDATE evaluation_sessions
      SET
        starts_at = $1,
        ends_at = $2,
        panel_id = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `,
      [start, end, targetPanelId, sessionId]
    );

    const updated = updateRes.rows[0];

    // 5. Reconcile judge assignments if panel changed
    if (targetPanelId !== session.panel_id) {
      // Remove old panel judge assignments for this session
      await client.query(
        `DELETE FROM event_judge_assignments WHERE evaluation_session_id = $1 AND source = 'evaluation_panel'`,
        [sessionId]
      );
      // Synchronise new panel judges
      await client.query(
        `
        INSERT INTO event_judge_assignments (
          organisation_id, event_id, round_id, judge_user_id, submission_id,
          assigned_by_id, source, evaluation_panel_id, evaluation_session_id
        )
        SELECT 
          $1, $2, $3, epj.judge_user_id, s.id, $4, 'evaluation_panel', $5, $6
        FROM evaluation_panel_judges epj
        JOIN event_submissions s ON s.team_id = $7 AND s.round_id = $3
        WHERE epj.panel_id = $5
        ON CONFLICT (event_id, round_id, judge_user_id, submission_id) DO NOTHING
      `,
        [organisationId, eventId, roundId, actorUserId, targetPanelId, sessionId, session.team_id]
      );
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.session.rescheduled',
      entityType: 'evaluation_session',
      entityId: sessionId,
      metadata: { eventId, roundId, panelId: targetPanelId, startsAt: start.toISOString(), endsAt: end.toISOString() },
      ipAddress,
      userAgent,
      client,
    });

    return projectSessionForCaller(updated, { isOrganiser: true });
  });
}

/**
 * Cancels an evaluation session while preserving history and auditability.
 */
export async function cancelEvaluationSession(
  organisationId,
  eventId,
  roundId,
  sessionId,
  { reason = null, cancellationReason = null } = {},
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const res = await client.query(
      `
      UPDATE evaluation_sessions
      SET status = 'cancelled', updated_at = NOW()
      FROM round_evaluations re
      WHERE evaluation_sessions.id = $1
        AND evaluation_sessions.event_id = $2
        AND evaluation_sessions.organisation_id = $3
        AND evaluation_sessions.round_evaluation_id = re.id
        AND re.round_id = $4
      RETURNING *
    `,
      [sessionId, eventId, organisationId, roundId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Evaluation session not found.', 'SESSION_NOT_FOUND');
    }

    const cancelled = res.rows[0];

    // Remove session-specific judge assignments
    await client.query(
      `DELETE FROM event_judge_assignments WHERE evaluation_session_id = $1 AND source = 'evaluation_panel'`,
      [sessionId]
    );

    const auditReason = cancellationReason || reason;
    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.session.cancelled',
      entityType: 'evaluation_session',
      entityId: sessionId,
      metadata: { eventId, roundId, sessionId, reason: auditReason ? auditReason.trim() : null },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true, sessionId, status: 'cancelled' };
  });
}

/**
 * Updates status of an evaluation session (in_progress, completed, no_show).
 */
export async function updateSessionStatus(
  organisationId,
  eventId,
  roundId,
  sessionId,
  { status },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const validStatuses = ['scheduled', 'in_progress', 'completed', 'no_show', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid session status: ${status}. Must be one of: ${validStatuses.join(', ')}.`);
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const res = await client.query(
      `
      UPDATE evaluation_sessions es
      SET status = $1, updated_at = NOW()
      FROM round_evaluations re
      WHERE es.id = $2
        AND es.event_id = $3
        AND es.organisation_id = $4
        AND es.round_evaluation_id = re.id
        AND re.round_id = $5
      RETURNING *
    `,
      [status, sessionId, eventId, organisationId, roundId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Evaluation session not found.', 'SESSION_NOT_FOUND');
    }

    const updated = res.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.session.status_updated',
      entityType: 'evaluation_session',
      entityId: sessionId,
      metadata: { eventId, roundId, status },
      ipAddress,
      userAgent,
      client,
    });

    return projectSessionForCaller(updated, { isOrganiser: true });
  });
}

// -----------------------------------------------------------------------------
// 5. Scoped List Sessions
// -----------------------------------------------------------------------------

/**
 * Lists evaluation sessions according to caller scope.
 */
export async function listEvaluationSessions(
  organisationId,
  eventId,
  roundId,
  callerContext = {},
  filters = {}
) {
  return withTenantTransaction({ organisationId, userId: callerContext.userId }, async (client) => {
    // 1. Get round evaluation
    const evalRes = await client.query(
      `SELECT id, status, default_meeting_url FROM round_evaluations WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );

    if (evalRes.rows.length === 0) {
      return { sessions: [] };
    }

    const ev = evalRes.rows[0];
    let isOrganiser = callerContext.isOrganiser === true;
    let isJudge = callerContext.isJudge === true;

    if (!isOrganiser && !isJudge && callerContext.userId) {
      const judgeCheck = await client.query(
        `SELECT 1 FROM evaluation_panel_judges WHERE round_evaluation_id = $1 AND judge_user_id = $2`,
        [ev.id, callerContext.userId]
      );
      if (judgeCheck.rows.length > 0) {
        isJudge = true;
      }
    }
    const isParticipant = callerContext.isParticipant === true;

    // Build query with joins for team name and panel name
    let sql = `
      SELECT 
        es.*,
        ep.order_index AS panel_number,
        ep.name AS panel_name,
        t.name AS team_name
      FROM evaluation_sessions es
      JOIN evaluation_panels ep ON ep.id = es.panel_id
      JOIN event_teams t ON t.id = es.team_id
      WHERE es.round_evaluation_id = $1 AND es.organisation_id = $2
    `;
    const params = [ev.id, organisationId];
    let paramIdx = 3;

    // If caller is an external judge (not organiser): filter to judge's panel
    if (isJudge && !isOrganiser) {
      sql += ` AND es.panel_id IN (
        SELECT panel_id FROM evaluation_panel_judges 
        WHERE round_evaluation_id = $1 AND judge_user_id = $${paramIdx}
      )`;
      params.push(callerContext.userId);
      paramIdx++;
    }

    // If caller is not organiser and not judge:
    // They can ONLY see their own team's session if schedule is published!
    if (!isOrganiser && !isJudge) {
      if (ev.status !== 'published') {
        return { sessions: [] }; // Unpublished schedule is hidden from participants
      }
      sql += ` AND es.team_id IN (
        SELECT team_id FROM event_team_members WHERE user_id = $${paramIdx}
      ) AND es.status != 'cancelled'`;
      params.push(callerContext.userId);
      paramIdx++;
    }

    if (filters.panelId) {
      sql += ` AND es.panel_id = $${paramIdx}`;
      params.push(filters.panelId);
      paramIdx++;
    }

    if (filters.status) {
      sql += ` AND es.status = $${paramIdx}`;
      params.push(filters.status);
      paramIdx++;
    }

    sql += ` ORDER BY es.starts_at ASC, es.slot_index ASC, ep.order_index ASC, es.id ASC`;

    const res = await client.query(sql, params);

    // Fetch judges for panels if organiser or judge
    let judgesByPanel = {};
    if (isOrganiser || isJudge) {
      const jRes = await client.query(
        `
        SELECT epj.panel_id, epj.judge_user_id, u.full_name, u.email
        FROM evaluation_panel_judges epj
        JOIN users u ON u.id = epj.judge_user_id
        WHERE epj.round_evaluation_id = $1
      `,
        [ev.id]
      );
      for (const j of jRes.rows) {
        if (!judgesByPanel[j.panel_id]) judgesByPanel[j.panel_id] = [];
        judgesByPanel[j.panel_id].push({
          judgeUserId: j.judge_user_id,
          judgeName: j.full_name,
          judgeEmail: isOrganiser ? j.email : null,
        });
      }
    }

    const sessions = res.rows.map((row) => {
      row.judges = judgesByPanel[row.panel_id] || [];
      return projectSessionForCaller(row, {
        isOrganiser,
        isJudge,
        callerUserId: callerContext.userId,
      });
    });

    return { sessions };
  });
}

// -----------------------------------------------------------------------------
// 6. Publication Lifecycle
// -----------------------------------------------------------------------------

/**
 * Publishes evaluation schedule for participants.
 */
export async function publishEvaluationSchedule(
  organisationId,
  eventId,
  roundId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const res = await client.query(
      `
      UPDATE round_evaluations
      SET status = 'published', updated_at = NOW()
      WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3
      RETURNING *
    `,
      [roundId, eventId, organisationId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Round evaluation not found.', 'EVALUATION_NOT_FOUND');
    }

    const ev = res.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.published',
      entityType: 'round_evaluation',
      entityId: ev.id,
      metadata: { eventId, roundId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true, roundId, status: 'published' };
  });
}

/**
 * Unpublishes evaluation schedule, immediately hiding sessions and meeting links.
 */
export async function unpublishEvaluationSchedule(
  organisationId,
  eventId,
  roundId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const res = await client.query(
      `
      UPDATE round_evaluations
      SET status = 'draft', updated_at = NOW()
      WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3
      RETURNING *
    `,
      [roundId, eventId, organisationId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Round evaluation not found.', 'EVALUATION_NOT_FOUND');
    }

    const ev = res.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.unpublished',
      entityType: 'round_evaluation',
      entityId: ev.id,
      metadata: { eventId, roundId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true, roundId, status: 'draft' };
  });
}

/**
 * Helper to retrieve a valid Google access token or throw a clear, friendly error.
 */
async function getGoogleAccessTokenForOrg(organisationId) {
  try {
    const authResult = await refreshAccessToken({ organisationId });
    if (!authResult || !authResult.accessToken) {
      throw new Error('No access token returned');
    }
    return authResult.accessToken;
  } catch (err) {
    throw new ValidationError(
      'Google integration is not connected or authorization expired. Please connect your Google account in Organisation Settings -> Integrations.',
      'GOOGLE_NOT_CONNECTED'
    );
  }
}

/**
 * Generates an automated Google Meet room for the Round Evaluation's default meeting URL.
 */
export async function generateDefaultMeetingUrl(
  organisationId,
  eventId,
  roundId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const accessToken = await getGoogleAccessTokenForOrg(organisationId);

  const { eventTitle, roundName, timezone, startAt, endAt } = await withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      const res = await client.query(
        `SELECT e.title AS event_title, e.timezone, e.start_at, e.end_at, r.name AS round_name, re.schedule_starts_at, re.schedule_ends_at
         FROM events e
         JOIN event_rounds r ON r.id = $1 AND r.event_id = e.id
         LEFT JOIN round_evaluations re ON re.round_id = r.id
         WHERE e.id = $2 AND e.organisation_id = $3`,
        [roundId, eventId, organisationId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError('Event or round not found.', 'NOT_FOUND');
      }
      const row = res.rows[0];
      return {
        eventTitle: row.event_title,
        roundName: row.round_name,
        timezone: row.timezone || 'UTC',
        startAt: row.schedule_starts_at || row.start_at || new Date().toISOString(),
        endAt: row.schedule_ends_at || row.end_at || new Date(Date.now() + 3600000).toISOString(),
      };
    }
  );

  const googleEventId = `meet${randomUUID().replace(/-/g, '').toLowerCase()}`;
  const conferenceRequestId = randomUUID();
  const summary = `ManageX - ${eventTitle} (${roundName}) Evaluation`;
  const description = `Main evaluation room for ${eventTitle} - ${roundName}. Generated by ManageX.`;

  const calendarRes = await createCalendarEvent({
    accessToken,
    eventId: googleEventId,
    summary,
    description,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    timezone,
    conferenceRequestId,
  });

  const meetingUrl = calendarRes.hangoutLink;
  if (!meetingUrl) {
    throw new ValidationError('Google Calendar did not return a valid Google Meet link.', 'GOOGLE_MEET_FAILED');
  }

  await withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    await client.query(
      `UPDATE round_evaluations
       SET default_meeting_url = $1, updated_at = NOW()
       WHERE round_id = $2 AND event_id = $3 AND organisation_id = $4`,
      [meetingUrl, roundId, eventId, organisationId]
    );

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.default_meet_generated',
      entityType: 'round_evaluation',
      entityId: roundId,
      metadata: { eventId, roundId, meetingUrl },
      ipAddress,
      userAgent,
      client,
    });
  });

  return { meetingUrl };
}

/**
 * Generates an automated Google Meet room for a specific evaluation panel.
 */
export async function generatePanelMeetingUrl(
  organisationId,
  eventId,
  roundId,
  panelId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const accessToken = await getGoogleAccessTokenForOrg(organisationId);

  const { eventTitle, panelName, panelOrder, timezone, startAt, endAt } = await withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      const res = await client.query(
        `SELECT ep.name AS panel_name, ep.order_index, e.title AS event_title, e.timezone, e.start_at, e.end_at, re.schedule_starts_at, re.schedule_ends_at
         FROM evaluation_panels ep
         JOIN round_evaluations re ON re.id = ep.round_evaluation_id
         JOIN events e ON e.id = ep.event_id
         WHERE ep.id = $1 AND re.round_id = $2 AND ep.organisation_id = $3`,
        [panelId, roundId, organisationId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError('Evaluation panel not found.', 'PANEL_NOT_FOUND');
      }
      const row = res.rows[0];
      return {
        eventTitle: row.event_title,
        panelName: row.panel_name,
        panelOrder: row.order_index,
        timezone: row.timezone || 'UTC',
        startAt: row.schedule_starts_at || row.start_at || new Date().toISOString(),
        endAt: row.schedule_ends_at || row.end_at || new Date(Date.now() + 3600000).toISOString(),
      };
    }
  );

  const googleEventId = `meet${randomUUID().replace(/-/g, '').toLowerCase()}`;
  const conferenceRequestId = randomUUID();
  const summary = `ManageX - Panel ${panelOrder}: ${panelName} (${eventTitle})`;
  const description = `Live judging room for Panel ${panelOrder}: ${panelName}. Generated by ManageX.`;

  const calendarRes = await createCalendarEvent({
    accessToken,
    eventId: googleEventId,
    summary,
    description,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    timezone,
    conferenceRequestId,
  });

  const meetingUrl = calendarRes.hangoutLink;
  if (!meetingUrl) {
    throw new ValidationError('Google Calendar did not return a valid Google Meet link.', 'GOOGLE_MEET_FAILED');
  }

  const updatedPanel = await withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const updateRes = await client.query(
      `UPDATE evaluation_panels
       SET meeting_url = $1, updated_at = NOW()
       WHERE id = $2 AND organisation_id = $3
       RETURNING *`,
      [meetingUrl, panelId, organisationId]
    );

    // Synchronize meeting URL to any sessions on this panel
    await client.query(
      `UPDATE evaluation_sessions
       SET meeting_url = $1, updated_at = NOW()
       WHERE panel_id = $2 AND organisation_id = $3`,
      [meetingUrl, panelId, organisationId]
    );

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.panel_meet_generated',
      entityType: 'evaluation_panel',
      entityId: panelId,
      metadata: { eventId, roundId, panelId, meetingUrl },
      ipAddress,
      userAgent,
      client,
    });

    return updateRes.rows[0];
  });

  return { panel: updatedPanel, meetingUrl };
}

/**
 * Bulk generates unique Google Meet rooms for all panels in a round that lack meeting links.
 */
export async function bulkGeneratePanelsMeetingUrls(
  organisationId,
  eventId,
  roundId,
  actorUserId,
  { overwriteExisting = false, ipAddress, userAgent } = {}
) {
  const accessToken = await getGoogleAccessTokenForOrg(organisationId);

  const { panels, eventTitle, timezone, startAt, endAt } = await withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      const evalRes = await client.query(
        `SELECT re.id, re.schedule_starts_at, re.schedule_ends_at, e.title AS event_title, e.timezone, e.start_at, e.end_at
         FROM round_evaluations re
         JOIN events e ON e.id = re.event_id
         WHERE re.round_id = $1 AND re.organisation_id = $2`,
        [roundId, organisationId]
      );
      if (evalRes.rows.length === 0) {
        throw new NotFoundError('Round evaluation not found.', 'EVALUATION_NOT_FOUND');
      }
      const evRow = evalRes.rows[0];

      const panelsRes = await client.query(
        `SELECT * FROM evaluation_panels WHERE round_evaluation_id = $1 AND organisation_id = $2 ORDER BY order_index ASC`,
        [evRow.id, organisationId]
      );

      return {
        panels: panelsRes.rows,
        eventTitle: evRow.event_title,
        timezone: evRow.timezone || 'UTC',
        startAt: evRow.schedule_starts_at || evRow.start_at || new Date().toISOString(),
        endAt: evRow.schedule_ends_at || evRow.end_at || new Date(Date.now() + 3600000).toISOString(),
      };
    }
  );

  const targets = overwriteExisting
    ? panels
    : panels.filter((p) => !p.meeting_url || p.meeting_url.trim() === '');

  if (targets.length === 0) {
    return {
      updatedCount: 0,
      totalPanels: panels.length,
      message: 'All panels already have meeting links configured.',
    };
  }

  const generated = [];
  for (const panel of targets) {
    const googleEventId = `meet${randomUUID().replace(/-/g, '').toLowerCase()}`;
    const conferenceRequestId = randomUUID();
    const summary = `ManageX - Panel ${panel.order_index}: ${panel.name} (${eventTitle})`;
    const description = `Live judging room for Panel ${panel.order_index}: ${panel.name}. Generated by ManageX.`;

    const calRes = await createCalendarEvent({
      accessToken,
      eventId: googleEventId,
      summary,
      description,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      timezone,
      conferenceRequestId,
    });

    if (calRes.hangoutLink) {
      generated.push({ panelId: panel.id, meetingUrl: calRes.hangoutLink });
    }
  }

  await withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    for (const item of generated) {
      await client.query(
        `UPDATE evaluation_panels SET meeting_url = $1, updated_at = NOW() WHERE id = $2 AND organisation_id = $3`,
        [item.meetingUrl, item.panelId, organisationId]
      );

      await client.query(
        `UPDATE evaluation_sessions SET meeting_url = $1, updated_at = NOW() WHERE panel_id = $2 AND organisation_id = $3`,
        [item.meetingUrl, item.panelId, organisationId]
      );
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'evaluation.panels_bulk_meet_generated',
      entityType: 'round_evaluation',
      entityId: roundId,
      metadata: { eventId, roundId, count: generated.length },
      ipAddress,
      userAgent,
      client,
    });
  });

  return {
    updatedCount: generated.length,
    totalPanels: panels.length,
  };
}
