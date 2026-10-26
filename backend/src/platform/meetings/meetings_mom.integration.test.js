/**
 * ManageX Integration Test Suite: Structured Minutes of Meeting (MOM) Enhancement
 *
 * Strictly tests:
 * 1. Multiple independently manageable Discussion Points (CRUD, draft state, atomic reordering).
 * 2. Dedicated Decisions section (CRUD, atomic reordering).
 * 3. Additional Notes & historical minutes preservation without data loss or truncation.
 * 4. Granular authorization: Organiser & explicit meeting.notes.* permissions, attendee denial (403 FORBIDDEN_NOTES_ACCESS).
 * 5. Safe audit logging with ZERO text bodies/details in metadata.
 * 6. Terminal state enforcement: cancelled meetings block MOM mutations (409 MEETING_CANCELLED).
 * 7. Direct PostgreSQL Row-Level Security isolation & composite foreign keys under `managex_app`.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';

describe('Structured Minutes of Meeting (MOM) Enhancement Suite (managex_test)', () => {
  const runTag = `mom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let ownerUserId;
  let organiserUserId;
  let attendeeMemberUserId;
  let viewerUserId;
  let notesAdminUserId;
  let orgBUserId;

  let ownerCookie;
  let organiserCookie;
  let attendeeMemberCookie;
  let viewerCookie;
  let notesAdminCookie;
  let orgBCookie;

  let csrfCookie;
  let csrfToken;

  let orgAId;
  let orgBId;

  let activeMeetingId;
  let cancelledMeetingId;
  let orgBMeetingId;

  let createdPoint1Id;
  let createdPoint2Id;
  let createdDecision1Id;
  let createdDecision2Id;

  before(async () => {
    // 1. Verify safe test database at migration 037
    await withSystemTransaction(async (client) => {
      const dbRes = await client.query('SELECT current_database() AS name');
      if (dbRes.rows[0].name !== 'managex_test') {
        throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbRes.rows[0].name}`);
      }

      const migRes = await client.query(
        "SELECT version FROM schema_migrations WHERE version = '20261017000037'"
      );
      if (migRes.rowCount !== 1) {
        throw new Error('Test requires managex_test at migration 20261017000037.');
      }
    });

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'] || [];
    const c = cookies.find((item) => item.startsWith(`${CSRF_COOKIE_NAME}=`));
    if (c) {
      csrfCookie = c.split(';')[0];
      csrfToken = csrfCookie.replace(`${CSRF_COOKIE_NAME}=`, '');
    }

    // 3. Create run-unique users without destructive changes
    const passwordHash = await hashPassword('SecurePass123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
         VALUES 
           ('MOM Owner', 'mom_owner_${runTag}@managex.local', $1, 'active', NOW()),
           ('MOM Organiser', 'mom_organiser_${runTag}@managex.local', $1, 'active', NOW()),
           ('MOM Attendee', 'mom_attendee_${runTag}@managex.local', $1, 'active', NOW()),
           ('MOM Viewer', 'mom_viewer_${runTag}@managex.local', $1, 'active', NOW()),
           ('MOM Admin', 'mom_admin_${runTag}@managex.local', $1, 'active', NOW()),
           ('MOM OrgB', 'mom_orgb_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [passwordHash]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email.startsWith('mom_owner_')).id;
    organiserUserId = users.find((u) => u.email.startsWith('mom_organiser_')).id;
    attendeeMemberUserId = users.find((u) => u.email.startsWith('mom_attendee_')).id;
    viewerUserId = users.find((u) => u.email.startsWith('mom_viewer_')).id;
    notesAdminUserId = users.find((u) => u.email.startsWith('mom_admin_')).id;
    orgBUserId = users.find((u) => u.email.startsWith('mom_orgb_')).id;

    // Create sessions
    const sessOwner = await createSession({ userId: ownerUserId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${sessOwner.rawToken}`;

    const sessOrg = await createSession({ userId: organiserUserId });
    organiserCookie = `${SESSION_COOKIE_NAME}=${sessOrg.rawToken}`;

    const sessAtt = await createSession({ userId: attendeeMemberUserId });
    attendeeMemberCookie = `${SESSION_COOKIE_NAME}=${sessAtt.rawToken}`;

    const sessView = await createSession({ userId: viewerUserId });
    viewerCookie = `${SESSION_COOKIE_NAME}=${sessView.rawToken}`;

    const sessAdmin = await createSession({ userId: notesAdminUserId });
    notesAdminCookie = `${SESSION_COOKIE_NAME}=${sessAdmin.rawToken}`;

    const sessB = await createSession({ userId: orgBUserId });
    orgBCookie = `${SESSION_COOKIE_NAME}=${sessB.rawToken}`;

    // 4. Create Org A and Org B
    const orgARes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `MOM Test Org A ${runTag}` });
    orgAId = orgARes.body.data.organisation.id;

    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `MOM Test Org B ${runTag}` });
    orgBId = orgBRes.body.data.organisation.id;

    // Enable Meetings module
    for (const [oid, cookie] of [[orgAId, ownerCookie], [orgBId, orgBCookie]]) {
      await request(app)
        .patch(`/api/v1/organisations/${oid}/modules/meetings`)
        .set('Cookie', [cookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ isEnabled: true });
    }

    // 5. Setup roles and memberships in Org A
    await withSystemTransaction(async (client) => {
      // Add memberships
      for (const uid of [organiserUserId, attendeeMemberUserId, viewerUserId, notesAdminUserId]) {
        await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')
           ON CONFLICT DO NOTHING`,
          [orgAId, uid]
        );
      }

      // Fetch baseline system roles
      const orgRole = await client.query("SELECT id FROM roles WHERE slug = 'meeting_organiser' AND organisation_id IS NULL");
      const adminRole = await client.query("SELECT id FROM roles WHERE slug = 'meeting_admin' AND organisation_id IS NULL");
      const partRole = await client.query("SELECT id FROM roles WHERE slug = 'meeting_participant' AND organisation_id IS NULL");
      const viewRole = await client.query("SELECT id FROM roles WHERE slug = 'meeting_viewer' AND organisation_id IS NULL");

      // Map roles to memberships
      const memOrg = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
        [orgAId, organiserUserId]
      );
      if (orgRole.rows.length > 0 && memOrg.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [orgAId, memOrg.rows[0].id, orgRole.rows[0].id]
        );
      }

      const memAdmin = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
        [orgAId, notesAdminUserId]
      );
      if (adminRole.rows.length > 0 && memAdmin.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [orgAId, memAdmin.rows[0].id, adminRole.rows[0].id]
        );
      }

      const memAtt = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
        [orgAId, attendeeMemberUserId]
      );
      if (partRole.rows.length > 0 && memAtt.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [orgAId, memAtt.rows[0].id, partRole.rows[0].id]
        );
      }

      const memView = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
        [orgAId, viewerUserId]
      );
      if (viewRole.rows.length > 0 && memView.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [orgAId, memView.rows[0].id, viewRole.rows[0].id]
        );
      }
    });

    // 6. Create Active Meeting in Org A
    const meetRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: `Architecture Review ${runTag}`,
        description: 'Review MOM data models and database migrations.',
        startAt: '2026-11-20T10:00:00.000Z',
        endAt: '2026-11-20T11:00:00.000Z',
        timezone: 'UTC',
        visibility: 'organisation',
      });
    activeMeetingId = meetRes.body.data.meeting.id;

    // Add attendeeMember as participant attendee
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/attendees`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ userId: attendeeMemberUserId, role: 'participant' });

    // 7. Create Cancelled Meeting in Org A
    const canMeetRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: `Decommissioned Session ${runTag}`,
        startAt: '2026-11-21T10:00:00.000Z',
        endAt: '2026-11-21T11:00:00.000Z',
        timezone: 'UTC',
        visibility: 'organisation',
      });
    cancelledMeetingId = canMeetRes.body.data.meeting.id;

    await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${cancelledMeetingId}/status`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'cancelled' });

    // 8. Create Meeting in Org B for cross-tenant tests
    const orgBMeetRes = await request(app)
      .post(`/api/v1/organisations/${orgBId}/meetings`)
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: `Org B Confidential Meeting ${runTag}`,
        startAt: '2026-11-22T10:00:00.000Z',
        endAt: '2026-11-22T11:00:00.000Z',
        timezone: 'UTC',
        visibility: 'organisation',
      });
    orgBMeetingId = orgBMeetRes.body.data.meeting.id;
  });

  // ===========================================================================
  // 1. Discussion Points Lifecycle
  // ===========================================================================

  it('1. Discussion Points: Organiser creates points (detailed & draft), lists, updates, reorders, and deletes', async () => {
    // 1. Create Discussion Point 1 with title and body
    const createRes1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Evaluate PostgreSQL RLS vs Application-Level Filtering',
        body: 'Team evaluated RLS performance on tenant queries and verified zero platform admin bypass.',
      });

    assert.equal(createRes1.status, 201);
    assert.equal(createRes1.body.data.discussionPoint.title, 'Evaluate PostgreSQL RLS vs Application-Level Filtering');
    assert.equal(createRes1.body.data.discussionPoint.orderIndex, 0);
    createdPoint1Id = createRes1.body.data.discussionPoint.id;
    assert.ok(createdPoint1Id);

    // 2. Create Discussion Point 2 with draft state (empty body)
    const createRes2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Draft Roadmap Discussion Topic',
        body: '',
      });

    assert.equal(createRes2.status, 201);
    assert.equal(createRes2.body.data.discussionPoint.title, 'Draft Roadmap Discussion Topic');
    assert.equal(createRes2.body.data.discussionPoint.orderIndex, 1);
    assert.equal(createRes2.body.data.discussionPoint.body || '', '');
    createdPoint2Id = createRes2.body.data.discussionPoint.id;

    // 3. List Discussion Points
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.discussionPoints.length, 2);
    assert.equal(listRes.body.data.discussionPoints[0].id, createdPoint1Id);
    assert.equal(listRes.body.data.discussionPoints[1].id, createdPoint2Id);

    // 4. Update Discussion Point 1 without affecting Point 2
    const updateRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points/${createdPoint1Id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Evaluate PostgreSQL RLS (Finalised)',
        body: 'Benchmarks show less than 2ms overhead per transaction.',
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.discussionPoint.title, 'Evaluate PostgreSQL RLS (Finalised)');
    assert.equal(updateRes.body.data.discussionPoint.body, 'Benchmarks show less than 2ms overhead per transaction.');

    // Verify Point 2 remains unchanged
    const listAfterUpdate = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [organiserCookie, csrfCookie]);
    assert.equal(listAfterUpdate.body.data.discussionPoints[1].title, 'Draft Roadmap Discussion Topic');

    // 5. Reorder Discussion Points atomically
    const reorderRes = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points/reorder`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        itemIds: [createdPoint2Id, createdPoint1Id],
      });

    assert.equal(reorderRes.status, 200);
    assert.equal(reorderRes.body.data.success, true);

    const reorderedPointsList = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [organiserCookie, csrfCookie]);
    assert.equal(reorderedPointsList.body.data.discussionPoints[0].id, createdPoint2Id);
    assert.equal(reorderedPointsList.body.data.discussionPoints[0].orderIndex, 0);
    assert.equal(reorderedPointsList.body.data.discussionPoints[1].id, createdPoint1Id);
    assert.equal(reorderedPointsList.body.data.discussionPoints[1].orderIndex, 1);

    // 6. Delete Discussion Point 2
    const deleteRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points/${createdPoint2Id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.data.success, true);

    // Verify list now contains only Point 1
    const listAfterDelete = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [organiserCookie, csrfCookie]);
    assert.equal(listAfterDelete.body.data.discussionPoints.length, 1);
    assert.equal(listAfterDelete.body.data.discussionPoints[0].id, createdPoint1Id);
  });

  // ===========================================================================
  // 2. Decisions Lifecycle
  // ===========================================================================

  it('2. Decisions: Organiser creates decisions, lists, updates, reorders, and deletes', async () => {
    // 1. Create Decision 1 with title and details
    const createRes1 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Approve Structured MOM Schema Migration 037',
        details: 'Approved migration introducing meeting_discussion_points and meeting_decisions tables.',
      });

    assert.equal(createRes1.status, 201);
    assert.equal(createRes1.body.data.decision.title, 'Approve Structured MOM Schema Migration 037');
    assert.equal(createRes1.body.data.decision.orderIndex, 0);
    createdDecision1Id = createRes1.body.data.decision.id;
    assert.ok(createdDecision1Id);

    // 2. Create Decision 2 with title only
    const createRes2 = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Adopt TanStack Query for Cache Invalidation',
      });

    assert.equal(createRes2.status, 201);
    assert.equal(createRes2.body.data.decision.title, 'Adopt TanStack Query for Cache Invalidation');
    assert.equal(createRes2.body.data.decision.orderIndex, 1);
    assert.equal(createRes2.body.data.decision.details || '', '');
    createdDecision2Id = createRes2.body.data.decision.id;

    // 3. List Decisions
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.decisions.length, 2);
    assert.equal(listRes.body.data.decisions[0].id, createdDecision1Id);
    assert.equal(listRes.body.data.decisions[1].id, createdDecision2Id);

    // 4. Update Decision 1
    const updateRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions/${createdDecision1Id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Approve Structured MOM Migration 037 (Unanimous)',
        details: 'Approved unanimously with backward-compatible notes support.',
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.decision.title, 'Approve Structured MOM Migration 037 (Unanimous)');

    // 5. Reorder Decisions
    const reorderRes = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions/reorder`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        itemIds: [createdDecision2Id, createdDecision1Id],
      });

    assert.equal(reorderRes.status, 200);
    assert.equal(reorderRes.body.data.success, true);

    const reorderedDecsList = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions`)
      .set('Cookie', [organiserCookie, csrfCookie]);
    assert.equal(reorderedDecsList.body.data.decisions[0].id, createdDecision2Id);
    assert.equal(reorderedDecsList.body.data.decisions[0].orderIndex, 0);

    // 6. Delete Decision 2
    const deleteRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions/${createdDecision2Id}`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.data.success, true);

    const listAfterDelete = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions`)
      .set('Cookie', [organiserCookie, csrfCookie]);
    assert.equal(listAfterDelete.body.data.decisions.length, 1);
    assert.equal(listAfterDelete.body.data.decisions[0].id, createdDecision1Id);
  });

  // ===========================================================================
  // 3. Additional Notes Preservation & Aggregate GET /notes
  // ===========================================================================

  it('3. Notes Preservation: GET /notes returns { notes, discussionPoints, decisions } and preserves legacy text', async () => {
    const historicalNotesText = 'Historical MOM free-form text from legacy meetings. Must remain intact.';

    // Save legacy notes
    const saveRes = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/notes`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ content: historicalNotesText });

    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.body.data.notes.content, historicalNotesText);

    // Retrieve aggregate notes
    const getRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/notes`)
      .set('Cookie', [organiserCookie, csrfCookie]);

    assert.equal(getRes.status, 200);
    // Legacy notes preserved
    assert.equal(getRes.body.data.notes.content, historicalNotesText);
    // Structured discussion points included
    assert.ok(Array.isArray(getRes.body.data.discussionPoints));
    assert.equal(getRes.body.data.discussionPoints.length, 1);
    assert.equal(getRes.body.data.discussionPoints[0].id, createdPoint1Id);
    // Structured decisions included
    assert.ok(Array.isArray(getRes.body.data.decisions));
    assert.equal(getRes.body.data.decisions.length, 1);
    assert.equal(getRes.body.data.decisions[0].id, createdDecision1Id);
  });

  // ===========================================================================
  // 4. Authorization & Privacy Invariants
  // ===========================================================================

  it('4. Authorization: Attendee without notes permission is rejected with 403; explicit permissions succeed', async () => {
    // 1. Mere attendee (even accepted participant) cannot read discussion points
    const dpAttRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [attendeeMemberCookie, csrfCookie]);
    assert.equal(dpAttRes.status, 403);
    assert.equal(dpAttRes.body.error.code, 'FORBIDDEN_NOTES_ACCESS');

    // 2. Mere attendee cannot read decisions
    const decAttRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/decisions`)
      .set('Cookie', [attendeeMemberCookie, csrfCookie]);
    assert.equal(decAttRes.status, 403);
    assert.equal(decAttRes.body.error.code, 'FORBIDDEN_NOTES_ACCESS');

    // 3. Mere attendee cannot read notes aggregate
    const notesAttRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/notes`)
      .set('Cookie', [attendeeMemberCookie, csrfCookie]);
    assert.equal(notesAttRes.status, 403);
    assert.equal(notesAttRes.body.error.code, 'FORBIDDEN_NOTES_ACCESS');

    // 4. Mere attendee cannot mutate discussion points
    const mutateAttRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [attendeeMemberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Unauthorized Point' });
    assert.equal(mutateAttRes.status, 403);

    // 5. Ordinary meeting viewer cannot view confidential minutes (403)
    const viewerReadRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/notes`)
      .set('Cookie', [viewerCookie, csrfCookie]);
    assert.equal(viewerReadRes.status, 403);
    assert.equal(viewerReadRes.body.error.code, 'FORBIDDEN_NOTES_ACCESS');

    // 6. User with explicit notes permission (meeting_admin) can view and mutate MOM
    const adminReadRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/notes`)
      .set('Cookie', [notesAdminCookie, csrfCookie]);
    assert.equal(adminReadRes.status, 200);
    assert.ok(adminReadRes.body.data.discussionPoints.length >= 1);

    const adminMutateRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${activeMeetingId}/discussion-points`)
      .set('Cookie', [notesAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Authorized Admin Discussion Point', body: 'Notes Admin added this point.' });
    assert.equal(adminMutateRes.status, 201);
  });

  // ===========================================================================
  // 5. Safe Audit Logging (Zero Body Leakage)
  // ===========================================================================

  it('5. Audit Logs: MOM actions generate audit logs with ZERO body/detail text leakage', async () => {
    const auditRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(auditRes.status, 200);
    const logs = auditRes.body.data.auditLogs || auditRes.body.data.logs;

    const dpLog = logs.find((l) => l.action === 'meeting.discussion_point_created');
    assert.ok(dpLog, 'Expected audit log for meeting.discussion_point_created');
    assert.ok(dpLog.entityId || dpLog.metadata?.meetingId);
    // Body is NEVER stored in audit logs
    assert.equal(typeof dpLog.metadata.body, 'undefined');
    assert.ok(!JSON.stringify(dpLog.metadata).includes('benchmarks show less than 2ms'));

    const decLog = logs.find((l) => l.action === 'meeting.decision_created');
    assert.ok(decLog, 'Expected audit log for meeting.decision_created');
    assert.ok(decLog.entityId || decLog.metadata?.meetingId);
    // Details are NEVER stored in audit logs
    assert.equal(typeof decLog.metadata.details, 'undefined');
    assert.ok(!JSON.stringify(decLog.metadata).includes('Approved migration introducing'));
  });

  // ===========================================================================
  // 6. Terminal State Enforcement (Cancelled Meeting)
  // ===========================================================================

  it('6. Terminal State: Cancelled meetings block MOM mutations (409 MEETING_CANCELLED)', async () => {
    // 1. Attempt to add discussion point to cancelled meeting
    const dpRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${cancelledMeetingId}/discussion-points`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Point for Cancelled Meeting' });
    assert.equal(dpRes.status, 409);
    assert.equal(dpRes.body.error.code, 'MEETING_CANCELLED');

    // 2. Attempt to add decision to cancelled meeting
    const decRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/meetings/${cancelledMeetingId}/decisions`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Decision for Cancelled Meeting' });
    assert.equal(decRes.status, 409);
    assert.equal(decRes.body.error.code, 'MEETING_CANCELLED');

    // 3. Attempt to save legacy notes on cancelled meeting
    const notesRes = await request(app)
      .put(`/api/v1/organisations/${orgAId}/meetings/${cancelledMeetingId}/notes`)
      .set('Cookie', [organiserCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ content: 'Notes for Cancelled Meeting' });
    assert.equal(notesRes.status, 409);
    assert.equal(notesRes.body.error.code, 'MEETING_CANCELLED');
  });

  // ===========================================================================
  // 7. PostgreSQL RLS Tenant Isolation (managex_app role)
  // ===========================================================================

  it('7. RLS Tenant Isolation: Cross-tenant reads return 0 rows and cross-tenant insertions fail closed', async () => {
    // 1. Direct query under managex_app within Org B tenant context looking for Org A discussion points
    const crossTenantRead = await withTenantTransaction(
      { userId: orgBUserId, organisationId: orgBId, isPlatformAdmin: false },
      async (client) => {
        const res = await client.query(
          `SELECT * FROM meeting_discussion_points WHERE organisation_id = $1`,
          [orgAId]
        );
        return res.rows;
      }
    );
    // RLS filters out rows from Org A
    assert.equal(crossTenantRead.length, 0);

    // 2. Attempt cross-tenant insert under Org B tenant context with Org A meeting
    await assert.rejects(
      async () => {
        await withTenantTransaction(
          { userId: orgBUserId, organisationId: orgBId, isPlatformAdmin: false },
          async (client) => {
            // Attempting to insert a row tagged with Org B into an Org A meeting violates composite FK
            await client.query(
              `INSERT INTO meeting_discussion_points (meeting_id, organisation_id, title, created_by_id)
               VALUES ($1, $2, 'Illegal Cross-Tenant Point', $3)`,
              [activeMeetingId, orgBId, orgBUserId]
            );
          }
        );
      },
      (err) => {
        // Must fail with FK constraint or RLS violation
        return err.code === '23503' || err.code === '42501';
      }
    );

    // 3. Attempt to insert Org A row under Org B transaction context violates RLS WITH CHECK
    await assert.rejects(
      async () => {
        await withTenantTransaction(
          { userId: orgBUserId, organisationId: orgBId, isPlatformAdmin: false },
          async (client) => {
            await client.query(
              `INSERT INTO meeting_discussion_points (meeting_id, organisation_id, title, created_by_id)
               VALUES ($1, $2, 'RLS Bypass Attempt', $3)`,
              [activeMeetingId, orgAId, orgBUserId]
            );
          }
        );
      },
      (err) => {
        // Must fail with RLS violation (42501)
        return err.code === '42501' || err.code === '23503';
      }
    );
  });
});
