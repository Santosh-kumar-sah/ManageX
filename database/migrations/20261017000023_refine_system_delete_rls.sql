-- ==============================================================================
-- ManageX Migration 023: Refine System Cleanup Delete Policies while preserving SEC-009 Read Isolation
-- Enforces:
-- 1. SELECT policies strictly prevent platform operators from viewing private tenant data (SEC-009).
-- 2. DELETE policies permit system-level cascading cleanup during test/tenant maintenance.
-- ==============================================================================

DROP POLICY IF EXISTS events_tenant_isolation_delete ON events;
CREATE POLICY events_tenant_isolation_delete ON events
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );

DROP POLICY IF EXISTS meetings_tenant_isolation_delete ON meetings;
CREATE POLICY meetings_tenant_isolation_delete ON meetings
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );

DROP POLICY IF EXISTS projects_tenant_isolation_delete ON projects;
CREATE POLICY projects_tenant_isolation_delete ON projects
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );
