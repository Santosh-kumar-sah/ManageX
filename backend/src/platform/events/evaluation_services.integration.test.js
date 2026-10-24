/**
 * ==============================================================================
 * ManageX Phase 2B: Evaluation Backend Services Integration Tests
 * Validates evaluation service lifecycle, panel management, judge assignment sync,
 * concurrency-safe scheduling, meeting-link privacy, and participant projection.
 * ==============================================================================
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../../app.js';
import { getPool } from '../database/pool.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';
import {
  getRoundEvaluation,
  createRoundEvaluation,
  updateRoundEvaluation,
  createEvaluationPanel,
  listEvaluationPanels,
  assignJudgeToPanel,
  removeJudgeFromPanel,
  createEvaluationSession,
  generateEvaluationSchedule,
  createEvaluationJudgeInvitation,
  acceptEvaluationJudgeInvitation,
  revokeEvaluationJudgeInvitation,
  completeRoundEvaluation,
  rescheduleEvaluationSession,
  cancelEvaluationSession,
  updateSessionStatus,
  listEvaluationSessions,
  publishEvaluationSchedule,
} from './evaluationService.js';
import { getTestMailbox, clearTestMailbox } from '../email/emailService.js';
import {
  submitJudgeScores,
  createScoringCriterion,
  getEvaluationSessionWork,
  submitEvaluationSessionScores,
} from './judgingService.js';

describe('Phase 2B — Evaluation Services, Judge Sync & Scheduling Suite', () => {
  const runId = randomUUID();
  const fixturePrefix = `eval4cbe_${runId.replaceAll('-', '')}`;
  let pool;
  let ownerUserId, judge1UserId, judge2UserId, judgeManualUserId;
  let student1UserId, student2UserId, crossTenantUserId;
  let orgAId, orgBId;
  let eventAId, eventBId;
  let roundA1Id, roundA2Id;
  let team1Id, team2Id;
  let criterionId, submissionAlphaId;

  before(async () => {
    pool = getPool();
    await withSystemTransaction(async (client) => {
      const database = await client.query('SELECT current_database() AS name');
      const migration = await client.query(
        `SELECT version FROM schema_migrations
         WHERE version = '20261017000035'`
      );
      if (database.rows[0].name !== 'managex_test' || migration.rowCount !== 1) {
        throw new Error('Phase 3 tests require managex_test at migration 20261017000035.');
      }
    });
    const passwordHash = await hashPassword('SecurePassword123!');

    await withSystemTransaction(async (client) => {
      // Create users in a unique namespace for this test run.
      const usersRes = await client.query(
        `
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ($2, $3, $1, 'active', NOW()),
          ($4, $5, $1, 'active', NOW()),
          ($6, $7, $1, 'active', NOW()),
          ($8, $9, $1, 'active', NOW()),
          ($10, $11, $1, 'active', NOW()),
          ($12, $13, $1, 'active', NOW()),
          ($14, $15, $1, 'active', NOW())
        RETURNING id, email;
      `,
        [
          passwordHash,
          `${fixturePrefix} Owner`, `${fixturePrefix}_owner@managex.local`,
          `${fixturePrefix} Judge 1`, `${fixturePrefix}_judge1@managex.local`,
          `${fixturePrefix} Judge 2`, `${fixturePrefix}_judge2@managex.local`,
          `${fixturePrefix} Judge Manual`, `${fixturePrefix}_judgemanual@managex.local`,
          `${fixturePrefix} Student 1`, `${fixturePrefix}_student1@managex.local`,
          `${fixturePrefix} Student 2`, `${fixturePrefix}_student2@managex.local`,
          `${fixturePrefix} Cross Tenant`, `${fixturePrefix}_cross@managex.local`,
        ]
      );

      const userMap = {};
      usersRes.rows.forEach((r) => {
        userMap[r.email] = r.id;
      });
      ownerUserId = userMap[`${fixturePrefix}_owner@managex.local`];
      judge1UserId = userMap[`${fixturePrefix}_judge1@managex.local`];
      judge2UserId = userMap[`${fixturePrefix}_judge2@managex.local`];
      judgeManualUserId = userMap[`${fixturePrefix}_judgemanual@managex.local`];
      student1UserId = userMap[`${fixturePrefix}_student1@managex.local`];
      student2UserId = userMap[`${fixturePrefix}_student2@managex.local`];
      crossTenantUserId = userMap[`${fixturePrefix}_cross@managex.local`];

      const orgARes = await client.query(
        `INSERT INTO organisations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
        [`${fixturePrefix} Org A`, `${fixturePrefix}-org-a`]
      );
      orgAId = orgARes.rows[0].id;

      const orgBRes = await client.query(
        `INSERT INTO organisations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
        [`${fixturePrefix} Org B`, `${fixturePrefix}-org-b`]
      );
      orgBId = orgBRes.rows[0].id;

      // Entitlements
      const eventsModuleId = (await client.query("SELECT id FROM modules WHERE slug = 'events'")).rows[0]?.id;
      if (eventsModuleId) {
        await client.query(
          `INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled)
           VALUES ($1, $2, true), ($3, $2, true) ON CONFLICT DO NOTHING`,
          [orgAId, eventsModuleId, orgBId]
        );
      }

      // Memberships
      const memARes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, ownerUserId]
      );
      const ownerMemId = memARes.rows[0].id;

      const memBRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id`,
        [orgBId, crossTenantUserId]
      );
      const crossMemId = memBRes.rows[0].id;

      const ownerRoleRes = await client.query(`SELECT id FROM roles WHERE slug = 'organisation_owner'`);
      const ownerRoleId = ownerRoleRes.rows[0].id;

      await client.query(
        `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3), ($4, $5, $6)`,
        [orgAId, ownerMemId, ownerRoleId, orgBId, crossMemId, ownerRoleId]
      );

      const eventARes = await client.query(
        `
        INSERT INTO events (
          organisation_id, created_by_id, title, slug, event_type, visibility, status,
          start_at, end_at, timezone, location_type
        )
        VALUES (
          $1, $2, $3, $4, 'hackathon', 'public', 'in_progress',
          NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC', 'virtual'
        ) RETURNING id;
      `,
        [orgAId, ownerUserId, `${fixturePrefix} Hackathon A`, `${fixturePrefix}-hack-a`]
      );
      eventAId = eventARes.rows[0].id;

      const eventBRes = await client.query(
        `
        INSERT INTO events (
          organisation_id, created_by_id, title, slug, event_type, visibility, status,
          start_at, end_at, timezone, location_type
        )
        VALUES (
          $1, $2, $3, $4, 'hackathon', 'public', 'published',
          NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC', 'virtual'
        ) RETURNING id;
      `,
        [orgBId, crossTenantUserId, `${fixturePrefix} Hackathon B`, `${fixturePrefix}-hack-b`]
      );
      eventBId = eventBRes.rows[0].id;

      // 5. Create Event Rounds
      const roundA1Res = await client.query(
        `
        INSERT INTO event_rounds (
          organisation_id, event_id, round_number, name, status,
          advancement_rule, advancement_top_n
        )
        VALUES ($1, $2, 1, 'Preliminary Round', 'open', 'top_n', 5)
        RETURNING id;
      `,
        [orgAId, eventAId]
      );
      roundA1Id = roundA1Res.rows[0].id;

      const roundA2Res = await client.query(
        `
        INSERT INTO event_rounds (
          organisation_id, event_id, round_number, name, status,
          advancement_rule
        )
        VALUES ($1, $2, 2, 'Final Round', 'pending', 'manual')
        RETURNING id;
      `,
        [orgAId, eventAId]
      );
      roundA2Id = roundA2Res.rows[0].id;

      // 6. Register Participants and Create Teams & Submissions
      await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgAId]);
      await client.query(
        `INSERT INTO event_registrations (organisation_id, event_id, user_id, status)
         VALUES ($1, $2, $3, 'registered'), ($1, $2, $4, 'registered')`,
        [orgAId, eventAId, student1UserId, student2UserId]
      );

      const t1Res = await client.query(
        `
        INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `,
        [orgAId, eventAId, `${fixturePrefix} Team Alpha`, `${fixturePrefix}-team-alpha`, student1UserId]
      );
      team1Id = t1Res.rows[0].id;

      await client.query(
        `INSERT INTO event_team_members (organisation_id, event_id, team_id, user_id) VALUES ($1, $2, $3, $4)`,
        [orgAId, eventAId, team1Id, student1UserId]
      );

      const t2Res = await client.query(
        `
        INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `,
        [orgAId, eventAId, `${fixturePrefix} Team Beta`, `${fixturePrefix}-team-beta`, student2UserId]
      );
      team2Id = t2Res.rows[0].id;

      await client.query(
        `INSERT INTO event_team_members (organisation_id, event_id, team_id, user_id) VALUES ($1, $2, $3, $4)`,
        [orgAId, eventAId, team2Id, student2UserId]
      );

      // Create a submission for Team Alpha so we can test scoring compatibility
      const subRes = await client.query(
        `
        INSERT INTO event_submissions (
          organisation_id, event_id, round_id, team_id, submitter_user_id,
          title, description, status, submitted_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          'Alpha Project', 'Alpha description', 'submitted', NOW()
        )
        RETURNING id;
      `,
        [orgAId, eventAId, roundA1Id, team1Id, student1UserId]
      );
      submissionAlphaId = subRes.rows[0].id;
    });

    // Create a scoring criterion for Round A1
    const criterion = await createScoringCriterion(
      orgAId,
      eventAId,
      {
        name: 'Technical Depth',
        maxScore: 100,
        roundId: roundA1Id,
      },
      ownerUserId
    );
    criterionId = criterion.id;
  });

  after(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    await withSystemTransaction(async (client) => {
      const database = await client.query('SELECT current_database() AS name');
      const migration = await client.query(
        `SELECT version FROM schema_migrations
         WHERE version = '20261017000035'`
      );
      assert.equal(database.rows[0].name, 'managex_test');
      assert.equal(migration.rowCount, 1);
    });
  });

  describe('1. Optional Round Evaluation Lifecycle & Modes', () => {
    it('returns configured: false when a round has no evaluation configured', async () => {
      const result = await getRoundEvaluation(orgAId, eventAId, roundA2Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });

      assert.strictEqual(result.configured, false);
      assert.strictEqual(result.evaluation, null);
      assert.strictEqual(result.roundId, roundA2Id);
    });

    it('creates an evaluation configuration for Round 1 in live_showcase mode', async () => {
      const created = await createRoundEvaluation(
        orgAId,
        eventAId,
        roundA1Id,
        {
          evaluationMode: 'live_showcase',
          sessionDurationMinutes: 20,
          bufferMinutes: 5,
          judgesPerPanel: 2,
          evaluationsPerTeam: 1,
          defaultMeetingUrl: 'https://meet.managex.local/room-default',
        },
        ownerUserId
      );

      assert.ok(created.id);
      assert.strictEqual(created.evaluationMode, 'live_showcase');
      assert.strictEqual(created.sessionDurationMinutes, 20);
      assert.strictEqual(created.bufferMinutes, 5);
      assert.strictEqual(created.status, 'draft');
    });

    it('prevents creating a second evaluation configuration for the same round (1:0..1)', async () => {
      await assert.rejects(
        async () => {
          await createRoundEvaluation(
            orgAId,
            eventAId,
            roundA1Id,
            { evaluationMode: 'submission_based' },
            ownerUserId
          );
        },
        { name: 'ConflictError' }
      );
    });

    it('updates evaluation configuration mode and duration', async () => {
      const updated = await updateRoundEvaluation(
        orgAId,
        eventAId,
        roundA1Id,
        {
          evaluationMode: 'hybrid',
          sessionDurationMinutes: 15,
        },
        ownerUserId
      );

      assert.strictEqual(updated.evaluationMode, 'hybrid');
      assert.strictEqual(updated.sessionDurationMinutes, 15);
    });
  });

  describe('2. Panel Management & Auto-Numbering', () => {
    it('creates Panel 1 with auto-assigned panel_number = 1', async () => {
      const panel1 = await createEvaluationPanel(
        orgAId,
        eventAId,
        roundA1Id,
        {
          name: 'AI & Data Panel',
          meetingUrl: 'https://meet.managex.local/panel-1',
          notes: 'Panel for technical judges',
        },
        ownerUserId
      );

      assert.ok(panel1.id);
      assert.strictEqual(panel1.panelNumber, 1);
      assert.strictEqual(panel1.name, 'AI & Data Panel');
    });

    it('creates Panel 2 with auto-assigned panel_number = 2', async () => {
      const panel2 = await createEvaluationPanel(
        orgAId,
        eventAId,
        roundA1Id,
        {
          name: 'Web3 & Security Panel',
          meetingUrl: 'https://meet.managex.local/panel-2',
        },
        ownerUserId
      );

      assert.ok(panel2.id);
      assert.strictEqual(panel2.panelNumber, 2);
    });

    it('lists panels with assigned judges structure', async () => {
      const { panels } = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });

      assert.strictEqual(panels.length, 2);
      assert.strictEqual(panels[0].panelNumber, 1);
      assert.strictEqual(panels[1].panelNumber, 2);
    });
  });

  describe('3. Judge Assignment Synchronization & Scoring Compatibility', () => {
    let panel1Id, panel2Id;

    before(async () => {
      const { panels } = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      panel1Id = panels[0].id;
      panel2Id = panels[1].id;

      // Seed a manual assignment for Judge Manual in event_judge_assignments
      await withSystemTransaction(async (client) => {
        await client.query(
          `INSERT INTO event_judge_assignments (organisation_id, event_id, judge_user_id, assigned_by_id, source)
           VALUES ($1, $2, $3, $4, 'manual')`,
          [orgAId, eventAId, judgeManualUserId, ownerUserId]
        );
      });
    });

    it('assigns Judge 1 to Panel 1 and synchronizes into event_judge_assignments with source=evaluation_panel', async () => {
      const assignment = await assignJudgeToPanel(
        orgAId,
        eventAId,
        roundA1Id,
        panel1Id,
        { judgeUserId: judge1UserId },
        ownerUserId
      );

      assert.strictEqual(assignment.judgeUserId, judge1UserId);
      assert.strictEqual(assignment.panelId, panel1Id);

      // Verify event_judge_assignments has synchronized record
      await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
        const syncRes = await client.query(
          `SELECT * FROM event_judge_assignments WHERE event_id = $1 AND judge_user_id = $2`,
          [eventAId, judge1UserId]
        );
        assert.strictEqual(syncRes.rows.length, 1);
        assert.strictEqual(syncRes.rows[0].source, 'evaluation_panel');
        assert.strictEqual(syncRes.rows[0].evaluation_panel_id, panel1Id);
      });
    });

    it('allows synchronized panel judge to score submissions through judgingService without authorization bypass', async () => {
      const scoreResult = await submitJudgeScores(
        orgAId,
        eventAId,
        submissionAlphaId,
        judge1UserId,
        {
          scores: [
            {
              criterionId,
              score: 88,
              feedback: 'Great technical execution.',
            },
          ],
        }
      );

      assert.ok(scoreResult.scores);
      assert.strictEqual(scoreResult.scores[0].score, 88);
    });

    it('removes Judge 1 from Panel 1 and cleans synchronized assignment while PRESERVING manual assignment', async () => {
      const res = await removeJudgeFromPanel(
        orgAId,
        eventAId,
        roundA1Id,
        panel1Id,
        judge1UserId,
        ownerUserId
      );

      assert.strictEqual(res.success, true);

      await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
        // Judge 1 assignment removed
        const j1Res = await client.query(
          `SELECT * FROM event_judge_assignments WHERE event_id = $1 AND judge_user_id = $2`,
          [eventAId, judge1UserId]
        );
        assert.strictEqual(j1Res.rows.length, 0);

        // Manual judge assignment untouched
        const manualRes = await client.query(
          `SELECT * FROM event_judge_assignments WHERE event_id = $1 AND judge_user_id = $2`,
          [eventAId, judgeManualUserId]
        );
        assert.strictEqual(manualRes.rows.length, 1);
        assert.strictEqual(manualRes.rows[0].source, 'manual');
      });
    });

    it('denies score submission once judge assignment is revoked', async () => {
      await assert.rejects(
        async () => {
          await submitJudgeScores(
            orgAId,
            eventAId,
            submissionAlphaId,
            judge1UserId,
            {
              scores: [
                {
                  criterionId,
                  score: 95,
                  feedback: 'Updated score after revocation attempt.',
                },
              ],
            }
          );
        },
        { name: 'AuthorizationError' }
      );

      const revokedJudgePanels = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: judge1UserId,
      });
      assert.deepEqual(revokedJudgePanels.panels, []);
    });

    it('re-assigns Judge 1 to Panel 1 and Judge 2 to Panel 2 for scheduling tests', async () => {
      await assignJudgeToPanel(
        orgAId,
        eventAId,
        roundA1Id,
        panel1Id,
        { judgeUserId: judge1UserId },
        ownerUserId
      );

      await assignJudgeToPanel(
        orgAId,
        eventAId,
        roundA1Id,
        panel2Id,
        { judgeUserId: judge2UserId },
        ownerUserId
      );
    });

    it('lists panel details only for organisers and assigned judges', async () => {
      const organiserResult = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      const judgeResult = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: judge1UserId,
      });
      const participantResult = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: student1UserId,
      });
      const unrelatedResult = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: crossTenantUserId,
      });

      assert.equal(organiserResult.panels[0].meetingUrl, 'https://meet.managex.local/panel-1');
      assert.equal(judgeResult.panels[0].meetingUrl, 'https://meet.managex.local/panel-1');
      assert.equal(judgeResult.panels.length, 1);
      assert.deepEqual(participantResult.panels, []);
      assert.deepEqual(unrelatedResult.panels, []);

      const unassignedJudgeResult = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: judgeManualUserId,
      });
      assert.deepEqual(unassignedJudgeResult.panels, []);
    });
  });

  describe('4. Concurrency-Safe Scheduling & Conflict Detection', () => {
    let panel1Id, panel2Id;
    let baseTime;

    before(async () => {
      const { panels } = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      panel1Id = panels[0].id;
      panel2Id = panels[1].id;
      baseTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      baseTime.setMinutes(0, 0, 0);
    });

    it('auto-generates a conflict-free schedule for teams across panels', async () => {
      const result = await generateEvaluationSchedule(
        orgAId,
        eventAId,
        roundA1Id,
        {
          scheduleStartsAt: baseTime.toISOString(),
        },
        ownerUserId
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.sessionsGenerated, 2);
      assert.strictEqual(result.teamsScheduled, 2);
      assert.strictEqual(result.panelsUsed, 2);

      // Verify sessions were actually created by listing them
      const { sessions } = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      assert.strictEqual(sessions.length, 2);

      // Session 1: Team Alpha on Panel 1
      assert.strictEqual(sessions[0].panelId, panel1Id);
      assert.strictEqual(sessions[0].teamId, team1Id);

      // Session 2: Team Beta on Panel 2
      assert.strictEqual(sessions[1].panelId, panel2Id);
      assert.strictEqual(sessions[1].teamId, team2Id);
    });

    it('detects buffer violation when creating an overlapping session for Panel 1', async () => {
      // Panel 1 has Session 1 from baseTime to baseTime + 15m (with 5m buffer -> busy until +20m)
      const conflictStarts = new Date(baseTime.getTime() + 10 * 60 * 1000).toISOString();
      const conflictEnds = new Date(baseTime.getTime() + 25 * 60 * 1000).toISOString();

      await assert.rejects(
        async () => {
          await createEvaluationSession(
            orgAId,
            eventAId,
            roundA1Id,
            {
              panelId: panel1Id,
              teamId: team2Id,
              startsAt: conflictStarts,
              endsAt: conflictEnds,
            },
            ownerUserId
          );
        },
        { name: 'ConflictError' }
      );
    });

    it('reschedules Session 1 to a valid future time slot', async () => {
      const { sessions } = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      const s1 = sessions[0];

      const newStarts = new Date(baseTime.getTime() + 60 * 60 * 1000).toISOString();
      const newEnds = new Date(baseTime.getTime() + 75 * 60 * 1000).toISOString();

      const rescheduled = await rescheduleEvaluationSession(
        orgAId,
        eventAId,
        roundA1Id,
        s1.id,
        {
          startsAt: newStarts,
          endsAt: newEnds,
        },
        ownerUserId
      );

      assert.strictEqual(rescheduled.startsAt, newStarts);
      assert.strictEqual(rescheduled.endsAt, newEnds);
    });

    it('cancels Session 2 with audit reason and preserves record in cancelled status', async () => {
      const { sessions } = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      const s2 = sessions[1];

      const cancelled = await cancelEvaluationSession(
        orgAId,
        eventAId,
        roundA1Id,
        s2.id,
        { cancellationReason: 'Team requested emergency time change.' },
        ownerUserId
      );

      assert.strictEqual(cancelled.status, 'cancelled');

      await assert.rejects(
        () => cancelEvaluationSession(
          orgAId,
          eventAId,
          roundA2Id,
          s2.id,
          { cancellationReason: 'Wrong round must not authorize cancellation.' },
          ownerUserId
        ),
        { name: 'NotFoundError' }
      );

      await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
        const auditRes = await client.query(
          `SELECT metadata
           FROM audit_logs
           WHERE action = 'evaluation.session.cancelled'
             AND entity_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [s2.id]
        );
        assert.strictEqual(auditRes.rows.length, 1);
        assert.strictEqual(auditRes.rows[0].metadata.reason, 'Team requested emergency time change.');
      });

      // Verify session is still stored
      const checkSessions = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      const found = checkSessions.sessions.find((s) => s.id === s2.id);
      assert.ok(found);
      assert.strictEqual(found.status, 'cancelled');
    });
  });

  describe('5. External Judge Session-Scoped Scoring', () => {
    let sessionId;
    let sessionSubmissionId;

    before(async () => {
      const { panels } = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      const session = await createEvaluationSession(
        orgAId,
        eventAId,
        roundA1Id,
        {
          panelId: panels[0].id,
          teamId: team1Id,
          submissionId: submissionAlphaId,
          startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
        },
        ownerUserId
      );
      assert.ok(session, 'A scheduled session with a linked submission is required');
      sessionId = session.id;
      sessionSubmissionId = submissionAlphaId;
    });

    it('allows an assigned external judge to read only the session submission and criteria', async () => {
      const work = await getEvaluationSessionWork(
        orgAId,
        eventAId,
        roundA1Id,
        sessionId,
        judge1UserId
      );

      assert.equal(work.session.id, sessionId);
      assert.equal(work.session.submission.id, sessionSubmissionId);
      assert.equal(work.session.teamId, team1Id);
      assert.equal(work.criteria.length, 1);
      assert.ok(!('judgeEmail' in work.session));
    });

    it('allows valid session-scoped scores and preserves existing upsert semantics', async () => {
      const result = await submitEvaluationSessionScores(
        orgAId,
        eventAId,
        roundA1Id,
        sessionId,
        judge1UserId,
        { scores: [{ criterionId, score: 91, feedback: 'Session-scoped score.' }] }
      );

      assert.equal(result.sessionId, sessionId);
      assert.equal(result.submissionId, sessionSubmissionId);
      assert.equal(result.scores[0].score, 91);

      const updated = await submitEvaluationSessionScores(
        orgAId,
        eventAId,
        roundA1Id,
        sessionId,
        judge1UserId,
        { scores: [{ criterionId, score: 92, feedback: 'Updated existing score.' }] }
      );
      assert.equal(updated.scores[0].score, 92);
    });

    it('rejects another panel, an unaccepted judge, invalid criteria, and invalid scores', async () => {
      await assert.rejects(
        () => getEvaluationSessionWork(orgAId, eventAId, roundA1Id, sessionId, judge2UserId),
        { name: 'AuthorizationError' }
      );
      await assert.rejects(
        () => submitEvaluationSessionScores(
          orgAId,
          eventAId,
          roundA1Id,
          sessionId,
          judge2UserId,
          { scores: [{ criterionId, score: 50 }] }
        ),
        { name: 'AuthorizationError' }
      );
      await assert.rejects(
        () => getEvaluationSessionWork(orgAId, eventAId, roundA1Id, sessionId, judgeManualUserId),
        { name: 'AuthorizationError' }
      );
      await assert.rejects(
        () => getEvaluationSessionWork(orgBId, eventBId, roundA1Id, sessionId, judge1UserId),
        { name: 'AuthorizationError' }
      );
      await assert.rejects(
        () => getEvaluationSessionWork(orgAId, eventAId, roundA2Id, sessionId, judge1UserId),
        { name: 'AuthorizationError' }
      );
      await assert.rejects(
        () => getEvaluationSessionWork(
          orgAId,
          eventAId,
          roundA1Id,
          '00000000-0000-0000-0000-000000000000',
          judge1UserId
        ),
        { name: 'AuthorizationError' }
      );
      await assert.rejects(
        () => submitEvaluationSessionScores(
          orgAId,
          eventAId,
          roundA1Id,
          sessionId,
          judge1UserId,
          { scores: [{ criterionId: '00000000-0000-0000-0000-000000000000', score: 50 }] }
        ),
        { name: 'ValidationError' }
      );
      await assert.rejects(
        () => submitEvaluationSessionScores(
          orgAId,
          eventAId,
          roundA1Id,
          sessionId,
          judge1UserId,
          { scores: [{ criterionId, score: 101 }] }
        ),
        { name: 'ValidationError' }
      );
    });

    it('rolls back all scores when a multi-score request contains a later invalid item', async () => {
      const before = await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => (
        (await client.query(
          `SELECT score
           FROM event_scores
           WHERE organisation_id = $1
             AND event_id = $2
             AND submission_id = $3
             AND criterion_id = $4
             AND judge_user_id = $5`,
          [orgAId, eventAId, sessionSubmissionId, criterionId, judge1UserId]
        )).rows[0]
      ));

      await assert.rejects(
        () => submitEvaluationSessionScores(
          orgAId,
          eventAId,
          roundA1Id,
          sessionId,
          judge1UserId,
          {
            scores: [
              { criterionId, score: 94, feedback: 'Must roll back.' },
              { criterionId: '00000000-0000-0000-0000-000000000000', score: 50 },
            ],
          }
        ),
        { name: 'ValidationError' }
      );

      const after = await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => (
        (await client.query(
          `SELECT score
           FROM event_scores
           WHERE organisation_id = $1
             AND event_id = $2
             AND submission_id = $3
             AND criterion_id = $4
             AND judge_user_id = $5`,
          [orgAId, eventAId, sessionSubmissionId, criterionId, judge1UserId]
        )).rows[0]
      ));

      assert.equal(after.score, before.score);
    });

    it('does not create organisation membership for an external judge', async () => {
      const membership = await withSystemTransaction(async (client) => (
        (await client.query(
          `SELECT 1
           FROM organisation_memberships
           WHERE organisation_id = $1 AND user_id = $2`,
          [orgAId, judge1UserId]
        )).rows[0]
      ));

      assert.equal(membership, undefined);
    });

    it('exposes the session-scoped HTTP contract to an external judge without membership', async () => {
      const csrfResponse = await request(app).get('/api/v1/auth/csrf');
      const csrfCookie = csrfResponse.headers['set-cookie']
        .find((cookie) => cookie.startsWith(`${CSRF_COOKIE_NAME}=`))
        .split(';')[0];
      const csrfToken = csrfCookie.split('=')[1];
      const judgeSession = await createSession({ userId: judge1UserId });
      const cookies = [`${SESSION_COOKIE_NAME}=${judgeSession.rawToken}`, csrfCookie];

      const workResponse = await request(app)
        .get(`/api/v1/organisations/${orgAId}/events/${eventAId}/rounds/${roundA1Id}/evaluation/sessions/${sessionId}/work`)
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken);
      assert.equal(workResponse.status, 200);
      assert.equal(workResponse.body.data.session.id, sessionId);

      const scoreResponse = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventAId}/rounds/${roundA1Id}/evaluation/sessions/${sessionId}/scores`)
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken)
        .send({ scores: [{ criterionId, score: 93, feedback: 'HTTP session score.' }] });
      assert.equal(scoreResponse.status, 200);
      assert.equal(scoreResponse.body.data.sessionId, sessionId);
    });

    it('serializes concurrent assignment revocation versus scoring safely', async () => {
      const testPanel = await createEvaluationPanel(
        orgAId,
        eventAId,
        roundA1Id,
        { name: `${fixturePrefix} Concurrency Panel`, orderIndex: 99 },
        ownerUserId
      );
      await assignJudgeToPanel(
        orgAId,
        eventAId,
        roundA1Id,
        testPanel.id,
        { judgeUserId: judgeManualUserId },
        ownerUserId
      );
      const concurrencySession = await createEvaluationSession(
        orgAId,
        eventAId,
        roundA1Id,
        {
          panelId: testPanel.id,
          teamId: team1Id,
          submissionId: submissionAlphaId,
          startsAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
        },
        ownerUserId
      );

      const [scoreOutcome, revokeOutcome] = await Promise.allSettled([
        submitEvaluationSessionScores(
          orgAId,
          eventAId,
          roundA1Id,
          concurrencySession.id,
          judgeManualUserId,
          { scores: [{ criterionId, score: 85, feedback: 'Concurrent score test' }] }
        ),
        removeJudgeFromPanel(
          orgAId,
          eventAId,
          roundA1Id,
          testPanel.id,
          judgeManualUserId,
          ownerUserId
        ),
      ]);

      assert.equal(revokeOutcome.status, 'fulfilled');
      if (scoreOutcome.status === 'rejected') {
        assert.equal(scoreOutcome.reason.name, 'AuthorizationError');
      } else {
        assert.equal(scoreOutcome.value.success, true);
      }

      await assert.rejects(
        () => submitEvaluationSessionScores(
          orgAId,
          eventAId,
          roundA1Id,
          concurrencySession.id,
          judgeManualUserId,
          { scores: [{ criterionId, score: 86 }] }
        ),
        { name: 'AuthorizationError' }
      );
    });
  });

  describe('6. Meeting-Link Privacy & Participant Response Projection', () => {
    let nearSessionId, farSessionId;
    let panelId;

    before(async () => {
      const { panels } = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      panelId = panels[0].id;

      // Session A: Starts in 5 minutes (within 10-minute release window)
      const nearStarts = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const nearEnds = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const nearSession = await createEvaluationSession(
        orgAId,
        eventAId,
        roundA1Id,
        {
          panelId,
          teamId: team1Id,
          startsAt: nearStarts,
          endsAt: nearEnds,
          meetingUrl: 'https://meet.managex.local/room-near-active',
          notes: 'Confidential judges notes for Team 1',
        },
        ownerUserId
      );
      nearSessionId = nearSession.id;

      // Session B: Starts in 2 hours (outside 10-minute release window)
      const farStarts = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const farEnds = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();
      const farSession = await createEvaluationSession(
        orgAId,
        eventAId,
        roundA1Id,
        {
          panelId,
          teamId: team2Id,
          startsAt: farStarts,
          endsAt: farEnds,
          meetingUrl: 'https://meet.managex.local/room-far-future',
          notes: 'Confidential judges notes for Team 2',
        },
        ownerUserId
      );
      farSessionId = farSession.id;
    });

    it('hides unpublished sessions completely from participants', async () => {
      // Schedule is still draft (unpublished)
      const student1Result = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: student1UserId,
        isOrganiser: false,
        isJudge: false,
        isParticipant: true,
      });

      assert.strictEqual(student1Result.sessions.length, 0);
    });

    it('publishes the schedule and enables participant scoped visibility', async () => {
      const pubRes = await publishEvaluationSchedule(orgAId, eventAId, roundA1Id, ownerUserId);
      assert.strictEqual(pubRes.success, true);
      assert.strictEqual(pubRes.status, 'published');
    });

    it('reveals meeting URL for near session (within 10-minute window) to Team Alpha participant', async () => {
      const result = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: student1UserId,
        isOrganiser: false,
        isJudge: false,
        isParticipant: true,
      });

      const session = result.sessions.find((candidate) => candidate.id === nearSessionId);
      assert.ok(session);
      assert.strictEqual(session.id, nearSessionId);
      assert.strictEqual(session.teamId, team1Id);

      // Meeting URL IS visible because now >= starts_at - 10 minutes
      assert.strictEqual(session.meetingUrl, 'https://meet.managex.local/room-near-active');

      // Notes and judges must be redacted
      assert.strictEqual(session.notes, undefined);
      assert.strictEqual(session.judges, undefined);
    });

    it('redacts meeting URL for far session (outside 10-minute window) to Team Beta participant', async () => {
      const result = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: student2UserId,
        isOrganiser: false,
        isJudge: false,
        isParticipant: true,
      });

      const session = result.sessions.find((candidate) => candidate.id === farSessionId);
      assert.ok(session);
      assert.strictEqual(session.id, farSessionId);
      assert.strictEqual(session.teamId, team2Id);

      // Meeting URL is hidden
      assert.strictEqual(session.meetingUrl, null);
      assert.ok(session.meetingLinkAvailableAt);

      // Notes and judges redacted
      assert.strictEqual(session.notes, undefined);
      assert.strictEqual(session.judges, undefined);
    });

    it('prevents Team Alpha participant from seeing Team Beta sessions', async () => {
      const result = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: student1UserId,
        isOrganiser: false,
        isJudge: false,
        isParticipant: true,
      });

      const team2Found = result.sessions.find((s) => s.teamId === team2Id);
      assert.strictEqual(team2Found, undefined);
    });

    it('never exposes default_meeting_url in round evaluation to participants', async () => {
      const evalData = await getRoundEvaluation(orgAId, eventAId, roundA1Id, {
        userId: student1UserId,
        isOrganiser: false,
        isJudge: false,
      });

      assert.strictEqual(evalData.configured, true);
      assert.strictEqual(evalData.evaluation.defaultMeetingUrl, null);
    });

    it('redacts meeting URL immediately if session is cancelled', async () => {
      await cancelEvaluationSession(
        orgAId,
        eventAId,
        roundA1Id,
        nearSessionId,
        { cancellationReason: 'Session cancelled by host' },
        ownerUserId
      );

      const result = await listEvaluationSessions(orgAId, eventAId, roundA1Id, {
        userId: student1UserId,
        isOrganiser: false,
        isJudge: false,
        isParticipant: true,
      });

      // Cancelled sessions are hidden from participant view entirely
      const cancelled = result.sessions.find((candidate) => candidate.id === nearSessionId);
      assert.strictEqual(cancelled, undefined);
    });
  });

  describe('7. Tenant Isolation & Cross-Tenant Protection', () => {
    it('prevents Org B user from viewing or modifying Org A round evaluations', async () => {
      await assert.rejects(
        async () => {
          await createRoundEvaluation(
            orgBId,
            eventAId, // Mismatched event in Org A
            roundA1Id,
            { evaluationMode: 'live_showcase' },
            crossTenantUserId
          );
        },
        { name: 'NotFoundError' }
      );
    });

    it('prevents Org B user from assigning judges to Org A panels', async () => {
      const { panels } = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      const panelId = panels[0].id;

      await assert.rejects(
        async () => {
          await assignJudgeToPanel(
            orgBId, // Wrong org
            eventAId,
            roundA1Id,
            panelId,
            { judgeUserId: crossTenantUserId },
            crossTenantUserId
          );
        },
        { name: 'NotFoundError' }
      );
    });
  });

  describe('8. Phase 3 Focused Verification — Judge Invitations', () => {
    let panelId;
    let judgeEmail;
    let judgeUser;

    before(async () => {
      const { panels } = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      panelId = panels[0].id;
      const user = await withSystemTransaction(async (client) => {
        const result = await client.query(
          'SELECT id, email, email_verified_at FROM users WHERE id = $1',
          [judgeManualUserId]
        );
        return result.rows[0];
      });
      judgeEmail = user.email;
      judgeUser = {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.email_verified_at,
      };
      clearTestMailbox();
    });

    it('stores only a token hash and invalidates the previous pending invitation on resend', async () => {
      const first = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, judgeEmail, ownerUserId
      );
      const firstMail = getTestMailbox().at(-1);
      const firstToken = firstMail.text.match(/evaluation\/([a-f0-9]+)$/)[1];
      const second = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, judgeEmail, ownerUserId
      );
      const secondMail = getTestMailbox().at(-1);
      const secondToken = secondMail.text.match(/evaluation\/([a-f0-9]+)$/)[1];
      assert.notEqual(firstToken, secondToken);

      await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
        const rows = await client.query(
          `SELECT id, status, token_hash, invited_email
           FROM evaluation_judge_invitations WHERE id = ANY($1::uuid[])`,
          [[first.id, second.id]]
        );
        const byId = new Map(rows.rows.map((row) => [row.id, row]));
        assert.equal(byId.get(first.id).status, 'revoked');
        assert.equal(byId.get(second.id).status, 'pending');
        assert.notEqual(byId.get(second.id).token_hash, secondToken);
        assert.ok(rows.rows.every((row) => !row.token_hash.includes(firstToken) && !row.token_hash.includes(secondToken)));

        const audit = await client.query(
          `SELECT metadata::text AS metadata FROM audit_logs
           WHERE entity_id = $1 OR entity_id = $2 ORDER BY created_at DESC`,
          [first.id, second.id]
        );
        assert.ok(audit.rows.every((row) => !row.metadata.includes(firstToken) && !row.metadata.includes(secondToken)));
      });
    });

    it('accepts only a verified matching user, activates the panel assignment, and creates no membership', async () => {
      const invitation = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, judgeEmail, ownerUserId
      );
      const token = getTestMailbox().at(-1).text.match(/evaluation\/([a-f0-9]+)$/)[1];
      const beforeMembership = await withSystemTransaction(async (client) => (
        (await client.query(
          'SELECT COUNT(*)::int AS count FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2',
          [orgAId, judgeUser.id]
        )).rows[0].count
      ));

      const accepted = await acceptEvaluationJudgeInvitation(token, judgeUser);
      assert.equal(accepted.panelId, panelId);

      await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
        const assignment = await client.query(
          `SELECT 1 FROM evaluation_panel_judges
           WHERE round_evaluation_id = (SELECT id FROM round_evaluations WHERE round_id = $1)
             AND panel_id = $2 AND judge_user_id = $3`,
          [roundA1Id, panelId, judgeUser.id]
        );
        assert.equal(assignment.rowCount, 1);
        const afterMembership = await client.query(
          'SELECT COUNT(*)::int AS count FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2',
          [orgAId, judgeUser.id]
        );
        assert.equal(afterMembership.rows[0].count, beforeMembership);
        const audit = await client.query(
          `SELECT metadata::text AS metadata FROM audit_logs
           WHERE entity_id = $1 AND action = 'evaluation.judge.invitation.accepted'`,
          [invitation.id]
        );
        assert.ok(audit.rows.every((row) => !row.metadata.includes(token)));
      });

      await assert.rejects(
        () => acceptEvaluationJudgeInvitation(token, judgeUser),
        { name: 'ConflictError' }
      );
      await revokeEvaluationJudgeInvitation(orgAId, invitation.id, ownerUserId);
    });

    it('rejects wrong-email, unverified, expired, and revoked invitations', async () => {
      const wrongEmailInvitation = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, judgeEmail, ownerUserId
      );
      const wrongEmailToken = getTestMailbox().at(-1).text.match(/evaluation\/([a-f0-9]+)$/)[1];
      await assert.rejects(
        () => acceptEvaluationJudgeInvitation(wrongEmailToken, {
          id: ownerUserId,
          email: 'wrong-user@managex.local',
          emailVerifiedAt: new Date().toISOString(),
        }),
        { name: 'AuthorizationError' }
      );
      await revokeEvaluationJudgeInvitation(orgAId, wrongEmailInvitation.id, ownerUserId);

      const unverifiedInvitation = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, judgeEmail, ownerUserId
      );
      const unverifiedToken = getTestMailbox().at(-1).text.match(/evaluation\/([a-f0-9]+)$/)[1];
      await assert.rejects(
        () => acceptEvaluationJudgeInvitation(unverifiedToken, { ...judgeUser, emailVerifiedAt: null }),
        { name: 'AuthorizationError' }
      );
      await revokeEvaluationJudgeInvitation(orgAId, unverifiedInvitation.id, ownerUserId);

      const expiredInvitation = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, judgeEmail, ownerUserId
      );
      const expiredToken = getTestMailbox().at(-1).text.match(/evaluation\/([a-f0-9]+)$/)[1];
      await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
        await client.query(
          `UPDATE evaluation_judge_invitations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
          [expiredInvitation.id]
        );
      });
      await assert.rejects(
        () => acceptEvaluationJudgeInvitation(expiredToken, judgeUser),
        { name: 'ValidationError' }
      );
    });

    it('revocation removes the active panel assignment and blocks panel access', async () => {
      const invitation = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, judgeEmail, ownerUserId
      );
      const token = getTestMailbox().at(-1).text.match(/evaluation\/([a-f0-9]+)$/)[1];
      await acceptEvaluationJudgeInvitation(token, judgeUser);
      await revokeEvaluationJudgeInvitation(orgAId, invitation.id, ownerUserId);
      const result = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: judgeUser.id,
        isJudge: true,
      });
      assert.equal(result.panels.length, 0);
    });

    it('enforces authentication and verified-email checks through the acceptance route', async () => {
      const invitation = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, judgeEmail, ownerUserId
      );
      const token = getTestMailbox().at(-1).text.match(/evaluation\/([a-f0-9]+)$/)[1];
      const unauthenticated = await request(app)
        .post(`/api/v1/invitations/evaluation/${token}/accept`);
      assert.equal(unauthenticated.status, 401);

      const csrfResponse = await request(app).get('/api/v1/auth/csrf');
      const csrfCookie = csrfResponse.headers['set-cookie']
        .find((cookie) => cookie.startsWith(`${CSRF_COOKIE_NAME}=`))
        .split(';')[0];
      const csrfToken = csrfCookie.split('=')[1];
      const ownerSession = await createSession({ userId: ownerUserId });
      const wrongEmail = await request(app)
        .post(`/api/v1/invitations/evaluation/${token}/accept`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=${ownerSession.rawToken}`, csrfCookie])
        .set('X-CSRF-Token', csrfToken);
      assert.equal(wrongEmail.status, 403);

      const unverifiedUser = await withSystemTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
           VALUES ('Unverified Evaluation Judge', $1, $2, 'active', NULL)
           RETURNING id, email`,
          [`unverified_${Date.now()}@managex.local`, await hashPassword('SecurePassword123!')]
        );
        return result.rows[0];
      });
      const unverifiedInvitation = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, panelId, unverifiedUser.email, ownerUserId
      );
      const unverifiedToken = getTestMailbox().at(-1).text.match(/evaluation\/([a-f0-9]+)$/)[1];
      const unverifiedSession = await createSession({ userId: unverifiedUser.id });
      const unverified = await request(app)
        .post(`/api/v1/invitations/evaluation/${unverifiedToken}/accept`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=${unverifiedSession.rawToken}`, csrfCookie])
        .set('X-CSRF-Token', csrfToken);
      assert.equal(unverified.status, 403);
      assert.equal(invitation.id.length, 36);
      assert.equal(unverifiedInvitation.id.length, 36);
    });

    it('blocks score submission through the protected HTTP route after judge revocation', async () => {
      const { panels } = await listEvaluationPanels(orgAId, eventAId, roundA1Id, {
        userId: ownerUserId,
        isOrganiser: true,
      });
      const targetPanelId = panels[0].id;
      await removeJudgeFromPanel(orgAId, eventAId, roundA1Id, targetPanelId, judge1UserId, ownerUserId);
      const judge = await withSystemTransaction(async (client) => (
        (await client.query('SELECT email, email_verified_at FROM users WHERE id = $1', [judge1UserId])).rows[0]
      ));
      const invitation = await createEvaluationJudgeInvitation(
        orgAId, eventAId, roundA1Id, targetPanelId, judge.email, ownerUserId
      );
      const token = getTestMailbox().at(-1).text.match(/evaluation\/([a-f0-9]+)$/)[1];
      await acceptEvaluationJudgeInvitation(token, {
        id: judge1UserId,
        email: judge.email,
        emailVerifiedAt: judge.email_verified_at,
      });
      await revokeEvaluationJudgeInvitation(orgAId, invitation.id, ownerUserId);

      const csrfResponse = await request(app).get('/api/v1/auth/csrf');
      const csrfCookie = csrfResponse.headers['set-cookie']
        .find((cookie) => cookie.startsWith(`${CSRF_COOKIE_NAME}=`))
        .split(';')[0];
      const judgeSession = await createSession({ userId: judge1UserId });
      const scoreResponse = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventAId}/submissions/${submissionAlphaId}/scores`)
        .set('Cookie', [`${SESSION_COOKIE_NAME}=${judgeSession.rawToken}`, csrfCookie])
        .set('X-CSRF-Token', csrfCookie.split('=')[1])
        .send({ scores: [{ criterionId, score: 75 }] });
      assert.equal(scoreResponse.status, 403);
    });
  });

  describe('9. Phase 3 Focused Verification — Completion and Capacity', () => {
    it('rejects completion when scoring criteria are missing', async () => {
      const round = await withSystemTransaction(async (client) => (
        (await client.query(
          `INSERT INTO event_rounds
           (organisation_id, event_id, round_number, name, status, advancement_rule)
           VALUES ($1, $2, 3, 'Criteria Missing Round', 'open', 'manual')
           RETURNING id`,
          [orgBId, eventBId]
        )).rows[0]
      ));
      await createRoundEvaluation(orgBId, eventBId, round.id, { evaluationMode: 'submission_based' }, crossTenantUserId);
      await assert.rejects(
        () => completeRoundEvaluation(orgBId, eventBId, round.id, crossTenantUserId),
        { name: 'ConflictError' }
      );
    });

    it('rejects completion when a completed submission session has incomplete scores', async () => {
      const round = await withSystemTransaction(async (client) => (
        (await client.query(
          `INSERT INTO event_rounds
           (organisation_id, event_id, round_number, name, status, advancement_rule)
           VALUES ($1, $2, 4, 'Incomplete Scores Round', 'open', 'manual')
           RETURNING id`,
          [orgAId, eventAId]
        )).rows[0]
      ));
      const submission = await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => (
        (await client.query(
          `INSERT INTO event_submissions
           (organisation_id, event_id, round_id, team_id, submitter_user_id, title, status, submitted_at)
           VALUES ($1, $2, $3, $4, $5, 'Incomplete Scores Submission', 'submitted', NOW())
           RETURNING id`,
          [orgAId, eventAId, round.id, team1Id, student1UserId]
        )).rows[0]
      ));
      await createRoundEvaluation(orgAId, eventAId, round.id, { evaluationMode: 'submission_based' }, ownerUserId);
      const criterion = await createScoringCriterion(
        orgAId, eventAId, { name: 'Incomplete Score Criterion', maxScore: 100, roundId: round.id }, ownerUserId
      );
      const panel = await createEvaluationPanel(
        orgAId,
        eventAId,
        round.id,
        { name: 'Incomplete Scores Panel', orderIndex: 0 },
        ownerUserId
      );
      const session = await createEvaluationSession(
        orgAId,
        eventAId,
        round.id,
        {
          panelId: panel.id,
          teamId: team1Id,
          submissionId: submission.id,
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 90000000).toISOString(),
        },
        ownerUserId
      );
      await updateSessionStatus(orgAId, eventAId, round.id, session.id, { status: 'completed' }, ownerUserId);
      assert.ok(criterion.id);
      await assert.rejects(
        () => completeRoundEvaluation(orgAId, eventAId, round.id, ownerUserId),
        { name: 'ConflictError' }
      );
    });

    it('completes an evaluation once and makes repeated completion idempotent', async () => {
      await createRoundEvaluation(
        orgAId,
        eventAId,
        roundA2Id,
        { evaluationMode: 'live_showcase' },
        ownerUserId
      );
      const completed = await completeRoundEvaluation(orgAId, eventAId, roundA2Id, ownerUserId);
      assert.deepEqual(completed, { success: true, status: 'completed' });
      const repeated = await completeRoundEvaluation(orgAId, eventAId, roundA2Id, ownerUserId);
      assert.deepEqual(repeated, { success: true, status: 'completed', alreadyCompleted: true });

      await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
        const round = await client.query('SELECT status FROM event_rounds WHERE id = $1', [roundA2Id]);
        assert.notEqual(round.rows[0].status, 'published');
        const audits = await client.query(
          `SELECT COUNT(*)::int AS count FROM audit_logs
           WHERE entity_id = (SELECT id::text FROM round_evaluations WHERE round_id = $1)
             AND action = 'evaluation.completed'`,
          [roundA2Id]
        );
        assert.equal(audits.rows[0].count, 1);
      });
    });

    it('rejects completion while sessions are non-terminal', async () => {
      await assert.rejects(
        () => completeRoundEvaluation(orgAId, eventAId, roundA1Id, ownerUserId),
        { name: 'ConflictError' }
      );
    });

    it('rejects a schedule that cannot fit its configured end time before inserting sessions', async () => {
      await updateRoundEvaluation(
        orgAId,
        eventAId,
        roundA1Id,
        { scheduleEndsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() },
        ownerUserId
      );
      const before = await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => (
        (await client.query(
          'SELECT COUNT(*)::int AS count FROM evaluation_sessions WHERE organisation_id = $1',
          [orgAId]
        )).rows[0].count
      ));
      await assert.rejects(
        () => generateEvaluationSchedule(
          orgAId,
          eventAId,
          roundA1Id,
          { scheduleStartsAt: new Date(Date.now() + 86400000).toISOString() },
          ownerUserId
        ),
        { name: 'ConflictError' }
      );
      const after = await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => (
        (await client.query(
          'SELECT COUNT(*)::int AS count FROM evaluation_sessions WHERE organisation_id = $1',
          [orgAId]
        )).rows[0].count
      ));
      assert.equal(after, before);
    });
  });
});
