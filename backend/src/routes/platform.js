/**
 * ManageX Platform Administration Routes
 * Strictly adheres to PRD Section 10 (PLAT-001 through PLAT-007), docs/security.md Section 4.B, and SEC-009.
 * 
 * Rules:
 * - All routes live under `/api/v1/platform`.
 * - Guarded by `requirePlatformSession` (PLAT-001).
 * - Super Admin vs Support Agent permissions enforced via `requirePlatformPermission` (PLAT-005).
 * - High-impact actions (account suspension, org suspension, module toggling) are audited (PLAT-007).
 * - Strictly no support ticketing product (PLAT-006).
 */

import { Router } from 'express';
import { z } from 'zod';
import { requirePlatformSession, requirePlatformPermission } from '../platform/middleware/platform.js';
import {
  getPlatformOverview,
  listAccounts,
  updateAccountStatus,
  listOrganisations,
  getOrganisationDetails,
  updateOrganisationStatus,
  listPlatformModules,
  updatePlatformModuleAvailability,
  listPlatformAuditLogs,
} from '../platform/admin/platformService.js';
import { sendSuccess, sendError } from '../platform/common/responses.js';

export const platformRouter = Router();

// Enforce platform authentication and session verification on all platform endpoints (PLAT-001)
platformRouter.use(requirePlatformSession);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const accountStatusSchema = z.object({
  status: z.enum(['active', 'suspended'], {
    required_error: "Status must be either 'active' or 'suspended'.",
  }),
  reason: z.string().max(500).optional(),
});

const orgStatusSchema = z.object({
  status: z.enum(['active', 'suspended'], {
    required_error: "Status must be either 'active' or 'suspended'.",
  }),
  reason: z.string().max(500).optional(),
});

const moduleAvailabilitySchema = z.object({
  is_available: z.boolean().optional(),
  is_platform_available: z.boolean().optional(),
  reason: z.string().max(500).optional(),
}).refine(
  (data) => data.is_available !== undefined || data.is_platform_available !== undefined,
  {
    message: "Either 'is_available' or 'is_platform_available' is required and must be a boolean.",
    path: ['is_available'],
  }
);

// -----------------------------------------------------------------------------
// 1. Overview & Operational Metrics (PLAT-001, PLAT-005)
// -----------------------------------------------------------------------------
platformRouter.get('/overview', requirePlatformPermission('platform.overview.read'), async (req, res, next) => {
  try {
    const overview = await getPlatformOverview();
    return sendSuccess(res, 200, overview);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 2. Global Accounts Management (PLAT-002, PLAT-005, PLAT-007)
// -----------------------------------------------------------------------------
platformRouter.get('/accounts', requirePlatformPermission('platform.account.read'), async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await listAccounts({ page, limit, search, status });
    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
});

platformRouter.patch('/accounts/:userId/status', requirePlatformPermission('platform.account.manage'), async (req, res, next) => {
  try {
    const parse = accountStatusSchema.safeParse(req.body);
    if (!parse.success) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid account status payload', parse.error.errors);
    }

    const { status, reason } = parse.data;
    const result = await updateAccountStatus({
      actorId: req.user.id,
      userId: req.params.userId,
      status,
      reason,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 3. Organisation Operational Metadata (PLAT-003, PLAT-005, SEC-009)
// -----------------------------------------------------------------------------
platformRouter.get('/organisations', requirePlatformPermission('platform.org.read'), async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await listOrganisations({ page, limit, search, status });
    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
});

platformRouter.get('/organisations/:orgId', requirePlatformPermission('platform.org.read'), async (req, res, next) => {
  try {
    const result = await getOrganisationDetails({ orgId: req.params.orgId });
    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
});

platformRouter.patch('/organisations/:orgId/status', requirePlatformPermission('platform.org.manage'), async (req, res, next) => {
  try {
    const parse = orgStatusSchema.safeParse(req.body);
    if (!parse.success) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid organisation status payload', parse.error.errors);
    }

    const { status, reason } = parse.data;
    const result = await updateOrganisationStatus({
      actorId: req.user.id,
      orgId: req.params.orgId,
      status,
      reason,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 4. Module Catalogue Platform Availability (PLAT-004, PLAT-005, PLAT-007)
// -----------------------------------------------------------------------------
platformRouter.get('/modules', requirePlatformPermission('platform.overview.read'), async (req, res, next) => {
  try {
    const modules = await listPlatformModules();
    return sendSuccess(res, 200, { modules });
  } catch (err) {
    next(err);
  }
});

platformRouter.patch('/modules/:slug', requirePlatformPermission('platform.module.manage'), async (req, res, next) => {
  try {
    const parse = moduleAvailabilitySchema.safeParse(req.body);
    if (!parse.success) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid module availability payload', parse.error.errors);
    }

    const { is_available, is_platform_available, reason } = parse.data;
    const targetAvailability = is_available !== undefined ? is_available : is_platform_available;
    const result = await updatePlatformModuleAvailability({
      actorId: req.user.id,
      slug: req.params.slug,
      isAvailable: targetAvailability,
      reason,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 5. Platform Audit Logs (PLAT-007)
// -----------------------------------------------------------------------------
platformRouter.get('/audit-logs', requirePlatformPermission('platform.audit.read'), async (req, res, next) => {
  try {
    const { page, limit, action, entityType } = req.query;
    const result = await listPlatformAuditLogs({ page, limit, action, entityType });
    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
});
