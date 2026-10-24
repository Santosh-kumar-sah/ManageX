-- ==============================================================================
-- ManageX Database Migration: 20261017000029_evaluation_database_foundation.sql
-- Phase 2A: Judge Scheduling & Evaluation Database Foundation
-- Strictly adheres to ADR-001, ADR-003, ADR-008, ADR-009, docs/security.md, and PRD Section 7.
-- ==============================================================================

-- 1. Prerequisites on Existing Tables
-- Enforces event-scoped team uniqueness for composite referential integrity
ALTER TABLE event_teams
  ADD CONSTRAINT uq_event_teams_id_event UNIQUE (event_id, id);

-- 2. Core Round Evaluations Configuration (1:0..1 with event_rounds)
CREATE TABLE round_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  round_id UUID NOT NULL,
  evaluation_mode VARCHAR(32) NOT NULL DEFAULT 'submission_based',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  session_duration_minutes INT NOT NULL DEFAULT 15,
  buffer_minutes INT NOT NULL DEFAULT 3,
  judges_per_panel INT NOT NULL DEFAULT 2,
  evaluations_per_team INT NOT NULL DEFAULT 1,
  schedule_starts_at TIMESTAMPTZ,
  schedule_ends_at TIMESTAMPTZ,
  default_meeting_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_round_eval_org
    FOREIGN KEY (organisation_id)
    REFERENCES organisations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_round_eval_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_round_eval_round
    FOREIGN KEY (event_id, round_id)
    REFERENCES event_rounds(event_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_round_eval_round UNIQUE (round_id),
  CONSTRAINT uq_round_eval_id_org UNIQUE (organisation_id, id),
  CONSTRAINT uq_round_eval_id_event UNIQUE (event_id, id),
  CONSTRAINT chk_round_eval_mode CHECK (evaluation_mode IN ('submission_based', 'live_showcase', 'hybrid')),
  CONSTRAINT chk_round_eval_status CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
  CONSTRAINT chk_round_eval_duration CHECK (session_duration_minutes >= 5 AND session_duration_minutes <= 480),
  CONSTRAINT chk_round_eval_buffer CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120),
  CONSTRAINT chk_round_eval_judges CHECK (judges_per_panel >= 1 AND judges_per_panel <= 20),
  CONSTRAINT chk_round_eval_evals CHECK (evaluations_per_team >= 1 AND evaluations_per_team <= 20),
  CONSTRAINT chk_round_eval_times CHECK (
    schedule_ends_at IS NULL OR schedule_starts_at IS NULL OR schedule_ends_at > schedule_starts_at
  )
);

CREATE INDEX idx_round_eval_org_event ON round_evaluations (organisation_id, event_id);
CREATE INDEX idx_round_eval_round ON round_evaluations (round_id);
CREATE INDEX idx_round_eval_status ON round_evaluations (status);

-- 3. Evaluation Panels
CREATE TABLE evaluation_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  round_evaluation_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL,
  meeting_url TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_panels_org
    FOREIGN KEY (organisation_id)
    REFERENCES organisations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_panels_eval
    FOREIGN KEY (organisation_id, round_evaluation_id)
    REFERENCES round_evaluations(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_panels_eval_event
    FOREIGN KEY (event_id, round_evaluation_id)
    REFERENCES round_evaluations(event_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_panels_eval_name UNIQUE (round_evaluation_id, name),
  CONSTRAINT uq_panels_id_org UNIQUE (organisation_id, id),
  CONSTRAINT uq_panels_id_eval UNIQUE (round_evaluation_id, id),
  CONSTRAINT chk_panels_order CHECK (order_index >= 0)
);

CREATE INDEX idx_panels_org_eval ON evaluation_panels (organisation_id, round_evaluation_id);
CREATE INDEX idx_panels_order ON evaluation_panels (round_evaluation_id, order_index ASC);

-- 4. Evaluation Panel Judges
CREATE TABLE evaluation_panel_judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  round_evaluation_id UUID NOT NULL,
  panel_id UUID NOT NULL,
  judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_pjudges_org
    FOREIGN KEY (organisation_id)
    REFERENCES organisations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pjudges_eval
    FOREIGN KEY (organisation_id, round_evaluation_id)
    REFERENCES round_evaluations(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_pjudges_panel
    FOREIGN KEY (round_evaluation_id, panel_id)
    REFERENCES evaluation_panels(round_evaluation_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_pjudges_eval_judge UNIQUE (round_evaluation_id, judge_user_id),
  CONSTRAINT uq_pjudges_panel_judge UNIQUE (panel_id, judge_user_id)
);

CREATE INDEX idx_pjudges_panel ON evaluation_panel_judges (panel_id);
CREATE INDEX idx_pjudges_user ON evaluation_panel_judges (judge_user_id);
CREATE INDEX idx_pjudges_eval ON evaluation_panel_judges (round_evaluation_id);

-- 5. Evaluation Sessions
CREATE TABLE evaluation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  round_evaluation_id UUID NOT NULL,
  panel_id UUID NOT NULL,
  team_id UUID NOT NULL,
  slot_index INT NOT NULL DEFAULT 1,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  meeting_url TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_sessions_org
    FOREIGN KEY (organisation_id)
    REFERENCES organisations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sessions_eval
    FOREIGN KEY (organisation_id, round_evaluation_id)
    REFERENCES round_evaluations(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_eval_event
    FOREIGN KEY (event_id, round_evaluation_id)
    REFERENCES round_evaluations(event_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_panel
    FOREIGN KEY (round_evaluation_id, panel_id)
    REFERENCES evaluation_panels(round_evaluation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_team_event
    FOREIGN KEY (event_id, team_id)
    REFERENCES event_teams(event_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_sessions_panel_start UNIQUE (panel_id, starts_at),
  CONSTRAINT uq_sessions_team_start UNIQUE (round_evaluation_id, team_id, starts_at),
  CONSTRAINT chk_sessions_interval CHECK (ends_at > starts_at),
  CONSTRAINT chk_sessions_slot CHECK (slot_index >= 1),
  CONSTRAINT chk_sessions_status CHECK (status IN ('scheduled', 'in_progress', 'completed', 'rescheduled', 'cancelled'))
);

CREATE INDEX idx_sessions_org_eval ON evaluation_sessions (organisation_id, round_evaluation_id);
CREATE INDEX idx_sessions_panel ON evaluation_sessions (panel_id);
CREATE INDEX idx_sessions_team ON evaluation_sessions (team_id);
CREATE INDEX idx_sessions_interval ON evaluation_sessions (starts_at, ends_at);
CREATE INDEX idx_sessions_status ON evaluation_sessions (status);

-- 6. Row-Level Security (RLS) Enablement & Enforcement
ALTER TABLE round_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_evaluations FORCE ROW LEVEL SECURITY;

ALTER TABLE evaluation_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_panels FORCE ROW LEVEL SECURITY;

ALTER TABLE evaluation_panel_judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_panel_judges FORCE ROW LEVEL SECURITY;

ALTER TABLE evaluation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_sessions FORCE ROW LEVEL SECURITY;

-- 6.1 Round Evaluations Policies
CREATE POLICY round_eval_select ON round_evaluations
  FOR SELECT TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
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
    )
  );

CREATE POLICY round_eval_insert ON round_evaluations
  FOR INSERT TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = round_evaluations.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY round_eval_update ON round_evaluations
  FOR UPDATE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = round_evaluations.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = round_evaluations.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY round_eval_delete ON round_evaluations
  FOR DELETE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = round_evaluations.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

-- 6.2 Evaluation Panels Policies
CREATE POLICY panels_select ON evaluation_panels
  FOR SELECT TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
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
    )
  );

CREATE POLICY panels_insert ON evaluation_panels
  FOR INSERT TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panels.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY panels_update ON evaluation_panels
  FOR UPDATE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panels.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panels.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY panels_delete ON evaluation_panels
  FOR DELETE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panels.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

-- 6.3 Evaluation Panel Judges Policies
CREATE POLICY pjudges_select ON evaluation_panel_judges
  FOR SELECT TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
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
    )
  );

CREATE POLICY pjudges_insert ON evaluation_panel_judges
  FOR INSERT TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panel_judges.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY pjudges_update ON evaluation_panel_judges
  FOR UPDATE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panel_judges.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panel_judges.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY pjudges_delete ON evaluation_panel_judges
  FOR DELETE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_panel_judges.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

-- 6.4 Evaluation Sessions Policies
CREATE POLICY sessions_select ON evaluation_sessions
  FOR SELECT TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
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
    )
  );

CREATE POLICY sessions_insert ON evaluation_sessions
  FOR INSERT TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_sessions.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY sessions_update ON evaluation_sessions
  FOR UPDATE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_sessions.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_sessions.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY sessions_delete ON evaluation_sessions
  FOR DELETE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR (
      organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = evaluation_sessions.organisation_id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
  );

-- 7. Grant Runtime Privileges to managex_app
GRANT SELECT, INSERT, UPDATE, DELETE ON round_evaluations TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON evaluation_panels TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON evaluation_panel_judges TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON evaluation_sessions TO managex_app;
