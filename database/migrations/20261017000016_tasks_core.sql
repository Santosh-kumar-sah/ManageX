-- ManageX Migration 016: Tasks Core & Workflow (Phase 8B)
-- Strictly adheres to PRD Section 9.2 (PRJ-003, PRJ-004, PRJ-005, PRJ-006), docs/security.md, and docs/database.md.

-- 1. Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'backlog',
  priority VARCHAR(32) NOT NULL DEFAULT 'medium',
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  labels TEXT[] NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tasks_status CHECK (status IN ('backlog', 'todo', 'in_progress', 'blocked', 'done')),
  CONSTRAINT chk_tasks_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT chk_tasks_date_order CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date),
  CONSTRAINT fk_tasks_project_tenant FOREIGN KEY (project_id, organisation_id)
    REFERENCES projects(id, organisation_id) ON DELETE RESTRICT,
  CONSTRAINT uq_tasks_id_org UNIQUE (id, organisation_id),
  CONSTRAINT uq_tasks_org_id UNIQUE (organisation_id, id)
);

-- 2. Query-Driven Indexes (matching docs/database.md §4)
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(organisation_id, project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project_priority ON tasks(organisation_id, project_id, priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(organisation_id, assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(organisation_id, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(organisation_id, project_id, created_at DESC) WHERE deleted_at IS NULL;

-- 3. Enable and Force Row-Level Security
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

-- 3.1 Tasks RLS Policies for managex_app
CREATE POLICY tasks_tenant_isolation_select ON tasks
  AS RESTRICTIVE
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_insert ON tasks
  AS RESTRICTIVE
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_update ON tasks
  AS RESTRICTIVE
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_delete ON tasks
  AS RESTRICTIVE
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 4. Grant Least-Privilege DML Permissions to runtime role managex_app
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO managex_app;
