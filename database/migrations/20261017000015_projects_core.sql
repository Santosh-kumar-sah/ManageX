-- ManageX Migration 015: Projects Core & Membership (Phase 8A)
-- Strictly adheres to PRD Section 9.1 (PRJ-001) & Section 9.2 (PRJ-002), docs/security.md, and docs/database.md.

-- 1. Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'planning',
  priority VARCHAR(32) NOT NULL DEFAULT 'medium',
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  start_date TIMESTAMPTZ,
  target_date TIMESTAMPTZ,
  labels TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_projects_status CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'archived')),
  CONSTRAINT chk_projects_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT chk_projects_date_order CHECK (start_date IS NULL OR target_date IS NULL OR start_date <= target_date),
  CONSTRAINT uq_projects_id_org UNIQUE (id, organisation_id),
  CONSTRAINT uq_projects_org_id UNIQUE (organisation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_projects_org_status ON projects(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_org_priority ON projects(organisation_id, priority);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(organisation_id, owner_id);

-- 2. Create project_members table (Resource-scoped project membership: PRJ-001)
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_project_members_project FOREIGN KEY (project_id, organisation_id)
    REFERENCES projects(id, organisation_id) ON DELETE CASCADE,
  CONSTRAINT fk_project_members_org_user FOREIGN KEY (organisation_id, user_id)
    REFERENCES organisation_memberships(organisation_id, user_id) ON DELETE CASCADE,
  CONSTRAINT chk_project_member_role CHECK (role IN ('manager', 'member', 'viewer')),
  CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_lookup ON project_members(organisation_id, project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(organisation_id, user_id);

-- 3. Enable and Force Row-Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;

-- 3.1 Projects RLS Policies
CREATE POLICY projects_tenant_isolation_select ON projects
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY projects_tenant_isolation_insert ON projects
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY projects_tenant_isolation_update ON projects
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY projects_tenant_isolation_delete ON projects
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 3.2 Project Members RLS Policies
CREATE POLICY project_members_tenant_isolation_select ON project_members
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_members_tenant_isolation_insert ON project_members
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_members_tenant_isolation_update ON project_members
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_members_tenant_isolation_delete ON project_members
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 4. Grant runtime DML to managex_app
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_members TO managex_app;
