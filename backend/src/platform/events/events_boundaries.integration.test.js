/**
 * ManageX Events Post-Fix Regression Suite: RBAC, Public & Participant Boundaries
 * Strictly verifies the 6 invariants from prompt:
 * 1. Anonymous visitors can access permitted public event discovery and public event details.
 * 2. Authenticated eligible participants can access their own permitted registration and dashboard operations without organisation membership.
 * 3. Participant/team/submission endpoints enforce their specific authorization rules.
 * 4. Users without organisation membership cannot access organiser-only event management endpoints.
 * 5. Organisation members lacking required permissions cannot perform protected actions.
 * 6. Cross-organisation resource access is denied.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('ManageX Events — RBAC, Public & Participant Boundary Regression Suite', () => {
  let csrfCookie;
  let csrfToken;

  // Users
  let participantUserId;
  let participantCookie;
  let orgOwnerUserId;
  let orgOwnerCookie;
  let regularMemberUserId;
  let regularMemberCookie;
  let orgBUserId;
  let orgBCookie;

  // Organisations
  let orgAId;
  let orgASlug;
  let orgBId;

  // Events
  let runTag;
  let publicPublishedEventId;
  let draftEventId;
  let privatePublishedEventId;

  before(async () => {
    runTag = Date.now();
    const passwordHash = await hashPassword('SecurePassword123!');

    // 1. Fetch CSRF token for mutations
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    assert.equal(csrfRes.status, 200);
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const c = cookies.find((item) => item.startsWith('managex_csrf='));
      if (c) {
        csrfCookie = c.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }

    await withSystemTransaction(async (client) => {
      // 2. Create users
      const u1 = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES ('Participant Sam', $1, $2, 'active', NOW())
        RETURNING id
      `, [`sam_part_${runTag}@managex.local`, passwordHash]);
      participantUserId = u1.rows[0].id;

      const u2 = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES ('Org A Owner', $1, $2, 'active', NOW())
        RETURNING id
      `, [`owner_a_${runTag}@managex.local`, passwordHash]);
      orgOwnerUserId = u2.rows[0].id;

      const u3 = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES ('Org A Member No Perms', $1, $2, 'active', NOW())
        RETURNING id
      `, [`member_a_${runTag}@managex.local`, passwordHash]);
      regularMemberUserId = u3.rows[0].id;

      const u4 = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES ('Org B Member', $1, $2, 'active', NOW())
        RETURNING id
      `, [`user_b_${runTag}@managex.local`, passwordHash]);
      orgBUserId = u4.rows[0].id;

      // 3. Create Org A & Org B
      const orgARes = await client.query(`
        INSERT INTO organisations (name, slug, status)
        VALUES ('Organisation Alpha', 'org-alpha-${runTag}', 'active')
        RETURNING id, slug
      `);
      orgAId = orgARes.rows[0].id;
      orgASlug = orgARes.rows[0].slug;

      const orgBRes = await client.query(`
        INSERT INTO organisations (name, slug, status)
        VALUES ('Organisation Beta', 'org-beta-${runTag}', 'active')
        RETURNING id
      `);
      orgBId = orgBRes.rows[0].id;

      // 4. Enable Events module in Org A and Org B
      await client.query(`
        INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled)
        SELECT $1::uuid, id, true FROM modules WHERE slug = 'events'
        UNION ALL
        SELECT $2::uuid, id, true FROM modules WHERE slug = 'events'
      `, [orgAId, orgBId]);

      // 5. Setup Memberships:
      // - Participant Sam: ZERO organisation memberships
      // - Org A Owner: Owner in Org A
      // - Org A Member: Member in Org A without event management permissions
      // - Org B Member: Member in Org B
      const ownerRoleRes = await client.query(`SELECT id FROM roles WHERE slug = 'organisation_owner'`);
      const memberRoleRes = await client.query(`SELECT id FROM roles WHERE slug = 'organisation_member'`);

      const memOwnerRes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `, [orgAId, orgOwnerUserId]);
      await client.query(`
        INSERT INTO membership_roles (membership_id, role_id, organisation_id)
        VALUES ($1, $2, $3)
      `, [memOwnerRes.rows[0].id, ownerRoleRes.rows[0].id, orgAId]);

      const memMemberRes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `, [orgAId, regularMemberUserId]);
      await client.query(`
        INSERT INTO membership_roles (membership_id, role_id, organisation_id)
        VALUES ($1, $2, $3)
      `, [memMemberRes.rows[0].id, memberRoleRes.rows[0].id, orgAId]);

      const memBRes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `, [orgBId, orgBUserId]);
      await client.query(`
        INSERT INTO membership_roles (membership_id, role_id, organisation_id)
        VALUES ($1, $2, $3)
      `, [memBRes.rows[0].id, memberRoleRes.rows[0].id, orgBId]);

      // 6. Create Events in Org A:
      // - Public Published Hackathon
      // - Draft Event
      // - Private Published Event
      const pubRes = await client.query(`
        INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, location_type, created_by_id, capacity
        )
        VALUES (
          $1, $3, 'public-ai-' || $4, 'hackathon', 'published', 'public',
          NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC', 'virtual', $2, 100
        )
        RETURNING id
      `, [orgAId, orgOwnerUserId, `Public AI Challenge ${runTag}`, String(runTag)]);
      publicPublishedEventId = pubRes.rows[0].id;

      const draftRes = await client.query(`
        INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, location_type, created_by_id
        )
        VALUES (
          $1, 'Draft Event Secret', 'draft-event-${runTag}', 'general_event', 'draft', 'public',
          NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC', 'virtual', $2
        )
        RETURNING id
      `, [orgAId, orgOwnerUserId]);
      draftEventId = draftRes.rows[0].id;

      const privRes = await client.query(`
        INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, location_type, created_by_id
        )
        VALUES (
          $1, 'Internal Org Summit', 'internal-summit-${runTag}', 'general_event', 'published', 'private',
          NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC', 'virtual', $2
        )
        RETURNING id
      `, [orgAId, orgOwnerUserId]);
      privatePublishedEventId = privRes.rows[0].id;
    });

    // 7. Create user sessions
    const partSession = await createSession({ userId: participantUserId, ipAddress: '127.0.0.1', userAgent: 'test-agent' });
    participantCookie = `${SESSION_COOKIE_NAME}=${partSession.rawToken}`;

    const ownerSession = await createSession({ userId: orgOwnerUserId, ipAddress: '127.0.0.1', userAgent: 'test-agent' });
    orgOwnerCookie = `${SESSION_COOKIE_NAME}=${ownerSession.rawToken}`;

    const memberSession = await createSession({ userId: regularMemberUserId, ipAddress: '127.0.0.1', userAgent: 'test-agent' });
    regularMemberCookie = `${SESSION_COOKIE_NAME}=${memberSession.rawToken}`;

    const orgBSession = await createSession({ userId: orgBUserId, ipAddress: '127.0.0.1', userAgent: 'test-agent' });
    orgBCookie = `${SESSION_COOKIE_NAME}=${orgBSession.rawToken}`;
  });

  // ---------------------------------------------------------------------------
  // 1. Anonymous Public Access
  // ---------------------------------------------------------------------------
  describe('1. Anonymous Visitor Discovery & Public Detail Access', () => {
    it('allows anonymous discovery of published public events', async () => {
      const res = await request(app).get(`/api/v1/events?search=${runTag}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data.events));
      const found = res.body.data.events.some((e) => e.id === publicPublishedEventId);
      assert.equal(found, true, 'Published public event should be discoverable anonymously');

      // Draft and private events must not be visible in public discovery
      const draftFound = res.body.data.events.some((e) => e.id === draftEventId);
      assert.equal(draftFound, false, 'Draft event must never appear in public discovery');

      const privFound = res.body.data.events.some((e) => e.id === privatePublishedEventId);
      assert.equal(privFound, false, 'Private event must never appear in public discovery');
    });

    it('allows anonymous visitor to fetch public details of a published public event', async () => {
      const res = await request(app).get(`/api/v1/events/${publicPublishedEventId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.event.id, publicPublishedEventId);
      assert.equal(res.body.data.event.title, `Public AI Challenge ${runTag}`);
    });

    it('denies anonymous access to draft or private event details via public endpoint with 404', async () => {
      const draftRes = await request(app).get(`/api/v1/events/${draftEventId}`);
      assert.equal(draftRes.status, 404);

      const privRes = await request(app).get(`/api/v1/events/${privatePublishedEventId}`);
      assert.equal(privRes.status, 404);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Authenticated Participant Operations (Without Organisation Membership)
  // ---------------------------------------------------------------------------
  describe('2. Authenticated Participant Operations (0 Org Memberships)', () => {
    it('allows participant to register for a published event without organisation membership', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/register`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ customAnswers: {} });

      assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.registration.status, 'registered');
      assert.equal(res.body.data.registration.userId, participantUserId);
    });

    it('allows participant to query their own registration status', async () => {
      const res = await request(app)
        .get(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/my-registration`)
        .set('Cookie', [participantCookie]);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.registration.status, 'registered');
    });

    it('allows participant to access participant dashboard showing their active registration', async () => {
      const res = await request(app)
        .get('/api/v1/events/participant/dashboard')
        .set('Cookie', [participantCookie]);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data.registrations));
      const registered = res.body.data.registrations.some((r) => r.event?.id === publicPublishedEventId);
      assert.equal(registered, true);
    });

    it('allows participant to withdraw their registration', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/withdraw`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.registration.status, 'withdrawn');
    });

    it('re-registering after withdrawal restores active registration', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/register`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ customAnswers: {} });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.registration.status, 'registered');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Team & Submission Authorization Boundaries
  // ---------------------------------------------------------------------------
  describe('3. Participant Team & Submission Authorization Enforcement', () => {
    let createdTeamId;

    it('allows registered participant to create a hackathon team and query their team', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/teams`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Alpha Coders', description: 'AI research team' });

      assert.equal(res.status, 201, `Failed creating team: ${JSON.stringify(res.body)}`);
      createdTeamId = res.body.data.team.id;

      const myTeamRes = await request(app)
        .get(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/my-team`)
        .set('Cookie', [participantCookie]);

      assert.equal(myTeamRes.status, 200);
      assert.equal(myTeamRes.body.data.team.id, createdTeamId);
    });

    it('rejects team creation from unregistered user with 403 REGISTRATION_REQUIRED', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/teams`)
        .set('Cookie', [orgBCookie, csrfCookie]) // User B is not registered for publicPublishedEventId
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Rogue Team' });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'REGISTRATION_REQUIRED');
    });

    it('allows team member to submit project with valid URLs', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/submissions`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Autonomous Agent Platform',
          description: 'A cutting edge AI platform',
          repositoryUrl: 'https://github.com/managex/ai-agent',
          demoUrl: 'https://demo.managex.local',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.submission.title, 'Autonomous Agent Platform');
    });

    it('rejects submission with invalid or dangerous non-http URL with 422', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/submissions`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Exploit Submission',
          repositoryUrl: 'javascript:alert(1)',
        });

      assert.equal(res.status, 422);
    });

    it('rejects submission from user not on a team with 403', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/submissions`)
        .set('Cookie', [orgBCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Unauthorized Submission',
          repositoryUrl: 'https://github.com/managex/rogue',
        });

      assert.equal(res.status, 403);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Non-Members Blocked from Organiser-Only Endpoints
  // ---------------------------------------------------------------------------
  describe('4. Organiser Endpoint Lockout for Non-Members', () => {
    it('blocks participant (0 org memberships) from listing internal organisation events with 403 MEMBERSHIP_REQUIRED', async () => {
      const res = await request(app)
        .get(`/api/v1/organisations/${orgAId}/events`)
        .set('Cookie', [participantCookie]);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
    });

    it('blocks participant from creating an event with 403 MEMBERSHIP_REQUIRED', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Illegitimate Event',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 172800000).toISOString(),
          timezone: 'UTC',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
    });

    it('blocks participant from updating an event with 403 MEMBERSHIP_REQUIRED', async () => {
      const res = await request(app)
        .patch(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ title: 'Tampered Title' });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
    });

    it('blocks participant from transitioning event status with 403 MEMBERSHIP_REQUIRED', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/status`)
        .set('Cookie', [participantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'cancelled' });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
    });

    it('blocks participant from accessing staff participant roster with 403 MEMBERSHIP_REQUIRED', async () => {
      const res = await request(app)
        .get(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/participants`)
        .set('Cookie', [participantCookie]);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Organisation Members Lacking Permissions
  // ---------------------------------------------------------------------------
  describe('5. Organisation Members Lacking Scoped Permissions', () => {
    it('blocks regular member lacking event.create from creating events with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events`)
        .set('Cookie', [regularMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Member Created Event',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 172800000).toISOString(),
          timezone: 'UTC',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('blocks regular member lacking event.status.manage from cancelling events with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/status`)
        .set('Cookie', [regularMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'cancelled' });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('allows organisation owner with event management permissions to perform organiser operations', async () => {
      const res = await request(app)
        .get(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/participants`)
        .set('Cookie', [orgOwnerCookie]);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data.participants));
      assert.ok(res.body.data.summary.activeCount >= 1);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Cross-Organisation Resource Access Denied
  // ---------------------------------------------------------------------------
  describe('6. Cross-Organisation Resource Tampering Denied', () => {
    it('blocks User in Org B from reading Org A events via internal router with 403 MEMBERSHIP_REQUIRED', async () => {
      const res = await request(app)
        .get(`/api/v1/organisations/${orgAId}/events`)
        .set('Cookie', [orgBCookie]);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
    });

    it('blocks User in Org B from mutating Org A events with 403 MEMBERSHIP_REQUIRED', async () => {
      const res = await request(app)
        .patch(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}`)
        .set('Cookie', [orgBCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ title: 'Cross-Tenant Defacement' });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
    });

    it('blocks User in Org B from accessing Org A participant roster with 403 MEMBERSHIP_REQUIRED', async () => {
      const res = await request(app)
        .get(`/api/v1/organisations/${orgAId}/events/${publicPublishedEventId}/participants`)
        .set('Cookie', [orgBCookie]);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
    });
  });
});
