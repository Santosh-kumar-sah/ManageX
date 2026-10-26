/**
 * ManageX Meetings Module: Lifecycle, Status Transitions & Validation (Phase 7A)
 * Strictly adheres to PRD Section 8.1 (MTG-001, MTG-002, MTG-003, MTG-004) and docs/security.md.
 */

export const MEETING_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'missed'];
export const MEETING_VISIBILITIES = ['organisation', 'attendees_only'];
export const MEETING_LOCATION_TYPES = ['in_person', 'virtual', 'hybrid'];
export const MEETING_ATTENDEE_ROLES = ['organiser', 'participant', 'viewer', 'guest'];
export const MEETING_RSVP_STATUSES = ['pending', 'accepted', 'declined', 'tentative'];

/**
 * Canonical 5-status transition map (Phase 1, Section 5.1).
 * Roadmap §5.1:
 * - scheduled -> in_progress, cancelled, missed
 * - in_progress -> completed, cancelled
 * - completed -> terminal
 * - cancelled -> terminal
 * - missed -> terminal
 * Direct scheduled -> completed is rejected (must be started first).
 */
export const MEETING_TRANSITION_MAP = {
  scheduled: ['in_progress', 'cancelled', 'missed'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  missed: [],
};

/**
 * Validates whether transition from currentStatus to targetStatus is permitted (MTG-002).
 * Returns true if allowed, false otherwise.
 */
export function isValidMeetingTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) return false;
  if (currentStatus === targetStatus) return true; // Idempotent no-op
  const allowed = MEETING_TRANSITION_MAP[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export const ACTION_ITEM_STATUSES = ['open', 'in_progress', 'done', 'cancelled'];
export const ACTION_ITEM_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/**
 * Canonical 4-status transition map for Action Items (MTG-006, PRD §8.2):
 * - open -> in_progress, done, cancelled
 * - in_progress -> open, done, cancelled
 * - done -> terminal
 * - cancelled -> terminal
 */
export const ACTION_ITEM_TRANSITION_MAP = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['open', 'done', 'cancelled'],
  done: [],
  cancelled: [],
};

/**
 * Validates whether transition from currentStatus to targetStatus is permitted for an Action Item (MTG-006).
 */
export function isValidActionItemTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) return false;
  if (currentStatus === targetStatus) return true;
  const allowed = ACTION_ITEM_TRANSITION_MAP[currentStatus] || [];
  return allowed.includes(targetStatus);
}

/**
 * Validates whether a string is a valid IANA timezone identifier (MTG-001, MTG-002).
 */
export function isValidIanaTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes legacy timezone identifiers to canonical IANA equivalents (Phase 1, Section 5.3).
 * Specifically normalizes 'Asia/Calcutta' to canonical 'Asia/Kolkata'.
 */
export function canonicalizeTimeZone(timeZone) {
  if (typeof timeZone !== 'string') return timeZone;
  const trimmed = timeZone.trim();
  if (trimmed === 'Asia/Calcutta') {
    return 'Asia/Kolkata';
  }
  return trimmed;
}


