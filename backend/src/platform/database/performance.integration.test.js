/**
 * ManageX Phase 10 — Database Connection Pool, Latency Benchmarks & Query Plan Verification
 * 
 * Requirements Tested:
 * - OPS-005: Database Connection Pool Exhaustion & Recovery, Connection Timeouts, Transaction Leak Prevention
 * - PRD Latency SLA: p95 Read Latency < 200ms, p95 Write Latency < 500ms
 * - PRD Pagination SLA: 1,000-row Dataset Paginated Retrieval < 2.0s
 * - Query Plan Verification: Index scan utilization on large tenant tables without full table scans
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { getPool } from './pool.js';
import { withSystemTransaction, withTenantTransaction } from './transaction.js';
import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('Phase 10 — Database Performance, Pool Resilience & Query Plan Suite', () => {
  let pool;
  let userId, userEmail, userCookie;
  let csrfCookie = '';
  let csrfToken = '';
  let orgId, projectId;

  before(async () => {
    pool = getPool();
    userEmail = 'perf10_user@managex.local';
    const passwordHash = await hashPassword('PerfPass123!');

    await withSystemTransaction(async (client) => {
      const prevUsers = await client.query('SELECT id FROM users WHERE email = $1', [userEmail]);
      const prevIds = prevUsers.rows.map((r) => r.id);
      if (prevIds.length > 0) {
        await client.query("DELETE FROM tasks WHERE organisation_id IN (SELECT id FROM organisations WHERE name = 'Perf10 Org')");
        await client.query("DELETE FROM project_members WHERE organisation_id IN (SELECT id FROM organisations WHERE name = 'Perf10 Org')");
        await client.query("DELETE FROM projects WHERE organisation_id IN (SELECT id FROM organisations WHERE name = 'Perf10 Org')");
        await client.query("DELETE FROM membership_roles WHERE organisation_id IN (SELECT id FROM organisations WHERE name = 'Perf10 Org')");
        await client.query("DELETE FROM organisation_memberships WHERE organisation_id IN (SELECT id FROM organisations WHERE name = 'Perf10 Org') OR user_id = ANY($1)", [prevIds]);
        await client.query("DELETE FROM organisation_module_entitlements WHERE organisation_id IN (SELECT id FROM organisations WHERE name = 'Perf10 Org')");
        await client.query("DELETE FROM organisations WHERE name = 'Perf10 Org'");
        await client.query('DELETE FROM users WHERE id = ANY($1)', [prevIds]);
      }

      const res = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES ('Perf Test User', $1, $2, 'active', NOW())
        RETURNING id
      `, [userEmail, passwordHash]);
      userId = res.rows[0].id;
    });

    const sess = await createSession({ userId });
    userCookie = `${SESSION_COOKIE_NAME}=${sess.rawToken}`;

    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const c = cookies.find((item) => item.startsWith('managex_csrf='));
      if (c) {
        csrfCookie = c.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }

    const orgRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [userCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Perf10 Org' });
    orgId = orgRes.body.data.organisation.id;

    // Enable projects module
    await request(app)
      .patch(`/api/v1/organisations/${orgId}/modules/projects`)
      .set('Cookie', [userCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ is_active: true });

    // Create target project for 1,000 tasks test
    const projRes = await request(app)
      .post(`/api/v1/organisations/${orgId}/projects`)
      .set('Cookie', [userCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'High Volume Performance Project',
        description: 'Dataset scaling benchmarks',
        priority: 'high',
      });
    projectId = projRes.body.data.project.id;
  });

  after(async () => {
    await withSystemTransaction(async (client) => {
      if (orgId) {
        await client.query('DELETE FROM tasks WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM project_members WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM projects WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM organisations WHERE id = $1', [orgId]);
      }
      await client.query('DELETE FROM users WHERE email = $1', [userEmail]);
    });
  });

  // ---------------------------------------------------------------------------
  // OPS-005: Connection Pool Exhaustion & Recovery
  // ---------------------------------------------------------------------------
  it('1. OPS-005: Connection pool recovers gracefully when exhausted and queued requests complete', async () => {
    const clients = [];
    const poolSize = 5; // Check out 5 connections simultaneously

    try {
      for (let i = 0; i < poolSize; i++) {
        const client = await pool.connect();
        clients.push(client);
      }

      // Check that pool reports checked-out clients
      assert.ok(pool.totalCount >= poolSize);

      // Release one client after short delay
      setTimeout(() => {
        const c = clients.pop();
        if (c) c.release();
      }, 50);

      // Now acquire a connection; it should wait and resolve once released
      const newClient = await pool.connect();
      assert.ok(newClient, 'Connection acquired after queue release');
      newClient.release();
    } finally {
      // Release remaining clients
      while (clients.length > 0) {
        const c = clients.pop();
        c.release();
      }
    }
  });

  it('2. OPS-005: Transaction rollback and commit strictly clear tenant context parameters', async () => {
    // Run tenant transaction
    await withTenantTransaction({ userId, organisationId: orgId }, async (client) => {
      const r = await client.query("SELECT current_setting('app.current_organisation_id', true) as org");
      assert.equal(r.rows[0].org, orgId);
    });

    // Check out same pooled client directly; verify tenant context has reset to empty
    const client = await pool.connect();
    try {
      const res = await client.query("SELECT current_setting('app.current_organisation_id', true) as org");
      const currentOrg = res.rows[0].org;
      assert.ok(!currentOrg || currentOrg === '', 'Pooled connection must not leak tenant context');
    } finally {
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // Latency Benchmarks: p95 Read & Write SLA
  // ---------------------------------------------------------------------------
  it('3. Latency Benchmarks: p95 read latency is < 200ms and p95 write latency is < 500ms', async () => {
    const readLatencies = [];
    const writeLatencies = [];
    const iterations = 50;

    // Warm-up requests to stabilize JIT and initial connection
    await request(app)
      .get(`/api/v1/organisations/${orgId}/projects/${projectId}`)
      .set('Cookie', [userCookie, csrfCookie]);
    await request(app)
      .get(`/api/v1/organisations/${orgId}/projects/${projectId}`)
      .set('Cookie', [userCookie, csrfCookie]);

    // 1. Measure Read Latencies
    for (let i = 0; i < iterations; i++) {
      const t0 = Date.now();
      const res = await request(app)
        .get(`/api/v1/organisations/${orgId}/projects/${projectId}`)
        .set('Cookie', [userCookie, csrfCookie]);
      assert.equal(res.status, 200);
      readLatencies.push(Date.now() - t0);
    }

    // 2. Measure Write Latencies
    for (let i = 0; i < iterations; i++) {
      const t0 = Date.now();
      const res = await request(app)
        .post(`/api/v1/organisations/${orgId}/projects/${projectId}/tasks`)
        .set('Cookie', [userCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: `Benchmark Task ${i}`,
          priority: 'medium',
        });
      assert.equal(res.status, 201);
      writeLatencies.push(Date.now() - t0);
    }

    readLatencies.sort((a, b) => a - b);
    writeLatencies.sort((a, b) => a - b);

    const p95Read = readLatencies[Math.floor(readLatencies.length * 0.95)];
    const p95Write = writeLatencies[Math.floor(writeLatencies.length * 0.95)];

    // Target: p95 read < 200ms, p95 write < 500ms
    assert.ok(
      p95Read < 200,
      `p95 Read Latency (${p95Read}ms) must be < 200ms`
    );
    assert.ok(
      p95Write < 500,
      `p95 Write Latency (${p95Write}ms) must be < 500ms`
    );
  });

  // ---------------------------------------------------------------------------
  // 1,000-Row Dataset Scaling & Query Plan Verification
  // ---------------------------------------------------------------------------
  it('4. 1,000-Row Dataset Scaling: 1,000-task pagination responds in < 2.0s with index scan', async () => {
    // 1. Bulk insert 1,000 tasks inside a single transaction using generate_series
    await withTenantTransaction({ userId, organisationId: orgId }, async (client) => {
      await client.query(`
        INSERT INTO tasks (organisation_id, project_id, title, status, priority, created_by_id)
        SELECT 
          $1, 
          $2, 
          'Bulk Scaled Task #' || i, 
          CASE (i % 4) WHEN 0 THEN 'backlog' WHEN 1 THEN 'todo' WHEN 2 THEN 'in_progress' ELSE 'done' END,
          CASE (i % 3) WHEN 0 THEN 'low' WHEN 1 THEN 'medium' ELSE 'high' END,
          $3
        FROM generate_series(1, 1000) AS s(i)
      `, [orgId, projectId, userId]);
    });

    // 2. Benchmark paginated query for page 1, 50 rows
    const t0 = Date.now();
    const pageRes = await request(app)
      .get(`/api/v1/organisations/${orgId}/projects/${projectId}/tasks?page=1&limit=50&status=in_progress`)
      .set('Cookie', [userCookie, csrfCookie]);
    const durationMs = Date.now() - t0;

    assert.equal(pageRes.status, 200);
    assert.ok(pageRes.body.data.items.length > 0);
    assert.equal(pageRes.body.data.total, 250); // 1000 / 4

    // Must be well under the 2.0s SLA
    assert.ok(durationMs < 2000, `Paginated listing of 1,000 rows took ${durationMs}ms; SLA target is < 2000ms`);

    // 3. Inspect PostgreSQL EXPLAIN ANALYZE plan
    const planRows = await withTenantTransaction({ userId, organisationId: orgId }, async (client) => {
      const explainRes = await client.query(`
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT id, title, status, priority, created_at 
        FROM tasks 
        WHERE organisation_id = $1 AND project_id = $2 AND status = 'in_progress' AND deleted_at IS NULL
        ORDER BY created_at DESC 
        LIMIT 50
      `, [orgId, projectId]);
      return explainRes.rows.map((r) => r['QUERY PLAN']);
    });

    const planText = planRows.join('\n');

    // Confirm index usage (idx_tasks_project_status or bitmap index scan on tasks)
    const usesIndex = planText.includes('Index Scan') || planText.includes('Bitmap Index Scan') || planText.includes('idx_tasks_project_status');
    assert.ok(usesIndex, `Query plan must use index on (organisation_id, project_id, status). Plan:\n${planText}`);
  });
});
