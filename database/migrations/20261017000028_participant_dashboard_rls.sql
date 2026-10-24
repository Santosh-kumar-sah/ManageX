-- ManageX Database Migration: 20261017000028_participant_dashboard_rls.sql
-- Enables registered participants to query their enrolled events and rounds even during in_progress or completed statuses

-- 1. Events SELECT Policy Update
DROP POLICY IF EXISTS events_tenant_isolation_select ON events;

CREATE POLICY events_tenant_isolation_select ON events
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (status IN ('published', 'registration_closed', 'in_progress', 'completed') AND visibility = 'public')
    OR EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.event_id = events.id
        AND er.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- 2. Event Rounds SELECT Policy Update
DROP POLICY IF EXISTS event_rounds_tenant_isolation_select ON event_rounds;

CREATE POLICY event_rounds_tenant_isolation_select ON event_rounds
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_rounds.event_id
        AND e.status IN ('published', 'registration_closed', 'in_progress', 'completed')
        AND e.visibility = 'public'
    )
    OR EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.event_id = event_rounds.event_id
        AND er.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );
