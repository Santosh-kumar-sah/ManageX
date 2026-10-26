-- ManageX Database Migration: 20261017000040_meetings_root_rls_sec009.sql
-- Enforce SEC-009 RLS Tenant Isolation for Root Meetings Table
-- Strictly closes the platform-administrator operational bypass on meetings (PRD §6.5, PLAT-004, SEC-009).
-- Removes app.current_is_platform_admin bypass from SELECT, INSERT, UPDATE, and DELETE policies.
-- Enforces strict organisation isolation via app.current_organisation_id transaction context.

-- Ensure RLS is enabled and forced
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings FORCE ROW LEVEL SECURITY;

-- 1. Meeting Root Tenant Isolation RLS Policies
DROP POLICY IF EXISTS meetings_tenant_isolation_select ON meetings;
DROP POLICY IF EXISTS meetings_tenant_isolation_insert ON meetings;
DROP POLICY IF EXISTS meetings_tenant_isolation_update ON meetings;
DROP POLICY IF EXISTS meetings_tenant_isolation_delete ON meetings;

CREATE POLICY meetings_tenant_isolation_select ON meetings
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_insert ON meetings
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_update ON meetings
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_delete ON meetings
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );
