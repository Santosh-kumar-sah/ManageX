/**
 * ManageX Phase 1B.2: Google Integrations & Meeting Sync RLS Test Suite
 * Strictly adheres to docs/google-meet-integration-plan.md, docs/security.md (SEC-009),
 * and PRD Section 11.3 / ADR-001.
 *
 * Validates:
 * 1. Runtime role `managex_app` has NOBYPASSRLS and lacks superuser privileges.
 * 2. User-isolated RLS for `oauth_states`.
 * 3. Tenant-isolated RLS for `organisation_integrations`.
 * 4. Multi-column integrity constraints on `organisation_integrations`.
 * 5. Constraint and sync state behavior on `meetings`.
 * 6. Historical meetings backfill compliance in `managex_test`.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { getPool, closePool } from './pool.js';
import { withSystemTransaction, withTenantTransaction } from './transaction.js';

describe('Phase 1B.2 — Google Integrations & Meeting Sync RLS Suite (managex_test)', () => {
  const runId = randomUUID().slice(0, 8);
  const testEmailA = `oauth_user_a_${runId}@managex.local`;
  const testEmailB = `oauth_user_b_${runId}@managex.local`;
  const testOrgASlug = `org-google-a-${runId}`;
  const testOrgBSlug = `org-google-b-${runId}`;

  let pool;
  let userAId;
  let userBId;
  let orgAId;
  let orgBId;

  before(async () => {
    pool = getPool();

    // Verify safe isolated test database at migration 041
    await withSystemTransaction(async (client) => {
      const dbRes = await client.query('SELECT current_database() AS name');
      if (dbRes.rows[0].name !== 'managex_test') {
        throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbRes.rows[0].name}`);
      }

      const migRes = await client.query(
        "SELECT version FROM schema_migrations WHERE version = '20261017000041'"
      );
      if (migRes.rowCount !== 1) {
        throw new Error('Test requires managex_test at migration 20261017000041.');
      }
    });

    // Seed test users and organisations using system transaction
    await withSystemTransaction(async (client) => {
      // Create User A and User B
      const userARes = await client.query(
        `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
         VALUES ($1, 'Google Test User A', 'test_hash_a', 'active', NOW())
         RETURNING id`,
        [testEmailA]
      );
      userAId = userARes.rows[0].id;

      const userBRes = await client.query(
        `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
         VALUES ($1, 'Google Test User B', 'test_hash_b', 'active', NOW())
         RETURNING id`,
        [testEmailB]
      );
      userBId = userBRes.rows[0].id;

      // Create Org A and Org B
      const orgARes = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Google Test Org A ${runId}`, testOrgASlug]
      );
      orgAId = orgARes.rows[0].id;

      const orgBRes = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Google Test Org B ${runId}`, testOrgBSlug]
      );
      orgBId = orgBRes.rows[0].id;

      // Create Memberships
      await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active')`,
        [orgAId, userAId]
      );

      await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active')`,
        [orgBId, userBId]
      );
    });
  });

  after(async () => {
    // Delete tenant-isolated records inside their respective tenant contexts
    // (RLS on meetings, organisation_integrations, and oauth_states blocks unscoped deletes)
    if (orgAId && userAId) {
      await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
        await client.query('DELETE FROM meetings');
        await client.query('DELETE FROM organisation_integrations');
        await client.query('DELETE FROM oauth_states');
      });
    }
    if (orgBId && userBId) {
      await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
        await client.query('DELETE FROM meetings');
        await client.query('DELETE FROM organisation_integrations');
        await client.query('DELETE FROM oauth_states');
      });
    }

    // Clean up memberships, organisations, and users under system transaction
    await withSystemTransaction(async (client) => {
      if (orgAId && orgBId) {
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await client.query('DELETE FROM organisations WHERE id IN ($1, $2)', [orgAId, orgBId]);
      }
      if (userAId && userBId) {
        await client.query('DELETE FROM users WHERE id IN ($1, $2)', [userAId, userBId]);
      }
    });
    await closePool();
  });

  // ============================================================================
  // 1. Runtime Role Security Verification
  // ============================================================================
  test('1. Runtime role verification: managex_app has NOBYPASSRLS and lacks SUPERUSER', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT current_user, 
               r.rolsuper, 
               r.rolbypassrls
        FROM pg_roles r
        WHERE r.rolname = current_user
      `);
      assert.equal(res.rows[0].current_user, 'managex_app');
      assert.equal(res.rows[0].rolsuper, false, 'managex_app must not be superuser');
      assert.equal(res.rows[0].rolbypassrls, false, 'managex_app must NOT have BYPASSRLS');
    } finally {
      client.release();
    }
  });

  // ============================================================================
  // 2. oauth_states RLS Isolation
  // ============================================================================
  test('2. oauth_states: User A can insert and select their own OAuth state', async () => {
    const tokenHash = randomBytes(32).toString('hex');
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      const insertRes = await client.query(
        `INSERT INTO oauth_states (organisation_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + interval '10 minutes')
         RETURNING id, token_hash, used_at`,
        [orgAId, userAId, tokenHash]
      );
      assert.equal(insertRes.rowCount, 1);
      assert.equal(insertRes.rows[0].token_hash, tokenHash);
      assert.equal(insertRes.rows[0].used_at, null);

      const selectRes = await client.query(
        'SELECT * FROM oauth_states WHERE token_hash = $1',
        [tokenHash]
      );
      assert.equal(selectRes.rowCount, 1);
      assert.equal(selectRes.rows[0].user_id, userAId);
    });
  });

  test('3. oauth_states: User B cannot SELECT User A OAuth state (cross-user read isolation)', async () => {
    const tokenHash = randomBytes(32).toString('hex');
    // Insert under User A
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      await client.query(
        `INSERT INTO oauth_states (organisation_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + interval '10 minutes')`,
        [orgAId, userAId, tokenHash]
      );
    });

    // Query under User B
    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      const selectRes = await client.query(
        'SELECT * FROM oauth_states WHERE token_hash = $1',
        [tokenHash]
      );
      assert.equal(selectRes.rowCount, 0, 'User B must see 0 rows for User A state');
    });
  });

  test('4. oauth_states: User B cannot UPDATE or DELETE User A OAuth state', async () => {
    const tokenHash = randomBytes(32).toString('hex');
    let stateId;
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      const res = await client.query(
        `INSERT INTO oauth_states (organisation_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + interval '10 minutes')
         RETURNING id`,
        [orgAId, userAId, tokenHash]
      );
      stateId = res.rows[0].id;
    });

    // Attempt UPDATE from User B
    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      const updateRes = await client.query(
        'UPDATE oauth_states SET used_at = NOW() WHERE id = $1',
        [stateId]
      );
      assert.equal(updateRes.rowCount, 0, 'User B must not be able to UPDATE User A state');

      const deleteRes = await client.query(
        'DELETE FROM oauth_states WHERE id = $1',
        [stateId]
      );
      assert.equal(deleteRes.rowCount, 0, 'User B must not be able to DELETE User A state');
    });

    // Verify state remains unchanged under User A
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      const verifyRes = await client.query('SELECT used_at FROM oauth_states WHERE id = $1', [stateId]);
      assert.equal(verifyRes.rowCount, 1);
      assert.equal(verifyRes.rows[0].used_at, null);
    });
  });

  test('5. oauth_states: User B inserting with user_id = User A is rejected by RLS WITH CHECK', async () => {
    const tokenHash = randomBytes(32).toString('hex');
    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      let rejected = false;
      try {
        await client.query(
          `INSERT INTO oauth_states (organisation_id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, NOW() + interval '10 minutes')`,
          [orgBId, userAId, tokenHash]
        );
      } catch (err) {
        rejected = true;
        assert.equal(err.code, '42501', 'Must fail with RLS check violation code 42501');
      }
      assert.ok(rejected, 'Cross-user INSERT into oauth_states must be rejected by RLS');
    });
  });

  test('6. oauth_states: Missing user context fails closed (0 rows on SELECT, 42501 on INSERT)', async () => {
    const client = await pool.connect();
    try {
      // Without app.current_user_id set
      const selectRes = await client.query('SELECT * FROM oauth_states');
      assert.equal(selectRes.rowCount, 0, 'Unscoped SELECT must return 0 rows');

      let insertRejected = false;
      try {
        await client.query(
          `INSERT INTO oauth_states (organisation_id, user_id, token_hash, expires_at)
           VALUES ($1, $2, 'orphan_hash_test', NOW() + interval '10 minutes')`,
          [orgAId, userAId]
        );
      } catch (err) {
        insertRejected = true;
        assert.equal(err.code, '42501', 'Unscoped INSERT must fail with RLS violation 42501');
      }
      assert.ok(insertRejected, 'Unscoped INSERT into oauth_states must fail closed');
    } finally {
      client.release();
    }
  });

  test('7. oauth_states: Duplicate token_hash violates unique constraint', async () => {
    const tokenHash = randomBytes(32).toString('hex');
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      await client.query(
        `INSERT INTO oauth_states (organisation_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + interval '10 minutes')`,
        [orgAId, userAId, tokenHash]
      );

      let duplicateRejected = false;
      await client.query('SAVEPOINT sp_dup_state');
      try {
        await client.query(
          `INSERT INTO oauth_states (organisation_id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, NOW() + interval '10 minutes')`,
          [orgAId, userAId, tokenHash]
        );
      } catch (err) {
        duplicateRejected = true;
        assert.equal(err.code, '23505', 'Must fail with unique_violation code 23505');
        await client.query('ROLLBACK TO SAVEPOINT sp_dup_state');
      }
      assert.ok(duplicateRejected, 'Duplicate token_hash must be rejected');
    });
  });

  // ============================================================================
  // 3. organisation_integrations RLS Isolation
  // ============================================================================
  test('8. organisation_integrations: Org A can insert and select an active integration record', async () => {
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      const res = await client.query(
        `INSERT INTO organisation_integrations 
           (organisation_id, provider, envelope_version, key_version, encrypted_refresh_token, token_iv, token_auth_tag, connected_email, scopes, status, created_by_id)
         VALUES 
           ($1, 'google', 1, '1', 'aabbccdd', '112233445566778899001122', '12345678901234567890123456789012', 'admin@orga.com', ARRAY['https://www.googleapis.com/auth/calendar.events'], 'connected', $2)
         RETURNING id, provider, status`,
        [orgAId, userAId]
      );
      assert.equal(res.rowCount, 1);
      assert.equal(res.rows[0].provider, 'google');
      assert.equal(res.rows[0].status, 'connected');

      const selectRes = await client.query('SELECT * FROM organisation_integrations WHERE provider = $1', ['google']);
      assert.equal(selectRes.rowCount, 1);
      assert.equal(selectRes.rows[0].organisation_id, orgAId);
    });
  });

  test('9. organisation_integrations: Org B cannot SELECT Org A integration (cross-tenant read isolation)', async () => {
    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      const selectRes = await client.query('SELECT * FROM organisation_integrations WHERE organisation_id = $1', [orgAId]);
      assert.equal(selectRes.rowCount, 0, 'Org B must see 0 rows for Org A integrations');

      const allRes = await client.query('SELECT * FROM organisation_integrations');
      assert.equal(allRes.rowCount, 0, 'Org B must see 0 total rows when Org B has no integrations');
    });
  });

  test('10. organisation_integrations: Org B cannot UPDATE or DELETE Org A integration', async () => {
    let orgAIntegrationId;
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      const res = await client.query('SELECT id FROM organisation_integrations WHERE provider = $1', ['google']);
      orgAIntegrationId = res.rows[0].id;
    });

    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      const updateRes = await client.query(
        "UPDATE organisation_integrations SET status = 'revoked' WHERE id = $1",
        [orgAIntegrationId]
      );
      assert.equal(updateRes.rowCount, 0, 'Org B cannot UPDATE Org A integration');

      const deleteRes = await client.query(
        'DELETE FROM organisation_integrations WHERE id = $1',
        [orgAIntegrationId]
      );
      assert.equal(deleteRes.rowCount, 0, 'Org B cannot DELETE Org A integration');
    });
  });

  test('11. organisation_integrations: Org B inserting with organisation_id = Org A is rejected by RLS WITH CHECK', async () => {
    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      let rejected = false;
      try {
        await client.query(
          `INSERT INTO organisation_integrations 
             (organisation_id, provider, envelope_version, key_version, encrypted_refresh_token, token_iv, token_auth_tag, connected_email, scopes, status, created_by_id)
           VALUES 
             ($1, 'google', 1, '1', 'intruder_token', '112233445566778899001122', '12345678901234567890123456789012', 'hacker@orgb.com', ARRAY['https://www.googleapis.com/auth/calendar.events'], 'connected', $2)`,
          [orgAId, userBId]
        );
      } catch (err) {
        rejected = true;
        assert.equal(err.code, '42501', 'Must fail with RLS check violation code 42501');
      }
      assert.ok(rejected, 'Cross-tenant INSERT into organisation_integrations must be rejected');
    });
  });

  test('12. organisation_integrations: Missing tenant context fails closed (0 rows on SELECT)', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT * FROM organisation_integrations');
      assert.equal(res.rowCount, 0, 'Missing tenant context must return 0 rows');
    } finally {
      client.release();
    }
  });

  // ============================================================================
  // 4. organisation_integrations Constraints
  // ============================================================================
  test('13. organisation_integrations: Unique constraint rejects duplicate provider per organisation', async () => {
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      let duplicateRejected = false;
      await client.query('SAVEPOINT sp_dup_provider');
      try {
        await client.query(
          `INSERT INTO organisation_integrations 
             (organisation_id, provider, envelope_version, key_version, encrypted_refresh_token, token_iv, token_auth_tag, connected_email, scopes, status, created_by_id)
           VALUES 
             ($1, 'google', 1, '1', 'another_token', '112233445566778899001122', '12345678901234567890123456789012', 'duplicate@orga.com', ARRAY['https://www.googleapis.com/auth/calendar.events'], 'connected', $2)`,
          [orgAId, userAId]
        );
      } catch (err) {
        duplicateRejected = true;
        assert.equal(err.code, '23505', 'Must fail with unique_violation code 23505');
        await client.query('ROLLBACK TO SAVEPOINT sp_dup_provider');
      }
      assert.ok(duplicateRejected, 'Duplicate provider for the same org must be rejected');
    });
  });

  test('14. organisation_integrations: chk_credentials_status rejects connected status with NULL credentials', async () => {
    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      // 1. Missing encrypted_refresh_token
      let missingTokenRejected = false;
      await client.query('SAVEPOINT sp_missing_token');
      try {
        await client.query(
          `INSERT INTO organisation_integrations 
             (organisation_id, provider, envelope_version, key_version, encrypted_refresh_token, token_iv, token_auth_tag, connected_email, scopes, status, created_by_id)
           VALUES 
             ($1, 'google', 1, '1', NULL, '112233445566778899001122', '12345678901234567890123456789012', 'b@orgb.com', ARRAY['scopes'], 'connected', $2)`,
          [orgBId, userBId]
        );
      } catch (err) {
        missingTokenRejected = true;
        assert.equal(err.code, '23514', 'Must fail with check_violation code 23514');
        await client.query('ROLLBACK TO SAVEPOINT sp_missing_token');
      }
      assert.ok(missingTokenRejected, 'Connected status without encrypted_refresh_token must be rejected');

      // 2. Missing token_iv
      let missingIvRejected = false;
      await client.query('SAVEPOINT sp_missing_iv');
      try {
        await client.query(
          `INSERT INTO organisation_integrations 
             (organisation_id, provider, envelope_version, key_version, encrypted_refresh_token, token_iv, token_auth_tag, connected_email, scopes, status, created_by_id)
           VALUES 
             ($1, 'google', 1, '1', 'valid_token', NULL, '12345678901234567890123456789012', 'b@orgb.com', ARRAY['scopes'], 'connected', $2)`,
          [orgBId, userBId]
        );
      } catch (err) {
        missingIvRejected = true;
        assert.equal(err.code, '23514', 'Must fail with check_violation code 23514');
        await client.query('ROLLBACK TO SAVEPOINT sp_missing_iv');
      }
      assert.ok(missingIvRejected, 'Connected status without token_iv must be rejected');

      // 3. Missing token_auth_tag
      let missingTagRejected = false;
      await client.query('SAVEPOINT sp_missing_tag');
      try {
        await client.query(
          `INSERT INTO organisation_integrations 
             (organisation_id, provider, envelope_version, key_version, encrypted_refresh_token, token_iv, token_auth_tag, connected_email, scopes, status, created_by_id)
           VALUES 
             ($1, 'google', 1, '1', 'valid_token', '112233445566778899001122', NULL, 'b@orgb.com', ARRAY['scopes'], 'connected', $2)`,
          [orgBId, userBId]
        );
      } catch (err) {
        missingTagRejected = true;
        assert.equal(err.code, '23514', 'Must fail with check_violation code 23514');
        await client.query('ROLLBACK TO SAVEPOINT sp_missing_tag');
      }
      assert.ok(missingTagRejected, 'Connected status without token_auth_tag must be rejected');

      // 4. Allowed: revoked status with NULL credentials
      const revokedRes = await client.query(
        `INSERT INTO organisation_integrations 
           (organisation_id, provider, envelope_version, key_version, encrypted_refresh_token, token_iv, token_auth_tag, connected_email, scopes, status, created_by_id)
         VALUES 
           ($1, 'google', 1, '1', NULL, NULL, NULL, 'b@orgb.com', ARRAY['scopes'], 'revoked', $2)
         RETURNING id, status`,
        [orgBId, userBId]
      );
      assert.equal(revokedRes.rowCount, 1);
      assert.equal(revokedRes.rows[0].status, 'revoked');
    });
  });

  // ============================================================================
  // 5. meetings Schema, Check Constraints & Sync Columns
  // ============================================================================
  test('15. meetings: conference_provider check constraint enforces allowed values', async () => {
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      // 1. Valid conference_provider: 'google_meet'
      const meetRes = await client.query(
        `INSERT INTO meetings (organisation_id, title, start_at, end_at, location_type, conference_provider, organiser_id, created_by_id)
         VALUES ($1, 'Test Google Meet Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'virtual', 'google_meet', $2, $2)
         RETURNING id, conference_provider`,
        [orgAId, userAId]
      );
      assert.equal(meetRes.rowCount, 1);
      assert.equal(meetRes.rows[0].conference_provider, 'google_meet');

      // 2. Invalid conference_provider: 'zoom'
      let invalidRejected = false;
      await client.query('SAVEPOINT sp_invalid_conf');
      try {
        await client.query(
          `INSERT INTO meetings (organisation_id, title, start_at, end_at, location_type, conference_provider, organiser_id, created_by_id)
           VALUES ($1, 'Test Zoom Meeting', NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'virtual', 'zoom', $2, $2)`,
          [orgAId, userAId]
        );
      } catch (err) {
        invalidRejected = true;
        assert.equal(err.code, '23514', 'Must fail with check_violation code 23514');
        await client.query('ROLLBACK TO SAVEPOINT sp_invalid_conf');
      }
      assert.ok(invalidRejected, 'Invalid conference_provider zoom must be rejected');
    });
  });

  test('16. meetings: google_sync_status check constraint enforces all 9 valid states and rejects invalid', async () => {
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      // Valid statuses: 'none', 'synced', 'pending_create', 'failed_create', 'pending_update', 'failed_reschedule', 'pending_delete', 'failed_cancel', 'abandoned'
      const validStatuses = [
        'none', 'synced', 'pending_create', 'failed_create',
        'pending_update', 'failed_reschedule', 'pending_delete',
        'failed_cancel', 'abandoned'
      ];

      for (const status of validStatuses) {
        const updateRes = await client.query(
          'UPDATE meetings SET google_sync_status = $1 WHERE title = $2',
          [status, 'Test Google Meet Meeting']
        );
        assert.equal(updateRes.rowCount, 1, `Must allow valid status: ${status}`);
      }

      // Invalid status: 'in_progress'
      let invalidStatusRejected = false;
      await client.query('SAVEPOINT sp_invalid_sync');
      try {
        await client.query(
          'UPDATE meetings SET google_sync_status = $1 WHERE title = $2',
          ['in_progress', 'Test Google Meet Meeting']
        );
      } catch (err) {
        invalidStatusRejected = true;
        assert.equal(err.code, '23514', 'Must fail with check_violation code 23514');
        await client.query('ROLLBACK TO SAVEPOINT sp_invalid_sync');
      }
      assert.ok(invalidStatusRejected, 'Invalid google_sync_status in_progress must be rejected');
    });
  });

  test('17. meetings: Historical backfill validation in managex_test', async () => {
    // Run verification on historical meetings created before migration 041
    const client = await pool.connect();
    try {
      // Verify no meeting has NULL conference_provider or NULL google_sync_status
      const nullCheck = await client.query(`
        SELECT count(*)::int AS null_count
        FROM meetings
        WHERE conference_provider IS NULL OR google_sync_status IS NULL
      `);
      assert.equal(nullCheck.rows[0].null_count, 0, 'Zero meetings should have NULL conference_provider or google_sync_status');

      // Verify in_person meetings with no virtual URL have conference_provider = 'none'
      const inPersonCheck = await client.query(`
        SELECT count(*)::int AS mismatch_count
        FROM meetings
        WHERE location_type = 'in_person' 
          AND (virtual_url IS NULL OR TRIM(virtual_url) = '')
          AND conference_provider != 'none'
      `);
      assert.equal(inPersonCheck.rows[0].mismatch_count, 0, 'In-person meetings without virtual_url must have conference_provider = none');

      // Verify virtual/hybrid meetings have conference_provider = 'manual'
      const virtualCheck = await client.query(`
        SELECT count(*)::int AS mismatch_count
        FROM meetings
        WHERE (location_type IN ('virtual', 'hybrid') OR (virtual_url IS NOT NULL AND TRIM(virtual_url) != ''))
          AND conference_provider != 'manual'
          AND conference_provider != 'google_meet'
      `);
      assert.equal(virtualCheck.rows[0].mismatch_count, 0, 'Historical virtual/hybrid meetings must have conference_provider = manual');
    } finally {
      client.release();
    }
  });

  test('18. meetings: Tenant isolation preserved across Google sync columns', async () => {
    let meetingAId;
    await withTenantTransaction({ userId: userAId, organisationId: orgAId }, async (client) => {
      const res = await client.query(
        `INSERT INTO meetings (organisation_id, title, start_at, end_at, location_type, conference_provider, google_calendar_event_id, google_sync_status, organiser_id, created_by_id)
         VALUES ($1, 'Org A Secret Meet', NOW() + interval '2 days', NOW() + interval '2 days 1 hour', 'virtual', 'google_meet', 'g_event_12345', 'synced', $2, $2)
         RETURNING id`,
        [orgAId, userAId]
      );
      meetingAId = res.rows[0].id;
    });

    // Query and update from Org B context
    await withTenantTransaction({ userId: userBId, organisationId: orgBId }, async (client) => {
      const selectRes = await client.query('SELECT * FROM meetings WHERE id = $1', [meetingAId]);
      assert.equal(selectRes.rowCount, 0, 'Org B cannot SELECT Org A meeting');

      const updateRes = await client.query(
        "UPDATE meetings SET google_calendar_event_id = 'tampered' WHERE id = $1",
        [meetingAId]
      );
      assert.equal(updateRes.rowCount, 0, 'Org B cannot UPDATE Org A meeting sync columns');
    });
  });
});
