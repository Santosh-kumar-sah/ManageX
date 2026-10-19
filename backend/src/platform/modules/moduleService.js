/**
 * ManageX Module Catalogue & Organisation Entitlements Service
 * Strictly adheres to PRD Section 6.4 (MOD-001 through MOD-005), ADR-016, and docs/security.md.
 * 
 * Invariants:
 * - Fixed MVP module catalogue ('events', 'meetings', 'projects').
 * - Modules can only be enabled if platform-available (MOD-002, MOD-003).
 * - Deactivating a module is non-destructive: all tables, events, notes, and tasks remain intact (ADR-016).
 * - Direct requests to disabled modules fail closed with 403 Forbidden (MOD-004).
 * - Zero billing/payment dependencies in MVP (MOD-005).
 * - Audited via append-only audit logger (AUD-001).
 */

import { withTenantTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../audit/auditService.js';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
} from '../common/errors.js';

/**
 * Lists all modules in the platform catalogue along with their activation state for a specific organisation.
 * 
 * @param {string} organisationId - UUID of the target organisation
 * @returns {Promise<Array<object>>}
 */
export async function listOrganisationModules(organisationId) {
  const query = `
    SELECT 
      m.id,
      m.slug,
      m.name,
      m.description,
      m.is_core,
      m.is_platform_available,
      COALESCE(e.is_enabled, false) AS is_enabled,
      e.updated_at AS entitlement_updated_at
    FROM modules m
    LEFT JOIN organisation_module_entitlements e 
      ON e.module_id = m.id AND e.organisation_id = $1
    ORDER BY m.name ASC
  `;

  return withTenantTransaction(
    { organisationId },
    async (client) => {
      const res = await client.query(query, [organisationId]);
      return res.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        isCore: row.is_core,
        isPlatformAvailable: row.is_platform_available,
        isEnabled: row.is_enabled,
        updatedAt: row.entitlement_updated_at,
      }));
    }
  );
}

/**
 * Checks entitlement for a specific module in an organisation.
 * Evaluates both platform availability and organisation activation independently (MOD-003).
 * 
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {string} params.moduleSlug - Module key ('events', 'meetings', 'projects')
 * @returns {Promise<{ isPlatformAvailable: boolean, isEnabled: boolean, allowed: boolean, module: object }>}
 */
export async function checkModuleEntitlement({ organisationId, moduleSlug }) {
  const query = `
    SELECT 
      m.id,
      m.slug,
      m.name,
      m.description,
      m.is_platform_available,
      COALESCE(e.is_enabled, false) AS is_enabled
    FROM modules m
    LEFT JOIN organisation_module_entitlements e 
      ON e.module_id = m.id AND e.organisation_id = $1
    WHERE m.slug = $2
  `;

  return withTenantTransaction(
    { organisationId },
    async (client) => {
      const res = await client.query(query, [organisationId, moduleSlug]);

      if (res.rows.length === 0) {
        throw new NotFoundError(`Module '${moduleSlug}' not found in platform catalogue.`, 'MODULE_NOT_FOUND');
      }

      const row = res.rows[0];
      const isPlatformAvailable = Boolean(row.is_platform_available);
      const isEnabled = Boolean(row.is_enabled);
      const allowed = isPlatformAvailable && isEnabled;

      return {
        isPlatformAvailable,
        isEnabled,
        allowed,
        module: {
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description,
        },
      };
    }
  );
}

/**
 * Activates or deactivates a module for an organisation (MOD-002).
 * Non-destructive: preserves existing module data intact (ADR-016).
 * 
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.moduleSlug
 * @param {boolean} params.isEnabled
 * @param {string} params.actorId
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<object>}
 */
export async function updateOrganisationModule({
  organisationId,
  moduleSlug,
  isEnabled,
  actorId,
  ipAddress,
  userAgent,
}) {
  if (typeof isEnabled !== 'boolean') {
    throw new ValidationError("Parameter 'is_enabled' must be a boolean.");
  }

  return withTenantTransaction(
    { organisationId, userId: actorId },
    async (client) => {
      // 1. Fetch module and check platform availability
      const modRes = await client.query(
        'SELECT id, slug, name, description, is_platform_available FROM modules WHERE slug = $1',
        [moduleSlug]
      );

      if (modRes.rows.length === 0) {
        throw new NotFoundError(`Module '${moduleSlug}' does not exist in catalogue.`, 'MODULE_NOT_FOUND');
      }

      const mod = modRes.rows[0];

      // PRD MOD-002: Cannot activate a module if not platform-available
      if (isEnabled && !mod.is_platform_available) {
        throw new AuthorizationError(
          `Module '${mod.name}' is currently unavailable at the platform level and cannot be activated.`,
          'MODULE_PLATFORM_UNAVAILABLE'
        );
      }

      // 2. Upsert organisation_module_entitlements
      const upsertQuery = `
        INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (organisation_id, module_id)
        DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = NOW()
        RETURNING id, organisation_id, module_id, is_enabled, updated_at
      `;

      const entitlementRes = await client.query(upsertQuery, [
        organisationId,
        mod.id,
        isEnabled,
      ]);

      const updated = entitlementRes.rows[0];

      // 3. Record immutable audit log (AUD-001, AUD-002)
      await recordAuditEvent({
        organisationId,
        actorId,
        action: isEnabled ? 'org.module.activate' : 'org.module.deactivate',
        entityType: 'module',
        entityId: mod.id,
        metadata: {
          moduleSlug: mod.slug,
          moduleName: mod.name,
          isEnabled,
        },
        ipAddress,
        userAgent,
        client,
      });

      return {
        id: mod.id,
        slug: mod.slug,
        name: mod.name,
        description: mod.description,
        isPlatformAvailable: mod.is_platform_available,
        isEnabled: updated.is_enabled,
        updatedAt: updated.updated_at,
      };
    }
  );
}
