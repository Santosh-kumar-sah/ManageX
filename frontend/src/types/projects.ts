export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectMemberRole = 'manager' | 'member' | 'viewer';

export interface ProjectItem {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdById: string;
  startDate: string | null;
  targetDate: string | null;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export interface ProjectMember {
  id: string;
  organisationId: string;
  projectId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  role: ProjectMemberRole;
  createdAt: string;
  updatedAt: string;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

export const PROJECT_STATUS_VARIANTS: Record<
  ProjectStatus,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  planning: 'brand',
  active: 'success',
  on_hold: 'warning',
  completed: 'neutral',
  archived: 'neutral',
};

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const PROJECT_PRIORITY_VARIANTS: Record<
  ProjectPriority,
  'neutral' | 'brand' | 'warning' | 'danger'
> = {
  low: 'neutral',
  medium: 'brand',
  high: 'warning',
  urgent: 'danger',
};

export const PROJECT_MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  manager: 'Project Manager',
  member: 'Team Member',
  viewer: 'Viewer (Read-Only)',
};

// -----------------------------------------------------------------------------
// Tasks Types & Constants (Phase 8B: PRJ-003, PRJ-004, PRJ-005, PRJ-006)
// -----------------------------------------------------------------------------

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskItem {
  id: string;
  organisationId: string;
  projectId: string;
  projectName?: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdById: string;
  createdByName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  startDate: string | null;
  dueDate: string | null;
  labels: string[];
  isOverdue: boolean;
  isDueSoon: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
};

export const TASK_STATUS_VARIANTS: Record<
  TaskStatus,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  backlog: 'neutral',
  todo: 'brand',
  in_progress: 'warning',
  blocked: 'danger',
  done: 'success',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const TASK_PRIORITY_VARIANTS: Record<
  TaskPriority,
  'neutral' | 'brand' | 'warning' | 'danger'
> = {
  low: 'neutral',
  medium: 'brand',
  high: 'warning',
  urgent: 'danger',
};

/**
 * Valid canonical task transitions (PRD §9.2 PRJ-005).
 */
export const TASK_ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo'],
  todo: ['backlog', 'in_progress'],
  in_progress: ['blocked', 'done'],
  blocked: ['in_progress'],
  done: ['in_progress'], // Reopen requires manager/admin
};

/**
 * Task Comment Interface (PRD §9.3 PRJ-007).
 */
export interface TaskComment {
  id: string;
  organisationId: string;
  projectId: string;
  taskId: string;
  authorId: string;
  authorName: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedById: string | null;
  deletedByName: string | null;
  isDeleted: boolean;
}

/**
 * Project Activity Timeline Item Interface (PRD §9.3 PRJ-008).
 */
export interface ProjectActivityItem {
  id: string;
  organisationId: string;
  projectId: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  metadata: Record<string, any>;
  createdAt: string;
}

