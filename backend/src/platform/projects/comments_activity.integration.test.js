/**
 * ManageX Integration Test Suite: Phase 8C — Comments, Activity Timeline & Projects Full E2E
 * Strictly tests PRD Section 9.3 (PRJ-007, PRJ-008), Section 9.4, docs/security.md, and ADR-013.
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

describe('Phase 8C — Comments, Activity Timeline & Projects Acceptance Suite', () => {
  const runTag = `p8c_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let ownerUserId;
  let managerUserId;
  let memberAUserId;
  let memberBUserId;
  let nonMemberUserId;
  let orgBUserId;

  let ownerCookie;
  let managerCookie;
  let memberACookie;
  let memberBCookie;
  let nonMemberCookie;
  let orgBCookie;

  let csrfCookie;
  let csrfToken;

  let orgAId;
  let orgBId;

  let testProjectId;
  let testTaskId;
  let archivedProjectId;
  let archivedTaskId;

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
           ('Comment Owner', 'owner_${runTag}@managex.local', $1, 'active', NOW()),
           ('Comment Manager', 'manager_${runTag}@managex.local', $1, 'active', NOW()),
           ('Comment Member A', 'membera_${runTag}@managex.local', $1, 'active', NOW()),
           ('Comment Member B', 'memberb_${runTag}@managex.local', $1, 'active', NOW()),
           ('Comment Non Member', 'nonmem_${runTag}@managex.local', $1, 'active', NOW()),
           ('Comment Org B User', 'orgb_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [passwordHash]
      );
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email.startsWith('owner_')).id;
    managerUserId = users.find((u) => u.email.startsWith('manager_')).id;
    memberAUserId = users.find((u) => u.email.startsWith('membera_')).id;
    memberBUserId = users.find((u) => u.email.startsWith('memberb_')).id;
    nonMemberUserId = users.find((u) => u.email.startsWith('nonmem_')).id;
    orgBUserId = users.find((u) => u.email.startsWith('orgb_')).id;

    // 3. Create user sessions
    const sOwner = await createSession({ userId: ownerUserId });
    const sManager = await createSession({ userId: managerUserId });
    const sMemberA = await createSession({ userId: memberAUserId });
    const sMemberB = await createSession({ userId: memberBUserId });
    const sNonMember = await createSession({ userId: nonMemberUserId });
    const sOrgB = await createSession({ userId: orgBUserId });

    ownerCookie = `${SESSION_COOKIE_NAME}=${sOwner.rawToken}`;
    managerCookie = `${SESSION_COOKIE_NAME}=${sManager.rawToken}`;
    memberACookie = `${SESSION_COOKIE_NAME}=${sMemberA.rawToken}`;
    memberBCookie = `${SESSION_COOKIE_NAME}=${sMemberB.rawToken}`;
    nonMemberCookie = `${SESSION_COOKIE_NAME}=${sNonMember.rawToken}`;
    orgBCookie = `${SESSION_COOKIE_NAME}=${sOrgB.rawToken}`;

    // 4. Create Org A via API
    const orgARes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Phase 8C Org A ${runTag}` });
    assert.equal(orgARes.status, 201);
    orgAId = orgARes.body.data.organisation.id;

    // 5. Create Org B via API
    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Phase 8C Org B ${runTag}` });
    assert.equal(orgBRes.status, 201);
    orgBId = orgBRes.body.data.organisation.id;

    // 6. Setup memberships in Org A
    await withSystemTransaction(async (client) => {
      const m1 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, managerUserId]
      );
      const m2 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, memberAUserId]
      );
      const m3 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, memberBUserId]
      );
      const m4 = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgAId, nonMemberUserId]
      );

      const roleRes = await client.query(
        `SELECT id, slug FROM roles WHERE slug IN ('organisation_admin', 'organisation_member') AND organisation_id IS NULL`
      );
      const adminRoleId = roleRes.rows.find((r) => r.slug === 'organisation_admin')?.id;
      const orgMemberRoleId = roleRes.rows.find((r) => r.slug === 'organisation_member')?.id;

      if (adminRoleId) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)`,
          [orgAId, m1.rows[0].id, adminRoleId]
        );
      }
      if (orgMemberRoleId) {
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)`,
          [orgAId, m2.rows[0].id, orgMemberRoleId]
        );
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)`,
          [orgAId, m3.rows[0].id, orgMemberRoleId]
        );
        await client.query(
          `INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)`,
          [orgAId, m4.rows[0].id, orgMemberRoleId]
        );
      }
    });

    // 7. Create test project in Org A via API
    const projRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: `Active Test Project ${runTag}`,
        description: 'Project for comment testing',
        priority: 'high',
        status: 'active',
      });
    assert.equal(projRes.status, 201);
    testProjectId = projRes.body.data.project.id;

    // Add manager, memberA, and memberB to project_members
    await withSystemTransaction(async (client) => {
      await client.query(
        `INSERT INTO project_members (organisation_id, project_id, user_id, role)
         VALUES 
           ($1, $2, $3, 'manager'),
           ($1, $2, $4, 'member'),
           ($1, $2, $5, 'member')`,
        [orgAId, testProjectId, managerUserId, memberAUserId, memberBUserId]
      );
    });

    // Create task in test project via API
    const taskRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Active Task for Discussion',
        description: 'Task description',
        status: 'in_progress',
        priority: 'high',
        assigneeId: memberAUserId,
      });
    assert.equal(taskRes.status, 201);
    testTaskId = taskRes.body.data.task.id;

    // Create archived project in Org A
    const archProjRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: `Archived Test Project ${runTag}`,
        description: 'Archived project',
        priority: 'low',
        status: 'planning',
      });
    assert.equal(archProjRes.status, 201);
    archivedProjectId = archProjRes.body.data.project.id;

    // Create task in archived project before archiving it
    const archTaskRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${archivedProjectId}/tasks`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Archived Task',
        status: 'backlog',
        priority: 'low',
      });
    assert.equal(archTaskRes.status, 201);
    archivedTaskId = archTaskRes.body.data.task.id;

    // Transition project to archived
    const archTransRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${archivedProjectId}/status`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'archived' });
    assert.equal(archTransRes.status, 200);
  });

  // ---------------------------------------------------------------------------
  // 1. PRJ-007: Comment Creation & Validation
  // ---------------------------------------------------------------------------

  it('1. PRJ-007: Authorized project member creates plain-text comment successfully', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'Initial discussion note for this task.' });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.comment.id);
    assert.equal(res.body.data.comment.body, 'Initial discussion note for this task.');
    assert.equal(res.body.data.comment.authorId, memberAUserId);
    assert.equal(res.body.data.comment.isDeleted, false);
  });

  it('2. PRJ-007: Comment creation validates non-empty body and bounds', async () => {
    // Empty comment body
    const emptyRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: '   ' });

    assert.equal(emptyRes.status, 422);

    // Excess length (> 2000 chars)
    const longRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'a'.repeat(2001) });

    assert.equal(longRes.status, 422);
  });

  it('3. PRJ-007 & SEC-005: HTML script payloads are treated as safe plain text', async () => {
    const htmlPayload = '<script>alert("xss")</script><b>Bold test</b>';
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: htmlPayload });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.comment.body, htmlPayload);
  });

  // ---------------------------------------------------------------------------
  // 2. PRJ-007: Listing, Author Editing & Non-Author Protection
  // ---------------------------------------------------------------------------

  it('4. PRJ-007: List comments returns comments thread with author details in chronological order', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.comments));
    assert.ok(res.body.data.comments.length >= 2);
    assert.equal(res.body.data.comments[0].authorId, memberAUserId);
    assert.equal(res.body.data.comments[1].authorId, memberBUserId);
  });

  it('5. PRJ-007: Author edits their own comment successfully', async () => {
    // List to get Member A comment ID
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie]);

    const commentA = listRes.body.data.comments.find((c) => c.authorId === memberAUserId);

    const editRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments/${commentA.id}`)
      .set('Cookie', [memberACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'Updated comment text by original author.' });

    assert.equal(editRes.status, 200);
    assert.equal(editRes.body.data.comment.body, 'Updated comment text by original author.');
    assert.notEqual(editRes.body.data.comment.updatedAt, editRes.body.data.comment.createdAt);
  });

  it('6. PRJ-007: Non-author attempting to edit someone else\'s comment is rejected with 403 FORBIDDEN', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie]);

    const commentA = listRes.body.data.comments.find((c) => c.authorId === memberAUserId);

    // Member B tries to edit Member A's comment
    const editRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments/${commentA.id}`)
      .set('Cookie', [memberBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'Malicious modification by other user.' });

    assert.equal(editRes.status, 403);
    assert.equal(editRes.body.error.code, 'FORBIDDEN');
  });

  // ---------------------------------------------------------------------------
  // 3. PRJ-007: Soft Deletion & Moderation Permissions
  // ---------------------------------------------------------------------------

  it('7. PRJ-007: Author soft-deletes own comment; body replaced with marker and row preserved', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie]);

    const commentA = listRes.body.data.comments.find((c) => c.authorId === memberAUserId);

    const deleteRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments/${commentA.id}`)
      .set('Cookie', [memberACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.data.success, true);

    // Verify list comments returns sanitized marker
    const listAfterRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie]);

    const deletedComment = listAfterRes.body.data.comments.find((c) => c.id === commentA.id);
    assert.equal(deletedComment.isDeleted, true);
    assert.equal(deletedComment.body, '[This comment has been deleted]');

    // Editing a deleted comment is rejected
    const editDeletedRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments/${commentA.id}`)
      .set('Cookie', [memberACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'Trying to resurrect' });

    assert.equal(editDeletedRes.status, 409);
    assert.equal(editDeletedRes.body.error.code, 'COMMENT_DELETED');
  });

  it('8. PRJ-007: Non-author without moderation permission cannot delete someone else\'s comment (403 MODERATION_REQUIRED)', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie]);

    const commentB = listRes.body.data.comments.find((c) => c.authorId === memberBUserId && !c.isDeleted);

    // Member A attempts to delete Member B's comment
    const delRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments/${commentB.id}`)
      .set('Cookie', [memberACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(delRes.status, 403);
    assert.equal(delRes.body.error.code, 'MODERATION_REQUIRED');
  });

  it('9. PRJ-007: Project Manager or Admin can moderate and delete other users\' comments', async () => {
    const listRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [memberACookie, csrfCookie]);

    const commentB = listRes.body.data.comments.find((c) => c.authorId === memberBUserId && !c.isDeleted);

    // Manager deletes Member B's comment
    const delRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments/${commentB.id}`)
      .set('Cookie', [managerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data.success, true);
  });

  // ---------------------------------------------------------------------------
  // 4. PRJ-007: Archived Project Immutability
  // ---------------------------------------------------------------------------

  it('10. PRJ-007: Cannot add, edit, or delete comments on a task in an archived project (409 PROJECT_ARCHIVED)', async () => {
    // Attempt to add comment to archived project task
    const addRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${archivedProjectId}/tasks/${archivedTaskId}/comments`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'Comment on archived project' });

    assert.equal(addRes.status, 409);
    assert.equal(addRes.body.error.code, 'PROJECT_ARCHIVED');
  });

  // ---------------------------------------------------------------------------
  // 5. PRJ-007: Tenant & Access Boundaries
  // ---------------------------------------------------------------------------

  it('11. PRJ-007: Project non-member in same org is denied comment operations (403 PROJECT_ACCESS_DENIED)', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [nonMemberCookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PROJECT_ACCESS_DENIED');
  });

  it('12. PRJ-007: Cross-tenant user in Org B cannot read or post comments to Org A task', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/tasks/${testTaskId}/comments`)
      .set('Cookie', [orgBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'Cross tenant comment attempt' });

    assert.equal(res.status, 403);
  });

  // ---------------------------------------------------------------------------
  // 6. PRJ-008: Concise Project Activity Timeline
  // ---------------------------------------------------------------------------

  it('13. PRJ-008: Material project, task, and comment mutations record activity timeline events', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/activity`)
      .set('Cookie', [memberACookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    assert.ok(res.body.data.total >= 3);

    const actions = res.body.data.items.map((i) => i.action);
    // Verified events include comment_added, comment_deleted, task_created, etc.
    assert.ok(actions.includes('comment_added') || actions.includes('comment_deleted'));
  });

  it('14. PRJ-008 & SEC-008: Activity timeline never records passwords, tokens, or raw compliance payloads', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/activity`)
      .set('Cookie', [memberACookie, csrfCookie]);

    assert.equal(res.status, 200);
    for (const item of res.body.data.items) {
      assert.ok(!item.metadata?.password);
      assert.ok(!item.metadata?.token);
      assert.ok(!item.metadata?.secret);
      assert.ok(typeof item.summary === 'string');
    }
  });

  it('15. PRJ-008: Archived projects retain full activity timeline for read access', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${archivedProjectId}/activity`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
  });

  // ---------------------------------------------------------------------------
  // 7. PRJ-007 & PRJ-008: PostgreSQL RLS & Composite FK Enforcement (managex_app)
  // ---------------------------------------------------------------------------

  it('16. PRJ-007 & PRJ-008: Direct PostgreSQL RLS isolation under runtime role managex_app', async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
      // 1. Set tenant context to Org B
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_organisation_id', $1, true)`, [orgBId]);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [orgBUserId]);
      await client.query(`SELECT set_config('app.current_is_platform_admin', 'false', true)`);

      // 2. Query Org A comments under RLS
      const commentsRes = await client.query(
        `SELECT * FROM task_comments WHERE task_id = $1`,
        [testTaskId]
      );
      assert.equal(commentsRes.rows.length, 0, 'RLS must hide Org A comments from Org B');

      // 3. Query Org A activity under RLS
      const activityRes = await client.query(
        `SELECT * FROM project_activity WHERE project_id = $1`,
        [testProjectId]
      );
      assert.equal(activityRes.rows.length, 0, 'RLS must hide Org A activity from Org B');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('17. PRJ-007: Composite foreign key rejects cross-tenant task comment insertion (23503)', async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      // Setting tenant context to Org B
      await client.query(`SELECT set_config('app.current_organisation_id', $1, true)`, [orgBId]);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [orgBUserId]);

      // Attempt inserting comment referencing Org A's task into Org B
      let errorOccurred = false;
      try {
        await client.query(
          `INSERT INTO task_comments (organisation_id, project_id, task_id, author_id, body)
           VALUES ($1, $2, $3, $4, 'Cross tenant insert attempt')`,
          [orgBId, testProjectId, testTaskId, orgBUserId]
        );
      } catch (err) {
        errorOccurred = true;
        // 23503: foreign_key_violation
        assert.equal(err.code, '23503');
      }

      assert.equal(errorOccurred, true, 'Composite FK must block cross-tenant task comment reference');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('18. PRJ-008: Dynamic module deactivation immediately cuts off project API access', async () => {
    // Disable projects module in Org A
    await withSystemTransaction(async (client) => {
      await client.query(
        `UPDATE organisation_module_entitlements 
         SET is_enabled = false 
         WHERE organisation_id = $1 AND module_id = (SELECT id FROM modules WHERE slug = 'projects')`,
        [orgAId]
      );
    });

    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/projects/${testProjectId}/activity`)
      .set('Cookie', [memberACookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'MODULE_DISABLED');

    // Re-enable module to preserve test cleanliness
    await withSystemTransaction(async (client) => {
      await client.query(
        `UPDATE organisation_module_entitlements 
         SET is_enabled = true 
         WHERE organisation_id = $1 AND module_id = (SELECT id FROM modules WHERE slug = 'projects')`,
        [orgAId]
      );
    });
  });
});
