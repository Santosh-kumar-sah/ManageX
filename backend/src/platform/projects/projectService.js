/**
 * ManageX Projects & Membership Service (Phase 8A)
 * Strictly adheres to PRD Section 9.1 (PRJ-001), Section 9.2 (PRJ-002), docs/security.md, and docs/database.md.
 */

import { withTenantTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../audit/auditService.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
} from '../common/errors.js';
import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_MEMBER_ROLES,
  isValidProjectTransition,
  TASK_STATUSES,
  TASK_PRIORITIES,
  isValidTaskTransition,
} from './projectLifecycle.js';

// -----------------------------------------------------------------------------
// Formatters
// -----------------------------------------------------------------------------

function formatProjectRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    description: row.description || null,
    status: row.status,
    priority: row.priority,
    ownerId: row.owner_id,
    ownerName: row.owner_name || null,
    ownerEmail: row.owner_email || null,
    createdById: row.created_by_id,
    startDate: row.start_date ? row.start_date.toISOString() : null,
    targetDate: row.target_date ? row.target_date.toISOString() : null,
    labels: Array.isArray(row.labels) ? row.labels : [],
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    memberCount: row.member_count !== undefined ? Number(row.member_count) : undefined,
  };
}

function formatMemberRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    projectId: row.project_id,
    userId: row.user_id,
    userName: row.user_name || null,
    userEmail: row.user_email || null,
    role: row.role,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

function formatTaskRow(row) {
  if (!row) return null;
  const now = new Date();
  const dueDate = row.due_date ? new Date(row.due_date) : null;
  const isDone = row.status === 'done';
  const isOverdue = Boolean(dueDate && dueDate < now && !isDone);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const isDueSoon = Boolean(dueDate && dueDate >= now && dueDate <= sevenDaysFromNow && !isDone);

  return {
    id: row.id,
    organisationId: row.organisation_id,
    projectId: row.project_id,
    projectName: row.project_name || undefined,
    title: row.title,
    description: row.description || null,
    status: row.status,
    priority: row.priority,
    createdById: row.created_by_id,
    createdByName: row.created_by_name || null,
    assigneeId: row.assignee_id || null,
    assigneeName: row.assignee_name || null,
    assigneeEmail: row.assignee_email || null,
    startDate: row.start_date ? (row.start_date instanceof Date ? row.start_date.toISOString() : new Date(row.start_date).toISOString()) : null,
    dueDate: row.due_date ? (row.due_date instanceof Date ? row.due_date.toISOString() : new Date(row.due_date).toISOString()) : null,
    labels: Array.isArray(row.labels) ? row.labels : [],
    isOverdue,
    isDueSoon,
    deletedAt: row.deleted_at ? (row.deleted_at instanceof Date ? row.deleted_at.toISOString() : new Date(row.deleted_at).toISOString()) : null,
    createdAt: row.created_at ? (row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()) : null,
    updatedAt: row.updated_at ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString()) : null,
  };
}

/**
 * Checks whether user has admin privilege across the organisation
 * (e.g. organisation_owner, organisation_admin, or project_admin).
 */
function isOrgProjectAdmin(userRoles = []) {
  const adminSlugs = ['organisation_owner', 'organisation_admin', 'project_admin'];
  return userRoles.some((r) => adminSlugs.includes(r.slug || r));
}

/**
 * Asserts resource-scoped project access (PRJ-001).
 * Organisation membership alone does not grant access to every project.
 */
async function assertProjectAccess(client, organisationId, projectId, actorUserId, mode = 'read') {
  // Query project along with actor's membership in the project
  const res = await client.query(
    `
    SELECT 
      p.*,
      u.full_name AS owner_name,
      u.email AS owner_email,
      pm.role AS actor_project_role,
      (
        SELECT json_agg(json_build_object('slug', r.slug))
        FROM membership_roles mr
        JOIN roles r ON r.id = mr.role_id
        JOIN organisation_memberships m ON m.id = mr.membership_id
        WHERE m.organisation_id = p.organisation_id AND m.user_id = $1
      ) AS actor_org_roles
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
    WHERE p.id = $2 AND p.organisation_id = $3
  `,
    [actorUserId, projectId, organisationId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND');
  }

  const project = res.rows[0];
  const orgRoles = project.actor_org_roles || [];
  const isAdmin = isOrgProjectAdmin(orgRoles);
  const isOwner = project.owner_id === actorUserId;
  const isMember = Boolean(project.actor_project_role);

  if (!isAdmin && !isOwner && !isMember) {
    throw new AuthorizationError(
      'Resource-scoped project access: you are not a member of this project.',
      'PROJECT_ACCESS_DENIED'
    );
  }

  if (mode === 'write') {
    if (project.status === 'archived') {
      throw new ConflictError('Archived projects are read-only.', 'PROJECT_ARCHIVED');
    }

    // Viewers cannot perform write mutations
    if (!isAdmin && !isOwner && project.actor_project_role === 'viewer') {
      throw new AuthorizationError(
        'Project viewers have read-only access.',
        'PROJECT_READ_ONLY'
      );
    }
  }

  return project;
}

// -----------------------------------------------------------------------------
// 1. Create Project (PRJ-001)
// -----------------------------------------------------------------------------

export async function createProject(
  organisationId,
  data,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const {
    name,
    description,
    status = 'planning',
    priority = 'medium',
    ownerId = actorUserId,
    startDate,
    targetDate,
    labels = [],
    members = [],
  } = data;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Project name is required.');
  }

  if (name.trim().length < 2 || name.trim().length > 255) {
    throw new ValidationError('Project name must be between 2 and 255 characters.');
  }

  if (!PROJECT_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid project status "${status}". Allowed: ${PROJECT_STATUSES.join(', ')}.`);
  }

  if (status === 'archived' || status === 'completed') {
    throw new ValidationError('A new project cannot be created directly in completed or archived status.');
  }

  if (!PROJECT_PRIORITIES.includes(priority)) {
    throw new ValidationError(`Invalid project priority "${priority}". Allowed: ${PROJECT_PRIORITIES.join(', ')}.`);
  }

  const start = startDate ? new Date(startDate) : null;
  const target = targetDate ? new Date(targetDate) : null;

  if (start && isNaN(start.getTime())) {
    throw new ValidationError('Invalid start date timestamp.');
  }

  if (target && isNaN(target.getTime())) {
    throw new ValidationError('Invalid target completion date timestamp.');
  }

  if (start && target && start > target) {
    throw new ValidationError('Project start date cannot be after the target completion date.');
  }

  const cleanLabels = Array.isArray(labels)
    ? labels.map((l) => String(l).trim()).filter(Boolean)
    : [];

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Verify owner is an active member in this organisation (PRJ-001)
      const ownerRes = await client.query(
        `SELECT id, status FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
        [organisationId, ownerId]
      );

      if (ownerRes.rows.length === 0 || ownerRes.rows[0].status !== 'active') {
        throw new ValidationError('Project owner must be an active member of this organisation.');
      }

      // 2. Insert project record
      const insertRes = await client.query(
        `
        INSERT INTO projects (
          organisation_id,
          name,
          description,
          status,
          priority,
          owner_id,
          created_by_id,
          start_date,
          target_date,
          labels
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
        [
          organisationId,
          name.trim(),
          description ? description.trim() : null,
          status,
          priority,
          ownerId,
          actorUserId,
          start,
          target,
          cleanLabels,
        ]
      );

      const newProject = insertRes.rows[0];

      // 3. Automatically add owner to project_members as 'manager'
      await client.query(
        `
        INSERT INTO project_members (organisation_id, project_id, user_id, role)
        VALUES ($1, $2, $3, 'manager')
        ON CONFLICT (project_id, user_id) DO NOTHING
      `,
        [organisationId, newProject.id, ownerId]
      );

      // 4. If initial additional members specified, validate and insert them
      if (Array.isArray(members) && members.length > 0) {
        for (const m of members) {
          if (!m.userId || m.userId === ownerId) continue;
          const role = PROJECT_MEMBER_ROLES.includes(m.role) ? m.role : 'member';

          const memCheck = await client.query(
            `SELECT id, status FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
            [organisationId, m.userId]
          );

          if (memCheck.rows.length > 0 && memCheck.rows[0].status === 'active') {
            await client.query(
              `
              INSERT INTO project_members (organisation_id, project_id, user_id, role)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (project_id, user_id) DO NOTHING
            `,
              [organisationId, newProject.id, m.userId, role]
            );
          }
        }
      }

      // 5. Record immutable audit event (AUD-002, AUD-003)
      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'project.created',
        entityType: 'project',
        entityId: newProject.id,
        metadata: {
          name: newProject.name,
          priority: newProject.priority,
          status: newProject.status,
          ownerId: newProject.owner_id,
        },
        ipAddress,
        userAgent,
        client,
      });

      // 5.1 Record project activity timeline (PRJ-008)
      await recordProjectActivity(client, {
        organisationId,
        projectId: newProject.id,
        actorId: actorUserId,
        entityType: 'project',
        entityId: newProject.id,
        action: 'project_created',
        summary: `Project "${newProject.name}" was created.`,
        metadata: {
          name: newProject.name,
          priority: newProject.priority,
          status: newProject.status,
        },
      });

      // 6. Return formatted project with owner info and member count
      const fullRes = await client.query(
        `
        SELECT 
          p.*,
          u.full_name AS owner_name,
          u.email AS owner_email,
          COUNT(pm.id) AS member_count
        FROM projects p
        JOIN users u ON u.id = p.owner_id
        LEFT JOIN project_members pm ON pm.project_id = p.id
        WHERE p.id = $1 AND p.organisation_id = $2
        GROUP BY p.id, u.full_name, u.email
      `,
        [newProject.id, organisationId]
      );

      return formatProjectRow(fullRes.rows[0]);
    }
  );
}

// -----------------------------------------------------------------------------
// 2. List Projects (PRJ-001, PRJ-002)
// -----------------------------------------------------------------------------

export async function listProjects(organisationId, actorUserId, options = {}) {
  const {
    status,
    priority,
    search,
    page = 1,
    limit = 20,
    userRoles = [],
  } = options;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const isAdmin = isOrgProjectAdmin(userRoles);

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      const conditions = ['p.organisation_id = $1'];
      const params = [organisationId];
      let pIdx = 2;

      // Resource-scoped project visibility (PRJ-001):
      // Ordinary members only see projects they own or are members of.
      if (!isAdmin) {
        conditions.push(`(
          p.owner_id = $${pIdx}
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id AND pm.user_id = $${pIdx}
          )
        )`);
        params.push(actorUserId);
        pIdx++;
      }

      if (status && status !== 'all') {
        conditions.push(`p.status = $${pIdx}`);
        params.push(status);
        pIdx++;
      }

      if (priority && priority !== 'all') {
        conditions.push(`p.priority = $${pIdx}`);
        params.push(priority);
        pIdx++;
      }

      if (search && search.trim()) {
        conditions.push(`(p.name ILIKE $${pIdx} OR p.description ILIKE $${pIdx})`);
        params.push(`%${search.trim()}%`);
        pIdx++;
      }

      const whereClause = conditions.join(' AND ');

      // Total count
      const countRes = await client.query(
        `SELECT COUNT(*) AS total FROM projects p WHERE ${whereClause}`,
        params
      );
      const totalItems = parseInt(countRes.rows[0].total, 10);

      // Paginated items
      const query = `
        SELECT 
          p.*,
          u.full_name AS owner_name,
          u.email AS owner_email,
          COUNT(pm.id) AS member_count
        FROM projects p
        JOIN users u ON u.id = p.owner_id
        LEFT JOIN project_members pm ON pm.project_id = p.id
        WHERE ${whereClause}
        GROUP BY p.id, u.full_name, u.email
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `;
      params.push(limitNum, offset);

      const itemsRes = await client.query(query, params);
      const projects = itemsRes.rows.map(formatProjectRow);

      const totalPages = Math.ceil(totalItems / limitNum) || 1;

      return {
        projects,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalItems,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      };
    }
  );
}

// -----------------------------------------------------------------------------
// 3. Get Project by ID (PRJ-001)
// -----------------------------------------------------------------------------

async function fetchFullProject(client, organisationId, projectId) {
  const projectRes = await client.query(
    `
    SELECT 
      p.*,
      u.full_name AS owner_name,
      u.email AS owner_email,
      COUNT(pm.id) AS member_count
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN project_members pm ON pm.project_id = p.id
    WHERE p.id = $1 AND p.organisation_id = $2
    GROUP BY p.id, u.full_name, u.email
  `,
    [projectId, organisationId]
  );

  const project = formatProjectRow(projectRes.rows[0]);

  // Fetch members
  const membersRes = await client.query(
    `
    SELECT 
      pm.*,
      u.full_name AS user_name,
      u.email AS user_email
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = $1 AND pm.organisation_id = $2
    ORDER BY pm.created_at ASC
  `,
    [projectId, organisationId]
  );

  const members = membersRes.rows.map(formatMemberRow);

  return {
    ...project,
    members,
  };
}

export async function getProjectById(organisationId, projectId, actorUserId) {
  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');
      return fetchFullProject(client, organisationId, projectId);
    }
  );
}

// -----------------------------------------------------------------------------
// 4. Update Project (PRJ-001, PRJ-002)
// -----------------------------------------------------------------------------

export async function updateProject(
  organisationId,
  projectId,
  data,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const {
    name,
    description,
    priority,
    ownerId,
    startDate,
    targetDate,
    labels,
  } = data;

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      const current = await assertProjectAccess(
        client,
        organisationId,
        projectId,
        actorUserId,
        'write'
      );

      const updates = [];
      const params = [projectId, organisationId];
      let pIdx = 3;

      if (name !== undefined) {
        if (!name || typeof name !== 'string' || !name.trim()) {
          throw new ValidationError('Project name cannot be empty.');
        }
        if (name.trim().length < 2 || name.trim().length > 255) {
          throw new ValidationError('Project name must be between 2 and 255 characters.');
        }
        updates.push(`name = $${pIdx}`);
        params.push(name.trim());
        pIdx++;
      }

      if (description !== undefined) {
        updates.push(`description = $${pIdx}`);
        params.push(description ? description.trim() : null);
        pIdx++;
      }

      if (priority !== undefined) {
        if (!PROJECT_PRIORITIES.includes(priority)) {
          throw new ValidationError(`Invalid project priority "${priority}". Allowed: ${PROJECT_PRIORITIES.join(', ')}.`);
        }
        updates.push(`priority = $${pIdx}`);
        params.push(priority);
        pIdx++;
      }

      // Check dates
      const effectiveStart = startDate !== undefined ? (startDate ? new Date(startDate) : null) : current.start_date;
      const effectiveTarget = targetDate !== undefined ? (targetDate ? new Date(targetDate) : null) : current.target_date;

      if (effectiveStart && isNaN(effectiveStart.getTime())) {
        throw new ValidationError('Invalid start date timestamp.');
      }
      if (effectiveTarget && isNaN(effectiveTarget.getTime())) {
        throw new ValidationError('Invalid target completion date timestamp.');
      }
      if (effectiveStart && effectiveTarget && effectiveStart > effectiveTarget) {
        throw new ValidationError('Project start date cannot be after the target completion date.');
      }

      if (startDate !== undefined) {
        updates.push(`start_date = $${pIdx}`);
        params.push(effectiveStart);
        pIdx++;
      }

      if (targetDate !== undefined) {
        updates.push(`target_date = $${pIdx}`);
        params.push(effectiveTarget);
        pIdx++;
      }

      if (labels !== undefined) {
        const cleanLabels = Array.isArray(labels)
          ? labels.map((l) => String(l).trim()).filter(Boolean)
          : [];
        updates.push(`labels = $${pIdx}`);
        params.push(cleanLabels);
        pIdx++;
      }

      // Owner update with eligible replacement and atomicity (PRJ-001)
      if (ownerId !== undefined && ownerId !== current.owner_id) {
        const ownerCheck = await client.query(
          `SELECT id, status FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
          [organisationId, ownerId]
        );

        if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].status !== 'active') {
          throw new ValidationError('Project owner must be an active member of this organisation.');
        }

        updates.push(`owner_id = $${pIdx}`);
        params.push(ownerId);
        pIdx++;

        // Automatically ensure new owner is a project member with 'manager' role
        await client.query(
          `
          INSERT INTO project_members (organisation_id, project_id, user_id, role)
          VALUES ($1, $2, $3, 'manager')
          ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'manager'
        `,
          [organisationId, projectId, ownerId]
        );
      }

      if (updates.length === 0) {
        return getProjectById(organisationId, projectId, actorUserId);
      }

      updates.push(`updated_at = NOW()`);

      const updateQuery = `
        UPDATE projects
        SET ${updates.join(', ')}
        WHERE id = $1 AND organisation_id = $2
        RETURNING *
      `;

      const res = await client.query(updateQuery, params);
      const updated = res.rows[0];

      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'project.updated',
        entityType: 'project',
        entityId: projectId,
        metadata: {
          name: updated.name,
          priority: updated.priority,
          status: updated.status,
          ownerId: updated.owner_id,
        },
        ipAddress,
        userAgent,
        client,
      });

      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'project',
        entityId: projectId,
        action: 'project_updated',
        summary: `Project details updated.`,
        metadata: {
          name: updated.name,
          priority: updated.priority,
        },
      });

      return fetchFullProject(client, organisationId, projectId);
    }
  );
}

// -----------------------------------------------------------------------------
// 5. Transition Project Status (PRJ-002)
// -----------------------------------------------------------------------------

export async function transitionProjectStatus(
  organisationId,
  projectId,
  targetStatus,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!PROJECT_STATUSES.includes(targetStatus)) {
    throw new ValidationError(`Invalid project status "${targetStatus}". Allowed: ${PROJECT_STATUSES.join(', ')}.`);
  }

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // Row-level lock to guard concurrent status transitions
      const checkRes = await client.query(
        `SELECT * FROM projects WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
        [projectId, organisationId]
      );

      if (checkRes.rows.length === 0) {
        throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND');
      }

      const current = checkRes.rows[0];

      // Terminal archived status lockout (PRJ-002)
      if (current.status === 'archived') {
        throw new ConflictError(
          'Archived projects are terminal and cannot be transitioned.',
          'PROJECT_ARCHIVED'
        );
      }

      // Validate transition map
      if (!isValidProjectTransition(current.status, targetStatus)) {
        throw new ConflictError(
          `Invalid project status transition from '${current.status}' to '${targetStatus}'.`,
          'INVALID_STATUS_TRANSITION'
        );
      }

      // Assert write permission
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'write');

      const updateRes = await client.query(
        `
        UPDATE projects
        SET status = $1, updated_at = NOW()
        WHERE id = $2 AND organisation_id = $3
        RETURNING *
      `,
        [targetStatus, projectId, organisationId]
      );

      const updated = updateRes.rows[0];

      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'project.status_transitioned',
        entityType: 'project',
        entityId: projectId,
        metadata: {
          previousStatus: current.status,
          newStatus: targetStatus,
        },
        ipAddress,
        userAgent,
        client,
      });

      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'project',
        entityId: projectId,
        action: 'project_status_changed',
        summary: `Project status changed from "${current.status}" to "${targetStatus}".`,
        metadata: {
          previousStatus: current.status,
          newStatus: targetStatus,
        },
      });

      return fetchFullProject(client, organisationId, projectId);
    }
  );
}

// -----------------------------------------------------------------------------
// 6. Project Members Management (PRJ-001)
// -----------------------------------------------------------------------------

export async function listProjectMembers(organisationId, projectId, actorUserId) {
  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');

      const res = await client.query(
        `
        SELECT 
          pm.*,
          u.full_name AS user_name,
          u.email AS user_email
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = $1 AND pm.organisation_id = $2
        ORDER BY pm.created_at ASC
      `,
        [projectId, organisationId]
      );

      return res.rows.map(formatMemberRow);
    }
  );
}

export async function addProjectMember(
  organisationId,
  projectId,
  { userId, role = 'member' },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!userId) {
    throw new ValidationError('User ID is required.');
  }

  if (!PROJECT_MEMBER_ROLES.includes(role)) {
    throw new ValidationError(`Invalid project member role "${role}". Allowed: ${PROJECT_MEMBER_ROLES.join(', ')}.`);
  }

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // Must have write permission to manage members
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'write');

      // 1. Verify user is active in this organisation (PRJ-001)
      const userCheck = await client.query(
        `SELECT id, status FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
        [organisationId, userId]
      );

      if (userCheck.rows.length === 0 || userCheck.rows[0].status !== 'active') {
        throw new ValidationError('User must be an active member of this organisation to be added to a project.');
      }

      // 2. Check for duplicate membership
      const dupCheck = await client.query(
        `SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2`,
        [projectId, userId]
      );

      if (dupCheck.rows.length > 0) {
        throw new ConflictError('User is already a member of this project.', 'DUPLICATE_PROJECT_MEMBER');
      }

      // 3. Insert membership
      const insertRes = await client.query(
        `
        INSERT INTO project_members (organisation_id, project_id, user_id, role)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [organisationId, projectId, userId, role]
      );

      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'project.member_added',
        entityType: 'project_member',
        entityId: insertRes.rows[0].id,
        metadata: {
          projectId,
          memberUserId: userId,
          role,
        },
        ipAddress,
        userAgent,
        client,
      });

      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'project_member',
        entityId: insertRes.rows[0].id,
        action: 'member_added',
        summary: `Added member with role "${role}".`,
        metadata: {
          userId,
          role,
        },
      });

      const memberRes = await client.query(
        `
        SELECT pm.*, u.full_name AS user_name, u.email AS user_email
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.id = $1
      `,
        [insertRes.rows[0].id]
      );

      return formatMemberRow(memberRes.rows[0]);
    }
  );
}

export async function updateProjectMemberRole(
  organisationId,
  projectId,
  memberUserId,
  role,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!PROJECT_MEMBER_ROLES.includes(role)) {
    throw new ValidationError(`Invalid project member role "${role}". Allowed: ${PROJECT_MEMBER_ROLES.join(', ')}.`);
  }

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      const project = await assertProjectAccess(
        client,
        organisationId,
        projectId,
        actorUserId,
        'write'
      );

      // Project owner must retain manager role (PRJ-001)
      if (memberUserId === project.owner_id && role !== 'manager') {
        throw new ConflictError(
          'The project owner must retain the manager role on the project.',
          'CANNOT_DEMOTE_PROJECT_OWNER'
        );
      }

      const updateRes = await client.query(
        `
        UPDATE project_members
        SET role = $1, updated_at = NOW()
        WHERE project_id = $2 AND user_id = $3 AND organisation_id = $4
        RETURNING *
      `,
        [role, projectId, memberUserId, organisationId]
      );

      if (updateRes.rows.length === 0) {
        throw new NotFoundError('Project member not found.', 'PROJECT_MEMBER_NOT_FOUND');
      }

      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'project.member_updated',
        entityType: 'project_member',
        entityId: updateRes.rows[0].id,
        metadata: {
          projectId,
          memberUserId,
          newRole: role,
        },
        ipAddress,
        userAgent,
        client,
      });

      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'project_member',
        entityId: updateRes.rows[0].id,
        action: 'member_role_changed',
        summary: `Updated member role to "${role}".`,
        metadata: {
          memberUserId,
          newRole: role,
        },
      });

      const memberRes = await client.query(
        `
        SELECT pm.*, u.full_name AS user_name, u.email AS user_email
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.id = $1
      `,
        [updateRes.rows[0].id]
      );

      return formatMemberRow(memberRes.rows[0]);
    }
  );
}

export async function removeProjectMember(
  organisationId,
  projectId,
  memberUserId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      const project = await assertProjectAccess(
        client,
        organisationId,
        projectId,
        actorUserId,
        'write'
      );

      // Invariant (PRD §9.1 / PRJ-001):
      // "The current responsible owner/manager cannot be removed without an eligible replacement being assigned atomically or the operation being rejected."
      if (memberUserId === project.owner_id) {
        throw new ConflictError(
          'The current project owner cannot be removed. Reassign the project owner before removing this member.',
          'CANNOT_REMOVE_PROJECT_OWNER'
        );
      }

      // Invariant (PRD §9.2 / PRJ-004):
      // "If a user has active task assignments, block removal from the project or suspension/removal of their organisation membership until the tasks have been reassigned or marked otherwise by an authorised project manager."
      const activeTasksRes = await client.query(
        `SELECT id FROM tasks 
         WHERE project_id = $1 AND organisation_id = $2 AND assignee_id = $3 
           AND deleted_at IS NULL AND status != 'done' 
         LIMIT 1`,
        [projectId, organisationId, memberUserId]
      );

      if (activeTasksRes.rows.length > 0) {
        throw new ConflictError(
          'Cannot remove member with active task assignments on this project. Reassign or complete their tasks first.',
          'MEMBER_HAS_ACTIVE_TASKS'
        );
      }

      const deleteRes = await client.query(
        `
        DELETE FROM project_members
        WHERE project_id = $1 AND user_id = $2 AND organisation_id = $3
        RETURNING id
      `,
        [projectId, memberUserId, organisationId]
      );

      if (deleteRes.rows.length === 0) {
        throw new NotFoundError('Project member not found.', 'PROJECT_MEMBER_NOT_FOUND');
      }

      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'project.member_removed',
        entityType: 'project_member',
        entityId: deleteRes.rows[0].id,
        metadata: {
          projectId,
          memberUserId,
        },
        ipAddress,
        userAgent,
        client,
      });

      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'project_member',
        entityId: deleteRes.rows[0].id,
        action: 'member_removed',
        summary: `Removed a team member from the project.`,
        metadata: {
          memberUserId,
        },
      });

      return {
        success: true,
        removedUserId: memberUserId,
        projectId,
      };
    }
  );
}

// -----------------------------------------------------------------------------
// Tasks Helper: Fetch full task with joins
// -----------------------------------------------------------------------------

async function fetchFullTask(client, organisationId, taskId, projectId = null) {
  let query = `
    SELECT 
      t.*,
      p.name AS project_name,
      p.status AS project_status,
      creator.full_name AS created_by_name,
      assignee.full_name AS assignee_name,
      assignee.email AS assignee_email
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN users creator ON creator.id = t.created_by_id
    LEFT JOIN users assignee ON assignee.id = t.assignee_id
    WHERE t.id = $1 AND t.organisation_id = $2 AND t.deleted_at IS NULL
  `;
  const params = [taskId, organisationId];
  if (projectId) {
    query += ` AND t.project_id = $3`;
    params.push(projectId);
  }
  const res = await client.query(query, params);
  if (res.rows.length === 0) {
    return null;
  }
  return formatTaskRow(res.rows[0]);
}

// -----------------------------------------------------------------------------
// Tasks Service Operations (PRJ-003, PRJ-004, PRJ-005, PRJ-006)
// -----------------------------------------------------------------------------

/**
 * Creates a new task within a project (PRJ-003, PRJ-004, PRJ-005).
 */
export async function createTask(
  organisationId,
  projectId,
  data,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const {
    title,
    description,
    status = 'backlog',
    priority = 'medium',
    assigneeId = null,
    startDate,
    dueDate,
    labels = [],
  } = data;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new ValidationError('Task title is required.');
  }

  if (title.trim().length < 1 || title.trim().length > 255) {
    throw new ValidationError('Task title must be between 1 and 255 characters.');
  }

  if (!TASK_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid task status "${status}". Allowed: ${TASK_STATUSES.join(', ')}.`);
  }

  if (!TASK_PRIORITIES.includes(priority)) {
    throw new ValidationError(`Invalid task priority "${priority}". Allowed: ${TASK_PRIORITIES.join(', ')}.`);
  }

  const start = startDate ? new Date(startDate) : null;
  const due = dueDate ? new Date(dueDate) : null;

  if (start && isNaN(start.getTime())) {
    throw new ValidationError('Invalid start date timestamp.');
  }
  if (due && isNaN(due.getTime())) {
    throw new ValidationError('Invalid due date timestamp.');
  }
  if (start && due && start > due) {
    throw new ValidationError('Task start date cannot be after the due date.');
  }

  const cleanLabels = Array.isArray(labels)
    ? labels.map((l) => String(l).trim()).filter(Boolean)
    : [];

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Assert project write access (verifies project exists, tenant matches, not archived, actor has write role)
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'write');

      // 2. PRJ-004: Validate assignee eligibility if assigneeId is provided
      if (assigneeId) {
        const assigneeRes = await client.query(
          `
          SELECT pm.user_id 
          FROM project_members pm
          JOIN organisation_memberships om ON om.organisation_id = pm.organisation_id AND om.user_id = pm.user_id
          WHERE pm.project_id = $1 AND pm.organisation_id = $2 AND pm.user_id = $3 AND om.status = 'active'
        `,
          [projectId, organisationId, assigneeId]
        );

        if (assigneeRes.rows.length === 0) {
          throw new ValidationError(
            'Task assignee must be an active member of this project and organisation.',
            'INVALID_TASK_ASSIGNEE'
          );
        }
      }

      // 3. Insert task
      const insertRes = await client.query(
        `
        INSERT INTO tasks (
          organisation_id,
          project_id,
          title,
          description,
          status,
          priority,
          created_by_id,
          assignee_id,
          start_date,
          due_date,
          labels
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `,
        [
          organisationId,
          projectId,
          title.trim(),
          description ? description.trim() : null,
          status,
          priority,
          actorUserId,
          assigneeId || null,
          start,
          due,
          cleanLabels,
        ]
      );

      const taskId = insertRes.rows[0].id;

      // 4. Record audit event
      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'task.created',
        entityType: 'task',
        entityId: taskId,
        metadata: {
          projectId,
          title: title.trim(),
          status,
          priority,
          assigneeId: assigneeId || null,
        },
        ipAddress,
        userAgent,
        client,
      });

      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'task',
        entityId: taskId,
        action: 'task_created',
        summary: `Created task "${title.trim()}".`,
        metadata: {
          taskId,
          status,
          priority,
          assigneeId: assigneeId || null,
        },
      });

      return fetchFullTask(client, organisationId, taskId, projectId);
    }
  );
}

/**
 * Lists tasks for a specific project with filtering and deterministic pagination (PRJ-006).
 */
export async function listTasks(
  organisationId,
  projectId,
  filters = {},
  actorUserId
) {
  const {
    status,
    priority,
    assigneeId,
    assignedToMe,
    view, // 'all' | 'assigned_to_me' | 'due_soon' | 'overdue'
    search,
    page = 1,
    limit = 50,
  } = filters;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // Assert read access to project
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');

      const conditions = [
        't.organisation_id = $1',
        't.project_id = $2',
        't.deleted_at IS NULL',
      ];
      const params = [organisationId, projectId];
      let pIdx = 3;

      if (status && TASK_STATUSES.includes(status)) {
        conditions.push(`t.status = $${pIdx}`);
        params.push(status);
        pIdx++;
      }

      if (priority && TASK_PRIORITIES.includes(priority)) {
        conditions.push(`t.priority = $${pIdx}`);
        params.push(priority);
        pIdx++;
      }

      if (assigneeId) {
        conditions.push(`t.assignee_id = $${pIdx}`);
        params.push(assigneeId);
        pIdx++;
      }

      if (assignedToMe === 'true' || assignedToMe === true || view === 'assigned_to_me') {
        conditions.push(`t.assignee_id = $${pIdx}`);
        params.push(actorUserId);
        pIdx++;
      }

      if (view === 'due_soon') {
        // Due within the next 7 days and not done (PRJ-006)
        conditions.push(`t.due_date IS NOT NULL AND t.due_date >= CURRENT_DATE AND t.due_date <= (CURRENT_DATE + INTERVAL '7 days') AND t.status != 'done'`);
      } else if (view === 'overdue') {
        // Due date passed and not done (PRJ-006)
        conditions.push(`t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'done'`);
      }

      if (search && typeof search === 'string' && search.trim()) {
        conditions.push(`(t.title ILIKE $${pIdx} OR t.description ILIKE $${pIdx})`);
        params.push(`%${search.trim()}%`);
        pIdx++;
      }

      const whereClause = conditions.join(' AND ');

      // Total count query
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM tasks t WHERE ${whereClause}`,
        params
      );
      const total = countRes.rows[0].total;

      // Tasks query with join on users
      const queryParams = [...params, limitNum, offset];
      const listRes = await client.query(
        `
        SELECT 
          t.*,
          p.name AS project_name,
          creator.full_name AS created_by_name,
          assignee.full_name AS assignee_name,
          assignee.email AS assignee_email
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN users creator ON creator.id = t.created_by_id
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        WHERE ${whereClause}
        ORDER BY 
          CASE WHEN t.status = 'done' THEN 1 ELSE 0 END ASC,
          t.due_date ASC NULLS LAST,
          t.created_at DESC,
          t.id ASC
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `,
        queryParams
      );

      const items = listRes.rows.map(formatTaskRow);

      return {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      };
    }
  );
}

/**
 * Gets a task by ID within a project (PRJ-003).
 */
export async function getTaskById(organisationId, projectId, taskId, actorUserId) {
  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');
      const task = await fetchFullTask(client, organisationId, taskId, projectId);
      if (!task) {
        throw new NotFoundError('Task not found.', 'TASK_NOT_FOUND');
      }
      return task;
    }
  );
}

/**
 * Updates a task within a project (PRJ-004, PRJ-005).
 */
export async function updateTask(
  organisationId,
  projectId,
  taskId,
  data,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  const {
    title,
    description,
    status,
    priority,
    assigneeId,
    startDate,
    dueDate,
    labels,
  } = data;

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Assert project write access (checks not archived and role)
      const project = await assertProjectAccess(
        client,
        organisationId,
        projectId,
        actorUserId,
        'write'
      );

      // 2. Fetch current task with lock
      const currentRes = await client.query(
        `
        SELECT * FROM tasks
        WHERE id = $1 AND project_id = $2 AND organisation_id = $3 AND deleted_at IS NULL
        FOR UPDATE
      `,
        [taskId, projectId, organisationId]
      );

      if (currentRes.rows.length === 0) {
        throw new NotFoundError('Task not found.', 'TASK_NOT_FOUND');
      }

      const current = currentRes.rows[0];
      const updates = [];
      const params = [taskId, projectId, organisationId];
      let pIdx = 4;

      if (title !== undefined) {
        if (!title || typeof title !== 'string' || !title.trim()) {
          throw new ValidationError('Task title cannot be empty.');
        }
        if (title.trim().length < 1 || title.trim().length > 255) {
          throw new ValidationError('Task title must be between 1 and 255 characters.');
        }
        updates.push(`title = $${pIdx}`);
        params.push(title.trim());
        pIdx++;
      }

      if (description !== undefined) {
        updates.push(`description = $${pIdx}`);
        params.push(description ? description.trim() : null);
        pIdx++;
      }

      if (priority !== undefined) {
        if (!TASK_PRIORITIES.includes(priority)) {
          throw new ValidationError(`Invalid task priority "${priority}". Allowed: ${TASK_PRIORITIES.join(', ')}.`);
        }
        updates.push(`priority = $${pIdx}`);
        params.push(priority);
        pIdx++;
      }

      // Check dates
      const effectiveStart = startDate !== undefined ? (startDate ? new Date(startDate) : null) : current.start_date;
      const effectiveDue = dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : current.due_date;

      if (effectiveStart && isNaN(effectiveStart.getTime())) {
        throw new ValidationError('Invalid start date timestamp.');
      }
      if (effectiveDue && isNaN(effectiveDue.getTime())) {
        throw new ValidationError('Invalid due date timestamp.');
      }
      if (effectiveStart && effectiveDue && effectiveStart > effectiveDue) {
        throw new ValidationError('Task start date cannot be after the due date.');
      }

      if (startDate !== undefined) {
        updates.push(`start_date = $${pIdx}`);
        params.push(effectiveStart);
        pIdx++;
      }

      if (dueDate !== undefined) {
        updates.push(`due_date = $${pIdx}`);
        params.push(effectiveDue);
        pIdx++;
      }

      if (labels !== undefined) {
        const cleanLabels = Array.isArray(labels)
          ? labels.map((l) => String(l).trim()).filter(Boolean)
          : [];
        updates.push(`labels = $${pIdx}`);
        params.push(cleanLabels);
        pIdx++;
      }

      // Assignee validation (PRJ-004)
      if (assigneeId !== undefined && assigneeId !== current.assignee_id) {
        if (assigneeId !== null) {
          const assigneeRes = await client.query(
            `
            SELECT pm.user_id 
            FROM project_members pm
            JOIN organisation_memberships om ON om.organisation_id = pm.organisation_id AND om.user_id = pm.user_id
            WHERE pm.project_id = $1 AND pm.organisation_id = $2 AND pm.user_id = $3 AND om.status = 'active'
          `,
            [projectId, organisationId, assigneeId]
          );

          if (assigneeRes.rows.length === 0) {
            throw new ValidationError(
              'Task assignee must be an active member of this project and organisation.',
              'INVALID_TASK_ASSIGNEE'
            );
          }
        }

        updates.push(`assignee_id = $${pIdx}`);
        params.push(assigneeId);
        pIdx++;
      }

      // Status transition validation (PRJ-005)
      let statusTransitioned = false;
      if (status !== undefined && status !== current.status) {
        const orgRoles = project.actor_org_roles || [];
        const isOrgAdmin = isOrgProjectAdmin(orgRoles);
        const isOwner = project.owner_id === actorUserId;
        const isManager = project.actor_project_role === 'manager';
        const hasReopenPermission = isOrgAdmin || isOwner || isManager;

        const transitionResult = isValidTaskTransition(current.status, status, { hasReopenPermission });
        if (!transitionResult.valid) {
          if (transitionResult.requiresReopenPermission) {
            throw new AuthorizationError(
              transitionResult.reason || 'Reopening a completed task requires explicit manager or administrative permission.',
              'FORBIDDEN_TASK_REOPEN'
            );
          }
          throw new ConflictError(
            transitionResult.reason || `Invalid task status transition from "${current.status}" to "${status}".`,
            'INVALID_TASK_TRANSITION'
          );
        }

        updates.push(`status = $${pIdx}`);
        params.push(status);
        pIdx++;
        statusTransitioned = true;
      }

      if (updates.length === 0) {
        return fetchFullTask(client, organisationId, taskId, projectId);
      }

      updates.push(`updated_at = NOW()`);

      await client.query(
        `
        UPDATE tasks
        SET ${updates.join(', ')}
        WHERE id = $1 AND project_id = $2 AND organisation_id = $3
      `,
        params
      );

      // Record audit event
      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: statusTransitioned ? 'task.status_changed' : 'task.updated',
        entityType: 'task',
        entityId: taskId,
        metadata: {
          projectId,
          oldStatus: current.status,
          newStatus: status !== undefined ? status : current.status,
          assigneeId: assigneeId !== undefined ? assigneeId : current.assignee_id,
        },
        ipAddress,
        userAgent,
        client,
      });

      if (statusTransitioned) {
        await recordProjectActivity(client, {
          organisationId,
          projectId,
          actorId: actorUserId,
          entityType: 'task',
          entityId: taskId,
          action: 'task_status_changed',
          summary: `Task "${current.title}" status changed to "${status}".`,
          metadata: {
            taskId,
            previousStatus: current.status,
            newStatus: status,
          },
        });
      } else if (assigneeId !== undefined && assigneeId !== current.assignee_id) {
        await recordProjectActivity(client, {
          organisationId,
          projectId,
          actorId: actorUserId,
          entityType: 'task',
          entityId: taskId,
          action: 'task_assigned',
          summary: `Task "${current.title}" assignment updated.`,
          metadata: {
            taskId,
            previousAssigneeId: current.assignee_id,
            newAssigneeId: assigneeId,
          },
        });
      } else {
        await recordProjectActivity(client, {
          organisationId,
          projectId,
          actorId: actorUserId,
          entityType: 'task',
          entityId: taskId,
          action: 'task_updated',
          summary: `Task "${current.title}" was updated.`,
          metadata: { taskId },
        });
      }

      return fetchFullTask(client, organisationId, taskId, projectId);
    }
  );
}

/**
 * Soft-deletes a task (PRJ-005).
 */
export async function deleteTask(
  organisationId,
  projectId,
  taskId,
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Assert project write access
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'write');

      // 2. Soft-delete the task (PRJ-005)
      const res = await client.query(
        `
        UPDATE tasks
        SET deleted_at = NOW(), deleted_by_id = $1, updated_at = NOW()
        WHERE id = $2 AND project_id = $3 AND organisation_id = $4 AND deleted_at IS NULL
        RETURNING id, title
      `,
        [actorUserId, taskId, projectId, organisationId]
      );

      if (res.rows.length === 0) {
        throw new NotFoundError('Task not found or already deleted.', 'TASK_NOT_FOUND');
      }

      // 3. Record audit event
      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'task.deleted',
        entityType: 'task',
        entityId: taskId,
        metadata: {
          projectId,
          title: res.rows[0].title,
        },
        ipAddress,
        userAgent,
        client,
      });

      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'task',
        entityId: taskId,
        action: 'task_deleted',
        summary: `Deleted task "${res.rows[0].title}".`,
        metadata: { taskId },
      });

      return {
        success: true,
        taskId,
        projectId,
      };
    }
  );
}

/**
 * Lists tasks across accessible projects for the current user ("Assigned to me", "Due soon", "Overdue") (PRJ-006).
 */
export async function listMyTasks(
  organisationId,
  filters = {},
  actorUserId
) {
  const {
    view = 'assigned_to_me', // 'assigned_to_me' | 'due_soon' | 'overdue'
    status,
    priority,
    page = 1,
    limit = 50,
  } = filters;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      const conditions = [
        't.organisation_id = $1',
        't.deleted_at IS NULL',
        'p.status != \'archived\'',
      ];
      const params = [organisationId];
      let pIdx = 2;

      // Project access restriction: user must be in project_members or project owner or org admin
      conditions.push(`
        (
          EXISTS (
            SELECT 1 FROM project_members pm 
            WHERE pm.project_id = p.id AND pm.user_id = $${pIdx}
          )
          OR p.owner_id = $${pIdx}
          OR EXISTS (
            SELECT 1 FROM membership_roles mr
            JOIN roles r ON r.id = mr.role_id
            JOIN organisation_memberships m ON m.id = mr.membership_id
            WHERE m.organisation_id = $1 AND m.user_id = $${pIdx}
              AND r.slug IN ('organisation_owner', 'organisation_admin', 'project_admin')
          )
        )
      `);
      params.push(actorUserId);
      pIdx++;

      if (view === 'assigned_to_me') {
        conditions.push(`t.assignee_id = $${pIdx}`);
        params.push(actorUserId);
        pIdx++;
      } else if (view === 'due_soon') {
        conditions.push(`t.due_date IS NOT NULL AND t.due_date >= CURRENT_DATE AND t.due_date <= (CURRENT_DATE + INTERVAL '7 days') AND t.status != 'done'`);
      } else if (view === 'overdue') {
        conditions.push(`t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'done'`);
      }

      if (status && TASK_STATUSES.includes(status)) {
        conditions.push(`t.status = $${pIdx}`);
        params.push(status);
        pIdx++;
      }

      if (priority && TASK_PRIORITIES.includes(priority)) {
        conditions.push(`t.priority = $${pIdx}`);
        params.push(priority);
        pIdx++;
      }

      const whereClause = conditions.join(' AND ');

      const countRes = await client.query(
        `
        SELECT COUNT(*)::int AS total 
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        WHERE ${whereClause}
      `,
        params
      );
      const total = countRes.rows[0].total;

      const queryParams = [...params, limitNum, offset];
      const listRes = await client.query(
        `
        SELECT 
          t.*,
          p.name AS project_name,
          creator.full_name AS created_by_name,
          assignee.full_name AS assignee_name,
          assignee.email AS assignee_email
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN users creator ON creator.id = t.created_by_id
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        WHERE ${whereClause}
        ORDER BY 
          CASE WHEN t.status = 'done' THEN 1 ELSE 0 END ASC,
          t.due_date ASC NULLS LAST,
          t.created_at DESC,
          t.id ASC
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `,
        queryParams
      );

      const items = listRes.rows.map(formatTaskRow);

      return {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      };
    }
  );
}

// -----------------------------------------------------------------------------
// Formatters for Comments & Activity (Phase 8C)
// -----------------------------------------------------------------------------

function formatCommentRow(row) {
  if (!row) return null;
  const isDeleted = Boolean(row.deleted_at);
  return {
    id: row.id,
    organisationId: row.organisation_id,
    projectId: row.project_id,
    taskId: row.task_id,
    authorId: row.author_id,
    authorName: row.author_name || null,
    authorEmail: row.author_email || null,
    body: isDeleted ? '[This comment has been deleted]' : row.body,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    deletedById: row.deleted_by_id || null,
    deletedByName: row.deleted_by_name || null,
    isDeleted,
  };
}

function formatActivityRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    projectId: row.project_id,
    actorId: row.actor_id || null,
    actorName: row.actor_name || null,
    actorEmail: row.actor_email || null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    summary: row.summary,
    metadata: row.metadata || {},
    createdAt: row.created_at ? row.created_at.toISOString() : null,
  };
}

/**
 * Appends a concise timeline event to project_activity (PRJ-008).
 * Separate from compliance audit logs; never stores secrets or confidential payloads.
 */
export async function recordProjectActivity(client, {
  organisationId,
  projectId,
  actorId,
  entityType,
  entityId,
  action,
  summary,
  metadata = {},
}) {
  await client.query(
    `
    INSERT INTO project_activity (
      organisation_id,
      project_id,
      actor_id,
      entity_type,
      entity_id,
      action,
      summary,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `,
    [
      organisationId,
      projectId,
      actorId || null,
      entityType,
      entityId,
      action,
      summary,
      JSON.stringify(metadata),
    ]
  );
}

// -----------------------------------------------------------------------------
// Comments Operations (PRJ-007)
// -----------------------------------------------------------------------------

/**
 * Creates a plain-text comment on a task (PRJ-007).
 */
export async function createTaskComment(
  organisationId,
  projectId,
  taskId,
  { body },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!body || typeof body !== 'string' || !body.trim()) {
    throw new ValidationError('Comment body cannot be empty.');
  }
  const cleanBody = body.trim();
  if (cleanBody.length > 2000) {
    throw new ValidationError('Comment body cannot exceed 2000 characters.');
  }

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Assert project access (read mode verifies caller is a member; but write is prohibited if archived)
      const project = await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');
      if (project.status === 'archived') {
        throw new ConflictError('Cannot add comments to an archived project.', 'PROJECT_ARCHIVED');
      }

      // 2. Verify task exists, belongs to project, and is not soft-deleted
      const taskRes = await client.query(
        `SELECT id, title FROM tasks WHERE id = $1 AND project_id = $2 AND organisation_id = $3 AND deleted_at IS NULL`,
        [taskId, projectId, organisationId]
      );
      if (taskRes.rows.length === 0) {
        throw new NotFoundError('Task not found.', 'TASK_NOT_FOUND');
      }
      const task = taskRes.rows[0];

      // 3. Insert comment
      const insertRes = await client.query(
        `
        INSERT INTO task_comments (
          organisation_id,
          project_id,
          task_id,
          author_id,
          body
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [organisationId, projectId, taskId, actorUserId, cleanBody]
      );
      const commentRow = insertRes.rows[0];

      // 4. Record project activity
      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'task_comment',
        entityId: commentRow.id,
        action: 'comment_added',
        summary: `Added a comment on task "${task.title}".`,
        metadata: {
          taskId,
          commentId: commentRow.id,
        },
      });

      // 5. Record audit event (NEVER include comment body per PRJ-007 / SEC-008)
      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'task.comment_created',
        entityType: 'task_comment',
        entityId: commentRow.id,
        metadata: {
          projectId,
          taskId,
          commentId: commentRow.id,
        },
        ipAddress,
        userAgent,
        client,
      });

      // 6. Fetch full comment with author name
      const fullRes = await client.query(
        `
        SELECT 
          c.*,
          u.full_name AS author_name,
          u.email AS author_email
        FROM task_comments c
        JOIN users u ON u.id = c.author_id
        WHERE c.id = $1
      `,
        [commentRow.id]
      );

      return formatCommentRow(fullRes.rows[0]);
    }
  );
}

/**
 * Lists all comments for a task (PRJ-007).
 */
export async function listTaskComments(
  organisationId,
  projectId,
  taskId,
  actorUserId
) {
  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Assert project access
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');

      // 2. Verify task exists
      const taskRes = await client.query(
        `SELECT id FROM tasks WHERE id = $1 AND project_id = $2 AND organisation_id = $3 AND deleted_at IS NULL`,
        [taskId, projectId, organisationId]
      );
      if (taskRes.rows.length === 0) {
        throw new NotFoundError('Task not found.', 'TASK_NOT_FOUND');
      }

      // 3. Query comments
      const res = await client.query(
        `
        SELECT 
          c.*,
          author.full_name AS author_name,
          author.email AS author_email,
          del_user.full_name AS deleted_by_name
        FROM task_comments c
        JOIN users author ON author.id = c.author_id
        LEFT JOIN users del_user ON del_user.id = c.deleted_by_id
        WHERE c.task_id = $1 AND c.project_id = $2 AND c.organisation_id = $3
        ORDER BY c.created_at ASC
      `,
        [taskId, projectId, organisationId]
      );

      return res.rows.map(formatCommentRow);
    }
  );
}

/**
 * Updates a comment (author only, parent project not archived) (PRJ-007).
 */
export async function updateTaskComment(
  organisationId,
  projectId,
  taskId,
  commentId,
  { body },
  actorUserId,
  { ipAddress, userAgent } = {}
) {
  if (!body || typeof body !== 'string' || !body.trim()) {
    throw new ValidationError('Comment body cannot be empty.');
  }
  const cleanBody = body.trim();
  if (cleanBody.length > 2000) {
    throw new ValidationError('Comment body cannot exceed 2000 characters.');
  }

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Assert project access
      const project = await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');
      if (project.status === 'archived') {
        throw new ConflictError('Cannot edit comments in an archived project.', 'PROJECT_ARCHIVED');
      }

      // 2. Fetch existing comment
      const commentRes = await client.query(
        `SELECT * FROM task_comments WHERE id = $1 AND task_id = $2 AND project_id = $3 AND organisation_id = $4`,
        [commentId, taskId, projectId, organisationId]
      );
      if (commentRes.rows.length === 0) {
        throw new NotFoundError('Comment not found.', 'COMMENT_NOT_FOUND');
      }
      const existing = commentRes.rows[0];

      if (existing.deleted_at) {
        throw new ConflictError('Cannot edit a deleted comment.', 'COMMENT_DELETED');
      }

      // 3. Author check (PRJ-007)
      if (existing.author_id !== actorUserId) {
        throw new AuthorizationError('You can only edit your own comments.', 'FORBIDDEN');
      }

      // 4. Update comment
      await client.query(
        `
        UPDATE task_comments
        SET body = $1, updated_at = NOW()
        WHERE id = $2 AND organisation_id = $3
        RETURNING *
      `,
        [cleanBody, commentId, organisationId]
      );

      // 5. Record activity
      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'task_comment',
        entityId: commentId,
        action: 'comment_edited',
        summary: 'Edited a comment.',
        metadata: { taskId, commentId },
      });

      // 6. Fetch full updated comment
      const fullRes = await client.query(
        `
        SELECT 
          c.*,
          u.full_name AS author_name,
          u.email AS author_email
        FROM task_comments c
        JOIN users u ON u.id = c.author_id
        WHERE c.id = $1
      `,
        [commentId]
      );

      return formatCommentRow(fullRes.rows[0]);
    }
  );
}

/**
 * Soft-deletes a comment (author or moderator/admin, parent project not archived) (PRJ-007).
 */
export async function deleteTaskComment(
  organisationId,
  projectId,
  taskId,
  commentId,
  actorUserId,
  { callerPermissions = [], ipAddress, userAgent } = {}
) {
  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Assert project access
      const project = await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');
      if (project.status === 'archived') {
        throw new ConflictError('Cannot delete comments in an archived project.', 'PROJECT_ARCHIVED');
      }

      // 2. Fetch existing comment
      const commentRes = await client.query(
        `SELECT * FROM task_comments WHERE id = $1 AND task_id = $2 AND project_id = $3 AND organisation_id = $4`,
        [commentId, taskId, projectId, organisationId]
      );
      if (commentRes.rows.length === 0) {
        throw new NotFoundError('Comment not found.', 'COMMENT_NOT_FOUND');
      }
      const existing = commentRes.rows[0];

      if (existing.deleted_at) {
        throw new ConflictError('Comment is already deleted.', 'COMMENT_ALREADY_DELETED');
      }

      // 3. Authorization check (PRJ-007)
      const isAuthor = existing.author_id === actorUserId;
      const orgRoles = project.actor_org_roles || [];
      const isOrgAdmin = isOrgProjectAdmin(orgRoles);
      const isProjectManager = project.actor_project_role === 'manager';
      const hasModeratePerm =
        callerPermissions instanceof Set
          ? callerPermissions.has('project.comment.moderate')
          : Array.isArray(callerPermissions)
          ? callerPermissions.includes('project.comment.moderate')
          : false;

      if (!isAuthor && !isOrgAdmin && !isProjectManager && !hasModeratePerm) {
        throw new AuthorizationError(
          'Requires project.comment.moderate permission or manager role to delete other users comments.',
          'MODERATION_REQUIRED'
        );
      }

      // 4. Soft-delete
      await client.query(
        `
        UPDATE task_comments
        SET deleted_at = NOW(), deleted_by_id = $1
        WHERE id = $2 AND organisation_id = $3
      `,
        [actorUserId, commentId, organisationId]
      );

      // 5. Record activity
      await recordProjectActivity(client, {
        organisationId,
        projectId,
        actorId: actorUserId,
        entityType: 'task_comment',
        entityId: commentId,
        action: 'comment_deleted',
        summary: 'Deleted a comment.',
        metadata: { taskId, commentId },
      });

      // 6. Record audit event (NEVER include comment body per PRJ-007 / SEC-008)
      await recordAuditEvent({
        organisationId,
        actorId: actorUserId,
        action: 'task.comment_deleted',
        entityType: 'task_comment',
        entityId: commentId,
        metadata: {
          projectId,
          taskId,
          commentId,
          wasModerated: !isAuthor,
        },
        ipAddress,
        userAgent,
        client,
      });

      return {
        success: true,
        message: 'Comment soft-deleted.',
        commentId,
      };
    }
  );
}

// -----------------------------------------------------------------------------
// Activity Operations (PRJ-008)
// -----------------------------------------------------------------------------

/**
 * Lists the concise activity timeline for a project.
 */
export async function listProjectActivity(
  organisationId,
  projectId,
  actorUserId,
  { page = 1, limit = 20 } = {}
) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  return withTenantTransaction(
    { organisationId, userId: actorUserId },
    async (client) => {
      // 1. Assert project access (read-only)
      await assertProjectAccess(client, organisationId, projectId, actorUserId, 'read');

      // 2. Query total count
      const countRes = await client.query(
        `SELECT COUNT(*) AS total FROM project_activity WHERE project_id = $1 AND organisation_id = $2`,
        [projectId, organisationId]
      );
      const total = parseInt(countRes.rows[0].total, 10);

      // 3. Query activity items
      const listRes = await client.query(
        `
        SELECT 
          pa.*,
          u.full_name AS actor_name,
          u.email AS actor_email
        FROM project_activity pa
        LEFT JOIN users u ON u.id = pa.actor_id
        WHERE pa.project_id = $1 AND pa.organisation_id = $2
        ORDER BY pa.created_at DESC, pa.id DESC
        LIMIT $3 OFFSET $4
      `,
        [projectId, organisationId, limitNum, offset]
      );

      const items = listRes.rows.map(formatActivityRow);

      return {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      };
    }
  );
}

