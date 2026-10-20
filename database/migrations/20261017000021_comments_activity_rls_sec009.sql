-- ==============================================================================
-- ManageX Migration 021: Enforce SEC-009 RLS Tenant Isolation on Comments & Activity
-- Strictly adheres to PRD Section 10, PRD Section 12 (SEC-009), and docs/security.md.
-- Platform operator roles cannot bypass RLS to view tenant comments or activity.
-- ==============================================================================

DROP POLICY IF EXISTS task_comments_tenant_isolation_select ON task_comments;
DROP POLICY IF EXISTS task_comments_tenant_isolation_insert ON task_comments;
DROP POLICY IF EXISTS task_comments_tenant_isolation_update ON task_comments;
DROP POLICY IF EXISTS task_comments_tenant_isolation_delete ON task_comments;

CREATE POLICY task_comments_tenant_isolation_select ON task_comments
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY task_comments_tenant_isolation_insert ON task_comments
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY task_comments_tenant_isolation_update ON task_comments
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY task_comments_tenant_isolation_delete ON task_comments
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

DROP POLICY IF EXISTS project_activity_tenant_isolation_select ON project_activity;
DROP POLICY IF EXISTS project_activity_tenant_isolation_insert ON project_activity;
DROP POLICY IF EXISTS project_activity_tenant_isolation_update ON project_activity;
DROP POLICY IF EXISTS project_activity_tenant_isolation_delete ON project_activity;

CREATE POLICY project_activity_tenant_isolation_select ON project_activity
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_activity_tenant_isolation_insert ON project_activity
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_activity_tenant_isolation_update ON project_activity
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY project_activity_tenant_isolation_delete ON project_activity
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );
