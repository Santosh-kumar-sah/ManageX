/**
 * ManageX Multi-Round Hackathons: Submissions, Advancement & Scoring Integration Tests
 * Phase 02C: EVT-010, ADR-001, ADR-003, ADR-008, ADR-009, docs/security.md
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../../app.js';
import { getPool } from '../database/pool.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('Phase 02C — Multi-Round Submissions, Advancement & Scoring Engine Suite', () => {
  const runId = randomUUID();
  const prefix = `r2c_${runId.replaceAll('-', '').slice(0, 10)}`;
  let pool;
  let ownerUserId, judgeUserId, part1UserId, part2UserId, part3UserId, crossUserId;
  let ownerCookie, judgeCookie, part1Cookie, part2Cookie, part3Cookie, crossCookie;
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
        throw new Error('Advancement tests require managex_test at migration 20261017000035.');
      }
    });

    // 1. Create run-unique test users without destructive cleanup
    const passwordHash = await hashPassword('SecurePassword123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ('Round2C Owner', $2, $1, 'active', NOW()),
          ('Round2C Judge', $3, $1, 'active', NOW()),
          ('Round2C Alpha Lead', $4, $1, 'active', NOW()),
          ('Round2C Beta Lead', $5, $1, 'active', NOW()),
          ('Round2C Gamma Lead', $6, $1, 'active', NOW()),
          ('Round2C Cross Org', $7, $1, 'active', NOW())
        RETURNING id, email
      `,
        [
          passwordHash,
          `${prefix}_owner@managex.local`,
          `${prefix}_judge@managex.local`,
          `${prefix}_part1@managex.local`,
          `${prefix}_part2@managex.local`,
          `${prefix}_part3@managex.local`,
          `${prefix}_cross@managex.local`,
        ]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email === `${prefix}_owner@managex.local`).id;
    judgeUserId = users.find((u) => u.email === `${prefix}_judge@managex.local`).id;
    part1UserId = users.find((u) => u.email === `${prefix}_part1@managex.local`).id;
    part2UserId = users.find((u) => u.email === `${prefix}_part2@managex.local`).id;
    part3UserId = users.find((u) => u.email === `${prefix}_part3@managex.local`).id;
    crossUserId = users.find((u) => u.email === `${prefix}_cross@managex.local`).id;

    // 2. User sessions
    const ownerSess = await createSession({ userId: ownerUserId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${ownerSess.rawToken}`;

    const judgeSess = await createSession({ userId: judgeUserId });
    judgeCookie = `${SESSION_COOKIE_NAME}=${judgeSess.rawToken}`;

    const part1Sess = await createSession({ userId: part1UserId });
    part1Cookie = `${SESSION_COOKIE_NAME}=${part1Sess.rawToken}`;

    const part2Sess = await createSession({ userId: part2UserId });
    part2Cookie = `${SESSION_COOKIE_NAME}=${part2Sess.rawToken}`;

    const part3Sess = await createSession({ userId: part3UserId });
    part3Cookie = `${SESSION_COOKIE_NAME}=${part3Sess.rawToken}`;

    const crossSess = await createSession({ userId: crossUserId });
    crossCookie = `${SESSION_COOKIE_NAME}=${crossSess.rawToken}`;

    // 3. CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const c = cookies.find((item) => item.startsWith('managex_csrf='));
      if (c) {
        csrfCookie = c.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }

    // 4. Create Organisation A and Org B with run-unique slugs
    const orgResA = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: `${prefix} Org A`, slug: `${prefix}-org-a` });
    assert.equal(orgResA.status, 201);
    orgAId = orgResA.body.data.organisation.id;

    const orgResB = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [crossCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: `${prefix} Org B`, slug: `${prefix}-org-b` });
    assert.equal(orgResB.status, 201);
    orgBId = orgResB.body.data.organisation.id;

    // Add judge as member of Org A
    await withSystemTransaction(async (client) => {
      await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgAId]);
      const judgeRoleRes = await client.query(
        `SELECT id FROM roles WHERE slug = 'organisation_member' AND organisation_id IS NULL`
      );
      const roleId = judgeRoleRes.rows[0].id;
      const memRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, judgeUserId]
      );
      await client.query(
        `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
         VALUES ($1, $2, $3)`,
        [orgAId, memRes.rows[0].id, roleId]
      );
    });
  });

  after(async () => {
    if (pool) {
      await withSystemTransaction(async (client) => {
        if (orgAId) {
          await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgAId]);
          await client.query("DELETE FROM event_round_advancements WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_scores WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_scoring_criteria WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_judge_assignments WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_submissions WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_rounds WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_team_invitations WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_team_members WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_teams WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM event_registrations WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM events WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM membership_roles WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM organisation_memberships WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM organisation_module_entitlements WHERE organisation_id = $1", [orgAId]);
          await client.query("DELETE FROM organisations WHERE id = $1", [orgAId]);
        }
        if (orgBId) {
          await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgBId]);
          await client.query("DELETE FROM membership_roles WHERE organisation_id = $1", [orgBId]);
          await client.query("DELETE FROM organisation_memberships WHERE organisation_id = $1", [orgBId]);
          await client.query("DELETE FROM organisation_module_entitlements WHERE organisation_id = $1", [orgBId]);
          await client.query("DELETE FROM organisations WHERE id = $1", [orgBId]);
        }
        const userIds = [ownerUserId, judgeUserId, part1UserId, part2UserId, part3UserId, crossUserId].filter(Boolean);
        if (userIds.length > 0) {
          await client.query("DELETE FROM users WHERE id = ANY($1)", [userIds]);
        }
      });
    }
  });

  it('1. Setup hackathon event and configure Round 1 and Round 2', async () => {
    // Create Hackathon Event
    const createEvt = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Multi-Round Hackathon 2026',
        eventType: 'hackathon',
        visibility: 'public',
        startAt: '2026-11-01T09:00:00Z',
        endAt: '2026-11-03T18:00:00Z',
        timezone: 'UTC',
      });
    assert.equal(createEvt.status, 201);
    eventId = createEvt.body.data.event.id;

    // Publish event
    const pubStatus = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ status: 'published' });
    assert.equal(pubStatus.status, 200);

    // Retrieve or create Round 1
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

    // Create Round 2 (Finals, status: pending)
    const createR2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Final Round',
        description: 'Championship Round for Top 2 Teams',
        advancementRule: 'manual',
        status: 'pending',
      });
    assert.equal(createR2.status, 201);
    round2Id = createR2.body.data.round.id;
  });

  it('2. Register 3 teams for the hackathon while published, then start event', async () => {
    // Participants register while event is 'published'
    for (const cookie of [part1Cookie, part2Cookie, part3Cookie]) {
      const reg = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventId}/register`)
        .set('Cookie', [cookie, csrfCookie])
        .set('x-csrf-token', csrfToken);
      assert.equal(reg.status, 201);
    }

    // Team 1 (Alpha)
    const t1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/teams`)
      .set('Cookie', [part1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Team Alpha' });
    assert.equal(t1.status, 201);
    team1Id = t1.body.data.team.id;

    // Team 2 (Beta)
    const t2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/teams`)
      .set('Cookie', [part2Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Team Beta' });
    assert.equal(t2.status, 201);
    team2Id = t2.body.data.team.id;

    // Team 3 (Gamma)
    const t3 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/teams`)
      .set('Cookie', [part3Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Team Gamma' });
    assert.equal(t3.status, 201);
    team3Id = t3.body.data.team.id;

    // Now transition event to in_progress
    const inProg = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ status: 'in_progress' });
    assert.equal(inProg.status, 200);
  });

  it('3. Registered teams successfully submit to Round 1', async () => {
    // Team Alpha submits to Round 1
    const sub1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [part1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Alpha Project R1',
        description: 'Team Alpha Round 1 MVP',
        repositoryUrl: 'https://github.com/managex/alpha-r1',
        demoUrl: 'https://demo.managex.local/alpha-r1',
      });
    assert.equal(sub1.status, 201);
    assert.equal(sub1.body.data.submission.roundId, round1Id);
    assert.equal(sub1.body.data.submission.title, 'Alpha Project R1');

    // Team Beta submits to Round 1
    const sub2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [part2Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Beta Project R1',
        description: 'Team Beta Round 1 MVP',
        repositoryUrl: 'https://github.com/managex/beta-r1',
      });
    assert.equal(sub2.status, 201);

    // Team Gamma submits to Round 1
    const sub3 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [part3Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Gamma Project R1',
        description: 'Team Gamma Round 1 MVP',
        repositoryUrl: 'https://github.com/managex/gamma-r1',
      });
    assert.equal(sub3.status, 201);
  });

  it('4. Participant cannot submit to Round 2 before qualifying in Round 1 (403 ROUND_NOT_ELIGIBLE)', async () => {
    const sub = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round2Id}/submissions`)
      .set('Cookie', [part1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Alpha Sneak Peek R2',
        repositoryUrl: 'https://github.com/managex/alpha-r2',
      });
    // Round 2 is pending and participant is not qualified yet
    assert.ok([403, 409].includes(sub.status));
  });

  it('5. Configure round-scoped scoring criteria and assign judge', async () => {
    // Round 1 Criterion
    const c1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Technical Execution',
        maxScore: 100,
        roundId: round1Id,
      });
    assert.equal(c1.status, 201);
    critR1Id = c1.body.data.criterion.id;

    // Round 2 Criterion with identical name - verified allowed across different rounds!
    const c2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Technical Execution',
        maxScore: 100,
        roundId: round2Id,
      });
    assert.equal(c2.status, 201);
    critR2Id = c2.body.data.criterion.id;

    // Assign judge to event
    const jAssign = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/judges`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ judgeUserId });
    assert.equal(jAssign.status, 201);
  });

  it('6. Judges score Round 1 submissions independently', async () => {
    // Fetch Round 1 submissions
    const subsRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/submissions`)
      .set('Cookie', [ownerCookie]);
    assert.equal(subsRes.status, 200);
    const subs = subsRes.body.data.submissions;
    assert.equal(subs.length, 3);

    const subAlpha = subs.find((s) => s.teamId === team1Id);
    const subBeta = subs.find((s) => s.teamId === team2Id);
    const subGamma = subs.find((s) => s.teamId === team3Id);

    // Judge scores Team Alpha: 90
    const scAlpha = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/submissions/${subAlpha.id}/scores`)
      .set('Cookie', [judgeCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        scores: [{ criterionId: critR1Id, score: 90, feedback: 'Superb architecture' }],
      });
    assert.equal(scAlpha.status, 200);

    // Judge scores Team Beta: 80
    const scBeta = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/submissions/${subBeta.id}/scores`)
      .set('Cookie', [judgeCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        scores: [{ criterionId: critR1Id, score: 80, feedback: 'Solid implementation' }],
      });
    assert.equal(scBeta.status, 200);

    // Judge scores Team Gamma: 70
    const scGamma = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/submissions/${subGamma.id}/scores`)
      .set('Cookie', [judgeCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        scores: [{ criterionId: critR1Id, score: 70, feedback: 'Decent work' }],
      });
    assert.equal(scGamma.status, 200);
  });

  it('7. Top-N advancement engine: Top 2 advance, 3rd eliminated', async () => {
    const advRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advance`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        rule: 'top_n',
        topN: 2,
      });

    assert.equal(advRes.status, 200);
    assert.equal(advRes.body.data.qualifiedCount, 2);
    assert.equal(advRes.body.data.eliminatedCount, 1);
    assert.equal(advRes.body.data.nextRound.status, 'open');

    // Verify qualification records
    const listAdv = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advancements`)
      .set('Cookie', [ownerCookie]);
    assert.equal(listAdv.status, 200);
    const advs = listAdv.body.data.advancements;

    const advAlpha = advs.find((a) => a.teamId === team1Id);
    const advBeta = advs.find((a) => a.teamId === team2Id);
    const advGamma = advs.find((a) => a.teamId === team3Id);

    assert.equal(advAlpha.status, 'qualified');
    assert.equal(advAlpha.qualificationRank, 1);
    assert.equal(advBeta.status, 'qualified');
    assert.equal(advBeta.qualificationRank, 2);
    assert.equal(advGamma.status, 'eliminated');
    assert.equal(advGamma.qualificationRank, 3);
  });

  it('8. Qualified teams can submit to Round 2; eliminated team is blocked with 403', async () => {
    // Team Alpha (qualified) submits to Round 2 -> SUCCEEDS
    const subAlphaR2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round2Id}/submissions`)
      .set('Cookie', [part1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Alpha Project Finals',
        description: 'Team Alpha Round 2 Championship Build',
        repositoryUrl: 'https://github.com/managex/alpha-finals',
        demoUrl: 'https://demo.managex.local/alpha-finals',
      });
    assert.equal(subAlphaR2.status, 201);
    assert.equal(subAlphaR2.body.data.submission.roundId, round2Id);

    // Team Beta (qualified) submits to Round 2 -> SUCCEEDS
    const subBetaR2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round2Id}/submissions`)
      .set('Cookie', [part2Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Beta Project Finals',
        description: 'Team Beta Round 2 Championship Build',
        repositoryUrl: 'https://github.com/managex/beta-finals',
      });
    assert.equal(subBetaR2.status, 201);

    // Team Gamma (eliminated) attempts to submit to Round 2 -> BLOCKED with 403 ROUND_NOT_ELIGIBLE
    const subGammaR2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round2Id}/submissions`)
      .set('Cookie', [part3Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Gamma Project Finals Attempt',
        repositoryUrl: 'https://github.com/managex/gamma-finals',
      });
    assert.equal(subGammaR2.status, 403);
    assert.equal(subGammaR2.body.error.code, 'ROUND_NOT_ELIGIBLE');
  });

  it('9. Independent submissions per round: Team Alpha has distinct submissions in Round 1 and Round 2', async () => {
    // Fetch Round 1 submission
    const r1Sub = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/my-submission`)
      .set('Cookie', [part1Cookie]);
    assert.equal(r1Sub.status, 200);
    assert.equal(r1Sub.body.data.submission.title, 'Alpha Project R1');
    assert.equal(r1Sub.body.data.submission.roundId, round1Id);

    // Fetch Round 2 submission
    const r2Sub = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round2Id}/my-submission`)
      .set('Cookie', [part1Cookie]);
    assert.equal(r2Sub.status, 200);
    assert.equal(r2Sub.body.data.submission.title, 'Alpha Project Finals');
    assert.equal(r2Sub.body.data.submission.roundId, round2Id);

    // Submissions IDs are different
    assert.notEqual(r1Sub.body.data.submission.id, r2Sub.body.data.submission.id);
  });

  it('10. Top-N advancement tie-handling at cutoff: All ties qualify', async () => {
    // Create an event for tie-testing
    const evt = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Tie Break Hackathon',
        eventType: 'hackathon',
        visibility: 'public',
        startAt: '2026-11-10T09:00:00Z',
        endAt: '2026-11-12T18:00:00Z',
        timezone: 'UTC',
      });
    const tieEventId = evt.body.data.event.id;

    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ status: 'published' });

    const createR1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Tie Round 1',
        roundNumber: 1,
        status: 'open',
        advancementRule: 'top_n',
        advancementTopN: 2,
      });
    const r1 = createR1.body.data.round.id;

    // Register 3 participants while published
    for (const c of [part1Cookie, part2Cookie, part3Cookie]) {
      await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/register`)
        .set('Cookie', [c, csrfCookie])
        .set('x-csrf-token', csrfToken);
    }

    const t1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/teams`)
      .set('Cookie', [part1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Tie Team 1' });
    const t2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/teams`)
      .set('Cookie', [part2Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Tie Team 2' });
    const t3 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/teams`)
      .set('Cookie', [part3Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Tie Team 3' });

    // Transition tie event to in_progress
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ status: 'in_progress' });

    const s1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/rounds/${r1}/submissions`)
      .set('Cookie', [part1Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ title: 'T1' });
    const s2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/rounds/${r1}/submissions`)
      .set('Cookie', [part2Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ title: 'T2' });
    const s3 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/rounds/${r1}/submissions`)
      .set('Cookie', [part3Cookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ title: 'T3' });

    const crit = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/criteria`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Criteria Tie', maxScore: 100, roundId: r1 });

    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/judges`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ judgeUserId });

    // Scores: T1 = 90, T2 = 80, T3 = 80 (Tied for rank 2!)
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/submissions/${s1.body.data.submission.id}/scores`)
      .set('Cookie', [judgeCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ scores: [{ criterionId: crit.body.data.criterion.id, score: 90 }] });

    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/submissions/${s2.body.data.submission.id}/scores`)
      .set('Cookie', [judgeCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ scores: [{ criterionId: crit.body.data.criterion.id, score: 80 }] });

    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/submissions/${s3.body.data.submission.id}/scores`)
      .set('Cookie', [judgeCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ scores: [{ criterionId: crit.body.data.criterion.id, score: 80 }] });

    // Advance with topN = 2: Both T2 and T3 are tied at the cutoff score (80), so ALL 3 must qualify!
    const tieAdv = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${tieEventId}/rounds/${r1}/advance`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ rule: 'top_n', topN: 2 });

    assert.equal(tieAdv.status, 200);
    assert.equal(tieAdv.body.data.qualifiedCount, 3); // All 3 qualified!
    assert.equal(tieAdv.body.data.eliminatedCount, 0);
  });

  it('11. Score threshold advancement rule correctly advances only those above threshold', async () => {
    // Setup another round to test score_threshold
    const thrRound = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Threshold Round',
        advancementRule: 'score_threshold',
        advancementThreshold: 85,
        status: 'open',
      });
    const thrRoundId = thrRound.body.data.round.id;

    // Advance Round 1 using score_threshold = 85
    // Alpha had 90 (qualifies), Beta had 80 (eliminated), Gamma had 70 (eliminated)
    const adv = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advance`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        rule: 'score_threshold',
        threshold: 85,
      });

    assert.equal(adv.status, 200);
    assert.equal(adv.body.data.qualifiedCount, 1);
    assert.equal(adv.body.data.eliminatedCount, 2);
  });

  it('12. Unpublished round scores privacy: Participants receive 403 RESULTS_NOT_PUBLISHED', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/results`)
      .set('Cookie', [part1Cookie]);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'RESULTS_NOT_PUBLISHED');
  });

  it('13. Round results publication: Organiser publishes and results become visible to participants and public', async () => {
    // Organiser publishes Round 1 results
    const pub = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/publish-results`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);
    assert.equal(pub.status, 200);
    assert.ok(pub.body.data.resultsPublishedAt);

    // Participant can now view results
    const partRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/results`)
      .set('Cookie', [part1Cookie]);
    assert.equal(partRes.status, 200);
    assert.equal(partRes.body.data.isPublished, true);
    assert.equal(partRes.body.data.results.length, 3);
    assert.equal(partRes.body.data.results[0].rank, 1);

    // Public endpoint also returns 200 with results
    const pubEndpoint = await request(app)
      .get(`/api/v1/events/${eventId}/rounds/${round1Id}/results`);
    assert.equal(pubEndpoint.status, 200);
    assert.equal(pubEndpoint.body.data.isPublished, true);
  });

  it('14. SEC-002: Cross-tenant isolation blocks Org B user from accessing or modifying Org A rounds', async () => {
    // Org B user attempts to advance Org A's round
    const crossAdv = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/advance`)
      .set('Cookie', [crossCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ rule: 'top_n', topN: 2 });
    assert.equal(crossAdv.status, 403);

    // Org B user attempts to publish Org A's round
    const crossPub = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/rounds/${round1Id}/publish-results`)
      .set('Cookie', [crossCookie, csrfCookie])
      .set('x-csrf-token', csrfToken);
    assert.equal(crossPub.status, 403);
  });

  it('15. AUD-001: Round submissions, advancements, and publications generate audit log entries', async () => {
    const actions = await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      const auditRes = await client.query(
        `SELECT action FROM audit_logs WHERE organisation_id = $1 ORDER BY created_at DESC`,
        [orgAId]
      );
      return auditRes.rows.map((r) => r.action);
    });
    assert.ok(actions.includes('event.round_submission.created'), 'Expected event.round_submission.created');
    assert.ok(actions.includes('event.round.advanced'), 'Expected event.round.advanced');
    assert.ok(actions.includes('event.round.results_published'), 'Expected event.round.results_published');
  });
});
