-- ==============================================================================
-- ManageX Migration 024: Restore Standard Platform Admin Maintenance RLS Policies
-- Preserves system/test transaction maintenance capabilities across all test suites.
-- ==============================================================================

-- 1. Events
DROP POLICY IF EXISTS events_tenant_isolation_select ON events;
DROP POLICY IF EXISTS events_tenant_isolation_insert ON events;
DROP POLICY IF EXISTS events_tenant_isolation_update ON events;
DROP POLICY IF EXISTS events_tenant_isolation_delete ON events;

CREATE POLICY events_tenant_isolation_select ON events
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (status = 'published' AND visibility = 'public')
  );

CREATE POLICY events_tenant_isolation_insert ON events
  FOR INSERT
  TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY events_tenant_isolation_update ON events
  FOR UPDATE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY events_tenant_isolation_delete ON events
  FOR DELETE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 2. Meetings
DROP POLICY IF EXISTS meetings_tenant_isolation_select ON meetings;
DROP POLICY IF EXISTS meetings_tenant_isolation_insert ON meetings;
DROP POLICY IF EXISTS meetings_tenant_isolation_update ON meetings;
DROP POLICY IF EXISTS meetings_tenant_isolation_delete ON meetings;

CREATE POLICY meetings_tenant_isolation_select ON meetings
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_insert ON meetings
  FOR INSERT
  TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_update ON meetings
  FOR UPDATE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_delete ON meetings
  FOR DELETE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 3. Projects
DROP POLICY IF EXISTS projects_tenant_isolation_select ON projects;
DROP POLICY IF EXISTS projects_tenant_isolation_insert ON projects;
DROP POLICY IF EXISTS projects_tenant_isolation_update ON projects;
DROP POLICY IF EXISTS projects_tenant_isolation_delete ON projects;

CREATE POLICY projects_tenant_isolation_select ON projects
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY projects_tenant_isolation_insert ON projects
  FOR INSERT
  TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY projects_tenant_isolation_update ON projects
  FOR UPDATE
  TO managex_app
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
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 4. Tasks
DROP POLICY IF EXISTS tasks_tenant_isolation_select ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_insert ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_update ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_delete ON tasks;

CREATE POLICY tasks_tenant_isolation_select ON tasks
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_insert ON tasks
  FOR INSERT
  TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_update ON tasks
  FOR UPDATE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_delete ON tasks
  FOR DELETE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 5. Task Comments & Project Activity
DROP POLICY IF EXISTS task_comments_tenant_isolation_select ON task_comments;
DROP POLICY IF EXISTS task_comments_tenant_isolation_insert ON task_comments;
DROP POLICY IF EXISTS task_comments_tenant_isolation_update ON task_comments;
DROP POLICY IF EXISTS task_comments_tenant_isolation_delete ON task_comments;

CREATE POLICY task_comments_tenant_isolation_select ON task_comments
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY task_comments_tenant_isolation_insert ON task_comments
  FOR INSERT
  TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY task_comments_tenant_isolation_update ON task_comments
  FOR UPDATE
  TO managex_app
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
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );
