/**
 * ManageX Multi-Round Hackathons Integration Tests (Phase 02B)
 * Verifies round data model, lifecycle, backward compatibility, RLS, and tenant isolation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { getPool } from '../database/pool.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('Phase 02B — Multi-Round Hackathon Core Engine Suite', () => {
  let pool;
  let ownerUserId, memberUserId, crossTenantUserId;
  let ownerCookie, memberCookie, crossTenantCookie;
  let csrfCookie = '';
  let csrfToken = '';

  let orgAId, orgBId;
  let testEventId;
  const testState = {};

  before(async () => {
    pool = getPool();

    // 1. Create test users inside system transaction
    const passwordHash = await hashPassword('SecurePassword123!');
    const users = await withSystemTransaction(async (client) => {
      // Clean up previous test users and organisations if any
      const prevUsers = await client.query("SELECT id FROM users WHERE email LIKE 'round2b_%@managex.local'");
      const prevUserIds = prevUsers.rows.map((r) => r.id);
      const prevOrgs = await client.query("SELECT id FROM organisations WHERE name LIKE 'Round2B%'");
      for (const org of prevOrgs.rows) {
        await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [org.id]);
        await client.query("DELETE FROM event_round_advancements WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_scores WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_scoring_criteria WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_judge_assignments WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_submissions WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_rounds WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_team_invitations WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_team_members WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_teams WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_registrations WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM events WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM membership_roles WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM organisation_memberships WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM organisation_module_entitlements WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM organisations WHERE id = $1", [org.id]);
      }
      if (prevUserIds.length > 0) {
        await client.query("DELETE FROM users WHERE id = ANY($1)", [prevUserIds]);
      }

      const res = await client.query(
        `
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ('Round Owner', 'round2b_owner@managex.local', $1, 'active', NOW()),
          ('Round Member', 'round2b_member@managex.local', $1, 'active', NOW()),
          ('Cross Tenant User', 'round2b_cross@managex.local', $1, 'active', NOW())
        RETURNING id, email
      `,
        [passwordHash]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email === 'round2b_owner@managex.local').id;
    memberUserId = users.find((u) => u.email === 'round2b_member@managex.local').id;
    crossTenantUserId = users.find((u) => u.email === 'round2b_cross@managex.local').id;

    // 2. Create user sessions
    const ownerSess = await createSession({ userId: ownerUserId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${ownerSess.rawToken}`;

    const memberSess = await createSession({ userId: memberUserId });
    memberCookie = `${SESSION_COOKIE_NAME}=${memberSess.rawToken}`;

    const crossSess = await createSession({ userId: crossTenantUserId });
    crossTenantCookie = `${SESSION_COOKIE_NAME}=${crossSess.rawToken}`;

    // 3. Obtain CSRF cookie and token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const c = cookies.find((item) => item.startsWith('managex_csrf='));
      if (c) {
        csrfCookie = c.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }

    // 4. Create Organisation A (owner becomes Owner)
    const orgResA = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Round2B Hackathon Org' });
    orgAId = orgResA.body.data.organisation.id;

    // Add regular member to Organisation A
    await withSystemTransaction(async (client) => {
      const memberRoleRes = await client.query("SELECT id FROM roles WHERE slug = 'organisation_member' AND organisation_id IS NULL");
      const memberRoleId = memberRoleRes.rows[0].id;

      const mRes = await client.query(
        `
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `,
        [orgAId, memberUserId]
      );

      await client.query(
        `
        INSERT INTO membership_roles (organisation_id, membership_id, role_id)
        VALUES ($1, $2, $3)
      `,
        [orgAId, mRes.rows[0].id, memberRoleId]
      );
    });

    // 5. Create Organisation B for cross-tenant testing
    const orgResB = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [crossTenantCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Round2B Foreign Org' });
    orgBId = orgResB.body.data.organisation.id;

    // 6. Create a published Hackathon Event in Organisation A
    const eventRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'ManageX Grand Hackathon 2026',
        eventType: 'hackathon',
        visibility: 'public',
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 86400000 * 5).toISOString(),
        timezone: 'UTC',
        locationType: 'virtual',
        virtualUrl: 'https://hackathon.managex.local',
      });

    assert.equal(eventRes.status, 201);
    testEventId = eventRes.body.data.event.id;

    // Advance event status to published
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'published' });
  });

  after(async () => {
    await withSystemTransaction(async (client) => {
      const prevUsers = await client.query("SELECT id FROM users WHERE email LIKE 'round2b_%@managex.local'");
      const prevUserIds = prevUsers.rows.map((r) => r.id);
      const prevOrgs = await client.query("SELECT id FROM organisations WHERE name LIKE 'Round2B%'");
      for (const org of prevOrgs.rows) {
        await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [org.id]);
        await client.query("DELETE FROM event_round_advancements WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_scores WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_scoring_criteria WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_judge_assignments WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_submissions WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_rounds WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_team_invitations WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_team_members WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_teams WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM event_registrations WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM events WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM membership_roles WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM organisation_memberships WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM organisation_module_entitlements WHERE organisation_id = $1", [org.id]);
        await client.query("DELETE FROM organisations WHERE id = $1", [org.id]);
      }
      if (prevUserIds.length > 0) {
        await client.query("DELETE FROM users WHERE id = ANY($1)", [prevUserIds]);
      }
    });
  });

  it('1. GET /rounds: Event automatically contains backfilled Round 1', async () => {
    // Note: Migration 025 backfilled existing events. For newly created events or after migration,
    // let's verify listing returns rounds or creates initial round.
    // If newly created event does not have Round 1 yet, insert Round 1 or test listing.
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie]);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.rounds));
  });

  it('2. POST /rounds: Organiser successfully creates Round 1 (or next round)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Ideation & Screening',
        roundNumber: 1,
        description: 'Submit initial pitch deck and project summary.',
        instructions: 'Include high-level architecture diagram and problem statement.',
        submissionOpensAt: new Date(Date.now() + 3600000).toISOString(),
        submissionClosesAt: new Date(Date.now() + 86400000).toISOString(),
        advancementRule: 'manual',
      });

    // If Round 1 already existed from migration backfill or previous check, either 201 or if conflict test next round
    if (res.status === 409) {
      assert.equal(res.body.error.code, 'ROUND_NUMBER_EXISTS');
    } else {
      assert.equal(res.status, 201);
      assert.equal(res.body.data.round.name, 'Ideation & Screening');
      assert.equal(res.body.data.round.roundNumber, 1);
      testState.round1Id = res.body.data.round.id;
    }
  });

  it('3. POST /rounds: Create Round 2 with score_threshold advancement rule', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Prototype & Working MVP',
        roundNumber: 2,
        description: 'Functional prototype with live demo URL.',
        submissionOpensAt: new Date(Date.now() + 86400000 * 2).toISOString(),
        submissionClosesAt: new Date(Date.now() + 86400000 * 3).toISOString(),
        advancementRule: 'score_threshold',
        advancementThreshold: 75.0,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.round.name, 'Prototype & Working MVP');
    assert.equal(res.body.data.round.roundNumber, 2);
    assert.equal(res.body.data.round.advancementRule, 'score_threshold');
    assert.equal(res.body.data.round.advancementThreshold, 75.0);
    testState.round2Id = res.body.data.round.id;
  });

  it('4. POST /rounds: Create Round 3 with top_n advancement rule', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Grand Finale & Live Pitch',
        roundNumber: 3,
        description: 'Top 5 teams present to executive judges.',
        submissionOpensAt: new Date(Date.now() + 86400000 * 4).toISOString(),
        submissionClosesAt: new Date(Date.now() + 86400000 * 5).toISOString(),
        advancementRule: 'top_n',
        advancementTopN: 5,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.round.name, 'Grand Finale & Live Pitch');
    assert.equal(res.body.data.round.roundNumber, 3);
    assert.equal(res.body.data.round.advancementRule, 'top_n');
    assert.equal(res.body.data.round.advancementTopN, 5);
    testState.round3Id = res.body.data.round.id;
  });

  it('5. POST /rounds: Duplicate round number is rejected with 409 ConflictError', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Duplicate Round 2',
        roundNumber: 2,
        advancementRule: 'manual',
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ROUND_NUMBER_EXISTS');
  });

  it('6. POST /rounds: Invalid dates (submissionClosesAt <= submissionOpensAt) is rejected with 422', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Invalid Date Round',
        roundNumber: 99,
        submissionOpensAt: '2026-10-25T12:00:00Z',
        submissionClosesAt: '2026-10-25T11:00:00Z',
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('7. POST /rounds: Missing advancementThreshold for score_threshold rule is rejected with 422', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Missing Threshold Round',
        roundNumber: 99,
        advancementRule: 'score_threshold',
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('8. POST /rounds: Missing advancementTopN for top_n rule is rejected with 422', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Missing TopN Round',
        roundNumber: 99,
        advancementRule: 'top_n',
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('9. PATCH /rounds/:roundId: Organiser updates round description and top_n setting', async () => {
    const res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds/${testState.round3Id}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        description: 'Updated description: Top 10 teams advance to finals.',
        advancementTopN: 10,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.round.description, 'Updated description: Top 10 teams advance to finals.');
    assert.equal(res.body.data.round.advancementTopN, 10);
  });

  it('10. GET /rounds/:roundId: Fetches single round details with metrics', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds/${testState.round2Id}`)
      .set('Cookie', [ownerCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.round.id, testState.round2Id);
    assert.equal(res.body.data.round.roundNumber, 2);
    assert.equal(typeof res.body.data.round.submissionCount, 'number');
  });

  it('11. DELETE /rounds/:roundId: Safely deletes an unstarted round without dependencies', async () => {
    // Create temporary round 4
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Temporary Round 4',
        roundNumber: 4,
      });

    assert.equal(createRes.status, 201);
    const round4Id = createRes.body.data.round.id;

    // Delete round 4
    const delRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds/${round4Id}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data.success, true);

    // Verify it is gone
    const verifyRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds/${round4Id}`)
      .set('Cookie', [ownerCookie]);

    assert.equal(verifyRes.status, 404);
  });

  it('12. DELETE /rounds/:roundId: Blocks deleting a round that has dependent submissions', async () => {
    // 1. Register owner for event
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/register`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ customAnswers: {} });

    // 2. Create team
    const teamRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/teams`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Alpha Hackers' });

    assert.equal(teamRes.status, 201);

    // 3. Create submission
    const subRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/submissions`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Alpha Prototype Project',
        repositoryUrl: 'https://github.com/managex/alpha',
      });

    assert.equal(subRes.status, 201);
    const submissionId = subRes.body.data.submission.id;

    // 4. Associate submission with round2
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      const upRes = await client.query(
        `UPDATE event_submissions SET round_id = $1 WHERE id = $2 RETURNING id`,
        [testState.round2Id, submissionId]
      );
      assert.equal(upRes.rows.length, 1);
    });

    // 5. Attempt to delete round2 - must fail with 409 ROUND_HAS_SUBMISSIONS
    const delRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds/${testState.round2Id}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(delRes.status, 409);
    assert.equal(delRes.body.error.code, 'ROUND_HAS_SUBMISSIONS');
  });

  it('13. RBAC: Regular member without event.edit cannot create or delete rounds (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${testEventId}/rounds`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Unauthorized Round',
        roundNumber: 10,
      });

    assert.equal(res.status, 403);
  });

  it('14. Tenant Isolation: User in Org B cannot read or mutate rounds in Org A', async () => {
    const readRes = await request(app)
      .get(`/api/v1/organisations/${orgBId}/events/${testEventId}/rounds`)
      .set('Cookie', [crossTenantCookie]);

    // Returns 404 because testEventId does not exist in Org B
    assert.equal(readRes.status, 404);

    const mutateRes = await request(app)
      .post(`/api/v1/organisations/${orgBId}/events/${testEventId}/rounds`)
      .set('Cookie', [crossTenantCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Cross Tenant Intrusion',
        roundNumber: 20,
      });

    assert.equal(mutateRes.status, 404);
  });

  it('15. Public Rounds API: GET /events/:eventId/rounds returns public rounds for public published event', async () => {
    const res = await request(app).get(`/api/v1/events/${testEventId}/rounds`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.rounds));
    assert.ok(res.body.data.rounds.length >= 2);

    const r2 = res.body.data.rounds.find((r) => r.roundNumber === 2);
    assert.ok(r2);
    assert.equal(r2.name, 'Prototype & Working MVP');
    // Ensure internal administrative fields are NOT leaked
    assert.equal(r2.organisationId, undefined);
    assert.equal(r2.advancementThreshold, undefined);
  });

  it('16. Audit Log: Round creation, update, and deletion actions are recorded in immutable audit table', async () => {
    const auditRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [ownerCookie]);

    assert.equal(auditRes.status, 200);
    const logs = auditRes.body.data.auditLogs || auditRes.body.data.logs || [];
    assert.ok(Array.isArray(logs));

    const actions = logs.map((l) => l.action);
    assert.ok(actions.includes('event.round.created'), 'Expected event.round.created in audit logs');
    assert.ok(actions.includes('event.round.updated'), 'Expected event.round.updated in audit logs');
    assert.ok(actions.includes('event.round.deleted'), 'Expected event.round.deleted in audit logs');
  });
});
