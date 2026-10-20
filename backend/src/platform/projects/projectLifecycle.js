/**
 * ManageX Projects Module: Lifecycle, Status Transitions & Priorities (Phase 8A)
 * Strictly adheres to PRD Section 9.1 (PRJ-001), Section 9.2 (PRJ-002), and docs/security.md.
 */

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'archived'];
export const PROJECT_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const PROJECT_MEMBER_ROLES = ['manager', 'member', 'viewer'];

/**
 * Canonical 5-status transition map (PRJ-002, PRD §9.2).
 * PRD §9.2:
 * - planning -> active or archived
 * - active -> on_hold, completed, or archived
 * - on_hold -> active, completed, or archived
 * - completed -> archived
 * - archived is terminal for ordinary users.
 */
export const PROJECT_TRANSITION_MAP = {
  planning: ['active', 'archived'],
  active: ['on_hold', 'completed', 'archived'],
  on_hold: ['active', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

/**
 * Validates whether transition from currentStatus to targetStatus is permitted (PRJ-002).
 * Returns true if allowed, false otherwise.
 */
export function isValidProjectTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) return false;
  if (currentStatus === targetStatus) return true; // Idempotent no-op
  const allowed = PROJECT_TRANSITION_MAP[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'blocked', 'done'];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/**
 * Canonical task status transition map (PRJ-005, PRD §9.2).
 * PRD §9.2:
 * - backlog -> todo
 * - todo -> backlog, in_progress
 * - in_progress -> blocked, done
 * - blocked -> in_progress
 * - done -> in_progress (only for a user with explicit reopen permission)
 */
export const TASK_TRANSITION_MAP = {
  backlog: ['todo'],
  todo: ['backlog', 'in_progress'],
  in_progress: ['blocked', 'done'],
  blocked: ['in_progress'],
  done: ['in_progress'], // Requires explicit reopen permission
};

/**
 * Validates whether transition from currentStatus to targetStatus is permitted (PRJ-005).
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @param {{ hasReopenPermission?: boolean }} [options]
 * @returns {{ valid: boolean, requiresReopenPermission?: boolean, reason?: string }}
 */
export function isValidTaskTransition(currentStatus, targetStatus, { hasReopenPermission = false } = {}) {
  if (!currentStatus || !targetStatus) {
    return { valid: false, reason: 'Current and target status must be specified.' };
  }
  if (!TASK_STATUSES.includes(targetStatus)) {
    return { valid: false, reason: `Invalid target status "${targetStatus}". Allowed: ${TASK_STATUSES.join(', ')}.` };
  }
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  if (currentStatus === 'done') {
    if (targetStatus === 'in_progress') {
      if (!hasReopenPermission) {
        return {
          valid: false,
          requiresReopenPermission: true,
          reason: 'Reopening a completed task requires explicit manager or administrative permission.',
        };
      }
      return { valid: true };
    }
    return {
      valid: false,
      reason: `Completed tasks can only be transitioned to "in_progress" with reopen permission. Transition to "${targetStatus}" is disallowed.`,
    };
  }

  const allowed = TASK_TRANSITION_MAP[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    return {
      valid: false,
      reason: `Transition from "${currentStatus}" to "${targetStatus}" is disallowed. Allowed: ${allowed.join(', ') || 'none'}.`,
    };
  }

  return { valid: true };
}
