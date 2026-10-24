/**
 * ManageX Hackathon Round Advancement Engine
 * Strictly adheres to PRD Section 7, EVT-010, ADR-001, ADR-003, and ADR-009.
 * 
 * Rules:
 * - Advancement rules: manual, score_threshold, top_n.
 * - Top-N advancement: participants or teams tied at the cutoff all qualify.
 * - Round eligibility: Round 1 open to all registered participants;
 *   Round N requires explicit qualification in Round N-1.
 * - Results/scores privacy: Unpublished scores are never leaked.
 */

import { withTenantTransaction } from '../database/transaction.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../common/errors.js';
import { recordAuditEvent } from '../audit/auditService.js';

function formatAdvancementRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    eventId: row.event_id,
    roundId: row.round_id,
    teamId: row.team_id || null,
    teamName: row.team_name || null,
    participantUserId: row.participant_user_id || null,
    participantName: row.participant_name || null,
    participantEmail: row.participant_email || null,
    status: row.status,
    qualificationScore: row.qualification_score !== null ? Number(row.qualification_score) : null,
    qualificationRank: row.qualification_rank || null,
    advancedById: row.advanced_by_id,
    notes: row.notes || null,
    isManual: Boolean(row.is_manual),
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

/**
 * Lists all qualification/advancement records for a round.
 */
export async function listRoundAdvancements(organisationId, eventId, roundId, currentUserId) {
  return withTenantTransaction({ organisationId, userId: currentUserId }, async (client) => {
    // 1. Verify round exists
    const roundRes = await client.query(
      `SELECT * FROM event_rounds WHERE id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );

    if (roundRes.rows.length === 0) {
      throw new NotFoundError('Competition round not found.', 'ROUND_NOT_FOUND');
    }

    const res = await client.query(
      `
      SELECT 
        a.*,
        t.name AS team_name,
        u.full_name AS participant_name,
        u.email AS participant_email
      FROM event_round_advancements a
      LEFT JOIN event_teams t ON t.id = a.team_id
      LEFT JOIN users u ON u.id = a.participant_user_id
      WHERE a.round_id = $1 AND a.event_id = $2 AND a.organisation_id = $3
      ORDER BY a.qualification_rank ASC NULLS LAST, a.qualification_score DESC NULLS LAST
    `,
      [roundId, eventId, organisationId]
    );

    return res.rows.map(formatAdvancementRow);
  });
}

/**
 * Advances participants/teams from a round to the next stage based on advancement rule.
 * Supports: 'top_n' (with cutoff ties qualifying), 'score_threshold', and 'manual'.
 */
export async function advanceRound(
  organisationId,
  eventId,
  roundId,
  { rule, threshold, topN, manualAdvancements = [] } = {},
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction({ organisationId, userId: actorUserId }, async (client) => {
    // 1. Verify Event and Round exist
    const eventRes = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (eventRes.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const roundRes = await client.query(
      `SELECT * FROM event_rounds WHERE id = $1 AND event_id = $2 AND organisation_id = $3 FOR UPDATE`,
      [roundId, eventId, organisationId]
    );

    if (roundRes.rows.length === 0) {
      throw new NotFoundError('Competition round not found.', 'ROUND_NOT_FOUND');
    }

    const round = roundRes.rows[0];

    // 2. Fetch all submissions for this round
    const subRes = await client.query(
      `
      SELECT 
        s.id, s.team_id, s.submitter_user_id, s.title,
        t.name AS team_name, u.full_name AS submitter_name
      FROM event_submissions s
      LEFT JOIN event_teams t ON t.id = s.team_id
      LEFT JOIN users u ON u.id = s.submitter_user_id
      WHERE s.round_id = $1 AND s.event_id = $2 AND s.organisation_id = $3
    `,
      [roundId, eventId, organisationId]
    );

    if (subRes.rows.length === 0) {
      throw new ConflictError(
        'No project submissions recorded in this round to advance.',
        'NO_SUBMISSIONS_IN_ROUND'
      );
    }

    // 3. Fetch all scores for this round to compute total scores
    const scoresRes = await client.query(
      `SELECT submission_id, score FROM event_scores WHERE round_id = $1 AND organisation_id = $2`,
      [roundId, organisationId]
    );

    const submissionScores = new Map();
    for (const sc of scoresRes.rows) {
      const prev = submissionScores.get(sc.submission_id) || 0;
      submissionScores.set(sc.submission_id, prev + Number(sc.score));
    }

    // Prepare list of participants with total score
    const scoredList = subRes.rows.map((s) => ({
      submissionId: s.id,
      teamId: s.team_id,
      participantUserId: s.team_id ? null : s.submitter_user_id,
      totalScore: submissionScores.get(s.id) || 0,
      title: s.title,
      teamName: s.team_name,
    }));

    // Sort descending by total score
    scoredList.sort((a, b) => b.totalScore - a.totalScore);

    // Compute shared ranks for tied scores (ADR-009)
    let currentRank = 1;
    for (let i = 0; i < scoredList.length; i++) {
      if (i > 0 && scoredList[i].totalScore === scoredList[i - 1].totalScore) {
        scoredList[i].rank = scoredList[i - 1].rank;
      } else {
        scoredList[i].rank = currentRank;
      }
      currentRank++;
    }

    // 4. Validate manual advancements targets belong to this round (Phase 02D)
    if (manualAdvancements && manualAdvancements.length > 0) {
      const validTargetKeys = new Set(
        subRes.rows.map((s) => s.team_id || s.submitter_user_id)
      );
      for (const m of manualAdvancements) {
        const targetKey = m.teamId || m.participantUserId;
        if (!validTargetKeys.has(targetKey)) {
          throw new ValidationError(
            `Invalid manual advancement: target "${targetKey}" did not submit to this round.`,
            'TARGET_NOT_IN_ROUND'
          );
        }
      }
    }

    // 5. Determine qualification status based on rule
    const effectiveRule = rule || round.advancement_rule || 'manual';
    const effectiveTopN = topN !== undefined && topN !== null ? Number(topN) : round.advancement_top_n;
    const effectiveThreshold =
      threshold !== undefined && threshold !== null ? Number(threshold) : round.advancement_threshold;

    if (effectiveRule === 'top_n' && (!effectiveTopN || effectiveTopN < 1)) {
      throw new ValidationError('A positive integer topN is required for top_n advancement.');
    }

    if (effectiveRule === 'score_threshold' && (effectiveThreshold === null || effectiveThreshold === undefined)) {
      throw new ValidationError('A valid numeric threshold is required for score_threshold advancement.');
    }

    // 6. Check judging completeness for score-based advancement rules (Phase 02D)
    if (effectiveRule === 'top_n' || effectiveRule === 'score_threshold') {
      const criteriaRes = await client.query(
        `SELECT id FROM event_scoring_criteria WHERE event_id = $1 AND (round_id = $2 OR round_id IS NULL)`,
        [eventId, roundId]
      );
      const assignRes = await client.query(
        `SELECT * FROM event_judge_assignments WHERE event_id = $1 AND (round_id = $2 OR round_id IS NULL)`,
        [eventId, roundId]
      );

      if (criteriaRes.rows.length > 0 && assignRes.rows.length > 0) {
        const roundScoresRes = await client.query(
          `SELECT submission_id, criterion_id, judge_user_id FROM event_scores WHERE round_id = $1`,
          [roundId]
        );

        for (const sub of subRes.rows) {
          const relevantAssignments = assignRes.rows.filter(
            (a) => a.submission_id === null || a.submission_id === sub.id
          );
          const uniqueJudges = Array.from(new Set(relevantAssignments.map((a) => a.judge_user_id)));

          for (const judgeId of uniqueJudges) {
            for (const crit of criteriaRes.rows) {
              const hasScore = roundScoresRes.rows.some(
                (sc) =>
                  sc.submission_id === sub.id &&
                  sc.judge_user_id === judgeId &&
                  sc.criterion_id === crit.id
              );
              if (!hasScore) {
                throw new ConflictError(
                  'Cannot advance round: Not all assigned judges have submitted scores for all required criteria.',
                  'INCOMPLETE_EVALUATION'
                );
              }
            }
          }
        }
      }
    }

    // 7. Query existing advancements to preserve manual decisions (Phase 02D)
    const existingAdvRes = await client.query(
      `SELECT team_id, participant_user_id, status, is_manual 
       FROM event_round_advancements 
       WHERE round_id = $1 AND event_id = $2 AND organisation_id = $3`,
      [roundId, eventId, organisationId]
    );

    const preservedManualMap = new Map();
    for (const row of existingAdvRes.rows) {
      if (row.is_manual && row.status === 'qualified') {
        preservedManualMap.set(row.team_id || row.participant_user_id, true);
      }
    }

    const calculatedAdvancements = [];

    if (effectiveRule === 'top_n') {
      // Top-N advancement: participants or teams tied at the cutoff all qualify!
      let cutoffScore = 0;
      if (scoredList.length <= effectiveTopN) {
        cutoffScore = -Infinity; // all qualify
      } else {
        cutoffScore = scoredList[effectiveTopN - 1].totalScore;
      }

      for (const item of scoredList) {
        const targetKey = item.teamId || item.participantUserId;
        const isPreservedManual = preservedManualMap.get(targetKey) === true;
        const isScoreQualified = item.totalScore >= cutoffScore;
        const isQualified = isPreservedManual || isScoreQualified;

        calculatedAdvancements.push({
          teamId: item.teamId,
          participantUserId: item.participantUserId,
          status: isQualified ? 'qualified' : 'eliminated',
          score: item.totalScore,
          rank: item.rank,
          isManual: isPreservedManual,
          notes: isPreservedManual
            ? 'Preserved manual qualification'
            : isQualified
            ? `Advanced via Top-${effectiveTopN} rule (cutoff score: ${cutoffScore})`
            : `Eliminated (below Top-${effectiveTopN} cutoff of ${cutoffScore})`,
        });
      }
    } else if (effectiveRule === 'score_threshold') {
      for (const item of scoredList) {
        const targetKey = item.teamId || item.participantUserId;
        const isPreservedManual = preservedManualMap.get(targetKey) === true;
        const isScoreQualified = item.totalScore >= Number(effectiveThreshold);
        const isQualified = isPreservedManual || isScoreQualified;

        calculatedAdvancements.push({
          teamId: item.teamId,
          participantUserId: item.participantUserId,
          status: isQualified ? 'qualified' : 'eliminated',
          score: item.totalScore,
          rank: item.rank,
          isManual: isPreservedManual,
          notes: isPreservedManual
            ? 'Preserved manual qualification'
            : isQualified
            ? `Advanced via score threshold (>= ${effectiveThreshold})`
            : `Eliminated (score ${item.totalScore} < threshold ${effectiveThreshold})`,
        });
      }
    } else {
      // Manual advancement rule
      const manualMap = new Map();
      for (const m of manualAdvancements) {
        const key = m.teamId || m.participantUserId;
        if (key) {
          manualMap.set(key, m);
        }
      }

      for (const item of scoredList) {
        const key = item.teamId || item.participantUserId;
        const manual = manualMap.get(key);
        const isQualified = manual?.status === 'qualified';
        calculatedAdvancements.push({
          teamId: item.teamId,
          participantUserId: item.participantUserId,
          status: isQualified ? 'qualified' : 'eliminated',
          score: item.totalScore,
          rank: item.rank,
          isManual: isQualified,
          notes: manual?.notes || (isQualified ? 'Manually advanced' : 'Not selected'),
        });
      }
    }

    // 5. Persist to event_round_advancements
    const savedRecords = [];
    for (const adv of calculatedAdvancements) {
      if (adv.teamId) {
        const upsertRes = await client.query(
          `
          INSERT INTO event_round_advancements (
            organisation_id,
            event_id,
            round_id,
            team_id,
            status,
            qualification_score,
            qualification_rank,
            advanced_by_id,
            notes,
            is_manual,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (round_id, team_id) WHERE team_id IS NOT NULL DO UPDATE SET
            status = EXCLUDED.status,
            qualification_score = EXCLUDED.qualification_score,
            qualification_rank = EXCLUDED.qualification_rank,
            advanced_by_id = EXCLUDED.advanced_by_id,
            notes = EXCLUDED.notes,
            is_manual = EXCLUDED.is_manual,
            updated_at = NOW()
          RETURNING *
        `,
          [
            organisationId,
            eventId,
            roundId,
            adv.teamId,
            adv.status,
            adv.score,
            adv.rank,
            actorUserId,
            adv.notes,
            Boolean(adv.isManual),
          ]
        );
        savedRecords.push(upsertRes.rows[0]);
      } else if (adv.participantUserId) {
        const upsertRes = await client.query(
          `
          INSERT INTO event_round_advancements (
            organisation_id,
            event_id,
            round_id,
            participant_user_id,
            status,
            qualification_score,
            qualification_rank,
            advanced_by_id,
            notes,
            is_manual,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (round_id, participant_user_id) WHERE participant_user_id IS NOT NULL DO UPDATE SET
            status = EXCLUDED.status,
            qualification_score = EXCLUDED.qualification_score,
            qualification_rank = EXCLUDED.qualification_rank,
            advanced_by_id = EXCLUDED.advanced_by_id,
            notes = EXCLUDED.notes,
            is_manual = EXCLUDED.is_manual,
            updated_at = NOW()
          RETURNING *
        `,
          [
            organisationId,
            eventId,
            roundId,
            adv.participantUserId,
            adv.status,
            adv.score,
            adv.rank,
            actorUserId,
            adv.notes,
            Boolean(adv.isManual),
          ]
        );
        savedRecords.push(upsertRes.rows[0]);
      }
    }

    // 6. Automatically unlock next round if exists and currently pending
    const nextRoundRes = await client.query(
      `SELECT * FROM event_rounds WHERE event_id = $1 AND round_number = $2 AND organisation_id = $3`,
      [eventId, round.round_number + 1, organisationId]
    );

    let nextRound = null;
    if (nextRoundRes.rows.length > 0) {
      const nr = nextRoundRes.rows[0];
      if (nr.status === 'pending') {
        const updateNextRes = await client.query(
          `UPDATE event_rounds SET status = 'open', updated_at = NOW() WHERE id = $1 RETURNING *`,
          [nr.id]
        );
        nextRound = updateNextRes.rows[0];
      } else {
        nextRound = nr;
      }
    }

    // Update round status and rule parameters on event_rounds (Phase 02D)
    await client.query(
      `UPDATE event_rounds
       SET status = 'completed',
           advancement_rule = $1,
           advancement_top_n = $2,
           advancement_threshold = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [effectiveRule, effectiveTopN || null, effectiveThreshold || null, roundId]
    );

    const qualifiedCount = savedRecords.filter((r) => r.status === 'qualified').length;
    const eliminatedCount = savedRecords.filter((r) => r.status === 'eliminated').length;

    await recordAuditEvent({
      organisationId,
      actorId: actorUserId,
      action: 'event.round.advanced',
      entityType: 'event_round',
      entityId: roundId,
      metadata: {
        eventId,
        roundId,
        roundNumber: round.round_number,
        rule: effectiveRule,
        qualifiedCount,
        eliminatedCount,
        nextRoundId: nextRound?.id || null,
      },
      ipAddress,
      userAgent,
      client,
    });

    return {
      success: true,
      roundId,
      rule: effectiveRule,
      qualifiedCount,
      eliminatedCount,
      nextRound: nextRound
        ? {
            id: nextRound.id,
            roundNumber: nextRound.round_number,
            name: nextRound.name,
            status: nextRound.status,
          }
        : null,
      advancements: savedRecords.map(formatAdvancementRow),
    };
  });
}
