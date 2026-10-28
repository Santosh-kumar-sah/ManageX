-- ==============================================================================
-- ManageX Migration 041: Google Integrations Foundation & Meeting Sync (Phase 1B.2)
-- Strictly adheres to docs/google-meet-integration-plan.md, docs/security.md (SEC-009),
-- and PRD Sections 8.1, 8.2, 20.14.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Create oauth_states table (Single-Use OAuth CSRF & Tenant State Tracking)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_lookup 
  ON oauth_states(token_hash) WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_states_user 
  ON oauth_states(user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_states_org 
  ON oauth_states(organisation_id);

-- ------------------------------------------------------------------------------
-- 2. Create organisation_integrations table (Tenant-Scoped Credential Storage)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organisation_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  envelope_version INT NOT NULL DEFAULT 1,
  key_version VARCHAR(64) NOT NULL DEFAULT '1',
  encrypted_refresh_token TEXT,
  token_iv VARCHAR(64),
  token_auth_tag VARCHAR(64),
  connected_email VARCHAR(255) NOT NULL,
  scopes TEXT[] NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'revoked', 'error')),
  last_error TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_organisation_integrations_provider UNIQUE (organisation_id, provider),
  CONSTRAINT chk_credentials_status CHECK (
    (status = 'connected' AND encrypted_refresh_token IS NOT NULL AND token_iv IS NOT NULL AND token_auth_tag IS NOT NULL)
    OR (status IN ('revoked', 'error'))
  )
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_lookup 
  ON organisation_integrations(organisation_id, provider);

-- ------------------------------------------------------------------------------
-- 3. Extend meetings table with Google Meet Synchronization Columns
-- ------------------------------------------------------------------------------
ALTER TABLE meetings 
  ADD COLUMN IF NOT EXISTS conference_provider VARCHAR(32) NOT NULL DEFAULT 'manual'
    CHECK (conference_provider IN ('manual', 'google_meet', 'none')),
  ADD COLUMN IF NOT EXISTS google_calendar_event_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS google_calendar_etag VARCHAR(255),
  ADD COLUMN IF NOT EXISTS google_conference_request_id UUID,
  ADD COLUMN IF NOT EXISTS google_sync_status VARCHAR(32) NOT NULL DEFAULT 'none'
    CHECK (google_sync_status IN ('none', 'synced', 'pending_create', 'failed_create', 'pending_update', 'failed_reschedule', 'pending_delete', 'failed_cancel', 'abandoned')),
  ADD COLUMN IF NOT EXISTS google_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS google_sync_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_sync_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_sync_claim_token UUID;

CREATE INDEX IF NOT EXISTS idx_meetings_google_event 
  ON meetings(organisation_id, google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_google_sync 
  ON meetings(organisation_id, google_sync_status)
  WHERE google_sync_status != 'none';

-- ------------------------------------------------------------------------------
-- 4. Historical Meeting Data Backfill
-- Canonical rules:
--   - In-person meetings without virtual URL -> provider 'none'
--   - Meetings with existing virtual URL -> provider 'manual'
--   - Virtual meetings without virtual URL -> provider 'manual' (preserves fallback)
-- ------------------------------------------------------------------------------
UPDATE meetings
SET conference_provider = CASE
  WHEN virtual_url IS NOT NULL AND TRIM(virtual_url) <> '' THEN 'manual'
  WHEN location_type = 'in_person' THEN 'none'
  ELSE 'manual'
END,
google_sync_status = 'none'
WHERE google_calendar_event_id IS NULL;

-- ------------------------------------------------------------------------------
-- 5. Enable and Force Row-Level Security (SEC-009 Standard)
-- ------------------------------------------------------------------------------
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states FORCE ROW LEVEL SECURITY;

ALTER TABLE organisation_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_integrations FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 6. Row-Level Security Policies for managex_app (NOBYPASSRLS)
-- ------------------------------------------------------------------------------

-- (a) oauth_states: strictly user-isolated. Users can only consume their own state tokens.
DROP POLICY IF EXISTS oauth_states_user_isolation ON oauth_states;
CREATE POLICY oauth_states_user_isolation ON oauth_states
  FOR ALL TO managex_app
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- (b) organisation_integrations: strictly tenant-isolated via app.current_organisation_id.
DROP POLICY IF EXISTS org_integrations_tenant_isolation ON organisation_integrations;
CREATE POLICY org_integrations_tenant_isolation ON organisation_integrations
  FOR ALL TO managex_app
  USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

-- ------------------------------------------------------------------------------
-- 7. Grant Privileges to managex_app
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_states TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_integrations TO managex_app;
