-- ==============================================================================
-- ManageX Database Migration: 20261017000025_multi_round_hackathons.sql
-- Phase 02B: Multi-Round Hackathon Core Engine & Data Model
-- Strictly adheres to ADR-001, ADR-003, ADR-008, docs/security.md, and PRD Section 7.
-- ==============================================================================

-- 1. Create Core Event Rounds Table
CREATE TABLE IF NOT EXISTS event_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  round_number INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  instructions TEXT,
  submission_opens_at TIMESTAMPTZ,
  submission_closes_at TIMESTAMPTZ,
  advancement_rule VARCHAR(32) NOT NULL DEFAULT 'manual',
  advancement_threshold NUMERIC(5, 2),
  advancement_top_n INTEGER,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  results_published_at TIMESTAMPTZ,
  results_published_by_id UUID REFERENCES users(id),
  results_scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Structural & Tenant-Isolation Constraints
  CONSTRAINT fk_event_rounds_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_event_rounds_order UNIQUE (event_id, round_number),
  CONSTRAINT uq_event_rounds_id_org UNIQUE (organisation_id, id),
  CONSTRAINT uq_event_rounds_event_id UNIQUE (event_id, id),
  CONSTRAINT chk_rounds_round_number CHECK (round_number >= 1),
  CONSTRAINT chk_rounds_advancement_rule CHECK (advancement_rule IN ('manual', 'score_threshold', 'top_n')),
  CONSTRAINT chk_rounds_status CHECK (status IN ('pending', 'open', 'judging', 'completed')),
  CONSTRAINT chk_rounds_sub_window CHECK (submission_closes_at IS NULL OR submission_opens_at IS NULL OR submission_closes_at > submission_opens_at),
  CONSTRAINT chk_rounds_threshold CHECK (advancement_threshold IS NULL OR (advancement_threshold >= 0 AND advancement_threshold <= 1000)),
  CONSTRAINT chk_rounds_top_n CHECK (advancement_top_n IS NULL OR advancement_top_n >= 1)
);

CREATE INDEX IF NOT EXISTS idx_event_rounds_org_event ON event_rounds (organisation_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event_rounds_event_order ON event_rounds (event_id, round_number ASC);
CREATE INDEX IF NOT EXISTS idx_event_rounds_status ON event_rounds (event_id, status);

-- 2. Create Event Round Advancements Table (Tracks qualification & progression)
CREATE TABLE IF NOT EXISTS event_round_advancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  round_id UUID NOT NULL,
  team_id UUID,
  participant_user_id UUID REFERENCES users(id),
  status VARCHAR(32) NOT NULL DEFAULT 'qualified',
  qualification_score NUMERIC(7, 2),
  qualification_rank INTEGER,
  advanced_by_id UUID NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Structural & Tenant-Isolation Constraints
  CONSTRAINT fk_advancements_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_advancements_round
    FOREIGN KEY (organisation_id, round_id)
    REFERENCES event_rounds(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_advancements_team
    FOREIGN KEY (organisation_id, team_id)
    REFERENCES event_teams(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_round_advancements_id_org UNIQUE (organisation_id, id),
  CONSTRAINT uq_round_advancements_team UNIQUE NULLS NOT DISTINCT (round_id, team_id),
  CONSTRAINT uq_round_advancements_user UNIQUE NULLS NOT DISTINCT (round_id, participant_user_id),
  CONSTRAINT chk_advancements_status CHECK (status IN ('qualified', 'eliminated', 'disqualified')),
  CONSTRAINT chk_advancement_target CHECK (
    (team_id IS NOT NULL AND participant_user_id IS NULL) OR
    (team_id IS NULL AND participant_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_advancements_org_round ON event_round_advancements (organisation_id, round_id);
CREATE INDEX IF NOT EXISTS idx_advancements_team ON event_round_advancements (round_id, team_id);
CREATE INDEX IF NOT EXISTS idx_advancements_user ON event_round_advancements (round_id, participant_user_id);

-- 3. Extend Existing Tables with round_id (Nullable for Safe Backward Compatibility)
ALTER TABLE event_submissions
  ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES event_rounds(id) ON DELETE SET NULL;

ALTER TABLE event_scoring_criteria
  ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES event_rounds(id) ON DELETE SET NULL;

ALTER TABLE event_judge_assignments
  ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES event_rounds(id) ON DELETE SET NULL;

ALTER TABLE event_scores
  ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES event_rounds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_round ON event_submissions (round_id);
CREATE INDEX IF NOT EXISTS idx_scoring_criteria_round ON event_scoring_criteria (round_id);
CREATE INDEX IF NOT EXISTS idx_judge_assignments_round ON event_judge_assignments (round_id);
CREATE INDEX IF NOT EXISTS idx_scores_round ON event_scores (round_id);

-- 4. Backward-Compatible Initialization & Backfill
-- Every existing event is initialized with a default "Round 1"
INSERT INTO event_rounds (
  organisation_id,
  event_id,
  round_number,
  name,
  description,
  submission_opens_at,
  submission_closes_at,
  advancement_rule,
  status,
  results_published_at,
  results_published_by_id,
  created_at,
  updated_at
)
SELECT
  e.organisation_id,
  e.id,
  1,
  'Round 1',
  'Initial Competition Round',
  e.submission_opens_at,
  e.submission_closes_at,
  'manual',
  CASE
    WHEN e.status = 'completed' THEN 'completed'
    WHEN e.status = 'in_progress' THEN 'open'
    WHEN e.status = 'published' THEN 'open'
    ELSE 'pending'
  END,
  e.results_published_at,
  e.results_published_by_id,
  e.created_at,
  e.updated_at
FROM events e
ON CONFLICT (event_id, round_number) DO NOTHING;

-- Backfill round_id for existing submissions, criteria, assignments, and scores
UPDATE event_submissions s
SET round_id = r.id
FROM event_rounds r
WHERE r.event_id = s.event_id AND r.round_number = 1 AND s.round_id IS NULL;

UPDATE event_scoring_criteria c
SET round_id = r.id
FROM event_rounds r
WHERE r.event_id = c.event_id AND r.round_number = 1 AND c.round_id IS NULL;

UPDATE event_judge_assignments a
SET round_id = r.id
FROM event_rounds r
WHERE r.event_id = a.event_id AND r.round_number = 1 AND a.round_id IS NULL;

UPDATE event_scores sc
SET round_id = r.id
FROM event_rounds r
WHERE r.event_id = sc.event_id AND r.round_number = 1 AND sc.round_id IS NULL;

-- 5. Enable and Force Row-Level Security (RLS)
ALTER TABLE event_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rounds FORCE ROW LEVEL SECURITY;

ALTER TABLE event_round_advancements ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_round_advancements FORCE ROW LEVEL SECURITY;

-- 5.1 RLS Policies for event_rounds
CREATE POLICY event_rounds_tenant_isolation_select ON event_rounds
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_rounds.event_id
        AND e.status = 'published'
        AND e.visibility = 'public'
    )
  );

CREATE POLICY event_rounds_tenant_isolation_insert ON event_rounds
  FOR INSERT
  TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_rounds_tenant_isolation_update ON event_rounds
  FOR UPDATE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_rounds_tenant_isolation_delete ON event_rounds
  FOR DELETE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 5.2 RLS Policies for event_round_advancements
CREATE POLICY event_round_advancements_select ON event_round_advancements
  FOR SELECT
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR participant_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM event_team_members tm
      WHERE tm.team_id = event_round_advancements.team_id
        AND tm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
    OR EXISTS (
      SELECT 1 FROM event_rounds r
      WHERE r.id = event_round_advancements.round_id
        AND r.results_published_at IS NOT NULL
    )
  );

CREATE POLICY event_round_advancements_insert ON event_round_advancements
  FOR INSERT
  TO managex_app
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_round_advancements_update ON event_round_advancements
  FOR UPDATE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_round_advancements_delete ON event_round_advancements
  FOR DELETE
  TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 6. Grant runtime DML permissions to managex_app
GRANT SELECT, INSERT, UPDATE, DELETE ON event_rounds TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_round_advancements TO managex_app;
