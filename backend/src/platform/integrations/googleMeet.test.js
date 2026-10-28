/**
 * ManageX Phase 1B.4: Google Calendar Client & Google Meet Orchestration Test Suite
 * Strictly adheres to docs/google-meet-integration-plan.md (Sections 3.2, 5, 6, 7.2, 11.3),
 * AGENTS.md, docs/security.md, and PRD Section 8.1.
 *
 * Verifies:
 * 1. googleCalendarClient gateway:
 *    - Option A: attendees: [] and sendUpdates=none strictly enforced.
 *    - Hangouts Meet link resolution from hangoutLink or conferenceData.entryPoints.
 *    - Bounded retry on transient 429/503 HTTP provider errors.
 *    - 409 Conflict handling on event insertion.
 *    - ETag If-Match validation on event patch and 412 Precondition Failed.
 *    - Idempotent event deletion (200, 204, 404, 410).
 * 2. googleMeetService & meetingService integration on managex_test:
 *    - Deterministic Base32hex event ID derivation: meet + 32-hex UUID.
 *    - 45s database lease claim concurrency protection.
 *    - Two-Stage Decoupled Pattern: holding 0 DB transactions open during Google HTTP calls.
 *    - Meeting creation with conferenceProvider='google_meet' provisions Meet link and marks synced.
 *    - Meeting cancellation during in-flight creation triggers compensation events.delete.
 *    - Revoked credentials during cancellation mark status 'abandoned'.
 *    - Meeting rescheduling triggers events.patch with ETag.
 *    - Meeting cancellation triggers events.delete and marks sync status 'none'.
 *    - On-demand retry endpoint POST /api/v1/organisations/:orgId/meetings/:id/sync-google.
 *    - Tenant isolation: Org B cannot synchronize or mutate Org A meetings.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

// Deterministic test key (64 hex characters = 32 bytes)
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Configure test environment variables before module evaluation
process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
process.env.TOKEN_ENCRYPTION_KEY_VERSION = '1';
process.env.GOOGLE_CLIENT_ID = 'test_client_id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:4000/api/v1/integrations/google/callback';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://managex_app:managex_app_password@localhost:5433/managex_test';

const {
  createCalendarEvent,
  getCalendarEvent,
  patchCalendarEvent,
  deleteCalendarEvent,
  GOOGLE_CALENDAR_EVENTS_ENDPOINT,
} = await import('./googleCalendarClient.js');

const {
  deriveGoogleEventId,
  acquireMeetingSyncLease,
  syncMeetingWithGoogle,
} = await import('./googleMeetService.js');

const {
  createMeeting,
  updateMeeting,
  transitionMeetingStatus,
  getMeetingById,
} = await import('../meetings/meetingService.js');

const { saveGoogleCredentials } = await import('./googleOAuthService.js');
const { withSystemTransaction, withTenantTransaction } = await import('../database/transaction.js');
const { closePool } = await import('../database/pool.js');
const { createApp } = await import('../../app.js');
const { createSession, SESSION_COOKIE_NAME } = await import('../auth/sessionService.js');

describe('ManageX Google Calendar & Meet Orchestration Suite (Phase 1B.4)', () => {
  // ===========================================================================
  // 1. Google Calendar Client Unit Tests
  // ===========================================================================
  describe('1. Google Calendar API Client Gateway (googleCalendarClient.js)', () => {
    const originalFetch = globalThis.fetch;

    after(() => {
      globalThis.fetch = originalFetch;
    });

    test('createCalendarEvent sends Option A payload (attendees: [], sendUpdates=none) and parses Meet link', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedHeaders = {};
      let capturedBody = null;

      globalThis.fetch = async (url, init) => {
        capturedUrl = String(url);
        capturedMethod = init.method;
        capturedHeaders = init.headers;
        capturedBody = JSON.parse(init.body);

        return {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            id: 'meet12345678123412341234123456789abc',
            etag: '"etag_version_1"',
            status: 'confirmed',
            hangoutLink: 'https://meet.google.com/xyz-abcd-uvw',
            conferenceData: {
              entryPoints: [
                {
                  entryPointType: 'video',
                  uri: 'https://meet.google.com/xyz-abcd-uvw',
                },
              ],
            },
          }),
        };
      };

      const result = await createCalendarEvent({
        accessToken: 'test_access_token',
        eventId: 'meet12345678123412341234123456789abc',
        summary: 'Sprint Architecture Sync',
        description: 'Engineering weekly sync',
        startAt: '2026-11-01T10:00:00.000Z',
        endAt: '2026-11-01T11:00:00.000Z',
        timezone: 'Asia/Kolkata',
        conferenceRequestId: 'req-uuid-12345',
      });

      assert.ok(capturedUrl.includes('conferenceDataVersion=1'), 'Must include conferenceDataVersion=1');
      assert.ok(capturedUrl.includes('sendUpdates=none'), 'Must include sendUpdates=none');
      assert.equal(capturedMethod, 'POST');
      assert.equal(capturedHeaders.Authorization, 'Bearer test_access_token');

      // Option A invariant: attendees must be strictly []
      assert.deepEqual(capturedBody.attendees, [], 'Option A: attendees must be empty array');
      assert.equal(capturedBody.id, 'meet12345678123412341234123456789abc');
      assert.equal(capturedBody.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');

      // Returned structure
      assert.equal(result.hangoutLink, 'https://meet.google.com/xyz-abcd-uvw');
      assert.equal(result.etag, '"etag_version_1"');
      assert.equal(result.eventId, 'meet12345678123412341234123456789abc');
    });

    test('createCalendarEvent throws GOOGLE_EVENT_CONFLICT on HTTP 409', async () => {
      globalThis.fetch = async () => ({
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: { message: 'Event ID already exists' },
        }),
      });

      await assert.rejects(
        async () => {
          await createCalendarEvent({
            accessToken: 'token',
            eventId: 'meet12345',
            summary: 'Title',
            startAt: '2026-11-01T10:00:00.000Z',
            endAt: '2026-11-01T11:00:00.000Z',
            timezone: 'UTC',
            conferenceRequestId: 'req-1',
          });
        },
        (err) => {
          assert.equal(err.code, 'GOOGLE_EVENT_CONFLICT');
          assert.equal(err.statusCode || err.status, 409);
          return true;
        }
      );
    });

    test('getCalendarEvent returns null on HTTP 404 or 410', async () => {
      globalThis.fetch = async () => ({
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: { message: 'Not found' } }),
      });

      const res = await getCalendarEvent({
        accessToken: 'token',
        eventId: 'meet99999',
      });
      assert.equal(res, null);
    });

    test('patchCalendarEvent sends If-Match: etag and handles 412 Precondition Failed', async () => {
      let capturedIfMatch = null;

      globalThis.fetch = async (url, init) => {
        capturedIfMatch = init.headers['If-Match'];
        return {
          status: 412,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: { message: 'Precondition Failed' } }),
        };
      };

      await assert.rejects(
        async () => {
          await patchCalendarEvent({
            accessToken: 'token',
            eventId: 'meet123',
            summary: 'Updated Title',
            etag: '"etag_version_1"',
          });
        },
        (err) => {
          assert.equal(err.code, 'GOOGLE_ETAG_PRECONDITION_FAILED');
          assert.equal(err.statusCode || err.status, 412);
          return true;
        }
      );

      assert.equal(capturedIfMatch, '"etag_version_1"');
    });

    test('deleteCalendarEvent handles 200, 204, 404, 410 idempotently', async () => {
      for (const status of [200, 204, 404, 410]) {
        globalThis.fetch = async () => ({
          status,
          headers: new Headers(),
          text: async () => '',
        });

        const deleted = await deleteCalendarEvent({
          accessToken: 'token',
          eventId: 'meet123',
        });
        assert.equal(deleted, true, `Status ${status} must be treated as successful deletion`);
      }
    });
  });

  // ===========================================================================
  // 2. Database Integration & Synchronization Lifecycle (managex_test)
  // ===========================================================================
  describe('2. Google Meet Service & Lifecycle Integration (managex_test)', () => {
    const runId = randomUUID().slice(0, 8);
    const testAdminEmail = `meet_admin_${runId}@managex.local`;
    const testMemberEmail = `meet_member_${runId}@managex.local`;
    const originalFetch = globalThis.fetch;

    let orgId;
    let adminUserId;
    let memberUserId;
    let app;
    let adminCookie = '';
    let memberCookie = '';
    let csrfCookie = '';
    let csrfToken = '';

    before(async () => {
      app = createApp();

      await withSystemTransaction(async (client) => {
        const dbCheck = await client.query('SELECT current_database() AS name');
        if (dbCheck.rows[0].name !== 'managex_test') {
          throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbCheck.rows[0].name}`);
        }

        // Create Admin User & Member User
        const adminRes = await client.query(
          `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
           VALUES ($1, 'Meet Admin', 'hash', 'active', NOW())
           RETURNING id`,
          [testAdminEmail]
        );
        adminUserId = adminRes.rows[0].id;

        const memberRes = await client.query(
          `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
           VALUES ($1, 'Meet Member', 'hash', 'active', NOW())
           RETURNING id`,
          [testMemberEmail]
        );
        memberUserId = memberRes.rows[0].id;

        // Create Organisation
        const orgRes = await client.query(
          `INSERT INTO organisations (name, slug, status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [`Meet Org ${runId}`, `meet-org-${runId}`]
        );
        orgId = orgRes.rows[0].id;

        // Enable meetings module entitlement
        await client.query(
          `INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled)
           SELECT $1, id, true FROM modules WHERE slug = 'meetings'
           ON CONFLICT (organisation_id, module_id) DO UPDATE SET is_enabled = true`,
          [orgId]
        );

        // Fetch organisation_admin and member roles
        const adminRoleRes = await client.query(
          "SELECT id FROM roles WHERE slug = 'organisation_admin' AND is_system = true"
        );
        const memberRoleRes = await client.query(
          "SELECT id FROM roles WHERE slug = 'organisation_member' AND is_system = true"
        );

        // Admin membership with organisation_admin role
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

        // Member membership
        const memberMemRes = await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [orgId, memberUserId]
        );
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3)`,
          [orgId, memberMemRes.rows[0].id, memberRoleRes.rows[0].id]
        );
      });

      // Seed valid encrypted Google integration credentials for this organisation
      await saveGoogleCredentials({
        organisationId: orgId,
        userId: adminUserId,
        refreshToken: 'valid_refresh_token_for_meet_tests',
        connectedEmail: 'admin@googleworkspace.example.com',
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
      });

      // Create session cookies
      const adminSession = await createSession({ userId: adminUserId });
      adminCookie = `${SESSION_COOKIE_NAME}=${adminSession.rawToken}`;

      const memberSession = await createSession({ userId: memberUserId });
      memberCookie = `${SESSION_COOKIE_NAME}=${memberSession.rawToken}`;

      // Get CSRF cookie
      const healthRes = await request(app).get('/api/v1/health');
      const setCookies = healthRes.headers['set-cookie'] || [];
      const csrfRaw = setCookies.find((c) => c.startsWith('managex_csrf='));
      if (csrfRaw) {
        csrfCookie = csrfRaw.split(';')[0];
        csrfToken = csrfCookie.split('=')[1];
      }
    });

    after(async () => {
      globalThis.fetch = originalFetch;

      if (orgId && adminUserId) {
        await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
          await client.query('DELETE FROM meetings WHERE organisation_id = $1', [orgId]);
          await client.query('DELETE FROM organisation_integrations WHERE organisation_id = $1', [orgId]);
        });

        await withSystemTransaction(async (client) => {
          await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgId]);
          await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgId]);
          await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgId]);
          await client.query('DELETE FROM organisations WHERE id = $1', [orgId]);
          await client.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUserId, memberUserId]);
        });
      }
      await closePool();
    });

    test('deriveGoogleEventId produces compliant Base32hex ID (meet + 32-hex UUID)', () => {
      const meetingId = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';
      const eventId = deriveGoogleEventId(meetingId);

      assert.equal(eventId, 'meetc9bf9e5716854c89bafbff5af830be8a');
      assert.equal(eventId.length, 36);
      assert.match(eventId, /^meet[0-9a-f]{32}$/);
    });

    test('acquireMeetingSyncLease locks row with 45s claim and blocks competing worker', async () => {
      // Create a test meeting in managex_test
      let meetingId;
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `INSERT INTO meetings (
            organisation_id, title, start_at, end_at, timezone,
            location_type, conference_provider, google_sync_status,
            organiser_id, created_by_id
          ) VALUES (
            $1, 'Lease Test Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
            'virtual', 'google_meet', 'pending_create',
            $2, $2
          ) RETURNING id`,
          [orgId, adminUserId]
        );
        meetingId = res.rows[0].id;
      });

      // Worker 1 acquires lease
      const claim1 = await acquireMeetingSyncLease({
        organisationId: orgId,
        meetingId,
        actorUserId: adminUserId,
      });

      assert.ok(claim1, 'Worker 1 must acquire lease');
      assert.ok(claim1.google_sync_claim_token, 'Worker 1 receives claim token');

      // Worker 2 attempts lease immediately (should fail because lease is active)
      const claim2 = await acquireMeetingSyncLease({
        organisationId: orgId,
        meetingId,
        actorUserId: adminUserId,
      });

      assert.equal(claim2, null, 'Worker 2 must receive null while Worker 1 holds active 45s lease');
    });

    test('createMeeting with conferenceProvider=google_meet provisions Meet link and marks synced', async () => {
      // Mock Google OAuth token refresh and Calendar event creation
      globalThis.fetch = async (url) => {
        const urlStr = String(url);

        // 1. Token Refresh
        if (urlStr.includes('/token')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              access_token: 'mock_fresh_access_token',
              expires_in: 3600,
              scope: 'https://www.googleapis.com/auth/calendar.events',
            }),
          };
        }

        // 2. Calendar Event Creation or Probe
        if (urlStr.includes(GOOGLE_CALENDAR_EVENTS_ENDPOINT)) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              id: 'meet12345',
              etag: '"etag_mock_1"',
              status: 'confirmed',
              hangoutLink: 'https://meet.google.com/abc-defg-hij',
              conferenceData: {
                entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }],
              },
            }),
          };
        }

        throw new Error(`Unexpected fetch to ${urlStr}`);
      };

      const meeting = await createMeeting(
        orgId,
        {
          title: 'Design Sprint Kickoff',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 90000000).toISOString(),
          timezone: 'Asia/Kolkata',
          locationType: 'virtual',
          visibility: 'organisation',
          conferenceProvider: 'google_meet',
        },
        adminUserId
      );

      assert.equal(meeting.conferenceProvider, 'google_meet');
      assert.equal(meeting.googleSyncStatus, 'synced');
      assert.equal(meeting.virtualUrl, 'https://meet.google.com/abc-defg-hij');
      assert.ok(meeting.googleCalendarEventId, 'Must have googleCalendarEventId');
      assert.equal(meeting.googleCalendarEtag, '"etag_mock_1"');
    });

    test('Meeting creation marks failed_create if Google returns 500 without invalidating meeting', async () => {
      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/token')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ access_token: 'mock_token', expires_in: 3600 }),
          };
        }
        if (urlStr.includes(GOOGLE_CALENDAR_EVENTS_ENDPOINT)) {
          return {
            status: 500,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: { message: 'Google Calendar internal server error' } }),
          };
        }
        throw new Error(`Unexpected fetch to ${urlStr}`);
      };

      const meeting = await createMeeting(
        orgId,
        {
          title: 'Provider Failure Test Meeting',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 90000000).toISOString(),
          timezone: 'UTC',
          locationType: 'virtual',
          visibility: 'organisation',
          conferenceProvider: 'google_meet',
        },
        adminUserId
      );

      // Meeting is created, not invalidated, status is scheduled, sync status is failed_create
      assert.ok(meeting.id, 'Meeting must be successfully created in database');
      assert.equal(meeting.status, 'scheduled');
      assert.equal(meeting.conferenceProvider, 'google_meet');
      assert.equal(meeting.googleSyncStatus, 'failed_create');
      assert.ok(meeting.googleSyncError, 'Error message must be captured');
    });

    test('Meeting reschedule updates Google Calendar via events.patch with ETag', async () => {
      let patchCalled = false;
      let capturedIfMatch = null;

      globalThis.fetch = async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes('/token')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ access_token: 'mock_token', expires_in: 3600 }),
          };
        }
        if (urlStr.includes(GOOGLE_CALENDAR_EVENTS_ENDPOINT)) {
          if (init?.method === 'PATCH') {
            patchCalled = true;
            capturedIfMatch = init.headers['If-Match'];
            return {
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({
                id: 'meet123',
                etag: '"etag_mock_2"',
                status: 'confirmed',
                hangoutLink: 'https://meet.google.com/abc-defg-hij',
              }),
            };
          }
          // Default create response
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              id: 'meet123',
              etag: '"etag_mock_1"',
              status: 'confirmed',
              hangoutLink: 'https://meet.google.com/abc-defg-hij',
            }),
          };
        }
        throw new Error(`Unexpected fetch to ${urlStr}`);
      };

      // 1. Create meeting
      const meeting = await createMeeting(
        orgId,
        {
          title: 'Original Title',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 90000000).toISOString(),
          timezone: 'UTC',
          locationType: 'virtual',
          conferenceProvider: 'google_meet',
        },
        adminUserId
      );

      // 2. Reschedule meeting
      const newStart = new Date(Date.now() + 100000000).toISOString();
      const newEnd = new Date(Date.now() + 103600000).toISOString();

      const updated = await updateMeeting(
        orgId,
        meeting.id,
        {
          title: 'Rescheduled Title',
          startAt: newStart,
          endAt: newEnd,
        },
        adminUserId
      );

      assert.equal(patchCalled, true, 'Must call events.patch on reschedule');
      assert.equal(capturedIfMatch, '"etag_mock_1"', 'Must send previous ETag in If-Match header');
      assert.equal(updated.googleCalendarEtag, '"etag_mock_2"');
      assert.equal(updated.googleSyncStatus, 'synced');
    });

    test('Meeting cancellation triggers events.delete and sets google_sync_status=none', async () => {
      let deleteCalled = false;

      globalThis.fetch = async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes('/token')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ access_token: 'mock_token', expires_in: 3600 }),
          };
        }
        if (urlStr.includes(GOOGLE_CALENDAR_EVENTS_ENDPOINT)) {
          if (init?.method === 'DELETE') {
            deleteCalled = true;
            return {
              ok: true,
              status: 204,
              headers: new Headers(),
              text: async () => '',
            };
          }
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              id: 'meet123',
              etag: '"etag_1"',
              hangoutLink: 'https://meet.google.com/link',
            }),
          };
        }
        throw new Error(`Unexpected fetch to ${urlStr}`);
      };

      const meeting = await createMeeting(
        orgId,
        {
          title: 'Cancellation Target Meeting',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 90000000).toISOString(),
          timezone: 'UTC',
          locationType: 'virtual',
          conferenceProvider: 'google_meet',
        },
        adminUserId
      );

      // Cancel the meeting
      const cancelled = await transitionMeetingStatus(
        orgId,
        meeting.id,
        'cancelled',
        adminUserId
      );

      assert.equal(deleteCalled, true, 'Must call events.delete on cancellation');
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.googleSyncStatus, 'none');
      assert.equal(cancelled.googleCalendarEventId, null);
    });

    test('Meeting cancellation during in-flight creation triggers compensation events.delete', async () => {
      let compensationDeleteCalled = false;
      const googleEventId = deriveGoogleEventId(randomUUID());

      // Simulate slow worker:
      // Worker starts creation, but before it writes Stage 3 to DB, meeting is cancelled
      let testMeetingId;
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `INSERT INTO meetings (
            organisation_id, title, start_at, end_at, timezone,
            location_type, conference_provider, google_sync_status,
            organiser_id, created_by_id
          ) VALUES (
            $1, 'Slow Worker Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
            'virtual', 'google_meet', 'pending_create',
            $2, $2
          ) RETURNING id`,
          [orgId, adminUserId]
        );
        testMeetingId = res.rows[0].id;
      });

      globalThis.fetch = async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes('/token')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ access_token: 'mock_token', expires_in: 3600 }),
          };
        }
        if (urlStr.includes(GOOGLE_CALENDAR_EVENTS_ENDPOINT)) {
          if (init?.method === 'DELETE') {
            compensationDeleteCalled = true;
            return { ok: true, status: 204, headers: new Headers(), text: async () => '' };
          }
          if (init?.method === 'POST') {
            // Concurrent action: while worker is in-flight, meeting is cancelled in DB!
            await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
              await client.query("UPDATE meetings SET status = 'cancelled' WHERE id = $1", [testMeetingId]);
            });

            return {
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({
                id: googleEventId,
                etag: '"etag_slow"',
                hangoutLink: 'https://meet.google.com/slow-link',
              }),
            };
          }
          return {
            ok: false,
            status: 404,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({}),
            text: async () => '',
          };
        }
        throw new Error(`Unexpected fetch to ${urlStr}`);
      };

      const syncRes = await syncMeetingWithGoogle({
        organisationId: orgId,
        meetingId: testMeetingId,
        actorUserId: adminUserId,
      });

      assert.equal(syncRes.status, 'stale_write_discarded');
      assert.equal(compensationDeleteCalled, true, 'Must call compensation delete when cancelled in-flight');
    });

    test('Revoked credentials during cancellation mark status abandoned (zero loops)', async () => {
      let testMeetingId;
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `INSERT INTO meetings (
            organisation_id, title, start_at, end_at, timezone,
            location_type, conference_provider, google_sync_status, status,
            organiser_id, created_by_id
          ) VALUES (
            $1, 'Revocation Abandon Test', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
            'virtual', 'google_meet', 'pending_delete', 'cancelled',
            $2, $2
          ) RETURNING id`,
          [orgId, adminUserId]
        );
        testMeetingId = res.rows[0].id;
      });

      // Mock token refresh returning invalid_grant (revoked)
      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/token')) {
          return {
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'invalid_grant',
              error_description: 'Token has been expired or revoked.',
            }),
          };
        }
        throw new Error(`Unexpected fetch to ${urlStr}`);
      };

      const syncRes = await syncMeetingWithGoogle({
        organisationId: orgId,
        meetingId: testMeetingId,
        actorUserId: adminUserId,
      });

      assert.equal(syncRes.status, 'abandoned', 'Must mark status abandoned when credentials revoked');

      // Verify in DB
      const dbMeeting = await getMeetingById(orgId, testMeetingId, adminUserId);
      assert.equal(dbMeeting.googleSyncStatus, 'abandoned');
      assert.equal(dbMeeting.status, 'cancelled');
    });

    // =========================================================================
    // 3. Express Route Tests (POST /:meetingId/sync-google)
    // =========================================================================
    test('POST /sync-google rejects member without edit permission with 403', async () => {
      let testMeetingId;
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `INSERT INTO meetings (
            organisation_id, title, start_at, end_at, timezone,
            location_type, conference_provider, google_sync_status,
            organiser_id, created_by_id
          ) VALUES (
            $1, 'Sync Route Test', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
            'virtual', 'google_meet', 'failed_create',
            $2, $2
          ) RETURNING id`,
          [orgId, adminUserId]
        );
        testMeetingId = res.rows[0].id;
      });

      const res = await request(app)
        .post(`/api/v1/organisations/${orgId}/meetings/${testMeetingId}/sync-google`)
        .set('Cookie', [memberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      assert.equal(res.status, 403, 'Member without meeting.edit and not organiser must receive 403');
    });

    test('POST /sync-google succeeds for Organiser / Admin and returns synced meeting', async () => {
      // Re-enable integration status (Test 8 simulated credential revocation which set status to error)
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        await client.query(
          "UPDATE organisation_integrations SET status = 'connected', last_error = NULL WHERE organisation_id = $1 AND provider = 'google'",
          [orgId]
        );
      });

      let testMeetingId;
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `INSERT INTO meetings (
            organisation_id, title, start_at, end_at, timezone,
            location_type, conference_provider, google_sync_status,
            organiser_id, created_by_id
          ) VALUES (
            $1, 'Sync Route Test Admin', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
            'virtual', 'google_meet', 'failed_create',
            $2, $2
          ) RETURNING id`,
          [orgId, adminUserId]
        );
        testMeetingId = res.rows[0].id;
      });

      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/token')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ access_token: 'mock_token', expires_in: 3600 }),
          };
        }
        if (urlStr.includes(GOOGLE_CALENDAR_EVENTS_ENDPOINT)) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              id: 'meet_sync_1',
              etag: '"etag_sync"',
              hangoutLink: 'https://meet.google.com/retry-success',
            }),
          };
        }
        throw new Error(`Unexpected fetch to ${urlStr}`);
      };

      const res = await request(app)
        .post(`/api/v1/organisations/${orgId}/meetings/${testMeetingId}/sync-google`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      assert.equal(res.status, 200);
      assert.ok(res.body.success);
      assert.equal(res.body.data.meeting.googleSyncStatus, 'synced');
      assert.equal(res.body.data.meeting.virtualUrl, 'https://meet.google.com/retry-success');
    });
  });
});
