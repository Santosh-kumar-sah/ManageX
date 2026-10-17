-- ==============================================================================
-- ManageX Migration 003: Row-Level Security (RLS) Baseline & Tenant Isolation
-- Strictly adheres to docs/security.md, ADR-001, ADR-002, and PRD Section 11.3
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Enable & Force RLS on all Tenant-Scoped Tables
-- ------------------------------------------------------------------------------
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations FORCE ROW LEVEL SECURITY;

ALTER TABLE organisation_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE organisation_module_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_module_entitlements FORCE ROW LEVEL SECURITY;

ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles FORCE ROW LEVEL SECURITY;

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. Define RLS Policies for managex_app
-- ------------------------------------------------------------------------------

-- (a) Organisations Isolation
DROP POLICY IF EXISTS organisations_tenant_isolation ON organisations;
CREATE POLICY organisations_tenant_isolation ON organisations
  FOR ALL
  TO managex_app
  USING (
    id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (
      NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM organisation_memberships m
        WHERE m.organisation_id = organisations.id
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'active'
      )
    )
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
    OR NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
  );

-- (b) Organisation Memberships Isolation
DROP POLICY IF EXISTS memberships_tenant_isolation ON organisation_memberships;
CREATE POLICY memberships_tenant_isolation ON organisation_memberships
  FOR ALL
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (
      NULLIF(current_setting('app.current_organisation_id', true), '') IS NULL
      AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );

-- (c) Invitations Isolation
DROP POLICY IF EXISTS invitations_tenant_isolation ON invitations;
CREATE POLICY invitations_tenant_isolation ON invitations
  FOR ALL
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );

-- (d) Organisation Module Entitlements Isolation
DROP POLICY IF EXISTS entitlements_tenant_isolation ON organisation_module_entitlements;
CREATE POLICY entitlements_tenant_isolation ON organisation_module_entitlements
  FOR ALL
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );

-- (e) Membership Roles Isolation
DROP POLICY IF EXISTS membership_roles_tenant_isolation ON membership_roles;
CREATE POLICY membership_roles_tenant_isolation ON membership_roles
  FOR ALL
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );

-- (f) Roles Isolation (Custom roles tenant-scoped; Built-in system roles readable by all tenants)
DROP POLICY IF EXISTS roles_tenant_isolation ON roles;
CREATE POLICY roles_tenant_isolation ON roles
  FOR ALL
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (organisation_id IS NULL AND is_system = true)
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid AND is_system = false)
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );

-- (g) Audit Logs Isolation
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  FOR ALL
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (organisation_id IS NULL AND current_setting('app.current_is_platform_admin', true) = 'true')
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (organisation_id IS NULL AND current_setting('app.current_is_platform_admin', true) = 'true')
  );

-- ------------------------------------------------------------------------------
-- 3. Grants & Immutability Protections for managex_app
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO managex_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO managex_app;

-- Strict Immutability of Audit Logs (ADR-012)
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM managex_app;
