-- ==============================================================================
-- ManageX Migration 032: Evaluation Permissions and no-show Session Status
-- Forward-only Phase 1 hardening for Judge Scheduling & Evaluation.
-- ==============================================================================

INSERT INTO permissions (key, name, description, scope)
VALUES
  ('event.evaluation.view', 'View Evaluation', 'View permitted evaluation configuration, panels, and schedules.', 'module'),
  ('event.evaluation.manage', 'Manage Evaluation Configuration', 'Create and update round evaluation configuration.', 'module'),
  ('event.evaluation.judge.manage', 'Manage Evaluation Judges', 'Create panels and manage evaluation judge assignments.', 'module'),
  ('event.evaluation.schedule.manage', 'Manage Evaluation Schedule', 'Create, generate, reschedule, cancel, and update evaluation sessions.', 'module'),
  ('event.evaluation.schedule.publish', 'Publish Evaluation Schedule', 'Publish or unpublish evaluation schedules for permitted participants.', 'module')
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope;

-- Event-edit access alone must not grant evaluation capabilities.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL
  AND r.slug IN ('organisation_owner', 'organisation_admin', 'event_admin')
  AND p.key IN (
    'event.evaluation.view',
    'event.evaluation.manage',
    'event.evaluation.judge.manage',
    'event.evaluation.schedule.manage',
    'event.evaluation.schedule.publish'
  )
ON CONFLICT DO NOTHING;

-- Preserve read-only evaluation visibility for existing judge and participant
-- assignments without granting either role management capabilities.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL
  AND r.slug IN ('event_judge', 'event_participant')
  AND p.key = 'event.evaluation.view'
ON CONFLICT DO NOTHING;

ALTER TABLE evaluation_sessions
  DROP CONSTRAINT IF EXISTS chk_sessions_status;

ALTER TABLE evaluation_sessions
  ADD CONSTRAINT chk_sessions_status
  CHECK (status IN ('scheduled', 'in_progress', 'completed', 'rescheduled', 'no_show', 'cancelled'));
