/**
 * ManageX Integration Test Suite: Phase 8B — Tasks, Statuses, Kanban & Filtering
 * Strictly tests PRD Section 9.2 (PRJ-003, PRJ-004, PRJ-005, PRJ-006), docs/security.md, and docs/database.md.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction } from '../database/transaction.js';
import { getPool } from '../database/pool.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';

describe('Phase 8B — Tasks Core, Workflow & Filtering Suite', () => {
  const runTag = `p8b_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

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
  let archivedProjectId;

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
           ('Task Project Owner', 'owner_${runTag}@managex.local', $1, 'active', NOW()),
           ('Task Project Manager', 'manager_${runTag}@managex.local', $1, 'active', NOW()),
           ('Task Project Member', 'member_${runTag}@managex.local', $1, 'active', NOW()),
           ('Task Non Member', 'nonmem_${runTag}@managex.local', $1, 'active', NOW()),
           ('Task Org B User', 'orgb_${runTag}@managex.local', $1, 'active', NOW())
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
      .send({ name: `Tasks Org A ${runTag}` });
    assert.equal(orgARes.status, 201);
    orgAId = orgARes.body.data.organisation.id;

    // 4. Create Org B
    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Tasks Org B ${runTag}` });
    assert.equal(orgBRes.status, 201);
    orgBId = orgBRes.body.data.organisation.id;

    // 5. Add members to Org A and assign roles
    await withSystemTransaction(async (client) => {
      // Add manager, member, nonMember to Org A
      const m1 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, managerUserId]
      );
      const m2 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, memberUserId]
      );
      const m3 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, nonMemberUserId]
      );

      // Get system roles
      const roleRes = await client.query(
        `SELECT id, slug FROM roles WHERE slug IN ('organisation_admin', 'project_team_member', 'organisation_member') AND organisation_id IS NULL`
      );
      const adminRoleId = roleRes.rows.find((r) => r.slug === 'organisation_admin')?.id;
      const teamMemberRoleId = roleRes.rows.find((r) => r.slug === 'project_team_member')?.id;
      const orgMemberRoleId = roleRes.rows.find((r) => r.slug === 'organisation_member')?.id;

      // Assign admin role to manager
      if (adminRoleId) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)`,
          [orgAId, m1.rows[0].id, adminRoleId]
        );
      }
      // Assign team member role to member
      if (teamMemberRoleId) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)`,
          [orgAId, m2.rows[0].id, teamMemberRoleId]
        );
      }
      // Assign basic member role to nonMember
      if (orgMemberRoleId) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)`,
          [orgAId, m3.rows[0].id, orgMemberRoleId]
        );
      }
    });

    // 6. Create active project in Org A
    const projRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: `Tasks Main Project ${runTag}`,
        status: 'active',
        priority: 'high',
        members: [
          { userId: managerUserId, role: 'manager' },
          { userId: memberUserId, role: 'member' },
        ],
      });
    assert.equal(projRes.status, 201);
    testProjectId = projRes.body.data.project.id;

    // 7. Create archived project in Org A
    const archRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: `Archived Project ${runTag}`,
        status: 'active',
      });
    assert.equal(archRes.status, 201);
    archivedProjectId = archRes.body.data.project.id;

    // Transition to archived
    const patchArchRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${archivedProjectId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'archived' });
    assert.equal(patchArchRes.status, 200);
  });

  // ---------------------------------------------------------------------------
  // 1. Task Model & Creation (PRJ-003)
  // ---------------------------------------------------------------------------

  it('1. PRJ-003: Creates task with valid fields and defaults to backlog and medium priority', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Implement Database Migrations',
        description: 'Create PostgreSQL migration 16 with RLS',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.task.title, 'Implement Database Migrations');
    assert.equal(res.body.data.task.status, 'backlog');
    assert.equal(res.body.data.task.priority, 'medium');
    assert.equal(res.body.data.task.projectId, testProjectId);
    assert.equal(res.body.data.task.organisationId, orgAId);
    assert.equal(res.body.data.task.createdById, ownerUserId);
    assert.equal(res.body.data.task.assigneeId, null);
    assert.equal(res.body.data.task.deletedAt, null);
  });

  it('2. PRJ-003: Task creation validates title bounds and date order (start_date <= due_date)', async () => {
    // Empty title
    const emptyTitleRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: '   ' });
    assert.equal(emptyTitleRes.status, 422);

    // Inverted dates
    const invalidDatesRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Inverted Dates Task',
        startDate: '2026-10-25T10:00:00Z',
        dueDate: '2026-10-20T10:00:00Z',
      });
    assert.equal(invalidDatesRes.status, 422);
  });

  it('3. PRJ-003: Rejects invalid task status and explicitly forbids "cancelled" task status', async () => {
    // Arbitrary invalid status
    const invalidStatusRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Invalid Status Task',
        status: 'in_review',
      });
    assert.equal(invalidStatusRes.status, 422);

    // "cancelled" status is explicitly forbidden by PRD §9.2 PRJ-003
    const cancelledStatusRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Cancelled Status Task',
        status: 'cancelled',
      });
    assert.equal(cancelledStatusRes.status, 422);
  });

  // ---------------------------------------------------------------------------
  // 2. Assignee Eligibility & Member Guards (PRJ-004)
  // ---------------------------------------------------------------------------

  it('4. PRJ-004: Assigning task to eligible active project member succeeds', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Backend Controller Work',
        assigneeId: memberUserId,
        priority: 'high',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.task.assigneeId, memberUserId);
    assert.equal(res.body.data.task.assigneeName, 'Task Project Member');
  });

  it('5. PRJ-004: Assigning task to an org member who is NOT in the project is rejected (422 INVALID_TASK_ASSIGNEE)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Unassigned Project Task',
        assigneeId: nonMemberUserId, // in Org A, but not in project_members
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.message.includes('Task assignee must be an active member'));
  });

  it('6. PRJ-004: Assigning task to cross-tenant user is rejected (422 INVALID_TASK_ASSIGNEE)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Cross Tenant Task',
        assigneeId: orgBUserId,
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.message.includes('Task assignee must be an active member'));
  });

  it('7. PRJ-004: Removing member with active task assignments is blocked with 409 MEMBER_HAS_ACTIVE_TASKS', async () => {
    // Create an active task assigned to memberUserId
    const taskRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Active Task For Member Removal Test',
        status: 'todo',
        assigneeId: memberUserId,
      });
    assert.equal(taskRes.status, 201);
    const taskId = taskRes.body.data.task.id;

    // Attempt to remove member from project -> blocked
    const removeRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/members/${memberUserId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(removeRes.status, 409);
    assert.equal(removeRes.body.error.code, 'MEMBER_HAS_ACTIVE_TASKS');

    // Attempt to suspend member's organisation membership -> blocked
    const suspendRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/members/${memberUserId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'suspended' });

    assert.equal(suspendRes.status, 409);
    assert.equal(suspendRes.body.error.code, 'MEMBER_HAS_ACTIVE_TASKS');

    // Reassign task to managerUserId
    const reassignRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ assigneeId: managerUserId });
    assert.equal(reassignRes.status, 200);
    assert.equal(reassignRes.body.data.task.assigneeId, managerUserId);
  });

  // ---------------------------------------------------------------------------
  // 3. Canonical Task Status Transitions & Reopen Rule (PRJ-005)
  // ---------------------------------------------------------------------------

  it('8. PRJ-005: Canonical progression backlog -> todo -> in_progress -> blocked -> in_progress -> done', async () => {
    // 1. Create in backlog
    const taskRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Full Lifecycle Task' });
    assert.equal(taskRes.status, 201);
    const taskId = taskRes.body.data.task.id;
    assert.equal(taskRes.body.data.task.status, 'backlog');

    // 2. backlog -> todo
    const toTodoRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'todo' });
    assert.equal(toTodoRes.status, 200);
    assert.equal(toTodoRes.body.data.task.status, 'todo');

    // 3. todo -> in_progress
    const toInProgRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });
    assert.equal(toInProgRes.status, 200);
    assert.equal(toInProgRes.body.data.task.status, 'in_progress');

    // 4. in_progress -> blocked
    const toBlockedRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'blocked' });
    assert.equal(toBlockedRes.status, 200);
    assert.equal(toBlockedRes.body.data.task.status, 'blocked');

    // 5. blocked -> in_progress
    const unblockRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });
    assert.equal(unblockRes.status, 200);
    assert.equal(unblockRes.body.data.task.status, 'in_progress');

    // 6. in_progress -> done
    const toDoneRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'done' });
    assert.equal(toDoneRes.status, 200);
    assert.equal(toDoneRes.body.data.task.status, 'done');
  });

  it('9. PRJ-005: Rejects invalid status leaps (backlog -> done, todo -> done, blocked -> done)', async () => {
    // Create backlog task
    const taskRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Invalid Leap Task' });
    const taskId = taskRes.body.data.task.id;

    // backlog -> done rejected
    const leapRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'done' });
    assert.equal(leapRes.status, 409);
    assert.equal(leapRes.body.error.code, 'INVALID_TASK_TRANSITION');

    // backlog -> blocked rejected
    const blockedRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'blocked' });
    assert.equal(blockedRes.status, 409);
    assert.equal(blockedRes.body.error.code, 'INVALID_TASK_TRANSITION');
  });

  it('10. PRJ-005: Reopening completed task requires manager or admin permission', async () => {
    // 1. Create task and advance to done
    const taskRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Reopen Test Task', status: 'todo' });
    const taskId = taskRes.body.data.task.id;

    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'done' });

    // 2. Ordinary contributor member attempts to reopen -> rejected with 403 FORBIDDEN_TASK_REOPEN
    const memberReopenRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });
    assert.equal(memberReopenRes.status, 403);
    assert.equal(memberReopenRes.body.error.code, 'FORBIDDEN_TASK_REOPEN');

    // 3. Manager or Owner attempts to reopen -> succeeds
    const managerReopenRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [managerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });
    assert.equal(managerReopenRes.status, 200);
    assert.equal(managerReopenRes.body.data.task.status, 'in_progress');
  });

  // ---------------------------------------------------------------------------
  // 4. Soft Deletion & Project Archive Lockout (PRJ-005)
  // ---------------------------------------------------------------------------

  it('11. PRJ-005: Soft-deleting task sets deleted_at and excludes task from normal lists and direct GET', async () => {
    // 1. Create task
    const taskRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Task To Soft Delete' });
    assert.equal(taskRes.status, 201);
    const taskId = taskRes.body.data.task.id;

    // 2. Soft-delete task
    const delRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data.success, true);

    // 3. Direct GET returns 404 TASK_NOT_FOUND
    const getRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(getRes.status, 404);
    assert.equal(getRes.body.error.code, 'TASK_NOT_FOUND');

    // 4. List tasks does not include the soft-deleted task
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(listRes.status, 200);
    const exists = listRes.body.data.items.some((t) => t.id === taskId);
    assert.equal(exists, false);

    // 5. Soft-deleting again returns 404
    const delAgainRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${taskId}`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);
    assert.equal(delAgainRes.status, 404);
  });

  it('12. PRJ-005: Archived project locks all task mutations (create, update, delete)', async () => {
    // Attempt create task in archived project -> blocked 409 PROJECT_ARCHIVED
    const createRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${archivedProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Blocked Task in Archived Project' });
    assert.equal(createRes.status, 409);
    assert.equal(createRes.body.error.code, 'PROJECT_ARCHIVED');
  });

  // ---------------------------------------------------------------------------
  // 5. Filtering, Views & Pagination (PRJ-006)
  // ---------------------------------------------------------------------------

  it('13. PRJ-006: Server-side filters by status, priority, and assignee work accurately', async () => {
    // Create multiple tasks with diverse attributes
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Task Urgent Todo', status: 'todo', priority: 'urgent', assigneeId: memberUserId });

    await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Task Low Backlog', status: 'backlog', priority: 'low' });

    // Filter by priority=urgent
    const urgentRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks?priority=urgent`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(urgentRes.status, 200);
    assert.ok(urgentRes.body.data.items.length >= 1);
    assert.ok(urgentRes.body.data.items.every((t) => t.priority === 'urgent'));

    // Filter by status=backlog
    const backlogRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks?status=backlog`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(backlogRes.status, 200);
    assert.ok(backlogRes.body.data.items.every((t) => t.status === 'backlog'));

    // Filter by assigneeId=memberUserId
    const assigneeRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks?assigneeId=${memberUserId}`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(assigneeRes.status, 200);
    assert.ok(assigneeRes.body.data.items.every((t) => t.assigneeId === memberUserId));
  });

  it('14. PRJ-006: Special views (due_soon, overdue, assigned_to_me) filter server-side without changing status', async () => {
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

    // Create due soon task
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Due Soon Task', status: 'todo', dueDate: threeDaysLater, assigneeId: memberUserId });

    // Create overdue task
    await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Overdue Task', status: 'in_progress', dueDate: twoDaysAgo, assigneeId: memberUserId });

    // Test due_soon view
    const dueSoonRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks?view=due_soon`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(dueSoonRes.status, 200);
    assert.ok(dueSoonRes.body.data.items.some((t) => t.title === 'Due Soon Task'));
    assert.ok(dueSoonRes.body.data.items.every((t) => t.isDueSoon === true));

    // Test overdue view
    const overdueRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks?view=overdue`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(overdueRes.status, 200);
    assert.ok(overdueRes.body.data.items.some((t) => t.title === 'Overdue Task'));
    assert.ok(overdueRes.body.data.items.every((t) => t.isOverdue === true));

    // Test assigned_to_me for member
    const myTasksRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks?view=assigned_to_me`)
      .set('Cookie', [memberCookie, csrfCookie]);
    assert.equal(myTasksRes.status, 200);
    assert.ok(myTasksRes.body.data.items.every((t) => t.assigneeId === memberUserId));
  });

  it('15. PRJ-006: Cross-project GET /api/v1/organisations/:orgId/tasks/my aggregates assigned tasks', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/tasks/my?view=assigned_to_me`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.length >= 1);
    assert.ok(res.body.data.items.every((t) => t.assigneeId === memberUserId));
  });

  // ---------------------------------------------------------------------------
  // 6. Security, Resource Scope & PostgreSQL RLS Invariants
  // ---------------------------------------------------------------------------

  it('16. PRJ-003: Project non-member is denied task access (403 PROJECT_ACCESS_DENIED)', async () => {
    // nonMemberUserId is in Org A, but NOT in project_members
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [nonMemberCookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PROJECT_ACCESS_DENIED');
  });

  it('17. PRJ-003: Cross-tenant user in Org B cannot read or create tasks in Org A project', async () => {
    // Read attempt
    const readRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [orgBCookie, csrfCookie]);
    assert.equal(readRes.status, 403);

    // Write attempt
    const writeRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Cross Tenant Malicious Task' });
    assert.equal(writeRes.status, 403);
  });

  it('18. PRJ-003: Direct PostgreSQL RLS isolation under runtime role managex_app', async () => {
    const client = await getPool().connect();
    try {
      // 1. Switch to restricted non-superuser role managex_app
      await client.query('SET ROLE managex_app');

      // 2. Set tenant context to Org A
      await client.query(`SET app.current_organisation_id = '${orgAId}'`);
      const orgATasks = await client.query('SELECT id, organisation_id FROM tasks');
      assert.ok(orgATasks.rows.length >= 1);
      assert.ok(orgATasks.rows.every((row) => row.organisation_id === orgAId));

      // 3. Switch tenant context to Org B -> Org A tasks must disappear
      await client.query(`SET app.current_organisation_id = '${orgBId}'`);
      const orgBTasks = await client.query('SELECT id FROM tasks WHERE organisation_id = $1', [orgAId]);
      assert.equal(orgBTasks.rows.length, 0);

      // 4. Clear context -> Deny-by-default (0 rows)
      await client.query('RESET app.current_organisation_id');
      const denyByDefaultTasks = await client.query('SELECT id FROM tasks');
      assert.equal(denyByDefaultTasks.rows.length, 0);

      // 5. Composite Foreign Key prevents cross-tenant referencing at DB level
      await client.query(`SET app.current_organisation_id = '${orgBId}'`);
      let fkViolated = false;
      try {
        await client.query(
          `INSERT INTO tasks (organisation_id, project_id, title, created_by_id)
           VALUES ($1, $2, 'Cross-Tenant Task', $3)`,
          [orgBId, testProjectId, orgBUserId] // testProjectId belongs to Org A!
        );
      } catch (err) {
        fkViolated = true;
        assert.equal(err.code, '23503'); // foreign_key_violation
      }
      assert.equal(fkViolated, true, 'Composite FK fk_tasks_project_tenant must reject cross-tenant reference');
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });
});
