/**
 * ManageX Event Judging, Scoring & Results Service
 * Strictly adheres to PRD Section 7.4 (EVT-008, EVT-009) and ADR-009.
 * 
 * Rules:
 * - Straight sum of criteria scores (1..100). No weights or hidden tie-breaks.
 * - Tied totals share ranks.
 * - Judges can list and view ONLY their assigned work.
 * - Unpublished scores and internal feedback remain private until explicitly published.
 * - Publication requires all assigned judges to have scored all criteria for all evaluated submissions.
 */

import { withTenantTransaction, withSystemTransaction } from '../database/transaction.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../common/errors.js';
import { recordAuditEvent } from '../audit/auditService.js';

// -----------------------------------------------------------------------------
// 1. Scoring Criteria (EVT-008)
// -----------------------------------------------------------------------------

export async function createScoringCriterion(
  organisationId,
  eventId,
  { name, description, orderIndex = 0, maxScore = 100 },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!name || !name.trim()) {
    throw new ValidationError('Criterion name is required.');
  }

  const parsedMax = Number(maxScore);
  if (!Number.isInteger(parsedMax) || parsedMax <= 0 || parsedMax > 100) {
    throw new ValidationError('Criterion maximum score must be an integer between 1 and 100.');
  }

  const parsedOrder = Number.isInteger(Number(orderIndex)) ? Number(orderIndex) : 0;

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify event exists
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    // 2. Criteria changes after scoring starts must be blocked (EVT-008)
    const scoreCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM event_scores WHERE event_id = $1`,
      [eventId]
    );

    if (scoreCountRes.rows[0].count > 0) {
      throw new ConflictError(
        'Cannot add or modify scoring criteria after judging has started.',
        'SCORING_ALREADY_STARTED'
      );
    }

    // 3. Insert criterion
    const insertSql = `
      INSERT INTO event_scoring_criteria (
        organisation_id,
        event_id,
        name,
        description,
        order_index,
        max_score
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    try {
      const res = await client.query(insertSql, [
        organisationId,
        eventId,
        name.trim(),
        description ? description.trim() : null,
        parsedOrder,
        parsedMax,
      ]);

      const criterion = res.rows[0];

      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'event.criterion.created',
        entityType: 'event_scoring_criterion',
        entityId: criterion.id,
        metadata: { eventId, criterionName: criterion.name, maxScore: criterion.max_score },
        ipAddress,
        userAgent,
        client,
      });

      return {
        id: criterion.id,
        organisationId: criterion.organisation_id,
        eventId: criterion.event_id,
        name: criterion.name,
        description: criterion.description,
        orderIndex: criterion.order_index,
        maxScore: criterion.max_score,
        createdAt: criterion.created_at.toISOString(),
      };
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictError(
          `A criterion with the name "${name.trim()}" already exists for this event.`,
          'CRITERION_NAME_EXISTS'
        );
      }
      throw err;
    }
  });
}

export async function listScoringCriteria(organisationId, eventId) {
  return withTenantTransaction({ organisationId }, async (client) => {
    const res = await client.query(
      `SELECT * FROM event_scoring_criteria 
       WHERE event_id = $1 AND organisation_id = $2
       ORDER BY order_index ASC, created_at ASC`,
      [eventId, organisationId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      organisationId: row.organisation_id,
      eventId: row.event_id,
      name: row.name,
      description: row.description,
      orderIndex: row.order_index,
      maxScore: row.max_score,
      createdAt: row.created_at.toISOString(),
    }));
  });
}

export async function deleteScoringCriterion(
  organisationId,
  eventId,
  criterionId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const scoreCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM event_scores WHERE criterion_id = $1`,
      [criterionId]
    );

    if (scoreCountRes.rows[0].count > 0) {
      throw new ConflictError(
        'Cannot delete criterion because scores have already been recorded.',
        'SCORING_ALREADY_STARTED'
      );
    }

    const delRes = await client.query(
      `DELETE FROM event_scoring_criteria 
       WHERE id = $1 AND event_id = $2 AND organisation_id = $3
       RETURNING *`,
      [criterionId, eventId, organisationId]
    );

    if (delRes.rows.length === 0) {
      throw new NotFoundError('Criterion not found.', 'CRITERION_NOT_FOUND');
    }

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.criterion.deleted',
      entityType: 'event_scoring_criterion',
      entityId: criterionId,
      metadata: { eventId, criterionName: delRes.rows[0].name },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

// -----------------------------------------------------------------------------
// 2. Judge Assignments (EVT-008)
// -----------------------------------------------------------------------------

export async function assignJudge(
  organisationId,
  eventId,
  { judgeUserId, submissionId = null },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!judgeUserId) {
    throw new ValidationError('Judge user ID is required.');
  }

  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify event exists
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    // 2. Verify target user exists and is eligible (must be org member or active user)
    const judgeUserRes = await client.query(
      `SELECT id, email, full_name, status FROM users WHERE id = $1`,
      [judgeUserId]
    );

    if (judgeUserRes.rows.length === 0) {
      throw new NotFoundError('Target user not found.', 'USER_NOT_FOUND');
    }

    const judgeUser = judgeUserRes.rows[0];
    if (judgeUser.status !== 'active') {
      throw new ConflictError('Cannot assign inactive user as judge.', 'USER_NOT_ACTIVE');
    }

    // 3. Verify submission if submission-specific assignment
    if (submissionId) {
      const subRes = await client.query(
        `SELECT id FROM event_submissions WHERE id = $1 AND event_id = $2 AND organisation_id = $3`,
        [submissionId, eventId, organisationId]
      );
      if (subRes.rows.length === 0) {
        throw new NotFoundError('Submission not found in this event.', 'SUBMISSION_NOT_FOUND');
      }
    }

    // 4. Insert assignment
    const insertSql = `
      INSERT INTO event_judge_assignments (
        organisation_id,
        event_id,
        judge_user_id,
        submission_id,
        assigned_by_id
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (event_id, judge_user_id, submission_id) DO NOTHING
      RETURNING *
    `;

    const res = await client.query(insertSql, [
      organisationId,
      eventId,
      judgeUserId,
      submissionId || null,
      actorUserId,
    ]);

    if (res.rows.length === 0) {
      throw new ConflictError('This judge assignment already exists.', 'ASSIGNMENT_EXISTS');
    }

    const assignment = res.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.judge.assigned',
      entityType: 'event_judge_assignment',
      entityId: assignment.id,
      metadata: { eventId, judgeUserId, submissionId },
      ipAddress,
      userAgent,
      client,
    });

    return {
      id: assignment.id,
      organisationId: assignment.organisation_id,
      eventId: assignment.event_id,
      judgeUserId: assignment.judge_user_id,
      judgeEmail: judgeUser.email,
      judgeName: judgeUser.full_name,
      submissionId: assignment.submission_id,
      createdAt: assignment.created_at.toISOString(),
    };
  });
}

export async function removeJudgeAssignment(
  organisationId,
  eventId,
  assignmentId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    const delRes = await client.query(
      `DELETE FROM event_judge_assignments 
       WHERE id = $1 AND event_id = $2 AND organisation_id = $3
       RETURNING *`,
      [assignmentId, eventId, organisationId]
    );

    if (delRes.rows.length === 0) {
      throw new NotFoundError('Judge assignment not found.', 'ASSIGNMENT_NOT_FOUND');
    }

    const assignment = delRes.rows[0];

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.judge.unassigned',
      entityType: 'event_judge_assignment',
      entityId: assignmentId,
      metadata: { eventId, judgeUserId: assignment.judge_user_id, submissionId: assignment.submission_id },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}

export async function listJudgeAssignments(organisationId, eventId) {
  return withTenantTransaction({ organisationId }, async (client) => {
    const res = await client.query(
      `
      SELECT 
        a.id,
        a.organisation_id,
        a.event_id,
        a.judge_user_id,
        a.submission_id,
        a.created_at,
        u.email AS judge_email,
        u.full_name AS judge_name,
        s.title AS submission_title
      FROM event_judge_assignments a
      JOIN users u ON u.id = a.judge_user_id
      LEFT JOIN event_submissions s ON s.id = a.submission_id
      WHERE a.event_id = $1 AND a.organisation_id = $2
      ORDER BY a.created_at ASC
    `,
      [eventId, organisationId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      organisationId: row.organisation_id,
      eventId: row.event_id,
      judgeUserId: row.judge_user_id,
      judgeEmail: row.judge_email,
      judgeName: row.judge_name,
      submissionId: row.submission_id,
      submissionTitle: row.submission_title,
      createdAt: row.created_at.toISOString(),
    }));
  });
}

// -----------------------------------------------------------------------------
// 3. Judge Work & Score Submission (EVT-008)
// -----------------------------------------------------------------------------

/**
 * Returns submissions assigned to a specific judge, including their scores and criteria.
 * Judges can list/view ONLY their assigned work (EVT-008).
 */
export async function listJudgeWork(organisationId, eventId, judgeUserId) {
  return withTenantTransaction({ organisationId, userId: judgeUserId }, async (client) => {
    // 1. Fetch judge's assignments for this event
    const assignRes = await client.query(
      `SELECT * FROM event_judge_assignments WHERE event_id = $1 AND judge_user_id = $2`,
      [eventId, judgeUserId]
    );

    if (assignRes.rows.length === 0) {
      return { workItems: [], criteria: [] };
    }

    const hasGlobalAssignment = assignRes.rows.some((a) => a.submission_id === null);
    const specificSubmissionIds = assignRes.rows
      .filter((a) => a.submission_id !== null)
      .map((a) => a.submission_id);

    // 2. Fetch accessible submissions
    let subSql;
    let params;
    if (hasGlobalAssignment) {
      subSql = `
        SELECT 
          s.id, s.event_id, s.team_id, s.title, s.description, s.repository_url, s.demo_url,
          t.name AS team_name
        FROM event_submissions s
        LEFT JOIN event_teams t ON t.id = s.team_id
        WHERE s.event_id = $1 AND s.organisation_id = $2
        ORDER BY s.submitted_at ASC
      `;
      params = [eventId, organisationId];
    } else {
      subSql = `
        SELECT 
          s.id, s.event_id, s.team_id, s.title, s.description, s.repository_url, s.demo_url,
          t.name AS team_name
        FROM event_submissions s
        LEFT JOIN event_teams t ON t.id = s.team_id
        WHERE s.event_id = $1 AND s.organisation_id = $2 AND s.id = ANY($3::uuid[])
        ORDER BY s.submitted_at ASC
      `;
      params = [eventId, organisationId, specificSubmissionIds];
    }

    const subRes = await client.query(subSql, params);

    // 3. Fetch criteria
    const critRes = await client.query(
      `SELECT * FROM event_scoring_criteria WHERE event_id = $1 AND organisation_id = $2 ORDER BY order_index ASC`,
      [eventId, organisationId]
    );
    const criteria = critRes.rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      maxScore: c.max_score,
      orderIndex: c.order_index,
    }));

    // 4. Fetch existing scores submitted by this judge
    const scoresRes = await client.query(
      `SELECT * FROM event_scores WHERE event_id = $1 AND judge_user_id = $2`,
      [eventId, judgeUserId]
    );

    const scoresBySubId = {};
    for (const sc of scoresRes.rows) {
      if (!scoresBySubId[sc.submission_id]) {
        scoresBySubId[sc.submission_id] = [];
      }
      scoresBySubId[sc.submission_id].push({
        criterionId: sc.criterion_id,
        score: Number(sc.score),
        feedback: sc.feedback,
        updatedAt: sc.updated_at.toISOString(),
      });
    }

    const workItems = subRes.rows.map((sub) => ({
      submissionId: sub.id,
      title: sub.title,
      description: sub.description,
      repositoryUrl: sub.repository_url,
      demoUrl: sub.demo_url,
      teamName: sub.team_name,
      scores: scoresBySubId[sub.id] || [],
      isFullyEvaluated:
        criteria.length > 0 &&
        (scoresBySubId[sub.id] || []).length === criteria.length,
    }));

    return {
      workItems,
      criteria,
    };
  });
}

/**
 * Submits or updates scores from an assigned judge (EVT-008).
 */
export async function submitJudgeScores(
  organisationId,
  eventId,
  submissionId,
  judgeUserId,
  { scores },
  { ipAddress, userAgent } = {}
) {
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new ValidationError('At least one criterion score is required.');
  }

  return withTenantTransaction({ organisationId, userId: judgeUserId }, async (client) => {
    // 1. Verify Event status permits judging: in_progress or completed (EVT-008)
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];
    if (!['in_progress', 'completed'].includes(event.status)) {
      throw new ConflictError(
        `Scoring is only permitted when event is in_progress or completed (current status: ${event.status}).`,
        'JUDGING_NOT_ACTIVE'
      );
    }

    // 2. Verify judge is assigned to this submission/event
    const assignCheck = await client.query(
      `
      SELECT id FROM event_judge_assignments
      WHERE event_id = $1 AND judge_user_id = $2 AND (submission_id IS NULL OR submission_id = $3)
    `,
      [eventId, judgeUserId, submissionId]
    );

    if (assignCheck.rows.length === 0) {
      throw new AuthorizationError(
        'You are not assigned as a judge for this submission.',
        'JUDGE_NOT_ASSIGNED'
      );
    }

    // 3. Verify submission exists
    const subRes = await client.query(
      `SELECT id FROM event_submissions WHERE id = $1 AND event_id = $2`,
      [submissionId, eventId]
    );

    if (subRes.rows.length === 0) {
      throw new NotFoundError('Submission not found in this event.', 'SUBMISSION_NOT_FOUND');
    }

    // 4. Fetch valid event criteria
    const criteriaRes = await client.query(
      `SELECT * FROM event_scoring_criteria WHERE event_id = $1`,
      [eventId]
    );
    const criteriaMap = new Map(criteriaRes.rows.map((c) => [c.id, c]));

    // 5. Validate and upsert scores
    const savedScores = [];
    for (const item of scores) {
      const { criterionId, score, feedback } = item;
      const criterion = criteriaMap.get(criterionId);

      if (!criterion) {
        throw new ValidationError(`Invalid criterion ID: ${criterionId}`);
      }

      const numScore = Number(score);
      if (isNaN(numScore) || numScore < 0 || numScore > criterion.max_score) {
        throw new ValidationError(
          `Score for "${criterion.name}" must be between 0 and ${criterion.max_score}.`
        );
      }

      const upsertSql = `
        INSERT INTO event_scores (
          organisation_id,
          event_id,
          submission_id,
          criterion_id,
          judge_user_id,
          score,
          feedback,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (event_id, submission_id, criterion_id, judge_user_id)
        DO UPDATE SET
          score = EXCLUDED.score,
          feedback = EXCLUDED.feedback,
          updated_at = NOW()
        RETURNING *
      `;

      const scoreRes = await client.query(upsertSql, [
        organisationId,
        eventId,
        submissionId,
        criterionId,
        judgeUserId,
        numScore,
        feedback ? feedback.trim() : null,
      ]);

      savedScores.push({
        id: scoreRes.rows[0].id,
        criterionId,
        score: Number(scoreRes.rows[0].score),
        feedback: scoreRes.rows[0].feedback,
      });
    }

    await recordAuditEvent({
      organisationId,
      actorId: judgeUserId,
      action: 'event.scores.submitted',
      entityType: 'event_submission',
      entityId: submissionId,
      metadata: { eventId, submissionId, scoreCount: savedScores.length },
      ipAddress,
      userAgent,
      client,
    });

    return {
      success: true,
      submissionId,
      scores: savedScores,
    };
  });
}

// -----------------------------------------------------------------------------
// 4. Results Calculation & Publication (EVT-009, ADR-009)
// -----------------------------------------------------------------------------

/**
 * Calculates results: straight sum of criterion scores with shared ranks for ties (ADR-009).
 * Unpublished scores are hidden unless caller has management/publication permissions.
 */
export async function getEventResults(
  organisationId,
  eventId,
  currentUserId = null,
  { canManageResults = false, isPublic = false } = {}
) {
  const transactionRunner = isPublic ? withSystemTransaction : (cb) => withTenantTransaction({ organisationId, userId: currentUserId }, cb);

  return transactionRunner(async (client) => {
    // 1. Fetch Event
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND (organisation_id = $2 OR $3 = true)`,
      [eventId, organisationId || '00000000-0000-0000-0000-000000000000', isPublic]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];
    const isPublished = Boolean(event.results_published_at);

    // Visibility guard: unpublished scores are forbidden to participants/public (EVT-009)
    if (!isPublished && !canManageResults) {
      throw new AuthorizationError(
        'Results for this event have not been published yet.',
        'RESULTS_NOT_PUBLISHED'
      );
    }

    // 2. Fetch all criteria
    const criteriaRes = await client.query(
      `SELECT * FROM event_scoring_criteria WHERE event_id = $1 ORDER BY order_index ASC`,
      [eventId]
    );
    const criteria = criteriaRes.rows.map((c) => ({
      id: c.id,
      name: c.name,
      maxScore: c.max_score,
    }));

    // 3. Fetch submissions
    const subRes = await client.query(
      `
      SELECT 
        s.id, s.title, s.description, s.repository_url, s.demo_url,
        t.id AS team_id, t.name AS team_name
      FROM event_submissions s
      LEFT JOIN event_teams t ON t.id = s.team_id
      WHERE s.event_id = $1
    `,
      [eventId]
    );

    // 4. Fetch assignments and scores
    const assignRes = await client.query(
      `SELECT * FROM event_judge_assignments WHERE event_id = $1`,
      [eventId]
    );

    const scoresRes = await client.query(
      `SELECT * FROM event_scores WHERE event_id = $1`,
      [eventId]
    );

    // Compute straight sum and completeness per submission
    let isAllJudgesComplete = true;

    const resultsList = subRes.rows.map((sub) => {
      // Find judges assigned to this submission (global or specific)
      const assignedJudges = assignRes.rows.filter(
        (a) => a.submission_id === null || a.submission_id === sub.id
      );

      // Unique judge IDs
      const assignedJudgeIds = Array.from(new Set(assignedJudges.map((a) => a.judge_user_id)));

      // Scores for this submission
      const subScores = scoresRes.rows.filter((sc) => sc.submission_id === sub.id);

      // Straight sum (ADR-009)
      const totalScore = subScores.reduce((acc, sc) => acc + Number(sc.score), 0);

      // Check completeness: all assigned judges must score all criteria
      const expectedScoresCount = assignedJudgeIds.length * criteria.length;
      const isComplete =
        assignedJudgeIds.length > 0 &&
        criteria.length > 0 &&
        subScores.length >= expectedScoresCount;

      if (!isComplete) {
        isAllJudgesComplete = false;
      }

      return {
        submissionId: sub.id,
        title: sub.title,
        description: sub.description,
        repositoryUrl: sub.repository_url,
        demoUrl: sub.demo_url,
        teamId: sub.team_id,
        teamName: sub.team_name,
        totalScore,
        scoreCount: subScores.length,
        isComplete,
      };
    });

    // Sort by totalScore DESC
    resultsList.sort((a, b) => b.totalScore - a.totalScore);

    // Assign shared competition ranks (ADR-009: "Tied totals share ranks")
    let currentRank = 1;
    for (let i = 0; i < resultsList.length; i++) {
      if (i > 0 && resultsList[i].totalScore === resultsList[i - 1].totalScore) {
        resultsList[i].rank = resultsList[i - 1].rank;
      } else {
        resultsList[i].rank = currentRank;
      }
      currentRank++;
    }

    return {
      eventId,
      isPublished,
      publishedAt: event.results_published_at ? event.results_published_at.toISOString() : null,
      isPublishable:
        subRes.rows.length > 0 &&
        criteria.length > 0 &&
        assignRes.rows.length > 0 &&
        isAllJudgesComplete,
      criteria,
      results: resultsList,
    };
  });
}

/**
 * Publishes final calculated event results (EVT-009).
 */
export async function publishEventResults(
  organisationId,
  eventId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Fetch Event
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventRes.rows[0];

    // Must be in_progress or completed
    if (!['in_progress', 'completed'].includes(event.status)) {
      throw new ConflictError(
        `Results can only be published for in_progress or completed events (current status: ${event.status}).`,
        'INVALID_LIFECYCLE_STATE'
      );
    }

    // 2. Fetch criteria and submissions
    const criteriaRes = await client.query(
      `SELECT id FROM event_scoring_criteria WHERE event_id = $1`,
      [eventId]
    );
    if (criteriaRes.rows.length === 0) {
      throw new ConflictError(
        'Cannot publish results: No scoring criteria configured.',
        'NO_CRITERIA_CONFIGURED'
      );
    }

    const subRes = await client.query(
      `SELECT id FROM event_submissions WHERE event_id = $1`,
      [eventId]
    );
    if (subRes.rows.length === 0) {
      throw new ConflictError(
        'Cannot publish results: No project submissions recorded.',
        'NO_SUBMISSIONS_RECORDED'
      );
    }

    // 3. Verify completeness: all assigned judges have submitted all criteria (ADR-009)
    const assignRes = await client.query(
      `SELECT * FROM event_judge_assignments WHERE event_id = $1`,
      [eventId]
    );
    if (assignRes.rows.length === 0) {
      throw new ConflictError(
        'Cannot publish results: No judges assigned.',
        'NO_JUDGES_ASSIGNED'
      );
    }

    const scoresRes = await client.query(
      `SELECT * FROM event_scores WHERE event_id = $1`,
      [eventId]
    );

    for (const sub of subRes.rows) {
      const assignedJudges = assignRes.rows.filter(
        (a) => a.submission_id === null || a.submission_id === sub.id
      );
      const uniqueJudgeIds = Array.from(new Set(assignedJudges.map((a) => a.judge_user_id)));

      for (const judgeId of uniqueJudgeIds) {
        for (const crit of criteriaRes.rows) {
          const hasScore = scoresRes.rows.some(
            (sc) =>
              sc.submission_id === sub.id &&
              sc.judge_user_id === judgeId &&
              sc.criterion_id === crit.id
          );
          if (!hasScore) {
            throw new ConflictError(
              'Cannot publish results: Not all assigned judges have submitted scores for all required criteria.',
              'INCOMPLETE_EVALUATION'
            );
          }
        }
      }
    }

    // 4. Update event record
    await client.query(
      `UPDATE events 
       SET results_published_at = NOW(), results_published_by_id = $1, updated_at = NOW() 
       WHERE id = $2`,
      [actorUserId, eventId]
    );

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.results_published',
      entityType: 'event',
      entityId: eventId,
      metadata: { eventId, publishedAt: new Date().toISOString() },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true, publishedAt: new Date().toISOString() };
  });
}

/**
 * Unpublishes event results (EVT-009).
 */
export async function unpublishEventResults(
  organisationId,
  eventId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    await client.query(
      `UPDATE events 
       SET results_published_at = NULL, results_published_by_id = NULL, updated_at = NOW() 
       WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.results_unpublished',
      entityType: 'event',
      entityId: eventId,
      metadata: { eventId },
      ipAddress,
      userAgent,
      client,
    });

    return { success: true };
  });
}
