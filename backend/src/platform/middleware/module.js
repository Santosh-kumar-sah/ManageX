/**
 * ManageX Module Entitlement Middleware
 * Strictly adheres to PRD Section 6.4 (MOD-003, MOD-004), ADR-016, and docs/security.md.
 * 
 * Rules:
 * - Module platform availability, organisation activation, user permissions, and resource scope
 *   are separate independent checks (MOD-003). Passing one does not imply the others.
 * - Direct requests to disabled modules fail closed with 403 Forbidden ('MODULE_DISABLED' / 'MODULE_PLATFORM_UNAVAILABLE') (MOD-004).
 */

import { checkModuleEntitlement } from '../modules/moduleService.js';
import { AuthorizationError } from '../common/errors.js';

/**
 * Express middleware that asserts the specified module is platform-available and enabled
 * for the active organisation context.
 * 
 * @param {string} moduleSlug - e.g. 'events', 'meetings', 'projects'
 */
export function requireModuleEntitlement(moduleSlug) {
  return async function moduleEntitlementGuard(req, res, next) {
    try {
      if (!req.organisation) {
        throw new AuthorizationError(
          'Organisation context is required to evaluate module entitlement.',
          'ORG_CONTEXT_REQUIRED'
        );
      }

      const entitlement = await checkModuleEntitlement({
        organisationId: req.organisation.id,
        moduleSlug,
      });

      if (!entitlement.isPlatformAvailable) {
        throw new AuthorizationError(
          `The '${entitlement.module.name}' module is currently unavailable at the platform level.`,
          'MODULE_PLATFORM_UNAVAILABLE'
        );
      }

      if (!entitlement.isEnabled) {
        throw new AuthorizationError(
          `The '${entitlement.module.name}' module is deactivated for this organisation.`,
          'MODULE_DISABLED'
        );
      }

      req.moduleEntitlement = entitlement;
      next();
    } catch (err) {
      next(err);
    }
  };
}
