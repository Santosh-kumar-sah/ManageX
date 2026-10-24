# ManageX Database Migrations & Seeds

This directory contains versioned SQL migrations and safe non-production reference data for ManageX.

## Structure
- `migrate.js` — Lightweight transactional SQL migration runner with SHA-256 checksum verification, deterministic timestamp execution, and failure rollback.
- `migrations/` — Sequential, version-controlled pure SQL migration files:
  - `20261017000001_setup_roles.sql`: Creates restricted runtime role `managex_app` with `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`.
  - `20261017000002_core_schema.sql`: Core schema tables (`users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`, `organisations`, `organisation_memberships`, `invitations`, `permissions`, `roles`, `role_permissions`, `membership_roles`, `modules`, `organisation_module_entitlements`, `audit_logs`) and composite foreign keys.
  - `20261017000003_rls_policies.sql`: Enables and enforces `FORCE ROW LEVEL SECURITY` on all tenant-owned tables; grants least-privilege DML to `managex_app`; revokes UPDATE/DELETE/TRUNCATE on `audit_logs`.
  - `20261017000004_seed_reference.sql`: Reference catalogue data for modules, permissions, and built-in system roles. Zero fake customer data or production default credentials.

## Execution
```bash
# Run migrations using configured DATABASE_URL or MIGRATION_DATABASE_URL
npm run migrate

# Seed local demo accounts and sample workspace data
npm run seed
```

The local Docker PostgreSQL setup uses the connection string in `backend/.env`
(by default, PostgreSQL is published on `localhost:5433`). The supported demo
accounts are created by `npm run seed`; the command prints their credentials
after a successful run. Run the backend from the repository root with
`npm run dev:backend`, then run the frontend with `npm run dev:frontend`.

The legacy reference-only user seeder can also be run with:

```bash
node database/seed-demo-users.js
```

It loads the root `.env` file and resolves `bcryptjs` from the backend
workspace.

## Safety Invariants
- Migrations are fully transactional (`BEGIN ... COMMIT`).
- Checksum verification detects any post-deployment tampering with applied files.
- Zero destructive operations in production (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`).
