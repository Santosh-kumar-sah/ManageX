/**
 * ManageX Events & Hackathons Lifecycle & State Machine
 * Strictly adheres to PRD Section 7.1 (EVT-001, EVT-002, EVT-003) and docs/security.md.
 */

export const EVENT_STATUSES = [
  'draft',
  'published',
  'registration_closed',
  'in_progress',
  'completed',
  'cancelled',
  'archived',
];

export const EVENT_TYPES = ['general_event', 'hackathon'];
export const EVENT_VISIBILITIES = ['public', 'private'];
export const EVENT_LOCATION_TYPES = ['in_person', 'virtual', 'hybrid'];

/**
 * Canonical 7-status transition map (EVT-002).
 * Allowed transitions:
 * - draft -> published, archived
 * - published -> registration_closed, in_progress, cancelled, archived
 * - registration_closed -> in_progress, cancelled, archived
 * - in_progress -> completed, cancelled, archived
 * - completed -> archived
 * - cancelled -> archived
 * - archived -> terminal (no outgoing transitions)
 */
export const EVENT_TRANSITION_MAP = {
  draft: ['published', 'archived'],
  published: ['registration_closed', 'in_progress', 'cancelled', 'archived'],
  registration_closed: ['in_progress', 'cancelled', 'archived'],
  in_progress: ['completed', 'cancelled', 'archived'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

/**
 * Validates whether transition from currentStatus to targetStatus is permitted.
 */
export function isValidEventTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) return false;
  if (currentStatus === targetStatus) return true; // Idempotent no-op
  const allowed = EVENT_TRANSITION_MAP[currentStatus] || [];
  return allowed.includes(targetStatus);
}

/**
 * Validates whether a string is a valid IANA timezone identifier (EVT-001, EVT-003).
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
