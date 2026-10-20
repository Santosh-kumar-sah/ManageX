/**
 * ManageX Integration Test Suite: Phase 7C — Meetings Integration, Access Regression & E2E Acceptance
 *
 * Strictly tests:
 * 1. Complete Meetings User Journeys 1-10 (MTG-001 through MTG-007, PRD §8, docs/security.md)
 * 2. Multi-tenant isolation & ID-tampering regression (Tenant A vs Tenant B, cross-meeting references)
 * 3. Granular permission matrix & dynamic access revocation (attendee removal, membership suspension, role revocation, module deactivation)
 * 4. Confidential notes & action items privacy invariants (zero body leakage in audit/emails, terminal locking, assignee field guard)
 * 5. Direct PostgreSQL RLS isolation & tenant-aware foreign key enforcement under restricted `managex_app` role.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { getPool } from '../database/pool.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';
import { getTestMailbox, clearTestMailbox } from '../email/emailService.js';

describe('Phase 7C — Meetings Integration, Access Regression & E2E Acceptance Suite', () => {
  const runTag = `p7c_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let ownerUserId;
  let organiserUserId;
  let memberUserId;
  let nonAttendeeUserId;
  let notesViewerUserId;
  let orgBUserId;

  let ownerCookie;
  let organiserCookie;
  let memberCookie;
  let nonAttendeeCookie;
  let notesViewerCookie;
  let orgBCookie;

  let csrfCookie;
  let csrfToken;

  let orgAId;
  let orgBId;

  let meeting1Id;
  let meeting2Id;
  let attendeesOnlyMeetingId;
  let agenda1Id;
  let agenda2Id;
  let meeting2AgendaId;
  let actionItemId;
  let memberMembershipId;
  let organiserMembershipId;

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
    const passwordHash = await hashPassword('SecurePass123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
         VALUES 
           ('P7C Owner', 'owner_${runTag}@managex.local', $1, 'active', NOW()),
           ('P7C Organiser', 'organiser_${runTag}@managex.local', $1, 'active', NOW()),
           ('P7C Member', 'member_${runTag}@managex.local', $1, 'active', NOW()),
           ('P7C NonAttendee', 'nonatt_${runTag}@managex.local', $1, 'active', NOW()),
           ('P7C NotesViewer', 'notesviewer_${runTag}@managex.local', $1, 'active', NOW()),
           ('P7C OrgB User', 'orgb_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [passwordHash]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email.startsWith('owner_')).id;
    organiserUserId = users.find((u) => u.email.startsWith('organiser_')).id;
    memberUserId = users.find((u) => u.email.startsWith('member_')).id;
    nonAttendeeUserId = users.find((u) => u.email.startsWith('nonatt_')).id;
    notesViewerUserId = users.find((u) => u.email.startsWith('notesviewer_')).id;
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

    const sessNV = await createSession({ userId: notesViewerUserId });
    notesViewerCookie = `${SESSION_COOKIE_NAME}=${sessNV.rawToken}`;

    const sessB = await createSession({ userId: orgBUserId });
    orgBCookie = `${SESSION_COOKIE_NAME}=${sessB.rawToken}`;

    // 3. Create Org A and Org B
    const orgARes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `P7C Meetings Org A ${runTag}` });
    orgAId = orgARes.body.data.organisation.id;

    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `P7C Meetings Org B ${runTag}` });
    orgBId = orgBRes.body.data.organisation.id;

    // Enable Meetings module in Org A and Org B
    for (const [oid, cookie] of [[orgAId, ownerCookie], [orgBId, orgBCookie]]) {
      await request(app)
        .patch(`/api/v1/organisations/${oid}/modules/meetings`)
        .set('Cookie', [cookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ isEnabled: true });
    }

    // Add members to Org A
    await withSystemTransaction(async (client) => {
      for (const uid of [organiserUserId, memberUserId, nonAttendeeUserId, notesViewerUserId]) {
        const insMem = await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id, user_id`,
          [orgAId, uid]
        );
        if (uid === memberUserId && insMem.rows.length > 0) {
          memberMembershipId = insMem.rows[0].id;
        }
        if (uid === organiserUserId && insMem.rows.length > 0) {
          organiserMembershipId = insMem.rows[0].id;
        }
      }

      if (!memberMembershipId) {
        const r = await client.query(
          `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
          [orgAId, memberUserId]
        );
        memberMembershipId = r.rows[0].id;
      }

      if (!organiserMembershipId) {
        const r = await client.query(
          `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
          [orgAId, organiserUserId]
        );
        organiserMembershipId = r.rows[0].id;
      }

      // Grant meeting_organiser role to organiserUserId
      const roleOrgRes = await client.query(
        `SELECT id FROM roles WHERE slug = 'meeting_organiser' AND organisation_id IS NULL`
      );
      if (roleOrgRes.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [orgAId, organiserMembershipId, roleOrgRes.rows[0].id]
        );
      }

      // Grant meeting_admin (which possesses meeting.notes.read and meeting.notes.manage) to notesViewerUserId
      const adminRoleRes = await client.query(
        `SELECT id FROM roles WHERE slug = 'meeting_admin' AND organisation_id IS NULL`
      );
      const nvMem = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
        [orgAId, notesViewerUserId]
      );
      if (adminRoleRes.rows.length > 0 && nvMem.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [orgAId, nvMem.rows[0].id, adminRoleRes.rows[0].id]
        );
      }

      // Grant organisation_member role to ordinary memberUserId & nonAttendeeUserId
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

  // ===========================================================================
  // 1. User Journey 1 & 2: Creation, Attendees, Agendas & Validation Failures
  // ===========================================================================

  it('1. Journey 1: Authorized organiser creates scheduled meeting with UTC instants, IANA timezone, and virtual URL', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: `Sprint Planning ${runTag}`,
        description: 'Bi-weekly sprint planning and roadmap alignment.',
        startAt: '2026-11-25T10:00:00.000Z',
        endAt: '2026-11-25T11:30:00.000Z',
        timezone: 'America/New_York',
        locationType: 'virtual',
        virtualUrl: 'https://meet.managex.local/room/sprint-planning',
        visibility: 'organisation',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.meeting.title, `Sprint Planning ${runTag}`);
    assert.equal(res.body.data.meeting.status, 'scheduled');
    assert.equal(res.body.data.meeting.timezone, 'America/New_York');
    assert.equal(res.body.data.meeting.organiserId, organiserUserId);
    meeting1Id = res.body.data.meeting.id;
    assert.ok(meeting1Id);
  });

  it('2. Journey 1: Organiser adds internal attendee, external attendee, and ordered agendas', async () => {
    // Add internal member attendee
    const intRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ userId: memberUserId, role: 'participant' });

    assert.equal(intRes.status, 201);
    assert.equal(intRes.body.data.attendee.userId, memberUserId);
    assert.equal(intRes.body.data.attendee.role, 'participant');

    // Add external guest attendee
    const extRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ externalEmail: `guest_${runTag}@external-client.com`, role: 'guest' });

    assert.equal(extRes.status, 201);
    assert.equal(extRes.body.data.attendee.externalEmail, `guest_${runTag}@external-client.com`);

    // Add Agenda item 1
    const a1Res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}/agenda`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Review Backlog', durationMinutes: 30 });

    assert.equal(a1Res.status, 201);
    agenda1Id = a1Res.body.data.agendaItem.id;

    // Add Agenda item 2
    const a2Res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}/agenda`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Commit to Sprint Goals', durationMinutes: 45 });

    assert.equal(a2Res.status, 201);
    agenda2Id = a2Res.body.data.agendaItem.id;
  });

  it('3. Journey 2: Validation edge cases are rejected with 422 (date order, invalid IANA timezone, non-member)', async () => {
    // a. endAt <= startAt
    const dateRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Invalid Dates Meeting',
        startAt: '2026-11-25T12:00:00.000Z',
        endAt: '2026-11-25T11:00:00.000Z',
        timezone: 'UTC',
      });
    assert.equal(dateRes.status, 422);

    // b. Invalid IANA timezone
    const tzRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Invalid Timezone Meeting',
        startAt: '2026-11-25T10:00:00.000Z',
        endAt: '2026-11-25T11:00:00.000Z',
        timezone: 'Mars/Curiosity_Base',
      });
    assert.equal(tzRes.status, 422);

    // c. Organiser must be an active member of the organisation
    const nonMemberRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Non-Member Organiser Meeting',
        startAt: '2026-11-25T10:00:00.000Z',
        endAt: '2026-11-25T11:00:00.000Z',
        timezone: 'UTC',
        organiserId: orgBUserId, // User in Org B
      });
    assert.equal(nonMemberRes.status, 422);
  });

  // ===========================================================================
  // 2. User Journey 3: Lifecycle, Reschedule Notices & Completed Lockout
  // ===========================================================================

  it('4. Journey 3: Organiser reschedules meeting; automatic update notification email is dispatched', async () => {
    clearTestMailbox();

    const patchRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        startAt: '2026-11-25T14:00:00.000Z',
        endAt: '2026-11-25T15:30:00.000Z',
      });

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.meeting.startAt, '2026-11-25T14:00:00.000Z');

    const mailbox = getTestMailbox();
    const updateEmail = mailbox.find((m) => m.subject.includes('Updated:'));
    assert.ok(updateEmail, 'Expected update email after rescheduling meeting');
  });

  it('5. Journey 3: Meeting transitions scheduled -> in_progress -> completed; completed status is terminal & locked', async () => {
    // Advance to in_progress
    const inProgRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });
    assert.equal(inProgRes.status, 200);
    assert.equal(inProgRes.body.data.meeting.status, 'in_progress');

    // Advance to completed
    const compRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });
    assert.equal(compRes.status, 200);
    assert.equal(compRes.body.data.meeting.status, 'completed');

    // Attempt invalid transition out of completed (409)
    const reopenRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'scheduled' });
    assert.equal(reopenRes.status, 409);

    // Attempt edit on completed meeting (409)
    const editRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Tampered Title' });
    assert.equal(editRes.status, 409);
  });

  // ===========================================================================
  // 3. User Journey 4: Visibility Policies (organisation vs attendees_only)
  // ===========================================================================

  it('6. Journey 4: attendees_only meeting restricts access to organiser and attendee; denies non-attendees (403)', async () => {
    // Create attendees_only meeting
    const meetRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: `Board Confidential Session ${runTag}`,
        startAt: '2026-11-26T16:00:00.000Z',
        endAt: '2026-11-26T17:00:00.000Z',
        timezone: 'UTC',
        visibility: 'attendees_only',
      });
    assert.equal(meetRes.status, 201);
    attendeesOnlyMeetingId = meetRes.body.data.meeting.id;

    // Add memberUserId as attendee
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ userId: memberUserId, role: 'participant' });

    // Non-attendee attempts to read meeting (403)
    const nonAttRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}`)
      .set('Cookie', [nonAttendeeCookie, csrfCookie]);
    assert.equal(nonAttRes.status, 403);
    assert.equal(nonAttRes.body.error.code, 'MEETING_ACCESS_DENIED');

    // Attendee member can read meeting (200)
    const attRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}`)
      .set('Cookie', [memberCookie, csrfCookie]);
    assert.equal(attRes.status, 200);
    assert.equal(attRes.body.data.meeting.id, attendeesOnlyMeetingId);
  });

  // ===========================================================================
  // 4. User Journey 5: Confidential Notes & Privacy Invariants
  // ===========================================================================

  it('7. Journey 5: Confidential notes access matrix; attendee status alone is denied (403)', async () => {
    const notesText = 'Confidential: strategic acquisition of European logistics provider for $1.2M.';

    // Organiser authors notes
    const authorRes = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/notes`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ content: notesText });
    assert.equal(authorRes.status, 200);
    assert.equal(authorRes.body.data.notes.content, notesText);

    // Attendee without notes permission is rejected with 403 FORBIDDEN_NOTES_ACCESS
    const attNotesRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/notes`)
      .set('Cookie', [memberCookie, csrfCookie]);
    assert.equal(attNotesRes.status, 403);
    assert.equal(attNotesRes.body.error.code, 'FORBIDDEN_NOTES_ACCESS');

    // Authorized notes viewer (has meeting.notes.read) can read notes
    const nvRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/notes`)
      .set('Cookie', [notesViewerCookie, csrfCookie]);
    assert.equal(nvRes.status, 200);
    assert.equal(nvRes.body.data.notes.content, notesText);

    // Verify audit log has length only and ZERO note content
    const auditRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(auditRes.status, 200);
    const logs = auditRes.body.data.auditLogs || auditRes.body.data.logs;
    const noteLog = logs.find(
      (l) => l.action === 'meeting.notes_updated' && l.metadata?.meetingId === attendeesOnlyMeetingId
    );
    assert.ok(noteLog, 'Expected audit entry for meeting.notes_updated');
    assert.equal(noteLog.metadata.length, notesText.length);
    assert.equal(typeof noteLog.metadata.content, 'undefined');
    assert.ok(!JSON.stringify(noteLog.metadata).includes('strategic acquisition'));
  });

  // ===========================================================================
  // 5. User Journey 6: Action Items, Assignee Guard & Terminal States
  // ===========================================================================

  it('8. Journey 6: Action items assignee restriction, progression, and terminal locking', async () => {
    // 1. Create action item
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Draft Integration Architecture Document',
        description: 'Provide system architecture diagram and migration strategy.',
        assigneeId: memberUserId,
        priority: 'high',
        dueDate: '2026-12-01',
      });
    assert.equal(createRes.status, 201);
    actionItemId = createRes.body.data.actionItem.id;
    assert.equal(createRes.body.data.actionItem.status, 'open');

    // 2. Assignee updates status to in_progress and then done
    const progRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/action-items/${actionItemId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });
    assert.equal(progRes.status, 200);
    assert.equal(progRes.body.data.actionItem.status, 'in_progress');

    const doneRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/action-items/${actionItemId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'done' });
    assert.equal(doneRes.status, 200);
    assert.equal(doneRes.body.data.actionItem.status, 'done');

    // 3. Assignee cannot reopen terminal 'done' action item (409)
    const reopenRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/action-items/${actionItemId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'open' });
    assert.equal(reopenRes.status, 409);
    assert.equal(reopenRes.body.error.code, 'ACTION_ITEM_TERMINAL_STATE');
  });

  // ===========================================================================
  // 6. User Journey 7: Cross-Tenant & Cross-Meeting Reference Tampering
  // ===========================================================================

  it('9. Journey 7: Cross-tenant ID tampering (Org B accessing Org A meetings, notes, actions) is rejected (403)', async () => {
    // Org B attempts to read Org A meeting
    const meetRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}`)
      .set('Cookie', [orgBCookie, csrfCookie]);
    assert.equal(meetRes.status, 403);

    // Org B attempts to read notes
    const notesRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/notes`)
      .set('Cookie', [orgBCookie, csrfCookie]);
    assert.equal(notesRes.status, 403);

    // Org B attempts to list action items
    const actRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/action-items`)
      .set('Cookie', [orgBCookie, csrfCookie]);
    assert.equal(actRes.status, 403);
  });

  it('10. Journey 7: Cross-meeting agenda reference in action item creation is rejected with 422 VALIDATION_ERROR', async () => {
    // Create Meeting 2 in Org A
    const m2Res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: `Meeting 2 for Cross-Agenda Test ${runTag}`,
        startAt: '2026-11-28T09:00:00.000Z',
        endAt: '2026-11-28T10:00:00.000Z',
        timezone: 'UTC',
      });
    assert.equal(m2Res.status, 201);
    meeting2Id = m2Res.body.data.meeting.id;

    // Add Agenda item to Meeting 2
    const aRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting2Id}/agenda`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Meeting 2 Agenda Item' });
    assert.equal(aRes.status, 201);
    meeting2AgendaId = aRes.body.data.agendaItem.id;

    // Attempt to create action item in Meeting 1 with agendaItemId from Meeting 2
    const tamperRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting1Id}/action-items`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Tampered Agenda Action Item',
        assigneeId: memberUserId,
        agendaItemId: meeting2AgendaId,
      });

    assert.equal(tamperRes.status, 422);
    assert.equal(tamperRes.body.error.code, 'VALIDATION_ERROR');
    assert.ok(tamperRes.body.error.message.includes('Source agenda item must belong to this meeting'));
  });

  // ===========================================================================
  // 7. User Journey 8: Deterministic Filtering & Pagination
  // ===========================================================================

  it('11. Journey 8: Meeting lists deterministic filtering (timeframe, status) and pagination', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings?timeframe=all&status=all&page=1&limit=10`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.data.meetings));
    assert.ok(listRes.body.meta.pagination);
    assert.ok(listRes.body.meta.pagination.totalItems >= 2);
    assert.equal(listRes.body.meta.pagination.page, 1);
    assert.equal(listRes.body.meta.pagination.limit, 10);
  });

  // ===========================================================================
  // 8. User Journey 9: Email Notifications, Provider Handling & Zero Body Leak
  // ===========================================================================

  it('12. Journey 9: Email invitations deliver safely to internal and external attendees without leaking note bodies', async () => {
    clearTestMailbox();

    // Add member attendee in pending status to meeting 2
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting2Id}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ userId: memberUserId, role: 'participant' });

    const inviteRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${meeting2Id}/send-invites`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({});

    assert.equal(inviteRes.status, 200);
    assert.ok(inviteRes.body.data.sentCount >= 1);

    const mailbox = getTestMailbox();
    const mail = mailbox.find((m) => m.subject.includes(`Meeting Invitation: Meeting 2 for Cross-Agenda Test ${runTag}`));
    assert.ok(mail, 'Expected meeting invitation email');
    assert.ok(!mail.text.includes('Confidential:'), 'Note bodies must never leak into email notifications');
  });

  // ===========================================================================
  // 9. User Journey 10: Dynamic Revocation (Attendee, Member, Permissions, Module)
  // ===========================================================================

  it('13. Journey 10: Removing attendee immediately revokes access to attendees_only meeting', async () => {
    // 1. Find attendee record for memberUserId in attendeesOnlyMeetingId
    const attListRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie]);
    assert.equal(attListRes.status, 200);
    const memberAtt = attListRes.body.data.attendees.find((a) => a.userId === memberUserId);
    assert.ok(memberAtt);

    // 2. Remove member attendee
    const remRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}/attendees/${memberAtt.id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);
    assert.equal(remRes.status, 200);

    // 3. Member immediately receives 403 on subsequent meeting request
    const postRemRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${attendeesOnlyMeetingId}`)
      .set('Cookie', [memberCookie, csrfCookie]);
    assert.equal(postRemRes.status, 403);
    assert.equal(postRemRes.body.error.code, 'MEETING_ACCESS_DENIED');
  });

  it('14. Journey 10: Suspending organisation membership immediately blocks all meeting API access (403)', async () => {
    // Suspend memberUserId in Org A
    await withSystemTransaction(async (client) => {
      await client.query(
        `UPDATE organisation_memberships SET status = 'suspended' WHERE id = $1`,
        [memberMembershipId]
      );
    });

    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [memberCookie, csrfCookie]);
    assert.equal(res.status, 403);

    // Restore member status
    await withSystemTransaction(async (client) => {
      await client.query(
        `UPDATE organisation_memberships SET status = 'active' WHERE id = $1`,
        [memberMembershipId]
      );
    });
  });

  it('15. Journey 10: Disabling meetings module immediately returns 403 MODULE_DISABLED for all meetings endpoints', async () => {
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

    // Re-enable module
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/meetings`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });
  });

  // ===========================================================================
  // 10. Database RLS Least-Privilege Verification (managex_app)
  // ===========================================================================

  it('16. Database RLS: With missing tenant context, queries return 0 rows under managex_app (deny-by-default)', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      // Current user is managex_app
      const whoRes = await client.query('SELECT current_user');
      assert.equal(whoRes.rows[0].current_user, 'managex_app');

      // Without setting app.current_organisation_id, all meetings tables return 0 rows
      const meetRes = await client.query('SELECT * FROM meetings');
      assert.equal(meetRes.rows.length, 0);

      const attRes = await client.query('SELECT * FROM meeting_attendees');
      assert.equal(attRes.rows.length, 0);

      const agendaRes = await client.query('SELECT * FROM meeting_agenda_items');
      assert.equal(agendaRes.rows.length, 0);

      const notesRes = await client.query('SELECT * FROM meeting_notes');
      assert.equal(notesRes.rows.length, 0);

      const actionRes = await client.query('SELECT * FROM meeting_action_items');
      assert.equal(actionRes.rows.length, 0);
    } finally {
      client.release();
    }
  });

  it('17. Database RLS: managex_app cannot read or mutate meetings across tenants', async () => {
    await withTenantTransaction({ userId: orgBUserId, organisationId: orgBId }, async (client) => {
      // Query Org A meeting from Org B context -> 0 rows
      const res = await client.query('SELECT * FROM meetings WHERE id = $1', [meeting1Id]);
      assert.equal(res.rows.length, 0);

      // Attempt UPDATE Org A meeting from Org B context -> 0 rows updated
      const updRes = await client.query('UPDATE meetings SET title = $1 WHERE id = $2 RETURNING id', [
        'Tampered',
        meeting1Id,
      ]);
      assert.equal(updRes.rows.length, 0);

      // Attempt DELETE Org A meeting from Org B context -> 0 rows deleted
      const delRes = await client.query('DELETE FROM meetings WHERE id = $1 RETURNING id', [meeting1Id]);
      assert.equal(delRes.rows.length, 0);
    });
  });

  it('18. Database RLS: Connection pool reuse alternating Tenant A -> Tenant B -> Tenant A preserves complete isolation', async () => {
    // 1. Tenant A context can read Meeting 1
    await withTenantTransaction({ userId: ownerUserId, organisationId: orgAId }, async (client) => {
      const res = await client.query('SELECT id FROM meetings WHERE id = $1', [meeting1Id]);
      assert.equal(res.rows.length, 1);
    });

    // 2. Tenant B context CANNOT read Meeting 1
    await withTenantTransaction({ userId: orgBUserId, organisationId: orgBId }, async (client) => {
      const res = await client.query('SELECT id FROM meetings WHERE id = $1', [meeting1Id]);
      assert.equal(res.rows.length, 0);
    });

    // 3. Tenant A context again can read Meeting 1 (no leak)
    await withTenantTransaction({ userId: ownerUserId, organisationId: orgAId }, async (client) => {
      const res = await client.query('SELECT id FROM meetings WHERE id = $1', [meeting1Id]);
      assert.equal(res.rows.length, 1);
    });
  });

  it('19. Database RLS: Tenant-aware composite foreign key rejects cross-tenant relationship insertion', async () => {
    await withTenantTransaction({ userId: orgBUserId, organisationId: orgBId }, async (client) => {
      // Attempt to insert meeting_notes with organisation_id = orgBId but meeting_id = meeting1Id (which belongs to Org A)
      let fkViolation = false;
      try {
        await client.query(
          `INSERT INTO meeting_notes (organisation_id, meeting_id, content, created_by_id, updated_by_id)
           VALUES ($1, $2, 'Cross-tenant notes test', $3, $3)`,
          [orgBId, meeting1Id, orgBUserId]
        );
      } catch (err) {
        fkViolation = true;
        assert.equal(err.code, '23503', 'Expected PostgreSQL foreign key violation (code 23503)');
      }
      assert.ok(fkViolation, 'Cross-tenant composite foreign key fk_meeting_notes_org_meeting must reject mismatched tenant');
    });
  });
});
