/**
 * ManageX Transaction-Scoped Database Context Helper
 * Strictly enforces ADR-001, PRD Section 11.3, and SEC-002/SEC-003.
 * 
 * Sets transaction-local context:
 * - app.current_user_id
 * - app.current_organisation_id
 * - app.current_is_platform_admin
 * 
 * Uses parameter `is_local = true` in set_config to prevent session leakage.
 */

import { getPool } from './pool.js';
import { logger } from '../middleware/logger.js';

/**
 * Executes a callback within an explicit transaction bound to a single checked-out
 * connection, with verified user and organisation settings applied via transaction-local parameters.
 * 
 * @param {object} context
 * @param {string} [context.userId] - Authenticated user UUID
 * @param {string} [context.organisationId] - Target organisation UUID
 * @param {boolean} [context.isPlatformAdmin=false] - Whether the caller has platform admin rights
 * @param {(client: import('pg').PoolClient) => Promise<T>} callback - Transactional database queries
 * @returns {Promise<T>}
 */
export async function withTenantTransaction({ userId, organisationId, isPlatformAdmin = false }, callback) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Set transaction-local session settings (is_local = true via 3rd parameter)
    // Parameterized to prevent SQL injection and scoped strictly to this transaction block.
    await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [userId || '']);
    await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [organisationId || '']);
    await client.query("SELECT set_config('app.current_is_platform_admin', $1::text, true)", [isPlatformAdmin ? 'true' : 'false']);

    // Execute callback with the pinned, transaction-bound client
    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, 'Failed to rollback transaction');
    }
    throw error;
  } finally {
    // Release client back to the pool
    // Because settings were transaction-local (is_local=true), commit or rollback automatically
    // clears them, preventing context leakage to subsequent requests using this pooled client.
    client.release();
  }
}

/**
 * Executes a callback within an explicit transaction without tenant context
 * (for unauthenticated or platform-wide foundational operations).
 * 
 * @param {(client: import('pg').PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withSystemTransaction(callback) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_is_platform_admin', 'true', true)");
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, 'Failed to rollback system transaction');
    }
    throw error;
  } finally {
    client.release();
  }
}
