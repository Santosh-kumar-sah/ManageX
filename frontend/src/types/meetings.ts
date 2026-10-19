export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type MeetingLocationType = 'in_person' | 'virtual' | 'hybrid';
export type MeetingVisibility = 'organisation' | 'attendees_only';
export type AttendeeRole = 'organiser' | 'participant' | 'guest';
export type RsvpStatus = 'pending' | 'accepted' | 'declined' | 'tentative';

export interface MeetingItem {
  id: string;
  organisationId: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  locationType: MeetingLocationType;
  location?: string | null;
  virtualUrl?: string | null;
  visibility: MeetingVisibility;
  status: MeetingStatus;
  organiserId: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  organiserName?: string | null;
  organiserEmail?: string | null;
  attendeeCount?: number;
  agendaCount?: number;
}

export interface MeetingAttendee {
  id: string;
  organisationId: string;
  meetingId: string;
  userId?: string | null;
  externalEmail?: string | null;
  role: AttendeeRole;
  rsvpStatus: RsvpStatus;
  invitedAt: string;
  respondedAt?: string | null;
  fullName?: string | null;
  email?: string | null;
}

export interface MeetingAgendaItem {
  id: string;
  organisationId: string;
  meetingId: string;
  title: string;
  description?: string | null;
  durationMinutes?: number | null;
  orderIndex: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const MEETING_STATUS_VARIANTS: Record<
  MeetingStatus,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  scheduled: 'brand',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'danger',
};

export const MEETING_ALLOWED_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  scheduled: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const RSVP_STATUS_LABELS: Record<RsvpStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  tentative: 'Tentative',
};

export const RSVP_STATUS_VARIANTS: Record<
  RsvpStatus,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
  tentative: 'neutral',
};

// -----------------------------------------------------------------------------
// Phase 7B: Confidential Minutes & Action Items (MTG-005, MTG-006)
// -----------------------------------------------------------------------------

export interface MeetingNotes {
  id: string;
  organisationId: string;
  meetingId: string;
  content: string;
  createdById: string;
  updatedById: string;
  authorName?: string | null;
  authorEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ActionItemPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface MeetingActionItem {
  id: string;
  organisationId: string;
  meetingId: string;
  title: string;
  description?: string | null;
  assigneeId: string;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  dueDate?: string | null;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  agendaItemId?: string | null;
  agendaItemTitle?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const ACTION_ITEM_STATUS_VARIANTS: Record<
  ActionItemStatus,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  open: 'neutral',
  in_progress: 'brand',
  done: 'success',
  cancelled: 'danger',
};

export const ACTION_ITEM_PRIORITY_LABELS: Record<ActionItemPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const ACTION_ITEM_PRIORITY_VARIANTS: Record<
  ActionItemPriority,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  low: 'neutral',
  medium: 'brand',
  high: 'warning',
  urgent: 'danger',
};

