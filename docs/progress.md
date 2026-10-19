# ManageX Progress Tracking

This document tracks progress across implementation phases, completed requirements, and current phase gates.

---

## Current Status: Phase 5 Completed (Awaiting Approval to begin Phase 6)

| Phase | Description | Status | Requirements Completed | Gate / Blocker |
|---|---|---|---|---|
| **Phase 0** | Requirements, Repository & Security Design Audit | **COMPLETED** | API-008, OPS-006 (Architecture, Data Dictionary, Security Model, Traceability Matrix, Implementation Plan, Testing Strategy, Deployment Specs, Runbooks, ADRs) | Approved |
| **Phase 1** | Foundation, Application Shell & Design System | **COMPLETED** | UI-001, UI-002, UI-003, UI-004, UI-005, API-006, API-007, OPS-001, OPS-002, OPS-004 (Canonical layout, 20 UI primitives, error states, API client & cold-start handling, health/ready probes, env validation, logger redaction) | Approved |
| **Phase 2** | PostgreSQL Migrations & RLS Baseline | **COMPLETED** | OPS-003, OPS-005, SEC-002, SEC-003, SEC-004, SEC-009, SEC-010 (Migration runner, core schema, restricted `managex_app` role with NOBYPASSRLS, FORCE RLS, transaction helper, live RLS test suite, DB readiness in `/ready`) | Approved |
| **Phase 3** | Authentication & Session Lifecycle | **COMPLETED** | AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008 (User registration, bcrypt hashing, single-use verification tokens, generic auth errors, server-managed sessions with 30m idle / 7d absolute lifetime, CSRF protection, rate limiting, and email abstraction) | Approved |
| **Phase 4** | Organisation Lifecycle & Memberships | **ACCEPTED** | ORG-001, ORG-002, ORG-003, ORG-004, ORG-005, ORG-006, ORG-007, ORG-008, ORG-009, ORG-010 (Atomic org creation with owner role, multi-org membership, workspace switching with client cache reset, 7-day single-use invitations, safe email-matched onboarding, member management, final-owner protection, step-up transfer with password reauth, approved settings updates, leave org guard, and secret-redacted audit logs) | Formally accepted after acceptance review |
| **Phase 5** | Scoped RBAC, Module Catalogue & Audit | **COMPLETED** | RBAC-001, RBAC-002, RBAC-003, RBAC-004, RBAC-005, RBAC-006, RBAC-007, MOD-001, MOD-002, MOD-003, MOD-004, MOD-005, AUD-004, API-004 (Machine-readable permission catalogue, baseline seeded roles, anti-escalation role assignment, sole-owner protection, multi-role aggregation, 3 core MVP modules with independent activation & platform availability check, fail-closed route guards, non-destructive deactivation, bounded audit log querying, Clean Enterprise frontend module/audit/role management) | Awaiting product owner review and approval to begin Phase 6 |
| **Phase 6A** | Events Core & Lifecycle | PENDING | None | Blocked on Phase 5 approval |
| **Phase 6B** | Event Registration & External Participants | PENDING | None | Blocked on Phase 6A |
| **Phase 6C** | Hackathon Teams & URL Submissions | PENDING | None | Blocked on Phase 6B |
| **Phase 6D** | Judge Scoring & Results Publication | PENDING | None | Blocked on Phase 6C |
| **Phase 7A** | Meetings Core, Attendees & Agendas | PENDING | None | Blocked on Phase 5 |
| **Phase 7B** | Confidential Minutes & Action Items | PENDING | None | Blocked on Phase 7A |
| **Phase 7C** | Meetings Full E2E & Access Regression | PENDING | None | Blocked on Phase 7B |
| **Phase 8A** | Projects Core & Membership | PENDING | None | Blocked on Phase 5 |
| **Phase 8B** | Tasks Model, List & Kanban Views | PENDING | None | Blocked on Phase 8A |
| **Phase 8C** | Comments/Activity & Projects E2E | PENDING | None | Blocked on Phase 8B |
| **Phase 9** | Platform Administration Console | PENDING | None | Blocked on Phases 6, 7, 8 |
| **Phase 10** | Hardening, Performance & Security Audit | PENDING | None | Blocked on Phase 9 |
| **Phase 11** | Staging/Production Deployment Readiness | PENDING | None | Blocked on Phase 10 |

---

## Phase 0 Deliverables Summary
- All 99 requirement IDs from `docs/PRD.md` mapped to phase, UI, API, DB, and test criteria in [`requirements-traceability.md`](file:///d:/manageX/docs/requirements-traceability.md).
- Architectural specifications completed in [`architecture.md`](file:///d:/manageX/docs/architecture.md).
- Data model and RLS design completed in [`database.md`](file:///d:/manageX/docs/database.md).
- Threat model and 6-tier authorization pipeline documented in [`security.md`](file:///d:/manageX/docs/security.md).
- Standard JSON envelopes and complete endpoint inventory documented in [`api-contracts.md`](file:///d:/manageX/docs/api-contracts.md).
- Step-by-step phased roadmap documented in [`implementation-plan.md`](file:///d:/manageX/docs/implementation-plan.md).
- Test strategy and high-risk security suites documented in [`testing.md`](file:///d:/manageX/docs/testing.md).
- Hosting topology, env var inventory, and free-tier disclosure in [`deployment.md`](file:///d:/manageX/docs/deployment.md).
- Operational procedures, backup, and recovery in [`runbook.md`](file:///d:/manageX/docs/runbook.md).
- 18 architectural decisions logged in [`decisions/decision-log.md`](file:///d:/manageX/docs/decisions/decision-log.md).
- 18 out-of-scope future suggestions cataloged in [`future-suggestions.md`](file:///d:/manageX/docs/future-suggestions.md).

---

## Phase 1 Deliverables Summary
- Canonical monorepo structure created: `frontend/`, `backend/`, `database/`, `tests/`, `docs/`.
- Frontend workspace: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router v6+.
- Clean Enterprise design system implemented: 20 accessible shared UI primitives in `frontend/src/components/ui/`.
- Public, Workspace, and Platform layout shells and navigational hierarchy implemented.
- Central typed frontend API client with safe Render free-tier cold-start handling (bounded polling, waking banner, mutation auto-replay prevention).
- Backend workspace: Node.js 20+, Express.js, native JavaScript ES Modules (`.js` only).
- Standard JSON envelope handlers (`responses.js`, `errors.js`).
- Structured middleware: `requestId.js` (`X-Request-Id`), deep secret-redacting `logger.js` (`OPS-004`), `cors.js`, `notFoundHandler.js`, `errorHandler.js`.
- Startup environment validation with secret redaction in `env.js` (`OPS-002`).
- Health and readiness endpoints: `GET /api/v1/health` and `GET /api/v1/ready` (`OPS-001`).
  - *Readiness Scope Clarification:* The current `/api/v1/ready` endpoint verifies configured runtime secrets and process-level readiness. It does not verify PostgreSQL connectivity because Phase 1 has no database connection pool. Database readiness verification remains pending and must be implemented during Phase 2, when the database connection pool is established. The database-readiness portion of `OPS-001` is strictly not marked as verified.
  - *Tenant Context Invariant:* Approved canonical organisation context setting remains `app.current_organisation_id`.
- Test suites: Backend tests (`node:test`) and frontend tests (`vitest`) passing 100%. Frontend typecheck (`tsc`) and production build passing with 0 errors.

---

## Phase 2 Deliverables Summary
- **PostgreSQL Migration Workflow (`database/migrate.js`):** Transactional migration runner with checksum verification, deterministic ordering, and failure rollback.
- **Versioned Core Schema Migrations:**
  - `20261017000001_setup_roles.sql`: Creates restricted runtime role `managex_app` with `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`.
  - `20261017000002_core_schema.sql`: Foundational tables (`users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`, `organisations`, `organisation_memberships`, `invitations`, `permissions`, `roles`, `role_permissions`, `membership_roles`, `modules`, `organisation_module_entitlements`, `audit_logs`) with tenant-aware composite foreign keys (`fk_membership_roles_member_tenant`).
  - `20261017000003_rls_policies.sql`: Enables and enforces `FORCE ROW LEVEL SECURITY` across all 7 tenant tables. Grants least-privilege DML (`SELECT, INSERT, UPDATE, DELETE`) to `managex_app` and revokes `UPDATE, DELETE, TRUNCATE` on `audit_logs` (ADR-012 immutability).
  - `20261017000004_seed_reference.sql`: Seeds reference catalogue for modules (`events`, `meetings`, `projects`), scoped permissions (`platform.*`, `org.*`, `event.*`, `meeting.*`, `project.*`), and built-in system roles (`organisation_owner`, `organisation_admin`, `organisation_member`). Zero fake credentials or test tenants.
- **Connection Pool & Bounded Readiness (`backend/src/platform/database/pool.js` & `ready.js`):** Connection pool with graceful shutdown; `/api/v1/ready` now performs bounded active database probe (`SELECT 1` within 3s), returning HTTP 200 with `{ status: 'ready', database: 'connected' }` or HTTP 503 `DATABASE_UNAVAILABLE` without leaking credentials.
- **Transaction-Scoped Tenant Context Helper (`backend/src/platform/database/transaction.js`):** Implements `withTenantTransaction` setting canonical `app.current_user_id`, `app.current_organisation_id`, and `app.current_is_platform_admin` with `is_local = true` on a pinned checked-out client.
- **Automated PostgreSQL Integration Test Suite (`backend/src/platform/database/rls.integration.test.js`):** 11 comprehensive tests executed live against PostgreSQL under `managex_app` runtime role:
  1. Role permissions: verified `rolsuper: false`, `rolbypassrls: false`.
  2. Fail closed on missing context: verified 0 rows returned on unauthenticated queries.
  3. Cross-tenant read isolation: verified Tenant A context cannot see Tenant B rows.
  4. Cross-tenant write isolation: verified inserting Tenant B row in Tenant A context throws RLS `42501`.
  5. Composite foreign key integrity: verified referencing foreign membership throws `23503`.
  6. Connection pool context leak prevention: verified context resets cleanly between transactions.
  7. Audit log immutability: verified `UPDATE` and `DELETE` on `audit_logs` throw `42501`.
  8. Transaction rollback: verified failed operations discard all partial writes.
  9. Migration tracking immutability: verified `SELECT` works but `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` on `schema_migrations` throw `42501`.
  10. System reference data immutability: verified `SELECT` works but DML mutations on `modules`, `permissions`, and `role_permissions` throw `42501`.
  11. Legitimate runtime operations: verified tenant-scoped CRUD operations (`INSERT`, `SELECT`, `UPDATE`, `DELETE`) on application tables function smoothly.
- **Security Hardening Migration (`20261017000005_tighten_runtime_privileges.sql`):**
  - Revoked `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` from `managex_app` on `schema_migrations`, `modules`, `permissions`, and `role_permissions`.
  - Granted `SELECT` on these catalogue and audit tables.
  - Maintained default privileges on future tenant application tables and sequences.

---

## Phase 3 Deliverables Summary
- **Registration with Normalized Email & Bcrypt Hashing (`AUTH-001`):** Server-authoritative Zod validation, email lower-case normalization, and password hashing via bcrypt (work factor 12) per ADR-017.
- **Expiring Single-Use Email Verification Tokens (`AUTH-002`):** Cryptographic 32-byte hex tokens, stored as SHA-256 hashes with 24-hour expiration. Single-use enforcement verified: verified email transitions account status to `active` and prevents token reuse.
- **Secure Login & Logout with Anti-Enumeration Protection (`AUTH-003`):** Constant-time credential checks prevent email existence disclosure; unverified and suspended accounts fail closed (HTTP 403); logout invalidates the session server-side.
- **Password Recovery & Immediate Multi-Session Revocation (`AUTH-004`):** Single-use 60-minute reset tokens stored as SHA-256 hashes; completing reset updates password and immediately revokes all active sessions for that user across all devices.
- **Server-Managed Session Lifecycle (`AUTH-005`):** 30-minute sliding idle window and 7-day absolute lifetime cap, stored in `sessions` table as SHA-256 hashes. Verified via HttpOnly SameSite=Lax session cookies.
- **Rate Limiting (`AUTH-006`):** In-memory sliding window rate-limiting middleware protecting registration, login, and password recovery endpoints.
- **Cookie & CSRF Security (`AUTH-007`):** HttpOnly, SameSite=Lax session cookies; double-submit CSRF token protection with `X-CSRF-Token` header verification on state-changing mutation requests.
- **Email Abstraction (`AUTH-008`):** Shared email service with SMTP support via `nodemailer` and in-memory mailbox fallback for local development/test environments.
- **Automated Test Evidence:** 34 passing backend tests (including 13 comprehensive auth integration tests against PostgreSQL 17) and 8 passing frontend tests.

---

## Phase 4 Deliverables Summary
- **Atomic Organisation Creation & Initial Owner (`ORG-001`):** `POST /api/v1/organisations` creates organisation record, initial active membership, and assigns `organisation_owner` role atomically in a single PostgreSQL transaction with RLS context (`withSystemTransaction`).
- **Multiple Organisation Listing & Scoped Access (`ORG-002`):** `GET /api/v1/organisations` returns only organisations where caller possesses active membership, fully isolated across tenants.
- **Organisation Context & Dynamic Switcher (`ORG-003`):** `OrgContext.tsx` and `WorkspaceLayout.tsx` manage active organisation state, provide seamless switching, and invalidate cached data on switch or logout.
- **Membership Lifecycle & Roster (`ORG-004`, `ORG-007`):** `GET /api/v1/organisations/:orgId/members` displays active roster and pending invites. Statuses (`invited`, `active`, `suspended`, `removed`) guarded with anti-escalation preventing non-owners from modifying owners or granting owner privileges.
- **Expiring Single-Use Email Invitations (`ORG-005`):** `POST /api/v1/organisations/:orgId/invitations` generates 32-byte cryptographically secure tokens, hashes them via SHA-256, enforces 7-day expiration, and dispatches email via `emailService`. `POST .../revoke` revokes pending invitations.
- **Safe Invitation Onboarding & Acceptance (`ORG-006`):** Public inspection endpoint `GET /api/v1/invitations/:token` and atomic acceptance endpoint `POST /api/v1/invitations/:token/accept`. Enforces strict email identity matching (`EMAIL_MISMATCH` 403 on mismatched session) and idempotent membership activation.
- **Step-Up Ownership Transfer (`ORG-008`):** `POST /api/v1/organisations/:orgId/transfer-owner` requires current owner's password reauthentication via bcrypt, swaps target member to `organisation_owner`, and demotes initiator to `organisation_admin` atomically.
- **Approved Settings Management (`ORG-009`):** `PATCH /api/v1/organisations/:orgId` enforces Zod schema validation allowing only approved fields (`name`), protected by `org.edit` permission.
- **Final-Owner Protection & Leave Guard (`ORG-010`):** `POST /api/v1/organisations/:orgId/leave` and membership status updates prevent sole active owner from demoting, suspending, removing, or leaving the organisation (`FINAL_OWNER_PROTECTION` 409).
- **Append-Only Audit Logging (`AUD-001` - `AUD-005`):** Immutable audit trail recorded for all organisation and membership events with automatic redaction of sensitive credentials.
- **Database Migrations Added:** Migration `20261017000006_membership_roles_user_policy.sql` and `20261017000007_refine_membership_roles_user_select.sql` applied. Enforces strict organisation-scoped isolation for all DML and provides a dedicated `FOR SELECT` policy (`membership_roles_user_select`) that safely exposes only the active user's own roles when organisation context is unset.
- **Concurrency & Failure Hardening:** Row-level locks on `organisations` serialize concurrent owner demotions/leaves, preventing 0-owner states. Concurrent invitation acceptances utilize `ON CONFLICT` to eliminate race conditions. Email delivery failures throw `ServiceUnavailableError` (HTTP 503) and rollback un-emailed invitations.
- **Automated Test Evidence:** 58 passing backend tests (including 24 comprehensive organisation lifecycle, concurrency, RLS policy boundary, and email failure integration tests) and 8 passing frontend tests. TypeScript build (`tsc && vite build`) and ESLint pass with 0 errors.

---

## Phase 5 Deliverables Summary
- **RBAC Roles & Central Permission Catalogue (`RBAC-001`, `RBAC-002`, `RBAC-003`):**
  - Seeded 60 permissions across three independent scopes: `platform` (5), `organisation` (14), and `module` (41) via migration `20261017000008_seed_rbac_roles_permissions.sql`.
  - Machine-readable endpoint `GET /api/v1/organisations/:orgId/permissions` returning full catalogue categorized by scope and actions.
  - Seeded 18 baseline system roles with 231 role-permission mappings (including Platform Super Admin, Organisation Owner, Organisation Admin, Organisation Member, plus PRD-defined baseline roles for Events, Meetings, and Projects).
  - Enforced role scope isolation: platform-scoped roles cannot be assigned to organisation members (`INVALID_ROLE_SCOPE` 403).
- **Anti-Escalation & Role Assignment Safety (`RBAC-004`, `RBAC-005`, `RBAC-006`):**
  - Implemented `POST /api/v1/organisations/:orgId/members/:userId/roles` and `DELETE /api/v1/organisations/:orgId/members/:userId/roles/:roleSlug` with least privilege and anti-escalation validation: callers cannot grant roles possessing permissions beyond their own permission set (`INSUFFICIENT_PERMISSIONS` 403).
  - Sole-owner protection enforced on role revocation: removing `organisation_owner` role from the sole active owner is rejected with `FINAL_OWNER_PROTECTION` (409).
  - Module role scoping: module roles granted in Org A remain strictly isolated to Org A.
- **Multi-Role Aggregation (`RBAC-004`):**
  - Updated `requireOrgMembership` middleware to aggregate all assigned roles from `membership_roles` for each member (`req.membership.roles` and `req.membership.permissions`), mapping canonical permission aliases.
  - `listOrganisationMembers` returns deduplicated members with aggregated role references and individual role badges.
- **Module Catalogue & Entitlements (`MOD-001`, `MOD-002`, `MOD-003`, `MOD-004`, `MOD-005`):**
  - Added `is_platform_available BOOLEAN NOT NULL DEFAULT true` to `modules` table.
  - `GET /api/v1/organisations/:orgId/modules` lists all platform modules with independent platform-availability and organisation activation state.
  - `PATCH /api/v1/organisations/:orgId/modules/:moduleKey` allows Organisation Owners/Admins (`org.modules.manage`) to toggle module activation.
  - Deactivation is non-destructive (ADR-016): tables and data remain preserved.
  - Fail-closed route guard middleware `requireModuleEntitlement(moduleSlug)` rejects requests to disabled modules with HTTP 403 (`MODULE_DISABLED` or `MODULE_UNAVAILABLE`).
  - Independent activation with zero billing, credit card, or payment dependencies in MVP (`MOD-005`).
- **Organisation-Scoped Audit Log Querying (`AUD-004`, `API-004`):**
  - Implemented `GET /api/v1/organisations/:orgId/audit-logs` supporting bounded pagination (`page`, `limit` default 20, max 100), total record metadata, and optional filtering by action.
  - Only accessible to Organisation Owners and Admins (`org.audit.view`); non-privileged members fail closed with HTTP 403.
- **Frontend Management Interfaces & Design System Alignment:**
  - `OrgModulesPage.tsx`: Clean Enterprise module management interface with status badges, activation toggles, platform availability warnings, and non-destructive data notices.
  - `OrgAuditLogsPage.tsx`: Append-only audit trail viewer with action badges, actor info, client IP, action filtering, and accessible pagination.
  - `MembersPage.tsx` enhanced: Multi-role badges and "Manage Roles" dialog with real-time assignment, revocation, anti-escalation, and final-owner protection.
  - `WorkspaceLayout.tsx`: Updated sidebar with "Modules & Entitlements" and "Security & Audit Log" navigation links, and dynamic module status indicators.
  - `ModulePlaceholderPage.tsx`: Real-time server-side entitlement check displaying deactivated state and quick link to module settings.
- **Automated Verification & Evidence:**
  - Backend: 71/71 tests passing across 7 suites in `npm test` (including 13 comprehensive Phase 5 tests in `rbac_modules.integration.test.js`).
  - Backend lint: `npm run lint` passes with 0 errors.
  - Frontend: 8/8 tests passing in `vitest`.
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes in 13.29s with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.

