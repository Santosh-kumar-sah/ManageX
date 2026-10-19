/**
 * ManageX Integration Test Suite: Phase 6D — Judge Assignments, Scoring & Results
 * Strictly tests PRD Section 7.4 (EVT-008, EVT-009), ADR-009, and docs/security.md.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';

describe('Phase 6D — Judge Assignments, Scoring & Results Publication Suite', () => {
  const runTag = `p6d_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let ownerUserId;
  let judgeAId;
  let judgeBId;
  let unassignedJudgeId;
  let participantUserId;
  let orgBUserId;

  let ownerCookie;
  let judgeACookie;
  let judgeBCookie;
  let unassignedJudgeCookie;
  let participantCookie;
  let orgBCookie;

  const csrfToken = 'test-csrf-token-phase6d';
  const csrfCookie = `${CSRF_COOKIE_NAME}=${csrfToken}`;

  let orgAId;
  let orgBId;
  let hackathonEventId;
  let submissionAId;
  let submissionBId;
  let criterionInnovationId;
  let criterionTechId;
  let judgeAssignmentAId;

  before(async () => {
    // 1. Create verified users
    const pwdHash = await hashPassword('Password123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
         VALUES 
           ('Org Owner', 'owner_${runTag}@managex.local', $1, 'active', NOW()),
           ('Judge Alice', 'judge_a_${runTag}@managex.local', $1, 'active', NOW()),
           ('Judge Bob', 'judge_b_${runTag}@managex.local', $1, 'active', NOW()),
           ('Unassigned Judge', 'judge_un_${runTag}@managex.local', $1, 'active', NOW()),
           ('Participant Charlie', 'part_${runTag}@managex.local', $1, 'active', NOW()),
           ('Org B Member', 'orgb_user_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [pwdHash]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email.startsWith('owner_')).id;
    judgeAId = users.find((u) => u.email.startsWith('judge_a_')).id;
    judgeBId = users.find((u) => u.email.startsWith('judge_b_')).id;
    unassignedJudgeId = users.find((u) => u.email.startsWith('judge_un_')).id;
    participantUserId = users.find((u) => u.email.startsWith('part_')).id;
    orgBUserId = users.find((u) => u.email.startsWith('orgb_user_')).id;

    // 2. Create sessions
    const sOwner = await createSession({ userId: ownerUserId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${sOwner.rawToken}`;

    const sJA = await createSession({ userId: judgeAId });
    judgeACookie = `${SESSION_COOKIE_NAME}=${sJA.rawToken}`;

    const sJB = await createSession({ userId: judgeBId });
    judgeBCookie = `${SESSION_COOKIE_NAME}=${sJB.rawToken}`;

    const sJU = await createSession({ userId: unassignedJudgeId });
    unassignedJudgeCookie = `${SESSION_COOKIE_NAME}=${sJU.rawToken}`;

    const sP = await createSession({ userId: participantUserId });
    participantCookie = `${SESSION_COOKIE_NAME}=${sP.rawToken}`;

    const sOB = await createSession({ userId: orgBUserId });
    orgBCookie = `${SESSION_COOKIE_NAME}=${sOB.rawToken}`;

    // 3. Create Organisation A and Organisation B
    const orgARes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Hackathon Org A ${runTag}` });
    orgAId = orgARes.body.data.organisation.id;

    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Hackathon Org B ${runTag}` });
    orgBId = orgBRes.body.data.organisation.id;

    // Enable Events module in Org A
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });

    // Add Judge A, Judge B, and unassigned judge as organisation members in Org A
    await withSystemTransaction(async (client) => {
      for (const jId of [judgeAId, judgeBId, unassignedJudgeId]) {
        await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')
           ON CONFLICT DO NOTHING`,
          [orgAId, jId]
        );
      }
    });

    // 4. Create Hackathon Event in 'in_progress' state
    const now = new Date();
    const startAt = new Date(now.getTime() - 3600000).toISOString(); // 1 hr ago
    const endAt = new Date(now.getTime() + 86400000).toISOString(); // tomorrow

    const eventRes = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, capacity, team_size_min, team_size_max, created_by_id
        ) VALUES (
          $1, 'AI & Robotics Hackathon 2026', 'ai-robotics-hackathon', 'hackathon', 'in_progress', 'public',
          $2, $3, 'UTC', 100, 1, 5, $4
        ) RETURNING id`,
        [orgAId, startAt, endAt, ownerUserId]
      );
      return res.rows[0].id;
    });
    hackathonEventId = eventRes;

    // Register participant and create 2 project submissions
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      // Register participant
      await client.query(
        `INSERT INTO event_registrations (organisation_id, event_id, user_id, status)
         VALUES ($1, $2, $3, 'registered')`,
        [orgAId, hackathonEventId, participantUserId]
      );

      // Create Team 1 and Submission 1
      const t1 = await client.query(
        `INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
         VALUES ($1, $2, 'Team Alpha', 'team-alpha', $3) RETURNING id`,
        [orgAId, hackathonEventId, participantUserId]
      );
      await client.query(
        `INSERT INTO event_team_members (organisation_id, event_id, team_id, user_id, is_owner)
         VALUES ($1, $2, $3, $4, true)`,
        [orgAId, hackathonEventId, t1.rows[0].id, participantUserId]
      );
      const sub1 = await client.query(
        `INSERT INTO event_submissions (
          organisation_id, event_id, team_id, submitter_user_id, title, description, repository_url, demo_url
        ) VALUES (
          $1, $2, $3, $4, 'Neural Drone Navigation', 'Autonomous drone AI', 'https://github.com/team-alpha/drone', 'https://drone-demo.app'
        ) RETURNING id`,
        [orgAId, hackathonEventId, t1.rows[0].id, participantUserId]
      );
      submissionAId = sub1.rows[0].id;

      // Create Team 2 and Submission 2
      const t2 = await client.query(
        `INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
         VALUES ($1, $2, 'Team Beta', 'team-beta', $3) RETURNING id`,
        [orgAId, hackathonEventId, ownerUserId]
      );
      const sub2 = await client.query(
        `INSERT INTO event_submissions (
          organisation_id, event_id, team_id, submitter_user_id, title, description, repository_url, demo_url
        ) VALUES (
          $1, $2, $3, $4, 'Quantum Optimizer', 'Quantum simulated annealing', 'https://github.com/team-beta/quantum', 'https://quantum-demo.app'
        ) RETURNING id`,
        [orgAId, hackathonEventId, t2.rows[0].id, ownerUserId]
      );
      submissionBId = sub2.rows[0].id;
    });
  });

  // ---------------------------------------------------------------------------
  // 1. EVT-008: Scoring Criteria Configuration
  // ---------------------------------------------------------------------------

  it('1. EVT-008: Event administrator configures scoring criteria with max_score (1..100)', async () => {
    // Criterion 1: Innovation (max 50)
    const res1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Innovation & Originality',
        description: 'Novelty of approach and problem difficulty',
        orderIndex: 1,
        maxScore: 50,
      });

    assert.equal(res1.status, 201);
    assert.equal(res1.body.success, true);
    assert.equal(res1.body.data.criterion.name, 'Innovation & Originality');
    assert.equal(res1.body.data.criterion.maxScore, 50);
    criterionInnovationId = res1.body.data.criterion.id;

    // Criterion 2: Technical Execution (max 50)
    const res2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Technical Execution',
        description: 'Architecture, code quality and live demo',
        orderIndex: 2,
        maxScore: 50,
      });

    assert.equal(res2.status, 201);
    criterionTechId = res2.body.data.criterion.id;
  });

  it('2. EVT-008: Criterion with invalid max_score (> 100 or <= 0) is rejected with 422', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Invalid Criterion',
        maxScore: 150, // exceeds 100 limit
      });

    assert.equal(res.status, 422);
  });

  it('3. EVT-008: Duplicate criterion name in same event is rejected with 409', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Technical Execution',
        maxScore: 50,
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CRITERION_NAME_EXISTS');
  });

  // ---------------------------------------------------------------------------
  // 2. EVT-008: Judge Assignments
  // ---------------------------------------------------------------------------

  it('4. EVT-008: Event manager assigns Judge Alice to all submissions in event', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/judges`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ judgeUserId: judgeAId });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.assignment.judgeUserId, judgeAId);
    assert.equal(res.body.data.assignment.submissionId, null);
    judgeAssignmentAId = res.body.data.assignment.id;
  });

  it('5. EVT-008: Event manager assigns Judge Bob to all submissions in event', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/judges`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ judgeUserId: judgeBId });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
  });

  it('6. EVT-008: Duplicate judge assignment is rejected with 409 ASSIGNMENT_EXISTS', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/judges`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ judgeUserId: judgeAId });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ASSIGNMENT_EXISTS');
  });

  // ---------------------------------------------------------------------------
  // 3. EVT-008: Judge Work View & Scoring
  // ---------------------------------------------------------------------------

  it('7. EVT-008: Assigned Judge Alice lists assigned work and sees both submissions', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/judge-work`)
      .set('Cookie', [judgeACookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.workItems.length, 2);
    assert.equal(res.body.data.criteria.length, 2);
    assert.equal(res.body.data.workItems[0].isFullyEvaluated, false);
  });

  it('8. EVT-008: Unassigned judge querying judge-work receives empty work list', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/judge-work`)
      .set('Cookie', [unassignedJudgeCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.workItems.length, 0);
  });

  it('9. EVT-008: Unassigned judge attempting to submit scores is rejected with 403 JUDGE_NOT_ASSIGNED', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/submissions/${submissionAId}/scores`)
      .set('Cookie', [unassignedJudgeCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        scores: [
          { criterionId: criterionInnovationId, score: 40 },
          { criterionId: criterionTechId, score: 45 },
        ],
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'JUDGE_NOT_ASSIGNED');
  });

  it('10. EVT-008: Score exceeding criterion maxScore is rejected with 422 ValidationError', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/submissions/${submissionAId}/scores`)
      .set('Cookie', [judgeACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        scores: [
          { criterionId: criterionInnovationId, score: 99 }, // max is 50
        ],
      });

    assert.equal(res.status, 422);
  });

  it('11. EVT-008: Assigned Judge Alice submits valid scores for Submission A and B', async () => {
    // Judge Alice scores Submission A: 45 + 45 = 90
    const resA = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/submissions/${submissionAId}/scores`)
      .set('Cookie', [judgeACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        scores: [
          { criterionId: criterionInnovationId, score: 45, feedback: 'Brilliant innovation' },
          { criterionId: criterionTechId, score: 45, feedback: 'Clean drone control code' },
        ],
      });
    assert.equal(resA.status, 200);
    assert.equal(resA.body.success, true);

    // Judge Alice scores Submission B: 40 + 40 = 80
    const resB = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/submissions/${submissionBId}/scores`)
      .set('Cookie', [judgeACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        scores: [
          { criterionId: criterionInnovationId, score: 40 },
          { criterionId: criterionTechId, score: 40 },
        ],
      });
    assert.equal(resB.status, 200);
  });

  it('12. EVT-008: Modifying criteria after judging has started is rejected with 409 SCORING_ALREADY_STARTED', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Business Viability',
        maxScore: 50,
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SCORING_ALREADY_STARTED');
  });

  // ---------------------------------------------------------------------------
  // 4. EVT-009 & ADR-009: Results Calculation, Privacy & Publication
  // ---------------------------------------------------------------------------

  it('13. EVT-009: Unpublished results are forbidden to regular participants and public visitors (403 RESULTS_NOT_PUBLISHED)', async () => {
    // Participant query
    const partRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/results`)
      .set('Cookie', [participantCookie, csrfCookie]);
    assert.equal(partRes.status, 403);
    assert.equal(partRes.body.error.code, 'RESULTS_NOT_PUBLISHED');

    // Public query
    const pubRes = await request(app).get(`/api/v1/events/${hackathonEventId}/results`);
    assert.equal(pubRes.status, 403);
    assert.equal(pubRes.body.error.code, 'RESULTS_NOT_PUBLISHED');
  });

  it('14. EVT-009: Publishing results is rejected with 409 INCOMPLETE_EVALUATION when Judge Bob has not yet scored', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/publish-results`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INCOMPLETE_EVALUATION');
  });

  it('15. ADR-009: Judge Bob submits scores creating a tie on total score (Shared Ranks)', async () => {
    // Judge Bob scores Submission A: 40 + 40 = 80 (Sub A total: 90 + 80 = 170)
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/submissions/${submissionAId}/scores`)
      .set('Cookie', [judgeBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        scores: [
          { criterionId: criterionInnovationId, score: 40 },
          { criterionId: criterionTechId, score: 40 },
        ],
      });

    // Judge Bob scores Submission B: 45 + 45 = 90 (Sub B total: 80 + 90 = 170) -> TIE!
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/submissions/${submissionBId}/scores`)
      .set('Cookie', [judgeBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        scores: [
          { criterionId: criterionInnovationId, score: 45 },
          { criterionId: criterionTechId, score: 45 },
        ],
      });

    // Event Owner checks preliminary results
    const resultsRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/results`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(resultsRes.status, 200);
    assert.equal(resultsRes.body.data.isPublishable, true);
    assert.equal(resultsRes.body.data.results.length, 2);

    const [r1, r2] = resultsRes.body.data.results;
    assert.equal(r1.totalScore, 170);
    assert.equal(r2.totalScore, 170);
    // ADR-009: "Tied totals share ranks" -> both must be Rank 1!
    assert.equal(r1.rank, 1);
    assert.equal(r2.rank, 1);
  });

  it('16. EVT-009: Participant lacking event.result.publish permission cannot publish results (403)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/publish-results`)
      .set('Cookie', [participantCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 403);
  });

  it('17. EVT-009: Authorized Event Administrator publishes final calculated results', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/publish-results`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.publishedAt);
  });

  it('18. EVT-009: Once published, participants and public visitors can view official rankings', async () => {
    // Participant view
    const partRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/results`)
      .set('Cookie', [participantCookie, csrfCookie]);

    assert.equal(partRes.status, 200);
    assert.equal(partRes.body.data.isPublished, true);
    assert.equal(partRes.body.data.results.length, 2);
    assert.equal(partRes.body.data.results[0].rank, 1);
    assert.equal(partRes.body.data.results[1].rank, 1);

    // Public view
    const pubRes = await request(app).get(`/api/v1/events/${hackathonEventId}/results`);
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.data.isPublished, true);
    assert.equal(pubRes.body.data.results.length, 2);
  });

  it('19. AUD-001: Criteria, judge assignments, score submissions, and result publication generate immutable audit logs', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    const logs = res.body.data.auditLogs || res.body.data.logs;

    const critLog = logs.find((l) => l.action === 'event.criterion.created');
    assert.ok(critLog, 'Expected event.criterion.created audit log');

    const judgeLog = logs.find((l) => l.action === 'event.judge.assigned');
    assert.ok(judgeLog, 'Expected event.judge.assigned audit log');

    const scoreLog = logs.find((l) => l.action === 'event.scores.submitted');
    assert.ok(scoreLog, 'Expected event.scores.submitted audit log');

    const pubLog = logs.find((l) => l.action === 'event.results_published');
    assert.ok(pubLog, 'Expected event.results_published audit log');
  });

  it('20. RBAC-007 & Tenant Isolation: User in Org B cannot query or submit scores in Org A', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${hackathonEventId}/judge-work`)
      .set('Cookie', [orgBCookie, csrfCookie]);

    assert.equal(res.status, 403);
  });
});
