-- ManageX Migration 013: Meetings Core, Attendees & Agendas (Phase 7A)
-- Strictly adheres to PRD Section 8.1 (MTG-001, MTG-002, MTG-003, MTG-004), docs/security.md, and docs/architecture.md.

-- 1. Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  location_type VARCHAR(32) NOT NULL DEFAULT 'in_person',
  location TEXT,
  virtual_url TEXT,
  visibility VARCHAR(32) NOT NULL DEFAULT 'organisation',
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  organiser_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_meetings_date_order CHECK (start_at < end_at),
  CONSTRAINT chk_meetings_location_type CHECK (location_type IN ('in_person', 'virtual', 'hybrid')),
  CONSTRAINT chk_meetings_visibility CHECK (visibility IN ('organisation', 'attendees_only')),
  CONSTRAINT chk_meetings_status CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT uq_meetings_id_org UNIQUE (id, organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_meetings_org_status ON meetings(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_meetings_org_start ON meetings(organisation_id, start_at);
CREATE INDEX IF NOT EXISTS idx_meetings_organiser ON meetings(organisation_id, organiser_id);

-- 2. Create meeting_attendees table
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  meeting_id UUID NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  external_email VARCHAR(255),
  role VARCHAR(32) NOT NULL DEFAULT 'participant',
  rsvp_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_meeting_attendees_meeting FOREIGN KEY (meeting_id, organisation_id)
    REFERENCES meetings(id, organisation_id) ON DELETE CASCADE,
  CONSTRAINT chk_attendee_target CHECK (
    (user_id IS NOT NULL AND external_email IS NULL) OR
    (user_id IS NULL AND external_email IS NOT NULL)
  ),
  CONSTRAINT chk_attendee_role CHECK (role IN ('organiser', 'participant', 'viewer', 'guest')),
  CONSTRAINT chk_attendee_rsvp CHECK (rsvp_status IN ('pending', 'accepted', 'declined', 'tentative'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_attendees_internal ON meeting_attendees (meeting_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_attendees_external ON meeting_attendees (meeting_id, external_email) WHERE external_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_attendees_lookup ON meeting_attendees(organisation_id, meeting_id, user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user ON meeting_attendees(organisation_id, user_id);

-- 3. Create meeting_agenda_items table
CREATE TABLE IF NOT EXISTS meeting_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  meeting_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_meeting_agenda_meeting FOREIGN KEY (meeting_id, organisation_id)
    REFERENCES meetings(id, organisation_id) ON DELETE CASCADE,
  CONSTRAINT chk_agenda_duration CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  CONSTRAINT chk_agenda_order CHECK (order_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_meeting_agenda_order ON meeting_agenda_items(organisation_id, meeting_id, order_index ASC);

-- 4. Enable and Force Row-Level Security
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings FORCE ROW LEVEL SECURITY;

ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees FORCE ROW LEVEL SECURITY;

ALTER TABLE meeting_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_agenda_items FORCE ROW LEVEL SECURITY;

-- 4.1 Meetings RLS Policies
CREATE POLICY meetings_tenant_isolation_select ON meetings
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_insert ON meetings
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_update ON meetings
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meetings_tenant_isolation_delete ON meetings
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 4.2 Meeting Attendees RLS Policies
CREATE POLICY meeting_attendees_tenant_isolation_select ON meeting_attendees
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_attendees_tenant_isolation_insert ON meeting_attendees
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_attendees_tenant_isolation_update ON meeting_attendees
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_attendees_tenant_isolation_delete ON meeting_attendees
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 4.3 Meeting Agenda Items RLS Policies
CREATE POLICY meeting_agenda_tenant_isolation_select ON meeting_agenda_items
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_agenda_tenant_isolation_insert ON meeting_agenda_items
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_agenda_tenant_isolation_update ON meeting_agenda_items
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY meeting_agenda_tenant_isolation_delete ON meeting_agenda_items
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 5. Grant runtime DML to managex_app
GRANT SELECT, INSERT, UPDATE, DELETE ON meetings TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_attendees TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_agenda_items TO managex_app;
