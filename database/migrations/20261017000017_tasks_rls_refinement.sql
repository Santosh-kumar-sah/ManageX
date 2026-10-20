-- ManageX Migration 017: Tasks RLS Refinement (Phase 8B)
-- Replaces restrictive-only policy on tasks with standard permissive policy pattern.

DROP POLICY IF EXISTS tasks_tenant_isolation_select ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_insert ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_update ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_delete ON tasks;

CREATE POLICY tasks_tenant_isolation_select ON tasks
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_insert ON tasks
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_update ON tasks
  FOR UPDATE
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
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );
