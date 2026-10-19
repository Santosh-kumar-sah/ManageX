/**
 * ManageX Shared Audit Logging Service
 * Strictly adheres to PRD Section 6.5 (AUD-001 through AUD-005), ADR-012, and docs/security.md.
 * 
 * Invariants:
 * - Append-only immutable audit logging into `audit_logs` table (AUD-001).
 * - Standard audit fields (actor, action, resource, metadata) (AUD-002).
 * - Never log passwords, tokens, secrets, cookies, or confidential request bodies (AUD-003).
 * - Permission-controlled read access (AUD-004).
 * - Records success and security-relevant denial/mutation events (AUD-005).
 * - Scoped by organisation and actor identity.
 */

import { getPool } from '../database/pool.js';
import { withTenantTransaction } from '../database/transaction.js';
import { redactSecrets } from '../middleware/logger.js';
import { logger } from '../middleware/logger.js';

/**
 * Records an immutable audit log entry.
 * 
 * @param {object} params
 * @param {string} [params.organisationId] - Target organisation UUID (nullable for platform-level actions)
 * @param {string} [params.actorId] - User UUID who initiated the action (nullable for system actions)
 * @param {string} params.action - Canonical action key (e.g. 'org.create', 'org.member.invite')
 * @param {string} params.entityType - Target entity type (e.g. 'organisation', 'membership', 'invitation')
 * @param {string} [params.entityId] - Target entity identifier
 * @param {object} [params.metadata={}] - Safe contextual metadata (passwords and tokens will be deeply redacted)
 * @param {string} [params.ipAddress] - Caller IP address
 * @param {string} [params.userAgent] - Caller User Agent
 * @param {import('pg').PoolClient} [params.client] - Optional transactional client
 * @returns {Promise<object>}
 */
export async function recordAuditEvent({
  organisationId = null,
  actorId = null,
  action,
  entityType,
  entityId = null,
  metadata = {},
  ipAddress = null,
  userAgent = null,
  client = null,
}) {
  const pool = getPool();
  const db = client || pool;

  // Deeply sanitize metadata to enforce AUD-003 invariant
  const safeMetadata = redactSecrets(metadata || {});

  const query = `
    INSERT INTO audit_logs (organisation_id, actor_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, organisation_id, actor_id, action, entity_type, entity_id, created_at
  `;

  try {
    const res = await db.query(query, [
      organisationId,
      actorId,
      action,
      entityType,
      entityId ? String(entityId) : null,
      JSON.stringify(safeMetadata),
      ipAddress || null,
      userAgent ? userAgent.substring(0, 500) : null,
    ]);

    return res.rows[0];
  } catch (err) {
    logger.error({ err: err.message, action, entityType }, 'Failed to write audit log entry');
    // Audit failure in transaction must bubble up to preserve atomicity
    throw err;
  }
}

/**
 * Lists paginated audit logs for a specific organisation (AUD-004, API-004).
 * Restricted to caller with permission 'org.audit.view'.
 * 
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {number} [params.page=1] - 1-indexed page
 * @param {number} [params.limit=20] - Page size (clamped 1..100)
 * @returns {Promise<{ auditLogs: Array<object>, pagination: object }>}
 */
export async function listOrganisationAuditLogs({
  organisationId,
  page = 1,
  limit = 20,
}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  return withTenantTransaction(
    { organisationId },
    async (client) => {
      // 1. Total count query
      const countRes = await client.query(
        'SELECT COUNT(*) AS total FROM audit_logs WHERE organisation_id = $1',
        [organisationId]
      );
      const total = parseInt(countRes.rows[0].total, 10);
      const totalPages = Math.ceil(total / safeLimit) || 1;

      // 2. Fetch paginated records joined with user information
      const query = `
        SELECT 
          a.id,
          a.organisation_id,
          a.actor_id,
          a.action,
          a.entity_type,
          a.entity_id,
          a.metadata,
          a.ip_address,
          a.created_at,
          u.full_name AS actor_name,
          u.email AS actor_email
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.organisation_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const logsRes = await client.query(query, [organisationId, safeLimit, offset]);

      const auditLogs = logsRes.rows.map((row) => ({
        id: row.id,
        organisationId: row.organisation_id,
        actorId: row.actor_id,
        actor: row.actor_id ? {
          id: row.actor_id,
          name: row.actor_name,
          email: row.actor_email,
        } : null,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      }));

      return {
        auditLogs,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
      };
    }
  );
}
