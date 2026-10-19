-- ==============================================================================
-- ManageX Database Migration: 20261017000009_events_core.sql
-- Phase 6A: Events & Hackathons Core Data Model, Lifecycle & RLS Baseline
-- Strictly adheres to PRD Section 7.1 (EVT-001, EVT-002, EVT-003) and docs/security.md.
-- ==============================================================================

-- 1. Create Core Events Table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  event_type VARCHAR(32) NOT NULL DEFAULT 'general_event',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  visibility VARCHAR(32) NOT NULL DEFAULT 'private',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  location_type VARCHAR(32) NOT NULL DEFAULT 'in_person',
  location TEXT,
  virtual_url VARCHAR(1024),
  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  capacity INTEGER,
  participant_instructions TEXT,
  created_by_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Structural & Tenant-Isolation Constraints
  CONSTRAINT uq_events_org_slug UNIQUE (organisation_id, slug),
  CONSTRAINT uq_events_id_org UNIQUE (organisation_id, id),
  CONSTRAINT chk_events_type CHECK (event_type IN ('general_event', 'hackathon')),
  CONSTRAINT chk_events_status CHECK (status IN ('draft', 'published', 'registration_closed', 'in_progress', 'completed', 'cancelled', 'archived')),
  CONSTRAINT chk_events_visibility CHECK (visibility IN ('public', 'private')),
  CONSTRAINT chk_events_location_type CHECK (location_type IN ('in_person', 'virtual', 'hybrid')),
  CONSTRAINT chk_events_date_order CHECK (end_at > start_at),
  CONSTRAINT chk_events_reg_window CHECK (registration_closes_at IS NULL OR registration_opens_at IS NULL OR registration_closes_at > registration_opens_at),
  CONSTRAINT chk_events_reg_close_before_start CHECK (registration_closes_at IS NULL OR registration_closes_at <= start_at),
  CONSTRAINT chk_events_capacity CHECK (capacity IS NULL OR capacity > 0)
);

-- 2. Performance & Tenant Indexing Strategy
CREATE INDEX IF NOT EXISTS idx_events_organisation_id ON events (organisation_id);
CREATE INDEX IF NOT EXISTS idx_events_org_status ON events (organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_events_org_start_at ON events (organisation_id, start_at);
CREATE INDEX IF NOT EXISTS idx_events_public_published ON events (status, visibility) WHERE status = 'published' AND visibility = 'public';

-- 3. Row-Level Security (RLS) Configuration
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;

-- 3.1 SELECT Policy: Tenant members, Platform Admins, or Public Published events
CREATE POLICY events_tenant_isolation_select ON events
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (status = 'published' AND visibility = 'public')
  );

-- 3.2 INSERT Policy: Scoped strictly to active organisation context
CREATE POLICY events_tenant_isolation_insert ON events
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 3.3 UPDATE Policy: Scoped strictly to active organisation context
CREATE POLICY events_tenant_isolation_update ON events
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 3.4 DELETE Policy: Scoped strictly to active organisation context
CREATE POLICY events_tenant_isolation_delete ON events
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

-- 4. Grant runtime DML permissions to managex_app
GRANT SELECT, INSERT, UPDATE, DELETE ON events TO managex_app;
