-- ==============================================================================
-- ManageX Migration 019: Platform Administration Controls (PLAT-001 - PLAT-007, SEC-009)
-- Strictly adheres to docs/PRD.md Section 10, docs/security.md Section 4.B, and SEC-009.
-- ==============================================================================

-- 1. Add platform_role column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS platform_role VARCHAR(50) DEFAULT NULL 
  CHECK (platform_role IS NULL OR platform_role IN ('platform_super_admin', 'platform_support_agent'));

-- Synchronize existing is_platform_admin users to platform_super_admin
UPDATE users 
  SET platform_role = 'platform_super_admin' 
  WHERE is_platform_admin = true AND platform_role IS NULL;

-- 2. Seed platform account permissions
INSERT INTO permissions (key, name, description, scope)
VALUES
  ('platform.account.read', 'Read Platform Accounts', 'Inspect user account operational metadata.', 'platform'),
  ('platform.account.manage', 'Manage Platform Accounts', 'Activate or suspend user accounts.', 'platform')
ON CONFLICT (key) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description, scope = EXCLUDED.scope;

-- 3. Map permissions to platform roles
-- Super Admin receives all platform permissions including account management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'platform_super_admin'
  AND p.key IN ('platform.account.read', 'platform.account.manage')
ON CONFLICT DO NOTHING;

-- Support Agent receives account read permission only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.organisation_id IS NULL AND r.slug = 'platform_support_agent'
  AND p.key = 'platform.account.read'
ON CONFLICT DO NOTHING;

-- 4. Grant least-privilege UPDATE on modules.is_platform_available to managex_app (PLAT-004)
GRANT UPDATE (is_platform_available) ON modules TO managex_app;
