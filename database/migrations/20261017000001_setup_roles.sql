-- ==============================================================================
-- ManageX Migration 001: Setup Database Roles & Grants
-- Strictly adheres to docs/security.md and ADR-002
-- ==============================================================================

-- 1. Create the runtime application role if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'managex_app') THEN
    CREATE ROLE managex_app WITH LOGIN PASSWORD 'managex_app_password';
  END IF;
END
$$;

-- 2. Strictly enforce least-privilege constraints on managex_app
-- Must NOT be superuser, must NOT create databases/roles, and must NOT bypass RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper = true) THEN
    EXECUTE 'ALTER ROLE managex_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE managex_app NOCREATEDB NOCREATEROLE NOBYPASSRLS';
  END IF;
END
$$;

-- 3. Grant basic connection and schema usage
GRANT CONNECT ON DATABASE managex TO managex_app;
GRANT USAGE ON SCHEMA public TO managex_app;

-- 4. Establish default privileges so future tables and sequences grant DML to managex_app
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO managex_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT USAGE, SELECT ON SEQUENCES TO managex_app;
