-- ==============================================================================
-- ManageX Migration 006: Allow Users to View Own Membership Roles
-- Strictly adheres to docs/security.md, ADR-001, ADR-002, and PRD Section 6.2 (ORG-002)
-- ==============================================================================

-- Update membership_roles policy to allow users to read their own membership roles
-- across organisations they belong to when app.current_organisation_id is unset.
DROP POLICY IF EXISTS membership_roles_tenant_isolation ON membership_roles;
CREATE POLICY membership_roles_tenant_isolation ON membership_roles
  FOR ALL
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM organisation_memberships m
      WHERE m.id = membership_roles.membership_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'active'
    )
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR current_setting('app.current_is_platform_admin', true) = 'true'
  );
