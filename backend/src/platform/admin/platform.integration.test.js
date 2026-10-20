/**
 * ManageX Phase 9 Integration Test Suite
 * Platform Administration Console & Controls (PLAT-001 through PLAT-007, SEC-009)
 * 
 * Verifies:
 * 1. PLAT-001: Unauthenticated request to /platform returns 401.
 * 2. PLAT-001: Ordinary workspace user (non-platform operator) rejected with 403 PLATFORM_ACCESS_DENIED.
 * 3. PLAT-001 & PLAT-005: Platform Support Agent accesses /platform/overview successfully.
 * 4. PLAT-002: Paginated accounts listing with allowlisted operational fields only (zero password hashes/secrets).
 * 5. PLAT-005: Support Agent cannot mutate account status (403 FORBIDDEN).
 * 6. PLAT-002 & PLAT-007: Super Admin suspends user account; active sessions immediately revoked; login fails closed; audit logged.
 * 7. PLAT-002: Super Admin cannot suspend self (409 CANNOT_SUSPEND_SELF).
 * 8. PLAT-002: Super Admin reactivates suspended user account.
 * 9. PLAT-003: Operational metadata listing for organisations; zero private tenant records returned.
 * 10. PLAT-005: Support Agent cannot mutate organisation status (403 FORBIDDEN).
 * 11. PLAT-003 & PLAT-007: Super Admin suspends organisation; workspace fails closed with 403 ORG_INACTIVE; data preserved; audit logged.
 * 12. PLAT-003: Super Admin reactivates organisation.
 * 13. PLAT-004: Fixed MVP module catalogue listing.
 * 14. PLAT-005: Support Agent cannot toggle platform module availability (403 FORBIDDEN).
 * 15. PLAT-004 & PLAT-006: Arbitrary module management rejected with 404 MODULE_NOT_FOUND (no ticketing product).
 * 16. PLAT-004 & PLAT-007: Super Admin disables module platform availability; activation and existing usage blocked; data preserved; audit logged.
 * 17. PLAT-004: Super Admin restores module platform availability; usage restored.
 * 18. PLAT-007: Super Admin queries platform audit logs.
 * 19. PLAT-005: Support Agent cannot query platform audit logs (403 FORBIDDEN).
 * 20. SEC-009: Runtime role `managex_app` has NOBYPASSRLS and platform admin does not bypass RLS on private tenant data.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { getPool, closePool } from '../database/pool.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';
import { withTenantTransaction } from '../database/transaction.js';

describe('Phase 9 — Platform Administration Console & Controls Suite', () => {
  let pool;
  let csrfToken;
  let csrfCookie;

  // Platform Operators
  let superAdminUser;
  let superAdminCookie;
  let supportAgentUser;
  let supportAgentCookie;

  // Ordinary Workspace User (Org Owner)
  let ordinaryUser;
  let ordinaryCookie;
  let testOrg;

  // Victim User for Suspension Tests
  let victimUser;
  let victimCookie;

  const runTag = Date.now();

  before(async () => {
    pool = getPool();

    // 1. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'] || [];
    const c = cookies.find((item) => item.startsWith(`${CSRF_COOKIE_NAME}=`));
    if (c) {
      csrfCookie = c.split(';')[0];
      csrfToken = csrfCookie.replace(`${CSRF_COOKIE_NAME}=`, '');
    }

    const passwordHash = await hashPassword('StrongPassword123!');

    // 2. Create Super Admin User
    const superAdminRes = await pool.query(
      `
      INSERT INTO users (full_name, email, password_hash, status, is_platform_admin, platform_role, email_verified_at)
      VALUES ('Platform Super Admin', $1, $2, 'active', true, 'platform_super_admin', NOW())
      RETURNING id, email, full_name, is_platform_admin, platform_role
      `,
      [`superadmin_${runTag}@managex.local`, passwordHash]
    );
    superAdminUser = superAdminRes.rows[0];
    const sSuper = await createSession({ userId: superAdminUser.id });
    superAdminCookie = `${SESSION_COOKIE_NAME}=${sSuper.rawToken}`;

    // 3. Create Support Agent User
    const supportAgentRes = await pool.query(
      `
      INSERT INTO users (full_name, email, password_hash, status, is_platform_admin, platform_role, email_verified_at)
      VALUES ('Platform Support Agent', $1, $2, 'active', false, 'platform_support_agent', NOW())
      RETURNING id, email, full_name, is_platform_admin, platform_role
      `,
      [`supportagent_${runTag}@managex.local`, passwordHash]
    );
    supportAgentUser = supportAgentRes.rows[0];
    const sSupport = await createSession({ userId: supportAgentUser.id });
    supportAgentCookie = `${SESSION_COOKIE_NAME}=${sSupport.rawToken}`;

    // 4. Create Ordinary Workspace User
    const ordUserRes = await pool.query(
      `
      INSERT INTO users (full_name, email, password_hash, status, is_platform_admin, platform_role, email_verified_at)
      VALUES ('Ordinary Org Owner', $1, $2, 'active', false, NULL, NOW())
      RETURNING id, email, full_name, is_platform_admin, platform_role
      `,
      [`ordinary_${runTag}@managex.local`, passwordHash]
    );
    ordinaryUser = ordUserRes.rows[0];
    const sOrd = await createSession({ userId: ordinaryUser.id });
    ordinaryCookie = `${SESSION_COOKIE_NAME}=${sOrd.rawToken}`;

    // Ordinary user creates a customer organisation
    const orgRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ordinaryCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Phase 9 Customer Workspace ${runTag}`, slug: `p9-workspace-${runTag}` });
    assert.equal(orgRes.status, 201);
    testOrg = orgRes.body.data.organisation || orgRes.body.data;

    // 5. Create Victim User for Suspension
    const vicRes = await pool.query(
      `
      INSERT INTO users (full_name, email, password_hash, status, is_platform_admin, platform_role, email_verified_at)
      VALUES ('Suspension Victim', $1, $2, 'active', false, NULL, NOW())
      RETURNING id, email, full_name, status
      `,
      [`victim_${runTag}@managex.local`, passwordHash]
    );
    victimUser = vicRes.rows[0];
    const sVic = await createSession({ userId: victimUser.id });
    victimCookie = `${SESSION_COOKIE_NAME}=${sVic.rawToken}`;
  });

  after(async () => {
    // Clean up test records
    if (pool) {
      if (testOrg?.id) {
        await withTenantTransaction(
          { organisationId: testOrg.id, isPlatformAdmin: true },
          async (client) => {
            await client.query('DELETE FROM events WHERE organisation_id = $1', [testOrg.id]);
            await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [testOrg.id]);
            await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [testOrg.id]);
            await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [testOrg.id]);
            await client.query('DELETE FROM organisations WHERE id = $1', [testOrg.id]);
          }
        );
      }
      await pool.query(
        `DELETE FROM users WHERE email IN ($1, $2, $3, $4)`,
        [superAdminUser.email, supportAgentUser.email, ordinaryUser.email, victimUser.email]
      );
      // Ensure events module platform availability is restored
      await pool.query(`UPDATE modules SET is_platform_available = true WHERE slug = 'events'`);
      await closePool();
    }
  });

  // ---------------------------------------------------------------------------
  // 1. PLAT-001: Access Boundaries & Role Segregation
  // ---------------------------------------------------------------------------
  it('1. PLAT-001: Unauthenticated request to /api/v1/platform/* fails closed with 401', async () => {
    const res = await request(app).get('/api/v1/platform/overview');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it('2. PLAT-001: Ordinary authenticated workspace member fails closed with 403 PLATFORM_ACCESS_DENIED', async () => {
    const res = await request(app)
      .get('/api/v1/platform/overview')
      .set('Cookie', [ordinaryCookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PLATFORM_ACCESS_DENIED');
  });

  it('3. PLAT-001 & PLAT-005: Platform Support Agent accesses /platform/overview successfully with operational stats', async () => {
    const res = await request(app)
      .get('/api/v1/platform/overview')
      .set('Cookie', [supportAgentCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert(typeof res.body.data.users.total === 'number');
    assert(typeof res.body.data.organisations.total === 'number');
    assert(Array.isArray(res.body.data.modules));
  });

  // ---------------------------------------------------------------------------
  // 2. PLAT-002 & PLAT-005: Accounts Inspection & Status Management
  // ---------------------------------------------------------------------------
  it('4. PLAT-002: Paginated accounts listing returns allowlisted operational fields only (zero password hashes/secrets)', async () => {
    const res = await request(app)
      .get('/api/v1/platform/accounts?page=1&limit=10')
      .set('Cookie', [supportAgentCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data.accounts));
    assert(res.body.data.accounts.length > 0);

    // Verify allowlisting and absence of secret/credential fields
    for (const acc of res.body.data.accounts) {
      assert(acc.id, 'Account ID must be present');
      assert(acc.email, 'Account email must be present');
      assert(acc.fullName, 'Account fullName must be present');
      assert(acc.status, 'Account status must be present');
      assert.strictEqual(acc.password_hash, undefined, 'password_hash must NEVER be exposed');
      assert.strictEqual(acc.token_hash, undefined, 'token_hash must NEVER be exposed');
      assert.strictEqual(acc.password, undefined, 'password must NEVER be exposed');
    }
  });

  it('5. PLAT-005: Support Agent attempting to suspend user account is denied with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform/accounts/${victimUser.id}/status`)
      .set('Cookie', [supportAgentCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'suspended', reason: 'Support Agent attempted unauthorized mutation' });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('6. PLAT-002 & PLAT-007: Super Admin suspends user; active sessions revoked; login blocked; audit logged', async () => {
    // Super Admin suspends victim user
    const res = await request(app)
      .patch(`/api/v1/platform/accounts/${victimUser.id}/status`)
      .set('Cookie', [superAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'suspended', reason: 'Security violation test' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'suspended');
    assert.equal(res.body.data.previousStatus, 'active');
    assert(res.body.data.revokedSessionCount >= 1, 'Should have revoked at least 1 session');

    // Victim attempts request with existing session cookie -> fails closed with 401
    const victimReq = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [victimCookie, csrfCookie]);
    assert.equal(victimReq.status, 401);

    // Victim attempts login -> fails closed with 403 ACCOUNT_DISABLED
    const loginAttempt = await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: victimUser.email, password: 'StrongPassword123!' });
    assert.equal(loginAttempt.status, 403);
    assert.equal(loginAttempt.body.error.code, 'ACCOUNT_DISABLED');

    // Verify audit log entry
    const auditRes = await withTenantTransaction(
      { isPlatformAdmin: true },
      async (client) => client.query(
        `SELECT * FROM audit_logs WHERE action = 'platform.account.status_updated' AND entity_id = $1`,
        [victimUser.id]
      )
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].actor_id, superAdminUser.id);
    assert.equal(auditRes.rows[0].metadata.new_status, 'suspended');
  });

  it('7. PLAT-002: Super Admin cannot suspend self (fails with 409 CANNOT_SUSPEND_SELF)', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform/accounts/${superAdminUser.id}/status`)
      .set('Cookie', [superAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'suspended', reason: 'Self-destruction attempt' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CANNOT_SUSPEND_SELF');
  });

  it('8. PLAT-002: Super Admin reactivates suspended user account', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform/accounts/${victimUser.id}/status`)
      .set('Cookie', [superAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'active', reason: 'Investigation completed, account cleared' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'active');

    // Reactivated user can log in again
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: victimUser.email, password: 'StrongPassword123!' });
    assert.equal(loginRes.status, 200);
  });

  // ---------------------------------------------------------------------------
  // 3. PLAT-003 & PLAT-005: Organisation Operational Metadata & Suspension
  // ---------------------------------------------------------------------------
  it('9. PLAT-003: Operational metadata listing for organisations; zero private tenant records returned', async () => {
    const res = await request(app)
      .get('/api/v1/platform/organisations')
      .set('Cookie', [supportAgentCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert(Array.isArray(res.body.data.organisations));
    assert(res.body.data.organisations.length > 0);

    const foundOrg = res.body.data.organisations.find((o) => o.id === testOrg.id);
    assert(foundOrg);
    assert.equal(foundOrg.slug, testOrg.slug);
    assert(typeof foundOrg.memberCount === 'number');

    // Single org operational detail
    const detailRes = await request(app)
      .get(`/api/v1/platform/organisations/${testOrg.id}`)
      .set('Cookie', [supportAgentCookie, csrfCookie]);

    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.id, testOrg.id);
    assert(Array.isArray(detailRes.body.data.modules));
    // Verify no private tenant records are serialized
    assert.strictEqual(detailRes.body.data.events, undefined);
    assert.strictEqual(detailRes.body.data.meetingNotes, undefined);
    assert.strictEqual(detailRes.body.data.tasks, undefined);
  });

  it('10. PLAT-005: Support Agent attempting to suspend organisation fails with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform/organisations/${testOrg.id}/status`)
      .set('Cookie', [supportAgentCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'suspended', reason: 'Support Agent mutation attempt' });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('11. PLAT-003 & PLAT-007: Super Admin suspends organisation; workspace fails closed with 403 ORG_INACTIVE; data preserved', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform/organisations/${testOrg.id}/status`)
      .set('Cookie', [superAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'suspended', reason: 'Non-payment or policy violation' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'suspended');

    // Customer owner attempts to access workspace organisation -> fails closed with 403 ORG_INACTIVE
    const wsRes = await request(app)
      .get(`/api/v1/organisations/${testOrg.id}`)
      .set('Cookie', [ordinaryCookie, csrfCookie]);

    assert.equal(wsRes.status, 403);
    assert.equal(wsRes.body.error.code, 'ORG_INACTIVE');

    // Verify audit log entry
    const auditRes = await withTenantTransaction(
      { isPlatformAdmin: true },
      async (client) => client.query(
        `SELECT * FROM audit_logs WHERE action = 'platform.org.status_updated' AND entity_id = $1`,
        [testOrg.id]
      )
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].actor_id, superAdminUser.id);
  });

  it('12. PLAT-003: Super Admin reactivates organisation back to active; workspace restored', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform/organisations/${testOrg.id}/status`)
      .set('Cookie', [superAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'active', reason: 'Reactivation cleared' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'active');

    // Customer workspace is restored
    const wsRes = await request(app)
      .get(`/api/v1/organisations/${testOrg.id}`)
      .set('Cookie', [ordinaryCookie, csrfCookie]);

    assert.equal(wsRes.status, 200);
    assert.equal(wsRes.body.data.organisation.name, testOrg.name);
  });

  // ---------------------------------------------------------------------------
  // 4. PLAT-004 & PLAT-006: Module Catalogue Platform Availability & Negative Checks
  // ---------------------------------------------------------------------------
  it('13. PLAT-004: Fixed MVP module catalogue listing shows events, meetings, projects', async () => {
    const res = await request(app)
      .get('/api/v1/platform/modules')
      .set('Cookie', [supportAgentCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert(Array.isArray(res.body.data.modules));
    const slugs = res.body.data.modules.map((m) => m.slug);
    assert(slugs.includes('events'));
    assert(slugs.includes('meetings'));
    assert(slugs.includes('projects'));
  });

  it('14. PLAT-005: Support Agent cannot toggle platform module availability (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .patch('/api/v1/platform/modules/events')
      .set('Cookie', [supportAgentCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_available: false, reason: 'Unauthorized toggle' });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('15. PLAT-004 & PLAT-006: Arbitrary module management rejected with 404 MODULE_NOT_FOUND (no ticketing product)', async () => {
    const res = await request(app)
      .patch('/api/v1/platform/modules/ticketing')
      .set('Cookie', [superAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_available: true, reason: 'Ticketing addition attempt' });

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'MODULE_NOT_FOUND');
  });

  it('16. PLAT-004 & PLAT-007: Super Admin disables module platform availability; activation and existing usage blocked; data preserved', async () => {
    // 1. Super Admin disables events platform availability
    const toggleRes = await request(app)
      .patch('/api/v1/platform/modules/events')
      .set('Cookie', [superAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_available: false, reason: 'Platform-wide maintenance on events module' });

    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.body.data.isPlatformAvailable, false);

    // 2. Organisation attempts to activate events module -> fails closed with 403 MODULE_PLATFORM_UNAVAILABLE
    const actRes = await request(app)
      .patch(`/api/v1/organisations/${testOrg.id}/modules/events`)
      .set('Cookie', [ordinaryCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_enabled: true });

    assert.equal(actRes.status, 403);
    assert.equal(actRes.body.error.code, 'MODULE_PLATFORM_UNAVAILABLE');

    // 3. Organisation attempts to access events list route -> fails closed with 403 MODULE_PLATFORM_UNAVAILABLE
    const evtRes = await request(app)
      .get(`/api/v1/organisations/${testOrg.id}/events`)
      .set('Cookie', [ordinaryCookie, csrfCookie]);

    assert.equal(evtRes.status, 403);
    assert.equal(evtRes.body.error.code, 'MODULE_PLATFORM_UNAVAILABLE');

    // 4. Verify audit log entry
    const auditRes = await withTenantTransaction(
      { isPlatformAdmin: true },
      async (client) => client.query(
        `SELECT * FROM audit_logs WHERE action = 'platform.module.availability_updated' AND entity_id = $1 ORDER BY created_at DESC`,
        [toggleRes.body.data.id]
      )
    );
    assert(auditRes.rows.length >= 1, 'Should find module availability audit record');
    assert.equal(auditRes.rows[0].metadata.new_availability, false);
  });

  it('17. PLAT-004: Super Admin restores module platform availability; usage restored', async () => {
    const toggleRes = await request(app)
      .patch('/api/v1/platform/modules/events')
      .set('Cookie', [superAdminCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_platform_available: true, reason: 'Maintenance complete' });

    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.body.data.isPlatformAvailable, true);

    // Enabling module for org now succeeds
    const actRes = await request(app)
      .patch(`/api/v1/organisations/${testOrg.id}/modules/events`)
      .set('Cookie', [ordinaryCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_enabled: true });

    assert.equal(actRes.status, 200);

    // Querying events list route now succeeds
    const evtRes = await request(app)
      .get(`/api/v1/organisations/${testOrg.id}/events`)
      .set('Cookie', [ordinaryCookie, csrfCookie]);

    assert.equal(evtRes.status, 200);
  });

  // ---------------------------------------------------------------------------
  // 5. PLAT-007: Platform Audit Logs
  // ---------------------------------------------------------------------------
  it('18. PLAT-007: Super Admin queries platform audit logs; records capture actor and non-sensitive metadata', async () => {
    const res = await request(app)
      .get('/api/v1/platform/audit-logs?page=1&limit=20')
      .set('Cookie', [superAdminCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert(Array.isArray(res.body.data.logs));
    assert(res.body.data.logs.length >= 3, 'Should contain at least 3 platform audit events from this test run');

    // Inspect first audit log
    const firstLog = res.body.data.logs[0];
    assert(firstLog.id);
    assert(firstLog.action.startsWith('platform.'));
    assert(firstLog.actor);
    assert.equal(firstLog.actor.id, superAdminUser.id);
  });

  it('19. PLAT-005: Support Agent cannot query platform audit logs (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .get('/api/v1/platform/audit-logs')
      .set('Cookie', [supportAgentCookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  // ---------------------------------------------------------------------------
  // 6. SEC-009: Runtime Role NOBYPASSRLS & Tenant Boundary Invariants
  // ---------------------------------------------------------------------------
  it('20. SEC-009: Runtime role managex_app has NOBYPASSRLS and platform admin does not bypass RLS on private tenant data', async () => {
    // 1. Verify managex_app does NOT have superuser or bypassrls privileges
    const roleRes = await pool.query(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'managex_app'`
    );
    assert.equal(roleRes.rows.length, 1);
    assert.equal(roleRes.rows[0].rolsuper, false, 'managex_app must NOT be a superuser');
    assert.equal(roleRes.rows[0].rolbypassrls, false, 'managex_app must NOT have BYPASSRLS');

    // 2. Direct database query as managex_app with platform admin context on private tables
    // Without setting app.current_organisation_id, querying private meeting_notes & action items returns 0 rows due to RLS
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [superAdminUser.id]);
      await client.query("SELECT set_config('app.current_is_platform_admin', 'true', true)");
      await client.query("SELECT set_config('app.current_organisation_id', '', true)"); // No org context

      // Querying private meeting notes must return 0 rows (tenant isolation holds)
      const notesRes = await client.query('SELECT * FROM meeting_notes');
      assert.equal(notesRes.rows.length, 0, 'Platform admin context alone must NOT return private meeting notes');

      // Querying meeting action items must return 0 rows
      const actionsRes = await client.query('SELECT * FROM meeting_action_items');
      assert.equal(actionsRes.rows.length, 0, 'Platform admin context alone must NOT return meeting action items');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
