/**
 * ManageX PostgreSQL Connection Pool Provider
 * Adheres strictly to docs/architecture.md, docs/database.md, and ADR-001/002.
 */

import pg from 'pg';
import { env } from '../../config/env.js';
import { logger } from '../middleware/logger.js';

const { Pool } = pg;

let poolInstance = null;

/**
 * Returns the singleton pg.Pool instance.
 * @returns {import('pg').Pool}
 */
export function getPool() {
  if (!poolInstance) {
    const isProduction = env.NODE_ENV === 'production';
    const isNeonOrCloud = env.DATABASE_URL.includes('neon.tech') || env.DATABASE_URL.includes('render.com') || env.DATABASE_URL.includes('sslmode=require');

    poolInstance = new Pool({
      connectionString: env.DATABASE_URL,
      max: isProduction ? 20 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: isNeonOrCloud ? { rejectUnauthorized: true } : false,
    });

    poolInstance.on('error', (err) => {
      logger.error({ err }, 'Unexpected database client error in connection pool');
    });
  }

  return poolInstance;
}

/**
 * Closes the database connection pool gracefully during shutdown.
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    logger.info('Database connection pool closed successfully.');
  }
}

/**
 * Quick, bounded health probe for readiness verification.
 * @param {number} [timeoutMs=3000]
 * @param {import('pg').Pool} [targetPool=getPool()]
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseHealth(timeoutMs = 3000, targetPool = getPool()) {
  let client;
  let timeoutTimer;

  try {
    const checkPromise = (async () => {
      client = await targetPool.connect();
      await client.query('SELECT 1');
      return true;
    })();

    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error('Database connection check timed out')), timeoutMs);
    });

    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (err) {
    logger.warn({ err: err.message }, 'Database health check failed');
    return false;
  } finally {
    clearTimeout(timeoutTimer);
    if (client) {
      client.release();
    }
  }
}
