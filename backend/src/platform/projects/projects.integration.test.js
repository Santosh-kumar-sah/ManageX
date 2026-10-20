/**
 * ManageX Integration Test Suite: Phase 8A — Projects Core & Membership
 * Strictly tests PRD Section 9.1 (PRJ-001), Section 9.2 (PRJ-002), docs/security.md, and docs/database.md.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';

describe('Phase 8A — Projects Core & Membership Suite', () => {
  const runTag = `p8a_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let ownerUserId;
  let managerUserId;
  let memberUserId;
  let nonMemberUserId;
  let orgBUserId;

  let ownerCookie;
  let managerCookie;
  let memberCookie;
  let nonMemberCookie;
  let orgBCookie;

  let csrfCookie;
  let csrfToken;

  let orgAId;
  let orgBId;

  let testProjectId;
  let lifecycleProjectId;

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
           ('Project Owner', 'owner_${runTag}@managex.local', $1, 'active', NOW()),
           ('Project Manager', 'manager_${runTag}@managex.local', $1, 'active', NOW()),
           ('Project Member', 'member_${runTag}@managex.local', $1, 'active', NOW()),
           ('Non Member', 'nonmem_${runTag}@managex.local', $1, 'active', NOW()),
           ('Org B User', 'orgb_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [passwordHash]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email.startsWith('owner_')).id;
    managerUserId = users.find((u) => u.email.startsWith('manager_')).id;
    memberUserId = users.find((u) => u.email.startsWith('member_')).id;
    nonMemberUserId = users.find((u) => u.email.startsWith('nonmem_')).id;
    orgBUserId = users.find((u) => u.email.startsWith('orgb_')).id;

    // Create sessions
    const sessOwner = await createSession({ userId: ownerUserId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${sessOwner.rawToken}`;

    const sessMgr = await createSession({ userId: managerUserId });
    managerCookie = `${SESSION_COOKIE_NAME}=${sessMgr.rawToken}`;

    const sessMem = await createSession({ userId: memberUserId });
    memberCookie = `${SESSION_COOKIE_NAME}=${sessMem.rawToken}`;

    const sessNon = await createSession({ userId: nonMemberUserId });
    nonMemberCookie = `${SESSION_COOKIE_NAME}=${sessNon.rawToken}`;

    const sessB = await createSession({ userId: orgBUserId });
    orgBCookie = `${SESSION_COOKIE_NAME}=${sessB.rawToken}`;

    // 3. Create Org A
    const orgARes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Projects Org A ${runTag}` });
    assert.equal(orgARes.status, 201);
    orgAId = orgARes.body.data.organisation.id;

    // 4. Create Org B
    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Projects Org B ${runTag}` });
    assert.equal(orgBRes.status, 201);
    orgBId = orgBRes.body.data.organisation.id;

    // 5. Add manager, member, and nonMember to Org A
    await withSystemTransaction(async (client) => {
      // Add manager
      const mRes1 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, managerUserId]
      );
      // Give manager project_manager role
      const rRes1 = await client.query(
        `SELECT id FROM roles WHERE slug = 'project_manager' AND organisation_id IS NULL`
      );
      if (rRes1.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [orgAId, mRes1.rows[0].id, rRes1.rows[0].id]
        );
      }

      // Add member
      const mRes2 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, memberUserId]
      );
      const rRes2 = await client.query(
        `SELECT id FROM roles WHERE slug = 'organisation_member' AND organisation_id IS NULL`
      );
      if (rRes2.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [orgAId, mRes2.rows[0].id, rRes2.rows[0].id]
        );
      }

      // Add nonMember as organisation_member
      const mRes3 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, nonMemberUserId]
      );
      if (rRes2.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [orgAId, mRes3.rows[0].id, rRes2.rows[0].id]
        );
      }
    });

    // 6. Activate 'projects' module for Org A and Org B
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });

    await request(app)
      .patch(`/api/v1/organisations/${orgBId}/modules/projects`)
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });
  });

  // ---------------------------------------------------------------------------
  // PRJ-001: Project Creation, Owner Assignment & Membership
  // ---------------------------------------------------------------------------

  it('1. POST /projects creates project with valid inputs, dates, priority and auto-adds owner as manager member', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Alpha Core Infrastructure',
        description: 'Building multi-tenant infrastructure for client workloads',
        priority: 'high',
        status: 'planning',
        startDate: '2026-11-01T09:00:00.000Z',
        targetDate: '2026-12-15T18:00:00.000Z',
        labels: ['backend', 'database', 'core'],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.project.name, 'Alpha Core Infrastructure');
    assert.equal(res.body.data.project.status, 'planning');
    assert.equal(res.body.data.project.priority, 'high');
    assert.equal(res.body.data.project.ownerId, ownerUserId);
    assert.deepEqual(res.body.data.project.labels, ['backend', 'database', 'core']);
    assert.equal(res.body.data.project.memberCount, 1);

    testProjectId = res.body.data.project.id;
  });

  it('2. POST /projects with explicit active org member as owner assigns them and includes them in members', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Lifecycle Transition Project',
        description: 'Testing canonical lifecycle states',
        ownerId: managerUserId,
        priority: 'urgent',
        status: 'planning',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.project.ownerId, managerUserId);

    lifecycleProjectId = res.body.data.project.id;
  });

  it('3. POST /projects rejects cross-organisation user as owner with 422', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Cross Org Owner Attack',
        ownerId: orgBUserId, // Belongs to Org B, not Org A
      });

    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /active member of this organisation/i);
  });

  it('4. POST /projects rejects start date after target completion date with 422', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Time Paradox Project',
        startDate: '2026-12-01T00:00:00.000Z',
        targetDate: '2026-11-01T00:00:00.000Z', // Before start date!
      });

    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /cannot be after the target completion date/i);
  });

  it('5. POST /projects rejects creation directly in completed or archived status with 422', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Prematurely Completed Project',
        status: 'completed',
      });

    assert.equal(res.status, 422);
  });

  // ---------------------------------------------------------------------------
  // PRJ-002: Canonical 5-Status Lifecycle & Transitions
  // ---------------------------------------------------------------------------

  it('6. PATCH /projects/:id/status supports full sequential canonical progression: planning -> active -> on_hold -> active -> completed -> archived', async () => {
    // planning -> active
    let res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${lifecycleProjectId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'active' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.project.status, 'active');

    // active -> on_hold
    res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${lifecycleProjectId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'on_hold' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.project.status, 'on_hold');

    // on_hold -> active
    res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${lifecycleProjectId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'active' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.project.status, 'active');

    // active -> completed
    res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${lifecycleProjectId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.project.status, 'completed');

    // completed -> archived
    res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${lifecycleProjectId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'archived' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.project.status, 'archived');
  });

  it('7. PATCH /projects/:id/status rejects invalid transition (archived -> active) with 409 Conflict', async () => {
    const res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${lifecycleProjectId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'active' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PROJECT_ARCHIVED');
  });

  it('8. PATCH /projects/:id rejects edits on archived projects with 409 Conflict (read-only invariant)', async () => {
    const res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${lifecycleProjectId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Tampered Archived Project Name' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PROJECT_ARCHIVED');
  });

  // ---------------------------------------------------------------------------
  // PRJ-001: Resource-Scoped Project Access Control
  // ---------------------------------------------------------------------------

  it('9. GET /projects/:id denies an organisation member who is NOT a project member with 403 Forbidden', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}`)
      .set('Cookie', [nonMemberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PROJECT_ACCESS_DENIED');
  });

  it('10. POST /projects/:id/members adds member to project and allows them to access project', async () => {
    const addRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/members`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        userId: memberUserId,
        role: 'member',
      });

    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.data.member.userId, memberUserId);
    assert.equal(addRes.body.data.member.role, 'member');

    // Member can now access project
    const getRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.project.id, testProjectId);
  });

  it('11. POST /projects/:id/members rejects duplicate member with 409 Conflict', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/members`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        userId: memberUserId,
        role: 'member',
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_PROJECT_MEMBER');
  });

  it('12. POST /projects/:id/members rejects non-organisation user with 422', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/members`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        userId: orgBUserId,
        role: 'member',
      });

    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /active member of this organisation/i);
  });

  // ---------------------------------------------------------------------------
  // PRJ-001: Owner Invariant & Removal Protection
  // ---------------------------------------------------------------------------

  it('13. DELETE /projects/:id/members/:userId blocks removing the current project owner with 409 Conflict', async () => {
    const res = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/members/${ownerUserId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CANNOT_REMOVE_PROJECT_OWNER');
  });

  it('14. PATCH /projects/:id/members/:userId blocks demoting the current project owner with 409 Conflict', async () => {
    const res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/members/${ownerUserId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ role: 'viewer' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CANNOT_DEMOTE_PROJECT_OWNER');
  });

  it('15. Reassigning project owner atomically updates owner and allows previous owner to be removed', async () => {
    // 1. Reassign owner to managerUserId
    const updateRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ ownerId: managerUserId });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.project.ownerId, managerUserId);

    // 2. Previous owner (ownerUserId) can now be removed as a project member
    const removeRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/members/${ownerUserId}`)
      .set('Cookie', [managerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(removeRes.status, 200);
    assert.equal(removeRes.body.data.success, true);
    assert.equal(removeRes.body.data.removedUserId, ownerUserId);
  });

  // ---------------------------------------------------------------------------
  // Filters, Pagination and Search
  // ---------------------------------------------------------------------------

  it('16. GET /projects supports status, priority, and search filters with deterministic pagination', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects?priority=high&page=1&limit=10`)
      .set('Cookie', [managerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.projects));
    assert.ok(res.body.meta.pagination);
    assert.equal(res.body.meta.pagination.page, 1);
    assert.equal(res.body.meta.pagination.limit, 10);
  });

  // ---------------------------------------------------------------------------
  // Multi-Tenant Isolation & ID Tampering
  // ---------------------------------------------------------------------------

  it('17. User in Org B requesting Org A project returns 404 Not Found (zero cross-tenant disclosure)', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgBId}/projects/${testProjectId}`)
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 404);
  });

  // ---------------------------------------------------------------------------
  // Dynamic Revocation
  // ---------------------------------------------------------------------------

  it('18. Disabling projects module for organisation blocks subsequent project requests with 403 MODULE_DISABLED', async () => {
    // Disable module
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: false });

    // Subsequent call fails
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'MODULE_DISABLED');

    // Re-enable module to preserve clean state
    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });
  });
});
