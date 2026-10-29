/**
 * ManageX Events & Hackathons Router
 * Strictly adheres to PRD Section 7.1 (EVT-001, EVT-002, EVT-003) and docs/api-contracts.md.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  requireOrgMembership,
  requireOrgPermission,
  requireStrictOrgPermission,
  requireStrictOrgPermissionIfMember,
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
  getParticipantDashboard,
} from '../platform/events/eventService.js';
import {
  createEventTeam,
  listEventTeams,
  getEventTeamById,
  getMyEventTeam,
  inviteTeamMember,
  acceptTeamInvitation,
  leaveEventTeam,
  removeTeamMember,
} from '../platform/events/teamService.js';
import {
  createOrUpdateSubmission,
  getMySubmission,
  listEventSubmissions,
  createOrUpdateRoundSubmission,
  getMyRoundSubmission,
  listRoundSubmissions,
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
  getEvaluationSessionWork,
  submitEvaluationSessionScores,
  getEventResults,
  publishEventResults,
  unpublishEventResults,
  getRoundResults,
  publishRoundResults,
  unpublishRoundResults,
} from '../platform/events/judgingService.js';
import {
  advanceRound,
  listRoundAdvancements,
} from '../platform/events/advancementService.js';
import {
  listEventRounds,
  getEventRoundById,
  createEventRound,
  updateEventRound,
  deleteEventRound,
  listPublicEventRounds,
} from '../platform/events/roundService.js';
import {
  getRoundEvaluation,
  createRoundEvaluation,
  updateRoundEvaluation,
  createEvaluationPanel,
  listEvaluationPanels,
  updateEvaluationPanel,
  deleteEvaluationPanel,
  assignJudgeToPanel,
  removeJudgeFromPanel,
  createEvaluationSession,
  generateEvaluationSchedule,
  rescheduleEvaluationSession,
  cancelEvaluationSession,
  updateSessionStatus,
  listEvaluationSessions,
  publishEvaluationSchedule,
  unpublishEvaluationSchedule,
  createEvaluationJudgeInvitation,
  revokeEvaluationJudgeInvitation,
  completeRoundEvaluation,
} from '../platform/events/evaluationService.js';
import {
  generateEventContentInputSchema,
  generateJudgingRubricInputSchema,
} from '../platform/ai/schemas/eventsAiSchemas.js';
import {
  generateEventContent,
  generateJudgingRubric,
} from '../platform/ai/eventsAiService.js';
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

eventsRouter.get(
  '/:eventId/my-team',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const team = await getMyEventTeam(
        req.organisation.id,
        req.params.eventId,
        req.user.id
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
  roundId: z.string().uuid().optional().nullable(),
});

eventsRouter.get(
  '/:eventId/criteria',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const criteria = await listScoringCriteria(req.organisation.id, req.params.eventId, {
        roundId: req.query.roundId || null,
      });
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
  roundId: z.string().uuid().optional().nullable(),
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

const submitEvaluationSessionScoresSchema = z.object({
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

eventsRouter.get(
  '/:eventId/rounds/:roundId/evaluation/sessions/:sessionId/work',
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  requireStrictOrgPermissionIfMember('event.evaluation.view'),
  async (req, res, next) => {
    try {
      const work = await getEvaluationSessionWork(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.sessionId,
        req.user.id
      );
      return sendSuccess(res, 200, work);
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/sessions/:sessionId/scores',
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  requireStrictOrgPermissionIfMember('event.evaluation.view'),
  async (req, res, next) => {
    try {
      const parsed = submitEvaluationSessionScoresSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for evaluation session scores.', parsed.error.issues);
      }
      const result = await submitEvaluationSessionScores(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.sessionId,
        req.user.id,
        parsed.data,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );
      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
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

// -----------------------------------------------------------------------------
// Multi-Round Submissions, Advancement & Results (EVT-010)
// -----------------------------------------------------------------------------

const advanceRoundSchema = z.object({
  rule: z.enum(['manual', 'score_threshold', 'top_n']).optional(),
  threshold: z.number().min(0).max(1000).optional().nullable(),
  topN: z.number().int().positive().optional().nullable(),
  manualAdvancements: z.array(
    z.object({
      teamId: z.string().uuid().optional().nullable(),
      participantUserId: z.string().uuid().optional().nullable(),
      status: z.enum(['qualified', 'eliminated']),
      notes: z.string().max(500).optional().nullable(),
    })
  ).optional().default([]),
});

// Round Submissions
eventsRouter.post(
  '/:eventId/rounds/:roundId/submissions',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const parseResult = submissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Validation failed for round submission.', parseResult.error.issues);
      }

      const submission = await createOrUpdateRoundSubmission(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
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
  '/:eventId/rounds/:roundId/my-submission',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const submission = await getMyRoundSubmission(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.user.id
      );

      return sendSuccess(res, 200, { submission });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.get(
  '/:eventId/rounds/:roundId/submissions',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const { submissions, pagination } = await listRoundSubmissions(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
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

// Round Advancement
eventsRouter.post(
  '/:eventId/rounds/:roundId/advance',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const parsed = advanceRoundSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for round advancement.', parsed.error.issues);
      }

      const result = await advanceRound(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.get(
  '/:eventId/rounds/:roundId/advancements',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.view'),
  async (req, res, next) => {
    try {
      const advancements = await listRoundAdvancements(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.user.id
      );

      return sendSuccess(res, 200, { advancements });
    } catch (err) {
      next(err);
    }
  }
);

// Round Results & Publication
eventsRouter.get(
  '/:eventId/rounds/:roundId/results',
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

      const data = await getRoundResults(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
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
  '/:eventId/rounds/:roundId/publish-results',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.result.publish'),
  async (req, res, next) => {
    try {
      const result = await publishRoundResults(
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

eventsRouter.post(
  '/:eventId/rounds/:roundId/unpublish-results',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.result.publish'),
  async (req, res, next) => {
    try {
      const result = await unpublishRoundResults(
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

// -----------------------------------------------------------------------------
// Phase 2B: Round-Level Judge Scheduling & Evaluation (ADR-008, PRD Sec 7)
// -----------------------------------------------------------------------------

const createEvaluationSchema = z.object({
  evaluationMode: z.enum(['submission_based', 'live_showcase', 'hybrid']).default('live_showcase'),
  sessionDurationMinutes: z.number().int().min(5).max(180).default(15),
  bufferMinutes: z.number().int().min(0).max(60).default(5),
  judgesPerPanel: z.number().int().min(1).max(20).default(2),
  evaluationsPerTeam: z.number().int().min(1).max(10).default(1),
  scheduleStartsAt: z.string().datetime().optional().nullable(),
  scheduleEndsAt: z.string().datetime().optional().nullable(),
  defaultMeetingUrl: z.string().url().max(1000).optional().nullable().or(z.literal('')),
});

const updateEvaluationSchema = z.object({
  evaluationMode: z.enum(['submission_based', 'live_showcase', 'hybrid']).optional(),
  sessionDurationMinutes: z.number().int().min(5).max(180).optional(),
  bufferMinutes: z.number().int().min(0).max(60).optional(),
  judgesPerPanel: z.number().int().min(1).max(20).optional(),
  evaluationsPerTeam: z.number().int().min(1).max(10).optional(),
  scheduleStartsAt: z.string().datetime().optional().nullable(),
  scheduleEndsAt: z.string().datetime().optional().nullable(),
  defaultMeetingUrl: z.string().url().max(1000).optional().nullable().or(z.literal('')),
});

const createPanelSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  meetingUrl: z.string().url().max(1000).optional().nullable().or(z.literal('')),
  notes: z.string().max(1000).optional().nullable(),
});

const updatePanelSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  meetingUrl: z.string().url().max(1000).optional().nullable().or(z.literal('')),
  notes: z.string().max(1000).optional().nullable(),
});

const assignPanelJudgeSchema = z.object({
  judgeUserId: z.string().uuid('Valid judge user UUID is required'),
});

const createSessionSchema = z.object({
  panelId: z.string().uuid('Valid panel UUID is required'),
  teamId: z.string().uuid('Valid team UUID is required'),
  submissionId: z.string().uuid().optional().nullable(),
  startsAt: z.string().datetime({ message: 'Valid ISO startsAt date-time is required' }),
  endsAt: z.string().datetime({ message: 'Valid ISO endsAt date-time is required' }),
  meetingUrl: z.string().url().max(1000).optional().nullable().or(z.literal('')),
  slotIndex: z.number().int().min(0).optional().default(0),
  notes: z.string().max(1000).optional().nullable(),
});

const generateScheduleSchema = z.object({
  startsAt: z.string().datetime({ message: 'Valid ISO startsAt date-time is required' }),
  sessionDurationMinutes: z.number().int().min(5).max(180).optional(),
  bufferMinutes: z.number().int().min(0).max(60).optional(),
  defaultMeetingUrl: z.string().url().max(1000).optional().nullable().or(z.literal('')),
  teamIds: z.array(z.string().uuid()).optional(),
  overwriteExisting: z.boolean().optional(),
});

const evaluationJudgeInvitationSchema = z.object({
  email: z.string().email().max(255),
  panelId: z.string().uuid(),
});

const rescheduleSessionSchema = z.object({
  startsAt: z.string().datetime({ message: 'Valid ISO startsAt date-time is required' }),
  endsAt: z.string().datetime({ message: 'Valid ISO endsAt date-time is required' }),
  panelId: z.string().uuid().optional().nullable(),
  meetingUrl: z.string().url().max(1000).optional().nullable().or(z.literal('')),
});

const updateSessionStatusSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'no_show', 'cancelled']),
  cancellationReason: z.string().max(500).optional().nullable(),
});

function getCallerEvaluationRole(req) {
  const isOrganiser = Boolean(
    req.membership && (
      req.membership.permissions?.has('event.evaluation.manage') ||
      req.membership.permissions?.has('event.evaluation.judge.manage') ||
      req.membership.permissions?.has('event.evaluation.schedule.manage') ||
      req.membership.permissions?.has('event.evaluation.schedule.publish')
    )
  );

  return { isOrganiser };
}

// 1. Get round evaluation config
eventsRouter.get(
  '/:eventId/rounds/:roundId/evaluation',
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  requireStrictOrgPermissionIfMember('event.evaluation.view'),
  async (req, res, next) => {
    try {
      const { isOrganiser } = getCallerEvaluationRole(req);
      const data = await getRoundEvaluation(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        {
          userId: req.user?.id,
          isOrganiser,
        }
      );
      return sendSuccess(res, 200, data);
    } catch (err) {
      next(err);
    }
  }
);

// 2. Create round evaluation config
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.manage'),
  async (req, res, next) => {
    try {
      const parsed = createEvaluationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for evaluation creation.', parsed.error.issues);
      }

      const evaluation = await createRoundEvaluation(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { evaluation });
    } catch (err) {
      next(err);
    }
  }
);

// 3. Update round evaluation config
eventsRouter.patch(
  '/:eventId/rounds/:roundId/evaluation',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.manage'),
  async (req, res, next) => {
    try {
      const parsed = updateEvaluationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for evaluation update.', parsed.error.issues);
      }

      const evaluation = await updateRoundEvaluation(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { evaluation });
    } catch (err) {
      next(err);
    }
  }
);

// 4. List evaluation panels
eventsRouter.get(
  '/:eventId/rounds/:roundId/evaluation/panels',
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  requireStrictOrgPermissionIfMember('event.evaluation.view'),
  async (req, res, next) => {
    try {
      const { isOrganiser } = getCallerEvaluationRole(req);
      const data = await listEvaluationPanels(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        {
          userId: req.user?.id,
          isOrganiser,
        }
      );
      return sendSuccess(res, 200, data);
    } catch (err) {
      next(err);
    }
  }
);

// 5. Create evaluation panel
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/panels',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.judge.manage'),
  async (req, res, next) => {
    try {
      const parsed = createPanelSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for panel creation.', parsed.error.issues);
      }

      const panel = await createEvaluationPanel(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { panel });
    } catch (err) {
      next(err);
    }
  }
);

// 6. Update evaluation panel
eventsRouter.patch(
  '/:eventId/rounds/:roundId/evaluation/panels/:panelId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.judge.manage'),
  async (req, res, next) => {
    try {
      const parsed = updatePanelSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for panel update.', parsed.error.issues);
      }

      const panel = await updateEvaluationPanel(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.panelId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { panel });
    } catch (err) {
      next(err);
    }
  }
);

// 7. Delete evaluation panel
eventsRouter.delete(
  '/:eventId/rounds/:roundId/evaluation/panels/:panelId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.judge.manage'),
  async (req, res, next) => {
    try {
      const result = await deleteEvaluationPanel(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.panelId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// 8. Assign judge to panel
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/panels/:panelId/judges',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.judge.manage'),
  async (req, res, next) => {
    try {
      const parsed = assignPanelJudgeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for judge assignment.', parsed.error.issues);
      }

      const assignment = await assignJudgeToPanel(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.panelId,
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

// 9. Remove judge from panel
eventsRouter.delete(
  '/:eventId/rounds/:roundId/evaluation/panels/:panelId/judges/:judgeUserId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.judge.manage'),
  async (req, res, next) => {
    try {
      const result = await removeJudgeFromPanel(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.panelId,
        req.params.judgeUserId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// 10. List evaluation sessions
eventsRouter.get(
  '/:eventId/rounds/:roundId/evaluation/sessions',
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  requireStrictOrgPermissionIfMember('event.evaluation.view'),
  async (req, res, next) => {
    try {
      const { isOrganiser } = getCallerEvaluationRole(req);
      const data = await listEvaluationSessions(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        {
          userId: req.user?.id,
          isOrganiser,
        },
        {
          panelId: req.query.panelId,
          status: req.query.status,
        }
      );
      return sendSuccess(res, 200, data);
    } catch (err) {
      next(err);
    }
  }
);

// 11. Create single evaluation session
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/sessions',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.schedule.manage'),
  async (req, res, next) => {
    try {
      const parsed = createSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for session creation.', parsed.error.issues);
      }

      const session = await createEvaluationSession(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { session });
    } catch (err) {
      next(err);
    }
  }
);

// 12. Auto-generate evaluation schedule
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/schedule/generate',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.schedule.manage'),
  async (req, res, next) => {
    try {
      const parsed = generateScheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for schedule generation.', parsed.error.issues);
      }

      const result = await generateEvaluationSchedule(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, result);
    } catch (err) {
      next(err);
    }
  }
);

// 13. Reschedule session
eventsRouter.patch(
  '/:eventId/rounds/:roundId/evaluation/sessions/:sessionId/reschedule',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.schedule.manage'),
  async (req, res, next) => {
    try {
      const parsed = rescheduleSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for session rescheduling.', parsed.error.issues);
      }

      const session = await rescheduleEvaluationSession(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.sessionId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { session });
    } catch (err) {
      next(err);
    }
  }
);

// 14. Cancel session
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/sessions/:sessionId/cancel',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.schedule.manage'),
  async (req, res, next) => {
    try {
      const session = await cancelEvaluationSession(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.sessionId,
        req.body,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { session });
    } catch (err) {
      next(err);
    }
  }
);

// 15. Update session status
eventsRouter.patch(
  '/:eventId/rounds/:roundId/evaluation/sessions/:sessionId/status',
  resolveOrgContext,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.schedule.manage'),
  async (req, res, next) => {
    try {
      const parsed = updateSessionStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed for session status update.', parsed.error.issues);
      }

      const session = await updateSessionStatus(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        req.params.sessionId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { session });
    } catch (err) {
      next(err);
    }
  }
);

// 16. Publish evaluation schedule
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/publish',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.schedule.publish'),
  async (req, res, next) => {
    try {
      const result = await publishEvaluationSchedule(
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

// 17. Unpublish evaluation schedule
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/unpublish',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.schedule.publish'),
  async (req, res, next) => {
    try {
      const result = await unpublishEvaluationSchedule(
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

// 18. Evaluation judge invitations
eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/judge-invitations',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.judge.manage'),
  async (req, res, next) => {
    try {
      const parsed = evaluationJudgeInvitationSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Validation failed for judge invitation.', parsed.error.issues);
      const invitation = await createEvaluationJudgeInvitation(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        parsed.data.panelId,
        parsed.data.email,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );
      return sendSuccess(res, 201, { invitation });
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.delete(
  '/:eventId/rounds/:roundId/evaluation/judge-invitations/:invitationId',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.judge.manage'),
  async (req, res, next) => {
    try {
      const result = await revokeEvaluationJudgeInvitation(
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

eventsRouter.post(
  '/:eventId/rounds/:roundId/evaluation/complete',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireStrictOrgPermission('event.evaluation.manage'),
  async (req, res, next) => {
    try {
      const result = await completeRoundEvaluation(
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

// 19. Participant's own session (EVT-009 / Phase 2B)
eventsRouter.get(
  '/:eventId/rounds/:roundId/evaluation/my-session',
  requireAuth,
  requireVerifiedUser,
  resolveOrgContext,
  requireModuleEntitlement('events'),
  async (req, res, next) => {
    try {
      const data = await listEvaluationSessions(
        req.organisation.id,
        req.params.eventId,
        req.params.roundId,
        {
          userId: req.user.id,
          isOrganiser: false,
          isJudge: false,
          isParticipant: true,
        }
      );

      const session = data.sessions && data.sessions.length > 0 ? data.sessions[0] : null;
      return sendSuccess(res, 200, { session });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// Phase 03: Events & Hackathons AI Endpoints (AI-REQ-07, AI-REQ-08)
// -----------------------------------------------------------------------------

eventsRouter.post(
  '/:eventId/ai/content',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const parsed = generateEventContentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const draftResult = await generateEventContent({
        organisationId: req.organisation.id,
        eventId: req.params.eventId,
        userId: req.user.id,
        userPermissions: req.membership?.permissions || [],
        input: parsed.data,
      });

      return sendSuccess(res, 200, draftResult);
    } catch (err) {
      next(err);
    }
  }
);

eventsRouter.post(
  '/:eventId/ai/rubrics',
  requireOrgMembership,
  requireModuleEntitlement('events'),
  requireOrgPermission('event.edit'),
  async (req, res, next) => {
    try {
      const parsed = generateJudgingRubricInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const draftResult = await generateJudgingRubric({
        organisationId: req.organisation.id,
        eventId: req.params.eventId,
        roundId: req.query.roundId || req.body?.roundId || null,
        userId: req.user.id,
        userPermissions: req.membership?.permissions || [],
        input: parsed.data,
      });

      return sendSuccess(res, 200, draftResult);
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

// Participant Dashboard (EVT-004 / EVT-005)
publicEventsRouter.get(
  '/participant/dashboard',
  requireAuth,
  requireVerifiedUser,
  async (req, res, next) => {
    try {
      const data = await getParticipantDashboard(req.user.id);
      return sendSuccess(res, 200, data);
    } catch (err) {
      next(err);
    }
  }
);

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

// Public published round results endpoint (EVT-010)
publicEventsRouter.get('/:eventId/rounds/:roundId/results', async (req, res, next) => {
  try {
    const data = await getRoundResults(
      null,
      req.params.eventId,
      req.params.roundId,
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

// Public participant evaluation session endpoint (EVT-009 / Phase 2B)
publicEventsRouter.get(
  '/:eventId/rounds/:roundId/evaluation/my-session',
  requireAuth,
  requireVerifiedUser,
  async (req, res, next) => {
    try {
      const event = await getPublicEventById(req.params.eventId);
      const data = await listEvaluationSessions(
        event.organisation_id,
        req.params.eventId,
        req.params.roundId,
        {
          userId: req.user.id,
          isOrganiser: false,
          isJudge: false,
          isParticipant: true,
        }
      );

      const session = data.sessions && data.sessions.length > 0 ? data.sessions[0] : null;
      return sendSuccess(res, 200, { session });
    } catch (err) {
      next(err);
    }
  }
);
