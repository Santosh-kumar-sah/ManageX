-- ==============================================================================
-- ManageX Migration 002: Core Schema Foundation
-- Strictly adheres to docs/database.md, docs/security.md, and PRD Sections 5 & 6
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Users & Global Identity
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(50) NOT NULL DEFAULT 'pending_verification' 
    CHECK (status IN ('pending_verification', 'active', 'suspended', 'deactivated')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index for email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- ------------------------------------------------------------------------------
-- 2. Sessions (Server-side session management)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_idle_expires ON sessions (idle_expires_at);

-- ------------------------------------------------------------------------------
-- 3. Verification & Password Recovery Tokens
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verification_tokens (user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);

-- ------------------------------------------------------------------------------
-- 4. Organisations (Customer Workspaces)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organisations_status ON organisations (status);

-- ------------------------------------------------------------------------------
-- 5. Organisation Memberships
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organisation_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'active' 
    CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_memberships_org_user UNIQUE (organisation_id, user_id),
  CONSTRAINT uq_memberships_id_org UNIQUE (organisation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON organisation_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON organisation_memberships (organisation_id);

-- ------------------------------------------------------------------------------
-- 6. Permissions & Roles
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  scope VARCHAR(50) NOT NULL CHECK (scope IN ('platform', 'organisation', 'module')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  scope VARCHAR(50) NOT NULL CHECK (scope IN ('platform', 'organisation', 'module')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_roles_org_slug UNIQUE (organisation_id, slug),
  CONSTRAINT uq_roles_id_org UNIQUE (organisation_id, id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ------------------------------------------------------------------------------
-- 7. Membership Roles (Tenant-Aware Composite Foreign Key)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_membership_roles_member_tenant 
    FOREIGN KEY (organisation_id, membership_id) 
    REFERENCES organisation_memberships(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_membership_roles UNIQUE (membership_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_membership_roles_org ON membership_roles (organisation_id);

-- ------------------------------------------------------------------------------
-- 8. Organisation Invitations
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invited_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_invitations_id_org UNIQUE (organisation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations (organisation_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations (LOWER(email));

-- ------------------------------------------------------------------------------
-- 9. Modules & Organisation Module Entitlements
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_core BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organisation_module_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_module UNIQUE (organisation_id, module_id),
  CONSTRAINT uq_org_module_id_org UNIQUE (organisation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_org ON organisation_module_entitlements (organisation_id);

-- ------------------------------------------------------------------------------
-- 10. Audit Logs (Immutable, append-only)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC);
