/**
 * ManageX Meetings Router (Phase 7A)
 * Strictly adheres to PRD Section 8.1 (MTG-001, MTG-002, MTG-003, MTG-004) and docs/api-contracts.md.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  requireOrgMembership,
  requireOrgPermission,
} from '../platform/middleware/organisation.js';
import { requireModuleEntitlement } from '../platform/middleware/module.js';
import {
  createMeeting,
  getMeetingById,
  getMeetingJoinUrl,
  listMeetings,
  updateMeeting,
  transitionMeetingStatus,
  listMeetingAttendees,
  addMeetingAttendee,
  removeMeetingAttendee,
  respondToMeetingInvitation,
  listMeetingAgenda,
  createMeetingAgendaItem,
  updateMeetingAgendaItem,
  deleteMeetingAgendaItem,
  reorderMeetingAgenda,
  getMeetingNotes,
  upsertMeetingNotes,
  listMeetingDiscussionPoints,
  createMeetingDiscussionPoint,
  updateMeetingDiscussionPoint,
  deleteMeetingDiscussionPoint,
  reorderMeetingDiscussionPoints,
  listMeetingDecisions,
  createMeetingDecision,
  updateMeetingDecision,
  deleteMeetingDecision,
  reorderMeetingDecisions,
  listMeetingActionItems,
  createMeetingActionItem,
  updateMeetingActionItem,
  deleteMeetingActionItem,
  listOrganisationActionItems,
  promoteMeetingActionItemToProjectTask,
  sendMeetingInvitations,
  getMeetingAnalytics,
  exportMeeting,
} from '../platform/meetings/meetingService.js';
import { syncMeetingWithGoogle } from '../platform/integrations/googleMeetService.js';
import { sendSuccess } from '../platform/common/responses.js';
import { ValidationError, AuthorizationError } from '../platform/common/errors.js';

export const meetingsRouter = Router({ mergeParams: true });

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createMeetingSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(255),
  description: z.string().trim().optional(),
  startAt: z.string().datetime({ message: 'Valid ISO start date-time is required' }),
  endAt: z.string().datetime({ message: 'Valid ISO end date-time is required' }),
  timezone: z.string().trim().min(1, 'Timezone is required'),
  locationType: z.enum(['in_person', 'virtual', 'hybrid']).default('in_person'),
  location: z.string().trim().optional(),
  virtualUrl: z.string().url('Virtual URL must be a valid http/https URL').optional().or(z.literal('')),
  visibility: z.enum(['organisation', 'attendees_only']).default('organisation'),
  organiserId: z.string().uuid('Valid organiser UUID is required').optional(),
  conferenceProvider: z.enum(['manual', 'google_meet', 'none']).optional(),
});

const updateMeetingSchema = createMeetingSchema.partial();

const transitionStatusSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'missed'], {
    errorMap: () => ({ message: "Status must be one of: 'scheduled', 'in_progress', 'completed', 'cancelled', 'missed'" }),
  }),
});

const addAttendeeSchema = z.object({
  userId: z.string().uuid('Valid user UUID required').optional(),
  externalEmail: z.string().trim().email('Valid email address required').optional(),
  role: z.enum(['organiser', 'participant', 'viewer', 'guest']).default('participant'),
});

const rsvpSchema = z.object({
  rsvpStatus: z.enum(['pending', 'accepted', 'declined', 'tentative']),
});

const createAgendaSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().trim().optional(),
  durationMinutes: z.number().int().positive('Duration must be positive').optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
});

const updateAgendaSchema = createAgendaSchema.partial();

const reorderAgendaSchema = z.object({
  itemIds: z.array(z.string().uuid('Valid item UUID required')).min(1, 'itemIds cannot be empty'),
});

const upsertNotesSchema = z.object({
  content: z
    .string({ required_error: 'Content is required' })
    .min(1, 'Meeting notes content must be a non-empty string')
    .max(50000, 'Meeting notes content exceeds maximum allowed length of 50,000 characters'),
  expectedUpdatedAt: z.string().datetime({ offset: true }).or(z.string()).optional(),
});

const createDiscussionPointSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255, 'Title cannot exceed 255 characters'),
  body: z.string().max(50000, 'Body exceeds maximum allowed length of 50,000 characters').optional().default(''),
});

const updateDiscussionPointSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(255, 'Title cannot exceed 255 characters').optional(),
  body: z.string().max(50000, 'Body exceeds maximum allowed length of 50,000 characters').optional(),
}).refine(data => data.title !== undefined || data.body !== undefined, {
  message: 'At least one field (title or body) must be provided for update',
});

const reorderDiscussionPointsSchema = z.object({
  itemIds: z.array(z.string().uuid('Valid discussion point UUID required')).min(1, 'itemIds cannot be empty'),
});

const createDecisionSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255, 'Title cannot exceed 255 characters'),
  details: z.string().max(50000, 'Details exceed maximum allowed length of 50,000 characters').optional().default(''),
});

const updateDecisionSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(255, 'Title cannot exceed 255 characters').optional(),
  details: z.string().max(50000, 'Details exceed maximum allowed length of 50,000 characters').optional(),
}).refine(data => data.title !== undefined || data.details !== undefined, {
  message: 'At least one field (title or details) must be provided for update',
});

const reorderDecisionsSchema = z.object({
  itemIds: z.array(z.string().uuid('Valid decision UUID required')).min(1, 'itemIds cannot be empty'),
});

const createActionItemSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().trim().optional().nullable(),
  assigneeId: z.string().uuid('Valid assignee UUID is required'),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  agendaItemId: z.string().uuid('Valid agenda item UUID is required').optional().nullable(),
  decisionId: z.string().uuid('Valid decision UUID is required').optional().nullable(),
});

const updateActionItemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().optional().nullable(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  agendaItemId: z.string().uuid().optional().nullable(),
  decisionId: z.string().uuid().optional().nullable(),
});

const promoteActionItemSchema = z.object({
  projectId: z.string().uuid('Valid destination project UUID is required'),
});

const sendInvitesSchema = z
  .object({
    attendeeIds: z.array(z.string().uuid('Valid attendee UUID required')).optional(),
  })
  .optional();

const analyticsQuerySchema = z.object({
  timeframe: z.enum(['all', '30d', '90d']).default('all'),
});

const exportQuerySchema = z.object({
  format: z.enum(['markdown', 'pdf']).default('markdown'),
});

// -----------------------------------------------------------------------------
// Module Entitlement & Membership Guard (Fail-Closed Defense-in-Depth)
// -----------------------------------------------------------------------------
meetingsRouter.use(requireOrgMembership);
meetingsRouter.use(requireModuleEntitlement('meetings'));

// -----------------------------------------------------------------------------
// 1. Meeting CRUD & Lifecycle Routes (MTG-001, MTG-002)
// -----------------------------------------------------------------------------

meetingsRouter.get(
  '/',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const result = await listMeetings(
        req.organisation.id,
        req.query,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, { meetings: result.meetings }, { pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.create'),
  async (req, res, next) => {
    try {
      const parsed = createMeetingSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const meeting = await createMeeting(
        req.organisation.id,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { meeting });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.get(
  '/action-items',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const result = await listOrganisationActionItems(
        req.organisation.id,
        req.user.id,
        viewerPermissions,
        req.query
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.get(
  '/analytics',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = analyticsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const analytics = await getMeetingAnalytics(
        req.organisation.id,
        req.user.id,
        viewerPermissions,
        { timeframe: parsed.data.timeframe }
      );

      return sendSuccess(res, 200, analytics);
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.get(
  '/:meetingId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const meeting = await getMeetingById(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, { meeting });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.patch(
  '/:meetingId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.edit'),
  async (req, res, next) => {
    try {
      const parsed = updateMeetingSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const meeting = await updateMeeting(
        req.organisation.id,
        req.params.meetingId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { meeting });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/:meetingId/status',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.status.manage'),
  async (req, res, next) => {
    try {
      const parsed = transitionStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const meeting = await transitionMeetingStatus(
        req.organisation.id,
        req.params.meetingId,
        parsed.data.status,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { meeting });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/organisations/:orgId/meetings/:meetingId/sync-google
 * Explicit on-demand retry endpoint for Google Calendar / Meet synchronization.
 * Requires: active organisation membership and meeting.edit permission or meeting organiser.
 */
meetingsRouter.post(
  '/:meetingId/sync-google',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  async (req, res, next) => {
    try {
      const rawPerms = req.membership?.permissions;
      const viewerPermissions = Array.isArray(rawPerms)
        ? rawPerms
        : (rawPerms instanceof Set ? Array.from(rawPerms) : []);
      const hasEditPerm =
        viewerPermissions.includes('meeting.edit') ||
        viewerPermissions.includes('meeting.status.manage') ||
        viewerPermissions.includes('org.admin') ||
        viewerPermissions.includes('org.owner');

      // Check organiser if caller lacks explicit edit permission
      if (!hasEditPerm) {
        const meeting = await getMeetingById(
          req.organisation.id,
          req.params.meetingId,
          req.user.id,
          viewerPermissions
        );
        if (meeting.organiserId !== req.user.id) {
          throw new AuthorizationError(
            'Permission denied to synchronize Google Meet link. Required: organiser or meeting.edit'
          );
        }
      }

      const syncResult = await syncMeetingWithGoogle({
        organisationId: req.organisation.id,
        meetingId: req.params.meetingId,
        actorUserId: req.user.id,
      });

      const updatedMeeting = await getMeetingById(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, {
        meeting: updatedMeeting,
        syncResult,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/organisations/:orgId/meetings/:meetingId/join
 * Authenticated Join Gateway (Phase 1B.5, Section 10.2).
 * Validates membership, visibility, terminal state, URL safety, records audit log, and returns virtualUrl.
 */
meetingsRouter.get(
  '/:meetingId/join',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  async (req, res, next) => {
    try {
      const rawPerms = req.membership?.permissions;
      const viewerPermissions = Array.isArray(rawPerms)
        ? rawPerms
        : (rawPerms instanceof Set ? Array.from(rawPerms) : []);

      const result = await getMeetingJoinUrl(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.get(
  '/:meetingId/export',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = exportQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const result = await exportMeeting(
        req.organisation.id,
        req.params.meetingId,
        parsed.data.format,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.content);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 2. Attendee Management Routes (MTG-003)
// -----------------------------------------------------------------------------

meetingsRouter.get(
  '/:meetingId/attendees',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const attendees = await listMeetingAttendees(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, { attendees });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/:meetingId/attendees',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.edit'),
  async (req, res, next) => {
    try {
      const parsed = addAttendeeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const attendee = await addMeetingAttendee(
        req.organisation.id,
        req.params.meetingId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { attendee });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.delete(
  '/:meetingId/attendees/:attendeeId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.edit'),
  async (req, res, next) => {
    try {
      const result = await removeMeetingAttendee(
        req.organisation.id,
        req.params.meetingId,
        req.params.attendeeId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/:meetingId/rsvp',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = rsvpSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const result = await respondToMeetingInvitation(
        req.organisation.id,
        req.params.meetingId,
        parsed.data.rsvpStatus,
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
// 3. Ordered Agenda Routes (MTG-004)
// -----------------------------------------------------------------------------

meetingsRouter.get(
  '/:meetingId/agenda',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const agendaItems = await listMeetingAgenda(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, { agendaItems });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/:meetingId/agenda',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.edit'),
  async (req, res, next) => {
    try {
      const parsed = createAgendaSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const agendaItem = await createMeetingAgendaItem(
        req.organisation.id,
        req.params.meetingId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { agendaItem });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.patch(
  '/:meetingId/agenda/:itemId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.edit'),
  async (req, res, next) => {
    try {
      const parsed = updateAgendaSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const agendaItem = await updateMeetingAgendaItem(
        req.organisation.id,
        req.params.meetingId,
        req.params.itemId,
        parsed.data,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { agendaItem });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.delete(
  '/:meetingId/agenda/:itemId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.edit'),
  async (req, res, next) => {
    try {
      const result = await deleteMeetingAgendaItem(
        req.organisation.id,
        req.params.meetingId,
        req.params.itemId,
        req.user.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.put(
  '/:meetingId/agenda/reorder',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.edit'),
  async (req, res, next) => {
    try {
      const parsed = reorderAgendaSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const result = await reorderMeetingAgenda(
        req.organisation.id,
        req.params.meetingId,
        parsed.data.itemIds,
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
// 4. Confidential Minutes / Notes / Structured MOM Routes (MTG-005, Structured MOM)
// -----------------------------------------------------------------------------

meetingsRouter.get(
  '/:meetingId/notes',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const result = await getMeetingNotes(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, {
        notes: result.notes,
        discussionPoints: result.discussionPoints,
        decisions: result.decisions,
      });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.put(
  '/:meetingId/notes',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = upsertNotesSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const expectedUpdatedAt =
        parsed.data.expectedUpdatedAt ||
        req.headers['if-unmodified-since'] ||
        undefined;

      const viewerPermissions = req.membership?.permissions || [];
      const notes = await upsertMeetingNotes(
        req.organisation.id,
        req.params.meetingId,
        parsed.data.content,
        req.user.id,
        viewerPermissions,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          expectedUpdatedAt,
        }
      );

      return sendSuccess(res, 200, { notes });
    } catch (err) {
      next(err);
    }
  }
);

// 4.1 Discussion Points Routes
meetingsRouter.get(
  '/:meetingId/discussion-points',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const discussionPoints = await listMeetingDiscussionPoints(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, { discussionPoints });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/:meetingId/discussion-points',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = createDiscussionPointSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const discussionPoint = await createMeetingDiscussionPoint(
        req.organisation.id,
        req.params.meetingId,
        parsed.data,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { discussionPoint });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.patch(
  '/:meetingId/discussion-points/:pointId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = updateDiscussionPointSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const discussionPoint = await updateMeetingDiscussionPoint(
        req.organisation.id,
        req.params.meetingId,
        req.params.pointId,
        parsed.data,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { discussionPoint });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.delete(
  '/:meetingId/discussion-points/:pointId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const result = await deleteMeetingDiscussionPoint(
        req.organisation.id,
        req.params.meetingId,
        req.params.pointId,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.put(
  '/:meetingId/discussion-points/reorder',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = reorderDiscussionPointsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const result = await reorderMeetingDiscussionPoints(
        req.organisation.id,
        req.params.meetingId,
        parsed.data.itemIds,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// 4.2 Decisions Routes
meetingsRouter.get(
  '/:meetingId/decisions',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const decisions = await listMeetingDecisions(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, { decisions });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/:meetingId/decisions',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = createDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const decision = await createMeetingDecision(
        req.organisation.id,
        req.params.meetingId,
        parsed.data,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { decision });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.patch(
  '/:meetingId/decisions/:decisionId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = updateDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const decision = await updateMeetingDecision(
        req.organisation.id,
        req.params.meetingId,
        req.params.decisionId,
        parsed.data,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { decision });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.delete(
  '/:meetingId/decisions/:decisionId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const result = await deleteMeetingDecision(
        req.organisation.id,
        req.params.meetingId,
        req.params.decisionId,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.put(
  '/:meetingId/decisions/reorder',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = reorderDecisionsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const result = await reorderMeetingDecisions(
        req.organisation.id,
        req.params.meetingId,
        parsed.data.itemIds,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 5. Action Items Routes (MTG-006)
// -----------------------------------------------------------------------------

meetingsRouter.get(
  '/:meetingId/action-items',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const actionItems = await listMeetingActionItems(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, { actionItems });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/:meetingId/action-items',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = createActionItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const actionItem = await createMeetingActionItem(
        req.organisation.id,
        req.params.meetingId,
        parsed.data,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 201, { actionItem });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.patch(
  '/:meetingId/action-items/:actionItemId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = updateActionItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const actionItem = await updateMeetingActionItem(
        req.organisation.id,
        req.params.meetingId,
        req.params.actionItemId,
        parsed.data,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { actionItem });
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.delete(
  '/:meetingId/action-items/:actionItemId',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const result = await deleteMeetingActionItem(
        req.organisation.id,
        req.params.meetingId,
        req.params.actionItemId,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

meetingsRouter.post(
  '/:meetingId/action-items/:actionItemId/promote-to-task',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = promoteActionItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const result = await promoteMeetingActionItemToProjectTask(
        req.organisation.id,
        req.params.meetingId,
        req.params.actionItemId,
        parsed.data.projectId,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 6. Email Notifications & Invitations Route (MTG-007)
// -----------------------------------------------------------------------------

meetingsRouter.post(
  '/:meetingId/send-invites',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const parsed = sendInvitesSchema.safeParse(req.body || {});
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues);
      }

      const viewerPermissions = req.membership?.permissions || [];
      const result = await sendMeetingInvitations(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions,
        parsed.data || {},
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

