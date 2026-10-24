/**
 * ManageX Multi-Round Hackathons: Finalization & Integrity Hardening Integration Tests
 * Phase 02D: EVT-010, ADR-001, ADR-003, ADR-008, ADR-009, docs/security.md
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../../app.js';
import { getPool } from '../database/pool.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('Phase 02D — Multi-Round Hackathon Finalization & Integrity Hardening Suite', () => {
  const runId = randomUUID();
  const prefix = `r2d_${runId.replaceAll('-', '').slice(0, 10)}`;
  let pool;
  let ownerUserId, judge1UserId, judge2UserId, part1UserId, part2UserId, part3UserId, crossUserId;
  let ownerCookie, judge1Cookie, judge2Cookie, part1Cookie, part2Cookie, part3Cookie, crossCookie;
  let csrfCookie = '';
  let csrfToken = '';

  let orgAId, orgBId;
  let eventId;
  let round1Id, round2Id;
  let team1Id, team2Id, team3Id;
  let critR1Id, critR2Id;

  before(async () => {
    pool = getPool();

    // Verify safe isolated test database
    await withSystemTransaction(async (client) => {
      const database = await client.query('SELECT current_database() AS name');
      const migration = await client.query(
        `SELECT version FROM schema_migrations WHERE version = '20261017000035'`
      );
      if (database.rows[0].name !== 'managex_test' || migration.rowCount !== 1) {
        throw new Error('Hardening tests require managex_test at migration 20261017000035.');
      }
    });

    // 1. Create test users inside system transaction with unique prefix
    const passwordHash = await hashPassword('SecurePassword123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ('Round2D Owner', $2, $1, 'active', NOW()),
          ('Round2D Judge 1', $3, $1, 'active', NOW()),
          ('Round2D Judge 2', $4, $1, 'active', NOW()),
          ('Round2D Team Alpha', $5, $1, 'active', NOW()),
          ('Round2D Team Beta', $6, $1, 'active', NOW()),
          ('Round2D Team Gamma', $7, $1, 'active', NOW()),
          ('Round2D Cross Org', $8, $1, 'active', NOW())
        RETURNING id, email
      `,
        [
          passwordHash,
          `${prefix}_owner@managex.local`,
          `${prefix}_judge1@managex.local`,
          `${prefix}_judge2@managex.local`,
          `${prefix}_part1@managex.local`,
          `${prefix}_part2@managex.local`,
          `${prefix}_part3@managex.local`,
          `${prefix}_cross@managex.local`,
        ]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email === `${prefix}_owner@managex.local`).id;
    judge1UserId = users.find((u) => u.email === `${prefix}_judge1@managex.local`).id;
    judge2UserId = users.find((u) => u.email === `${prefix}_judge2@managex.local`).id;
    part1UserId = users.find((u) => u.email === `${prefix}_part1@managex.local`).id;
    part2UserId = users.find((u) => u.email === `${prefix}_part2@managex.local`).id;
    part3UserId = users.find((u) => u.email === `${prefix}_part3@managex.local`).id;
    crossUserId = users.find((u) => u.email === `${prefix}_cross@managex.local`).id;

    // 2. Create active sessions
    const sOwner = await createSession({ userId: ownerUserId });
    const sJudge1 = await createSession({ userId: judge1UserId });
    const sJudge2 = await createSession({ userId: judge2UserId });
    const sPart1 = await createSession({ userId: part1UserId });
    const sPart2 = await createSession({ userId: part2UserId });
    const sPart3 = await createSession({ userId: part3UserId });
    const sCross = await createSession({ userId: crossUserId });

    ownerCookie = `${SESSION_COOKIE_NAME}=${sOwner.rawToken}`;
    judge1Cookie = `${SESSION_COOKIE_NAME}=${sJudge1.rawToken}`;
    judge2Cookie = `${SESSION_COOKIE_NAME}=${sJudge2.rawToken}`;
    part1Cookie = `${SESSION_COOKIE_NAME}=${sPart1.rawToken}`;
    part2Cookie = `${SESSION_COOKIE_NAME}=${sPart2.rawToken}`;
    part3Cookie = `${SESSION_COOKIE_NAME}=${sPart3.rawToken}`;
    crossCookie = `${SESSION_COOKIE_NAME}=${sCross.rawToken}`;

    // 3. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const match = cookies.find((c) => c.startsWith('managex_csrf='));
      if (match) {
        csrfCookie = match.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }

    // 4. Create Organisation A and Org B via API
    const orgResA = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: `Round2D Org A ${prefix}`, slug: `${prefix}-org-a` });
    assert.equal(orgResA.status, 201);
    orgAId = orgResA.body.data.organisation.id;

    const orgResB = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [crossCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: `Round2D Org B ${prefix}`, slug: `${prefix}-org-b` });
    assert.equal(orgResB.status, 201);
    orgBId = orgResB.body.data.organisation.id;

    // 5. Add Judges as members of Org A
    await withSystemTransaction(async (client) => {
      await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgAId]);
      const roleRes = await client.query(
        `SELECT id FROM roles WHERE slug = 'organisation_member' AND organisation_id IS NULL`
      );
      const roleId = roleRes.rows[0].id;

      for (const jId of [judge1UserId, judge2UserId]) {
        const memRes = await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active') RETURNING id`,
          [orgAId, jId]
        );
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3)`,
          [orgAId, memRes.rows[0].id, roleId]
        );
      }
    });
  });

  it('1. Event & Round Setup: Multi-round hackathon with Round 1 and Round 2', async () => {
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Phase 02D AI Hackathon',
        eventType: 'hackathon',
        visibility: 'public',
        timezone: 'Asia/Kolkata',
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
      });

    assert.equal(createRes.status, 201);
    eventId = createRes.body.data.event.id;

    // Publish event
    const pubRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ status: 'published' });
    assert.equal(pubRes.status, 200);

    // List automatically initialized Round 1 or create it
    const roundsRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds`)
      .set('Cookie', [ownerCookie]);
    assert.equal(roundsRes.status, 200);

    if (roundsRes.body.data.rounds.length === 0) {
      const createR1 = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'Round 1',
          roundNumber: 1,
          status: 'open',
          advancementRule: 'top_n',
          advancementTopN: 2,
        });
      assert.equal(createR1.status, 201);
      round1Id = createR1.body.data.round.id;
    } else {
      round1Id = roundsRes.body.data.rounds[0].id;
      await request(app)
        .patch(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'open',
          advancementRule: 'top_n',
          advancementTopN: 2,
        });
    }

    // Create Round 2 (pending)
    const r2Res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Final Round',
        roundNumber: 2,
        advancementRule: 'top_n',
        advancementTopN: 2,
      });
    assert.equal(r2Res.status, 201);
    round2Id = r2Res.body.data.round.id;
  });

  it('2. Registration & Teams: 3 teams register and submit to Round 1', async () => {
    // Register 3 participants
    for (const cookie of [part1Cookie, part2Cookie, part3Cookie]) {
      const regRes = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventId}/register`)
        .set('Cookie', [cookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({});
      assert.equal(regRes.status, 201);
    }

    // Start event
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ status: 'in_progress' });

    // Create teams
    const t1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/teams`)
      .set('Cookie', [part1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Alpha 2D' });
    team1Id = t1.body.data.team.id;

    const t2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/teams`)
      .set('Cookie', [part2Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Beta 2D' });
    team2Id = t2.body.data.team.id;

    const t3 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/teams`)
      .set('Cookie', [part3Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Gamma 2D' });
    team3Id = t3.body.data.team.id;

    // Teams submit to Round 1
    const s1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [part1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Project Alpha',
        repositoryUrl: 'https://github.com/managex/alpha-2d',
      });
    assert.equal(s1.status, 201);

    const s2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [part2Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Project Beta',
        repositoryUrl: 'https://github.com/managex/beta-2d',
      });
    assert.equal(s2.status, 201);

    const s3 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [part3Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Project Gamma',
        repositoryUrl: 'https://github.com/managex/gamma-2d',
      });
    assert.equal(s3.status, 201);
  });

  it('3. Round-Scoped Criteria & Judges: Assign Judge 1 specifically to Round 1 and Judge 2 to Round 2', async () => {
    // Round 1 Criterion
    const c1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Technical Depth R1',
        maxScore: 100,
        roundId: round1Id,
      });
    assert.equal(c1.status, 201);
    critR1Id = c1.body.data.criterion.id;

    // Assign Judge 1 specifically to Round 1
    const j1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/judges`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        judgeUserId: judge1UserId,
        roundId: round1Id,
      });
    assert.equal(j1.status, 201);
    assert.equal(j1.body.data.assignment.roundId, round1Id);

    // Assign Judge 2 specifically to Round 2
    const j2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/judges`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        judgeUserId: judge2UserId,
        roundId: round2Id,
      });
    assert.equal(j2.status, 201);
    assert.equal(j2.body.data.assignment.roundId, round2Id);
  });

  it('4. Cross-Round Judge Authorization: Judge 2 (assigned to Round 2) cannot score Round 1 submission', async () => {
    const subRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [ownerCookie]);
    const alphaSubId = subRes.body.data.submissions.find((s) => s.teamId === team1Id).id;

    // Judge 2 attempts to score Round 1 submission -> rejected with 403 JUDGE_NOT_ASSIGNED
    const scoreRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/submissions/${alphaSubId}/scores`)
      .set('Cookie', [judge2Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        scores: [{ criterionId: critR1Id, score: 95 }],
      });
    assert.equal(scoreRes.status, 403);
    assert.equal(scoreRes.body.error.code, 'JUDGE_NOT_ASSIGNED');
  });

  it('5. Incomplete Judging Guard: Advancement is blocked when not all submissions are evaluated', async () => {
    const subRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [ownerCookie]);
    const alphaSubId = subRes.body.data.submissions.find((s) => s.teamId === team1Id).id;

    // Judge 1 scores ONLY Team Alpha (Beta and Gamma are unscored)
    const scoreAlpha = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/submissions/${alphaSubId}/scores`)
      .set('Cookie', [judge1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        scores: [{ criterionId: critR1Id, score: 90 }],
      });
    assert.equal(scoreAlpha.status, 200);

    // Attempt to advance Round 1 via Top-N rule -> blocked with 409 INCOMPLETE_EVALUATION
    const advRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advance`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        rule: 'top_n',
        topN: 2,
      });
    assert.equal(advRes.status, 409);
    assert.equal(advRes.body.error.code, 'INCOMPLETE_EVALUATION');
  });

  it('6. Manual Decisions Protection: Pre-qualify Team Gamma manually and verify it is preserved across Top-N recalculation', async () => {
    const subRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [ownerCookie]);
    const betaSubId = subRes.body.data.submissions.find((s) => s.teamId === team2Id).id;
    const gammaSubId = subRes.body.data.submissions.find((s) => s.teamId === team3Id).id;

    // Complete scoring: Beta gets 80, Gamma gets 30 (lowest)
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/submissions/${betaSubId}/scores`)
      .set('Cookie', [judge1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        scores: [{ criterionId: critR1Id, score: 80 }],
      });

    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/submissions/${gammaSubId}/scores`)
      .set('Cookie', [judge1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        scores: [{ criterionId: critR1Id, score: 30 }],
      });

    // 1. Manually qualify Team Gamma (even with low score)
    const manualAdvRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advance`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        rule: 'manual',
        manualAdvancements: [
          { teamId: team3Id, status: 'qualified', notes: 'Organiser special selection' },
        ],
      });
    assert.equal(manualAdvRes.status, 200);

    const gammaManual = manualAdvRes.body.data.advancements.find((a) => a.teamId === team3Id);
    assert.equal(gammaManual.status, 'qualified');
    assert.equal(gammaManual.isManual, true);

    // 2. Now run automatic Top-1 rule (which would ordinarily only advance Alpha with score 90)
    const autoAdvRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advance`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        rule: 'top_n',
        topN: 1,
      });
    assert.equal(autoAdvRes.status, 200);

    // Alpha advanced via Top-1 (score 90)
    const alphaAdv = autoAdvRes.body.data.advancements.find((a) => a.teamId === team1Id);
    assert.equal(alphaAdv.status, 'qualified');

    // Beta eliminated (score 80 < Top-1 cutoff)
    const betaAdv = autoAdvRes.body.data.advancements.find((a) => a.teamId === team2Id);
    assert.equal(betaAdv.status, 'eliminated');

    // Gamma PRESERVED as qualified because of is_manual protection!
    const gammaAdv = autoAdvRes.body.data.advancements.find((a) => a.teamId === team3Id);
    assert.equal(gammaAdv.status, 'qualified');
    assert.equal(gammaAdv.isManual, true);
    assert.match(gammaAdv.notes, /Preserved manual qualification/);
  });

  it('7. Idempotency: Repeated advancement requests return identical outcomes', async () => {
    const repeatRes1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advance`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        rule: 'top_n',
        topN: 1,
      });
    assert.equal(repeatRes1.status, 200);

    const repeatRes2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advance`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        rule: 'top_n',
        topN: 1,
      });
    assert.equal(repeatRes2.status, 200);
    assert.equal(repeatRes2.body.data.qualifiedCount, repeatRes1.body.data.qualifiedCount);
    assert.equal(repeatRes2.body.data.eliminatedCount, repeatRes1.body.data.eliminatedCount);
  });

  it('8. Score Change Lockout: Score modification on completed round is rejected', async () => {
    const subRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [ownerCookie]);
    const alphaSubId = subRes.body.data.submissions.find((s) => s.teamId === team1Id).id;

    // Round 1 is completed/advanced -> judge cannot modify scores anymore
    const postAdvScore = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/submissions/${alphaSubId}/scores`)
      .set('Cookie', [judge1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        scores: [{ criterionId: critR1Id, score: 99 }],
      });
    assert.equal(postAdvScore.status, 409);
    assert.equal(postAdvScore.body.error.code, 'ROUND_ADVANCEMENT_LOCKED');
  });

  it('9. Results Unpublication: Unpublishing immediately revokes participant and public results access', async () => {
    // Publish Round 1 results
    const pubRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/publish-results`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);
    assert.equal(pubRes.status, 200);

    // Participant and public can see published results
    const partView = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/results`)
      .set('Cookie', [part1Cookie]);
    assert.equal(partView.status, 200);

    const publicView = await request(app)
      .get(`/api/v1/events/${eventId}/rounds/${round1Id}/results`);
    assert.equal(publicView.status, 200);
    assert.equal(publicView.body.data.isPublished, true);

    // Now unpublish
    const unpubRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/unpublish-results`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);
    assert.equal(unpubRes.status, 200);

    // Immediately participant gets 403 RESULTS_NOT_PUBLISHED
    const partBlocked = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/results`)
      .set('Cookie', [part1Cookie]);
    assert.equal(partBlocked.status, 403);
    assert.equal(partBlocked.body.error.code, 'RESULTS_NOT_PUBLISHED');

    // Public endpoint immediately gets 403 RESULTS_NOT_PUBLISHED
    const publicBlocked = await request(app)
      .get(`/api/v1/events/${eventId}/rounds/${round1Id}/results`);
    assert.equal(publicBlocked.status, 403);
    assert.equal(publicBlocked.body.error.code, 'RESULTS_NOT_PUBLISHED');
  });

  it('10. Round Deletion Safeguards: Deleting a round with dependent records is strictly blocked', async () => {
    // Attempting to delete Round 1 (has submissions, criteria, scores, advancements) is rejected
    const delR1 = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);
    assert.equal(delR1.status, 409);
    assert.equal(delR1.body.error.code, 'ROUND_HAS_SUBMISSIONS');

    // Create Round 3 with just criteria configured
    const r3 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Temporary Stage 3',
        roundNumber: 3,
        advancementRule: 'manual',
      });
    assert.equal(r3.status, 201);
    const round3Id = r3.body.data.round.id;

    // Add scoring criterion to Round 3
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Stage 3 Metric',
        maxScore: 50,
        roundId: round3Id,
      });

    // Attempting to delete Round 3 is blocked by ROUND_HAS_CRITERIA
    const delR3 = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round3Id}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);
    assert.equal(delR3.status, 409);
    assert.equal(delR3.body.error.code, 'ROUND_HAS_CRITERIA');
  });

  it('11. Tenant Isolation: Org B member is denied access to Org A rounds and submissions', async () => {
    const crossRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds`)
      .set('Cookie', [crossCookie]);
    assert.equal(crossRes.status, 403);
  });

  it('12. Participant Self-Inspection: Querying own submission returns qualification status without exposing other teams', async () => {
    // Team Alpha queries /my-submission for Round 1
    const mySub = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/my-submission`)
      .set('Cookie', [part1Cookie]);

    assert.equal(mySub.status, 200);
    assert.equal(mySub.body.data.submission.teamId, team1Id);
    assert.equal(mySub.body.data.submission.qualificationStatus, 'qualified');
    assert.equal(mySub.body.data.submission.totalScore, undefined); // scores remain private
  });
});
