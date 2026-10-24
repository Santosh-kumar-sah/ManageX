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
  listMeetingActionItems,
  createMeetingActionItem,
  updateMeetingActionItem,
  deleteMeetingActionItem,
  sendMeetingInvitations,
} from '../platform/meetings/meetingService.js';
import { sendSuccess } from '../platform/common/responses.js';
import { ValidationError } from '../platform/common/errors.js';

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
});

const updateMeetingSchema = createMeetingSchema.partial();

const transitionStatusSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled'], {
    errorMap: () => ({ message: "Status must be one of: 'scheduled', 'in_progress', 'completed', 'cancelled'" }),
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
});

const createActionItemSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().trim().optional().nullable(),
  assigneeId: z.string().uuid('Valid assignee UUID is required'),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  agendaItemId: z.string().uuid('Valid agenda item UUID is required').optional().nullable(),
});

const updateActionItemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().optional().nullable(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  agendaItemId: z.string().uuid().optional().nullable(),
});

const sendInvitesSchema = z
  .object({
    attendeeIds: z.array(z.string().uuid('Valid attendee UUID required')).optional(),
  })
  .optional();

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
// 4. Confidential Minutes / Notes Routes (MTG-005)
// -----------------------------------------------------------------------------

meetingsRouter.get(
  '/:meetingId/notes',
  requireOrgMembership,
  requireModuleEntitlement('meetings'),
  requireOrgPermission('meeting.view'),
  async (req, res, next) => {
    try {
      const viewerPermissions = req.membership?.permissions || [];
      const notes = await getMeetingNotes(
        req.organisation.id,
        req.params.meetingId,
        req.user.id,
        viewerPermissions
      );

      return sendSuccess(res, 200, { notes });
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

      const viewerPermissions = req.membership?.permissions || [];
      const notes = await upsertMeetingNotes(
        req.organisation.id,
        req.params.meetingId,
        parsed.data.content,
        req.user.id,
        viewerPermissions,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      return sendSuccess(res, 200, { notes });
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

