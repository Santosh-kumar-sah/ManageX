-- ==============================================================================
-- ManageX Migration 020: Enforce SEC-009 RLS Tenant Isolation on Tasks
-- Strictly adheres to PRD Section 10, PRD Section 12 (SEC-009), and docs/security.md.
-- Platform operator roles cannot bypass RLS to view tenant task data.
-- ==============================================================================

DROP POLICY IF EXISTS tasks_tenant_isolation_select ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_insert ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_update ON tasks;
DROP POLICY IF EXISTS tasks_tenant_isolation_delete ON tasks;

CREATE POLICY tasks_tenant_isolation_select ON tasks
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_insert ON tasks
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_update ON tasks
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY tasks_tenant_isolation_delete ON tasks
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );
