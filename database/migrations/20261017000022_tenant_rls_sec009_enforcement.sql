-- ==============================================================================
-- ManageX Migration 022: Enforce SEC-009 RLS Tenant Isolation across Events, Meetings, Projects
-- Strictly adheres to PRD Section 10 (PLAT-003, PLAT-005), Section 12 (SEC-009), and docs/security.md.
-- Platform operator roles cannot bypass RLS to view tenant events, meetings, or projects.
-- ==============================================================================

-- 1. Events RLS Policies (preserve public published event exemption)
DROP POLICY IF EXISTS events_tenant_isolation_select ON events;
DROP POLICY IF EXISTS events_tenant_isolation_insert ON events;
DROP POLICY IF EXISTS events_tenant_isolation_update ON events;
DROP POLICY IF EXISTS events_tenant_isolation_delete ON events;

CREATE POLICY events_tenant_isolation_select ON events
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (status = 'published' AND visibility = 'public')
  );

CREATE POLICY events_tenant_isolation_insert ON events
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY events_tenant_isolation_update ON events
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY events_tenant_isolation_delete ON events
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 2. Meetings RLS Policies
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

-- 3. Projects RLS Policies
DROP POLICY IF EXISTS projects_tenant_isolation_select ON projects;
DROP POLICY IF EXISTS projects_tenant_isolation_insert ON projects;
DROP POLICY IF EXISTS projects_tenant_isolation_update ON projects;
DROP POLICY IF EXISTS projects_tenant_isolation_delete ON projects;

CREATE POLICY projects_tenant_isolation_select ON projects
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY projects_tenant_isolation_insert ON projects
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY projects_tenant_isolation_update ON projects
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY projects_tenant_isolation_delete ON projects
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );
