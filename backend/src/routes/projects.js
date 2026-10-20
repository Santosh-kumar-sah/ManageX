/**
 * ManageX Projects & Membership Router (Phase 8A)
 * Strictly adheres to PRD Section 9.1 (PRJ-001), Section 9.2 (PRJ-002), and docs/api-contracts.md.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  requireOrgMembership,
  requireOrgPermission,
} from '../platform/middleware/organisation.js';
import { requireModuleEntitlement } from '../platform/middleware/module.js';
import {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  transitionProjectStatus,
  listProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
  createTask,
  listTasks,
  getTaskById,
  updateTask,
  deleteTask,
  createTaskComment,
  listTaskComments,
  updateTaskComment,
  deleteTaskComment,
  listProjectActivity,
} from '../platform/projects/projectService.js';
import { sendSuccess } from '../platform/common/responses.js';
import { ValidationError } from '../platform/common/errors.js';

export const projectsRouter = Router({ mergeParams: true });

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(255),
  description: z.string().trim().optional().nullable(),
  ownerId: z.string().uuid('Valid owner UUID required').optional(),
  startDate: z.string().datetime({ message: 'Valid start date ISO timestamp required' }).optional().nullable(),
  targetDate: z.string().datetime({ message: 'Valid target date ISO timestamp required' }).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['planning', 'active']).default('planning'),
  labels: z.array(z.string().trim()).optional(),
  members: z
    .array(
      z.object({
        userId: z.string().uuid('Valid member user UUID required'),
        role: z.enum(['manager', 'member', 'viewer']).default('member'),
      })
    )
    .optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(255).optional(),
  description: z.string().trim().optional().nullable(),
  ownerId: z.string().uuid('Valid owner UUID required').optional(),
  startDate: z.string().datetime({ message: 'Valid start date ISO timestamp required' }).optional().nullable(),
  targetDate: z.string().datetime({ message: 'Valid target date ISO timestamp required' }).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  labels: z.array(z.string().trim()).optional(),
});

const transitionStatusSchema = z.object({
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'archived'], {
    errorMap: () => ({
      message: "Status must be one of: 'planning', 'active', 'on_hold', 'completed', 'archived'",
    }),
  }),
});

const addMemberSchema = z.object({
  userId: z.string().uuid('Valid user UUID required'),
  role: z.enum(['manager', 'member', 'viewer']).default('member'),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['manager', 'member', 'viewer']),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(255),
  description: z.string().trim().optional().nullable(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'blocked', 'done']).default('backlog'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigneeId: z.string().uuid('Valid assignee UUID required').optional().nullable(),
  startDate: z.string().datetime({ message: 'Valid start date ISO timestamp required' }).optional().nullable(),
  dueDate: z.string().datetime({ message: 'Valid due date ISO timestamp required' }).optional().nullable(),
  labels: z.array(z.string().trim()).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Task title cannot be empty').max(255).optional(),
  description: z.string().trim().optional().nullable(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'blocked', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigneeId: z.string().uuid('Valid assignee UUID required').optional().nullable(),
  startDate: z.string().datetime({ message: 'Valid start date ISO timestamp required' }).optional().nullable(),
  dueDate: z.string().datetime({ message: 'Valid due date ISO timestamp required' }).optional().nullable(),
  labels: z.array(z.string().trim()).optional(),
});

const commentSchema = z.object({
  body: z.string().trim().min(1, 'Comment body cannot be empty').max(2000, 'Comment exceeds 2000 characters'),
});

function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw new ValidationError('Validation failed for project input.', details);
  }
  return result.data;
}

// -----------------------------------------------------------------------------
// Module Entitlement & Membership Guard
// -----------------------------------------------------------------------------
projectsRouter.use(requireOrgMembership);
projectsRouter.use(requireModuleEntitlement('projects'));

// -----------------------------------------------------------------------------
// 1. Create Project (PRJ-001)
// -----------------------------------------------------------------------------
projectsRouter.post('/', requireOrgPermission('project.create'), async (req, res, next) => {
  try {
    const data = parseBody(createProjectSchema, req.body);
    const project = await createProject(
      req.organisation.id,
      data,
      req.user.id,
      {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }
    );
    return sendSuccess(res, 201, { project });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 2. List Projects (PRJ-001, PRJ-002)
// -----------------------------------------------------------------------------
projectsRouter.get('/', requireOrgPermission('project.view'), async (req, res, next) => {
  try {
    const { status, priority, search, page, limit } = req.query;
    const { projects, pagination } = await listProjects(
      req.organisation.id,
      req.user.id,
      {
        status,
        priority,
        search,
        page,
        limit,
        userRoles: req.membership.roles || [],
      }
    );
    return sendSuccess(res, 200, { projects }, { pagination });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 3. Get Project by ID (PRJ-001)
// -----------------------------------------------------------------------------
projectsRouter.get('/:id', requireOrgPermission('project.view'), async (req, res, next) => {
  try {
    const project = await getProjectById(
      req.organisation.id,
      req.params.id,
      req.user.id
    );
    return sendSuccess(res, 200, { project });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 4. Update Project (PRJ-001, PRJ-002)
// -----------------------------------------------------------------------------
projectsRouter.patch('/:id', requireOrgPermission('project.edit'), async (req, res, next) => {
  try {
    const data = parseBody(updateProjectSchema, req.body);
    const project = await updateProject(
      req.organisation.id,
      req.params.id,
      data,
      req.user.id,
      {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }
    );
    return sendSuccess(res, 200, { project });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 5. Transition Project Status (PRJ-002)
// -----------------------------------------------------------------------------
projectsRouter.patch(
  '/:id/status',
  requireOrgPermission('project.edit'),
  async (req, res, next) => {
    try {
      const { status } = parseBody(transitionStatusSchema, req.body);
      const project = await transitionProjectStatus(
        req.organisation.id,
        req.params.id,
        status,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 200, { project });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 6. Project Members Management (PRJ-001)
// -----------------------------------------------------------------------------
projectsRouter.get(
  '/:id/members',
  requireOrgPermission('project.view'),
  async (req, res, next) => {
    try {
      const members = await listProjectMembers(
        req.organisation.id,
        req.params.id,
        req.user.id
      );
      return sendSuccess(res, 200, { members });
    } catch (err) {
      next(err);
    }
  }
);

projectsRouter.post(
  '/:id/members',
  requireOrgPermission('project.edit'),
  async (req, res, next) => {
    try {
      const data = parseBody(addMemberSchema, req.body);
      const member = await addProjectMember(
        req.organisation.id,
        req.params.id,
        data,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 201, { member });
    } catch (err) {
      next(err);
    }
  }
);

projectsRouter.patch(
  '/:id/members/:userId',
  requireOrgPermission('project.edit'),
  async (req, res, next) => {
    try {
      const { role } = parseBody(updateMemberRoleSchema, req.body);
      const member = await updateProjectMemberRole(
        req.organisation.id,
        req.params.id,
        req.params.userId,
        role,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 200, { member });
    } catch (err) {
      next(err);
    }
  }
);

projectsRouter.delete(
  '/:id/members/:userId',
  requireOrgPermission('project.edit'),
  async (req, res, next) => {
    try {
      const result = await removeProjectMember(
        req.organisation.id,
        req.params.id,
        req.params.userId,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 7. List Tasks for Project (PRJ-005, PRJ-006)
// -----------------------------------------------------------------------------
projectsRouter.get(
  '/:id/tasks',
  requireOrgPermission('task.read'),
  async (req, res, next) => {
    try {
      const result = await listTasks(
        req.organisation.id,
        req.params.id,
        req.query,
        req.user.id
      );
      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 8. Create Task in Project (PRJ-003, PRJ-004, PRJ-005)
// -----------------------------------------------------------------------------
projectsRouter.post(
  '/:id/tasks',
  requireOrgPermission('task.create'),
  async (req, res, next) => {
    try {
      const data = parseBody(createTaskSchema, req.body);
      const task = await createTask(
        req.organisation.id,
        req.params.id,
        data,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 201, { task });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 9. Get Task Details (PRJ-003)
// -----------------------------------------------------------------------------
projectsRouter.get(
  '/:id/tasks/:taskId',
  requireOrgPermission('task.read'),
  async (req, res, next) => {
    try {
      const task = await getTaskById(
        req.organisation.id,
        req.params.id,
        req.params.taskId,
        req.user.id
      );
      return sendSuccess(res, 200, { task });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 10. Update Task or Transition Status (PRJ-004, PRJ-005)
// -----------------------------------------------------------------------------
projectsRouter.patch(
  '/:id/tasks/:taskId',
  requireOrgPermission('task.update'),
  async (req, res, next) => {
    try {
      const data = parseBody(updateTaskSchema, req.body);
      const task = await updateTask(
        req.organisation.id,
        req.params.id,
        req.params.taskId,
        data,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 200, { task });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 11. Soft-Delete Task (PRJ-005)
// -----------------------------------------------------------------------------
projectsRouter.delete(
  '/:id/tasks/:taskId',
  requireOrgPermission('task.delete'),
  async (req, res, next) => {
    try {
      const result = await deleteTask(
        req.organisation.id,
        req.params.id,
        req.params.taskId,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 12. List Project Activity Timeline (PRJ-008)
// -----------------------------------------------------------------------------
projectsRouter.get(
  '/:id/activity',
  requireOrgPermission('project.view'),
  async (req, res, next) => {
    try {
      const result = await listProjectActivity(
        req.organisation.id,
        req.params.id,
        req.user.id,
        {
          page: req.query.page,
          limit: req.query.limit,
        }
      );
      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 13. Task Comments Endpoints (PRJ-007)
// -----------------------------------------------------------------------------

// List comments for a task
projectsRouter.get(
  '/:id/tasks/:taskId/comments',
  requireOrgPermission('task.view'),
  async (req, res, next) => {
    try {
      const comments = await listTaskComments(
        req.organisation.id,
        req.params.id,
        req.params.taskId,
        req.user.id
      );
      return sendSuccess(res, 200, { comments });
    } catch (err) {
      next(err);
    }
  }
);

// Create comment on a task
projectsRouter.post(
  '/:id/tasks/:taskId/comments',
  requireOrgPermission('task.view'),
  async (req, res, next) => {
    try {
      const data = parseBody(commentSchema, req.body);
      const comment = await createTaskComment(
        req.organisation.id,
        req.params.id,
        req.params.taskId,
        data,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 201, { comment });
    } catch (err) {
      next(err);
    }
  }
);

// Edit own comment on a task
projectsRouter.patch(
  '/:id/tasks/:taskId/comments/:commentId',
  requireOrgPermission('task.view'),
  async (req, res, next) => {
    try {
      const data = parseBody(commentSchema, req.body);
      const comment = await updateTaskComment(
        req.organisation.id,
        req.params.id,
        req.params.taskId,
        req.params.commentId,
        data,
        req.user.id,
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 200, { comment });
    } catch (err) {
      next(err);
    }
  }
);

// Soft-delete comment on a task
projectsRouter.delete(
  '/:id/tasks/:taskId/comments/:commentId',
  requireOrgPermission('task.view'),
  async (req, res, next) => {
    try {
      const result = await deleteTaskComment(
        req.organisation.id,
        req.params.id,
        req.params.taskId,
        req.params.commentId,
        req.user.id,
        {
          callerPermissions: req.membership?.permissions || [],
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );
      return sendSuccess(res, 200, result);
    } catch (err) {
      next(err);
    }
  }
);
