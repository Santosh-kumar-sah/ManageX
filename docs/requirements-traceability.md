# ManageX Requirements Traceability Matrix

This matrix maps every single requirement from `docs/PRD.md` to its designated implementation phase, UI surfaces, API endpoints, database entities, authorization/RLS rules, test criteria, and current implementation status.

**Status Legend:**
- `PLANNED`: Architectural specification complete in Phase 0; implementation scheduled for indicated phase.
- `IN_PROGRESS`: Implementation actively under development in current phase.
- `VERIFIED`: Implementation complete with passing automated test evidence.
- `BLOCKED`: Dependency or decision blocker preventing completion.

---

## 1. Shared Platform: Authentication & Identity

| Requirement ID | Summary | Phase | UI / Page | API Endpoint(s) | Data Entities | Authorization & RLS Rule | Test Case & Evidence | Status | Notes / Decision Reference |
|---|---|---|---|---|---|---|---|---|---|
| `AUTH-001` | Registration with normalized email & modern hash | Phase 3 | `/auth/register` | `POST /api/v1/auth/register` | `users` | Public endpoint; server-side Zod validation; bcrypt hash (cost 12) | Integration tests in `auth.integration.test.js` (Test 1, 2) | `VERIFIED` | ADR-017 |
| `AUTH-002` | Email verification with expiring tokens | Phase 3 | `/auth/verify-email` | `POST /api/v1/auth/verify-email` | `email_verification_tokens` | Public endpoint; token hashed in DB; single-use invalidation | Integration tests in `auth.integration.test.js` (Test 4, 5) | `VERIFIED` | PRD §6.1 |
| `AUTH-003` | Login/logout with generic failure messages | Phase 3 | `/auth/login`, Shell Logout | `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` | `users`, `sessions` | Public login; session revocation on logout; no email enumeration | Integration tests in `auth.integration.test.js` (Test 3, 6, 7, 8, 12) | `VERIFIED` | PRD §6.1 |
| `AUTH-004` | Password recovery with single-use tokens | Phase 3 | `/auth/forgot-password`, `/auth/reset-password` | `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password` | `password_reset_tokens`, `sessions` | Public endpoint; generic response; revokes all existing sessions on reset | Integration tests in `auth.integration.test.js` (Test 13) | `VERIFIED` | PRD §6.1 |
| `AUTH-005` | Session lifecycle (30m idle, 7d absolute, rotation) | Phase 3 | App Shell | `GET /api/v1/auth/me` | `sessions` | Verified session cookie; sliding idle renewal; revocable | Integration tests in `auth.integration.test.js` (Test 8, 9, 10) | `VERIFIED` | ADR-011 |
| `AUTH-006` | Rate limiting for sensitive public/auth routes | Phase 3 | `/auth/*` | All `/api/v1/auth/*` | In-memory sliding window counters | Express rate-limit middleware with safe RFC-7807 error envelopes | Rate limiter unit and route integration tests | `VERIFIED` | PRD §6.1 |
| `AUTH-007` | Cookie and CSRF security (HttpOnly, SameSite=Lax) | Phase 3 | App Shell | All state-changing `/api/v1/*` | None | `X-CSRF-Token` validation header on mutations; Lax/HttpOnly cookies | Integration tests in `auth.integration.test.js` (Test 11) | `VERIFIED` | ADR-011 |
| `AUTH-008` | Email provider abstraction & failure handling | Phase 3 | Auth & Invite UIs | Internal Email Service | None | Shared email service; graceful failure; no fake delivery claims | Integration tests in `auth.integration.test.js` (Test 1, 13) | `VERIFIED` | ADR-010 |


---

## 2. Shared Platform: Organisation Lifecycle & Membership

| Requirement ID | Summary | Phase | UI / Page | API Endpoint(s) | Data Entities | Authorization & RLS Rule | Test Case & Evidence | Status | Notes / Decision Reference |
|---|---|---|---|---|---|---|---|---|---|
| `ORG-001` | Create organisation atomically with Owner membership | Phase 4 | `/app/organisations/new` | `POST /api/v1/organisations` | `organisations`, `organisation_memberships`, `membership_roles` | Authenticated verified user; single transactional DML | `organisations.integration.test.js` tests 1-3 | `VERIFIED` | PRD §6.2 |
| `ORG-002` | Multiple organisation memberships support | Phase 4 | `/app`, Workspace Chooser | `GET /api/v1/organisations` | `organisation_memberships` | User can only query organisations where they have active membership | `organisations.integration.test.js` test 4 | `VERIFIED` | PRD §6.2 |
| `ORG-003` | Organisation switcher with client cache reset | Phase 4 | App Shell Switcher | `GET /api/v1/organisations/:orgId` | `organisations` | Server validates membership on every request; UI purges cache on switch | `OrgContext.tsx`, `WorkspaceLayout.tsx`, `organisations.integration.test.js` test 5 | `VERIFIED` | Architecture §6 |
| `ORG-004` | Membership status lifecycle (invited, active, suspended, removed) | Phase 4 | `/app/organisations/:orgId/members` | `GET /api/v1/organisations/:orgId/members` | `organisation_memberships` | Only `active` status permits workspace access; suspended fails closed | `organisations.integration.test.js` tests 6, 11 | `VERIFIED` | PRD §6.2 |
| `ORG-005` | Email invitations (7-day expiry, single-use) | Phase 4 | `/app/organisations/:orgId/members` | `POST /api/v1/organisations/:orgId/invitations` | `invitations` | Requires `org.member.invite` permission; token hashed in DB | `organisations.integration.test.js` tests 8, 9, 12, 13, 24 | `VERIFIED` | PRD §6.2 |
| `ORG-006` | Existing and new user invitation onboarding | Phase 4 | `/auth/register`, `/auth/login` | `POST /api/v1/invitations/:token/accept` | `invitations`, `organisation_memberships` | Verified matching email identity required to accept | `organisations.integration.test.js` tests 10, 11, 21, `AcceptInvitationPage.tsx` | `VERIFIED` | PRD §6.2 |
| `ORG-007` | Membership management (role change, suspension, removal) | Phase 4 | `/app/organisations/:orgId/members` | `PATCH /api/v1/organisations/:orgId/members/:userId` | `organisation_memberships` | Requires `org.member.manage`; cannot self-escalate; audited | `organisations.integration.test.js` tests 14, 15 | `VERIFIED` | PRD §6.2 |
| `ORG-008` | Final-owner invariant & step-up transfer protocol | Phase 4 | `/app/organisations/:orgId/settings` | `POST /api/v1/organisations/:orgId/transfer-owner` | `organisations`, `membership_roles` | Final active owner cannot be removed; transfer requires step-up reauth | `organisations.integration.test.js` tests 15, 17, 18, 22 | `VERIFIED` | ADR-005 |
| `ORG-009` | Permitted organisation settings only | Phase 4 | `/app/organisations/:orgId/settings` | `PATCH /api/v1/organisations/:orgId` | `organisations` | Requires `org.update` permission; strictly validated fields | `organisations.integration.test.js` tests 5, 7 | `VERIFIED` | PRD §6.2 |
| `ORG-010` | Leave organisation while preserving last-owner invariant | Phase 4 | `/app/organisations/:orgId/settings` | `POST /api/v1/organisations/:orgId/leave` | `organisation_memberships` | Active member can leave; sole owner is rejected | `organisations.integration.test.js` tests 16, 19, 22 | `VERIFIED` | PRD §6.2 |

---

## 3. Shared Platform: RBAC, Permissions & Module Entitlements

| Requirement ID | Summary | Phase | UI / Page | API Endpoint(s) | Data Entities | Authorization & RLS Rule | Test Case & Evidence | Status | Notes / Decision Reference |
|---|---|---|---|---|---|---|---|---|---|
| `RBAC-001` | Independent Platform, Org, and Module permission scopes | Phase 5 | Workspace Shell | All `/api/v1/*` | `permissions`, `roles` | Scope checks are strictly segregated; no blanket admin access | `rbac_modules.integration.test.js` test 6 (platform role delegation fails 403) | `VERIFIED` | PRD §6.3 |
| `RBAC-002` | Central machine-readable permission catalogue | Phase 5 | App Shell | Internal Evaluator | `permissions`, `role_permissions` | Permissions evaluated by key; no hardcoded role string checks | `GET /api/v1/organisations/:orgId/permissions`, `rbac_modules.integration.test.js` test 1 | `VERIFIED` | ADR-004 |
| `RBAC-003` | Seeded default roles for platform, org, and modules | Phase 5 | DB Seeds | None | `roles`, `role_permissions` | Exact baseline roles seeded; least privilege enforced | Migration `20261017000008_seed_rbac_roles_permissions.sql`, `rbac_modules.integration.test.js` test 2 | `VERIFIED` | PRD §6.3 |
| `RBAC-004` | Server-authoritative permission checks on all routes | Phase 5 | All Views | All protected routes | None | Server checks identity → org → module → permission → resource | `requireOrgPermission`, `requireModuleEntitlement`, `rbac_modules.integration.test.js` tests 5, 8 | `VERIFIED` | Security §2 |
| `RBAC-005` | Delegation limits & anti-escalation controls | Phase 5 | Member Role UI | `POST /api/v1/organisations/:orgId/members/:userId/roles` | `membership_roles` | Users can only delegate permissions they possess | `rbac_modules.integration.test.js` test 7 (member granting owner fails anti-escalation) | `VERIFIED` | PRD §6.3 |
| `RBAC-006` | Immediate revocation of roles, memberships & entitlements | Phase 5 | Workspace Shell | All protected routes | `sessions`, `membership_roles` | Privilege changes take effect on next API request | `rbac_modules.integration.test.js` tests 8, 9, `MembersPage.tsx` | `VERIFIED` | PRD §6.3 |
| `RBAC-007` | Comprehensive permission testability across tenants | Phase 5 | Test Suite | Test runner | All | Automated tests for allowed/denied roles across tenants | `rbac_modules.integration.test.js` test 10 (Org A cannot query Org B) | `VERIFIED` | Testing §3 |
| `MOD-001` | Fixed module catalogue (`events`, `meetings`, `projects`) | Phase 5 | `/app/organisations/:orgId/modules` | `GET /api/v1/organisations/:orgId/modules` | `modules` | Fixed keys; no user-created custom modules | `rbac_modules.integration.test.js` test 3, `OrgModulesPage.tsx` | `VERIFIED` | PRD §6.4 |
| `MOD-002` | Organisation module activation/deactivation | Phase 5 | `/app/organisations/:orgId/modules` | `PATCH .../modules/:moduleKey` | `organisation_module_entitlements` | Requires `org.module.manage`; audited; non-destructive | `rbac_modules.integration.test.js` test 4, `OrgModulesPage.tsx` | `VERIFIED` | ADR-016 |
| `MOD-003` | Independent checks (platform availability vs org activation vs user perm) | Phase 5 | Workspace Shell | Module Middleware | `modules`, `entitlements` | All 3 gates must pass independently | `requireModuleEntitlement`, `rbac_modules.integration.test.js` tests 3, 4 | `VERIFIED` | PRD §6.4 |
| `MOD-004` | Disabled module returns 403 Forbidden | Phase 5 | Module Views | All `/api/v1/organisations/:orgId/{module}/*` | None | Direct API calls to disabled module fail closed (403) | `rbac_modules.integration.test.js` test 4, `ModulePlaceholderPage.tsx` | `VERIFIED` | ADR-016 |
| `MOD-005` | No billing / commercial dependency in MVP | Phase 5 | Module Views | None | None | Module activation is purely administrative; no payment checks | `rbac_modules.integration.test.js` test 13 (zero billing/Stripe headers) | `VERIFIED` | PRD §6.4 |

---

## 4. Shared Platform: Audit, API, UI & Operational Foundations

| Requirement ID | Summary | Phase | UI / Page | API Endpoint(s) | Data Entities | Authorization & RLS Rule | Test Case & Evidence | Status | Notes / Decision Reference |
|---|---|---|---|---|---|---|---|---|---|
| `AUD-001` | Append-only audit logging mechanism | Phase 5 | `/app/organisations/:orgId/audit-logs` | `auditService.js` | `audit_logs` | Shared audit service; immutable rows; normal users cannot edit/delete | `rls.integration.test.js` test 7, `rbac_modules.integration.test.js` test 11 | `VERIFIED` | ADR-012 |
| `AUD-002` | Standard audit fields (actor, action, resource, metadata) | Phase 5 | Audit Views | Internal Audit Service | `audit_logs` | Actor ID, org ID, action key, resource, outcome, request ID | `auditService.js`, `rbac_modules.integration.test.js` test 11 | `VERIFIED` | PRD §6.5 |
| `AUD-003` | Exclusion of secrets and sensitive payloads from audit | Phase 5 | None | Internal Audit Service | None | Redaction filters for passwords, tokens, secrets, private notes | `organisations.integration.test.js` test 20, `auditService.js` | `VERIFIED` | ADR-012 |
| `AUD-004` | Read & integrity controls (permission-controlled audit) | Phase 5 | `/app/organisations/:orgId/audit-logs` | `GET /api/v1/organisations/:orgId/audit-logs` | `audit_logs` | Restricted to `org.audit.view` or authorized org admin | `rbac_modules.integration.test.js` tests 11, 12, `OrgAuditLogsPage.tsx` | `VERIFIED` | PRD §6.5 |
| `AUD-005` | Record success and security denial outcomes | Phase 5 | Audit Views | Internal Audit Service | `audit_logs` | Audits both successful actions and critical access failures | `recordAuditEvent` across auth, org, module mutations | `VERIFIED` | PRD §6.5 |
| `API-001` | `/api/v1` base path for all endpoints | Phase 1 | Frontend API Client | Express Router | None | Express router prefix `/api/v1` | Verify all route declarations start with `/api/v1` | `PLANNED` | PRD §6.6 |
| `API-002` | Runtime Zod schema validation on all inputs | Phase 1 | All API Routes | Validation Middleware | None | Route params, queries, and bodies validated by Zod | Test sending invalid JSON and out-of-range params | `PLANNED` | PRD §6.6 |
| `API-003` | Consistent JSON success and error response shapes | Phase 1 | All API Routes | Error Middleware | None | `{ success, data, meta }` and `{ success, error }` envelopes | Verify response envelopes on 200, 400, 401, 403, 500 | `PLANNED` | API Contracts §2 |
| `API-004` | Server-side pagination (default 20, max 100) | Phase 1 | All Collection Views | List Endpoints | All Collections | Validated query params `page` and `limit` | Test requesting limit=500 (clamped to 100) | `PLANNED` | API Contracts §3 |
| `API-005` | Standard HTTP status code semantics | Phase 1 | All API Routes | All Endpoints | None | Predictable codes (200, 201, 204, 400, 401, 403, 404, 409, 422, 500) | Verify HTTP status codes match scenario | `PLANNED` | API Contracts §2 |
| `API-006` | Parameterized SQL queries & transactions | Phase 2 | Backend DB Layer | DB Connection Pool | All Tables | Zero raw string SQL concatenation; transactions for multi-DML | Code audit for parameterized query compliance | `PLANNED` | Architecture §5 |
| `API-007` | Request correlation ID tracing | Phase 1 | Server Logs | Request Middleware | None | `X-Request-Id` injected and propagated in logs and responses | Verify header present in responses and server logs | `PLANNED` | PRD §6.6 |
| `API-008` | Fully documented API inventory | Phase 0 | Docs | `docs/api-contracts.md` | None | Documented in `docs/api-contracts.md` | Audit API contracts document | `VERIFIED` | API Contracts §4 |
| `UI-001` | Clean Enterprise light UI direction | Phase 1 | All Frontend Pages | Frontend Shell | None | White/light neutral surfaces, restrained indigo, minimal animation | Visual and design system token inspection | `PLANNED` | PRD §6.7 |
| `UI-002` | Reusable design system component library | Phase 1 | Shared Components | UI Component Library | None | Button, Input, Table, Dialog, Badge, Avatar, Toast, etc. | Unit tests for UI components | `PLANNED` | PRD §6.7 |
| `UI-003` | Responsive workspace shell with org switcher & navigation | Phase 1 | `/app/*` | App Shell | None | Sidebar, top header, active org badge, breadcrumbs | Responsive layout test across viewports | `PLANNED` | PRD §6.7 |
| `UI-004` | Shared frontend API client with normalized errors | Phase 1 | Frontend API Client | Fetch Abstraction | None | Central client handles `/api/v1`, credentials, session expiry | Test API client error normalization | `PLANNED` | PRD §6.7 |
| `UI-005` | Cache segregation on org switch and logout | Phase 1 | TanStack Query | Query Client Cache | None | Query keys prefixed with `organisationId`; purged on switch | Test org switch cache invalidation | `PLANNED` | Architecture §6 |
| `UI-006` | Form behaviour (duplicate submit lock, safe state) | Phase 1 | All Forms | Form Components | None | Disabled button during submit; server-confirmed success | Test double-clicking submit button | `PLANNED` | PRD §6.7 |
| `UI-007` | WCAG 2.2 AA accessibility standards | Phase 1 | All Pages | None | None | Keyboard navigation, visible focus, ARIA labels, contrast | Run axe-core accessibility checks | `PLANNED` | Testing §4 |
| `UI-008` | Responsive states (desktop, tablet, mobile) | Phase 1 | All Pages | None | None | Usable layouts at 1440px, 768px, 375px | Playwright viewport tests | `PLANNED` | PRD §6.7 |
| `UI-009` | Real data only (no fabricated metrics or testimonials) | Phase 1 | Landing & Dashboard | Public & App Pages | None | Transparent empty states when no data; zero fake metrics | Visual inspection of public landing and dashboards | `PLANNED` | PRD §6.7 |
| `OPS-001` | Health and readiness probes (`/health`, `/ready`) | Phase 1–2 | None | `GET /api/v1/health`, `GET /api/v1/ready` | None | Public probe; checks event loop, process runtime secrets, and active bounded PostgreSQL ping. | Automated tests in `health.test.js` and `pool.test.js` verifying 200 connected and 503 unavailable | `VERIFIED` | Runbook §2 |
| `OPS-002` | Startup environment variable validation | Phase 1 | Backend Bootstrap | Config Validator | None | Validates required env vars on startup; redacts values | Test server startup with missing required env var | `PLANNED` | Deployment §2 |
| `OPS-003` | Versioned SQL database migrations | Phase 2 | DB Migrations | Migration Runner | `schema_migrations` | Sequential SQL files; transactional DDL; deterministic order | Fresh DB creation and rerun verified via `database/migrate.js` | `VERIFIED` | Database §5 |
| `OPS-004` | Structured logging with secret redaction | Phase 1 | Server Logs | Logger Middleware | None | JSON logs with request ID; filters passwords, tokens, cookies | Test logging object with password and token fields | `PLANNED` | PRD §6.8 |
| `OPS-005` | Non-production safe development seeds | Phase 2 | DB Seeds | Seed Runner | Reference Tables | Local/test seed data only; zero default production passwords | Verified reference catalogue in `20261017000004_seed_reference.sql` | `VERIFIED` | PRD §6.8 |
| `OPS-006` | Backup and disaster recovery documentation | Phase 0 | Docs | `docs/runbook.md` | None | Documented in `docs/runbook.md` | Audit runbook backup procedures | `VERIFIED` | Runbook §4 |

---

## 5. Domain Module: Events & Hackathons (`events`)

| Requirement ID | Summary | Phase | UI / Page | API Endpoint(s) | Data Entities | Authorization & RLS Rule | Test Case & Evidence | Status | Notes / Decision Reference |
|---|---|---|---|---|---|---|---|---|---|
| `EVT-001` | Event model, create/edit, UTC instants & timezones | Phase 6A | `/app/.../events/new`, `/edit` | `POST`, `PATCH .../events` | `events` | Requires `event.create`/`event.update`; validates dates | Test start after end, invalid timezone identifier | `PLANNED` | PRD §7.1 |
| `EVT-002` | Canonical 7-status lifecycle with transition guard | Phase 6A | `/app/.../events/:id` | `POST .../events/:id/status` | `events` | Guard validates draft → published → registration_closed, etc. | Test invalid status transitions (e.g. draft to completed) | `PLANNED` | PRD §7.1 |
| `EVT-003` | Time, visibility, and public data filtering | Phase 6A | Public Event Listing | `GET /api/v1/events/public` | `events` | Only published & public events visible publicly; no drafts | Test unauthenticated visitor cannot see draft events | `PLANNED` | Security §3 |
| `EVT-004` | Registration workflow & external participant boundary | Phase 6B | Event Detail / Register | `POST .../events/:id/register` | `event_registrations` | Verified user; registration creates NO org membership | Test external participant attempting org member API (403) | `PLANNED` | ADR-003 |
| `EVT-005` | Registration window, capacity lock & uniqueness | Phase 6B | Event Registration | `POST .../events/:id/register` | `event_registrations` | Enforces window, transactional capacity check, reactivation | Concurrency test with 10 requests competing for 1 slot | `PLANNED` | ADR-008 |
| `EVT-006` | Hackathon teams (min/max 1..100, single-use invites) | Phase 6C | Hackathon Teams UI | `POST .../events/:id/teams` | `event_teams`, `event_team_members` | Team mode enabled; min $\ge 1$, max $\le 100$; 7-day invite expiry | Test team exceeding max size, duplicate membership | `PLANNED` | ADR-007 |
| `EVT-007` | URL-based submissions (no file uploads) | Phase 6C | Event Submissions UI | `POST .../events/:id/submissions` | `event_submissions` | http/https validation; submitter owns submission; no file blobs | Test submitter updating another's submission (403) | `PLANNED` | PRD §7.3 |
| `EVT-008` | Judge assignments, criteria (1..100) & private scoring | Phase 6D | Judge Evaluation UI | `POST .../events/:id/scores` | `event_judge_assignments`, `event_scores` | Assigned-only judge evaluation; unpublished scores hidden | Test unassigned judge attempting scoring (403) | `PLANNED` | PRD §7.4 |
| `EVT-009` | Result calculation (straight sum) & publication | Phase 6D | Event Results Review | `POST .../events/:id/publish-results`| `events`, `event_scores` | Straight sum; all criteria completed; tied ranks shared | Test result calculation with ties and partial scoring | `PLANNED` | ADR-009 |

---

## 6. Domain Module: Meetings (`meetings`)

| Requirement ID | Summary | Phase | UI / Page | API Endpoint(s) | Data Entities | Authorization & RLS Rule | Test Case & Evidence | Status | Notes / Decision Reference |
|---|---|---|---|---|---|---|---|---|---|
| `MTG-001` | Meeting scheduling, timezone display & attendees | Phase 7A | `/app/.../meetings/new` | `POST /api/v1/organisations/:orgId/meetings` | `meetings`, `meeting_attendees` | Requires `meeting.create`; start < end; eligible org attendees | Test invalid start/end times, cross-tenant attendee | `PLANNED` | PRD §8.1 |
| `MTG-002` | Canonical 4-status lifecycle (`scheduled`, `in_progress`, etc.) | Phase 7A | Meeting Detail View | `POST .../meetings/:id/status` | `meetings` | Validates transitions; no archived status permitted | Test transitioning completed to scheduled (409 expected) | `PLANNED` | PRD §8.1 |
| `MTG-003` | Attendees and visibility rules (`organisation`, `attendees_only`) | Phase 7A | Meeting Detail View | `GET .../meetings/:id` | `meetings`, `meeting_attendees` | `attendees_only` restricts access to organiser and attendees | Non-attendee member accessing attendees_only meeting | `PLANNED` | PRD §8.1 |
| `MTG-004` | Ordered agenda items and upcoming/past lists | Phase 7A | Meeting Agenda UI | `GET`, `POST .../meetings/:id/agenda` | `meeting_agenda_items` | Sequential ordering preserved; server-side pagination | Test agenda reordering persistence | `PLANNED` | PRD §8.1 |
| `MTG-005` | Confidential notes/minutes restricted to organiser & roles | Phase 7B | Meeting Notes Tab | `GET`, `PUT .../meetings/:id/notes` | `meeting_notes` | Restricted to organiser and `meeting.notes.read` holders | Ordinary attendee querying notes endpoint returns 403 | `PLANNED` | ADR-014 |
| `MTG-006` | Action items with assignee, due date, priority & status | Phase 7B | Meeting Action Items | `POST .../meetings/:id/action-items` | `meeting_action_items` | Assignee must be active org member; status transitions guarded | Test assigning action item to non-member (422) | `PLANNED` | PRD §8.2 |
| `MTG-007` | Email invitations and cancellation updates | Phase 7B | Meeting Detail Actions | Internal Email Service | None | Sent only when configured; failure handled safely | Test meeting invite send with and without SMTP config | `PLANNED` | ADR-010 |

---

## 7. Domain Module: Projects & Tasks (`projects`)

| Requirement ID | Summary | Phase | UI / Page | API Endpoint(s) | Data Entities | Authorization & RLS Rule | Test Case & Evidence | Status | Notes / Decision Reference |
|---|---|---|---|---|---|---|---|---|---|
| `PRJ-001` | Project model, owner, members & priority | Phase 8A | `/app/.../projects/new` | `POST /api/v1/organisations/:orgId/projects` | `projects`, `project_members` | Requires `project.create`; owner & members must be org members | Test project owner assignment to cross-tenant user | `PLANNED` | PRD §9.1 |
| `PRJ-002` | Canonical 5-status lifecycle (`planning`, `active`, etc.) | Phase 8A | Project Detail View | `PATCH .../projects/:id` | `projects` | Server transition map; priorities: low, medium, high, urgent | Test invalid lifecycle transition | `PLANNED` | PRD §9.1 |
| `PRJ-003` | Task model & 5 canonical statuses (`backlog`, `todo`, etc.) | Phase 8B | `/app/.../projects/:id/tasks`| `POST .../projects/:id/tasks` | `tasks` | Canonical statuses; no Cancelled status; soft delete | Test task creation with invalid status string | `PLANNED` | PRD §9.2 |
| `PRJ-004` | Assignee eligibility & assignment guard on removal | Phase 8B | Task Assignment UI | `PATCH .../projects/:id/tasks/:id` | `tasks`, `project_members` | Assignee must be project member; removal blocked if active tasks | Test removing member with active task (blocked) | `PLANNED` | ADR-006 |
| `PRJ-005` | Task operations, transition rules, List & Kanban | Phase 8B | List & Kanban Views | `PATCH .../tasks/:id` | `tasks` | Status transitions validated on server; Kanban reconciles | Test drag-and-drop status update with server error | `PLANNED` | PRD §9.2 |
| `PRJ-006` | Filters (Assigned to me, Due soon, Overdue) | Phase 8B | Task Filters UI | `GET .../tasks/my` | `tasks` | Server-side filtering by UTC timestamps; no local-only filter | Test due-soon boundary (within 7 days) and overdue | `PLANNED` | PRD §9.2 |
| `PRJ-007` | Safe text comments with soft deletion | Phase 8C | Task Detail Comments | `POST .../tasks/:id/comments` | `task_comments` | Author can soft-delete; moderator can delete with perm | Test soft deletion retains row with `deleted_at` | `PLANNED` | ADR-013 |
| `PRJ-008` | Concise activity timeline & archive preservation | Phase 8C | Project Activity View | `GET .../projects/:id/activity` | `project_activity` | Records key changes; archiving preserves all task history | Test editing task in archived project (blocked) | `PLANNED` | PRD §9.3 |

---

## 8. Platform Administration & Security Invariants

| Requirement ID | Summary | Phase | UI / Page | API Endpoint(s) | Data Entities | Authorization & RLS Rule | Test Case & Evidence | Status | Notes / Decision Reference |
|---|---|---|---|---|---|---|---|---|---|
| `PLAT-001` | Distinct `/platform` console namespace and layout | Phase 9 | `/platform/*` | Express Platform Router | None | Platform routes segregated from customer workspaces | Test org owner accessing `/platform` (403 Forbidden) | `PLANNED` | PRD §10 |
| `PLAT-002` | Global account status management without secret exposure | Phase 9 | `/platform/accounts` | `GET`, `PATCH /api/v1/platform/accounts` | `users` | Requires Super Admin; no password viewing, no impersonation | Test support role attempting password retrieval | `PLANNED` | PRD §10 |
| `PLAT-003` | Organisation operational metadata inspection | Phase 9 | `/platform/organisations`| `GET /api/v1/platform/organisations` | `organisations` | Super Admin/Support; access restricted to operational metadata | Test viewing org metadata does not leak private records | `PLANNED` | PRD §10 |
| `PLAT-004` | Module platform catalogue availability management | Phase 9 | `/platform/modules` | `PATCH /api/v1/platform/modules/:key` | `modules` | Super Admin only; disabling platform availability cascades | Test disabling module platform-wide blocks org activations | `PLANNED` | PRD §10 |
| `PLAT-005` | Support Agent restricted to operational metadata | Phase 9 | `/platform/*` | Platform Endpoints | None | Support role cannot browse private events, notes, or tasks | Support agent attempting to read meeting minutes (403) | `PLANNED` | Security §4 |
| `PLAT-006` | No customer support ticketing product in MVP | Phase 9 | None | None | None | No ticket queues or customer inbox built | Code audit confirming no ticket schema/endpoints exist | `PLANNED` | PRD §10 |
| `PLAT-007` | High-impact operational safety & audit | Phase 9 | Platform Dialogs | Platform Mutations | `audit_logs` | Disabling account or module requires confirmation & audit | Test audit log generation on org disable action | `PLANNED` | PRD §10 |
| `SEC-001` | Server-trusted identity and permissions only | Phase 0–10 | Backend Middlewares | All Endpoints | None | Client-submitted IDs and role claims are never trusted | Security test tampering with payload user/org IDs | `PLANNED` | Security §1 |
| `SEC-002` | Strict 6-step authorization pipeline | Phase 0–10 | Backend Middlewares | All Protected Endpoints | None | Identity → Org → Module → Perm → Scope → RLS | Test each layer's independent rejection | `PLANNED` | Security §2 |
| `SEC-003` | Multi-tenant isolation testing across 2+ orgs | Phase 2–10 | Test Suite | Test runner | All Tables | Automated tests with User in Org A and Org B | Live integration tests in `rls.integration.test.js` under `managex_app` | `VERIFIED` | Testing §3 |
| `SEC-004` | Deny-by-default on missing context or permissions | Phase 0–10 | Backend Middlewares | All Endpoints | None | Missing session, org, permission, or context fails closed | Live integration test in `rls.integration.test.js` verifying 0 rows returned on unset context | `VERIFIED` | Security §2 |
| `SEC-005` | Input validation, HTML escaping, and URL restrictions | Phase 0–10 | Backend Validation | Zod Schemas | None | Parameterized SQL, http/https URL scheme enforcement | Fuzz test inputs with SQLi and XSS vectors | `PLANNED` | Security §5 |
| `SEC-006` | Abuse controls, rate limiting, and replay prevention | Phase 3–10 | Public/Auth Routes | Rate Limiters | Tokens | Rate limits on auth routes; single-use token hashes | Test token replay and brute-force rate limit trigger | `PLANNED` | PRD §12 |
| `SEC-007` | Secret management (no secrets in repo, logs, or UI) | Phase 0–11 | Entire Repo | Config & Logger | None | Secrets injected via env vars; redacted in structured logs | Automated scan for committed secrets and log leaks | `PLANNED` | Deployment §2 |
| `SEC-008` | Comprehensive audit logging without payload secrets | Phase 5–10 | Audit Service | `audit_logs` | `audit_logs` | Sensitive actions audited; secrets and notes redacted | Test audit content for exclusion of sensitive data | `PLANNED` | ADR-012 |
| `SEC-009` | Platform roles cannot bypass RLS to view tenant data | Phase 9–10 | Platform Service | DB Queries | None | Platform operators subject to RLS or explicit scoped queries | Test Super Admin querying tenant private tables | `PLANNED` | Security §4 |
| `SEC-010` | Real test evidence required for all security claims | Phase 0–11 | Test Reports | Test runner | None | No security claim accepted without reproducible test logs | Live integration tests in `rls.integration.test.js` executed with exit code 0 | `VERIFIED` | Testing §1 |
