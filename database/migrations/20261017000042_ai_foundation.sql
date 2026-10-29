-- ManageX AI Foundation Migration
-- Sequence: 20261017000042
-- Strictly adheres to docs/managex-ai-implementation-plan.md (Section 8.1),
-- ADR-001, ADR-002, PRD Section 11, and SEC-009.

-- 1. Organisation AI Configuration & Quota Settings
CREATE TABLE IF NOT EXISTS organisation_ai_settings (
    organisation_id UUID PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
    is_ai_enabled BOOLEAN NOT NULL DEFAULT true,
    monthly_token_quota BIGINT NOT NULL DEFAULT 500000,
    max_requests_per_minute INT NOT NULL DEFAULT 20,
    allowed_models TEXT[] DEFAULT ARRAY['google/gemini-2.0-flash-001', 'openai/gpt-4o-mini'],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Immutable AI Usage Records (Metering & Audit Ledger)
-- user_id is nullable (ON DELETE SET NULL), ensuring deletion semantics match column nullability.
CREATE TABLE IF NOT EXISTS ai_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    module_slug VARCHAR(50) NOT NULL,
    feature VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'openrouter',
    model VARCHAR(100) NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'success',
    duration_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance & quota aggregation
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_created ON ai_usage_records(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_status_created ON ai_usage_records(organisation_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_records(user_id, created_at DESC);

-- Enable Row-Level Security
ALTER TABLE organisation_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_records ENABLE ROW LEVEL SECURITY;

-- Grant permissions to managex_app runtime role
GRANT SELECT, INSERT, UPDATE ON organisation_ai_settings TO managex_app;
GRANT SELECT, INSERT ON ai_usage_records TO managex_app;

-- RLS Policies for organisation_ai_settings (strictly tenant-isolated, NO platform bypass)
DROP POLICY IF EXISTS ai_settings_tenant_select ON organisation_ai_settings;
CREATE POLICY ai_settings_tenant_select ON organisation_ai_settings
    FOR SELECT TO managex_app
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

DROP POLICY IF EXISTS ai_settings_tenant_insert ON organisation_ai_settings;
CREATE POLICY ai_settings_tenant_insert ON organisation_ai_settings
    FOR INSERT TO managex_app
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

DROP POLICY IF EXISTS ai_settings_tenant_update ON organisation_ai_settings;
CREATE POLICY ai_settings_tenant_update ON organisation_ai_settings
    FOR UPDATE TO managex_app
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

-- RLS Policies for ai_usage_records (strictly tenant-isolated, append-only)
DROP POLICY IF EXISTS ai_usage_tenant_select ON ai_usage_records;
CREATE POLICY ai_usage_tenant_select ON ai_usage_records
    FOR SELECT TO managex_app
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

DROP POLICY IF EXISTS ai_usage_tenant_insert ON ai_usage_records;
CREATE POLICY ai_usage_tenant_insert ON ai_usage_records
    FOR INSERT TO managex_app
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
