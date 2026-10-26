-- ==============================================================================
-- ManageX Database Migration: 20261017000037_meeting_mom_structured.sql
-- Structured Minutes of Meeting (MOM): Discussion Points & Decisions
-- Adheres to PRD §8.2, MTG-005, SEC-009, and tenant RLS invariants.
-- ==============================================================================

-- 1. Create meeting_discussion_points table
CREATE TABLE IF NOT EXISTS meeting_discussion_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_meeting_discussion_points_org_meeting FOREIGN KEY (meeting_id, organisation_id)
    REFERENCES meetings(id, organisation_id) ON DELETE CASCADE,
  CONSTRAINT chk_discussion_order CHECK (order_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_meeting_discussion_points_order
  ON meeting_discussion_points(organisation_id, meeting_id, order_index ASC);

-- 2. Create meeting_decisions table
CREATE TABLE IF NOT EXISTS meeting_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_meeting_decisions_org_meeting FOREIGN KEY (meeting_id, organisation_id)
    REFERENCES meetings(id, organisation_id) ON DELETE CASCADE,
  CONSTRAINT chk_decision_order CHECK (order_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_meeting_decisions_order
  ON meeting_decisions(organisation_id, meeting_id, order_index ASC);

-- 3. Enable and force Row-Level Security
ALTER TABLE meeting_discussion_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_discussion_points FORCE ROW LEVEL SECURITY;

ALTER TABLE meeting_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_decisions FORCE ROW LEVEL SECURITY;

-- 4. RLS Policies for meeting_discussion_points (Strict tenant isolation, SEC-009)
DROP POLICY IF EXISTS meeting_discussion_points_tenant_isolation_select ON meeting_discussion_points;
DROP POLICY IF EXISTS meeting_discussion_points_tenant_isolation_insert ON meeting_discussion_points;
DROP POLICY IF EXISTS meeting_discussion_points_tenant_isolation_update ON meeting_discussion_points;
DROP POLICY IF EXISTS meeting_discussion_points_tenant_isolation_delete ON meeting_discussion_points;

CREATE POLICY meeting_discussion_points_tenant_isolation_select ON meeting_discussion_points
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_discussion_points_tenant_isolation_insert ON meeting_discussion_points
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_discussion_points_tenant_isolation_update ON meeting_discussion_points
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_discussion_points_tenant_isolation_delete ON meeting_discussion_points
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 5. RLS Policies for meeting_decisions (Strict tenant isolation, SEC-009)
DROP POLICY IF EXISTS meeting_decisions_tenant_isolation_select ON meeting_decisions;
DROP POLICY IF EXISTS meeting_decisions_tenant_isolation_insert ON meeting_decisions;
DROP POLICY IF EXISTS meeting_decisions_tenant_isolation_update ON meeting_decisions;
DROP POLICY IF EXISTS meeting_decisions_tenant_isolation_delete ON meeting_decisions;

CREATE POLICY meeting_decisions_tenant_isolation_select ON meeting_decisions
  FOR SELECT
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_decisions_tenant_isolation_insert ON meeting_decisions
  FOR INSERT
  TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_decisions_tenant_isolation_update ON meeting_decisions
  FOR UPDATE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_decisions_tenant_isolation_delete ON meeting_decisions
  FOR DELETE
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 6. Grant DML permissions to restricted runtime application role
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_discussion_points TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_decisions TO managex_app;
