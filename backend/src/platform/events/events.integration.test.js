/**
 * ManageX Events & Hackathons Core Integration Tests (Phase 6A)
 * Strictly verifies PRD Section 7.1 (EVT-001, EVT-002, EVT-003), docs/security.md, and ADR-016.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { getPool } from '../database/pool.js';
import { withSystemTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('Phase 6A — Events Core, Lifecycle & Visibility Suite', () => {
  let pool;
  let ownerUserId, memberUserId, crossTenantUserId;
  let ownerCookie, memberCookie, crossTenantCookie;
  let csrfCookie = '';
  let csrfToken = '';

  let orgAId, orgBId;
  const testState = {};

  before(async () => {
    pool = getPool();

    // 1. Create test users inside system transaction
    const passwordHash = await hashPassword('SecurePassword123!');
    const users = await withSystemTransaction(async (client) => {
      // Clean up previous test users and organisations if any
      const prevUsers = await client.query("SELECT id FROM users WHERE email LIKE 'evt6a_%@managex.local'");
      const prevUserIds = prevUsers.rows.map(r => r.id);
      if (prevUserIds.length > 0) {
        await client.query("DELETE FROM event_registrations WHERE organisation_id IN (SELECT id FROM organisations WHERE name LIKE 'Phase6A%')");
        await client.query("DELETE FROM events WHERE organisation_id IN (SELECT id FROM organisations WHERE name LIKE 'Phase6A%')");
        await client.query("DELETE FROM membership_roles WHERE organisation_id IN (SELECT id FROM organisations WHERE name LIKE 'Phase6A%')");
        await client.query("DELETE FROM organisation_memberships WHERE organisation_id IN (SELECT id FROM organisations WHERE name LIKE 'Phase6A%') OR user_id = ANY($1)", [prevUserIds]);
        await client.query("DELETE FROM organisation_module_entitlements WHERE organisation_id IN (SELECT id FROM organisations WHERE name LIKE 'Phase6A%')");
        await client.query("DELETE FROM organisations WHERE name LIKE 'Phase6A%'");
        await client.query("DELETE FROM users WHERE id = ANY($1)", [prevUserIds]);
      }

      const res = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ('Event Owner', 'evt6a_owner@managex.local', $1, 'active', NOW()),
          ('Event Member', 'evt6a_member@managex.local', $1, 'active', NOW()),
          ('Cross Tenant User', 'evt6a_cross@managex.local', $1, 'active', NOW())
        RETURNING id, email
      `, [passwordHash]);
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email === 'evt6a_owner@managex.local').id;
    memberUserId = users.find((u) => u.email === 'evt6a_member@managex.local').id;
    crossTenantUserId = users.find((u) => u.email === 'evt6a_cross@managex.local').id;

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
      .send({ name: 'Phase6A Global Events Org' });
    orgAId = orgResA.body.data.organisation.id;

    // Add regular member to Organisation A
    await withSystemTransaction(async (client) => {
      const memberRoleRes = await client.query("SELECT id FROM roles WHERE slug = 'organisation_member' AND organisation_id IS NULL");
      const memberRoleId = memberRoleRes.rows[0].id;

      const mRes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `, [orgAId, memberUserId]);

      await client.query(`
        INSERT INTO membership_roles (organisation_id, membership_id, role_id)
        VALUES ($1, $2, $3)
      `, [orgAId, mRes.rows[0].id, memberRoleId]);
    });

    // 5. Create Organisation B for tenant isolation testing
    const orgResB = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [crossTenantCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Phase6A Isolated Org B' });
    orgBId = orgResB.body.data.organisation.id;
  });

  after(async () => {
    await withSystemTransaction(async (client) => {
      if (orgAId) {
        await client.query('DELETE FROM events WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM organisations WHERE id = $1', [orgAId]);
      }
      if (orgBId) {
        await client.query('DELETE FROM events WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM organisations WHERE id = $1', [orgBId]);
      }
      await client.query("DELETE FROM users WHERE email LIKE 'evt6a_%@managex.local'");
    });
  });

  // ---------------------------------------------------------------------------
  // EVT-001: Event Creation & Timezone / Date Validation
  // ---------------------------------------------------------------------------
  it('1. EVT-001: Create event with valid IANA timezone and date ordering succeeds (initial status: draft)', async () => {
    const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const regClose = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Nexus Hackathon 2026',
        eventType: 'hackathon',
        visibility: 'public',
        startAt,
        endAt,
        timezone: 'America/New_York',
        locationType: 'hybrid',
        location: 'NYC Tech Hub',
        virtualUrl: 'https://meet.managex.local/nexus-hackathon',
        registrationClosesAt: regClose,
        capacity: 100,
        description: 'Annual global hackathon for modular cloud engineering.',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.event.title, 'Nexus Hackathon 2026');
    assert.equal(res.body.data.event.status, 'draft');
    assert.equal(res.body.data.event.timezone, 'America/New_York');
    assert.equal(res.body.data.event.capacity, 100);
    assert.equal(res.body.data.event.slug, 'nexus-hackathon-2026');

    testState.createdEventId = res.body.data.event.id;
  });

  it('2. EVT-001: Create event with invalid IANA timezone is rejected with 422 ValidationError', async () => {
    const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Invalid Timezone Event',
        startAt,
        endAt,
        timezone: 'Fake/Martian_Time',
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes('Invalid IANA time-zone'));
  });

  it('3. EVT-001: Create event where endAt is before startAt is rejected with 422 ValidationError', async () => {
    const startAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // End before start

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Time Paradox Event',
        startAt,
        endAt,
        timezone: 'UTC',
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes('end time must be after the start time'));
  });

  it('4. EVT-001: Create event where registrationClosesAt is after startAt is rejected with 422', async () => {
    const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const regClose = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(); // After start

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Late Registration Event',
        startAt,
        endAt,
        timezone: 'UTC',
        registrationClosesAt: regClose,
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes('Registration closing time cannot be after the event start time'));
  });

  it('5. RBAC-004: Regular member lacking event.create permission cannot create events (403 FORBIDDEN)', async () => {
    const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Unauthorized Member Event',
        startAt,
        endAt,
        timezone: 'UTC',
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  // ---------------------------------------------------------------------------
  // EVT-002: Canonical 7-Status Lifecycle Transition Engine
  // ---------------------------------------------------------------------------
  it('6. EVT-002: Advance event from draft -> published -> registration_closed -> in_progress -> completed -> archived', async () => {
    const eventId = testState.createdEventId;

    // 1. draft -> published
    const pubRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'published' });

    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.data.event.status, 'published');

    // 2. published -> registration_closed
    const regCloseRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'registration_closed' });

    assert.equal(regCloseRes.status, 200);
    assert.equal(regCloseRes.body.data.event.status, 'registration_closed');

    // 3. registration_closed -> in_progress
    const inProgRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    assert.equal(inProgRes.status, 200);
    assert.equal(inProgRes.body.data.event.status, 'in_progress');

    // 4. in_progress -> completed
    const compRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });

    assert.equal(compRes.status, 200);
    assert.equal(compRes.body.data.event.status, 'completed');

    // 5. completed -> archived
    const archRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'archived' });

    assert.equal(archRes.status, 200);
    assert.equal(archRes.body.data.event.status, 'archived');
  });

  it('7. EVT-002: Invalid lifecycle transitions are rejected with 409 ConflictError (archived is terminal)', async () => {
    const eventId = testState.createdEventId;

    // Archived is terminal; attempting to re-publish must fail
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${eventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'published' });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes('Invalid lifecycle transition from "archived" to "published"'));
  });

  it('8. EVT-001: Completed or archived events cannot be edited (409 ConflictError)', async () => {
    const eventId = testState.createdEventId;

    const res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/events/${eventId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Mutating Archived Event' });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes('cannot be modified'));
  });

  // ---------------------------------------------------------------------------
  // EVT-003: Draft vs Published Visibility Rules
  // ---------------------------------------------------------------------------
  it('9. EVT-003: Draft events are hidden from members without event management permissions', async () => {
    // Create a new draft event
    const startAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Internal Secret Draft Event',
        startAt,
        endAt,
        timezone: 'UTC',
        visibility: 'private',
      });

    assert.equal(createRes.status, 201);
    const draftEventId = createRes.body.data.event.id;

    // 1. Owner can list drafts
    const ownerList = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(ownerList.status, 200);
    assert.ok(ownerList.body.data.events.some((e) => e.id === draftEventId));

    // 2. Member lacking management role cannot list drafts
    const memberList = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [memberCookie, csrfCookie]);
    assert.equal(memberList.status, 200);
    assert.ok(!memberList.body.data.events.some((e) => e.id === draftEventId));

    // 3. Member requesting direct draft detail receives 403 Forbidden
    const memberDetail = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${draftEventId}`)
      .set('Cookie', [memberCookie, csrfCookie]);
    assert.equal(memberDetail.status, 403);
    assert.ok(memberDetail.body.error.message.includes('Draft events are only visible'));
  });

  it('10. EVT-003: Public event listing exposes only published public events, hiding drafts and private events', async () => {
    // Create and publish a public event
    const startAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Public Open Summit 2026',
        startAt,
        endAt,
        timezone: 'UTC',
        visibility: 'public',
      });
    const pubEventId = createRes.body.data.event.id;

    // Publish the event
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${pubEventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'published' });

    // Query public events without any session cookie (search by unique title to isolate across test runs)
    const publicRes = await request(app).get('/api/v1/events/public?search=Public%20Open%20Summit');
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.body.success, true);

    const publicList = publicRes.body.data.events;
    // The published public event MUST appear
    assert.ok(publicList.some((e) => e.id === pubEventId));

    // All events returned MUST be published and public
    for (const e of publicList) {
      assert.equal(e.status, 'published');
      assert.equal(e.visibility, 'public');
    }
  });

  // ---------------------------------------------------------------------------
  // MOD-004: Fail-Closed Behavior on Deactivated Events Module
  // ---------------------------------------------------------------------------
  it('11. MOD-004: Direct calls to events endpoints fail closed with 403 MODULE_DISABLED when module is deactivated', async () => {
    // Deactivate events module
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: false });

    // Direct call to list events fails with 403 MODULE_DISABLED
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'MODULE_DISABLED');

    // Re-enable module for subsequent tests
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });
  });

  // ---------------------------------------------------------------------------
  // RBAC-007: Cross-Tenant Isolation
  // ---------------------------------------------------------------------------
  it('12. RBAC-007: User in Org B cannot read or mutate events belonging to Org A', async () => {
    const eventId = testState.createdEventId;

    // Cross-tenant user attempting to get Org A event receives 403 Forbidden (requireOrgMembership)
    const readRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${eventId}`)
      .set('Cookie', [crossTenantCookie, csrfCookie]);

    assert.equal(readRes.status, 403);

    // Cross-tenant user attempting to mutate Org A event receives 403
    const mutRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/events/${eventId}`)
      .set('Cookie', [crossTenantCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Hacked Title' });

    assert.equal(mutRes.status, 403);
  });

  // ---------------------------------------------------------------------------
  // AUD-001: Audit Log Generation
  // ---------------------------------------------------------------------------
  it('13. AUD-001: Event creation and lifecycle changes generate immutable audit log records', async () => {
    const auditRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(auditRes.status, 200);
    const logs = auditRes.body.data.auditLogs || auditRes.body.data.logs;
    assert.ok(Array.isArray(logs), 'Expected logs array');

    const eventCreatedLog = logs.find((l) => l.action === 'event.created');
    assert.ok(eventCreatedLog, 'Expected event.created audit record');
    assert.equal(eventCreatedLog.actorId, ownerUserId);

    const statusChangedLog = logs.find((l) => l.action === 'event.status_changed');
    assert.ok(statusChangedLog, 'Expected event.status_changed audit record');
  });
});
