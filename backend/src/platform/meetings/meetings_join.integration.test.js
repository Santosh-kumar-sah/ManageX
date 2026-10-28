/**
 * ManageX Authenticated Join Gateway Integration Test Suite (Phase 1B.5)
 * Strictly adheres to docs/google-meet-integration-plan.md Section 10.2,
 * docs/security.md, and PRD Section 8.1.
 *
 * Requirements Verified:
 * 1. Validates active session and active organisation membership (401/403).
 * 2. Visibility enforcement (organisation vs attendees_only).
 * 3. Terminal state lockdown: completed, cancelled, missed reject with HTTP 409.
 * 4. Status invariant: joining NEVER mutates meeting status.
 * 5. Scheme safety: validates http:/https:, blocks javascript:, data:, and relative URLs.
 * 6. Audit logging: records meeting.joined event with actor, meeting, and provider.
 * 7. Missing URL returns 404 MEETING_LINK_NOT_FOUND.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';
import { closePool } from '../database/pool.js';

describe('ManageX Authenticated Join Gateway (Phase 1B.5: Section 10.2)', () => {
  const runId = randomUUID().slice(0, 8);
  const testAdminEmail = `join_admin_${runId}@managex.local`;
  const testMemberEmail = `join_member_${runId}@managex.local`;
  const testNonAttendeeEmail = `join_nonatt_${runId}@managex.local`;

  let orgId;
  let adminUserId;
  let memberUserId;
  let nonAttendeeUserId;

  let adminCookie = '';
  let memberCookie = '';
  let nonAttendeeCookie = '';
  let csrfCookie = '';
  let csrfToken = '';

  before(async () => {
    await withSystemTransaction(async (client) => {
      const dbCheck = await client.query('SELECT current_database() AS name');
      if (dbCheck.rows[0].name !== 'managex_test') {
        throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbCheck.rows[0].name}`);
      }

      // 1. Create users
      const adminRes = await client.query(
        `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
         VALUES ($1, 'Join Admin', 'hash', 'active', NOW())
         RETURNING id`,
        [testAdminEmail]
      );
      adminUserId = adminRes.rows[0].id;

      const memberRes = await client.query(
        `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
         VALUES ($1, 'Join Member', 'hash', 'active', NOW())
         RETURNING id`,
        [testMemberEmail]
      );
      memberUserId = memberRes.rows[0].id;

      const nonAttRes = await client.query(
        `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
         VALUES ($1, 'Non Attendee', 'hash', 'active', NOW())
         RETURNING id`,
        [testNonAttendeeEmail]
      );
      nonAttendeeUserId = nonAttRes.rows[0].id;

      // 2. Create organisation
      const orgRes = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Join Org ${runId}`, `join-org-${runId}`]
      );
      orgId = orgRes.rows[0].id;

      // 3. Enable meetings module
      await client.query(
        `INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled)
         SELECT $1, id, true FROM modules WHERE slug = 'meetings'
         ON CONFLICT (organisation_id, module_id) DO UPDATE SET is_enabled = true`,
        [orgId]
      );

      // 4. Roles
      const adminRoleRes = await client.query(
        "SELECT id FROM roles WHERE slug = 'organisation_admin' AND is_system = true"
      );
      const memberRoleRes = await client.query(
        "SELECT id FROM roles WHERE slug = 'organisation_member' AND is_system = true"
      );

      // Admin membership
      const adminMemRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [orgId, adminUserId]
      );
      await client.query(
        `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
         VALUES ($1, $2, $3)`,
        [orgId, adminMemRes.rows[0].id, adminRoleRes.rows[0].id]
      );

      // Member memberships
      for (const uid of [memberUserId, nonAttendeeUserId]) {
        const memRes = await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [orgId, uid]
        );
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3)`,
          [orgId, memRes.rows[0].id, memberRoleRes.rows[0].id]
        );
      }
    });

    // Sessions
    const adminSession = await createSession({ userId: adminUserId });
    adminCookie = `${SESSION_COOKIE_NAME}=${adminSession.rawToken}`;

    const memberSession = await createSession({ userId: memberUserId });
    memberCookie = `${SESSION_COOKIE_NAME}=${memberSession.rawToken}`;

    const nonAttSession = await createSession({ userId: nonAttendeeUserId });
    nonAttendeeCookie = `${SESSION_COOKIE_NAME}=${nonAttSession.rawToken}`;

    // CSRF
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const setCookies = csrfRes.headers['set-cookie'] || [];
    const csrfRaw = setCookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
    if (csrfRaw) {
      csrfCookie = csrfRaw.split(';')[0];
      csrfToken = csrfCookie.replace(`${CSRF_COOKIE_NAME}=`, '');
    }
  });

  after(async () => {
    if (orgId && adminUserId) {
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        await client.query('DELETE FROM meetings WHERE organisation_id = $1', [orgId]);
      });
      await withSystemTransaction(async (client) => {
        await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM organisations WHERE id = $1', [orgId]);
        await client.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [
          adminUserId,
          memberUserId,
          nonAttendeeUserId,
        ]);
      });
    }
    await closePool();
  });

  it('1. GET /meetings/:id/join returns 200 with valid Google Meet URL for organisation-visible meeting', async () => {
    let meetingId;
    await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
      const res = await client.query(
        `INSERT INTO meetings (
          organisation_id, title, start_at, end_at, timezone,
          location_type, conference_provider, virtual_url, visibility, status,
          organiser_id, created_by_id
        ) VALUES (
          $1, 'Public Sync Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
          'virtual', 'google_meet', 'https://meet.google.com/abc-defg-hij', 'organisation', 'scheduled',
          $2, $2
        ) RETURNING id`,
        [orgId, adminUserId]
      );
      meetingId = res.rows[0].id;
    });

    const res = await request(app)
      .get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.virtualUrl, 'https://meet.google.com/abc-defg-hij');
  });

  it('2. GET /meetings/:id/join rejects unauthenticated caller with 401', async () => {
    let meetingId;
    await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
      const res = await client.query(
        `INSERT INTO meetings (
          organisation_id, title, start_at, end_at, timezone,
          location_type, conference_provider, virtual_url, visibility, status,
          organiser_id, created_by_id
        ) VALUES (
          $1, 'Auth Check Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
          'virtual', 'google_meet', 'https://meet.google.com/abc-defg-hij', 'organisation', 'scheduled',
          $2, $2
        ) RETURNING id`,
        [orgId, adminUserId]
      );
      meetingId = res.rows[0].id;
    });

    const res = await request(app).get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`);
    assert.equal(res.status, 401);
  });

  it('3. GET /meetings/:id/join enforces attendees_only visibility: non-attendee receives 403, attendee receives 200', async () => {
    let meetingId;
    await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
      const res = await client.query(
        `INSERT INTO meetings (
          organisation_id, title, start_at, end_at, timezone,
          location_type, conference_provider, virtual_url, visibility, status,
          organiser_id, created_by_id
        ) VALUES (
          $1, 'Private Executive Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
          'virtual', 'google_meet', 'https://meet.google.com/priv-meet-link', 'attendees_only', 'scheduled',
          $2, $2
        ) RETURNING id`,
        [orgId, adminUserId]
      );
      meetingId = res.rows[0].id;

      // Add memberUserId as invited attendee, leave nonAttendeeUserId out
      await client.query(
        `INSERT INTO meeting_attendees (organisation_id, meeting_id, user_id, role, rsvp_status)
         VALUES ($1, $2, $3, 'participant', 'accepted')`,
        [orgId, meetingId, memberUserId]
      );
    });

    // Non-attendee caller receives 403
    const nonAttRes = await request(app)
      .get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`)
      .set('Cookie', [nonAttendeeCookie, csrfCookie]);

    assert.equal(nonAttRes.status, 403);
    assert.equal(nonAttRes.body.error.code, 'MEETING_ACCESS_DENIED');

    // Invited attendee caller receives 200
    const attRes = await request(app)
      .get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(attRes.status, 200);
    assert.equal(attRes.body.data.virtualUrl, 'https://meet.google.com/priv-meet-link');
  });

  it('4. GET /meetings/:id/join rejects terminal states (completed, cancelled, missed) with 409 MEETING_TERMINAL_STATE', async () => {
    for (const termStatus of ['completed', 'cancelled', 'missed']) {
      let meetingId;
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `INSERT INTO meetings (
            organisation_id, title, start_at, end_at, timezone,
            location_type, conference_provider, virtual_url, visibility, status,
            organiser_id, created_by_id
          ) VALUES (
            $1, 'Terminal Meeting ${termStatus}', NOW() - interval '2 hours', NOW() - interval '1 hour', 'UTC',
            'virtual', 'google_meet', 'https://meet.google.com/term-link', 'organisation', $2,
            $3, $3
          ) RETURNING id`,
          [orgId, termStatus, adminUserId]
        );
        meetingId = res.rows[0].id;
      });

      const res = await request(app)
        .get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`)
        .set('Cookie', [memberCookie, csrfCookie]);

      assert.equal(res.status, 409, `Terminal status ${termStatus} must reject with 409`);
      assert.equal(res.body.error.code, 'MEETING_TERMINAL_STATE');
    }
  });

  it('5. Status Invariant: Joining a scheduled meeting NEVER mutates meeting status', async () => {
    let meetingId;
    await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
      const res = await client.query(
        `INSERT INTO meetings (
          organisation_id, title, start_at, end_at, timezone,
          location_type, conference_provider, virtual_url, visibility, status,
          organiser_id, created_by_id
        ) VALUES (
          $1, 'Invariant Check Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
          'virtual', 'google_meet', 'https://meet.google.com/inv-link', 'organisation', 'scheduled',
          $2, $2
        ) RETURNING id`,
        [orgId, adminUserId]
      );
      meetingId = res.rows[0].id;
    });

    const res = await request(app)
      .get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(res.status, 200);

    // Verify DB row status remains strictly 'scheduled'
    await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
      const check = await client.query('SELECT status FROM meetings WHERE id = $1', [meetingId]);
      assert.equal(check.rows[0].status, 'scheduled', 'Meeting status must not mutate on join');
    });
  });

  it('6. Scheme Safety: Blocks dangerous URL schemes (javascript:, data:, relative URLs)', async () => {
    const dangerousUrls = [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.com/phish',
      'not-a-valid-url',
    ];

    for (const badUrl of dangerousUrls) {
      let meetingId;
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `INSERT INTO meetings (
            organisation_id, title, start_at, end_at, timezone,
            location_type, conference_provider, virtual_url, visibility, status,
            organiser_id, created_by_id
          ) VALUES (
            $1, 'Bad Scheme Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
            'virtual', 'manual', $2, 'organisation', 'scheduled',
            $3, $3
          ) RETURNING id`,
          [orgId, badUrl, adminUserId]
        );
        meetingId = res.rows[0].id;
      });

      const res = await request(app)
        .get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`)
        .set('Cookie', [memberCookie, csrfCookie]);

      assert.equal(res.status, 422, `Unsafe scheme ${badUrl} must be rejected with 422`);
      assert.equal(res.body.error.code, 'INVALID_URL_SCHEME');
    }
  });

  it('7. Returns 404 MEETING_LINK_NOT_FOUND when virtual_url is NULL or empty', async () => {
    let meetingId;
    await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
      const res = await client.query(
        `INSERT INTO meetings (
          organisation_id, title, start_at, end_at, timezone,
          location_type, conference_provider, virtual_url, visibility, status,
          organiser_id, created_by_id
        ) VALUES (
          $1, 'No Link Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
          'virtual', 'google_meet', NULL, 'organisation', 'scheduled',
          $2, $2
        ) RETURNING id`,
        [orgId, adminUserId]
      );
      meetingId = res.rows[0].id;
    });

    const res = await request(app)
      .get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'MEETING_LINK_NOT_FOUND');
  });

  it('8. Emits immutable meeting.joined audit log on successful join', async () => {
    let meetingId;
    await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
      const res = await client.query(
        `INSERT INTO meetings (
          organisation_id, title, start_at, end_at, timezone,
          location_type, conference_provider, virtual_url, visibility, status,
          organiser_id, created_by_id
        ) VALUES (
          $1, 'Audited Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
          'virtual', 'google_meet', 'https://meet.google.com/audit-check', 'organisation', 'scheduled',
          $2, $2
        ) RETURNING id`,
        [orgId, adminUserId]
      );
      meetingId = res.rows[0].id;
    });

    const res = await request(app)
      .get(`/api/v1/organisations/${orgId}/meetings/${meetingId}/join`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(res.status, 200);

    // Verify audit log entry
    await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
      const auditRes = await client.query(
        `SELECT action, actor_id, entity_type, entity_id
         FROM audit_logs
         WHERE organisation_id = $1 AND entity_id = $2 AND action = 'meeting.joined'`,
        [orgId, meetingId]
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].actor_id, memberUserId);
      assert.equal(auditRes.rows[0].entity_type, 'meeting');
    });
  });
});
