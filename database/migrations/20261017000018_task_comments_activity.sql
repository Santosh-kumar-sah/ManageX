-- ManageX Migration 018: Task Comments & Project Activity Timeline (Phase 8C)
-- Strictly adheres to PRD Section 9.3 (PRJ-007, PRJ-008), docs/security.md, ADR-013, and docs/database.md.

-- 1. Create task_comments table (PRJ-007)
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL,
  task_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT fk_task_comments_task FOREIGN KEY (task_id, organisation_id)
    REFERENCES tasks(id, organisation_id) ON DELETE CASCADE,
  CONSTRAINT fk_task_comments_project FOREIGN KEY (project_id, organisation_id)
    REFERENCES projects(id, organisation_id) ON DELETE CASCADE,
  CONSTRAINT chk_task_comments_body_len CHECK (char_length(body) >= 1 AND char_length(body) <= 2000),
  CONSTRAINT uq_task_comments_id_org UNIQUE (id, organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(organisation_id, task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_task_comments_author ON task_comments(organisation_id, author_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_project ON task_comments(organisation_id, project_id);

-- 2. Create project_activity table (PRJ-008)
CREATE TABLE IF NOT EXISTS project_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(64) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_project_activity_project FOREIGN KEY (project_id, organisation_id)
    REFERENCES projects(id, organisation_id) ON DELETE CASCADE,
  CONSTRAINT uq_project_activity_id_org UNIQUE (id, organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_project_activity_lookup ON project_activity(organisation_id, project_id, created_at DESC);

-- 3. Enable and Force Row-Level Security
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;

ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity FORCE ROW LEVEL SECURITY;

-- 3.1 Task Comments RLS Policies
CREATE POLICY task_comments_tenant_isolation_select ON task_comments
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY task_comments_tenant_isolation_insert ON task_comments
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY task_comments_tenant_isolation_update ON task_comments
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY task_comments_tenant_isolation_delete ON task_comments
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 3.2 Project Activity RLS Policies
CREATE POLICY project_activity_tenant_isolation_select ON project_activity
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_activity_tenant_isolation_insert ON project_activity
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_activity_tenant_isolation_update ON project_activity
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_activity_tenant_isolation_delete ON project_activity
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 4. Grant DML Permissions to managex_app Runtime Role
GRANT SELECT, INSERT, UPDATE, DELETE ON task_comments TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_activity TO managex_app;

-- 5. Seed Permissions for Comments (PRJ-007)
INSERT INTO permissions (key, name, description, scope)
VALUES
  ('project.comment.moderate', 'Moderate Comments', 'Moderate and delete comments posted by other team members.', 'module'),
  ('task.comment.create', 'Create Task Comments', 'Post comments on project tasks.', 'module')
ON CONFLICT (key) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description, scope = EXCLUDED.scope;

-- Assign permissions to system roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug IN ('organisation_owner', 'organisation_admin')
  AND p.key IN ('project.comment.moderate', 'task.comment.create')
ON CONFLICT (role_id, permission_id) DO NOTHING;
