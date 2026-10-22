/**
 * ManageX Events & Hackathons Router
 * Strictly adheres to PRD Section 7.1 (EVT-001, EVT-002, EVT-003) and docs/api-contracts.md.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  requireOrgMembership,
  requireOrgPermission,
  resolveOrgContext,
} from '../platform/middleware/organisation.js';
import { requireModuleEntitlement } from '../platform/middleware/module.js';
import {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  transitionEventStatus,
  listPublicEvents,
  getPublicEventById,
  registerForEvent,
  withdrawRegistration,
  getRegistrationStatus,
  listEventParticipants,
} from '../platform/events/eventService.js';
import {
  createEventTeam,
  listEventTeams,
  getEventTeamById,
  inviteTeamMember,
  acceptTeamInvitation,
  leaveEventTeam,
  removeTeamMember,
} from '../platform/events/teamService.js';
import {
  createOrUpdateSubmission,
  getMySubmission,
  listEventSubmissions,
} from '../platform/events/submissionService.js';
import {
  createScoringCriterion,
  listScoringCriteria,
  deleteScoringCriterion,
  assignJudge,
  removeJudgeAssignment,
  listJudgeAssignments,
  listJudgeWork,
  submitJudgeScores,
  getEventResults,
  publishEventResults,
  unpublishEventResults,
} from '../platform/events/judgingService.js';
import {
  listEventRounds,
  getEventRoundById,
  createEventRound,
  updateEventRound,
  deleteEventRound,
  listPublicEventRounds,
} from '../platform/events/roundService.js';
import { requireAuth, requireVerifiedUser } from '../platform/middleware/auth.js';
import { sendSuccess } from '../platform/common/responses.js';
import { ValidationError } from '../platform/common/errors.js';

export const eventsRouter = Router({ mergeParams: true });
export const publicEventsRouter = Router();

// Zod schemas for input validation (API-002)
const createEventSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(255),
  slug: z.string().trim().max(255).optional(),
  description: z.string().trim().optional(),
  eventType: z.enum(['general_event', 'hackathon']).default('general_event'),
  visibility: z.enum(['public', 'private']).default('private'),
  startAt: z.string().datetime({ message: 'Valid ISO start date-time is required' }),
  endAt: z.string().datetime({ message: 'Valid ISO end date-time is required' }),
  timezone: z.string().trim().min(1, 'Timezone is required'),
  locationType: z.enum(['in_person', 'virtual', 'hybrid']).default('in_person'),
  location: z.string().trim().optional(),
  virtualUrl: z.string().url('Virtual URL must be a valid http/https URL').optional().or(z.literal('')),
  registrationOpensAt: z.string().datetime().optional().nullable(),
  registrationClosesAt: z.string().datetime().optional().nullable(),
  capacity: z.number().int().positive('Capacity must be a positive integer').optional().nullable(),
  participantInstructions: z.string().trim().optional(),
});

const updateEventSchema = createEventSchema.partial();

const statusTransitionSchema = z.object({
  status: z.enum([
    'draft',
    'published',
    'registration_closed',
    'in_progress',
    'completed',
    'cancelled',
    'archived',
  ]),
});

/**
 * Helper to determine whether caller is privileged enough to view draft events.
 * Event managers, admins, and owners can view drafts; regular members only see published events.
 */
function canUserViewDrafts(req) {
  if (!req.membership) return false;
  const isOwnerOrAdmin =
    req.membership.roleSlug === 'organisation_owner' ||
    req.membership.roleSlug === 'organisation_admin' ||
    req.membership.roles?.some((r) => r.slug === 'organisation_owner' || r.slug === 'organisation_admin' || r.slug === 'event_admin');

  if (isOwnerOrAdmin) return true;

  return (
    req.membership.permissions?.has('event.create') ||
    req.membership.permissions?.has('event.edit') ||
    req.membership.permissions?.has('event.status.manage') ||
    false
  );
}

// -----------------------------------------------------------------------------
// 1. List Organisation Events (EVT-001, EVT-003)
// -----------------------------------------------------------------------------
eventsRouter.get(
  '/',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const canViewDrafts = canUserViewDrafts(req);
      const { events, pagination } = await listEvents(req.organisation.id, {
        status: req.query.status,
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit,
        canViewDrafts,
      });

      return sendSuccess(res, 200, { events, pagination, entitled: true });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 2. Create Event in 'draft' status (EVT-001)
// -----------------------------------------------------------------------------
eventsRouter.post(
  '/',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.create'),
  async (req, res, next) => {
    try {
      const parseResult = createEventSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        }));
        throw new ValidationError('Validation failed for event creation.', details);
      }

      const createdEvent = await createEvent(
        req.organisation.id,
        parseResult.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { event: createdEvent });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 3. Get Event Details (EVT-001, EVT-003)
// -----------------------------------------------------------------------------
eventsRouter.get(
  '/:eventId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const canViewDrafts = canUserViewDrafts(req);
      const event = await getEventById(req.organisation.id, req.params.eventId, {
        canViewDrafts,
        userId: req.user?.id,
      });

      return sendSuccess(res, 200, { event });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 4. Update Event (EVT-001)
// -----------------------------------------------------------------------------
eventsRouter.patch(
  '/:eventId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const parseResult = updateEventSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        }));
        throw new ValidationError('Validation failed for event update.', details);
      }

      const updated = await updateEvent(
        req.organisation.id,
        req.params.eventId,
        parseResult.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { event: updated });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 5. Advance Event Status (EVT-002)
// -----------------------------------------------------------------------------
const handleStatusTransition = async (req, res, next) => {
  try {
    const parseResult = statusTransitionSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Valid target status is required.');
    }

    const updated = await transitionEventStatus(
      req.organisation.id,
      req.params.eventId,
      parseResult.data.status,
      req.user.id,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
    );

    return sendSuccess(res, 200, { event: updated });
  } catch (err) {
    next(err);
  }
};

eventsRouter.post(
  '/:eventId/status',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.status.manage'),
  handleStatusTransition
);

eventsRouter.patch(
  '/:eventId/status',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.status.manage'),
  handleStatusTransition
);

// -----------------------------------------------------------------------------
// 6. Register Authenticated User for Event (EVT-004, EVT-005, ADR-003, ADR-008)
// Accessible to both internal organisation members and external participants with verified accounts
// -----------------------------------------------------------------------------
const registerSchema = z.object({
  customAnswers: z.record(z.unknown()).optional().default({}),
});

eventsRouter.post(
  '/:eventId/register',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const parseResult = registerSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid registration input.');
      }

      const registration = await registerForEvent(
        req.organisation.id,
        req.params.eventId,
        req.user.id,
        parseResult.data.customAnswers,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { registration });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 7. Withdraw Registration (EVT-005)
// -----------------------------------------------------------------------------
eventsRouter.post(
  '/:eventId/withdraw',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const registration = await withdrawRegistration(
        req.organisation.id,
        req.params.eventId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { registration });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 8. Own Registration Status (EVT-004)
// -----------------------------------------------------------------------------
eventsRouter.get(
  '/:eventId/my-registration',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const registration = await getRegistrationStatus(
        req.organisation.id,
        req.params.eventId,
        req.user.id
      );

      return sendSuccess(res, 200, { registration });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 9. Event Staff: List Registered Participants (EVT-004, EVT-005)
// Requires explicit event participant management permission or event view
// -----------------------------------------------------------------------------
eventsRouter.get(
  '/:eventId/participants',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const { participants, summary, pagination } = await listEventParticipants(
        req.organisation.id,
        req.params.eventId,
        {
          page: req.query.page,
          limit: req.query.limit,
          status: req.query.status,
          search: req.query.search,
        }
      );

      return sendSuccess(res, 200, { participants, summary }, { pagination });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 10. Hackathon Teams (EVT-006, ADR-007)
// -----------------------------------------------------------------------------
const createTeamSchema = z.object({
  name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(120),
  description: z.string().trim().max(1000).optional(),
});

eventsRouter.post(
  '/:eventId/teams',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const parseResult = createTeamSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Validation failed for team creation.', parseResult.error.issues);
      }

      const team = await createEventTeam(
        req.organisation.id,
        req.params.eventId,
        req.user.id,
        parseResult.data,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { team });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.get(
  '/:eventId/teams',
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const { teams, pagination } = await listEventTeams(
        req.organisation.id,
        req.params.eventId,
        {
          search: req.query.search,
          page: req.query.page,
          limit: req.query.limit,
        }
      );

      return sendSuccess(res, 200, { teams }, { pagination });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.get(
  '/:eventId/teams/:teamId',
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const team = await getEventTeamById(
        req.organisation.id,
        req.params.eventId,
        req.params.teamId
      );

      return sendSuccess(res, 200, { team });
    } catch (err) {
      next(err);
    }
  }
);

const inviteMemberSchema = z.object({
  email: z.string().trim().email('Valid email address required'),
});

eventsRouter.post(
  '/:eventId/teams/:teamId/invites',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const parseResult = inviteMemberSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid invite payload.', parseResult.error.issues);
      }

      const invitation = await inviteTeamMember(
        req.organisation.id,
        req.params.eventId,
        req.params.teamId,
        req.user.id,
        parseResult.data,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { invitation });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/team-invites/:token/accept',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const result = await acceptTeamInvitation(
        req.organisation.id,
        req.params.eventId,
        req.params.token,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/teams/:teamId/leave',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const result = await leaveEventTeam(
        req.organisation.id,
        req.params.eventId,
        req.params.teamId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.delete(
  '/:eventId/teams/:teamId/members/:userId',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const result = await removeTeamMember(
        req.organisation.id,
        req.params.eventId,
        req.params.teamId,
        req.user.id,
        req.params.userId,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 11. URL-Based Submissions (EVT-007)
// -----------------------------------------------------------------------------
const submissionSchema = z.object({
  title: z.string().trim().min(2, 'Submission title must be at least 2 characters').max(255),
  description: z.string().trim().max(5000).optional(),
  repositoryUrl: z
    .string()
    .trim()
    .url('Repository URL must be a valid http/https URL')
    .optional()
    .or(z.literal('')),
  demoUrl: z
    .string()
    .trim()
    .url('Demo URL must be a valid http/https URL')
    .optional()
    .or(z.literal('')),
  customFields: z.record(z.unknown()).optional().default({}),
});

eventsRouter.post(
  '/:eventId/submissions',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const parseResult = submissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Validation failed for project submission.', parseResult.error.issues);
      }

      const submission = await createOrUpdateSubmission(
        req.organisation.id,
        req.params.eventId,
        req.user.id,
        parseResult.data,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { submission });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.get(
  '/:eventId/my-submission',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const submission = await getMySubmission(
        req.organisation.id,
        req.params.eventId,
        req.user.id
      );

      return sendSuccess(res, 200, { submission });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.get(
  '/:eventId/submissions',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const { submissions, pagination } = await listEventSubmissions(
        req.organisation.id,
        req.params.eventId,
        {
          page: req.query.page,
          limit: req.query.limit,
        }
      );

      return sendSuccess(res, 200, { submissions }, { pagination });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// Phase 6D: Scoring Criteria Management (EVT-008)
// -----------------------------------------------------------------------------

const createCriterionSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  description: z.string().trim().optional(),
  orderIndex: z.number().int().optional().default(0),
  maxScore: z.number().int().min(1).max(100).default(100),
});

eventsRouter.get(
  '/:eventId/criteria',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const criteria = await listScoringCriteria(req.organisation.id, req.params.eventId);
      return sendSuccess(res, 200, { criteria });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/criteria',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const parsed = createCriterionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const criterion = await createScoringCriterion(
        req.organisation.id,
        req.params.eventId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { criterion });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.delete(
  '/:eventId/criteria/:criterionId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const result = await deleteScoringCriterion(
        req.organisation.id,
        req.params.eventId,
        req.params.criterionId,
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
// Phase 6D: Judge Assignments (EVT-008)
// -----------------------------------------------------------------------------

const assignJudgeSchema = z.object({
  judgeUserId: z.string().uuid('Valid judge user UUID is required'),
  submissionId: z.string().uuid().optional().nullable(),
});

eventsRouter.get(
  '/:eventId/judges',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const assignments = await listJudgeAssignments(req.organisation.id, req.params.eventId);
      return sendSuccess(res, 200, { assignments });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/judges',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.participant.manage'),
  async (req, res, next) => {
    try {
      const parsed = assignJudgeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const assignment = await assignJudge(
        req.organisation.id,
        req.params.eventId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { assignment });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.delete(
  '/:eventId/judges/:assignmentId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.participant.manage'),
  async (req, res, next) => {
    try {
      const result = await removeJudgeAssignment(
        req.organisation.id,
        req.params.eventId,
        req.params.assignmentId,
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
// Phase 6D: Judge Assigned Work & Score Submission (EVT-008)
// -----------------------------------------------------------------------------

eventsRouter.get(
  '/:eventId/judge-work',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const data = await listJudgeWork(
        req.organisation.id,
        req.params.eventId,
        req.user.id
      );

      return sendSuccess(res, 200, data);
    } catch (err) {
      next(err);
    }
  }
);

const submitScoresSchema = z.object({
  submissionId: z.string().uuid().optional(),
  scores: z.array(
    z.object({
      criterionId: z.string().uuid('Valid criterion UUID required'),
      score: z.number().min(0).max(100),
      feedback: z.string().optional().nullable(),
    })
  ).min(1, 'At least one criterion score is required'),
});

const handleScoreSubmission = async (req, res, next) => {
  try {
    const submissionId = req.params.submissionId || req.body.submissionId;
    if (!submissionId) {
      throw new ValidationError('submissionId is required either in the path or body.');
    }

    const parsed = submitScoresSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues);
    }

    const result = await submitJudgeScores(
      req.organisation.id,
      req.params.eventId,
      submissionId,
      req.user.id,
      { scores: parsed.data.scores },
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
    );

    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
};

eventsRouter.post(
  '/:eventId/submissions/:submissionId/scores',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  handleScoreSubmission
);

eventsRouter.post(
  '/:eventId/scores',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  handleScoreSubmission
);

// -----------------------------------------------------------------------------
// Phase 6D: Results Calculation & Publication (EVT-009, ADR-009)
// -----------------------------------------------------------------------------

eventsRouter.get(
  '/:eventId/results',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const canManageResults =
        req.membership?.roleSlug === 'organisation_owner' ||
        req.membership?.roleSlug === 'organisation_admin' ||
        req.membership?.roles?.some(
          (r) => r.slug === 'organisation_owner' || r.slug === 'organisation_admin' || r.slug === 'event_admin'
        ) ||
        req.membership?.permissions?.has('event.result.publish') ||
        req.membership?.permissions?.has('event.edit') ||
        false;

      const data = await getEventResults(
        req.organisation.id,
        req.params.eventId,
        req.user.id,
        { canManageResults, isPublic: false }
      );

      return sendSuccess(res, 200, data);
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/publish-results',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.result.publish'),
  async (req, res, next) => {
    try {
      const result = await publishEventResults(
        req.organisation.id,
        req.params.eventId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/unpublish-results',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.result.publish'),
  async (req, res, next) => {
    try {
      const result = await unpublishEventResults(
        req.organisation.id,
        req.params.eventId,
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
// Phase 02B: Multi-Round Hackathons Management (EVT-010)
// -----------------------------------------------------------------------------

const createRoundSchema = z.object({
  name: z.string().trim().min(2, 'Round name must be at least 2 characters').max(120),
  description: z.string().trim().optional(),
  instructions: z.string().trim().optional(),
  roundNumber: z.number().int().positive().optional(),
  submissionOpensAt: z.string().datetime().optional().nullable(),
  submissionClosesAt: z.string().datetime().optional().nullable(),
  advancementRule: z.enum(['manual', 'score_threshold', 'top_n']).default('manual'),
  advancementThreshold: z.number().min(0).max(1000).optional().nullable(),
  advancementTopN: z.number().int().positive().optional().nullable(),
  status: z.enum(['pending', 'open', 'judging', 'completed']).default('pending'),
});

const updateRoundSchema = createRoundSchema.partial();

eventsRouter.get(
  '/:eventId/rounds',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const rounds = await listEventRounds(req.organisation.id, req.params.eventId);
      return sendSuccess(res, 200, { rounds });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.get(
  '/:eventId/rounds/:roundId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const round = await getEventRoundById(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId
      );
      return sendSuccess(res, 200, { round });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/rounds',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const parsed = createRoundSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for round creation.', parsed.error.issues);
      }

      const round = await createEventRound(
        req.organisation.id,
        req.params.eventId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { round });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.patch(
  '/:eventId/rounds/:roundId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const parsed = updateRoundSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for round update.', parsed.error.issues);
      }

      const round = await updateEventRound(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { round });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.delete(
  '/:eventId/rounds/:roundId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const result = await deleteEventRound(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

const handlePublicEvents = async (req, res, next) => {
  try {
    const { events, pagination } = await listPublicEvents({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
    });
    return sendSuccess(res, 200, { events, pagination });
  } catch (err) {
    next(err);
  }
};

publicEventsRouter.get('/', handlePublicEvents);
publicEventsRouter.get('/public', handlePublicEvents);

// Public published results endpoint
publicEventsRouter.get('/:eventId/results', async (req, res, next) => {
  try {
    const data = await getEventResults(
      null,
      req.params.eventId,
      null,
      { canManageResults: false, isPublic: true }
    );
    return sendSuccess(res, 200, data);
  } catch (err) {
    next(err);
  }
});

// Public event rounds endpoint (EVT-010)
publicEventsRouter.get('/:eventId/rounds', async (req, res, next) => {
  try {
    const rounds = await listPublicEventRounds(req.params.eventId);
    return sendSuccess(res, 200, { rounds });
  } catch (err) {
    next(err);
  }
});

// Public single event detail endpoint (EVT-003)
publicEventsRouter.get('/:eventId', async (req, res, next) => {
  try {
    const event = await getPublicEventById(req.params.eventId);
    return sendSuccess(res, 200, { event });
  } catch (err) {
    next(err);
  }
});
