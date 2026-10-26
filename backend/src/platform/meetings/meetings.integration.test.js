/**
 * ManageX Integration Test Suite: Phase 7A — Meetings Core, Attendees & Agendas
 * Strictly tests PRD Section 8.1 (MTG-001, MTG-002, MTG-003, MTG-004), docs/security.md, and docs/architecture.md.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';
import { getTestMailbox, clearTestMailbox } from '../email/emailService.js';

describe('Phase 7 — Meetings Core, Minutes, Actions & Notifications Suite', () => {
  const runTag = `p7a_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let ownerUserId;
  let organiserUserId;
  let organiserUserEmail;
  let memberUserId;
  let memberUserEmail;
  let nonAttendeeUserId;
  let orgBUserId;

  let ownerCookie;
  let organiserCookie;
  let memberCookie;
  let nonAttendeeCookie;
  let orgBCookie;

  let csrfCookie;
  let csrfToken;

  let orgAId;
  let orgBId;
  let scheduledMeetingId;
  let attendeesOnlyMeetingId;
  let attendeeMemberId;
  let agendaItem1Id;
  let agendaItem2Id;

  before(async () => {
    // 1. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'] || [];
    const c = cookies.find((item) => item.startsWith(`${CSRF_COOKIE_NAME}=`));
    if (c) {
      csrfCookie = c.split(';')[0];
      csrfToken = csrfCookie.replace(`${CSRF_COOKIE_NAME}=`, '');
    }

    // 2. Create users
    const passwordHash = await hashPassword('SecurePassword123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
         VALUES 
           ('Meeting Owner', 'owner_${runTag}@managex.local', $1, 'active', NOW()),
           ('Meeting Organiser', 'organiser_${runTag}@managex.local', $1, 'active', NOW()),
           ('Meeting Member', 'member_${runTag}@managex.local', $1, 'active', NOW()),
           ('Non Attendee', 'nonatt_${runTag}@managex.local', $1, 'active', NOW()),
           ('Org B User', 'orgb_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [passwordHash]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email.startsWith('owner_')).id;
    const orgUser = users.find((u) => u.email.startsWith('organiser_'));
    organiserUserId = orgUser.id;
    organiserUserEmail = orgUser.email;
    const memUser = users.find((u) => u.email.startsWith('member_'));
    memberUserId = memUser.id;
    memberUserEmail = memUser.email;
    nonAttendeeUserId = users.find((u) => u.email.startsWith('nonatt_')).id;
    orgBUserId = users.find((u) => u.email.startsWith('orgb_')).id;

    // Create sessions
    const sessOwner = await createSession({ userId: ownerUserId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${sessOwner.rawToken}`;

    const sessOrg = await createSession({ userId: organiserUserId });
    organiserCookie = `${SESSION_COOKIE_NAME}=${sessOrg.rawToken}`;

    const sessMem = await createSession({ userId: memberUserId });
    memberCookie = `${SESSION_COOKIE_NAME}=${sessMem.rawToken}`;

    const sessNon = await createSession({ userId: nonAttendeeUserId });
    nonAttendeeCookie = `${SESSION_COOKIE_NAME}=${sessNon.rawToken}`;

    const sessB = await createSession({ userId: orgBUserId });
    orgBCookie = `${SESSION_COOKIE_NAME}=${sessB.rawToken}`;

    // 3. Create Org A and Org B
    const orgARes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Meetings Org A ${runTag}` });
    orgAId = orgARes.body.data.organisation.id;

    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Meetings Org B ${runTag}` });
    orgBId = orgBRes.body.data.organisation.id;

    // Enable Meetings module in Org A
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/meetings`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });

    // Add members to Org A
    await withSystemTransaction(async (client) => {
      for (const uid of [organiserUserId, memberUserId, nonAttendeeUserId]) {
        await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')
           ON CONFLICT DO NOTHING`,
          [orgAId, uid]
        );
      }

      // Grant meeting_organiser role to organiserUserId
      const roleRes = await client.query(
        `SELECT id FROM roles WHERE slug = 'meeting_organiser' AND organisation_id IS NULL`
      );
      if (roleRes.rows.length > 0) {
        const memRes = await client.query(
          `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
          [orgAId, organiserUserId]
        );
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [orgAId, memRes.rows[0].id, roleRes.rows[0].id]
        );
      }

      // Grant organisation_member role to memberUserId and nonAttendeeUserId
      const memberRoleRes = await client.query(
        `SELECT id FROM roles WHERE slug = 'organisation_member' AND organisation_id IS NULL`
      );
      if (memberRoleRes.rows.length > 0) {
        for (const uid of [memberUserId, nonAttendeeUserId]) {
          const mRes = await client.query(
            `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
            [orgAId, uid]
          );
          await client.query(
            `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [orgAId, mRes.rows[0].id, memberRoleRes.rows[0].id]
          );
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 1. MTG-001: Meeting Model & Creation Validation
  // ---------------------------------------------------------------------------

  it('1. MTG-001: Authorised organiser schedules a new meeting with valid IANA timezone and automatic organiser attendee', async () => {
    const startAt = new Date(Date.now() + 86400000).toISOString(); // tomorrow
    const endAt = new Date(Date.now() + 90000000).toISOString();

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Sprint Planning Q4',
        description: 'Quarterly roadmap discussion and backlog prioritization',
        startAt,
        endAt,
        timezone: 'America/New_York',
        locationType: 'hybrid',
        location: 'HQ Conference Room A',
        virtualUrl: 'https://meet.managex.local/sprint-q4',
        visibility: 'organisation',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.meeting.title, 'Sprint Planning Q4');
    assert.equal(res.body.data.meeting.status, 'scheduled');
    assert.equal(res.body.data.meeting.timezone, 'America/New_York');
    assert.equal(res.body.data.meeting.organiserId, organiserUserId);
    assert.equal(res.body.data.meeting.attendeeCount, 1); // Organiser auto-added
    scheduledMeetingId = res.body.data.meeting.id;
  });

  it('2. MTG-001: Scheduling a meeting where endAt is before startAt is rejected with 422', async () => {
    const startAt = new Date(Date.now() + 90000000).toISOString();
    const endAt = new Date(Date.now() + 86400000).toISOString(); // End before start

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Time Paradox Meeting',
        startAt,
        endAt,
        timezone: 'UTC',
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes('end time must be after the start time'));
  });

  it('3. MTG-001: Scheduling with invalid IANA timezone is rejected with 422', async () => {
    const startAt = new Date(Date.now() + 86400000).toISOString();
    const endAt = new Date(Date.now() + 90000000).toISOString();

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Bad Timezone Meeting',
        startAt,
        endAt,
        timezone: 'Invalid/Non_Existent_Zone',
      });

    assert.equal(res.status, 422);
    assert.ok(res.body.error.message.includes('Invalid IANA time-zone'));
  });

  it('4. MTG-001: Scheduling with non-member organiser is rejected with 422', async () => {
    const startAt = new Date(Date.now() + 86400000).toISOString();
    const endAt = new Date(Date.now() + 90000000).toISOString();

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Invalid Organiser Meeting',
        startAt,
        endAt,
        timezone: 'UTC',
        organiserId: orgBUserId, // User belongs to Org B, not Org A
      });

    assert.equal(res.status, 422);
    assert.ok(res.body.error.message.includes('Organiser must be an active member'));
  });

  // ---------------------------------------------------------------------------
  // 2. MTG-002: Canonical 4-Status Lifecycle & State Machine
  // ---------------------------------------------------------------------------

  it('5. MTG-002: Advance meeting through canonical statuses: scheduled -> in_progress -> completed', async () => {
    // 1. scheduled -> in_progress
    const res1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${scheduledMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    assert.equal(res1.status, 200);
    assert.equal(res1.body.data.meeting.status, 'in_progress');

    // 2. in_progress -> completed
    const res2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${scheduledMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });

    assert.equal(res2.status, 200);
    assert.equal(res2.body.data.meeting.status, 'completed');
  });

  it('6. MTG-002: Completed meeting is terminal; transitioning to any status fails with 409', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${scheduledMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_MEETING_STATUS_TRANSITION');
  });

  it('7. MTG-002: Completed meeting cannot be edited (409 MEETING_TERMINAL_STATE)', async () => {
    const res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${scheduledMeetingId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Attempted Title Edit' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'MEETING_TERMINAL_STATE');
  });

  it('8. MTG-002: Attempting to use non-existent "archived" status fails validation (422)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${scheduledMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'archived' });

    assert.equal(res.status, 422);
  });

  it('8a. Phase 1: Direct scheduled -> completed transition is rejected with 409', async () => {
    // Create a new scheduled meeting
    const startAt = new Date(Date.now() + 60000).toISOString();
    const endAt = new Date(Date.now() + 3600000).toISOString();
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Direct Complete Test',
        startAt,
        endAt,
        timezone: 'UTC',
      });
    assert.equal(createRes.status, 201);
    const testMeetingId = createRes.body.data.meeting.id;

    // Attempt direct transition to completed without being in_progress
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${testMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_MEETING_STATUS_TRANSITION');
  });

  it('8b. Phase 1: scheduled -> missed is rejected with 422 if end_at has not passed', async () => {
    // Meeting ends in the future
    const startAt = new Date(Date.now() + 60000).toISOString();
    const endAt = new Date(Date.now() + 3600000).toISOString();
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Future Meeting Missed Attempt',
        startAt,
        endAt,
        timezone: 'UTC',
      });
    assert.equal(createRes.status, 201);
    const futureMeetingId = createRes.body.data.meeting.id;

    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${futureMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'missed' });

    assert.equal(res.status, 422);
    assert.ok(res.body.error.message.includes('end time has passed'));
  });

  it('8c. Phase 1: scheduled -> missed succeeds when end_at is in the past, and missed is terminal', async () => {
    // Meeting ended in past
    const startAt = new Date(Date.now() - 7200000).toISOString();
    const endAt = new Date(Date.now() - 3600000).toISOString();
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Past Overdue Meeting',
        startAt,
        endAt,
        timezone: 'UTC',
      });
    assert.equal(createRes.status, 201);
    const pastMeetingId = createRes.body.data.meeting.id;

    // Transition to missed
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${pastMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'missed' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.meeting.status, 'missed');

    // Missed meeting is terminal: cannot transition further
    const nextRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${pastMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    assert.equal(nextRes.status, 409);
    assert.equal(nextRes.body.error.code, 'INVALID_MEETING_STATUS_TRANSITION');

    // Missed meeting cannot be edited
    const editRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${pastMeetingId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'New Title' });

    assert.equal(editRes.status, 409);
    assert.equal(editRes.body.error.code, 'MEETING_TERMINAL_STATE');
  });

  it('8d. Phase 1: Timezone normalization: Asia/Calcutta is stored as canonical Asia/Kolkata', async () => {
    const startAt = new Date(Date.now() + 60000).toISOString();
    const endAt = new Date(Date.now() + 3600000).toISOString();
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Kolkata Normalization Test',
        startAt,
        endAt,
        timezone: 'Asia/Calcutta',
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.data.meeting.timezone, 'Asia/Kolkata');
  });

  it('8e. Phase B: An overdue meeting (past end_at) retains its persisted status without automatic mutation until explicitly transitioned', async () => {
    const startAt = new Date(Date.now() - 7200000).toISOString();
    const endAt = new Date(Date.now() - 3600000).toISOString();

    // 1. Create a meeting whose end_at is in the past
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Non-Auto-Mutating Overdue Meeting',
        startAt,
        endAt,
        timezone: 'UTC',
      });

    assert.equal(createRes.status, 201);
    const mId = createRes.body.data.meeting.id;
    assert.equal(createRes.body.data.meeting.status, 'scheduled', 'Status must remain scheduled upon creation');

    // 2. Fetch the meeting: verify it has NOT automatically transitioned to missed or completed
    const getRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${mId}`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.meeting.status, 'scheduled', 'Overdue scheduled meeting must not auto-transition');

    // 3. Organiser starts the meeting -> in_progress
    const startRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${mId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    assert.equal(startRes.status, 200);
    assert.equal(startRes.body.data.meeting.status, 'in_progress');

    // 4. Fetch the in_progress meeting past end_at: verify status remains in_progress
    const getRes2 = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${mId}`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(getRes2.status, 200);
    assert.equal(getRes2.body.data.meeting.status, 'in_progress', 'Overdue in_progress meeting must not auto-transition');

    // 5. Explicit organiser completion succeeds (empty MoM does not block backend completion)
    const completeRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${mId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.data.meeting.status, 'completed');
  });

  it('8f. Phase C: Organiser-provided meeting links (Google Meet, Zoom) are preserved, private links are denied to unauthorised members, and terminal meetings reject edits', async () => {
    const startAt = new Date(Date.now() + 600000).toISOString();
    const endAt = new Date(Date.now() + 3600000).toISOString();
    const googleMeetUrl = 'https://meet.google.com/abc-defg-hij';

    // 1. Create a meeting with organiser-provided Google Meet link and attendees_only visibility
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Virtual Strategy Sync',
        startAt,
        endAt,
        timezone: 'UTC',
        locationType: 'virtual',
        virtualUrl: googleMeetUrl,
        visibility: 'attendees_only',
      });

    assert.equal(createRes.status, 201);
    const mId = createRes.body.data.meeting.id;
    assert.equal(createRes.body.data.meeting.virtualUrl, googleMeetUrl);

    // 2. Organiser can fetch the meeting and see the virtualUrl
    const getRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${mId}`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.meeting.virtualUrl, googleMeetUrl);

    // 3. Uninvited ordinary member cannot view attendees_only meeting (403 MEETING_ACCESS_DENIED)
    const deniedRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${mId}`)
      .set('Cookie', [nonAttendeeCookie, csrfCookie]);

    assert.equal(deniedRes.status, 403);
    assert.equal(deniedRes.body.error.code, 'MEETING_ACCESS_DENIED');

    // 4. Update meeting with Zoom URL while non-terminal succeeds
    const zoomUrl = 'https://zoom.us/j/1234567890';
    const updateRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${mId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ virtualUrl: zoomUrl });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.meeting.virtualUrl, zoomUrl);

    // 5. Advance meeting through lifecycle: in_progress -> completed (terminal)
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${mId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    const completeRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${mId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.data.meeting.status, 'completed');

    // 6. Fetching the completed meeting preserves historical virtualUrl
    const terminalGetRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${mId}`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(terminalGetRes.status, 200);
    assert.equal(terminalGetRes.body.data.meeting.virtualUrl, zoomUrl);

    // 7. Attempting to edit virtualUrl on terminal completed meeting is rejected (409)
    const editTerminalRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${mId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ virtualUrl: 'https://meet.google.com/new-link' });

    assert.equal(editTerminalRes.status, 409);
    assert.equal(editTerminalRes.body.error.code, 'MEETING_TERMINAL_STATE');
  });

  // ---------------------------------------------------------------------------
  // 3. MTG-003: Attendees & Visibility Controls
  // ---------------------------------------------------------------------------

  it('9. MTG-003: Create an "attendees_only" meeting; verify non-attendee ordinary member is denied access (403)', async () => {
    const startAt = new Date(Date.now() + 100000000).toISOString();
    const endAt = new Date(Date.now() + 105000000).toISOString();

    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Confidential Executive Sync',
        startAt,
        endAt,
        timezone: 'UTC',
        visibility: 'attendees_only',
      });

    assert.equal(createRes.status, 201);
    attendeesOnlyMeetingId = createRes.body.data.meeting.id;

    // Non-attendee attempts GET meeting detail -> 403
    const getRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}`)
      .set('Cookie', [nonAttendeeCookie, csrfCookie]);

    assert.equal(getRes.status, 403);
    assert.equal(getRes.body.error.code, 'MEETING_ACCESS_DENIED');

    // Non-attendee listing meetings should NOT see attendees_only meeting
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [nonAttendeeCookie, csrfCookie]);

    assert.equal(listRes.status, 200);
    const found = listRes.body.data.meetings.find((m) => m.id === attendeesOnlyMeetingId);
    assert.equal(found, undefined, 'Confidential attendees_only meeting must be hidden from non-attendees in list');
  });

  it('10. MTG-003: Add internal active member as attendee; verify duplicate internal attendee fails with 409', async () => {
    // 1. Add memberUserId as participant
    const addRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        userId: memberUserId,
        role: 'participant',
      });

    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.data.attendee.userId, memberUserId);
    assert.equal(addRes.body.data.attendee.rsvpStatus, 'pending');
    assert.equal(addRes.body.data.attendee.fullName, 'Meeting Member');
    assert.equal(addRes.body.data.attendee.userName, 'Meeting Member');
    assert.equal(addRes.body.data.attendee.email, memberUserEmail);
    assert.equal(addRes.body.data.attendee.userEmail, memberUserEmail);
    assert.equal(addRes.body.data.attendee.isExternal, false);
    attendeeMemberId = addRes.body.data.attendee.id;

    // 2. Duplicate internal attendee rejected with 409
    const dupRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        userId: memberUserId,
        role: 'participant',
      });

    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.body.error.code, 'ATTENDEE_ALREADY_EXISTS');

    // 3. Newly added attendee can now access the attendees_only meeting
    const memberGetRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(memberGetRes.status, 200);
    assert.equal(memberGetRes.body.data.meeting.id, attendeesOnlyMeetingId);
  });

  it('11. MTG-003: Add external email as attendee; duplicate external email fails with 409', async () => {
    const extEmail = 'guest.expert@advisory.example';

    const addRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        externalEmail: extEmail,
        role: 'guest',
      });

    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.data.attendee.externalEmail, extEmail);
    assert.equal(addRes.body.data.attendee.userId, null);
    assert.equal(addRes.body.data.attendee.fullName, null);
    assert.equal(addRes.body.data.attendee.userName, null);
    assert.equal(addRes.body.data.attendee.email, extEmail);
    assert.equal(addRes.body.data.attendee.userEmail, extEmail);
    assert.equal(addRes.body.data.attendee.isExternal, true);

    // Duplicate external email rejected
    const dupRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        externalEmail: extEmail,
        role: 'guest',
      });

    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.body.error.code, 'ATTENDEE_ALREADY_EXISTS');
  });

  it('12. MTG-003: Attendee updates own RSVP status (accepted / declined / tentative)', async () => {
    const rsvpRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/rsvp`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ rsvpStatus: 'accepted' });

    assert.equal(rsvpRes.status, 200);
    assert.equal(rsvpRes.body.data.rsvpStatus, 'accepted');
    assert.ok(rsvpRes.body.data.respondedAt);
  });

  it('13. MTG-003: Removing attendee revokes their access to attendees_only meeting on subsequent requests', async () => {
    const removeRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees/${attendeeMemberId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(removeRes.status, 200);

    // Member attempts to access meeting again -> 403 Forbidden
    const afterGetRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(afterGetRes.status, 403);
  });

  it('14. MTG-003: Attempting to remove sole meeting organiser fails with 409 CANNOT_REMOVE_ORGANISER', async () => {
    // Fetch organiser attendee row
    const attListRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    const orgAttendee = attListRes.body.data.attendees.find((a) => a.userId === organiserUserId);
    assert.ok(orgAttendee, 'Expected organiser attendee row to exist');

    const removeRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees/${orgAttendee.id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(removeRes.status, 409);
    assert.equal(removeRes.body.error.code, 'CANNOT_REMOVE_ORGANISER');
  });

  it('14b. Phase A: GET meeting attendees returns canonical fullName, email, and backward-compatible aliases userName, userEmail', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(listRes.status, 200);
    const attendees = listRes.body.data.attendees;
    assert.ok(Array.isArray(attendees));

    const orgAtt = attendees.find((a) => a.userId === organiserUserId);
    assert.ok(orgAtt, 'Organiser attendee must be present');
    assert.equal(orgAtt.fullName, 'Meeting Organiser');
    assert.equal(orgAtt.userName, 'Meeting Organiser');
    assert.equal(orgAtt.email, organiserUserEmail);
    assert.equal(orgAtt.userEmail, organiserUserEmail);
    assert.equal(orgAtt.isExternal, false);

    const extAtt = attendees.find((a) => a.externalEmail === 'guest.expert@advisory.example');
    assert.ok(extAtt, 'External attendee must be present');
    assert.equal(extAtt.fullName, null);
    assert.equal(extAtt.userName, null);
    assert.equal(extAtt.email, 'guest.expert@advisory.example');
    assert.equal(extAtt.userEmail, 'guest.expert@advisory.example');
    assert.equal(extAtt.externalEmail, 'guest.expert@advisory.example');
    assert.equal(extAtt.isExternal, true);
  });

  // ---------------------------------------------------------------------------
  // 4. MTG-004: Ordered Agenda Management
  // ---------------------------------------------------------------------------

  it('15. MTG-004: Create ordered agenda items and verify order index persistence', async () => {
    // Agenda item 1
    const res1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/agenda`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Welcome & Executive Summary',
        description: 'Opening remarks by CEO',
        durationMinutes: 15,
        orderIndex: 0,
      });

    assert.equal(res1.status, 201);
    assert.equal(res1.body.data.agendaItem.title, 'Welcome & Executive Summary');
    agendaItem1Id = res1.body.data.agendaItem.id;

    // Agenda item 2
    const res2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/agenda`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Financial Q3 Review',
        description: 'P&L analysis and variance report',
        durationMinutes: 30,
        orderIndex: 1,
      });

    assert.equal(res2.status, 201);
    agendaItem2Id = res2.body.data.agendaItem.id;

    // List agenda items
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/agenda`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.agendaItems.length, 2);
    assert.equal(listRes.body.data.agendaItems[0].id, agendaItem1Id);
    assert.equal(listRes.body.data.agendaItems[1].id, agendaItem2Id);
  });

  it('16. MTG-004: Reorder agenda items atomically via PUT /agenda/reorder', async () => {
    // Swap item 2 and item 1
    const reorderRes = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/agenda/reorder`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ itemIds: [agendaItem2Id, agendaItem1Id] });

    assert.equal(reorderRes.status, 200);

    // Verify updated order
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/agenda`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.agendaItems[0].id, agendaItem2Id);
    assert.equal(listRes.body.data.agendaItems[0].orderIndex, 0);
    assert.equal(listRes.body.data.agendaItems[1].id, agendaItem1Id);
    assert.equal(listRes.body.data.agendaItems[1].orderIndex, 1);
  });

  it('17. MTG-004: Update and delete agenda items', async () => {
    // Update item 1
    const updateRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/agenda/${agendaItem1Id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Updated Opening Remarks', durationMinutes: 20 });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.agendaItem.title, 'Updated Opening Remarks');
    assert.equal(updateRes.body.data.agendaItem.durationMinutes, 20);

    // Delete item 1
    const delRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/agenda/${agendaItem1Id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(delRes.status, 200);

    // Verify remaining count
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/agenda`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(listRes.body.data.agendaItems.length, 1);
  });

  it('18. MTG-004: List meetings with status and timeframe filters', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings?status=scheduled&timeframe=upcoming`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.meetings));
    assert.ok(res.body.meta.pagination);
    assert.ok(res.body.data.meetings.every((m) => m.status === 'scheduled'));
  });

  // ---------------------------------------------------------------------------
  // 5. Cross-Cutting & Security Invariants
  // ---------------------------------------------------------------------------

  it('19. MOD-004: Deactivating meetings module blocks meetings endpoints with 403 MODULE_DISABLED', async () => {
    // Disable meetings module
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/meetings`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: false });

    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'MODULE_DISABLED');

    // Re-enable module for subsequent tests
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/meetings`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });
  });

  it('20. AUD-001: Meeting lifecycle, attendees, and agenda mutations generate immutable audit logs', async () => {
    const auditRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(auditRes.status, 200);
    const logs = auditRes.body.data.auditLogs || auditRes.body.data.logs;

    const createLog = logs.find((l) => l.action === 'meeting.created');
    assert.ok(createLog, 'Expected meeting.created audit record');

    const statusLog = logs.find((l) => l.action === 'meeting.status_changed');
    assert.ok(statusLog, 'Expected meeting.status_changed audit record');

    const attLog = logs.find((l) => l.action === 'meeting.attendee.added');
    assert.ok(attLog, 'Expected meeting.attendee.added audit record');

    const agendaLog = logs.find((l) => l.action === 'meeting.agenda.created');
    assert.ok(agendaLog, 'Expected meeting.agenda.created audit record');
  });

  it('21. RBAC-007 & Tenant Isolation: User in Org B cannot read or mutate meetings in Org A', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}`)
      .set('Cookie', [orgBCookie, csrfCookie]);

    assert.equal(res.status, 403);
  });

  // ---------------------------------------------------------------------------
  // Phase 7B Tests: MTG-005 Confidential Minutes
  // ---------------------------------------------------------------------------

  let notesMeetingId;

  it('22. MTG-005: Setup dedicated meeting for confidential minutes and action items', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: `Phase 7B Strategy Session ${runTag}`,
        description: 'Reviewing confidential company roadmaps and executive action items.',
        startAt: '2026-11-20T14:00:00.000Z',
        endAt: '2026-11-20T15:30:00.000Z',
        timezone: 'UTC',
        locationType: 'virtual',
        virtualUrl: 'https://meet.managex.local/room/strat-7b',
        visibility: 'organisation',
      });

    assert.equal(res.status, 201);
    notesMeetingId = res.body.data.meeting.id;
    assert.ok(notesMeetingId);

    // Add memberUserId as participant attendee
    const attRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ userId: memberUserId, role: 'participant' });

    assert.equal(attRes.status, 201);
  });

  it('23. MTG-005: Non-organiser attendee without permission is denied confidential minutes access (403 FORBIDDEN_NOTES_ACCESS)', async () => {
    // Attempt to read notes
    const readRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/notes`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(readRes.status, 403);
    assert.equal(readRes.body.error.code, 'FORBIDDEN_NOTES_ACCESS');

    // Attempt to upsert notes
    const writeRes = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/notes`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ content: 'Unauthorised participant notes' });

    assert.equal(writeRes.status, 403);
    assert.equal(writeRes.body.error.code, 'FORBIDDEN_NOTES_MANAGE');
  });

  it('24. MTG-005: Organiser can author/upsert confidential minutes; Org Owner can read; audit log excludes note content', async () => {
    const secretContent = 'Executive deliberations: Q4 budget allocation of $500,000 for European expansion.';

    // Organiser upserts notes
    const upsertRes = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/notes`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ content: secretContent });

    assert.equal(upsertRes.status, 200);
    assert.ok(upsertRes.body.data.notes);
    assert.equal(upsertRes.body.data.notes.content, secretContent);
    assert.equal(upsertRes.body.data.notes.createdById, organiserUserId);

    // Org Owner reads notes
    const ownerReadRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/notes`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(ownerReadRes.status, 200);
    assert.equal(ownerReadRes.body.data.notes.content, secretContent);

    // Verify audit log has metadata.length and NOT the secret content
    const auditRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(auditRes.status, 200);
    const logs = auditRes.body.data.auditLogs || auditRes.body.data.logs;
    const noteLog = logs.find(
      (l) => l.action === 'meeting.notes_updated' && l.metadata?.meetingId === notesMeetingId
    );

    assert.ok(noteLog, 'Expected meeting.notes_updated audit entry');
    assert.equal(noteLog.metadata.length, secretContent.length);
    assert.equal(typeof noteLog.metadata.content, 'undefined');
    assert.ok(!JSON.stringify(noteLog.metadata).includes('budget allocation'));
  });

  it('25. MTG-005: Cancelled meeting cannot edit notes (409 MEETING_CANCELLED)', async () => {
    // Create a meeting and cancel it
    const cancelMeetRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: `Cancelled Meeting for Notes Test ${runTag}`,
        startAt: '2026-11-21T10:00:00.000Z',
        endAt: '2026-11-21T11:00:00.000Z',
        timezone: 'UTC',
      });
    const cMeetingId = cancelMeetRes.body.data.meeting.id;

    await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${cMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'cancelled' });

    // Attempt upsert notes
    const res = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${cMeetingId}/notes`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ content: 'Notes for cancelled meeting' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'MEETING_CANCELLED');
  });

  // ---------------------------------------------------------------------------
  // Phase 7B Tests: MTG-006 Action Items
  // ---------------------------------------------------------------------------

  let actionItemId;

  it('26. MTG-006: Organiser creates action item assigned to active member; invalid assignee is rejected with 422', async () => {
    // Invalid assignee
    const badRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Review Budget Spreadsheet',
        assigneeId: '00000000-0000-0000-0000-000000000099',
        priority: 'high',
        dueDate: '2026-11-25',
      });

    assert.equal(badRes.status, 422);
    assert.equal(badRes.body.error.code, 'VALIDATION_ERROR');
    assert.ok(badRes.body.error.message.includes('active organisation member'));

    // Valid creation
    const okRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Finalise Q4 Strategy Proposal',
        description: 'Incorporate board feedback and send final deck to members.',
        assigneeId: memberUserId,
        dueDate: '2026-11-25',
        priority: 'high',
      });

    assert.equal(okRes.status, 201);
    const item = okRes.body.data.actionItem;
    assert.ok(item);
    assert.equal(item.title, 'Finalise Q4 Strategy Proposal');
    assert.equal(item.assigneeId, memberUserId);
    assert.equal(item.status, 'open');
    assert.equal(item.priority, 'high');
    actionItemId = item.id;
  });

  it('27. MTG-006: Assignee can advance status (open -> in_progress -> done)', async () => {
    // Member advances to in_progress
    const progRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items/${actionItemId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    assert.equal(progRes.status, 200);
    assert.equal(progRes.body.data.actionItem.status, 'in_progress');

    // Member marks as done
    const doneRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items/${actionItemId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'done' });

    assert.equal(doneRes.status, 200);
    assert.equal(doneRes.body.data.actionItem.status, 'done');
  });

  it('28. MTG-006: Terminal action item state is locked (409 ACTION_ITEM_TERMINAL_STATE); assignee cannot mutate manager fields (403)', async () => {
    // Attempt transition out of done
    const termRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items/${actionItemId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'open' });

    assert.equal(termRes.status, 409);
    assert.equal(termRes.body.error.code, 'ACTION_ITEM_TERMINAL_STATE');

    // Create a new action item in open status
    const newRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Draft Marketing Deck',
        assigneeId: memberUserId,
        priority: 'medium',
      });
    const newItemId = newRes.body.data.actionItem.id;

    // Assignee attempts to modify title (management field)
    const hijackRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items/${newItemId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Hijacked Title by Member' });

    assert.equal(hijackRes.status, 403);
    assert.equal(hijackRes.body.error.code, 'FORBIDDEN_ACTION_FIELD_UPDATE');

    // Organiser can edit title and priority
    const editRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items/${newItemId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Authorised Edit by Organiser', priority: 'urgent' });

    assert.equal(editRes.status, 200);
    assert.equal(editRes.body.data.actionItem.title, 'Authorised Edit by Organiser');
    assert.equal(editRes.body.data.actionItem.priority, 'urgent');

    // Organiser deletes the action item
    const delRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items/${newItemId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(delRes.status, 200);

    // Verify list does not contain deleted item
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(listRes.status, 200);
    const found = listRes.body.data.actionItems.find((i) => i.id === newItemId);
    assert.equal(found, undefined);
  });

  // ---------------------------------------------------------------------------
  // Phase 7B Tests: MTG-007 Email Notifications & Invitations
  // ---------------------------------------------------------------------------

  it('29. MTG-007: Organiser sends meeting invitations; captured in dev/test mailbox', async () => {
    clearTestMailbox();

    const inviteRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/send-invites`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({});

    assert.equal(inviteRes.status, 200);
    assert.ok(inviteRes.body.data.sentCount >= 1);

    const mailbox = getTestMailbox();
    assert.ok(mailbox.length >= 1);
    const inviteMail = mailbox.find((m) => m.subject.includes('Meeting Invitation:'));
    assert.ok(inviteMail, 'Expected invitation email in test mailbox');
    assert.ok(inviteMail.text.includes(notesMeetingId) || inviteMail.text.includes('Phase 7B Strategy Session'));
  });

  it('30. MTG-007: Rescheduling and cancelling meeting automatically sends email notifications to attendees', async () => {
    clearTestMailbox();

    // 1. Reschedule meeting (change startAt/endAt)
    const patchRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        startAt: '2026-11-22T16:00:00.000Z',
        endAt: '2026-11-22T17:30:00.000Z',
      });

    assert.equal(patchRes.status, 200);

    const mailboxAfterReschedule = getTestMailbox();
    const rescheduleMail = mailboxAfterReschedule.find((m) => m.subject.includes('Updated:'));
    assert.ok(rescheduleMail, 'Expected meeting updated notification email');

    // 2. Cancel meeting
    clearTestMailbox();
    const cancelRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${notesMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'cancelled' });

    assert.equal(cancelRes.status, 200);

    const mailboxAfterCancel = getTestMailbox();
    const cancelMail = mailboxAfterCancel.find((m) => m.subject.includes('Cancelled:'));
    assert.ok(cancelMail, 'Expected meeting cancelled notification email');
  });

  // ---------------------------------------------------------------------------
  // 7. Phase 2 (Roadmap ?6): MOM Enhancement ? Decision Linking, Action Items v2 & Promotion
  // ---------------------------------------------------------------------------

  let p2MeetingId;
  let p2DecisionId;
  let p2ActionItemId;
  let p2ProjectId;

  it('31. Phase 2: Action Item created with decisionId linking; rejects cross-meeting decision (422)', async () => {
    // 1. Create a fresh meeting
    const meetRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Phase 2 Architecture Review',
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 90000000).toISOString(),
        timezone: 'Asia/Kolkata',
      });
    assert.equal(meetRes.status, 201);
    p2MeetingId = meetRes.body.data.meeting.id;

    // 2. Create a decision in this meeting
    const decRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${p2MeetingId}/decisions`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Adopt PostgreSQL composite FKs',
        details: 'Enforce database integrity for decision links.',
      });
    assert.equal(decRes.status, 201);
    p2DecisionId = decRes.body.data.decision.id;

    // 3. Attempt to link an invalid decisionId (random UUID)
    const invalidRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${p2MeetingId}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Invalid decision link attempt',
        assigneeId: memberUserId,
        priority: 'high',
        decisionId: '00000000-0000-0000-0000-000000000000',
      });
    assert.equal(invalidRes.status, 422);
    assert.equal(invalidRes.body.error.code, 'VALIDATION_ERROR');
    assert.ok(invalidRes.body.error.message.includes('decision'));

    // 4. Create action item with valid decision link
    const actionRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${p2MeetingId}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Implement composite FK migration',
        description: 'Add migration 039 to enforce decision_id composite foreign key',
        assigneeId: memberUserId,
        priority: 'urgent',
        decisionId: p2DecisionId,
      });
    assert.equal(actionRes.status, 201);
    p2ActionItemId = actionRes.body.data.actionItem.id;
    assert.equal(actionRes.body.data.actionItem.decisionId, p2DecisionId);
    assert.equal(actionRes.body.data.actionItem.status, 'open');
  });

  it('32. Phase 2: Deleting source decision triggers ON DELETE SET NULL on linked action items', async () => {
    // Delete the decision
    const delRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/meetings/${p2MeetingId}/decisions/${p2DecisionId}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);
    assert.equal(delRes.status, 200);

    // Verify action item still exists, but decisionId is set to null
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${p2MeetingId}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie]);
    assert.equal(listRes.status, 200);

    const item = listRes.body.data.actionItems.find((a) => a.id === p2ActionItemId);
    assert.ok(item, 'Action item must be preserved after decision deletion');
    assert.equal(item.decisionId, null, 'decisionId must be set to null via ON DELETE SET NULL');
    assert.equal(item.decisionTitle, null);
  });

  it('33. Phase 2: Promote action item to Projects task with status mapping and idempotency', async () => {
    // 1. Explicitly disable projects module for Org A to test module entitlement gate
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: false });

    // Promotion fails if projects module is disabled
    const failModuleRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${p2MeetingId}/action-items/${p2ActionItemId}/promote-to-task`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ projectId: '00000000-0000-0000-0000-000000000000' });
    assert.equal(failModuleRes.status, 403);
    assert.equal(failModuleRes.body.error.code, 'MODULE_DISABLED');

    // 2. Enable projects module for Org A
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });

    // 3. Create a project in Org A via database helper
    await withSystemTransaction(async (client) => {
      const projRes = await client.query(
        `INSERT INTO projects (organisation_id, name, description, status, owner_id, created_by_id)
         VALUES ($1, 'Core Platform Q4', 'Platform roadmap project', 'active', $2, $2)
         RETURNING id`,
        [orgAId, ownerUserId]
      );
      p2ProjectId = projRes.rows[0].id;
    });

    // 4. Promote action item to project task
    const promoteRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${p2MeetingId}/action-items/${p2ActionItemId}/promote-to-task`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ projectId: p2ProjectId });

    assert.equal(promoteRes.status, 200);
    assert.equal(promoteRes.body.data.alreadyPromoted, false);
    assert.ok(promoteRes.body.data.task.id);
    assert.equal(promoteRes.body.data.task.status, 'todo', 'Action item open maps to task todo');
    assert.equal(promoteRes.body.data.actionItem.projectTaskId, promoteRes.body.data.task.id);

    // 5. Idempotent retry: promoting again returns existing task
    const retryRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${p2MeetingId}/action-items/${p2ActionItemId}/promote-to-task`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ projectId: p2ProjectId });

    assert.equal(retryRes.status, 200);
    assert.equal(retryRes.body.data.alreadyPromoted, true);
    assert.equal(retryRes.body.data.task.id, promoteRes.body.data.task.id);
  });

  it('34. Phase 2: Organisation Action Items (GET /action-items): role scoping & filters', async () => {
    // 1. Member view: ordinary member sees only their own action items
    const memberRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/action-items`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(memberRes.status, 200);
    const memberItems = memberRes.body.data.actionItems;
    assert.ok(memberItems.length > 0);
    for (const item of memberItems) {
      assert.equal(item.assigneeId, memberUserId, 'Ordinary member must only see items assigned to them');
    }

    // 2. Owner/Manager view: can see all items, filter by status, priority, timeframe
    const allRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/action-items?status=open&priority=urgent`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(allRes.status, 200);
    const allItems = allRes.body.data.actionItems;
    assert.ok(allItems.length > 0);
    const foundP2 = allItems.find((a) => a.id === p2ActionItemId);
    assert.ok(foundP2, 'Created action item must be visible in organization action items view');
    assert.ok(allRes.body.data.pagination);
    assert.equal(allRes.body.data.pagination.page, 1);
  });

});
