-- ==============================================================================
-- ManageX Database Migration: 20261017000011_hackathon_teams_submissions.sql
-- Phase 6C: Hackathon Teams & URL Submissions
-- Strictly adheres to PRD Section 7.3 (EVT-006, EVT-007) and ADR-007.
-- ==============================================================================

-- 1. Extend Events Table for Teams & Submissions Configuration
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS team_size_min INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS team_size_max INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS submission_opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_closes_at TIMESTAMPTZ;

-- Constraints on event team sizing and submission window
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_team_size_min') THEN
    ALTER TABLE events ADD CONSTRAINT chk_events_team_size_min CHECK (team_size_min >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_team_size_max') THEN
    ALTER TABLE events ADD CONSTRAINT chk_events_team_size_max CHECK (team_size_max >= team_size_min AND team_size_max <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_sub_window') THEN
    ALTER TABLE events ADD CONSTRAINT chk_events_sub_window CHECK (submission_closes_at IS NULL OR submission_opens_at IS NULL OR submission_closes_at > submission_opens_at);
  END IF;
END $$;

-- 2. Create Hackathon Teams Table
CREATE TABLE IF NOT EXISTS event_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  description TEXT,
  created_by_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_event_teams_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_event_teams_event_name UNIQUE (event_id, name),
  CONSTRAINT uq_event_teams_event_slug UNIQUE (event_id, slug),
  CONSTRAINT uq_event_teams_id_org UNIQUE (organisation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_event_teams_organisation_id ON event_teams (organisation_id);
CREATE INDEX IF NOT EXISTS idx_event_teams_event_id ON event_teams (event_id);

-- 3. Create Hackathon Team Members Table
CREATE TABLE IF NOT EXISTS event_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  team_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  is_owner BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_team_members_team
    FOREIGN KEY (organisation_id, team_id)
    REFERENCES event_teams(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_team_members_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  -- Participant can belong to only ONE team per event (EVT-006)
  CONSTRAINT uq_event_team_members_event_user UNIQUE (event_id, user_id),
  CONSTRAINT uq_event_team_members_team_user UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON event_team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_event ON event_team_members (event_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON event_team_members (user_id);

-- 4. Create Hackathon Team Invitations Table (7-day single-use tokens per ADR-007)
CREATE TABLE IF NOT EXISTS event_team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  team_id UUID NOT NULL,
  invited_email VARCHAR(255) NOT NULL,
  invited_user_id UUID REFERENCES users(id),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  invited_by_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  CONSTRAINT fk_team_invites_team
    FOREIGN KEY (organisation_id, team_id)
    REFERENCES event_teams(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_team_invites_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_team_invites_status CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_team_invites_token ON event_team_invitations (token_hash);
CREATE INDEX IF NOT EXISTS idx_team_invites_team ON event_team_invitations (team_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_email ON event_team_invitations (event_id, invited_email);

-- 5. Create URL-Based Submissions Table (EVT-007)
CREATE TABLE IF NOT EXISTS event_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  team_id UUID,
  submitter_user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  repository_url VARCHAR(1024),
  demo_url VARCHAR(1024),
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_submissions_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_submissions_team
    FOREIGN KEY (organisation_id, team_id)
    REFERENCES event_teams(organisation_id, id) ON DELETE SET NULL,
  CONSTRAINT uq_event_submissions_event_team UNIQUE (event_id, team_id),
  CONSTRAINT chk_event_submissions_status CHECK (status IN ('submitted', 'draft', 'withdrawn')),
  CONSTRAINT chk_event_submissions_repo_scheme CHECK (repository_url IS NULL OR repository_url ~* '^https?://'),
  CONSTRAINT chk_event_submissions_demo_scheme CHECK (demo_url IS NULL OR demo_url ~* '^https?://')
);

CREATE INDEX IF NOT EXISTS idx_event_submissions_event ON event_submissions (event_id);
CREATE INDEX IF NOT EXISTS idx_event_submissions_team ON event_submissions (team_id);
CREATE INDEX IF NOT EXISTS idx_event_submissions_submitter ON event_submissions (submitter_user_id);

-- 6. Row-Level Security Configuration
ALTER TABLE event_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_teams FORCE ROW LEVEL SECURITY;

ALTER TABLE event_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_members FORCE ROW LEVEL SECURITY;

ALTER TABLE event_team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE event_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_submissions FORCE ROW LEVEL SECURITY;

-- 6.1 Policies for event_teams
CREATE POLICY event_teams_select ON event_teams
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM events e 
      WHERE e.id = event_teams.event_id 
        AND e.status = 'published' 
        AND e.visibility = 'public'
    )
  );

CREATE POLICY event_teams_insert ON event_teams
  FOR INSERT
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_teams_update ON event_teams
  FOR UPDATE
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_teams_delete ON event_teams
  FOR DELETE
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 6.2 Policies for event_team_members
CREATE POLICY event_team_members_select ON event_team_members
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM events e 
      WHERE e.id = event_team_members.event_id 
        AND e.status = 'published' 
        AND e.visibility = 'public'
    )
  );

CREATE POLICY event_team_members_insert ON event_team_members
  FOR INSERT
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_team_members_update ON event_team_members
  FOR UPDATE
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_team_members_delete ON event_team_members
  FOR DELETE
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 6.3 Policies for event_team_invitations
CREATE POLICY event_team_invitations_select ON event_team_invitations
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR invited_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

CREATE POLICY event_team_invitations_insert ON event_team_invitations
  FOR INSERT
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_team_invitations_update ON event_team_invitations
  FOR UPDATE
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_team_invitations_delete ON event_team_invitations
  FOR DELETE
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 6.4 Policies for event_submissions
CREATE POLICY event_submissions_select ON event_submissions
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR submitter_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM event_team_members tm 
      WHERE tm.team_id = event_submissions.team_id 
        AND tm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY event_submissions_insert ON event_submissions
  FOR INSERT
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_submissions_update ON event_submissions
  FOR UPDATE
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY event_submissions_delete ON event_submissions
  FOR DELETE
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 7. Grant DML Permissions to managex_app Runtime Role
GRANT SELECT, INSERT, UPDATE, DELETE ON event_teams TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_team_members TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_team_invitations TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_submissions TO managex_app;
