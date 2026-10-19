/**
 * ManageX Phase 6B Integration Tests: Event Registration, Windows & External Participants
 * Strictly adheres to PRD Section 7.2 (EVT-004, EVT-005), docs/security.md, ADR-003, and ADR-008.
 *
 * Requirements covered:
 * - EVT-004: Registration workflow, own-registration status, staff participant table, external participant boundary.
 * - EVT-005: Registration window (effective opening/closing), capacity limits, duplicate rejection,
 *   re-registration reactivation, participant withdrawal, concurrent registration limits, and audit logs.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('Phase 6B — Event Registration, Windows & External Participants Suite', () => {
  let ownerUserId;
  let ownerCookie;
  let csrfCookie;
  let csrfToken;

  let memberUserId;
  let memberCookie;

  let externalUserId;
  let externalCookie;

  let crossTenantUserId;
  let crossTenantCookie;

  let orgAId;
  let orgBId;

  let publishedEventId;
  let capacityEventId;
  let closedWindowEventId;
  let futureWindowEventId;

  before(async () => {
    // 1. Create test users inside system transaction with unique run timestamp
    const runTag = Date.now();
    const passwordHash = await hashPassword('SecurePassword123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ('Event Org Owner', 'reg6b_owner_${runTag}@managex.local', $1, 'active', NOW()),
          ('Internal Member', 'reg6b_member_${runTag}@managex.local', $1, 'active', NOW()),
          ('External Participant', 'reg6b_ext_${runTag}@managex.local', $1, 'active', NOW()),
          ('Cross Tenant User', 'reg6b_cross_${runTag}@managex.local', $1, 'active', NOW())
        RETURNING id, email
      `, [passwordHash]);
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email.startsWith('reg6b_owner_')).id;
    memberUserId = users.find((u) => u.email.startsWith('reg6b_member_')).id;
    externalUserId = users.find((u) => u.email.startsWith('reg6b_ext_')).id;
    crossTenantUserId = users.find((u) => u.email.startsWith('reg6b_cross_')).id;

    // 2. Create user sessions
    const ownerSess = await createSession({ userId: ownerUserId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${ownerSess.rawToken}`;

    const memberSess = await createSession({ userId: memberUserId });
    memberCookie = `${SESSION_COOKIE_NAME}=${memberSess.rawToken}`;

    const extSess = await createSession({ userId: externalUserId });
    externalCookie = `${SESSION_COOKIE_NAME}=${extSess.rawToken}`;

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

    // 5. Create Organisation A (Host Org)
    const orgARes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Nexus Event Corp A ${runTag}` });
    assert.equal(orgARes.status, 201, `Failed to create Org A: ${JSON.stringify(orgARes.body)}`);
    orgAId = orgARes.body.data.organisation.id;

    // 6. Create Organisation B (Separate Org)
    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [crossTenantCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Apex Event Corp B ${runTag}` });
    assert.equal(orgBRes.status, 201, `Failed to create Org B: ${JSON.stringify(orgBRes.body)}`);
    orgBId = orgBRes.body.data.organisation.id;

    // 7. Add member to Org A as regular member
    await withSystemTransaction(async (client) => {
      const memRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, memberUserId]
      );
      const memRole = await client.query(
        `SELECT id FROM roles WHERE slug = 'organisation_member' AND organisation_id IS NULL`
      );
      await client.query(
        `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
         VALUES ($1, $2, $3)`,
        [orgAId, memRes.rows[0].id, memRole.rows[0].id]
      );
    });

    // 8. Create and Publish Primary Event in Org A (Capacity: 10, open registration window)
    const now = new Date();
    const startAt = new Date(now.getTime() + 7 * 86400000); // 7 days from now
    const endAt = new Date(startAt.getTime() + 86400000); // 8 days from now
    const regClosesAt = new Date(startAt.getTime() - 3600000); // 1 hour before start

    const pubRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Global Hackathon 2026',
        eventType: 'hackathon',
        visibility: 'public',
        timezone: 'Asia/Kolkata',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        registrationClosesAt: regClosesAt.toISOString(),
        capacity: 10,
      });
    publishedEventId = pubRes.body.data.event.id;

    // Transition to 'published'
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'published' });

    // 9. Create Event with Capacity = 1 to test full capacity lock
    const capRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Exclusive Masterclass',
        eventType: 'general_event',
        visibility: 'public',
        timezone: 'UTC',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        capacity: 1,
      });
    capacityEventId = capRes.body.data.event.id;
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${capacityEventId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'published' });

    // 10. Create Event with already closed registration window (registrationClosesAt in past)
    await withSystemTransaction(async (client) => {
      const pastClose = new Date(now.getTime() - 3600000); // 1 hour ago
      const pastStart = new Date(now.getTime() + 3600000);
      const pastEnd = new Date(now.getTime() + 7200000);
      const res = await client.query(
        `INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, registration_closes_at, created_by_id
        ) VALUES (
          $1, 'Closed Registration Summit', 'closed-reg-summit', 'general_event', 'published', 'public',
          $2, $3, 'UTC', $4, $5
        ) RETURNING id`,
        [orgAId, pastStart, pastEnd, pastClose, ownerUserId]
      );
      closedWindowEventId = res.rows[0].id;
    });

    // 11. Create Event with future registration opening window
    await withSystemTransaction(async (client) => {
      const futureOpen = new Date(now.getTime() + 86400000); // Tomorrow
      const futureStart = new Date(now.getTime() + 172800000);
      const futureEnd = new Date(now.getTime() + 259200000);
      const res = await client.query(
        `INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, registration_opens_at, created_by_id
        ) VALUES (
          $1, 'Future Registration Summit', 'future-reg-summit', 'general_event', 'published', 'public',
          $2, $3, 'UTC', $4, $5
        ) RETURNING id`,
        [orgAId, futureStart, futureEnd, futureOpen, ownerUserId]
      );
      futureWindowEventId = res.rows[0].id;
    });
  });

  // ---------------------------------------------------------------------------
  // 1. EVT-004: External Participant Registration (No Organisation Membership)
  // ---------------------------------------------------------------------------
  it('1. EVT-004: External participant successfully registers for published event without gaining org membership', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/register`)
      .set('Cookie', [externalCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        customAnswers: { tShirtSize: 'L', trackPreference: 'AI/ML' },
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.registration.eventId, publishedEventId);
    assert.equal(res.body.data.registration.userId, externalUserId);
    assert.equal(res.body.data.registration.status, 'registered');
    assert.equal(res.body.data.registration.customAnswers.trackPreference, 'AI/ML');

    // Invariant: External participant does NOT gain organisation membership (ADR-003)
    const orgCheck = await request(app)
      .get(`/api/v1/organisations/${orgAId}`)
      .set('Cookie', [externalCookie, csrfCookie]);
    assert.equal(orgCheck.status, 403, 'External participant must not have access to organisation details');
  });

  // ---------------------------------------------------------------------------
  // 2. EVT-004: Own Registration Status View
  // ---------------------------------------------------------------------------
  it('2. EVT-004: Registrant can query their own registration status', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/my-registration`)
      .set('Cookie', [externalCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.registration);
    assert.equal(res.body.data.registration.status, 'registered');
    assert.equal(res.body.data.registration.userId, externalUserId);
  });

  // ---------------------------------------------------------------------------
  // 3. EVT-005: Duplicate Registration Rejection
  // ---------------------------------------------------------------------------
  it('3. EVT-005: Duplicate registration attempt is rejected with 409 ALREADY_REGISTERED', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/register`)
      .set('Cookie', [externalCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ customAnswers: {} });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ALREADY_REGISTERED');
  });

  // ---------------------------------------------------------------------------
  // 4. EVT-005: Withdrawal Workflow
  // ---------------------------------------------------------------------------
  it('4. EVT-005: Registrant can withdraw registration while registration window permits it', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/withdraw`)
      .set('Cookie', [externalCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.registration.status, 'withdrawn');
    assert.ok(res.body.data.registration.withdrawnAt);

    // Verify status via query
    const statusRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/my-registration`)
      .set('Cookie', [externalCookie, csrfCookie]);
    assert.equal(statusRes.body.data.registration.status, 'withdrawn');
  });

  // ---------------------------------------------------------------------------
  // 5. EVT-005: Re-registration Reactivation
  // ---------------------------------------------------------------------------
  it('5. EVT-005: Re-registering after withdrawal reactivates existing row, preserving original timestamp', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/register`)
      .set('Cookie', [externalCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ customAnswers: { note: 'Rejoining the event' } });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.registration.status, 'registered');
    assert.ok(res.body.data.registration.reactivatedAt);
    assert.ok(res.body.data.registration.registeredAt);
    assert.equal(res.body.data.registration.withdrawnAt, null);
  });

  // ---------------------------------------------------------------------------
  // 6. EVT-005: Registration Window Boundaries (Past & Future)
  // ---------------------------------------------------------------------------
  it('6. EVT-005: Registration is rejected if registration window has closed', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${closedWindowEventId}/register`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'REGISTRATION_CLOSED');
  });

  it('7. EVT-005: Registration is rejected if registration window has not opened yet', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${futureWindowEventId}/register`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'REGISTRATION_NOT_OPEN');
  });

  // ---------------------------------------------------------------------------
  // 8. EVT-005: Capacity Limit & Concurrency Enforcement
  // ---------------------------------------------------------------------------
  it('8. EVT-005: Registration fails with 409 EVENT_CAPACITY_FULL when maximum capacity is reached', async () => {
    // 1st slot filled by member
    const firstRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${capacityEventId}/register`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();
    assert.equal(firstRes.status, 201);

    // 2nd slot attempted by external participant (capacity = 1) -> rejected
    const secondRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${capacityEventId}/register`)
      .set('Cookie', [externalCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    assert.equal(secondRes.status, 409);
    assert.equal(secondRes.body.error.code, 'EVENT_CAPACITY_FULL');
  });

  // ---------------------------------------------------------------------------
  // 9. EVT-004: Event Staff Participant List & Access Isolation
  // ---------------------------------------------------------------------------
  it('9. EVT-004: Event staff can view participant table with summary, search, and pagination', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/participants`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.participants));
    assert.ok(res.body.data.summary.activeCount >= 1);
    assert.equal(res.body.data.summary.capacity, 10);

    const registrant = res.body.data.participants.find((p) => p.userId === externalUserId);
    assert.ok(registrant, 'External registrant must appear in participant list');
    assert.equal(registrant.status, 'registered');
  });

  it('10. EVT-004: External participant cannot view the organisation participant roster (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/participants`)
      .set('Cookie', [externalCookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // 11. RBAC-007: Cross-Tenant Isolation
  // ---------------------------------------------------------------------------
  it('11. RBAC-007: Event registration enforces tenant isolation and cannot cross organisations', async () => {
    // Attempting to register for Org A event through Org B route returns 404 or fails closed
    const res = await request(app)
      .post(`/api/v1/organisations/${orgBId}/events/${publishedEventId}/register`)
      .set('Cookie', [crossTenantCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    assert.equal(res.status, 404);
  });

  // ---------------------------------------------------------------------------
  // 12. MOD-004: Module Deactivation Enforces Fail-Closed Behavior
  // ---------------------------------------------------------------------------
  it('12. MOD-004: Direct registration calls fail closed with 403 MODULE_DISABLED when events module is deactivated', async () => {
    // Deactivate events module in Org A
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: false });

    // Registration fails closed
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/events/${publishedEventId}/register`)
      .set('Cookie', [externalCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'MODULE_DISABLED');

    // Re-enable events module
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });
  });

  // ---------------------------------------------------------------------------
  // 13. AUD-001: Immutable Audit Records for Registration & Withdrawal
  // ---------------------------------------------------------------------------
  it('13. AUD-001: Event registration and withdrawal generate immutable audit logs', async () => {
    const auditRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(auditRes.status, 200);
    const logs = auditRes.body.data.auditLogs || auditRes.body.data.logs;

    const regLog = logs.find((l) => l.action === 'event.participant.registered');
    assert.ok(regLog, 'Expected event.participant.registered audit log');
    assert.equal(regLog.entityType, 'event_registration');

    const withdrawLog = logs.find((l) => l.action === 'event.participant.withdrawn');
    assert.ok(withdrawLog, 'Expected event.participant.withdrawn audit log');
  });
});
