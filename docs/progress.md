# ManageX Progress Tracking

This document tracks progress across implementation phases, completed requirements, and current phase gates.

---

## Current Status: Phase 9 Accepted | Phase 10 Preflight Complete

| Phase | Description | Status | Requirements Completed | Gate / Blocker |
|---|---|---|---|---|
| **Phase 0** | Requirements, Repository & Security Design Audit | **COMPLETED** | API-008, OPS-006 (Architecture, Data Dictionary, Security Model, Traceability Matrix, Implementation Plan, Testing Strategy, Deployment Specs, Runbooks, ADRs) | Approved |
| **Phase 1** | Foundation, Application Shell & Design System | **COMPLETED** | UI-001, UI-002, UI-003, UI-004, UI-005, API-006, API-007, OPS-001, OPS-002, OPS-004 (Canonical layout, 20 UI primitives, error states, API client & cold-start handling, health/ready probes, env validation, logger redaction) | Approved |
| **Phase 2** | PostgreSQL Migrations & RLS Baseline | **COMPLETED** | OPS-003, OPS-005, SEC-002, SEC-003, SEC-004, SEC-009, SEC-010 (Migration runner, core schema, restricted `managex_app` role with NOBYPASSRLS, FORCE RLS, transaction helper, live RLS test suite, DB readiness in `/ready`) | Approved |
| **Phase 3** | Authentication & Session Lifecycle | **COMPLETED** | AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008 (User registration, bcrypt hashing, single-use verification tokens, generic auth errors, server-managed sessions with 30m idle / 7d absolute lifetime, CSRF protection, rate limiting, and email abstraction) | Approved |
| **Phase 4** | Organisation Lifecycle & Memberships | **ACCEPTED** | ORG-001, ORG-002, ORG-003, ORG-004, ORG-005, ORG-006, ORG-007, ORG-008, ORG-009, ORG-010 (Atomic org creation with owner role, multi-org membership, workspace switching with client cache reset, 7-day single-use invitations, safe email-matched onboarding, member management, final-owner protection, step-up transfer with password reauth, approved settings updates, leave org guard, and secret-redacted audit logs) | Formally accepted after acceptance review |
| **Phase 5** | Scoped RBAC, Module Catalogue & Audit | **ACCEPTED** | RBAC-001, RBAC-002, RBAC-003, RBAC-004, RBAC-005, RBAC-006, RBAC-007, MOD-001, MOD-002, MOD-003, MOD-004, MOD-005, AUD-004, API-004 (Machine-readable permission catalogue, baseline seeded roles, anti-escalation role assignment, sole-owner protection, multi-role aggregation, 3 core MVP modules with independent activation & platform availability check, fail-closed route guards, non-destructive deactivation, bounded audit log querying, Clean Enterprise frontend module/audit/role management) | Formally accepted after acceptance review |
| **Phase 6A** | Events Core & Lifecycle | **ACCEPTED** | EVT-001, EVT-002, EVT-003 (Core event model, UTC instants & IANA timezones, canonical 7-status lifecycle transition engine, draft/published visibility rules, management UI) | Formally accepted after acceptance check |
| **Phase 6B** | Event Registration & External Participants | **ACCEPTED** | EVT-004, EVT-005 (Event registration, capacity limits with transactional concurrency locking, duplicate prevention, cancellation/withdrawal & reactivated re-registration, external participant boundary without org membership, own-registration status, staff participant roster) | Formally accepted after acceptance check |
| **Phase 6C** | Hackathon Teams & URL Submissions | **ACCEPTED** | EVT-006, EVT-007 (Hackathon team model, min/max team sizing 1..100, team invites with 7-day single-use tokens, URL submissions with SSRF protection & submission window guard, serialized concurrent joins & ownership protection) | Formally accepted after acceptance check |
| **Phase 6D** | Judge Scoring & Results Publication | **ACCEPTED** | EVT-008, EVT-009 (Judge assignments, criteria 1..100, private scoring, straight-sum result calculation, shared ranks, results publication) | Formally accepted after acceptance check |
| **Phase 7A** | Meetings Core, Attendees & Agendas | **ACCEPTED** | MTG-001, MTG-002, MTG-003, MTG-004 (Meetings data model, UTC & IANA timezones, canonical 4-status lifecycle, organisation vs attendees_only visibility, internal & external attendees, RSVP management, ordered agendas & atomic reordering) | Formally accepted after acceptance review |
| **Phase 7B** | Confidential Minutes & Action Items | **ACCEPTED** | MTG-005, MTG-006, MTG-007 (Confidential meeting minutes with strict permission gates, action item tracking with assignee status transitions and member validation, invitation/cancellation/reschedule email dispatch without body leaks) | Formally accepted after acceptance review |
| **Phase 7C** | Meetings Full E2E & Access Regression | **ACCEPTED** | MTG-001, MTG-002, MTG-003, MTG-004, MTG-005, MTG-006, MTG-007 (Complete 10 meetings user journeys, multi-tenant ID tampering regression, RLS isolation & context cleanup under managex_app, composite FK enforcement, dynamic permission/module revocation, zero confidential body leak in audit/emails) | Formally accepted |
| **Phase 8A** | Projects Core & Membership | **ACCEPTED** | PRJ-001, PRJ-002 (Project model, start & target dates, priorities, canonical 5-status lifecycle, resource-scoped project memberships, owner invariant, clean enterprise UI) | Formally accepted |
| **Phase 8B** | Tasks Model, List & Kanban Views | **ACCEPTED** | PRJ-003, PRJ-004, PRJ-005, PRJ-006 (Task data model, composite FK tenant isolation, canonical 5-status state machine, assignee validation, member removal guards, Kanban & List views, server-side filtering & due-date calculations) | Formally accepted after acceptance review |
| **Phase 8C** | Comments/Activity & Projects E2E | **ACCEPTED** | PRJ-007, PRJ-008 (Plain-text task comments with bounds & moderation, soft deletion preserving author/timestamp, archived project lockout, chronological activity timeline, no comment bodies in audit logs, tenant isolation under managex_app) | Formally accepted after acceptance review |
| **Phase 9** | Platform Administration Console | **ACCEPTED** | PLAT-001, PLAT-002, PLAT-003, PLAT-004, PLAT-005, PLAT-006, PLAT-007, SEC-009 (Platform console namespace & layout segregation, global account listing & suspension without secret exposure, customer workspace operational inspection & non-destructive suspension, fixed 3-module availability management, least-privilege Support Agent role, zero support ticketing scope, immutable platform audit trail, NOBYPASSRLS runtime isolation) | Formally accepted after acceptance review |
| **Phase 10** | Hardening, Performance & Security Audit | **COMPLETED** | SEC-001, SEC-002, SEC-005, SEC-006, SEC-007, SEC-008, OPS-005, UI-005 (Bcrypt factor 12 & login timing attack mitigation, 6-tier pipeline, SQLi/XSS/SSRF fuzzing, production security headers & restrictive CORS, 100KB payload limit, rate limiting, zero secret leaks, exhaustive cross-tenant RLS CRUD matrix under managex_app, connection pool resilience, p95 read < 200ms, p95 write < 500ms, 1000-row pagination < 2.0s with index scan, WCAG 2.2 AA accessibility verification) | Ready for Phase 10 Acceptance Review |
| **Phase 11** | Staging/Production Deployment Readiness | PENDING | None | Blocked on Phase 10 Acceptance |

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

---

## Phase 6A Deliverables Summary (ACCEPTED)
- **Core Event Data Model (`EVT-001`):**
  - Migration `20261017000009_events_core.sql` applied. Created `events` table with composite foreign key referencing `organisations(id)`.
  - Stored timestamps in standard UTC ISO 8601 with explicit IANA timezone column (`timezone VARCHAR(64) NOT NULL`).
  - Check constraints for date ordering (`start_at < end_at`), registration window ordering (`registration_opens_at < registration_closes_at`), and valid event types (`general_event`, `hackathon`), visibilities (`public`, `private`), and location types (`in_person`, `virtual`, `hybrid`).
  - Terminal state edit locking: `completed` and `archived` events cannot be updated via API.
- **Canonical 7-Status Lifecycle State Machine (`EVT-002`):**
  - PRD §7.2 canonical statuses: `draft`, `published`, `registration_closed`, `in_progress`, `completed`, `cancelled`, `archived`.
  - Concurrency-safe transition validation with `SELECT ... FOR UPDATE` row-level locks on `events`.
  - Valid transition matrix strictly enforced: illegal jumps (e.g. `draft` -> `completed`) fail closed with HTTP 409 Conflict.
- **Visibility and Draft Filtering (`EVT-003`):**
  - `GET /api/v1/organisations/:orgId/events`: draft and private events strictly hidden from non-organisers without `event.read_draft` permission.
  - `GET /api/v1/events` and `GET /api/v1/events/public`: unauthenticated public endpoint strictly filters for `status = 'published'` and `visibility = 'public'`.
- **Frontend Management UI:**
  - `EventsListPage.tsx`: Clean Enterprise event listing with status filters, badges, and creation modal.
  - `EventDetailPage.tsx`: Lifecycle state machine action buttons, timezone & venue cards, and event overview.
- **Verification Evidence:**
  - Suite `backend/src/platform/events/events.integration.test.js`: 13/13 passing tests verifying date ordering, timezone validation, 7-state transitions, invalid transition rejection, edit lockout on terminal states, draft hiding, and public listing filtering.

---

## Phase 6B Deliverables Summary (COMPLETED)
- **Event Registration Data Model (`EVT-004`, `EVT-005`):**
  - Migration `20261017000010_event_registrations.sql` created and applied.
  - Created `event_registrations` table with composite foreign key `(organisation_id, event_id) REFERENCES events(organisation_id, id) ON DELETE RESTRICT`.
  - Unique constraint `uq_event_registrations_event_user` (`event_id, user_id`), status constraint `chk_event_registrations_status` (`registered`, `withdrawn`), and timestamps (`registered_at`, `withdrawn_at`, `reactivated_at`).
  - Enabled and forced PostgreSQL Row-Level Security with policies for SELECT, INSERT, UPDATE, DELETE, granting DML to `managex_app`.
- **Registration Workflow & Window Rules (`EVT-004`, `EVT-005`, ADR-008):**
  - Implemented `getEffectiveRegistrationWindow(event)`: `registration_opens_at` defaults to event creation/publication; `registration_closes_at` defaults to event `start_at`.
  - Status check: only `published` events accept registrations; `draft`, `registration_closed`, `in_progress`, etc., reject registration with HTTP 409 Conflict.
  - Window check: registration before opening or after closing is rejected with HTTP 409 Conflict.
- **Transactional Capacity & Concurrency Locking (`EVT-005`):**
  - `SELECT ... FOR UPDATE` row-level lock on `events` inside `withOrgTransaction`.
  - Active registrations counted (`WHERE status = 'registered'`). If `activeCount >= capacity`, registration is rejected with HTTP 409 Conflict (`EVENT_FULL`).
  - Concurrent registration attempts are serialized under row locks.
- **Duplicate Prevention & Reactivation (`EVT-004`):**
  - If user is already actively registered, returns HTTP 409 Conflict (`ALREADY_REGISTERED`).
  - If user previously withdrew, reactivates registration: status updated to `registered`, `reactivated_at = NOW()`, preserving initial `registered_at` timestamp.
- **Withdrawal & Cancellation (`EVT-005`):**
  - `POST /api/v1/organisations/:orgId/events/:eventId/withdraw`: transitions status to `withdrawn` while registration window is open, recording `withdrawn_at`.
  - Once registration window closes, withdrawals are blocked.
- **External Participant Isolation Boundary (`EVT-004`, ADR-003):**
  - Middleware `resolveOrgContext` resolves organisation context and verifies organisation is active without requiring organisation membership.
  - External participants register and view their own registration using verified user session.
  - Strict tenant isolation: external participants receive NO organisation membership and are rejected with HTTP 403 Forbidden from accessing general organisation endpoints (`/organisations/:orgId`).
- **Staff Participant Roster (`EVT-004`, `EVT-005`):**
  - `GET /api/v1/organisations/:orgId/events/:eventId/participants`: requires organisation membership with `event.view`.
  - Supports bounded pagination (`page`, `limit`), search by user name/email, and status filtering (`registered`, `withdrawn`). Returns active registration count and capacity summary.
- **Frontend Registration & Roster Experience:**
  - `EventDetailPage.tsx` updated with:
    - Real-time registration card displaying effective window (opens/closes) and status badge.
    - "Register for Event" button for verified users.
    - "Withdraw Registration" button with confirmation dialog.
    - "Re-register" button for withdrawn users.
    - Capacity and slot indicator (e.g., active registrations vs capacity).
    - Event Staff "Participants Roster" with search, filter tabs (All, Active, Withdrawn), registrant table with avatar and timestamps, and accessible pagination.
- **Automated Verification & Evidence:**
  - Backend: 97/97 tests passing across 9 test suites in `npm test` (including 13 comprehensive registration tests in `registrations.integration.test.js`).
  - Frontend: 8/8 tests passing in `vitest`.
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors.

---

## Phase 6C Deliverables Summary (ACCEPTED)

- **Database Migration 011 (`20261017000011_hackathon_teams_submissions.sql`):**
  - Extended `events` table with `team_size_min` (default 1), `team_size_max` (default 10, max constraint 100), `submission_opens_at`, `submission_closes_at`.
  - Created `event_teams`: `(id, organisation_id, event_id, name, slug, description, created_by_id, created_at, updated_at)` with `UNIQUE(event_id, slug)`.
  - Created `event_team_members`: `(id, organisation_id, event_id, team_id, user_id, is_owner, joined_at)` with `UNIQUE(event_id, user_id)` enforcing that a participant can belong to at most one team per event.
  - Created `event_team_invitations`: `(id, organisation_id, event_id, team_id, invited_email, token_hash, status, expires_at)` with 7-day single-use invitation lifecycle.
  - Created `event_submissions`: `(id, organisation_id, event_id, team_id, submitter_user_id, title, description, repository_url, demo_url, custom_fields, status)`.
  - Enabled and forced PostgreSQL RLS across all new tables with DML grants to `managex_app`.
- **Hackathon Team Lifecycle (`EVT-006`, ADR-007):**
  - Team creation restricted to `hackathon` event type and active registered participants.
  - Team creator automatically becomes the team owner (`is_owner = true`).
  - Single team membership constraint enforced at database and application level (`UNIQUE(event_id, user_id)`).
  - Single-use 7-day invitation tokens generated with SHA-256 hash storage; invitee must be a registered participant.
  - Capacity limits: teams strictly cannot exceed `team_size_max`.
  - Leaving/removing team members with ownership safeguards.
- **URL-Based Submissions & SSRF Protection (`EVT-007`):**
  - Strictly URL-based submissions (`repository_url`, `demo_url`) without file blobs.
  - URL scheme validated strictly for `http:` and `https:`.
  - SSRF invariant: backend never fetches, proxies, or pings submitted URLs; stored purely as textual links.
  - Submission window enforcement: submissions accepted only between `submission_opens_at` and `submission_closes_at`.
  - Team-owned submission: any active team member can create or edit the team's submission during the open window.
- **Frontend Experience (`EventDetailPage.tsx`):**
  - Dynamic "Hackathon Teams" card for `eventType === 'hackathon'`.
  - "Create Team" dialog with name, slug, and description inputs.
  - "Invite Team Member" dialog with invitation link generator.
  - "Leave Team" button with confirmation modal.
  - "Project Submissions" card showing current active team submission, submission window status, repository link, demo URL, and timestamp.
  - "Submit Project" / "Edit Submission" modal with client-side URL validation.
- **Automated Verification & Evidence:**
  - Backend: 115/115 tests passing across 10 test suites in `npm test` (including 18 comprehensive Phase 6C integration tests in `teams_submissions.integration.test.js`).
  - Frontend: 8/8 tests passing in `vitest`.
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors.

---

## Phase 6D Deliverables Summary (ACCEPTED)

- **Database Migration 012 (`20261017000012_judge_scoring_results.sql`):**
  - Extended `events` table with `results_published_at TIMESTAMPTZ` and `results_published_by_id UUID`.
  - Added composite foreign key constraint `uq_event_submissions_id_org` to `event_submissions` for tenant-safe composite foreign keys.
  - Created `event_scoring_criteria`: `(id, organisation_id, event_id, name, description, order_index, max_score, created_at, updated_at)` with `max_score > 0 AND max_score <= 100`, `UNIQUE(event_id, name)`.
  - Created `event_judge_assignments`: `(id, organisation_id, event_id, judge_user_id, submission_id, assigned_by_id, created_at)` with `UNIQUE NULLS NOT DISTINCT (event_id, judge_user_id, submission_id)`.
  - Created `event_scores`: `(id, organisation_id, event_id, submission_id, criterion_id, judge_user_id, score, feedback, created_at, updated_at)` with `score >= 0 AND score <= 100`, `UNIQUE (event_id, submission_id, criterion_id, judge_user_id)`.
  - Enabled and forced PostgreSQL RLS across all new tables with DML grants to `managex_app`.
- **Criteria & Judge Assignments (`EVT-008`):**
  - Configurable scoring criteria with individual max scores (1..100) managed by event managers/admins (`event.edit`).
  - Edit lockout safeguard: criteria cannot be added or deleted once scoring has started (`SCORING_ALREADY_STARTED` 409).
  - Flexible judge assignment supporting both global event-wide evaluation and submission-specific assignment (`event.participant.manage`).
- **Private Scoring & Judge Assigned Work (`EVT-008`):**
  - Judges list and view ONLY their assigned submissions and scoring fields (`GET /api/v1/organisations/:orgId/events/:eventId/judge-work`).
  - Unassigned judges or external non-members cannot query judge work or submit scores.
  - Score validation: each criterion score strictly bounded between 0 and configured `maxScore` with optional feedback.
  - Confidentiality invariant: unpublished scores and judge feedback remain strictly private and hidden from participants and public visitors.
- **Controlled Result Calculation & Publication (`EVT-009`, ADR-009):**
  - Straight sum of criterion scores across assigned judges; score weights avoided for MVP simplicity.
  - Standard competition ranking with shared ranks for tied scores; no arbitrary or hidden tie-breakers.
  - Completeness validation: publication is strictly blocked with HTTP 409 (`INCOMPLETE_EVALUATION`) until all assigned judges submit scores for all required criteria on all submissions.
  - Publication controls: authorised event managers (`event.result.publish`) can review calculated results, publish official rankings, and unpublish if needed.
  - Public visibility: once published, official rankings, team names, project titles, and total scores become accessible via public endpoints (`/api/v1/events/:eventId/results`).
  - Immutable audit trail recorded for all criteria mutations, judge assignments, score submissions, and result publication/unpublication.
- **Frontend Experience (`EventDetailPage.tsx`):**
  - Leaderboard & Results card: Displays official published rankings with rank badges, team names, project links, total score, and Publish/Unpublish controls with confirmation dialogs.
  - Judge Evaluation Work card: Displays assigned submissions to judges, completion status, and "Score Submission" modal with real-time numeric inputs and feedback textareas.
  - Criteria & Judge Assignments management card: Displays configured criteria and assigned judges with "Add Criterion" dialog and "Assign Judge" dialog.
- **Automated Verification & Evidence:**
  - Backend: 135/135 tests passing across 11 test suites in `npm test` (including 20 comprehensive Phase 6D integration tests in `judging_results.integration.test.js`).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors in 13.28s.

---

---

## Phase 7A Deliverables Summary (ACCEPTED)
- **Database Migration (`20261017000013_meetings_core.sql`):**
  - Created `meetings`: `(id, organisation_id, title, description, start_at, end_at, timezone, location_type, location, virtual_url, visibility, status, organiser_id, created_by_id, created_at, updated_at)` with `CHECK (start_at < end_at)`, canonical statuses `('scheduled', 'in_progress', 'completed', 'cancelled')`, visibility `('organisation', 'attendees_only')`, and composite unique key `(id, organisation_id)`.
  - Created `meeting_attendees`: `(id, organisation_id, meeting_id, user_id, external_email, role, rsvp_status, invited_at, responded_at, created_at, updated_at)` with FK cascade to `meetings`, roles `('organiser', 'participant', 'guest')`, RSVP statuses `('pending', 'accepted', 'declined', 'tentative')`, and partial unique indexes `uq_meeting_attendees_internal` on `(meeting_id, user_id) WHERE user_id IS NOT NULL` and `uq_meeting_attendees_external` on `(meeting_id, external_email) WHERE external_email IS NOT NULL`.
  - Created `meeting_agenda_items`: `(id, organisation_id, meeting_id, title, description, duration_minutes, order_index, created_by_id, created_at, updated_at)` with FK cascade to `meetings`.
  - Enabled and forced PostgreSQL RLS across all 3 tables with DML granted to restricted role `managex_app`.
- **Backend Services & Lifecycle Engine (`MTG-001`, `MTG-002`, PRD §8.1):**
  - Canonical 4-status lifecycle: `scheduled` -> `['in_progress', 'completed', 'cancelled']`, `in_progress` -> `['completed', 'cancelled']`. Terminal state enforcement prevents transitions or edits on `completed` and `cancelled` meetings.
  - Explicit IANA timezone validation (`Intl.DateTimeFormat`) and UTC timestamp storage with date ordering (`start_at < end_at`).
  - Automatic attendee registration: Organiser is automatically added as an accepted attendee upon creation.
- **Attendance & Visibility Access Control (`MTG-003`, PRD §8.3):**
  - `organisation` meetings are visible to all active members of the tenant.
  - `attendees_only` meetings are restricted: ordinary non-attendee members receive 403 on detail queries and have records excluded from list queries.
  - Internal members and external guests can be invited as attendees with duplicate prevention.
  - RSVP management: Attendees can update their status (`accepted`, `declined`, `tentative`).
  - Sole organiser protection: Removing the meeting's sole organiser is rejected with 409 `CANNOT_REMOVE_ORGANISER`.
- **Structured Agendas (`MTG-004`, PRD §8.2):**
  - Ordered agenda items with title, duration in minutes, and description.
  - Atomic reordering via `PUT /api/v1/organisations/:orgId/meetings/:meetingId/agenda/reorder`.
- **Frontend Experience (`MeetingsPage.tsx`, `MeetingDetailPage.tsx`, `ScheduleMeetingDialog.tsx`):**
  - Meetings list with filter tabs (Upcoming, Past, All), status filter, title search, and meeting cards with badges, formatted date/time in timezone, location link, attendee count, and agenda count.
  - Schedule meeting modal with IANA timezone selector, date range validation, location options, and visibility controls.
  - Detail page with lifecycle transition actions (Start, Complete, Cancel), RSVP response actions, attendees roster with invite dialog, and ordered agenda with up/down reordering.
- **Automated Verification & Evidence:**
  - Backend: 156/156 tests passing across 12 test suites in `npm test` (including 21 comprehensive Phase 7A integration tests in `meetings.integration.test.js`).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors in 23.67s.

---

## Phase 7B Deliverables Summary (COMPLETED)
- **Database Migration (`20261017000014_meeting_notes_actions.sql`):**
  - Created `meeting_notes`: `(id, organisation_id, meeting_id, content, created_by_id, updated_by_id, created_at, updated_at)` with `UNIQUE(meeting_id)`, FK cascade to `meetings(id, organisation_id)`, RLS enabled & forced, DML granted to restricted role `managex_app`.
  - Created `meeting_action_items`: `(id, organisation_id, meeting_id, title, description, assignee_id, due_date, priority, status, agenda_item_id, created_by_id, created_at, updated_at)` with FK cascade to `meetings(id, organisation_id)`, `priority IN ('low', 'medium', 'high', 'urgent')`, `status IN ('open', 'in_progress', 'done', 'cancelled')`, RLS enabled & forced, DML granted to restricted role `managex_app`.
- **Confidential Minutes Access Control (`MTG-005`, PRD §8.2, ADR-014):**
  - Invariant enforced: Attendee status alone does NOT grant access to confidential minutes. Non-permitted attendees attempting `GET /notes` receive 403 `FORBIDDEN_NOTES_ACCESS` and attempting `PUT /notes` receive 403 `FORBIDDEN_NOTES_MANAGE`.
  - Only meeting organiser and users with `meeting.notes.read` / `meeting.notes.manage` / `org.admin` / `org.owner` can read or author notes.
  - Auditing privacy invariant: Note bodies are strictly excluded from audit log metadata (`metadata: { meetingId, length }`).
  - Cancelled meetings cannot author or edit minutes (409 `MEETING_CANCELLED`).
  - Content length validation: bounded from 1 to 50,000 characters.
- **Action Items & Canonical Transitions (`MTG-006`, PRD §8.2):**
  - Assignee validation: Assignee must be an active member of the host organisation (rejected with 422 `VALIDATION_ERROR` if not an active member).
  - Source agenda validation: If specified, agenda item must belong to the same meeting and organisation (422 `VALIDATION_ERROR`).
  - Canonical lifecycle: `open` -> `['in_progress', 'done', 'cancelled']`, `in_progress` -> `['open', 'done', 'cancelled']`.
  - Terminal states: `done` and `cancelled` action items cannot be transitioned (locked with 409 `ACTION_ITEM_TERMINAL_STATE`).
  - Assignee restricted mutations: Assignees without manager permissions can ONLY update the `status` of their assigned action item; mutating management fields (`title`, `assigneeId`, `priority`, etc.) is rejected with 403 `FORBIDDEN_ACTION_FIELD_UPDATE`.
  - Manager/Organiser capabilities: Update full metadata, reassign active members, or delete action items with audit logging.
- **Email Notifications & Invitations (`MTG-007`, PRD §8.3, ADR-010):**
  - Reused existing email abstraction (`sendEmail` in `backend/src/platform/email/emailService.js`).
  - `POST /api/v1/organisations/:orgId/meetings/:meetingId/send-invites`: Dispatches structured meeting invitation emails with dates, timezone, location, and organiser details to pending attendees.
  - Safe failure handling: Delivery errors are logged safely without aborting database transactions, returning delivery logs with `sentCount` and `failedCount`.
  - Automatic status notifications:
    - Rescheduling (`startAt` or `endAt` updated): Dispatches `Updated: <Meeting Title>` email notices to all active attendees.
    - Cancellation (meeting status transitioned to `cancelled`): Dispatches `Cancelled: <Meeting Title>` email notices to all active attendees.
- **Frontend Experience (`MeetingDetailPage.tsx`, `types/meetings.ts`):**
  - Added "Send Invitations" button in the meeting header for scheduled meetings with delivery feedback banner.
  - Implemented Tab 3 ("Minutes & Notes"):
    - Displays confidentiality shield card when viewer lacks permission (`FORBIDDEN_NOTES_ACCESS`).
    - Confidential Markdown/text editor with character counter (up to 50,000 chars), author and last-updated metadata, save button, and cancellation archive state.
  - Implemented Tab 4 ("Action Items"):
    - Action item count badge in tab navigation.
    - Action items roster displaying priority badges, interactive status updater buttons, assignee info, due dates, and linked agenda topics.
    - Terminal state badges when done or cancelled.
    - Delete button for organisers/managers.
    - "Add Action Item" modal with member dropdown, priority selector, due date picker, source agenda topic selector, and description.
- **Automated Verification & Evidence:**
  - Backend: 165/165 tests passing across 12 test suites in `npm test` (including 30 comprehensive Phase 7 integration tests in `meetings.integration.test.js`).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors in 23.66s.

---

## Phase 8A Deliverables Summary (COMPLETED)
- **Database Migration (`20261017000015_projects_core.sql`):**
  - Created `projects`: `(id, organisation_id, name, description, status, priority, owner_id, start_date, target_date, created_by_id, created_at, updated_at)` with `CHECK (start_date IS NULL OR target_date IS NULL OR start_date <= target_date)`, canonical statuses `('planning', 'active', 'on_hold', 'completed', 'archived')`, priorities `('low', 'medium', 'high', 'urgent')`, and composite unique keys `(id, organisation_id)` & `(organisation_id, id)`.
  - Created `project_members`: `(id, organisation_id, project_id, user_id, role, joined_at, created_at, updated_at)` with FK cascade to `projects(id, organisation_id)` and `organisation_memberships(organisation_id, user_id)`, roles `('manager', 'contributor', 'viewer')`, and unique constraint `(project_id, user_id)`.
  - Enabled and forced PostgreSQL RLS across both tables with full DML permissions granted to restricted runtime role `managex_app`.
- **Backend Services & Lifecycle Engine (`PRJ-001`, `PRJ-002`, PRD §9.1):**
  - Canonical 5-status lifecycle:
    - `planning` -> `['active', 'on_hold', 'archived']`
    - `active` -> `['on_hold', 'completed', 'archived']`
    - `on_hold` -> `['active', 'completed', 'archived']`
    - `completed` -> `['archived']`
    - `archived` -> `[]` (Terminal immutable state; edits and transitions blocked).
  - Explicit priority validation (`low`, `medium`, `high`, `urgent`) with default `medium`.
  - Automatic owner membership: Project creator/owner is automatically enrolled as `manager` in `project_members`.
  - Owner invariants enforced:
    - Owner must be an active member of the organisation.
    - Owner cannot be removed from project members without atomic transfer of ownership.
    - Owner cannot be demoted to non-manager role while remaining owner.
    - Changing project owner automatically adds new owner as `manager` if not already present, or promotes them to `manager`.
  - Resource-scoped project access: Non-members of a project without `project.view_all` / `org.admin` / `org.owner` receive `403 PROJECT_ACCESS_DENIED`.
  - Tenant transaction consistency: `fetchFullProject` reuses transactional client preventing `READ COMMITTED` race or visibility mismatches.
- **Project Members & Access Management (`PRJ-001`, PRD §9.1):**
  - Endpoints implemented:
    - `GET /api/v1/organisations/:orgId/projects` (with `status`, `priority`, `page`, `limit` filtering)
    - `POST /api/v1/organisations/:orgId/projects`
    - `GET /api/v1/organisations/:orgId/projects/:projectId`
    - `PATCH /api/v1/organisations/:orgId/projects/:projectId`
    - `PATCH /api/v1/organisations/:orgId/projects/:projectId/status`
    - `GET /api/v1/organisations/:orgId/projects/:projectId/members`
    - `POST /api/v1/organisations/:orgId/projects/:projectId/members`
    - `PATCH /api/v1/organisations/:orgId/projects/:projectId/members/:userId`
    - `DELETE /api/v1/organisations/:orgId/projects/:projectId/members/:userId`
  - Cross-tenant validation: Assigning owners or members outside the organisation is rejected (`422 INVALID_OWNER` / `422 INVALID_MEMBER`).
- **Frontend Experience (`ProjectsPage.tsx`, `ProjectDetailPage.tsx`, `CreateProjectDialog.tsx`):**
  - Projects list with status and priority filter tabs, text search, project cards with status/priority badges, owner info, date ranges, and member count.
  - Create project modal with name, description, priority selector, target dates, and owner picker from active org members.
  - Detail page with lifecycle transition actions (Start, Put On Hold, Mark Completed, Archive), project overview card, and Members roster tab.
  - In-place member role management (promote/demote between manager, contributor, viewer) and member removal with owner guard.
  - "Add Member" modal allowing selection of any active organisation member with assigned role.
  - Phase 8B Tasks tab placeholder cleanly prepared for Phase 8B.
  - Live navigation link in Workspace sidebar with real-time module entitlement awareness.
- **Automated Verification & Evidence:**
  - Integration suite `projects.integration.test.js`: 18/18 passing tests covering creation, validation, lifecycle transitions, terminal states, member management, owner invariants, tenant isolation, and RLS policies.
  - Full backend test suite: 202/202 passing tests across 14 test suites in `npm test` (0 failures).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors in 6.53s.

---

## Phase 8B Deliverables Summary (Tasks, Statuses, Kanban & Filtering)
- **Database Schema & Migrations (`database/migrations/20261017000016_tasks_core.sql`, `20261017000017_tasks_rls_refinement.sql`):**
  - Created `tasks` table with columns: `id`, `organisation_id`, `project_id`, `title`, `description`, `status`, `priority`, `assignee_id`, `start_date`, `due_date`, `created_by_id`, `created_at`, `updated_at`, `deleted_at`, `deleted_by_id`.
  - Check constraints: canonical statuses `('backlog', 'todo', 'in_progress', 'blocked', 'done')` (no cancelled status), priorities `('low', 'medium', 'high', 'urgent')`, and date ordering `CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)`.
  - Composite foreign keys: `(project_id, organisation_id) REFERENCES projects(id, organisation_id) ON DELETE CASCADE`.
  - Foreign key to assignee: `FOREIGN KEY (organisation_id, assignee_id) REFERENCES organisation_memberships(organisation_id, user_id) ON DELETE SET NULL`.
  - Enabled and forced PostgreSQL RLS with permissive tenant policies (`tenant_isolation_tasks`) granting `ALL` DML to `managex_app`.
- **Backend Task Service & Business Logic (`backend/src/platform/projects/projectService.js`, `projectLifecycle.js`):**
  - Canonical 5-status task lifecycle state machine:
    - `backlog` -> `['todo']`
    - `todo` -> `['backlog', 'in_progress']`
    - `in_progress` -> `['blocked', 'done']`
    - `blocked` -> `['in_progress']`
    - `done` -> `['in_progress']` (strictly requires manager/admin role or `project.edit` permission).
  - Assignee validation: Assignee must be an active member of both organisation and project.
  - Active assignment removal guards (ADR-006):
    - Member cannot be removed from project if they have active tasks assigned (`status != 'done' AND deleted_at IS NULL`), returning `409 MEMBER_HAS_ACTIVE_TASKS`.
    - Organisation member cannot be suspended or removed if they have active tasks assigned in any project, returning `409 MEMBER_HAS_ACTIVE_TASKS`.
  - Archived project invariant: Task creation, updates, and deletion in an `archived` project are strictly blocked with `409 PROJECT_ARCHIVED`.
  - Soft deletion: Soft-deleted tasks record `deleted_at` and `deleted_by_id` and are filtered out of all normal queries.
  - Server-side filtering: `status`, `priority`, `assigneeId`, `assigned_to_me`, `due_soon` ($\le 7\text{ days}$ in future), `overdue` ($< \text{now}$ UTC and status $\ne$ 'done'), text search across title and description, and deterministic cursor/offset pagination.
  - Cross-project task query: `GET /api/v1/organisations/:orgId/tasks/my` returning caller's active assignments across all projects in the organisation.
- **REST API Routes (`backend/src/routes/projects.js`, `organisations.js`):**
  - `GET /api/v1/organisations/:orgId/projects/:projectId/tasks` (List tasks with filters)
  - `POST /api/v1/organisations/:orgId/projects/:projectId/tasks` (Create task)
  - `GET /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId` (Get task by ID)
  - `PATCH /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId` (Update task or status)
  - `DELETE /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId` (Soft-delete task)
  - `GET /api/v1/organisations/:orgId/tasks/my` (List tasks assigned to current user across org)
- **Frontend Task Management (`TaskListView.tsx`, `TaskKanbanView.tsx`, `CreateTaskDialog.tsx`, `TaskDetailDialog.tsx`, `ProjectDetailPage.tsx`):**
  - Dual-mode Task View: Toggle seamlessly between 5-column Kanban board and comprehensive tabular List view over the same live data model.
  - Kanban board: 5 columns (`backlog`, `todo`, `in_progress`, `blocked`, `done`) with column task counts, priority badges, assignee tags, quick navigation buttons between valid adjacent statuses, and column "Add Task" quick triggers.
  - List view: Dense enterprise table with status badges, priority badges, assignee name/email, overdue and due-soon warning chips, and direct forward-status progression buttons.
  - Quick filter bar: Instant preset buttons (All Tasks, Assigned to Me, Due Soon, Overdue), full-text search input, and status, priority, and assignee dropdowns.
  - Create Task Modal: Validates title, description, priority, initial status, assignee (from eligible project members), and start/due dates.
  - Task Detail Modal: In-place editable fields, status transition controls with server validation error handling, audit metadata (creator and timestamps), and confirmed soft deletion.
- **Automated Verification & Evidence:**
  - Tasks integration test suite (`tasks.integration.test.js`): 18/18 passing tests covering CRUD, 5-status lifecycle, invalid transition rejection, reopen authorization, assignee project membership validation, project member removal guard (409), org member suspension guard (409), archived project guard (409), soft deletion, server-side filters (`assigned_to_me`, `due_soon`, `overdue`, search), and `managex_app` composite FK / RLS isolation.
  - Projects integration test suite (`projects.integration.test.js`): 18/18 passing tests with 0 regressions.
  - Full backend test suite: 220/220 passing tests across 15 test suites in `npm test` (0 failures).
  - Frontend test suite: 8/8 passing tests in `vitest run`.
  - Frontend typecheck and production build: `tsc && vite build` completed cleanly with 0 errors in 13.07s.

---

## Phase 8C Deliverables Summary (Comments, Activity Timeline & Projects Full E2E)
- **Database Schema & Migrations (`database/migrations/20261017000018_task_comments_activity.sql`):**
  - Created `task_comments` table with columns: `id`, `organisation_id`, `project_id`, `task_id`, `author_id`, `content`, `created_at`, `updated_at`, `deleted_at`, `deleted_by_id`.
  - Created `project_activity` table with columns: `id`, `organisation_id`, `project_id`, `entity_type`, `entity_id`, `action`, `actor_id`, `metadata`, `created_at`.
  - Composite foreign keys:
    - `task_comments (task_id, project_id, organisation_id) REFERENCES tasks(id, project_id, organisation_id) ON DELETE CASCADE`.
    - `task_comments (organisation_id, author_id) REFERENCES organisation_memberships(organisation_id, user_id) ON DELETE CASCADE`.
    - `project_activity (project_id, organisation_id) REFERENCES projects(id, organisation_id) ON DELETE CASCADE`.
    - `project_activity (organisation_id, actor_id) REFERENCES organisation_memberships(organisation_id, user_id) ON DELETE SET NULL`.
  - Seeded permissions: `project.comment.moderate` and `task.comment.create` granted to `organisation_owner` and `organisation_admin`.
  - PostgreSQL Row-Level Security: `FORCE ROW LEVEL SECURITY` enabled on both tables, granting `SELECT, INSERT, UPDATE, DELETE` to `managex_app` with isolated tenant policies (`tenant_isolation_task_comments`, `tenant_isolation_project_activity`).
- **Backend Services & Routes (`backend/src/platform/projects/projectService.js`, `backend/src/routes/projects.js`):**
  - Task Comments CRUD:
    - `POST /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments`: Validates plain-text content (1..2000 chars), verifies caller is an active project member, records activity event `comment_added`.
    - `GET /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments`: Bounded list with active author profile and soft-deleted placeholder `[This comment has been deleted]`.
    - `PATCH /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments/:commentId`: Author-only edit while project is not archived, updating `content` and recording `comment_edited`.
    - `DELETE /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments/:commentId`: Soft deletion by author or moderator/manager (`project.comment.moderate`), setting `deleted_at` and `deleted_by_id` and recording `comment_deleted`.
    - Archived project guard: Comment creation, updates, and deletion in an `archived` project are strictly rejected with `409 PROJECT_ARCHIVED`.
    - Audit security invariant: Compliance audit logs record comment ID only — comment body or diffs are NEVER included in audit metadata (`SEC-008`, `ADR-013`).
  - Project Activity Timeline:
    - Concise activity logging helper `recordProjectActivity` integrated across all material events: `project_created`, `project_status_changed`, `member_added`, `member_role_changed`, `member_removed`, `task_created`, `task_status_changed`, `task_assigned`, `task_deleted`, `comment_added`, `comment_edited`, `comment_deleted`.
    - `GET /api/v1/organisations/:orgId/projects/:projectId/activity`: Chronological timeline query ordered by `created_at DESC` with pagination, actor metadata, and clean summary messages.
    - Zero secrets or token leakage in activity metadata; distinct and decoupled from compliance audit logs.
- **Frontend Workspace Experience (`TaskDetailDialog.tsx`, `ProjectDetailPage.tsx`, `types/projects.ts`):**
  - Interactive Task Comments Thread:
    - Real-time comment input with character counter (0/2000), submit button, and keyboard shortcut support.
    - Author in-place inline editing with Cancel / Save controls.
    - Soft-deletion confirmation with instant UI update to `[This comment has been deleted]`.
    - Moderation delete button visible only to users with manager/admin privileges.
    - Read-only banner and disabled inputs when the parent project is in `archived` status.
  - Project Activity Timeline Tab:
    - Added dedicated "Activity" tab to `ProjectDetailPage` with chronological vertical timeline.
    - Event-specific badges and human-readable event summaries (e.g., status changes, assignee changes, member updates).
    - Actor avatar, user name, email, relative/absolute timestamp chips, and contextual metadata.
- **Automated Verification & Evidence:**
  - Dedicated Phase 8C integration test suite (`comments_activity.integration.test.js`): 18/18 passing tests covering comment validation, bounds, script safety, author edit, non-author edit lockout (403), author soft-delete, non-author delete without moderation lockout (403), manager moderation delete, archived project lockout (409), project non-member lockout (403), cross-tenant isolation, activity timeline generation, activity secrets omission, archived history preservation, direct RLS under `managex_app`, composite FK rejection (23503), dynamic module revocation (403 MODULE_DISABLED).
  - Full backend test suite: 238/238 passing tests across 16 test suites in `npm test` (0 failures).
  - Frontend test suite: 8/8 passing tests in `vitest run`.
  - Frontend typecheck and production build: `tsc && vite build` completed cleanly with 0 errors in 6.92s.

---

## Phase 9 Deliverables Summary (Platform Administration Console & Controls)
- **Database Schema & Migrations (`database/migrations/20261017000019_platform_admin_controls.sql`):**
  - Added `platform_role` column to `users` with CHECK constraint (`platform_super_admin`, `platform_support_agent`).
  - Seeded platform permissions `platform.account.read` and `platform.account.manage`.
  - Mapped permissions to `platform_super_admin` and `platform_support_agent` roles.
  - Granted least-privilege `UPDATE (is_platform_available) ON modules` to restricted runtime role `managex_app`.
  - All 19 migrations verified and applied deterministically (`19/19 applied, 0 pending`).
- **Backend Services & Authorization Middleware:**
  - Distinct `/api/v1/platform` route namespace segregated from customer tenant endpoints.
  - Platform session and authorization middleware (`requirePlatformSession`, `requirePlatformPermission`) enforcing server-authoritative role and permission checks.
  - Operational overview service (`getPlatformOverview`): aggregate metrics for accounts, workspaces, and catalogue modules without cross-tenant leakage.
  - Global accounts management (`listAccounts`, `updateAccountStatus`): paginated operational listing returning only allowlisted fields; zero password hashes or tokens; instant session revocation on account suspension; login fail-closed (`403 ACCOUNT_DISABLED`); self-suspension guard (`409 CANNOT_SUSPEND_SELF`).
  - Customer workspace operational inspection (`listOrganisations`, `getOrganisationDetails`, `updateOrganisationStatus`): tenant overview with member and active module counts; non-destructive workspace suspension returning `403 ORG_INACTIVE` while preserving all tenant data.
  - Module catalogue management (`listPlatformModules`, `updatePlatformModuleAvailability`): fixed 3 MVP modules (`events`, `meetings`, `projects`); platform availability toggle cascading to org endpoints (`403 MODULE_PLATFORM_UNAVAILABLE`) without deleting underlying data; arbitrary module rejection (`404 MODULE_NOT_FOUND`).
  - Platform audit logging (`listPlatformAuditLogs`): append-only audit trail with `organisation_id IS NULL` for all high-impact actions.
- **Frontend Platform Console (`/platform`):**
  - Distinct visual identity and navigation layout (`PlatformLayout.tsx`) with dark slate header and direct "Return to Workspace" link.
  - Real-time Operational Overview (`PlatformOverviewPage.tsx`): live tenant metrics and catalogue status cards.
  - User Accounts Directory (`PlatformAccountsPage.tsx`): paginated table, search, status filter, and confirmation modal for account suspension/reactivation with operational reason logging.
  - Workspaces Inspection (`PlatformOrganisationsPage.tsx`): paginated organisations list, metadata modal detailing active module entitlements, and workspace suspension/reactivation modal.
  - Module Catalogue Controls (`PlatformModulesPage.tsx`): visual cards for `events`, `meetings`, and `projects` with global enable/disable modals and data preservation guarantees.
  - Platform Audit Logs Viewer (`PlatformAuditLogsPage.tsx`): UTC timestamped event ledger with sanitized JSON metadata modal.
- **Automated Verification & Evidence:**
  - Dedicated Phase 9 integration test suite (`platform.integration.test.js`): 20/20 passing tests covering PLAT-001 through PLAT-007 and SEC-009.
  - Full backend test suite: 258/258 passing tests across 17 test suites in `npm test` (0 failures).
  - Frontend test suite: 8/8 passing tests in `vitest run`.
  - Frontend typecheck and production build: `tsc && vite build` completed cleanly with 0 errors in 16.76s.

---

## Phase 10 Deliverables Summary (Cross-Cutting Hardening, Performance & Security Audit)
- **Security Hardening & Headers (`SEC-001`, `SEC-005`):**
  - Added dedicated security headers middleware (`securityHeaders.js`) enforcing `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Content-Security-Policy`, and production `Strict-Transport-Security`.
  - Verified bcrypt work factor 12 and login timing enumeration defense (dummy 12-round bcrypt hash comparison for non-existent users).
  - Enforced CSRF double-submit token checking on all state-changing mutations (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Input Fuzzing & Abuse Protection (`SEC-002`, `SEC-006`):**
  - Parameterized queries verified against SQL injection fuzz vectors across search parameters and request bodies.
  - XSS payloads neutralized as plain text without execution.
  - Request body parser constrained to 100KB with standard 413 `PAYLOAD_TOO_LARGE` error envelope.
  - Invalid Unicode null bytes (`\u0000`) trapped and returned with 400 `INVALID_ENCODING` instead of 500.
  - Rate limiting verified on sensitive public and auth endpoints (`auth_login`, `auth_reg`).
- **Secret Redaction & Audit Integrity (`SEC-007`, `SEC-008`):**
  - Automated check asserting zero password hashes, session secrets, or tokens in logs, audit records, or API error bodies.
- **Cross-Tenant RLS Matrix (`SEC-008`):**
  - Exhaustive RLS CRUD matrix verified under restricted role `managex_app`: zero cross-tenant reads or writes across `events`, `meetings`, `notes`, `projects`, `tasks`, and `comments`.
  - Composite foreign keys enforce tenant isolation (`fk_tasks_project_tenant`), rejecting foreign references with PostgreSQL error `23503`.
- **Database Resilience & Latency SLAs (`OPS-005`):**
  - Connection pool exhaustion and recovery verified; queued queries succeed once pooled clients are released without deadlock.
  - Measured p95 read latency: 32ms (well under < 200ms target).
  - Measured p95 write latency: 58ms (well under < 500ms target).
  - 1,000-row dataset paginated query verified in 181ms (well under < 2.0s target).
  - PostgreSQL `EXPLAIN ANALYZE` confirms execution uses `idx_tasks_project_status` index scan with zero unindexed table scans.
- **Frontend Accessibility (`UI-005`, WCAG 2.2 AA):**
  - Verified color contrast >= 4.5:1 for normal text and >= 3:1 for UI components across light theme palette.
  - Primitives refined with accessible semantics: `Button` (`aria-busy`, `aria-disabled`), `Input` (`aria-invalid`), `Dialog` (`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`), `TableHead` (`scope="col"`).
  - Automated test suite (`Accessibility.test.tsx`): 6/6 tests passing via native DOM server rendering.
- **Automated Verification & Evidence:**
  - Dedicated Phase 10 security audit suite (`security_audit.integration.test.js`): 13/13 passing tests.
  - Dedicated Phase 10 database performance suite (`performance.integration.test.js`): 4/4 passing tests.
  - Full backend test suite: 275/275 passing tests across 19 suites in `npm test` (0 failures).
  - Frontend test suite: 14/14 passing tests across 2 suites in `vitest run` (0 failures).
  - Frontend typecheck and production build: `tsc && vite build` completed cleanly with 0 errors in 8.54s.


