import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { getPool, checkDatabaseHealth, closePool } from './pool.js';

const { Pool } = pg;

describe('Database Connection Pool & Health Check', () => {
  after(async () => {
    await closePool();
  });

  test('getPool returns initialized pg.Pool singleton', () => {
    const pool = getPool();
    assert.ok(pool);
    assert.equal(typeof pool.connect, 'function');
    assert.equal(typeof pool.query, 'function');
  });

  test('checkDatabaseHealth returns true when database is reachable', async () => {
    const isHealthy = await checkDatabaseHealth(3000);
    assert.equal(isHealthy, true);
  });

  test('checkDatabaseHealth returns false when database connection fails or times out', async () => {
    // Unreachable connection target (port 5499)
    const unreachablePool = new Pool({
      connectionString: 'postgresql://managex_app:password@127.0.0.1:5499/managex',
      connectionTimeoutMillis: 300,
    });

    const isHealthy = await checkDatabaseHealth(300, unreachablePool);
    assert.equal(isHealthy, false);
    await unreachablePool.end().catch(() => {});
  });
});
