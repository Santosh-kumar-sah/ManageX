-- ==============================================================================
-- ManageX Database Migration: 20261017000030_evaluation_rls_security_hardening.sql
-- Phase 2A.1: Evaluation RLS Security Hardening & Least-Privilege Enforcement
-- Strictly closes the platform-support operational access gap (PRD §6.5, PLAT-004, SEC-009).
-- Removes platform_admin bypass from SELECT, INSERT, UPDATE, and DELETE policies
-- on round_evaluations, evaluation_panels, evaluation_panel_judges, and evaluation_sessions.
-- ==============================================================================

-- 1. Drop Existing Migration 029 Policies

DROP POLICY IF EXISTS round_eval_select ON round_evaluations;
DROP POLICY IF EXISTS round_eval_insert ON round_evaluations;
DROP POLICY IF EXISTS round_eval_update ON round_evaluations;
DROP POLICY IF EXISTS round_eval_delete ON round_evaluations;

DROP POLICY IF EXISTS panels_select ON evaluation_panels;
DROP POLICY IF EXISTS panels_insert ON evaluation_panels;
DROP POLICY IF EXISTS panels_update ON evaluation_panels;
DROP POLICY IF EXISTS panels_delete ON evaluation_panels;

DROP POLICY IF EXISTS pjudges_select ON evaluation_panel_judges;
DROP POLICY IF EXISTS pjudges_insert ON evaluation_panel_judges;
DROP POLICY IF EXISTS pjudges_update ON evaluation_panel_judges;
DROP POLICY IF EXISTS pjudges_delete ON evaluation_panel_judges;

DROP POLICY IF EXISTS sessions_select ON evaluation_sessions;
DROP POLICY IF EXISTS sessions_insert ON evaluation_sessions;
DROP POLICY IF EXISTS sessions_update ON evaluation_sessions;
DROP POLICY IF EXISTS sessions_delete ON evaluation_sessions;

-- 2. Hardened Policies for round_evaluations

CREATE POLICY round_eval_select ON round_evaluations
  FOR SELECT TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = round_evaluations.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM evaluation_panel_judges epj
        WHERE epj.round_evaluation_id = round_evaluations.id
          AND epj.judge_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
      OR (
        status = 'published' AND EXISTS (
          SELECT 1 FROM event_registrations er
          WHERE er.event_id = round_evaluations.event_id
            AND er.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
      )
    )
  );

CREATE POLICY round_eval_insert ON round_evaluations
  FOR INSERT TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = round_evaluations.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

CREATE POLICY round_eval_update ON round_evaluations
  FOR UPDATE TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = round_evaluations.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = round_evaluations.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

CREATE POLICY round_eval_delete ON round_evaluations
  FOR DELETE TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = round_evaluations.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

-- 3. Hardened Policies for evaluation_panels

CREATE POLICY panels_select ON evaluation_panels
  FOR SELECT TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panels.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM evaluation_panel_judges epj
        WHERE epj.panel_id = evaluation_panels.id
          AND epj.judge_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
      OR EXISTS (
        SELECT 1 FROM round_evaluations re
        JOIN event_registrations er ON er.event_id = re.event_id
        WHERE re.id = evaluation_panels.round_evaluation_id
          AND re.status = 'published'
          AND er.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  );

CREATE POLICY panels_insert ON evaluation_panels
  FOR INSERT TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_panels.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

CREATE POLICY panels_update ON evaluation_panels
  FOR UPDATE TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_panels.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_panels.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

CREATE POLICY panels_delete ON evaluation_panels
  FOR DELETE TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_panels.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

-- 4. Hardened Policies for evaluation_panel_judges

CREATE POLICY pjudges_select ON evaluation_panel_judges
  FOR SELECT TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panel_judges.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
      OR judge_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY pjudges_insert ON evaluation_panel_judges
  FOR INSERT TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_panel_judges.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

CREATE POLICY pjudges_update ON evaluation_panel_judges
  FOR UPDATE TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_panel_judges.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_panel_judges.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

CREATE POLICY pjudges_delete ON evaluation_panel_judges
  FOR DELETE TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_panel_judges.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

-- 5. Hardened Policies for evaluation_sessions

CREATE POLICY sessions_select ON evaluation_sessions
  FOR SELECT TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_sessions.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM evaluation_panel_judges epj
        WHERE epj.panel_id = evaluation_sessions.panel_id
          AND epj.judge_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
      OR (
        status != 'cancelled' AND EXISTS (
          SELECT 1 FROM round_evaluations re
          JOIN event_team_members tm ON tm.team_id = evaluation_sessions.team_id
          WHERE re.id = evaluation_sessions.round_evaluation_id
            AND re.status = 'published'
            AND tm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
      )
    )
  );

CREATE POLICY sessions_insert ON evaluation_sessions
  FOR INSERT TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_sessions.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

CREATE POLICY sessions_update ON evaluation_sessions
  FOR UPDATE TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_sessions.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_sessions.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );

CREATE POLICY sessions_delete ON evaluation_sessions
  FOR DELETE TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.organisation_id = evaluation_sessions.organisation_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );
