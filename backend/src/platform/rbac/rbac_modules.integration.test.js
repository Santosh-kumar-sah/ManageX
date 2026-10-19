/**
 * ManageX Phase 5 Integration Test Suite
 * Scoped RBAC, Central Permission Catalogue, Module Catalogue & Entitlements, and Audit
 * 
 * Verifies:
 * - RBAC-001: Scope separation across platform, org, and modules.
 * - RBAC-002: Central machine-readable permission catalogue.
 * - RBAC-003: Default roles and mapped permissions.
 * - RBAC-004: Server-authoritative permission checks on all routes.
 * - RBAC-005: Delegation limits & anti-escalation controls.
 * - RBAC-006: Immediate revocation of roles and module entitlements.
 * - RBAC-007: Cross-tenant permission isolation and identifier tampering prevention.
 * - MOD-001: Fixed module catalogue ('events', 'meetings', 'projects').
 * - MOD-002: Organisation module activation & deactivation with non-destructive guarantees.
 * - MOD-003: Independent checks (platform availability vs org activation vs user permissions).
 * - MOD-004: Disabled module returns 403 Forbidden fail-closed.
 * - MOD-005: Zero billing dependency.
 * - AUD-001 - AUD-005: Immutable audit logging, standard fields, secret redaction, and permission-controlled read.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { getPool, closePool } from '../database/pool.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { withSystemTransaction } from '../database/transaction.js';

describe('Phase 5 — Central Permission Catalogue, Scoped RBAC, Modules & Audit Suite', () => {
  let pool;

  // Test identities & tenant fixtures
  const ownerEmail = 'phase5_owner@nexus.test';
  const memberEmail = 'phase5_member@nexus.test';
  const crossTenantEmail = 'phase5_crosstenant@other.test';
  const testPassword = 'Password123!';

  let ownerId;
  let memberId;
  let crossTenantUserId;

  let orgAId;
  let orgBId;

  let ownerCookie;
  let memberCookie;
  let crossTenantCookie;

  let csrfCookie;
  let csrfToken;

  async function cleanupFixtures(client) {
    await client.query(`
      DELETE FROM membership_roles WHERE organisation_id IN (
        SELECT id FROM organisations WHERE name IN ('Phase5 Nexus Corp', 'Phase5 Rival Industries')
      )
    `);
    await client.query(`
      DELETE FROM organisation_memberships WHERE organisation_id IN (
        SELECT id FROM organisations WHERE name IN ('Phase5 Nexus Corp', 'Phase5 Rival Industries')
      )
    `);
    await client.query(`
      DELETE FROM organisation_memberships WHERE user_id IN (
        SELECT id FROM users WHERE email IN ($1, $2, $3)
      )
    `, [ownerEmail, memberEmail, crossTenantEmail]);
    await client.query(`
      DELETE FROM organisations WHERE name IN ('Phase5 Nexus Corp', 'Phase5 Rival Industries')
    `);
    await client.query('DELETE FROM users WHERE email IN ($1, $2, $3)', [
      ownerEmail,
      memberEmail,
      crossTenantEmail,
    ]);
  }

  before(async () => {
    pool = getPool();
    const hashedPassword = await hashPassword(testPassword);

    // Clean up any lingering test users
    await withSystemTransaction(cleanupFixtures);

    // 1. Create test users
    const userA = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
      VALUES ('Phase5 Owner', $1, $2, 'active', NOW())
      RETURNING id
    `, [ownerEmail, hashedPassword]);
    ownerId = userA.rows[0].id;

    const userB = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
      VALUES ('Phase5 Member', $1, $2, 'active', NOW())
      RETURNING id
    `, [memberEmail, hashedPassword]);
    memberId = userB.rows[0].id;

    const userC = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
      VALUES ('Phase5 CrossTenant', $1, $2, 'active', NOW())
      RETURNING id
    `, [crossTenantEmail, hashedPassword]);
    crossTenantUserId = userC.rows[0].id;

    // 2. Create active sessions for users
    const ownerSess = await createSession({ userId: ownerId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${ownerSess.rawToken}`;

    const memberSess = await createSession({ userId: memberId });
    memberCookie = `${SESSION_COOKIE_NAME}=${memberSess.rawToken}`;

    const crossSess = await createSession({ userId: crossTenantUserId });
    crossTenantCookie = `${SESSION_COOKIE_NAME}=${crossSess.rawToken}`;

    // 3. Obtain CSRF cookie and token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const c = cookies.find((item) => item.startsWith('managex_csrf='));
      if (c) {
        csrfCookie = c.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }

    // 4. Create Organisation A (owner creates and becomes Owner)
    const orgRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Phase5 Nexus Corp' });
    orgAId = orgRes.body.data.organisation.id;

    // 5. Create Organisation B with cross-tenant user
    const orgBRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [crossTenantCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Phase5 Rival Industries' });
    orgBId = orgBRes.body.data.organisation.id;

    // 6. Add Member to Organisation A as ordinary member inside system transaction (satisfies RLS)
    await withSystemTransaction(async (client) => {
      const memRes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `, [orgAId, memberId]);
      const memAId = memRes.rows[0].id;

      const memberRole = await client.query(`
        SELECT id FROM roles WHERE slug = 'organisation_member' AND organisation_id IS NULL
      `);
      await client.query(`
        INSERT INTO membership_roles (organisation_id, membership_id, role_id)
        VALUES ($1, $2, $3)
      `, [orgAId, memAId, memberRole.rows[0].id]);
    });
  });

  after(async () => {
    // Cleanup test fixtures
    await withSystemTransaction(cleanupFixtures);
    await closePool();
  });

  // ---------------------------------------------------------------------------
  // RBAC-002: Central Permission Catalogue
  // ---------------------------------------------------------------------------
  it('1. RBAC-002: GET /organisations/:orgId/permissions returns machine-readable catalogue categorized by scope', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/permissions`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.permissions.platform.length > 0);
    assert.ok(res.body.data.permissions.organisation.length > 0);
    assert.ok(res.body.data.permissions.module.length > 0);

    // Verify presence of canonical permission keys
    const orgKeys = res.body.data.permissions.organisation.map((p) => p.key);
    assert.ok(orgKeys.includes('org.view'));
    assert.ok(orgKeys.includes('org.edit'));
    assert.ok(orgKeys.includes('org.members.manage'));
    assert.ok(orgKeys.includes('org.modules.manage'));
    assert.ok(orgKeys.includes('org.audit.view'));
  });

  // ---------------------------------------------------------------------------
  // RBAC-003: Default Baseline Roles
  // ---------------------------------------------------------------------------
  it('2. RBAC-003: GET /organisations/:orgId/roles lists baseline seeded roles with mapped permissions', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/roles`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const roles = res.body.data.roles;
    const slugs = roles.map((r) => r.slug);

    // Check baseline roles
    assert.ok(slugs.includes('organisation_owner'));
    assert.ok(slugs.includes('organisation_admin'));
    assert.ok(slugs.includes('organisation_member'));
    assert.ok(slugs.includes('event_admin'));
    assert.ok(slugs.includes('meeting_admin'));
    assert.ok(slugs.includes('project_admin'));

    // Check permission mappings
    const ownerRole = roles.find((r) => r.slug === 'organisation_owner');
    assert.ok(ownerRole.permissions.includes('org.delete'));
    assert.ok(ownerRole.permissions.includes('event.create'));

    const adminRole = roles.find((r) => r.slug === 'organisation_admin');
    assert.ok(!adminRole.permissions.includes('org.delete')); // Admin lacks org.delete

    const meetingPart = roles.find((r) => r.slug === 'meeting_participant');
    assert.ok(!meetingPart.permissions.includes('meeting.notes.read')); // Confidential notes protected
  });

  // ---------------------------------------------------------------------------
  // MOD-001: Fixed Module Catalogue
  // ---------------------------------------------------------------------------
  it('3. MOD-001: GET /organisations/:orgId/modules returns exactly the 3 MVP modules with platform availability', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/modules`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const modules = res.body.data.modules;
    assert.equal(modules.length, 3);

    const slugs = modules.map((m) => m.slug).sort();
    assert.deepEqual(slugs, ['events', 'meetings', 'projects']);

    for (const mod of modules) {
      assert.equal(mod.isPlatformAvailable, true);
      assert.equal(typeof mod.isEnabled, 'boolean');
    }
  });

  // ---------------------------------------------------------------------------
  // MOD-002 & MOD-004: Activation, Deactivation & Fail-Closed Behavior
  // ---------------------------------------------------------------------------
  it('4. MOD-002 & MOD-004: Owner deactivates events module; direct calls fail closed with 403 MODULE_DISABLED', async () => {
    // First, verify events endpoint is accessible when enabled
    const activeRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(activeRes.status, 200);
    assert.equal(activeRes.body.data.entitled, true);

    // Deactivate 'events' module
    const patchRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_enabled: false });

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.module.isEnabled, false);

    // Immediate revocation test: Subsequent call immediately returns 403 Forbidden (RBAC-006, MOD-004)
    const directRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(directRes.status, 403);
    assert.equal(directRes.body.success, false);
    assert.equal(directRes.body.error.code, 'MODULE_DISABLED');

    // Reactivate events module
    const reactivateRes = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_enabled: true });

    assert.equal(reactivateRes.status, 200);
    assert.equal(reactivateRes.body.data.module.isEnabled, true);

    // Re-verify immediate access restoration
    const restoredRes = await request(app)
      .get(`/api/v1/organisations/${orgAId}/events`)
      .set('Cookie', [ownerCookie, csrfCookie]);
    assert.equal(restoredRes.status, 200);
  });

  // ---------------------------------------------------------------------------
  // RBAC-004 & MOD-002: Server-Authoritative Checks (Member Denied Module Toggle)
  // ---------------------------------------------------------------------------
  it('5. RBAC-004: Ordinary member attempting to deactivate a module is rejected with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/events`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_enabled: false });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  // ---------------------------------------------------------------------------
  // RBAC-001: Scope Segregation (Platform Roles Cannot be Assigned to Org Members)
  // ---------------------------------------------------------------------------
  it('6. RBAC-001: Assigning a platform-scoped role to an organisation member is rejected (403 INVALID_ROLE_SCOPE)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/members/${memberId}/roles`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ roleSlug: 'platform_super_admin' });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_ROLE_SCOPE');
  });

  // ---------------------------------------------------------------------------
  // RBAC-005: Delegation Limits & Anti-Escalation Controls
  // ---------------------------------------------------------------------------
  it('7. RBAC-005: Member attempting to grant Owner role fails anti-escalation check', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgAId}/members/${memberId}/roles`)
      .set('Cookie', [memberCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ roleSlug: 'organisation_owner' });

    // Fails either at permission guard (org.members.manage) or anti-escalation
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  // ---------------------------------------------------------------------------
  // Multi-Role Aggregation & Role Delegation
  // ---------------------------------------------------------------------------
  it('8. Multi-Role Aggregation: Owner grants event_admin role to member; member gains event management permissions', async () => {
    // Member initially cannot manage event status
    const initialMe = await request(app)
      .get(`/api/v1/organisations/${orgAId}`)
      .set('Cookie', [memberCookie, csrfCookie]);
    assert.ok(!initialMe.body.data.membership.permissions.includes('event.status.manage'));

    // Owner assigns event_admin role to Member
    const assignRes = await request(app)
      .post(`/api/v1/organisations/${orgAId}/members/${memberId}/roles`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ roleSlug: 'event_admin' });

    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.body.success, true);

    // Member makes subsequent request; permissions reflect aggregated roles immediately (RBAC-006)
    const updatedMe = await request(app)
      .get(`/api/v1/organisations/${orgAId}`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.ok(updatedMe.body.data.membership.permissions.includes('event.status.manage'));
    assert.ok(updatedMe.body.data.membership.permissions.includes('event.create'));

    // Clean up: Remove event_admin role
    const removeRes = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/members/${memberId}/roles/event_admin`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(removeRes.status, 200);

    // Verify immediate permission revocation
    const revokedMe = await request(app)
      .get(`/api/v1/organisations/${orgAId}`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.ok(!revokedMe.body.data.membership.permissions.includes('event.status.manage'));
  });

  // ---------------------------------------------------------------------------
  // ORG-008 Invariant: Final Owner Role Cannot Be Removed
  // ---------------------------------------------------------------------------
  it('9. ORG-008: Removing the sole active Owner role from organisation is rejected with 409 FINAL_OWNER_PROTECTION', async () => {
    const res = await request(app)
      .delete(`/api/v1/organisations/${orgAId}/members/${ownerId}/roles/organisation_owner`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FINAL_OWNER_PROTECTION');
  });

  // ---------------------------------------------------------------------------
  // RBAC-007: Cross-Tenant Isolation & Identifier Tampering
  // ---------------------------------------------------------------------------
  it('10. RBAC-007: User in Org A cannot query or mutate modules in Org B', async () => {
    // Org A Owner attempts to read Org B modules
    const readRes = await request(app)
      .get(`/api/v1/organisations/${orgBId}/modules`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(readRes.status, 403);
    assert.equal(readRes.body.success, false);

    // Org A Owner attempts to mutate Org B modules
    const mutateRes = await request(app)
      .patch(`/api/v1/organisations/${orgBId}/modules/meetings`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_enabled: false });

    assert.equal(mutateRes.status, 403);
    assert.equal(mutateRes.body.success, false);
  });

  // ---------------------------------------------------------------------------
  // AUD-001 - AUD-005: Organisation Audit Log Querying & Redaction
  // ---------------------------------------------------------------------------
  it('11. AUD-004: Owner queries organisation audit logs with pagination; records capture lifecycle events', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs?page=1&limit=10`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.auditLogs));
    assert.ok(res.body.data.auditLogs.length > 0);
    assert.ok(res.body.meta.pagination);

    // Check captured events
    const actions = res.body.data.auditLogs.map((log) => log.action);
    assert.ok(actions.includes('org.create'));
    assert.ok(actions.includes('org.module.activate') || actions.includes('org.module.deactivate'));

    // Check AUD-003 invariant: ensure no passwords, hashes or raw tokens in metadata
    for (const log of res.body.data.auditLogs) {
      const metaStr = JSON.stringify(log.metadata);
      assert.ok(!metaStr.includes('password_hash'));
      assert.ok(!metaStr.includes('token_hash'));
      assert.ok(!metaStr.includes('managex_session'));
    }
  });

  it('12. AUD-004: Non-privileged member cannot view organisation audit logs (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgAId}/audit-logs`)
      .set('Cookie', [memberCookie, csrfCookie]);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  // ---------------------------------------------------------------------------
  // MOD-005: Zero Billing Dependency
  // ---------------------------------------------------------------------------
  it('13. MOD-005: Module activation succeeds without billing headers, payment gateways or subscription checks', async () => {
    const res = await request(app)
      .patch(`/api/v1/organisations/${orgAId}/modules/projects`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_enabled: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.module.isEnabled, true);
  });
});
