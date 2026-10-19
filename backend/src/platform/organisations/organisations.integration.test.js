/**
 * ManageX Organisation Lifecycle, Membership & Invitation Integration Test Suite
 * Strictly adheres to docs/testing.md (Suite C), ADR-001, ADR-002, ADR-004, and PRD Section 6.2 (ORG-001 - ORG-010).
 * 
 * Verifies live against PostgreSQL 17:
 * - Atomic organisation creation & owner assignment (ORG-001)
 * - Accessible organisation listing (ORG-002)
 * - Member listing & role/status updates (ORG-004, ORG-007)
 * - Final owner protection (ORG-008)
 * - Step-up ownership transfer with password reauthentication (ORG-008)
 * - Invitation dispatch, token hashing, single-use acceptance & email matching (ORG-005, ORG-006)
 * - Leave organisation preserving last-owner invariant (ORG-010)
 * - Immutable audit log generation for all lifecycle events (AUD-001)
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getPool, closePool } from '../database/pool.js';
import { withTenantTransaction, withSystemTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { getTestMailbox, clearTestMailbox, setTransporterForTesting } from '../email/emailService.js';

describe('Organisation Lifecycle & Membership Suite (Phase 4)', () => {
  const app = createApp();
  const pool = getPool();

  const ownerEmail = 'owner.org.test@managex.local';
  const memberEmail = 'member.org.test@managex.local';
  const outsiderEmail = 'outsider.org.test@managex.local';
  const ownerPassword = 'OwnerPassword123!@#';
  const memberPassword = 'MemberPassword123!@#';

  let ownerUser;
  let memberUser;
  let outsiderUser;
  let ownerSessionCookie = '';
  let memberSessionCookie = '';
  let csrfCookie = '';
  let csrfToken = '';

  let createdOrgId = '';
  let invitationRawToken = '';
  const testState = {};

  const systemQuery = (sql, params, orgId) => withTenantTransaction({ organisationId: orgId, isPlatformAdmin: true }, (client) => client.query(sql, params));

  before(async () => {
    clearTestMailbox();

    // Clean up any existing test records inside system transaction (bypasses RLS)
    await withSystemTransaction(async (client) => {
      await client.query("DELETE FROM invitations WHERE organisation_id IN (SELECT id FROM organisations WHERE slug IN ('nexus-innovations', 'nexus-duplicate'))");
      await client.query("DELETE FROM organisation_memberships WHERE organisation_id IN (SELECT id FROM organisations WHERE slug IN ('nexus-innovations', 'nexus-duplicate'))");
      await client.query("DELETE FROM organisations WHERE slug IN ('nexus-innovations', 'nexus-duplicate')");
      await client.query(`
        DELETE FROM organisation_memberships WHERE user_id IN (
          SELECT id FROM users WHERE LOWER(email) IN ($1, $2, $3)
        )
      `, [ownerEmail.toLowerCase(), memberEmail.toLowerCase(), outsiderEmail.toLowerCase()]);
      await client.query('DELETE FROM users WHERE LOWER(email) IN ($1, $2, $3)', [
        ownerEmail.toLowerCase(),
        memberEmail.toLowerCase(),
        outsiderEmail.toLowerCase(),
      ]);
    });

    // Create 3 active, verified test users
    const ownerHash = await hashPassword(ownerPassword);
    const memberHash = await hashPassword(memberPassword);
    const outsiderHash = await hashPassword(ownerPassword);

    const ownerRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
      VALUES ('Alice Owner', $1, $2, 'active', NOW())
      RETURNING id, full_name, email, password_hash
    `, [ownerEmail, ownerHash]);
    ownerUser = ownerRes.rows[0];

    const memberRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
      VALUES ('Bob Member', $1, $2, 'active', NOW())
      RETURNING id, full_name, email, password_hash
    `, [memberEmail, memberHash]);
    memberUser = memberRes.rows[0];

    const outsiderRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
      VALUES ('Charlie Outsider', $1, $2, 'active', NOW())
      RETURNING id, full_name, email, password_hash
    `, [outsiderEmail, outsiderHash]);
    outsiderUser = outsiderRes.rows[0];

    // Create active sessions for owner and member
    const ownerSess = await createSession({ userId: ownerUser.id });
    ownerSessionCookie = `${SESSION_COOKIE_NAME}=${ownerSess.rawToken}`;

    const memberSess = await createSession({ userId: memberUser.id });
    memberSessionCookie = `${SESSION_COOKIE_NAME}=${memberSess.rawToken}`;

    // Grab CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const c = cookies.find((item) => item.startsWith('managex_csrf='));
      if (c) {
        csrfCookie = c.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Organisation Creation (ORG-001)
  // ---------------------------------------------------------------------------
  test('1. ORG-001: Unauthenticated request to create organisation is rejected (401)', async () => {
    const res = await request(app)
      .post('/api/v1/organisations')
      .send({ name: 'Acme Corp' });

    assert.equal(res.status, 401);
  });

  test('2. ORG-001: Create organisation atomically creates org, owner membership, and role', async () => {
    const res = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Nexus Innovations',
        slug: 'nexus-innovations',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.organisation.name, 'Nexus Innovations');
    assert.equal(res.body.data.organisation.slug, 'nexus-innovations');
    assert.equal(res.body.data.organisation.role.slug, 'organisation_owner');

    createdOrgId = res.body.data.organisation.id;

    // Verify database state: membership and role exist
    const memberRes = await systemQuery(`
      SELECT m.id, m.status, r.slug AS role_slug
      FROM organisation_memberships m
      JOIN membership_roles mr ON mr.membership_id = m.id
      JOIN roles r ON r.id = mr.role_id
      WHERE m.organisation_id = $1 AND m.user_id = $2
    `, [createdOrgId, ownerUser.id]);

    assert.equal(memberRes.rows.length, 1);
    assert.equal(memberRes.rows[0].status, 'active');
    assert.equal(memberRes.rows[0].role_slug, 'organisation_owner');

    // Verify audit log entry exists (AUD-001)
    const auditRes = await systemQuery(
      "SELECT action, entity_type FROM audit_logs WHERE organisation_id = $1 AND action = 'org.create'",
      [createdOrgId],
      createdOrgId
    );
    assert.equal(auditRes.rows.length, 1);
  });

  test('3. ORG-001: Duplicate organisation slug fails with 409 conflict', async () => {
    const res = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Nexus Duplicate',
        slug: 'nexus-innovations',
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SLUG_ALREADY_EXISTS');
  });

  // ---------------------------------------------------------------------------
  // 2. Organisation Listing (ORG-002)
  // ---------------------------------------------------------------------------
  test('4. ORG-002: GET /api/v1/organisations lists only organisations user belongs to', async () => {
    // Owner sees Nexus Innovations
    const ownerList = await request(app)
      .get('/api/v1/organisations')
      .set('Cookie', [ownerSessionCookie]);

    assert.equal(ownerList.status, 200);
    assert.equal(ownerList.body.data.organisations.length, 1);
    assert.equal(ownerList.body.data.organisations[0].id, createdOrgId);
    assert.equal(ownerList.body.data.organisations[0].role.slug, 'organisation_owner');

    // Member currently belongs to 0 organisations
    const memberList = await request(app)
      .get('/api/v1/organisations')
      .set('Cookie', [memberSessionCookie]);

    assert.equal(memberList.status, 200);
    assert.equal(memberList.body.data.organisations.length, 0);
  });

  // ---------------------------------------------------------------------------
  // 3. Organisation Settings & Details (ORG-009)
  // ---------------------------------------------------------------------------
  test('5. ORG-009: GET /api/v1/organisations/:orgId returns details and verified permissions', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${createdOrgId}`)
      .set('Cookie', [ownerSessionCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.organisation.id, createdOrgId);
    assert.equal(res.body.data.membership.role.slug, 'organisation_owner');
    assert.ok(res.body.data.membership.permissions.includes('org.edit'));
    assert.ok(res.body.data.membership.permissions.includes('org.members.manage'));
  });

  test('6. ORG-009: Non-member is rejected with 403 on organisation endpoints', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${createdOrgId}`)
      .set('Cookie', [memberSessionCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'MEMBERSHIP_REQUIRED');
  });

  test('7. ORG-009: Owner can update organisation name and changes are audited', async () => {
    const res = await request(app)
      .patch(`/api/v1/organisations/${createdOrgId}`)
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Nexus Innovations Global' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.organisation.name, 'Nexus Innovations Global');

    const auditRes = await systemQuery(
      "SELECT metadata FROM audit_logs WHERE organisation_id = $1 AND action = 'org.update'",
      [createdOrgId],
      createdOrgId
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].metadata.name, 'Nexus Innovations Global');
  });

  // ---------------------------------------------------------------------------
  // 4. Invitations Flow (ORG-005, ORG-006)
  // ---------------------------------------------------------------------------
  test('8. ORG-005: Owner invites member by email (hashes token, sets 7d expiry, sends email)', async () => {
    clearTestMailbox();

    const res = await request(app)
      .post(`/api/v1/organisations/${createdOrgId}/invitations`)
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: memberEmail,
        roleSlug: 'organisation_admin',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.invitation.email, memberEmail.toLowerCase());
    assert.equal(res.body.data.invitation.role.slug, 'organisation_admin');
    assert.ok(res.body.data.invitation.rawToken);
    invitationRawToken = res.body.data.invitation.rawToken;

    // Verify token hashed in database (not plaintext)
    const dbInvite = await systemQuery('SELECT token_hash, status, expires_at FROM invitations WHERE id = $1', [
      res.body.data.invitation.id,
    ]);
    assert.equal(dbInvite.rows.length, 1);
    assert.notEqual(dbInvite.rows[0].token_hash, invitationRawToken);
    assert.equal(dbInvite.rows[0].status, 'pending');

    // Verify email was dispatched
    const mailbox = getTestMailbox();
    assert.equal(mailbox.length, 1);
    assert.equal(mailbox[0].to, memberEmail.toLowerCase());
    assert.ok(mailbox[0].text.includes(`/invitations/${invitationRawToken}/accept`));
  });

  test('9. ORG-005: GET /api/v1/invitations/:token allows safe unauthenticated inspection', async () => {
    const res = await request(app).get(`/api/v1/invitations/${invitationRawToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.invitation.email, memberEmail.toLowerCase());
    assert.equal(res.body.data.invitation.organisation.id, createdOrgId);
    assert.equal(res.body.data.invitation.role.slug, 'organisation_admin');
    assert.equal(res.body.data.invitation.status, 'pending');
  });

  test('10. ORG-006: Accepting invitation with mismatched email fails with 403 EMAIL_MISMATCH', async () => {
    // Owner is logged in as ownerEmail, but invite was sent to memberEmail
    const res = await request(app)
      .post(`/api/v1/invitations/${invitationRawToken}/accept`)
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'EMAIL_MISMATCH');
  });

  test('11. ORG-006: Matching user accepts invitation, becomes active member with invited role', async () => {
    const res = await request(app)
      .post(`/api/v1/invitations/${invitationRawToken}/accept`)
      .set('Cookie', [memberSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.organisationId, createdOrgId);

    // Verify member is now active in organisation
    const memberRes = await systemQuery(`
      SELECT m.status, r.slug AS role_slug
      FROM organisation_memberships m
      JOIN membership_roles mr ON mr.membership_id = m.id
      JOIN roles r ON r.id = mr.role_id
      WHERE m.organisation_id = $1 AND m.user_id = $2
    `, [createdOrgId, memberUser.id]);

    assert.equal(memberRes.rows.length, 1);
    assert.equal(memberRes.rows[0].status, 'active');
    assert.equal(memberRes.rows[0].role_slug, 'organisation_admin');

    // Verify invitation marked accepted
    const inviteCheck = await systemQuery('SELECT status FROM invitations WHERE organisation_id = $1', [createdOrgId]);
    assert.equal(inviteCheck.rows[0].status, 'accepted');
  });

  test('12. ORG-005: Replaying accepted invitation is rejected with 409 INVITATION_ALREADY_USED', async () => {
    const res = await request(app)
      .post(`/api/v1/invitations/${invitationRawToken}/accept`)
      .set('Cookie', [memberSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVITATION_ALREADY_USED');
  });

  test('13. ORG-005: Inviting an already-active member fails with 409 ALREADY_MEMBER', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${createdOrgId}/invitations`)
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: memberEmail,
        roleSlug: 'organisation_member',
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ALREADY_MEMBER');
  });

  // ---------------------------------------------------------------------------
  // 5. Membership Management & Invariants (ORG-007, ORG-008)
  // ---------------------------------------------------------------------------
  test('14. ORG-007: Admin cannot grant Owner role (Anti-escalation)', async () => {
    // memberUser is currently an Admin, tries to promote Charlie to Owner
    const res = await request(app)
      .patch(`/api/v1/organisations/${createdOrgId}/members/${outsiderUser.id}`)
      .set('Cookie', [memberSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ roleSlug: 'organisation_owner' });

    assert.equal(res.status, 403);
  });

  test('15. ORG-008: Final owner protection blocks demoting or removing the sole owner', async () => {
    // Attempt to demote Alice Owner when Alice is the sole Owner
    const res = await request(app)
      .patch(`/api/v1/organisations/${createdOrgId}/members/${ownerUser.id}`)
      .set('Cookie', [memberSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ roleSlug: 'organisation_member' });

    // Admin cannot modify Owner, and Owner is protected
    assert.equal(res.status, 403);
  });

  test('16. ORG-010: Final owner cannot leave the organisation', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${createdOrgId}/leave`)
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'FINAL_OWNER_CANNOT_LEAVE');
  });

  // ---------------------------------------------------------------------------
  // 6. Step-Up Ownership Transfer (ORG-008)
  // ---------------------------------------------------------------------------
  test('17. ORG-008: Ownership transfer fails with incorrect password (401)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${createdOrgId}/transfer-owner`)
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        targetUserId: memberUser.id,
        password: 'WrongPassword999!',
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'STEP_UP_FAILED');
  });

  test('18. ORG-008: Ownership transfer succeeds with correct password, swaps roles atomically', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${createdOrgId}/transfer-owner`)
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        targetUserId: memberUser.id,
        password: ownerPassword,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify Bob Member is now Owner
    const bobRes = await systemQuery(`
      SELECT r.slug AS role_slug
      FROM organisation_memberships m
      JOIN membership_roles mr ON mr.membership_id = m.id
      JOIN roles r ON r.id = mr.role_id
      WHERE m.organisation_id = $1 AND m.user_id = $2
    `, [createdOrgId, memberUser.id]);
    assert.equal(bobRes.rows[0].role_slug, 'organisation_owner');

    // Verify Alice Owner is now Admin
    const aliceRes = await systemQuery(`
      SELECT r.slug AS role_slug
      FROM organisation_memberships m
      JOIN membership_roles mr ON mr.membership_id = m.id
      JOIN roles r ON r.id = mr.role_id
      WHERE m.organisation_id = $1 AND m.user_id = $2
    `, [createdOrgId, ownerUser.id]);
    assert.equal(aliceRes.rows[0].role_slug, 'organisation_admin');
  });

  // ---------------------------------------------------------------------------
  // 7. Non-Owner Leaves Organisation (ORG-010)
  // ---------------------------------------------------------------------------
  test('19. ORG-010: Non-owner member can leave successfully and loses access', async () => {
    // Alice is now Admin (not the sole owner), she can leave
    const res = await request(app)
      .post(`/api/v1/organisations/${createdOrgId}/leave`)
      .set('Cookie', [ownerSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Alice now receives 403 on organisation endpoints
    const checkRes = await request(app)
      .get(`/api/v1/organisations/${createdOrgId}`)
      .set('Cookie', [ownerSessionCookie]);

    assert.equal(checkRes.status, 403);
    assert.equal(checkRes.body.error.code, 'MEMBERSHIP_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // 8. Audit Log Invariants (AUD-001 - AUD-005)
  // ---------------------------------------------------------------------------
  test('20. AUD-001: Audit logs recorded for all lifecycle events without sensitive secrets', async () => {
    const auditRes = await systemQuery(
      'SELECT action, entity_type, metadata FROM audit_logs WHERE organisation_id = $1 ORDER BY created_at ASC',
      [createdOrgId],
      createdOrgId
    );

    const actions = auditRes.rows.map((r) => r.action);
    assert.ok(actions.includes('org.create'));
    assert.ok(actions.includes('org.update'));
    assert.ok(actions.includes('org.invitation.create'));
    assert.ok(actions.includes('org.invitation.accept'));
    assert.ok(actions.includes('org.owner.transfer'));
    assert.ok(actions.includes('org.member.leave'));

    // Assert zero passwords or tokens in metadata
    for (const row of auditRes.rows) {
      const metaStr = JSON.stringify(row.metadata);
      assert.ok(!metaStr.includes('password'));
      assert.ok(!metaStr.includes(ownerPassword));
      assert.ok(!metaStr.includes(invitationRawToken));
    }
  });

  // ---------------------------------------------------------------------------
  // 11. Concurrency & Concurrency Safety
  // ---------------------------------------------------------------------------
  test('21. Concurrency: Two concurrent invitation acceptance requests result in exactly one success and one 409', async () => {
    // Issue invitation to outsider
    const outsiderSess = await createSession({ userId: outsiderUser.id });
    const outsiderCookie = `${SESSION_COOKIE_NAME}=${outsiderSess.rawToken}`;

    const inviteRes = await request(app)
      .post(`/api/v1/organisations/${createdOrgId}/invitations`)
      .set('Cookie', [memberSessionCookie, csrfCookie]) // member is now owner
      .set('X-CSRF-Token', csrfToken)
      .send({ email: outsiderEmail, roleSlug: 'organisation_member' });

    assert.equal(inviteRes.status, 201);
    const token = inviteRes.body.data.invitation.rawToken;

    // Dispatch two concurrent accept requests
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/invitations/${token}/accept`)
        .set('Cookie', [outsiderCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken),
      request(app)
        .post(`/api/v1/invitations/${token}/accept`)
        .set('Cookie', [outsiderCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    // Verify exactly one membership row was created in DB
    const countRes = await systemQuery(
      'SELECT count(*)::int AS count FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2',
      [createdOrgId, outsiderUser.id],
      createdOrgId
    );
    assert.equal(countRes.rows[0].count, 1);
  });

  test('22. Concurrency: Two concurrent owner leaves are serialized and cannot leave 0 active owners', async () => {
    // Currently memberUser is the sole active owner. Promote outsiderUser to Owner as well.
    const ownerRoleRes = await systemQuery("SELECT id FROM roles WHERE slug = 'organisation_owner' AND organisation_id IS NULL");
    const ownerRoleId = ownerRoleRes.rows[0].id;

    await withSystemTransaction(async (client) => {
      await client.query(`
        UPDATE membership_roles mr
        SET role_id = $1
        FROM organisation_memberships m
        WHERE mr.membership_id = m.id AND m.organisation_id = $2 AND m.user_id = $3
      `, [ownerRoleId, createdOrgId, outsiderUser.id]);
    });

    const outsiderSess = await createSession({ userId: outsiderUser.id });
    const outsiderCookie = `${SESSION_COOKIE_NAME}=${outsiderSess.rawToken}`;

    // Now createdOrgId has TWO active owners: memberUser and outsiderUser.
    // Dispatch two concurrent leave requests simultaneously!
    const [leaveRes1, leaveRes2] = await Promise.all([
      request(app)
        .post(`/api/v1/organisations/${createdOrgId}/leave`)
        .set('Cookie', [memberSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken),
      request(app)
        .post(`/api/v1/organisations/${createdOrgId}/leave`)
        .set('Cookie', [outsiderCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken),
    ]);

    const statuses = [leaveRes1.status, leaveRes2.status].sort();
    // Exactly one must succeed (200) and the other must be blocked by final-owner protection (409)
    assert.deepEqual(statuses, [200, 409]);

    // Record the remaining active owner
    const activeOwnerUser = leaveRes1.status === 409 ? memberUser : outsiderUser;
    const activeOwnerCookie = leaveRes1.status === 409 ? memberSessionCookie : outsiderCookie;

    // Verify the organisation STILL has exactly 1 active owner
    const finalOwnerRes = await systemQuery(`
      SELECT count(*)::int AS count
      FROM membership_roles mr
      JOIN roles r ON r.id = mr.role_id
      JOIN organisation_memberships m ON m.id = mr.membership_id
      WHERE mr.organisation_id = $1 AND r.slug = 'organisation_owner' AND m.status = 'active'
    `, [createdOrgId], createdOrgId);

    assert.equal(finalOwnerRes.rows[0].count, 1);

    // Save for subsequent tests
    testState.activeOwnerUser = activeOwnerUser;
    testState.activeOwnerCookie = activeOwnerCookie;
  });

  // ---------------------------------------------------------------------------
  // 12. Tenant Isolation & Policy Boundaries
  // ---------------------------------------------------------------------------
  test('23. Tenant Isolation: membership_roles_user_select is strictly SELECT-only and rejects un-scoped DML', async () => {
    const activeUser = testState.activeOwnerUser;

    // When organisation context is unset, managex_app can SELECT own roles via membership_roles_user_select
    const selectRes = await withTenantTransaction({ userId: activeUser.id }, async (client) => {
      return client.query('SELECT mr.id, mr.organisation_id FROM membership_roles mr');
    });

    // Should return rows only belonging to the active user
    assert.ok(selectRes.rows.length >= 1);

    // Attempting DELETE without organisation context must fail or delete 0 rows
    const deleteRes = await withTenantTransaction({ userId: activeUser.id }, async (client) => {
      return client.query('DELETE FROM membership_roles WHERE id = $1', [selectRes.rows[0].id]);
    });
    // With membership_roles_tenant_isolation scoped to organisation_id, DELETE sees 0 rows to delete
    assert.equal(deleteRes.rowCount, 0);

    // Attempting UPDATE without organisation context must fail or update 0 rows
    const updateRes = await withTenantTransaction({ userId: activeUser.id }, async (client) => {
      return client.query('UPDATE membership_roles SET organisation_id = $1 WHERE id = $2', [createdOrgId, selectRes.rows[0].id]);
    });
    assert.equal(updateRes.rowCount, 0);

    // Verify row still exists in DB untouched
    const checkRes = await systemQuery('SELECT id FROM membership_roles WHERE id = $1', [selectRes.rows[0].id]);
    assert.equal(checkRes.rows.length, 1);
  });

  // ---------------------------------------------------------------------------
  // 13. Email Provider Failure Handling
  // ---------------------------------------------------------------------------
  test('24. Email Delivery: Provider failure returns 503 EMAIL_DELIVERY_FAILED and rolls back invitation', async () => {
    // Inject mock transporter throwing error to simulate email delivery failure
    setTransporterForTesting({
      sendMail: async () => {
        throw new Error('Connection refused to SMTP server');
      },
    });

    try {
      const failRes = await request(app)
        .post(`/api/v1/organisations/${createdOrgId}/invitations`)
        .set('Cookie', [testState.activeOwnerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'unreachable@managex.local', roleSlug: 'organisation_member' });

      assert.equal(failRes.status, 503);
      assert.equal(failRes.body.error.code, 'EMAIL_DELIVERY_FAILED');

      // Assert rolled-back transaction: no invitation was persisted for this email
      const checkInvite = await systemQuery(
        'SELECT id FROM invitations WHERE email = $1',
        ['unreachable@managex.local']
      );
      assert.equal(checkInvite.rows.length, 0);
    } finally {
      setTransporterForTesting(null);
    }
  });

  after(async () => {
    await withSystemTransaction(async (client) => {
      await client.query("DELETE FROM invitations WHERE organisation_id IN (SELECT id FROM organisations WHERE slug IN ('nexus-innovations', 'nexus-duplicate'))");
      await client.query("DELETE FROM organisation_memberships WHERE organisation_id IN (SELECT id FROM organisations WHERE slug IN ('nexus-innovations', 'nexus-duplicate'))");
      await client.query("DELETE FROM organisations WHERE slug IN ('nexus-innovations', 'nexus-duplicate')");
      await client.query(`
        DELETE FROM organisation_memberships WHERE user_id IN (
          SELECT id FROM users WHERE LOWER(email) IN ($1, $2, $3)
        )
      `, [ownerEmail.toLowerCase(), memberEmail.toLowerCase(), outsiderEmail.toLowerCase()]);
      await client.query('DELETE FROM users WHERE LOWER(email) IN ($1, $2, $3)', [
        ownerEmail.toLowerCase(),
        memberEmail.toLowerCase(),
        outsiderEmail.toLowerCase(),
      ]);
    });
    await closePool();
  });
});
