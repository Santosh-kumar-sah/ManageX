/**
 * ManageX Event Portal & Student Dashboard Integration Tests
 * Validates GET /api/v1/events/participant/dashboard:
 * - Unauthenticated returns 401
 * - Logged in participant returns their registered events, team, submissions, round advancements
 * - Tenant & participant isolation: cannot view another user's unshared registrations/submissions
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('Event Portal & Student Dashboard Suite', () => {
  let studentAId;
  let studentACookie;
  let studentBId;
  let studentBCookie;
  let csrfCookie;
  let csrfToken;

  let orgId;
  let eventAId;

  before(async () => {
    const runTag = Date.now();
    const passwordHash = await hashPassword('SecurePassword123!');

    let round1Id;

    await withSystemTransaction(async (client) => {
      // Create student A & student B
      const uRes = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ('Student Alice', 'dash_alice_${runTag}@managex.local', $1, 'active', NOW()),
          ('Student Bob', 'dash_bob_${runTag}@managex.local', $1, 'active', NOW())
        RETURNING id, email
      `, [passwordHash]);

      studentAId = uRes.rows[0].id;
      studentBId = uRes.rows[1].id;

      // Create Org
      const orgRes = await client.query(`
        INSERT INTO organisations (name, slug, status)
        VALUES ('Portal Hackathon Host', 'portal-host-${runTag}', 'active')
        RETURNING id
      `);
      orgId = orgRes.rows[0].id;

      // Create published public hackathon event
      const evtRes = await client.query(`
        INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, location_type, created_by_id
        )
        VALUES (
          $1, 'Global AI Hackathon 2026', 'ai-hackathon-${runTag}', 'hackathon', 'published', 'public',
          NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC', 'virtual', $2
        )
        RETURNING id
      `, [orgId, studentAId]);
      eventAId = evtRes.rows[0].id;

      // Register Student A for the event
      await client.query(`
        INSERT INTO event_registrations (organisation_id, event_id, user_id, status, registered_at)
        VALUES ($1, $2, $3, 'registered', NOW())
      `, [orgId, eventAId, studentAId]);

      // Create Round 1 for event
      const roundRes = await client.query(`
        INSERT INTO event_rounds (
          organisation_id, event_id, round_number, name, description,
          submission_opens_at, submission_closes_at, advancement_rule, status
        )
        VALUES (
          $1, $2, 1, 'Ideation & Prototype', 'Submit prototype demo',
          NOW(), NOW() + INTERVAL '2 days', 'manual', 'open'
        )
        RETURNING id
      `, [orgId, eventAId]);
      round1Id = roundRes.rows[0].id;
    });

    // Create Team and Submissions for Student A using withTenantTransaction
    await withTenantTransaction({ organisationId: orgId, userId: studentAId }, async (tClient) => {
      const teamRes = await tClient.query(`
        INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
        VALUES ($1, $2, 'Alpha Coders', 'alpha-coders-${runTag}', $3)
        RETURNING id
      `, [orgId, eventAId, studentAId]);
      const teamId = teamRes.rows[0].id;

      await tClient.query(`
        INSERT INTO event_team_members (organisation_id, event_id, team_id, user_id, is_owner)
        VALUES ($1, $2, $3, $4, true)
      `, [orgId, eventAId, teamId, studentAId]);

      // Create submission for Student A
      await tClient.query(`
        INSERT INTO event_submissions (
          organisation_id, event_id, round_id, team_id, submitter_user_id,
          title, description, demo_url, status
        )
        VALUES (
          $1, $2, $3, $4, $5,
          'NextGen AI Assistant', 'NextGen AI Assistant description', 'https://demo.managex.local/alpha', 'submitted'
        )
      `, [orgId, eventAId, round1Id, teamId, studentAId]);

      // Create advancement record for Student A's team
      await tClient.query(`
        INSERT INTO event_round_advancements (
          organisation_id, event_id, round_id, team_id, status, is_manual, advanced_by_id
        )
        VALUES ($1, $2, $3, $4, 'qualified', true, $5)
      `, [orgId, eventAId, round1Id, teamId, studentAId]);
    });

    // Create session cookies
    const sA = await createSession({ userId: studentAId, userAgent: 'test-agent', ipAddress: '127.0.0.1' });
    studentACookie = `${SESSION_COOKIE_NAME}=${sA.rawToken}`;

    const sB = await createSession({ userId: studentBId, userAgent: 'test-agent', ipAddress: '127.0.0.1' });
    studentBCookie = `${SESSION_COOKIE_NAME}=${sB.rawToken}`;

    // Get CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    csrfToken = csrfRes.body?.data?.csrfToken;
    csrfCookie = csrfRes.headers['set-cookie']?.[0]?.split(';')[0];
  });

  it('1. GET /api/v1/events/participant/dashboard: unauthenticated request fails with 401', async () => {
    const res = await request(app)
      .get('/api/v1/events/participant/dashboard');

    assert.equal(res.status, 401);
  });

  it('2. GET /api/v1/events/participant/dashboard: registered student A receives complete dashboard data', async () => {
    const res = await request(app)
      .get('/api/v1/events/participant/dashboard')
      .set('Cookie', [studentACookie]);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.registrations);
    assert.equal(res.body.data.registrations.length, 1);

    const item = res.body.data.registrations[0];
    assert.equal(item.event.id, eventAId);
    assert.equal(item.event.title, 'Global AI Hackathon 2026');
    assert.equal(item.registration.status, 'registered');

    // Team info
    assert.ok(item.team);
    assert.equal(item.team.name, 'Alpha Coders');
    assert.equal(item.team.isOwner, true);
    assert.equal(item.team.members.length, 1);

    // Rounds info
    assert.ok(item.rounds.length >= 1);
    assert.equal(item.rounds[0].name, 'Ideation & Prototype');

    // Submissions info
    assert.equal(item.submissions.length, 1);
    assert.equal(item.submissions[0].title, 'NextGen AI Assistant');
    assert.equal(item.submissions[0].demoUrl, 'https://demo.managex.local/alpha');

    // Advancement info
    assert.equal(item.advancements.length, 1);
    assert.equal(item.advancements[0].status, 'qualified');
  });

  it('3. GET /api/v1/events/participant/dashboard: unregistered student B sees empty registrations list', async () => {
    const res = await request(app)
      .get('/api/v1/events/participant/dashboard')
      .set('Cookie', [studentBCookie]);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.registrations));
    assert.equal(res.body.data.registrations.length, 0);
  });

  it('4. Participant Isolation: Student B registered for different event cannot view Student A submissions or team', async () => {
    // Register Student B for event without team/submissions
    await withSystemTransaction(async (client) => {
      await client.query(`
        INSERT INTO event_registrations (organisation_id, event_id, user_id, status, registered_at)
        VALUES ($1, $2, $3, 'registered', NOW())
      `, [orgId, eventAId, studentBId]);
    });

    const res = await request(app)
      .get('/api/v1/events/participant/dashboard')
      .set('Cookie', [studentBCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.registrations.length, 1);
    const bItem = res.body.data.registrations[0];
    assert.equal(bItem.team, null); // Student B is not on Alpha Coders team
    assert.equal(bItem.submissions.length, 0); // Student B has no submissions
    assert.equal(bItem.advancements.length, 0); // Student B has no advancements
  });
});
