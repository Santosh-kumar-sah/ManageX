-- ==============================================================================
-- ManageX Migration 008: Central Permission Catalogue, PRD RBAC-003 Baseline Roles,
-- and Module Platform Availability
-- Strictly adheres to PRD Section 6.3 (RBAC-001, RBAC-002, RBAC-003),
-- PRD Section 6.4 (MOD-001, MOD-002), ADR-004, and ADR-016.
-- ==============================================================================

-- 1. Ensure modules table tracks platform availability (MOD-001, MOD-002)
ALTER TABLE modules 
  ADD COLUMN IF NOT EXISTS is_platform_available BOOLEAN NOT NULL DEFAULT true;

-- 2. Deduplicate existing system roles (where organisation_id IS NULL) before creating unique index
DELETE FROM roles r1
USING roles r2
WHERE r1.organisation_id IS NULL 
  AND r2.organisation_id IS NULL 
  AND r1.slug = r2.slug 
  AND (r1.created_at > r2.created_at OR (r1.created_at = r2.created_at AND r1.id > r2.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_roles_slug 
  ON roles (slug) WHERE organisation_id IS NULL;

-- ------------------------------------------------------------------------------
-- 3. Seed Central Permission Catalogue
-- ------------------------------------------------------------------------------
INSERT INTO permissions (key, name, description, scope)
VALUES
  -- Platform Scope
  ('platform.admin', 'Platform Super Admin', 'Full unrestricted platform administration and operational controls.', 'platform'),
  ('platform.support', 'Platform Support Agent', 'Read-only operational monitoring and troubleshooting metadata.', 'platform'),
  ('platform.overview.read', 'Read Platform Overview', 'View platform-wide system overview and operational metrics.', 'platform'),
  ('platform.org.read', 'Read Platform Organisations', 'Inspect tenant organisation metadata.', 'platform'),
  ('platform.org.manage', 'Manage Platform Organisations', 'Enable or disable tenant organisations globally.', 'platform'),
  ('platform.module.manage', 'Manage Platform Modules', 'Enable or disable module platform availability.', 'platform'),
  ('platform.audit.read', 'Read Platform Audit Logs', 'View platform-wide operational audit log.', 'platform'),

  -- Organisation Scope
  ('org.view', 'View Organisation', 'View organisation profile and basic workspace metadata.', 'organisation'),
  ('org.read', 'Read Organisation', 'Read organisation profile and workspace metadata.', 'organisation'),
  ('org.edit', 'Edit Organisation', 'Update organisation name, slug, settings, and branding.', 'organisation'),
  ('org.update', 'Update Organisation', 'Update organisation name, slug, settings, and branding.', 'organisation'),
  ('org.delete', 'Delete Organisation', 'Permanently archive or delete the organisation workspace.', 'organisation'),
  ('org.members.view', 'View Members', 'View member list and invitation statuses.', 'organisation'),
  ('org.member.read', 'Read Members', 'View member list and invitation statuses.', 'organisation'),
  ('org.members.manage', 'Manage Members', 'Invite members, modify roles, and remove or suspend memberships.', 'organisation'),
  ('org.member.invite', 'Invite Members', 'Invite new members to the organisation.', 'organisation'),
  ('org.member.manage', 'Manage Members', 'Change member roles, suspend, or remove members.', 'organisation'),
  ('org.modules.manage', 'Manage Modules', 'Activate or deactivate individual modules for the organisation.', 'organisation'),
  ('org.module.manage', 'Manage Modules', 'Activate or deactivate individual modules for the organisation.', 'organisation'),
  ('org.audit.view', 'View Audit Logs', 'View immutable audit log activity for the organisation.', 'organisation'),
  ('org.owner.transfer', 'Transfer Ownership', 'Transfer primary organisation ownership to another member.', 'organisation'),

  -- Events Module Scope
  ('event.view', 'View Events', 'Browse published events and event schedules.', 'module'),
  ('event.read', 'Read Events', 'Read published events and event schedules.', 'module'),
  ('event.create', 'Create Events', 'Draft and configure new events or hackathons.', 'module'),
  ('event.edit', 'Edit Events', 'Update event configurations, dates, and registration windows.', 'module'),
  ('event.update', 'Update Events', 'Update event configurations, dates, and registration windows.', 'module'),
  ('event.delete', 'Delete Events', 'Cancel or archive events.', 'module'),
  ('event.register', 'Register for Event', 'Register self or team for an event or hackathon.', 'module'),
  ('event.judge', 'Judge Submissions', 'Evaluate and submit criterion scores for hackathon entries.', 'module'),
  ('event.judge.evaluate', 'Evaluate Submissions', 'Evaluate and submit criterion scores for assigned entries.', 'module'),
  ('event.status.manage', 'Manage Event Status', 'Advance event status through canonical lifecycle.', 'module'),
  ('event.participant.manage', 'Manage Participants', 'View and manage registered event participants.', 'module'),
  ('event.team.create', 'Create Hackathon Team', 'Create and configure a hackathon team.', 'module'),
  ('event.submission.create', 'Submit Project', 'Submit URL project for judging.', 'module'),
  ('event.result.publish', 'Publish Event Results', 'Review and publish final calculated results.', 'module'),

  -- Meetings Module Scope
  ('meeting.view', 'View Meetings', 'View scheduled meetings and agendas.', 'module'),
  ('meeting.read', 'Read Meetings', 'View scheduled meetings and agendas.', 'module'),
  ('meeting.create', 'Create Meetings', 'Schedule new meetings and configure attendee invitations.', 'module'),
  ('meeting.edit', 'Edit Meetings', 'Update meeting schedules, agendas, and statuses.', 'module'),
  ('meeting.update', 'Update Meetings', 'Update meeting schedules, agendas, and statuses.', 'module'),
  ('meeting.delete', 'Cancel Meetings', 'Cancel or archive meetings.', 'module'),
  ('meeting.status.manage', 'Manage Meeting Status', 'Advance meeting status through canonical lifecycle.', 'module'),
  ('meeting.notes.read', 'Read Confidential Minutes', 'Read confidential meeting notes and minutes.', 'module'),
  ('meeting.notes.edit', 'Edit Minutes', 'Author or update confidential meeting minutes.', 'module'),
  ('meeting.notes.manage', 'Manage Minutes', 'Author or update confidential meeting minutes.', 'module'),
  ('meeting.action.manage', 'Manage Action Items', 'Create and assign action items.', 'module'),
  ('meeting.action.update', 'Update Action Items', 'Update action item status or assignee.', 'module'),

  -- Projects Module Scope
  ('project.view', 'View Projects', 'Browse organisation projects and project boards.', 'module'),
  ('project.read', 'Read Projects', 'Browse organisation projects and project boards.', 'module'),
  ('project.create', 'Create Projects', 'Initiate new projects and configure teams.', 'module'),
  ('project.edit', 'Edit Projects', 'Update project metadata, dates, and lifecycle states.', 'module'),
  ('project.update', 'Update Projects', 'Update project metadata, dates, and lifecycle states.', 'module'),
  ('project.delete', 'Delete Projects', 'Archive or delete projects.', 'module'),
  ('task.view', 'View Tasks', 'View tasks, task details, and status updates.', 'module'),
  ('task.read', 'Read Tasks', 'View tasks, task details, and status updates.', 'module'),
  ('task.create', 'Create Tasks', 'Create new tasks and assign to team members.', 'module'),
  ('task.edit', 'Edit Tasks', 'Update task assignments, statuses, due dates, and priorities.', 'module'),
  ('task.update', 'Update Tasks', 'Update task assignments, statuses, due dates, and priorities.', 'module'),
  ('task.delete', 'Delete Tasks', 'Soft-delete tasks.', 'module'),
  ('task.comment.create', 'Comment on Tasks', 'Add discussion comments to tasks.', 'module')
ON CONFLICT (key) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description, scope = EXCLUDED.scope;

-- ------------------------------------------------------------------------------
-- 4. Seed PRD RBAC-003 Baseline System Roles
-- ------------------------------------------------------------------------------
INSERT INTO roles (organisation_id, name, slug, scope, is_system)
VALUES
  -- Platform Roles
  (NULL, 'Platform Super Admin', 'platform_super_admin', 'platform', true),
  (NULL, 'Platform Support Agent', 'platform_support_agent', 'platform', true),

  -- Organisation Roles
  (NULL, 'Organisation Owner', 'organisation_owner', 'organisation', true),
  (NULL, 'Organisation Admin', 'organisation_admin', 'organisation', true),
  (NULL, 'Organisation Member', 'organisation_member', 'organisation', true),

  -- Events Module Roles
  (NULL, 'Event Admin', 'event_admin', 'module', true),
  (NULL, 'Event Manager', 'event_manager', 'module', true),
  (NULL, 'Event Judge', 'event_judge', 'module', true),
  (NULL, 'Event Participant', 'event_participant', 'module', true),
  (NULL, 'Event Viewer', 'event_viewer', 'module', true),

  -- Meetings Module Roles
  (NULL, 'Meeting Admin', 'meeting_admin', 'module', true),
  (NULL, 'Meeting Organiser', 'meeting_organiser', 'module', true),
  (NULL, 'Meeting Participant', 'meeting_participant', 'module', true),
  (NULL, 'Meeting Viewer', 'meeting_viewer', 'module', true),

  -- Projects Module Roles
  (NULL, 'Project Admin', 'project_admin', 'module', true),
  (NULL, 'Project Manager', 'project_manager', 'module', true),
  (NULL, 'Project Team Member', 'project_team_member', 'module', true),
  (NULL, 'Project Viewer', 'project_viewer', 'module', true)
ON CONFLICT (slug) WHERE organisation_id IS NULL DO UPDATE
SET name = EXCLUDED.name, scope = EXCLUDED.scope, is_system = EXCLUDED.is_system;

-- ------------------------------------------------------------------------------
-- 5. Map Permissions to Built-in Baseline Roles
-- ------------------------------------------------------------------------------

-- (a) Platform Super Admin receives ALL platform permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'platform_super_admin'
  AND p.scope = 'platform'
ON CONFLICT DO NOTHING;

-- (b) Platform Support Agent receives operational read permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'platform_support_agent'
  AND p.key IN ('platform.support', 'platform.overview.read', 'platform.org.read')
ON CONFLICT DO NOTHING;

-- (c) Organisation Owner receives ALL organisation and module permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'organisation_owner'
  AND p.scope IN ('organisation', 'module')
ON CONFLICT DO NOTHING;

-- (d) Organisation Admin receives all except destructive org.delete
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'organisation_admin'
  AND p.key != 'org.delete'
  AND p.scope IN ('organisation', 'module')
ON CONFLICT DO NOTHING;

-- (e) Organisation Member receives standard baseline permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'organisation_member'
  AND p.key IN (
    'org.view', 'org.read', 'org.members.view', 'org.member.read',
    'event.view', 'event.read', 'event.register',
    'meeting.view', 'meeting.read',
    'project.view', 'project.read', 'task.view', 'task.read', 'task.create', 'task.edit', 'task.update', 'task.comment.create'
  )
ON CONFLICT DO NOTHING;

-- (f) Event Admin receives ALL event.* permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'event_admin'
  AND p.key LIKE 'event.%'
ON CONFLICT DO NOTHING;

-- (g) Event Manager receives event lifecycle and management permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'event_manager'
  AND p.key IN (
    'event.view', 'event.read', 'event.create', 'event.edit', 'event.update',
    'event.register', 'event.status.manage', 'event.participant.manage', 'event.team.create'
  )
ON CONFLICT DO NOTHING;

-- (h) Event Judge receives evaluation permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'event_judge'
  AND p.key IN ('event.view', 'event.read', 'event.judge', 'event.judge.evaluate')
ON CONFLICT DO NOTHING;

-- (i) Event Participant receives registration and submission permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'event_participant'
  AND p.key IN ('event.view', 'event.read', 'event.register', 'event.team.create', 'event.submission.create')
ON CONFLICT DO NOTHING;

-- (j) Event Viewer receives read-only view permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'event_viewer'
  AND p.key IN ('event.view', 'event.read')
ON CONFLICT DO NOTHING;

-- (k) Meeting Admin receives ALL meeting.* permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'meeting_admin'
  AND p.key LIKE 'meeting.%'
ON CONFLICT DO NOTHING;

-- (l) Meeting Organiser receives management, confidential notes, and action item permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'meeting_organiser'
  AND p.key IN (
    'meeting.view', 'meeting.read', 'meeting.create', 'meeting.edit', 'meeting.update',
    'meeting.status.manage', 'meeting.notes.read', 'meeting.notes.edit', 'meeting.notes.manage',
    'meeting.action.manage', 'meeting.action.update'
  )
ON CONFLICT DO NOTHING;

-- (m) Meeting Participant receives view and assigned action item permissions (NO confidential notes!)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'meeting_participant'
  AND p.key IN ('meeting.view', 'meeting.read', 'meeting.action.update')
ON CONFLICT DO NOTHING;

-- (n) Meeting Viewer receives read-only view permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'meeting_viewer'
  AND p.key IN ('meeting.view', 'meeting.read')
ON CONFLICT DO NOTHING;

-- (o) Project Admin receives ALL project.* and task.* permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'project_admin'
  AND (p.key LIKE 'project.%' OR p.key LIKE 'task.%')
ON CONFLICT DO NOTHING;

-- (p) Project Manager receives management and task permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'project_manager'
  AND p.key IN (
    'project.view', 'project.read', 'project.create', 'project.edit', 'project.update',
    'task.view', 'task.read', 'task.create', 'task.edit', 'task.update', 'task.delete', 'task.comment.create'
  )
ON CONFLICT DO NOTHING;

-- (q) Project Team Member receives project read and task collaboration permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'project_team_member'
  AND p.key IN (
    'project.view', 'project.read',
    'task.view', 'task.read', 'task.create', 'task.edit', 'task.update', 'task.comment.create'
  )
ON CONFLICT DO NOTHING;

-- (r) Project Viewer receives read-only view permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'project_viewer'
  AND p.key IN ('project.view', 'project.read', 'task.view', 'task.read')
ON CONFLICT DO NOTHING;
