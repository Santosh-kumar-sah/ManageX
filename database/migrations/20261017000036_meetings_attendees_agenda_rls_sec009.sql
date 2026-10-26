-- ==============================================================================
-- ManageX Database Migration: 20261017000036_meetings_attendees_agenda_rls_sec009.sql
-- Enforce SEC-009 RLS Tenant Isolation for Meeting Attendees and Agenda Items
-- Strictly closes the platform-administrator operational bypass on meeting_attendees and meeting_agenda_items (PRD §6.5, PLAT-004, SEC-009).
-- Removes app.current_is_platform_admin bypass from SELECT, INSERT, UPDATE, and DELETE policies.
-- Enforces strict organisation isolation via app.current_organisation_id transaction context.
-- ==============================================================================

-- 1. Meeting Attendees RLS Policies
DROP POLICY IF EXISTS meeting_attendees_tenant_isolation_select ON meeting_attendees;
DROP POLICY IF EXISTS meeting_attendees_tenant_isolation_insert ON meeting_attendees;
DROP POLICY IF EXISTS meeting_attendees_tenant_isolation_update ON meeting_attendees;
DROP POLICY IF EXISTS meeting_attendees_tenant_isolation_delete ON meeting_attendees;

CREATE POLICY meeting_attendees_tenant_isolation_select ON meeting_attendees
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_attendees_tenant_isolation_insert ON meeting_attendees
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_attendees_tenant_isolation_update ON meeting_attendees
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_attendees_tenant_isolation_delete ON meeting_attendees
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 2. Meeting Agenda Items RLS Policies
DROP POLICY IF EXISTS meeting_agenda_tenant_isolation_select ON meeting_agenda_items;
DROP POLICY IF EXISTS meeting_agenda_tenant_isolation_insert ON meeting_agenda_items;
DROP POLICY IF EXISTS meeting_agenda_tenant_isolation_update ON meeting_agenda_items;
DROP POLICY IF EXISTS meeting_agenda_tenant_isolation_delete ON meeting_agenda_items;

CREATE POLICY meeting_agenda_tenant_isolation_select ON meeting_agenda_items
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_agenda_tenant_isolation_insert ON meeting_agenda_items
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_agenda_tenant_isolation_update ON meeting_agenda_items
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_agenda_tenant_isolation_delete ON meeting_agenda_items
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );
