export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'missed';
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
  createdAt?: string | null;
  fullName?: string | null;
  email?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  isExternal?: boolean;
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
  missed: 'Missed',
};

export const MEETING_STATUS_VARIANTS: Record<
  MeetingStatus,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  scheduled: 'brand',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  missed: 'danger',
};

export const MEETING_ALLOWED_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  scheduled: ['in_progress', 'cancelled', 'missed'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  missed: [],
};

export interface TimezoneOption {
  value: string;
  label: string;
}

export const COMMON_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Asia/Kolkata', label: 'IST (Asia/Kolkata, UTC+05:30)' },
  { value: 'UTC', label: 'UTC (UTC+00:00)' },
  { value: 'America/New_York', label: 'EST/EDT (America/New_York, UTC-05:00)' },
  { value: 'America/Chicago', label: 'CST/CDT (America/Chicago, UTC-06:00)' },
  { value: 'America/Denver', label: 'MST/MDT (America/Denver, UTC-07:00)' },
  { value: 'America/Los_Angeles', label: 'PST/PDT (America/Los_Angeles, UTC-08:00)' },
  { value: 'Europe/London', label: 'GMT/BST (Europe/London, UTC+00:00)' },
  { value: 'Europe/Paris', label: 'CET/CEST (Europe/Paris, UTC+01:00)' },
  { value: 'Europe/Berlin', label: 'CET/CEST (Europe/Berlin, UTC+01:00)' },
  { value: 'Asia/Singapore', label: 'SGT (Asia/Singapore, UTC+08:00)' },
  { value: 'Asia/Tokyo', label: 'JST (Asia/Tokyo, UTC+09:00)' },
  { value: 'Australia/Sydney', label: 'AEST/AEDT (Australia/Sydney, UTC+10:00)' },
];

export function normalizeTimeZone(tz?: string | null): string {
  if (!tz) return 'UTC';
  const trimmed = tz.trim();
  if (trimmed === 'Asia/Calcutta') return 'Asia/Kolkata';
  return trimmed;
}

export function getTimezoneLabel(tz?: string | null): string {
  const normalized = normalizeTimeZone(tz);
  const found = COMMON_TIMEZONE_OPTIONS.find((opt) => opt.value === normalized);
  if (found) return found.label;
  return normalized;
}

/**
 * Canonical check for whether an active meeting is overdue (past scheduled end time).
 * Strictly applies to active meetings in 'scheduled' or 'in_progress' states whose endAt has passed.
 * Terminal states ('completed', 'cancelled', 'missed') are never overdue.
 */
export function isMeetingOverdue(
  status?: MeetingStatus | string | null,
  endAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!status || !endAt) return false;
  if (status !== 'scheduled' && status !== 'in_progress') return false;
  const endMs = new Date(endAt).getTime();
  if (isNaN(endMs)) return false;
  return endMs < nowMs;
}


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

export interface MeetingDiscussionPoint {
  id: string;
  organisationId: string;
  meetingId: string;
  title: string;
  body: string;
  orderIndex: number;
  createdById: string;
  updatedById?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingDecision {
  id: string;
  organisationId: string;
  meetingId: string;
  title: string;
  details: string;
  orderIndex: number;
  createdById: string;
  updatedById?: string | null;
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
  meetingTitle?: string | null;
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
  decisionId?: string | null;
  decisionTitle?: string | null;
  projectTaskId?: string | null;
  projectTaskTitle?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActionItemFilters {
  status?: ActionItemStatus | 'all';
  priority?: ActionItemPriority | 'all';
  timeframe?: 'all' | 'overdue' | 'due_soon' | 'completed';
  meetingId?: string;
  assigneeId?: string;
  page?: number;
  limit?: number;
}

export interface PromoteActionItemPayload {
  projectId: string;
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

export type AnalyticsTimeframe = 'all' | '30d' | '90d';

export interface MeetingAnalyticsData {
  timeframe: AnalyticsTimeframe;
  summary: {
    totalMeetings: number;
    scheduledMeetings: number;
    inProgressMeetings: number;
    completedMeetings: number;
    cancelledMeetings: number;
    missedMeetings: number;
    overdueScheduledMeetings: number;
    meetingCompletionRate: number;
  };
  attendance: {
    totalInvitations: number;
    accepted: number;
    declined: number;
    tentative: number;
    pending: number;
    acceptanceRate: number;
  };
  actionItems: {
    total: number;
    open: number;
    inProgress: number;
    done: number;
    cancelled: number;
    actionableTotal?: number;
    overdue: number;
    actionableCompletionRate?: number;
    grossCompletionRate?: number;
    completionRate: number;
  };
  mom: {
    totalDiscussionPoints: number;
    totalDecisions: number;
  };
}


