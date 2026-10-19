-- ==============================================================================
-- ManageX Migration 007: Refine Membership Roles User Select Policy
-- Strictly adheres to docs/security.md, ADR-001, ADR-002, and PRD Section 6.2 (ORG-002)
-- ==============================================================================

-- 1. Restore strict organisation-only isolation for all DML on membership_roles
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

-- 2. Add dedicated SELECT-only policy allowing users to discover their own active roles
-- exclusively when app.current_organisation_id is unset (e.g. during GET /api/v1/organisations).
DROP POLICY IF EXISTS membership_roles_user_select ON membership_roles;
CREATE POLICY membership_roles_user_select ON membership_roles
  FOR SELECT
  TO managex_app
  USING (
    NULLIF(current_setting('app.current_organisation_id', true), '') IS NULL
    AND EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.id = membership_roles.membership_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
  );
