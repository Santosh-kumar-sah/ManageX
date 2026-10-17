-- ==============================================================================
-- ManageX Migration 005: Tighten Runtime Role Privileges
-- Strictly adheres to docs/security.md, ADR-002, and Phase 2 Security Audit
-- ==============================================================================

-- 1. Revoke DML and TRUNCATE privileges from managex_app on sensitive system and migration tables
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON schema_migrations FROM managex_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON modules FROM managex_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON permissions FROM managex_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON role_permissions FROM managex_app;

-- 2. Explicitly ensure managex_app has SELECT (read-only) privileges on these tables
GRANT SELECT ON schema_migrations TO managex_app;
GRANT SELECT ON modules TO managex_app;
GRANT SELECT ON permissions TO managex_app;
GRANT SELECT ON role_permissions TO managex_app;

-- 3. Verify and maintain future default privileges:
-- Application tables created in future migrations should still grant SELECT, INSERT, UPDATE, DELETE
-- to managex_app, and SEQUENCES should grant USAGE, SELECT.
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO managex_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT USAGE, SELECT ON SEQUENCES TO managex_app;
