-- ==============================================================================
-- ManageX Migration 004: Seed Reference Data (Modules, Permissions, System Roles)
-- Strictly adheres to docs/database.md, ADR-004, and PRD Section 6.3 & OPS-005
-- Zero customer credentials or fake tenants. Reference catalogue data only.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Core Modules
-- ------------------------------------------------------------------------------
INSERT INTO modules (slug, name, description, is_core)
VALUES 
  ('events', 'Events & Hackathons', 'Manage events, hackathons, team submissions, criteria-based judging, and results publication.', false),
  ('meetings', 'Meetings', 'Schedule meetings, manage attendees, structured agendas, confidential minutes, and actionable task generation.', false),
  ('projects', 'Projects & Tasks', 'Organise projects, assign tasks, track board and list views, activity streams, and team progress.', false)
ON CONFLICT (slug) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- ------------------------------------------------------------------------------
-- 2. Central Permission Catalogue
-- ------------------------------------------------------------------------------
INSERT INTO permissions (key, name, description, scope)
VALUES
  -- Platform Scope
  ('platform.admin', 'Platform Super Admin', 'Full unrestricted platform administration and operational controls.', 'platform'),
  ('platform.support', 'Platform Support Agent', 'Read-only operational monitoring and troubleshooting metadata.', 'platform'),

  -- Organisation Scope
  ('org.view', 'View Organisation', 'View organisation profile and basic workspace metadata.', 'organisation'),
  ('org.edit', 'Edit Organisation', 'Update organisation name, slug, settings, and branding.', 'organisation'),
  ('org.delete', 'Delete Organisation', 'Permanently archive or delete the organisation workspace.', 'organisation'),
  ('org.members.view', 'View Members', 'View member list and invitation statuses.', 'organisation'),
  ('org.members.manage', 'Manage Members', 'Invite members, modify roles, and remove or suspend memberships.', 'organisation'),
  ('org.modules.manage', 'Manage Modules', 'Activate or deactivate individual modules for the organisation.', 'organisation'),
  ('org.audit.view', 'View Audit Logs', 'View immutable audit log activity for the organisation.', 'organisation'),

  -- Events Module Scope
  ('event.view', 'View Events', 'Browse published events and event schedules.', 'module'),
  ('event.create', 'Create Events', 'Draft and configure new events or hackathons.', 'module'),
  ('event.edit', 'Edit Events', 'Update event configurations, dates, and registration windows.', 'module'),
  ('event.delete', 'Delete Events', 'Cancel or archive events.', 'module'),
  ('event.register', 'Register for Event', 'Register self or team for an event or hackathon.', 'module'),
  ('event.judge', 'Judge Submissions', 'Evaluate and submit criterion scores for hackathon entries.', 'module'),

  -- Meetings Module Scope
  ('meeting.view', 'View Meetings', 'View scheduled meetings and agendas.', 'module'),
  ('meeting.create', 'Create Meetings', 'Schedule new meetings and configure attendee invitations.', 'module'),
  ('meeting.edit', 'Edit Meetings', 'Update meeting schedules, agendas, and statuses.', 'module'),
  ('meeting.delete', 'Cancel Meetings', 'Cancel or archive meetings.', 'module'),
  ('meeting.notes.read', 'Read Confidential Minutes', 'Read confidential meeting notes and minutes.', 'module'),
  ('meeting.notes.edit', 'Edit Minutes', 'Author or update confidential meeting minutes.', 'module'),

  -- Projects Module Scope
  ('project.view', 'View Projects', 'Browse organisation projects and project boards.', 'module'),
  ('project.create', 'Create Projects', 'Initiate new projects and configure teams.', 'module'),
  ('project.edit', 'Edit Projects', 'Update project metadata, dates, and lifecycle states.', 'module'),
  ('project.delete', 'Delete Projects', 'Archive or delete projects.', 'module'),
  ('task.view', 'View Tasks', 'View tasks, task details, and status updates.', 'module'),
  ('task.create', 'Create Tasks', 'Create new tasks and assign to team members.', 'module'),
  ('task.edit', 'Edit Tasks', 'Update task assignments, statuses, due dates, and priorities.', 'module'),
  ('task.delete', 'Delete Tasks', 'Soft-delete tasks.', 'module')
ON CONFLICT (key) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description, scope = EXCLUDED.scope;

-- ------------------------------------------------------------------------------
-- 3. Built-in System Roles
-- ------------------------------------------------------------------------------
INSERT INTO roles (organisation_id, name, slug, scope, is_system)
VALUES
  (NULL, 'Organisation Owner', 'organisation_owner', 'organisation', true),
  (NULL, 'Organisation Admin', 'organisation_admin', 'organisation', true),
  (NULL, 'Organisation Member', 'organisation_member', 'organisation', true)
ON CONFLICT (organisation_id, slug) DO UPDATE
SET name = EXCLUDED.name, scope = EXCLUDED.scope, is_system = EXCLUDED.is_system;

-- ------------------------------------------------------------------------------
-- 4. Map Permissions to Built-in System Roles
-- ------------------------------------------------------------------------------
-- (a) Owner receives ALL organisation and module permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'organisation_owner'
  AND p.scope IN ('organisation', 'module')
ON CONFLICT DO NOTHING;

-- (b) Admin receives all except destructive org.delete
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'organisation_admin'
  AND p.key != 'org.delete'
  AND p.scope IN ('organisation', 'module')
ON CONFLICT DO NOTHING;

-- (c) Member receives standard view/register/create-task permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'organisation_member'
  AND p.key IN (
    'org.view', 'org.members.view',
    'event.view', 'event.register',
    'meeting.view',
    'project.view', 'task.view', 'task.create', 'task.edit'
  )
ON CONFLICT DO NOTHING;
