/**
 * ManageX PostgreSQL RLS & Tenant Isolation Integration Test Suite
 * Strictly adheres to docs/testing.md (Suite A), ADR-001, ADR-002, and PRD Section 11.3.
 * 
 * Executed strictly against PostgreSQL as the restricted runtime role `managex_app`.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withTenantTransaction, withSystemTransaction } from './transaction.js';
import { getPool, closePool } from './pool.js';

describe('PostgreSQL RLS & Tenant Isolation Integration Suite (managex_app)', () => {
  const pool = getPool();

  // Test UUIDs
  let userAId;
  let userBId;
  let orgAId;
  let orgBId;
  let membershipAId;
  let membershipBId;

  before(async () => {
    // Seed initial test users and organisations using system transaction
    await withSystemTransaction(async (client) => {
      // Clean up previous test artifacts if any
      await client.query("DELETE FROM users WHERE email IN ('test_user_a@managex.local', 'test_user_b@managex.local')");
      await client.query("DELETE FROM organisations WHERE slug IN ('test-org-a', 'test-org-b')");

      // Insert global test users
      const userARes = await client.query(`
        INSERT INTO users (email, full_name, password_hash, status)
        VALUES ('test_user_a@managex.local', 'User A', 'hash_a', 'active')
        RETURNING id
      `);
      userAId = userARes.rows[0].id;

      const userBRes = await client.query(`
        INSERT INTO users (email, full_name, password_hash, status)
        VALUES ('test_user_b@managex.local', 'User B', 'hash_b', 'active')
        RETURNING id
      `);
      userBId = userBRes.rows[0].id;

      // Insert test organisations
      const orgARes = await client.query(`
        INSERT INTO organisations (name, slug, status)
        VALUES ('Test Org A', 'test-org-a', 'active')
        RETURNING id
      `);
      orgAId = orgARes.rows[0].id;

      const orgBRes = await client.query(`
        INSERT INTO organisations (name, slug, status)
        VALUES ('Test Org B', 'test-org-b', 'active')
        RETURNING id
      `);
      orgBId = orgBRes.rows[0].id;

      // Insert memberships
      const memARes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `, [orgAId, userAId]);
      membershipAId = memARes.rows[0].id;

      const memBRes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `, [orgBId, userBId]);
      membershipBId = memBRes.rows[0].id;
    });
  });

  after(async () => {
    // Clean up test data
    await withSystemTransaction(async (client) => {
      await client.query('DELETE FROM organisation_memberships WHERE id IN ($1, $2)', [membershipAId, membershipBId]);
      await client.query('DELETE FROM organisations WHERE id IN ($1, $2)', [orgAId, orgBId]);
      await client.query('DELETE FROM users WHERE id IN ($1, $2)', [userAId, userBId]);
    });
    await closePool();
  });

  test('1. Runtime role verification: managex_app lacks SUPERUSER and BYPASSRLS', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT current_user, 
               r.rolsuper, 
               r.rolbypassrls, 
               r.rolcreatedb, 
               r.rolcreaterole
        FROM pg_roles r
        WHERE r.rolname = current_user
      `);
      assert.equal(res.rows[0].current_user, 'managex_app');
      assert.equal(res.rows[0].rolsuper, false, 'managex_app must not be superuser');
      assert.equal(res.rows[0].rolbypassrls, false, 'managex_app must NOT have BYPASSRLS');
      assert.equal(res.rows[0].rolcreatedb, false, 'managex_app must not have CREATEDB');
      assert.equal(res.rows[0].rolcreaterole, false, 'managex_app must not have CREATEROLE');
    } finally {
      client.release();
    }
  });

  test('2. Missing context fails closed: zero tenant records returned when organisation context is unset', async () => {
    // Explicitly un-scoped connection query
    const client = await pool.connect();
    try {
      // When app.current_organisation_id is not set, current_setting evaluates to ''
      // and NULLIF evaluates to NULL. organisation_id = NULL evaluates to false.
      const res = await client.query('SELECT * FROM organisation_memberships');
      assert.equal(res.rows.length, 0, 'Must return 0 rows when tenant context is missing');

      const invRes = await client.query('SELECT * FROM invitations');
      assert.equal(invRes.rows.length, 0, 'Must return 0 invitations when context is missing');
    } finally {
      client.release();
    }
  });

  test('3. Cross-tenant read isolation: Tenant A context sees only Tenant A rows', async () => {
    // Query inside Tenant A context
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      const res = await client.query('SELECT * FROM organisation_memberships');
      assert.equal(res.rows.length, 1, 'Tenant A context must see exactly 1 membership');
      assert.equal(res.rows[0].organisation_id, orgAId);
      assert.equal(res.rows[0].user_id, userAId);
    });

    // Query inside Tenant B context
    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      const res = await client.query('SELECT * FROM organisation_memberships');
      assert.equal(res.rows.length, 1, 'Tenant B context must see exactly 1 membership');
      assert.equal(res.rows[0].organisation_id, orgBId);
      assert.equal(res.rows[0].user_id, userBId);
    });
  });

  test('4. Cross-tenant write isolation: inserting into Tenant B while in Tenant A context is rejected by RLS WITH CHECK', async () => {
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      let rejected = false;
      try {
        await client.query(`
          INSERT INTO invitations (organisation_id, invited_by_id, email, token_hash, role_id, expires_at)
          VALUES ($1, $2, 'intruder@example.com', 'tampered_hash_123', (SELECT id FROM roles LIMIT 1), NOW() + interval '1 day')
        `, [orgBId, userAId]);
      } catch (err) {
        rejected = true;
        // PostgreSQL error code 42501: insufficient_privilege / new row violates row-level security policy
        assert.equal(err.code, '42501', 'Must fail with RLS policy violation code 42501');
      }
      assert.ok(rejected, 'Cross-tenant INSERT must be rejected by PostgreSQL RLS');
    });
  });

  test('5. Composite foreign key tenant integrity: cannot reference child records across organisations', async () => {
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      let foreignKeyFailed = false;
      try {
        // Attempt to insert membership_roles referencing Org B's membership_id under Org A
        await client.query(`
          INSERT INTO membership_roles (organisation_id, membership_id, role_id)
          VALUES ($1, $2, (SELECT id FROM roles LIMIT 1))
        `, [orgAId, membershipBId]);
      } catch (err) {
        foreignKeyFailed = true;
        // PostgreSQL error code 23503: foreign_key_violation
        assert.equal(err.code, '23503', 'Must fail with foreign key violation code 23503');
      }
      assert.ok(foreignKeyFailed, 'Cross-tenant composite FK violation must be rejected');
    });
  });

  test('6. Pooled connection context leak prevention: context does not survive transaction end', async () => {
    const client = await pool.connect();
    try {
      // Transaction 1: Set context to Tenant A and verify row visibility
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_organisation_id', $1, true)", [orgAId]);
      const resA = await client.query('SELECT * FROM organisation_memberships');
      assert.equal(resA.rows.length, 1);
      assert.equal(resA.rows[0].organisation_id, orgAId);
      await client.query('COMMIT');

      // Now query on the same physical connection WITHOUT setting context
      // Because is_local=true was used, the setting must have reverted to empty
      const leakedRes = await client.query('SELECT * FROM organisation_memberships');
      assert.equal(leakedRes.rows.length, 0, 'Context must not leak into subsequent query on same connection');
    } finally {
      client.release();
    }
  });

  test('7. Audit logs immutability: managex_app cannot UPDATE or DELETE audit records', async () => {
    let auditId;
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      // 1. Can INSERT audit log
      const insertRes = await client.query(`
        INSERT INTO audit_logs (organisation_id, actor_id, action, entity_type, metadata)
        VALUES ($1, $2, 'test.audit_action', 'test_entity', '{"key": "value"}'::jsonb)
        RETURNING id
      `, [orgAId, userAId]);
      auditId = insertRes.rows[0].id;
      assert.ok(auditId);

      // 2. Can SELECT audit log
      const selectRes = await client.query('SELECT * FROM audit_logs WHERE id = $1', [auditId]);
      assert.equal(selectRes.rows.length, 1);

      // 3. CANNOT UPDATE audit log
      let updateFailed = false;
      await client.query('SAVEPOINT sp_update');
      try {
        await client.query("UPDATE audit_logs SET action = 'tampered' WHERE id = $1", [auditId]);
      } catch (err) {
        updateFailed = true;
        assert.equal(err.code, '42501', 'UPDATE on audit_logs must be denied with code 42501');
        await client.query('ROLLBACK TO SAVEPOINT sp_update');
      }
      assert.ok(updateFailed, 'Audit log UPDATE must be rejected');

      // 4. CANNOT DELETE audit log
      let deleteFailed = false;
      await client.query('SAVEPOINT sp_delete');
      try {
        await client.query('DELETE FROM audit_logs WHERE id = $1', [auditId]);
      } catch (err) {
        deleteFailed = true;
        assert.equal(err.code, '42501', 'DELETE on audit_logs must be denied with code 42501');
        await client.query('ROLLBACK TO SAVEPOINT sp_delete');
      }
      assert.ok(deleteFailed, 'Audit log DELETE must be rejected');
    });
  });

  test('8. Transaction rollback: rolled back transaction discards all partial writes', async () => {
    let transactionErrorThrown = false;

    try {
      await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
        await client.query(`
          INSERT INTO invitations (organisation_id, invited_by_id, email, token_hash, role_id, expires_at)
          VALUES ($1, $2, 'aborted@example.com', 'abort_token_hash', (SELECT id FROM roles LIMIT 1), NOW() + interval '1 day')
        `, [orgAId, userAId]);

        // Explicitly force failure
        throw new Error('Simulated business logic failure');
      });
    } catch {
      transactionErrorThrown = true;
    }

    assert.ok(transactionErrorThrown);

    // Verify row was rolled back and does not exist
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      const res = await client.query("SELECT * FROM invitations WHERE token_hash = 'abort_token_hash'");
      assert.equal(res.rows.length, 0, 'Rolled back row must not exist in database');
    });
  });

  test('9. Runtime role privilege restriction: managex_app can read but CANNOT INSERT/UPDATE/DELETE/TRUNCATE schema_migrations', async () => {
    const client = await pool.connect();
    try {
      // 1. Can SELECT schema_migrations
      const selectRes = await client.query('SELECT version, name FROM schema_migrations ORDER BY version LIMIT 1');
      assert.ok(selectRes.rows.length > 0, 'managex_app must be able to read schema_migrations');

      // 2. Cannot INSERT into schema_migrations
      let insertFailed = false;
      await client.query('BEGIN');
      try {
        await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ('99999999999999', 'fake.sql', 'fake')");
      } catch (err) {
        insertFailed = true;
        assert.equal(err.code, '42501', 'INSERT on schema_migrations must be denied with code 42501');
      } finally {
        await client.query('ROLLBACK');
      }
      assert.ok(insertFailed, 'managex_app must not be able to INSERT into schema_migrations');

      // 3. Cannot DELETE from schema_migrations
      let deleteFailed = false;
      await client.query('BEGIN');
      try {
        await client.query("DELETE FROM schema_migrations WHERE version = '99999999999999'");
      } catch (err) {
        deleteFailed = true;
        assert.equal(err.code, '42501', 'DELETE on schema_migrations must be denied with code 42501');
      } finally {
        await client.query('ROLLBACK');
      }
      assert.ok(deleteFailed, 'managex_app must not be able to DELETE from schema_migrations');

      // 4. Cannot TRUNCATE schema_migrations
      let truncateFailed = false;
      await client.query('BEGIN');
      try {
        await client.query('TRUNCATE TABLE schema_migrations');
      } catch (err) {
        truncateFailed = true;
        assert.equal(err.code, '42501', 'TRUNCATE on schema_migrations must be denied with code 42501');
      } finally {
        await client.query('ROLLBACK');
      }
      assert.ok(truncateFailed, 'managex_app must not be able to TRUNCATE schema_migrations');
    } finally {
      client.release();
    }
  });

  test('10. Runtime role privilege restriction: managex_app can read but CANNOT mutate modules, permissions, role_permissions', async () => {
    const client = await pool.connect();
    try {
      // (a) modules table
      const modRes = await client.query('SELECT slug FROM modules LIMIT 1');
      assert.ok(modRes.rows.length > 0, 'managex_app can SELECT from modules');

      let modInsertFailed = false;
      await client.query('BEGIN');
      try {
        await client.query("INSERT INTO modules (slug, name, description) VALUES ('test_mod', 'Test', 'Desc')");
      } catch (err) {
        modInsertFailed = true;
        assert.equal(err.code, '42501', 'INSERT on modules must be denied with code 42501');
      } finally {
        await client.query('ROLLBACK');
      }
      assert.ok(modInsertFailed, 'managex_app cannot INSERT into modules');

      // (b) permissions table
      const permRes = await client.query('SELECT key FROM permissions LIMIT 1');
      assert.ok(permRes.rows.length > 0, 'managex_app can SELECT from permissions');

      let permDeleteFailed = false;
      await client.query('BEGIN');
      try {
        await client.query("DELETE FROM permissions WHERE key = 'fake'");
      } catch (err) {
        permDeleteFailed = true;
        assert.equal(err.code, '42501', 'DELETE on permissions must be denied with code 42501');
      } finally {
        await client.query('ROLLBACK');
      }
      assert.ok(permDeleteFailed, 'managex_app cannot DELETE from permissions');

      // (c) role_permissions table
      const rpRes = await client.query('SELECT role_id, permission_id FROM role_permissions LIMIT 1');
      assert.ok(rpRes.rows.length > 0, 'managex_app can SELECT from role_permissions');

      let rpUpdateFailed = false;
      await client.query('BEGIN');
      try {
        await client.query('UPDATE role_permissions SET permission_id = permission_id');
      } catch (err) {
        rpUpdateFailed = true;
        assert.equal(err.code, '42501', 'UPDATE on role_permissions must be denied with code 42501');
      } finally {
        await client.query('ROLLBACK');
      }
      assert.ok(rpUpdateFailed, 'managex_app cannot UPDATE role_permissions');
    } finally {
      client.release();
    }
  });

  test('11. Legitimate runtime operations: managex_app can perform DML on application tables within tenant context', async () => {
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      // 1. Can INSERT legitimate tenant record
      const insertRes = await client.query(`
        INSERT INTO invitations (organisation_id, invited_by_id, email, token_hash, role_id, expires_at)
        VALUES ($1, $2, 'legit@example.com', 'legit_token_hash_1', (SELECT id FROM roles WHERE slug = 'organisation_member' LIMIT 1), NOW() + interval '2 days')
        RETURNING id
      `, [orgAId, userAId]);
      const invId = insertRes.rows[0].id;
      assert.ok(invId);

      // 2. Can SELECT record
      const selectRes = await client.query('SELECT * FROM invitations WHERE id = $1', [invId]);
      assert.equal(selectRes.rows.length, 1);
      assert.equal(selectRes.rows[0].email, 'legit@example.com');

      // 3. Can UPDATE record
      await client.query("UPDATE invitations SET email = 'updated_legit@example.com' WHERE id = $1", [invId]);
      const selectUpdated = await client.query('SELECT email FROM invitations WHERE id = $1', [invId]);
      assert.equal(selectUpdated.rows[0].email, 'updated_legit@example.com');

      // 4. Can DELETE record
      await client.query('DELETE FROM invitations WHERE id = $1', [invId]);
      const selectDeleted = await client.query('SELECT * FROM invitations WHERE id = $1', [invId]);
      assert.equal(selectDeleted.rows.length, 0);
    });
  });
});
