-- ==============================================================================
-- ManageX Database Migration: 20261017000010_event_registrations.sql
-- Phase 6B: Event Registration, Registration Windows & External Participants
-- Strictly adheres to PRD Section 7.2 (EVT-004, EVT-005), docs/security.md, and ADR-003, ADR-008.
-- ==============================================================================

-- 1. Create event_registrations table
CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'registered',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,
  reactivated_at TIMESTAMPTZ,
  custom_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tenant-Aware Composite Foreign Key (ADR-001, ADR-003, ADR-008, Section 3 of database.md)
  CONSTRAINT fk_registrations_event_tenant
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,

  -- Uniqueness constraint: Exactly one registration record per user per event
  CONSTRAINT uq_event_registrations_event_user UNIQUE (event_id, user_id),

  -- Status check constraint: Allowed registration statuses (EVT-005)
  CONSTRAINT chk_event_registrations_status CHECK (status IN ('registered', 'withdrawn'))
);

-- 2. Performance & Tenant-Isolation Indexing Strategy
CREATE INDEX IF NOT EXISTS idx_event_reg_organisation_id ON event_registrations (organisation_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_event_status ON event_registrations (event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_reg_user_id ON event_registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_event_user ON event_registrations (event_id, user_id);

-- 3. Row-Level Security (RLS) Configuration
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations FORCE ROW LEVEL SECURITY;

-- 3.1 SELECT Policy:
-- - Platform admins can read all
-- - Organisation members can read registrations in their tenant
-- - External registrants can read THEIR OWN registration row (EVT-004, ADR-003)
CREATE POLICY event_registrations_select ON event_registrations
  FOR SELECT
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- 3.2 INSERT Policy:
-- Must match tenant organisation context OR be an external registrant registering themselves
CREATE POLICY event_registrations_insert ON event_registrations
  FOR INSERT
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- 3.3 UPDATE Policy:
-- Organisation staff within tenant context OR registrant updating/withdrawing their own registration
CREATE POLICY event_registrations_update ON event_registrations
  FOR UPDATE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- 3.4 DELETE Policy:
-- Strictly blocked for runtime application role (registrations use status 'withdrawn', preserving history)
CREATE POLICY event_registrations_delete ON event_registrations
  FOR DELETE
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
  );

-- 4. Grant runtime application DML privileges
GRANT SELECT, INSERT, UPDATE ON event_registrations TO managex_app;
