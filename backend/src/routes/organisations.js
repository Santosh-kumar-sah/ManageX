/**
 * ManageX Organisation & Membership Router
 * Strictly adheres to PRD Section 6.2 (ORG-001 through ORG-010),
 * Section 6.3 (RBAC-001 through RBAC-007),
 * Section 6.4 (MOD-001 through MOD-005),
 * Section 6.5 (AUD-001 through AUD-005), and docs/api-contracts.md.
 * 
 * Endpoints:
 * - GET    /api/v1/organisations                                -> List user's active organisations
 * - POST   /api/v1/organisations                                -> Create organisation (atomic Owner assignment)
 * - GET    /api/v1/organisations/:orgId                         -> Get active organisation details
 * - PATCH  /api/v1/organisations/:orgId                         -> Update organisation settings (approved fields)
 * - GET    /api/v1/organisations/:orgId/members                 -> List organisation members & pending invites
 * - PATCH  /api/v1/organisations/:orgId/members/:userId         -> Update member role or status
 * - POST   /api/v1/organisations/:orgId/invitations             -> Invite member by email (7-day single use)
 * - POST   /api/v1/organisations/:orgId/invitations/:id/revoke  -> Revoke pending invitation
 * - POST   /api/v1/organisations/:orgId/transfer-owner          -> High-impact ownership transfer with step-up reauth
 * - POST   /api/v1/organisations/:orgId/leave                   -> Leave organisation (final-owner protected)
 * - GET    /api/v1/organisations/:orgId/modules                 -> List module catalogue & activation state
 * - PATCH  /api/v1/organisations/:orgId/modules/:moduleKey      -> Activate or deactivate module (MOD-002)
 * - GET    /api/v1/organisations/:orgId/permissions             -> Central machine-readable permission catalogue
 * - GET    /api/v1/organisations/:orgId/roles                   -> Available roles for organisation
 * - POST   /api/v1/organisations/:orgId/members/:userId/roles   -> Assign role to member (anti-escalation RBAC-005)
 * - DELETE /api/v1/organisations/:orgId/members/:userId/roles/:roleSlug -> Remove role from member
 * - GET    /api/v1/organisations/:orgId/audit-logs              -> Paginated audit logs (AUD-004)
 * - GET    /api/v1/organisations/:orgId/events                  -> Events module entitlement verification
 * - GET    /api/v1/organisations/:orgId/meetings                -> Meetings module entitlement verification
 * - GET    /api/v1/organisations/:orgId/projects                -> Projects module entitlement verification
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedUser } from '../platform/middleware/auth.js';
import {
  requireOrgMembership,
  requireOrgPermission,
  requireOrgRole,
} from '../platform/middleware/organisation.js';
import { requireModuleEntitlement } from '../platform/middleware/module.js';
import {
  createOrganisation,
  listUserOrganisations,
  updateOrganisation,
  listOrganisationMembers,
  updateMember,
  transferOwnership,
  leaveOrganisation,
  createInvitation,
  revokeInvitation,
} from '../platform/organisations/organisationService.js';
import {
  listOrganisationModules,
  updateOrganisationModule,
} from '../platform/modules/moduleService.js';
import {
  listPermissionsCatalogue,
  listRolesForOrganisation,
  assignRoleToMember,
  removeRoleFromMember,
} from '../platform/rbac/permissionService.js';
import { listOrganisationAuditLogs } from '../platform/audit/auditService.js';
import { eventsRouter } from './events.js';
import { meetingsRouter } from './meetings.js';
import { sendSuccess } from '../platform/common/responses.js';
import { ValidationError } from '../platform/common/errors.js';

export const organisationsRouter = Router();

// All organisation endpoints require active, verified user session
organisationsRouter.use(requireAuth);
organisationsRouter.use(requireVerifiedUser);

// -----------------------------------------------------------------------------
// 1. List user's accessible organisations (ORG-002)
// -----------------------------------------------------------------------------
organisationsRouter.get('/', async (req, res, next) => {
  try {
    const organisations = await listUserOrganisations(req.user.id);
    return sendSuccess(res, 200, { organisations });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 2. Create organisation with atomic initial Owner membership (ORG-001)
// -----------------------------------------------------------------------------
const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Organisation name must be at least 2 characters').max(255),
  slug: z.string().trim().min(2).max(100).optional(),
});

organisationsRouter.post('/', async (req, res, next) => {
  try {
    const parseResult = createOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw new ValidationError('Validation failed for organisation input.', details);
    }

    const { name, slug } = parseResult.data;

    const organisation = await createOrganisation({
      name,
      slug,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return sendSuccess(res, 201, { organisation });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 3. Get active organisation details
// -----------------------------------------------------------------------------
organisationsRouter.get('/:orgId', requireOrgMembership, async (req, res) => {
  return sendSuccess(res, 200, {
    organisation: req.organisation,
    membership: {
      id: req.membership.id,
      role: {
        slug: req.membership.roleSlug,
        name: req.membership.roleName,
      },
      roles: req.membership.roles || [],
      permissions: Array.from(req.membership.permissions),
    },
  });
});

// -----------------------------------------------------------------------------
// 4. Update organisation profile/settings (ORG-009)
// -----------------------------------------------------------------------------
const updateOrgSchema = z.object({
  name: z.string().trim().min(2, 'Organisation name must be at least 2 characters').max(255),
});

organisationsRouter.patch(
  '/:orgId',
  requireOrgMembership,
  requireOrgPermission('org.edit'),
  async (req, res, next) => {
    try {
      const parseResult = updateOrgSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        throw new ValidationError('Validation failed for organisation update.', details);
      }

      const updatedOrg = await updateOrganisation(
        req.organisation.id,
        parseResult.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { organisation: updatedOrg });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 5. List organisation members and pending invitations (ORG-004, ORG-007)
// -----------------------------------------------------------------------------
organisationsRouter.get(
  '/:orgId/members',
  requireOrgMembership,
  requireOrgPermission('org.members.view'),
  async (req, res, next) => {
    try {
      const { members, invitations } = await listOrganisationMembers(req.organisation.id);
      return sendSuccess(res, 200, { members, invitations });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 6. Update member role or lifecycle status (ORG-007, ORG-008)
// -----------------------------------------------------------------------------
const updateMemberSchema = z.object({
  roleSlug: z.enum([
    'organisation_owner',
    'organisation_admin',
    'organisation_member',
    'event_admin',
    'event_manager',
    'event_judge',
    'event_participant',
    'event_viewer',
    'meeting_admin',
    'meeting_organiser',
    'meeting_participant',
    'meeting_viewer',
    'project_admin',
    'project_manager',
    'project_team_member',
    'project_viewer',
  ]).optional(),
  status: z.enum(['active', 'suspended', 'removed']).optional(),
});

organisationsRouter.patch(
  '/:orgId/members/:userId',
  requireOrgMembership,
  requireOrgPermission('org.members.manage'),
  async (req, res, next) => {
    try {
      const parseResult = updateMemberSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        throw new ValidationError('Validation failed for member update.', details);
      }

      const result = await updateMember({
        organisationId: req.organisation.id,
        targetUserId: req.params.userId,
        roleSlug: parseResult.data.roleSlug,
        status: parseResult.data.status,
        actorId: req.user.id,
        actorRoleSlug: req.membership.roleSlug,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, 200, { member: result });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 7. Invite a member by email (ORG-005)
// -----------------------------------------------------------------------------
const inviteMemberSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  roleSlug: z.enum(['organisation_admin', 'organisation_member']).default('organisation_member'),
});

organisationsRouter.post(
  '/:orgId/invitations',
  requireOrgMembership,
  requireOrgPermission('org.members.manage'),
  async (req, res, next) => {
    try {
      const parseResult = inviteMemberSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        throw new ValidationError('Validation failed for invitation input.', details);
      }

      const invitation = await createInvitation({
        organisationId: req.organisation.id,
        email: parseResult.data.email,
        roleSlug: parseResult.data.roleSlug,
        actorUser: req.user,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, 201, { invitation });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 8. Revoke a pending invitation (ORG-005)
// -----------------------------------------------------------------------------
organisationsRouter.post(
  '/:orgId/invitations/:invitationId/revoke',
  requireOrgMembership,
  requireOrgPermission('org.members.manage'),
  async (req, res, next) => {
    try {
      const result = await revokeInvitation(
        req.organisation.id,
        req.params.invitationId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );
      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 9. Step-Up Ownership Transfer (ORG-008)
// -----------------------------------------------------------------------------
const transferOwnerSchema = z.object({
  targetUserId: z.string().uuid('Target user UUID is required'),
  password: z.string().min(1, 'Current password is required for step-up reauthentication'),
});

organisationsRouter.post(
  '/:orgId/transfer-owner',
  requireOrgMembership,
  requireOrgRole(['organisation_owner']),
  async (req, res, next) => {
    try {
      const parseResult = transferOwnerSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        throw new ValidationError('Validation failed for ownership transfer.', details);
      }

      const result = await transferOwnership({
        organisationId: req.organisation.id,
        targetUserId: parseResult.data.targetUserId,
        password: parseResult.data.password,
        actorUser: req.user,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 10. Leave Organisation (ORG-010)
// -----------------------------------------------------------------------------
organisationsRouter.post(
  '/:orgId/leave',
  requireOrgMembership,
  async (req, res, next) => {
    try {
      const result = await leaveOrganisation(
        req.organisation.id,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );
      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 11. Module Catalogue & Organisation Activation (MOD-001, MOD-002)
// -----------------------------------------------------------------------------
organisationsRouter.get(
  '/:orgId/modules',
  requireOrgMembership,
  requireOrgPermission('org.view'),
  async (req, res, next) => {
    try {
      const modules = await listOrganisationModules(req.organisation.id);
      return sendSuccess(res, 200, { modules });
    } catch (err) {
      next(err);
    }
  }
);

const updateModuleSchema = z.object({
  is_enabled: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
}).refine((data) => typeof data.is_enabled === 'boolean' || typeof data.isEnabled === 'boolean', {
  message: 'is_enabled or isEnabled boolean is required',
}).transform((data) => ({
  is_enabled: typeof data.is_enabled === 'boolean' ? data.is_enabled : data.isEnabled,
}));

organisationsRouter.patch(
  '/:orgId/modules/:moduleKey',
  requireOrgMembership,
  requireOrgPermission('org.modules.manage'),
  async (req, res, next) => {
    try {
      const parseResult = updateModuleSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        throw new ValidationError('Validation failed for module entitlement update.', details);
      }

      const updatedModule = await updateOrganisationModule({
        organisationId: req.organisation.id,
        moduleSlug: req.params.moduleKey,
        isEnabled: parseResult.data.is_enabled,
        actorId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, 200, { module: updatedModule });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 12. Central Permission Catalogue & Roles (RBAC-002, RBAC-003)
// -----------------------------------------------------------------------------
organisationsRouter.get(
  '/:orgId/permissions',
  requireOrgMembership,
  async (req, res, next) => {
    try {
      const catalogue = await listPermissionsCatalogue();
      return sendSuccess(res, 200, { permissions: catalogue });
    } catch (err) {
      next(err);
    }
  }
);

organisationsRouter.get(
  '/:orgId/roles',
  requireOrgMembership,
  async (req, res, next) => {
    try {
      const roles = await listRolesForOrganisation(req.organisation.id);
      return sendSuccess(res, 200, { roles });
    } catch (err) {
      next(err);
    }
  }
);

const assignRoleSchema = z.object({
  roleSlug: z.string().min(1, 'roleSlug is required'),
});

organisationsRouter.post(
  '/:orgId/members/:userId/roles',
  requireOrgMembership,
  requireOrgPermission('org.members.manage'),
  async (req, res, next) => {
    try {
      const parseResult = assignRoleSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        throw new ValidationError('Validation failed for role assignment.', details);
      }

      const result = await assignRoleToMember({
        organisationId: req.organisation.id,
        targetUserId: req.params.userId,
        roleSlug: parseResult.data.roleSlug,
        actorId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

organisationsRouter.delete(
  '/:orgId/members/:userId/roles/:roleSlug',
  requireOrgMembership,
  requireOrgPermission('org.members.manage'),
  async (req, res, next) => {
    try {
      const result = await removeRoleFromMember({
        organisationId: req.organisation.id,
        targetUserId: req.params.userId,
        roleSlug: req.params.roleSlug,
        actorId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 13. Organisation Audit Logs (AUD-001, AUD-004, API-004)
// -----------------------------------------------------------------------------
organisationsRouter.get(
  '/:orgId/audit-logs',
  requireOrgMembership,
  requireOrgPermission('org.audit.view'),
  async (req, res, next) => {
    try {
      const page = req.query.page ? parseInt(req.query.page, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;

      const { auditLogs, pagination } = await listOrganisationAuditLogs({
        organisationId: req.organisation.id,
        page,
        limit,
      });

      return sendSuccess(res, 200, { auditLogs }, { pagination });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 14. Events Module Core Router (Phase 6A: EVT-001, EVT-002, EVT-003)
// -----------------------------------------------------------------------------
organisationsRouter.use('/:orgId/events', eventsRouter);

// -----------------------------------------------------------------------------
// 15. Meetings Module Core Router (Phase 7A: MTG-001, MTG-002, MTG-003, MTG-004)
// -----------------------------------------------------------------------------
organisationsRouter.use('/:orgId/meetings', meetingsRouter);

organisationsRouter.get(
  '/:orgId/projects',
  requireOrgMembership,
  requireModuleEntitlement('projects'),
  requireOrgPermission('project.view'),
  async (req, res) => {
    return sendSuccess(res, 200, {
      module: 'projects',
      entitled: true,
      message: 'Projects module is active and accessible for this organisation.',
    });
  }
);
