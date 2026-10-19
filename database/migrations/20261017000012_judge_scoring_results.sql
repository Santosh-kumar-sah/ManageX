-- ==============================================================================
-- ManageX Migration 012: Judge Assignments, Scoring Criteria, Scores & Results
-- Strictly adheres to PRD Section 7.4 (EVT-008, EVT-009), ADR-009, and docs/security.md
-- ==============================================================================

-- 1. Extend Events table with Results Publication fields
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS results_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS results_published_by_id UUID REFERENCES users(id);

-- Ensure composite uniqueness on event_submissions for tenant-aware foreign keys
ALTER TABLE event_submissions
  ADD CONSTRAINT uq_event_submissions_id_org UNIQUE (organisation_id, id);

-- 2. Create Event Scoring Criteria Table
CREATE TABLE IF NOT EXISTS event_scoring_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_criteria_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_criteria_event_name UNIQUE (event_id, name),
  CONSTRAINT uq_criteria_id_org UNIQUE (organisation_id, id),
  CONSTRAINT chk_criteria_max_score CHECK (max_score > 0 AND max_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_criteria_org_event ON event_scoring_criteria (organisation_id, event_id);
CREATE INDEX IF NOT EXISTS idx_criteria_order ON event_scoring_criteria (event_id, order_index ASC);

-- 3. Create Event Judge Assignments Table
CREATE TABLE IF NOT EXISTS event_judge_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID,
  assigned_by_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_judge_assignments_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_judge_assignments_submission
    FOREIGN KEY (organisation_id, submission_id)
    REFERENCES event_submissions(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_judge_assignments_event_judge_sub
    UNIQUE NULLS NOT DISTINCT (event_id, judge_user_id, submission_id),
  CONSTRAINT uq_judge_assignments_id_org UNIQUE (organisation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_judge_assignments_org_event ON event_judge_assignments (organisation_id, event_id);
CREATE INDEX IF NOT EXISTS idx_judge_assignments_judge ON event_judge_assignments (judge_user_id);
CREATE INDEX IF NOT EXISTS idx_judge_assignments_sub ON event_judge_assignments (submission_id);

-- 4. Create Event Scores Table
CREATE TABLE IF NOT EXISTS event_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  criterion_id UUID NOT NULL,
  judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score NUMERIC(5, 2) NOT NULL,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_scores_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_scores_submission
    FOREIGN KEY (organisation_id, submission_id)
    REFERENCES event_submissions(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_scores_criterion
    FOREIGN KEY (organisation_id, criterion_id)
    REFERENCES event_scoring_criteria(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_scores_judge_sub_crit
    UNIQUE (event_id, submission_id, criterion_id, judge_user_id),
  CONSTRAINT uq_scores_id_org UNIQUE (organisation_id, id),
  CONSTRAINT chk_score_range CHECK (score >= 0 AND score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_scores_org_event ON event_scores (organisation_id, event_id);
CREATE INDEX IF NOT EXISTS idx_scores_submission ON event_scores (submission_id);
CREATE INDEX IF NOT EXISTS idx_scores_judge ON event_scores (judge_user_id);

-- 5. Enable and Force Row-Level Security (RLS)
ALTER TABLE event_scoring_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_scoring_criteria FORCE ROW LEVEL SECURITY;

ALTER TABLE event_judge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_judge_assignments FORCE ROW LEVEL SECURITY;

ALTER TABLE event_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_scores FORCE ROW LEVEL SECURITY;

-- 5.1 Criteria Policies
CREATE POLICY criteria_tenant_isolation_select ON event_scoring_criteria
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY criteria_tenant_isolation_insert ON event_scoring_criteria
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY criteria_tenant_isolation_update ON event_scoring_criteria
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY criteria_tenant_isolation_delete ON event_scoring_criteria
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 5.2 Judge Assignment Policies
CREATE POLICY judge_assignments_tenant_isolation_select ON event_judge_assignments
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY judge_assignments_tenant_isolation_insert ON event_judge_assignments
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY judge_assignments_tenant_isolation_delete ON event_judge_assignments
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 5.3 Scores Policies
CREATE POLICY scores_tenant_isolation_select ON event_scores
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY scores_tenant_isolation_insert ON event_scores
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY scores_tenant_isolation_update ON event_scores
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY scores_tenant_isolation_delete ON event_scores
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 6. Grant runtime DML permissions to managex_app
GRANT SELECT, INSERT, UPDATE, DELETE ON event_scoring_criteria TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_judge_assignments TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_scores TO managex_app;
