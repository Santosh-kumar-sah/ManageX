# ManageX — Exact Antigravity Prompt Pack

**Purpose:** Build ManageX incrementally from requirements audit to release using Google Antigravity, while keeping the approved PRD, stack, design direction, tenancy model and product scope under control.

## How to use this pack

1. Open the **ManageX repository root** as the Antigravity workspace (the folder containing `AGENTS.md`, `README.md`, `docs/`, `frontend/` and `backend/`).
2. Confirm that the complete approved PRD is saved as `docs/PRD.md`. Do not use a shortened summary in place of the PRD.
3. Keep the root `AGENTS.md` rules enabled. If it does not exist, use the **Master project rule prompt** below first and review the resulting file.
4. Paste **one phase prompt at a time**. Do not paste all phases together. Each phase is an implementation boundary.
5. Let Antigravity run the tests and commands needed for the current phase, subject to your local approval/sandbox settings. Review the phase report before starting the next phase.
6. Do not give production credentials or paste secrets into prompts. Configure secrets directly in the relevant local or hosting environment.
7. Keep the project repository private while the product and security checks are in progress.

The pack now explicitly defines a mandatory common-platform contract and a common-vs-module responsibility matrix. Every module prompt inherits these rules, so shared capabilities must be built once and reused rather than recreated per module.

The phase sequence below follows the ManageX PRD's Phase 0–11, with the three product modules divided into smaller, safer vertical slices. The subphases are not new product scope; they make the already-required module work easier to implement and verify.

---

# Fixed product contract — do not change between phases

- Product: **ManageX**, a modular, multi-tenant organisation-management SaaS.
- UI direction: **Clean Enterprise, light theme**: white and very light neutral surfaces, restrained blue/indigo accents, clear typography, subtle borders, moderate radii, compact readable tables, restrained shadows and minimal animation.
- Frontend: **React + TypeScript + Vite**, deployable to **Vercel**.
- Backend: **Node.js + Express.js + JavaScript ES Modules**, deployable to **Render**. Backend remains JavaScript; do not introduce backend TypeScript files or a backend TypeScript compilation step.
- Database: **PostgreSQL**, with **Neon** as the intended managed hosting option.
- Architecture: **modular monolith**, shared PostgreSQL database/schema, explicit domain boundaries. Do not create microservices.
- Initial modules: **Events & Hackathons**, **Meetings**, **Projects & Tasks**.
- Security model: **Platform → Organisation → Module**, shared permission catalogue, explicit scoped role assignments, backend authorisation and PostgreSQL Row-Level Security (RLS).
- Organisation-owned rows must have appropriate tenant scope, normally `organisation_id`. Use tenant-aware foreign keys/constraints and indexes where relevant.
- API base path: `/api/v1`. Use documented plural resources, consistent success/error response shapes, server-side pagination and backend Zod validation.
- Free-tier-minded deployment: Vercel + Render + Neon. Do not introduce paid vendors or AWS infrastructure as requirements. Document free-tier limitations honestly.
- The PRD in `docs/PRD.md` is the product source of truth. This prompt pack adds implementation discipline; it does **not** replace the PRD.

# Mandatory common-platform contract — shared once, reused everywhere

This section is a binding implementation contract for Phases 0–11. Every phase and every module prompt must consult it. The goal is one coherent product platform, not three separate CRUD applications sharing only a logo.

## A. Platform-wide capabilities (implement once)

1. **Identity and account lifecycle** — one user identity, normalized unique email according to the approved account model, password hashing, verification, login/logout, recovery, revocable sessions, account status, rate limits and secure cookie/CSRF/CORS configuration. No module-specific login systems.
2. **Organisation and membership** — organisation creation, ownership, membership lifecycle, invitations, switching, settings, and protection against removing/transferring the final owner incorrectly. Each user may belong to multiple organisations; every switch must refresh and isolate organisation-scoped data/caches.
3. **Three-level authorization framework** — separate platform, organisation and module scopes; central permission catalogue; explicit role/permission and membership/role assignments; resource-level policies; shared authorization helpers. Never use frontend visibility or a role-name string comparison as the sole security check.
4. **Tenant context and database security** — shared PostgreSQL/schema pool model; tenant-owned rows scoped to `organisation_id` as appropriate; RLS, runtime role without superuser/BYPASSRLS, tenant-aware foreign keys, parameterized queries, transaction-local tenant/user context, safe pooling, constraints and cross-tenant tests. Do not duplicate a weaker tenant-check implementation inside each module.
5. **Module catalogue and entitlements** — one central catalogue using stable keys `events`, `meetings`, `projects`; distinct states for platform availability, plan availability only if plans exist in the approved PRD, organisation activation, and current-user access. A disabled module must be blocked at the API, not merely hidden in navigation. Disabling must not silently delete its data.
6. **Audit infrastructure** — one shared, append-oriented audit mechanism for sensitive platform, organisation, membership, permission, entitlement and module actions. Record actor, action, resource, relevant organisation, outcome, request ID, safe metadata and timestamp. Never log passwords, raw tokens, secrets or confidential record contents. Normal application UI must not edit/delete audit history.
7. **API and validation conventions** — `/api/v1`, common response/error schema, request IDs, Zod runtime validation, parameterized SQL, predictable status codes, server-side pagination, safe error handling and structured logs. Document each protected endpoint’s auth, permission, resource-scope and tenant requirements.
8. **Shared design system** — one Clean Enterprise light theme and reusable accessible components: buttons, fields, selects/comboboxes, checkboxes/switches, date/time inputs, tables, cards, badges, menus, tabs, breadcrumbs, dialogs, tooltips, pagination, search/filter bars, toasts, alerts, avatars, validation messages, skeletons, empty states, loading states, error states, forbidden states and not-found states. Use the same tokens and interaction conventions in all modules.
9. **Shared application shell and navigation** — organisation switcher, clear active-organisation indicator, profile/account menu, logout, permission-aware navigation, breadcrumbs, responsive sidebar/header, consistent page headers and a separate platform-admin shell. Hide irrelevant links for usability but always recheck access in the backend.
10. **Shared frontend data/API layer** — one configured API client, typed TypeScript request/response contracts, consistent query/error handling, session expiry behaviour and cache invalidation. Key organisation-specific cache entries by organisation ID; clear/segregate data on organisation switch/logout. Do not make each module invent its own fetch wrapper or error format.
11. **Notifications and email delivery** — reuse one delivery abstraction only for email/notifications required by the PRD and actually configured. Centralize templates/provider configuration, safe delivery status, retry/error logging where implemented, and user-facing state. Never show “sent” before provider acceptance; do not add an in-app notification centre, notification preferences or queues unless the PRD requires them or a documented approval expands scope.
12. **Common list/form interaction standards** — server-side pagination for potentially large lists; validated search/filter/sort parameters; debounced search where useful; URL/query-state consistency where appropriate; prevent duplicate form submission; disable controls while submitting; preserve safe form state on recoverable errors; confirm destructive/high-impact actions; never show success before server confirmation.
13. **Shared observability and operations** — health/readiness endpoints, structured safe logs, request correlation, environment validation, migration commands, seed strategy limited to development/test, documented backup/restore and rollback procedures. Do not pretend that monitoring, backups, email or integrations are active if they are only documented.
14. **Shared quality/accessibility standards** — keyboard operation, visible focus, semantic headings/labels, accessible dialog focus, sufficient contrast, status not conveyed by colour alone, responsive layouts, and WCAG 2.2 AA as the target. Every workflow has loading, empty, success, error, forbidden and not-found behaviour where relevant.
15. **Shared delivery conventions** — tests, migrations, docs, requirements traceability and truthful phase reports. Keep shared utilities in shared/platform domains; keep domain rules inside their module. Add abstractions only when they represent a real shared requirement, not speculative future needs.

## B. Common vs module-specific responsibility matrix

| Capability | Shared platform owns | Each module owns |
|---|---|---|
| Identity/session | Login, session, account recovery and current identity | No separate authentication; only domain-specific eligibility rules |
| Tenant membership | Organisation, member status, invitations, active workspace | Resource-specific participant/attendee/project membership relationships where PRD requires them |
| Authorization | Permission catalogue, evaluator, scope checks, entitlement checks | Permission keys and resource policies defined for that module, using the shared evaluator |
| Database isolation | Transaction context, RLS patterns, roles, safe query conventions | Domain tables, constraints, tenant-aware relationships and module-specific RLS policies |
| Audit | Common audit storage/API/policies | Emit events for module-specific sensitive actions; never build a second audit system |
| UI | Tokens, components, shell, forms, tables, dialogs, feedback and responsive/accessibility patterns | Domain-specific pages, forms, views, filters and domain-specific status labels |
| API | Base path, error/response conventions, validation conventions, request IDs, pagination | Domain endpoints, business rules and typed contracts |
| Email | Approved shared provider/configuration/delivery reporting if required | Event invitations/updates or meeting invitations/updates only where PRD requires them |
| Dashboard | Shared workspace layout and permission-aware widget container | Real event, meeting and project/task summaries only when authorized and module is active |
| Search/activity | Shared reusable primitives only if needed and approved | Domain-specific search/filter fields and user-facing activity events; no global cross-tenant search |
| Files/attachments | No general file service in MVP unless PRD explicitly includes it | Events support URL submissions only; do not add arbitrary uploads |
| Analytics/reporting | No invented universal analytics platform | Only PRD-required real summaries/results, with appropriate visibility and aggregation |

## C. Domain-specific boundaries — do not blur them

- **Events & Hackathons (`events`)**: event lifecycle, publication/public fields, registration windows/capacity/eligibility, external event-scoped participants, teams, URL-based submissions, judge assignments, criteria/scores/comments and controlled result publication. Judges see only assigned work; unpublished scores remain private. No arbitrary file uploads, ticket sales, payments, livestream or certificates in MVP.
- **Meetings (`meetings`)**: scheduling/time zones, organiser, attendees, visibility, ordered agenda, confidential notes/minutes, action items and email invitations/updates where configured. Attendee access and note visibility are distinct checks. No built-in video conferencing or real-time collaborative editing.
- **Projects & Tasks (`projects`)**: project lifecycle/membership, tasks, assignment to eligible project members, approved statuses, List/Kanban views, assigned-to-me, due-soon/overdue, server-side filters/pagination and optional comments/activity only within the approved PRD. No full Jira clone, sprint planning, time tracking, Gantt, dependency engine or arbitrary workflow builder.
- **Platform administration**: platform catalogue/organisation controls, permitted support metadata and platform audit views, in a separate platform console. It does not mean unrestricted access to private tenant content, and it is not a billing/support-ticket product.

## D. Mandatory module-start and module-end protocol

At the beginning of every module subphase, Antigravity must:
1. Read the relevant PRD module section plus this common-platform contract and the current `docs/architecture.md`, `docs/security.md`, `docs/api-contracts.md`, `docs/database.md` and permission matrix.
2. List which shared services/components/APIs it will reuse and which domain-specific items it will add. Do this briefly before editing.
3. Inspect existing shared code first. Extend it where appropriate instead of duplicating it. Do not refactor shared foundations casually during a module phase.
4. If a required shared capability is missing or defective, record the dependency and implement only the minimum prerequisite with tests and documentation, or stop and report the blocker if it changes scope/security materially. Do not quietly build a parallel implementation inside the module.
5. Build one vertical slice at a time: migration/model → domain rules/validation → authorization → API → UI → automated tests. A screen without a working authorized API and persistent data is not complete.

At the end of every module subphase, verify and report:
- Which common platform components were reused (name actual files/modules; do not merely say “shared components used”).
- Which module-specific entities, permission keys, policies, endpoints and UI pages were added.
- No duplicate authentication, audit, permission evaluator, API client, design tokens or generic form/table framework was introduced.
- Cross-tenant and wrong-resource access attempts fail; tests cover allowed and denied roles.
- Loading, empty, error, forbidden, not-found and success states are implemented where applicable.
- Desktop/mobile usability, keyboard accessibility, real API persistence and test results are verified.
- Any suggested common feature that is not required by the PRD is listed in `docs/future-suggestions.md`, not implemented.

This contract applies to Phases 6A–6D, 7A–7C, 8A–8C and any later module. The agent must not interpret “professional”, “real-world” or “as detailed as possible” as permission to invent product scope. Implement the full depth of the approved requirements, and propose extras separately.

## Scope-control rules that apply to every prompt

1. Read `AGENTS.md`, `docs/PRD.md`, and the relevant current documentation before editing. Inspect the actual repository and existing implementation; never assume a clean repo.
2. Implement only the named phase. Do not quietly start the next phase, rewrite unrelated modules, or refactor stable areas without a direct dependency and a documented reason.
3. Do not make up product rules. If a detail is genuinely unresolved, inspect the PRD and existing code, select the least-privilege and least-surprising option only if safe, record the choice in `docs/decisions/`, and state the assumption in the report. If a decision could weaken security, change the data model materially, or expand scope, stop that specific part and report the blocker rather than silently choosing.
4. Optional ideas belong in `docs/future-suggestions.md`. Do not implement them in the MVP unless they are required by the PRD.
5. No fake functionality: no buttons that do nothing, fake API success, hard-coded dashboard metrics presented as real, pretend email delivery, fake integrations, mock production data, or “coming soon” screens presented as completed workflows. Clearly isolated mock data is acceptable only in a phase whose prompt explicitly permits it.
6. Do not introduce payment processing, billing-provider integration, AI features, chat, live video, native mobile apps, microservices, Kubernetes, HR/payroll, recruitment, file-upload pipelines, arbitrary workflow builders, public extension marketplaces, or SSO/SCIM unless the PRD is formally updated.
7. Keep dependencies deliberate. Reuse existing packages and patterns. Before adding a major dependency, state why it is needed and whether the existing stack can do the job. Do not silently add a second UI system, a second API client, or a second authorization framework.
8. Never store secrets in source control, logs, fixtures, screenshots, or generated docs. Never create a production admin with a known default password. Do not echo environment secret values in reports.
9. Never run destructive production operations, drop/replace production tables, reset a database containing user data, or publish a production release without explicit approval. Local tests and local migrations are permitted when safe.
10. Frontend route visibility is not authorization. Every protected API must verify authentication, tenant membership/status, module entitlement, permission and resource scope as applicable. RLS and database constraints remain required even when the API has checks.
11. For pooled PostgreSQL connections, set verified tenant/user context transaction-locally inside the same transaction/connection used by protected queries. Do not use a session-level tenant setting that can leak between requests.
12. Use parameterized SQL, validated inputs, safe output handling, least-privilege database roles and transactions for multi-record changes. Do not expose stack traces or raw database errors to clients.
13. Add/update automated tests whenever behaviour changes. Do not claim a command passed unless it actually ran and passed. Report skipped tests, environment blockers and known risks honestly.
14. Keep documentation in sync. At each phase, update `docs/requirements-traceability.md`, `docs/implementation-plan.md`, `docs/decisions/` (where appropriate), and relevant architecture/security/API/database/test/deployment docs.
15. Stop at the phase boundary. Do not start the next phase automatically. Report the result and wait for the next phase prompt.

---

# Master project rule prompt (use only if `AGENTS.md` is missing or needs a careful refresh)

```text
You are the implementation agent for ManageX. Before making substantial changes, read the complete docs/PRD.md and inspect the actual repository. Treat docs/PRD.md as the authoritative product specification and this repository's root AGENTS.md as the persistent execution contract.

Preserve this exact stack: frontend React + TypeScript + Vite; backend Node.js + Express + JavaScript ES Modules; PostgreSQL; intended free-tier deployment on Vercel, Render and Neon. Frontend TypeScript is allowed; backend source must remain JavaScript .js files and must not need a TypeScript build step. Use a modular monolith, not microservices.

ManageX has three independent access levels: Platform → Organisation → Module. Authentication, organisation membership, module entitlement, action permission, resource scope and database tenant isolation are separate checks. Enforce relevant checks server-side and through PostgreSQL RLS. Organisation-owned records must be tenant-scoped, use tenant-aware constraints where applicable, and never rely on a client-supplied organisation ID as proof of access. Use parameterized SQL and transactions. Tenant context for pooled database access must be transaction-local and set on the same transaction used for protected queries. Runtime database roles must not be superusers or have BYPASSRLS. Use least privilege.

Use a central permission catalogue and explicit role-permission assignments; do not make a single users.role field or scattered `if (role === 'admin')` checks the general authorization system. External event participants must remain event-scoped and must not become unrestricted organisation members. Platform support access must not imply access to private tenant content. Sensitive operations must be audited without logging secrets or private request bodies.

Build only the phase requested in the current prompt. Never silently expand scope or move to the next phase. Do not invent business rules, fake success, fabricate data/metrics/testimonials, silently ignore errors, or claim deployment/tests succeeded without evidence. No secrets in source control. Do not perform destructive production changes, provision paid resources, or publish production without explicit approval. Use docs/future-suggestions.md for optional ideas rather than implementing them.

Use a consistent documented API under /api/v1, runtime validation with Zod on the backend, typed API contracts on the frontend, consistent error responses and server-side pagination. Shared form, API, error-handling, authorization, audit and UI patterns must be reused across modules.

Design: Clean Enterprise light interface—white/light neutral surfaces, restrained blue/indigo, clear type, subtle borders, moderate radii, compact professional data views, accessible focus states, minimal animation. Target WCAG 2.2 AA where applicable. Responsive desktop, tablet and mobile. Every control must have a real action or be clearly disabled with a reason; forms must show real loading, success and failure states.

At every phase: create a brief plan, implement small understandable changes, update tests and docs, run the relevant commands, fix failures, and report actual evidence. Include modified areas, database/API/security changes, tests and outputs, failed/skipped checks, assumptions, limitations, risks, and the next recommended phase. Do not start the next phase without a new prompt.
```

---

# Phase 0 — Repository and requirements audit (NO PRODUCT CODE)

```text
PHASE 0 — MANAGEX REQUIREMENTS, REPOSITORY AND SECURITY DESIGN AUDIT

Mission: establish an accurate implementation blueprint before coding. Do not implement product features or scaffold applications in this phase.

First inspect the current workspace, Git status/history, root files, package manifests, frontend/backend directories, environment templates, existing migrations, tests and scripts. Do not delete, overwrite or reformat existing working code. Read the complete docs/PRD.md, not just headings or a summary, and read AGENTS.md. If the PRD is missing or truncated, report that as a blocker and do not infer its missing contents.

Verify and document these locked constraints:
- React + TypeScript + Vite frontend; Node.js + Express + JavaScript ES Modules backend; PostgreSQL database.
- No backend TypeScript compilation and no backend .ts source files.
- Modular monolith; shared database/schema multi-tenancy.
- Vercel frontend, Render backend and Neon PostgreSQL as the cost-conscious initial deployment target.
- Clean Enterprise light UI.
- Platform → Organisation → Module access layers; permission catalogue; scoped RBAC; PostgreSQL RLS; audit logs.
- Initial modules are Events & Hackathons, Meetings, and Projects & Tasks.
- MVP non-goals and constraints in the PRD remain out of scope.

Create or update these planning artefacts only; if a file already exists, preserve relevant material and reconcile it rather than blindly replacing it:
1. docs/implementation-plan.md — dependency-ordered phases, vertical slices, prerequisites, exit criteria and areas changed.
2. docs/architecture.md — runtime/deployment topology, frontend/backend boundaries, modular monolith boundaries, request lifecycle, auth lifecycle, tenant-context lifecycle, error handling and data access pattern.
3. docs/database.md — logical ER model, core entities, ownership/tenant boundaries, constraints, indexes, migration plan and which module tables arrive in which phase. Do not create migrations yet.
4. docs/security.md — threat model, trust boundaries, authentication vs membership vs entitlement vs permission vs resource scope vs RLS, secure cookie/CSRF strategy, external event participant boundary, platform support boundary, audit policy and high-risk tests.
5. docs/api-contracts.md — `/api/v1`, resource naming, validation, success/error shapes, pagination and endpoint-to-permission matrix.
6. docs/requirements-traceability.md — every PRD requirement/identifier mapped to planned phase, UI, API, database/security behaviour and test evidence to be added later.
7. docs/testing.md — unit, API integration, database/RLS integration, end-to-end, accessibility and deployment smoke-test strategy.
8. docs/deployment.md and docs/runbook.md — local/test/staging/production layout, Vercel/Render/Neon responsibilities, environment variable names (never values), migration/backup/restore/rollback and incident-check basics.
9. docs/decisions/README.md and an initial decision/risk log. Use small ADRs for non-trivial technical choices.
10. docs/future-suggestions.md — only optional ideas discovered during audit; none of these should be in current implementation scope.

Security design requirements to resolve explicitly before code:
- How authenticated identity is mapped to an active organisation membership.
- How organisation and user IDs are established in one database transaction.
- How transaction-local PostgreSQL settings are set on the same pooled connection/transaction as the protected queries.
- Runtime DB role privileges; ensure it cannot bypass RLS.
- RLS `USING` and `WITH CHECK` policies for SELECT/INSERT/UPDATE/DELETE and the implications of FORCE RLS.
- Tenant-aware foreign keys for child records and protection from cross-tenant references.
- Whether public event/guest endpoints use a narrowly scoped alternative path without bypassing tenant controls.
- How owner transfer, last-owner protection, invitation expiration/replay, permission delegation and audit immutability work.
- Session/cookie/CSRF strategy suitable for the chosen deployment origins.
- What happens if email provider configuration is absent.

For each unresolved item, label it `PRD-defined`, `existing-code-defined`, `safe implementation decision`, or `requires product decision`. Do not invent a feature to resolve ambiguity. When a decision is security-critical or materially affects data model/scope, document the risk and propose the safest options instead of silently deciding.

Review the module requirements in the PRD and create module-specific checklists for Events & Hackathons, Meetings, and Projects & Tasks. Preserve the PRD's exact lifecycle statuses and required data. Clearly list non-goals such as file uploads, live video, payments and unrelated product areas.

Do not install dependencies, create database migrations, build pages, or implement endpoints in this phase. Documentation and safe read-only inspection are the only changes unless a missing documentation folder/file must be created.

Before finishing, verify that the proposed phases cover all PRD requirements, that no requirement is silently dropped, and that the plan keeps backend JavaScript and frontend TypeScript separate.

Completion report must include: repository baseline; PRD completeness; files created/updated; decisions and risks; requirement coverage gaps; security-critical questions; exact proposed phase sequence; commands run (if any); and a PASS/BLOCKED result for the planning acceptance criteria. Stop after the report.
```

**Phase 0 is complete only when** the plan covers frontend, backend, database, UI, security, testing and deployment; all PRD requirements have a phase/test mapping; and the RLS/tenant-context design is explicit rather than hand-waved.

---

# Phase 1 — Project foundation, UI shell and design system

```text
PHASE 1 — MANAGEX FOUNDATION, APPLICATION SHELL AND DESIGN SYSTEM

Read AGENTS.md, docs/PRD.md, docs/architecture.md, docs/api-contracts.md, docs/testing.md and the approved Phase 0 report. Inspect current files before modifying them. Implement only the foundation and shell; do not implement real module business logic or invent new product features.

A. Workspace/tooling
- Configure a maintainable repository layout with clearly separated frontend, backend, database and test areas. If the repository already has a sound layout, preserve it.
- Frontend: React + TypeScript + Vite. Configure strict TypeScript checks, linting, formatting and test scripts.
- Backend: Node.js + Express + native JavaScript ES Modules in `.js` files. Configure linting and tests without a backend TS compile step.
- Create root scripts only when useful and document exactly what each script does. Avoid monorepo tooling solely for fashion.
- Add a complete `.gitignore`; ignore `.env`, secrets, `node_modules`, build output, coverage, logs, local database files and IDE/OS clutter. Keep `.env.example` committed with names and safe placeholders only.
- Validate required environment variable names at startup without printing their values. Provide safe, actionable missing-config messages.
- Provide predictable local commands for installing dependencies, starting frontend/backend independently, running tests, lint and type checking.

B. Backend foundation
- Create the Express application with a clear bootstrap, route registration, request ID/correlation ID, structured logging that redacts secrets, central 404 handling and central error handling.
- Define a documented `/api/v1` health/readiness endpoint that does not expose secrets or detailed infrastructure internals.
- Configure CORS for explicit allowed origins through environment configuration; never use permissive wildcard credentials.
- Define the standard API response/error conventions from docs/api-contracts.md. Do not add dummy business endpoints returning success.
- Add Zod runtime validation convention and a small example for a health or configuration endpoint only where useful; do not implement auth or domain features.

C. Frontend foundation
- Create app routing, a public layout, an authenticated-workspace layout shell, route-level not-found/forbidden/error patterns and a central API client abstraction.
- Configure the API base URL from environment variables. Use credentials only as required by the selected cookie/session design. Normalize backend errors; do not swallow failures.
- Create a route inventory matching the PRD: public landing/product/modules/security and auth routes; authenticated app/workspace and organisation shell; module routes may be placeholders until their module phase; separate `/platform` namespace for platform administration.
- Clearly label any placeholder page as not implemented; do not show fabricated activity, metrics or customer data.

D. Clean Enterprise design system
- Use the PRD's light theme: white/light neutral surfaces, restrained blue/indigo accents, clear typography, subtle border, sensible spacing, moderate corner radii, restrained shadows and minimal animation.
- Establish central tokens for colour, typography, spacing, radius, shadows, focus rings, z-index and breakpoints.
- Create reusable and accessible Button, Input, Textarea, Select/Combobox where needed, Checkbox, Switch, Date/Time input wrapper, Card, Table, Badge, Dropdown/Menu, Tabs, Breadcrumbs, Dialog/ConfirmDialog, Tooltip, Pagination, Search/Filter bar, Avatar, Skeleton, EmptyState, Alert, Toast and FormField components. If all cannot be responsibly implemented in this phase, prioritize the shared components required by the shell and document the rest; do not duplicate components per module later.
- Create a reusable responsive workspace shell: sidebar, top header, organisation-switcher placeholder, profile menu placeholder, breadcrumbs and content area. Distinguish future platform-admin navigation from organisation navigation.
- Provide appropriate loading, empty, error, forbidden and not-found states. All interactive controls must have keyboard/focus states, labels, disabled states and actual behaviour.
- Public landing page must follow the PRD and may describe the actual three modules. Do not invent testimonials, client logos, usage numbers, certifications or pricing plans.
- Login/register pages may be UI-only in this phase but must visibly be labelled as not yet connected to authentication; do not display fake successful authentication.

E. Responsive/accessibility standards
- Support desktop, tablet and mobile layouts. Mobile controls must be touch-friendly; tables may scroll horizontally only when necessary.
- Target WCAG 2.2 AA where applicable: semantic headings, labels, contrast, visible focus, keyboard navigation, accessible icon names, dialog focus management and clear form errors.
- Respect reduced motion. Avoid excessive gradients, glassmorphism, emoji-as-icons, overdecorated dashboards or different styling for each module.

F. Tests and documentation
- Add tests for central error handling, representative UI components and responsive/navigation behaviour where tooling supports it.
- Ensure frontend build and TypeScript checks pass; ensure backend starts and tests without a TS compilation step.
- Update README with prerequisites, setup, environment variable names, local start commands and current limitations.
- Document which screens are shells/placeholders and ensure the UI does not imply their workflows are complete.

Do not implement database-backed business features, authentication, organisations, RBAC or module-specific CRUD yet. Do not add a component library unless the Phase 0 decision explicitly approves it.

Acceptance tests: fresh install instructions are coherent; frontend build/typecheck/lint pass; backend lint/test/start pass; no backend `.ts` files or TypeScript build exists; API base path and error convention are documented; responsive shell works; no fake-success controls or fabricated production data remain.

Report exact commands, outcomes, files changed, placeholders intentionally remaining and any failed checks. Stop after Phase 1.
```

---

# Phase 2 — PostgreSQL core, migrations and tenant isolation foundation

```text
PHASE 2 — POSTGRESQL FOUNDATION, MIGRATIONS AND RLS BASELINE

Read the full PRD and approved database/security architecture. Inspect the actual DB access layer, dependencies and migration setup. Implement the shared database foundation only. Do not implement auth workflows or module-specific business flows yet.

1. Define or finalize the logical ER diagram/data dictionary for platform and organisation foundations. At minimum plan the user identity/session entities needed by Phase 3; organisations, memberships and invitations needed by Phase 4; role/permission/module entities needed by Phase 5; and later module-owned entities. Only create tables required by this phase and its foundational integrity; document later module migrations separately so this phase does not become a giant premature schema dump.
2. Choose a simple, explicit PostgreSQL access/migration method consistent with approved Phase 0 decisions. Prefer readable SQL migrations and parameterized queries. Do not add or change ORM/migration tooling without an ADR and clear reason.
3. Create versioned SQL migrations for core foundational tables as approved in docs/database.md. Use UUIDs or the identifier strategy already approved; consistent UTC timestamps; appropriate NOT NULL, CHECK, UNIQUE and foreign-key constraints; explicit deletion/retention behaviour; and useful indexes driven by expected access patterns.
4. Establish separate database privileges for migration/administrative operations and normal runtime access. The runtime role must not be superuser, table owner where that bypasses RLS, or have BYPASSRLS. Do not use a privileged connection to make application tests pass.
5. Create a transaction helper that pins all statements for a protected unit of work to one checked-out pooled connection. It must begin a transaction, set verified user and organisation context using parameterized, transaction-local settings, perform tenant-scoped queries on that same connection, and commit or roll back before releasing it. Never set the context on one connection and execute protected queries on another. Do not let tenant context leak into the next pooled request.
6. Add RLS policies for tables created in this phase where tenant-owned. Enable RLS; consider FORCE ROW LEVEL SECURITY where appropriate; define correct USING and WITH CHECK logic; deny by default when context is absent; and document exceptions for global platform records separately. RLS is not a substitute for authorization, and authorization is not a substitute for RLS.
7. Enforce tenant-aware foreign keys and uniqueness constraints where an entity relationship must not cross organisations. A record's organisation_id alone is insufficient if a child can reference a parent owned by another tenant.
8. Build an automated database test strategy with isolated test DB/schema. Test SELECT, INSERT, UPDATE and DELETE isolation separately; missing tenant context; wrong tenant context; cross-tenant foreign keys; role privileges; pooled connection reuse after alternating Tenant A and Tenant B; and rollback when an error occurs. Ensure test database setup never points to production.
9. Add safe seed strategy for non-secret reference/catalogue data only when required. No default production super-admin password, no production demo tenant, no secrets or personal user data in production seed files.
10. Update docs/database.md, docs/security.md, docs/testing.md, docs/runbook.md and requirements traceability with actual tables/policies/tests implemented and remaining planned schemas.

Safety rules: do not reset or drop a database with existing data; do not apply migrations to remote/production without approval; do not use hard-coded tenant IDs in production code; do not trust organisation_id submitted by the browser; do not expose raw SQL errors.

Acceptance criteria:
- A fresh local/test database can be created entirely from committed migrations.
- Migration ordering is deterministic and documented.
- Runtime DB credentials cannot bypass RLS.
- Tenant context is transaction-local and tied to the same connection/transaction as protected queries.
- Missing context and cross-tenant reads/writes are denied.
- Pool-reuse test proves Tenant A's context cannot leak to Tenant B.
- Database tests run with the intended runtime role, not a superuser.

Report schema/migration list, RLS policies, runtime/migration role separation, test commands/results, any unverified assumptions and whether the phase is PASS or BLOCKED. Stop after Phase 2.
```

---

# Phase 3 — Authentication and identity

```text
PHASE 3 — AUTHENTICATION, EMAIL VERIFICATION AND SESSION SECURITY

Implement the complete authentication lifecycle required by docs/PRD.md, using the already approved session/cookie strategy in docs/security.md. Do not add organisation-specific features or module workflows in this phase.

Required flows:
1. Registration with normalized email, validated fields, strong password policy appropriate to the product, server-side Zod validation and generic safe responses where account enumeration is a risk.
2. Password storage using a suitable modern password-hashing algorithm and safe parameters. Never store plaintext/reversible passwords.
3. Email verification using cryptographically secure, single-use, expiring tokens. Store token hashes where practical; never log or expose raw tokens beyond the intended delivery path. A user must not be treated as verified until the token is validated.
4. Login with generic failure messages, rate limits, session rotation after authentication, safe handling of unverified accounts and clear UX.
5. Secure logout that invalidates the server-side session/token as appropriate, clears cookies correctly and rejects subsequent use.
6. Forgot-password and reset-password flows with one-time expiring reset tokens, generic user-facing responses, rate limiting and invalidation of appropriate existing sessions according to the approved security policy.
7. `GET` current-session/me endpoint and frontend auth bootstrap/loading/expired-session states. Do not store long-lived authentication tokens in localStorage.
8. Secure cookie attributes appropriate to the actual deployment: HttpOnly, Secure in production, an intentional SameSite policy, scoped path/domain where required, correct CORS/origin settings and CSRF protection for cookie-authenticated state-changing requests. Do not assume local and production have identical origins.
9. Login, registration, verification, forgot/reset form UX with field validation, loading, success and failure states. Do not show email as delivered unless the configured provider accepts the request. If no provider is configured, fail safely in production and provide a documented local-development approach that does not leak into production.
10. Rate limits for login, registration, verification resend and password recovery; avoid locking legitimate users out through overly aggressive unscoped counters. Do not log passwords, session identifiers, cookies, reset/verification tokens or complete sensitive bodies.

Implementation requirements:
- Follow the PRD's `/api/v1` convention and documented response/error shapes.
- Protect all private endpoints through reusable authentication middleware.
- Use server-side validation, SQL parameterization and safe transactions.
- Add security audit events for appropriate identity/security events without logging secrets.
- Test valid and invalid credentials, unverified accounts, expired/replayed tokens, logout invalidation, reset flow, session fixation protection, brute-force rate limits, malformed inputs, CSRF/origin behaviour and cookie settings at least to the extent supported by the test environment.
- Ensure authentication proves identity only. It must not automatically grant platform, organisation, module or resource permissions.

Do not add social login, SSO, SCIM, MFA, billing or identity-provider integrations unless the PRD explicitly requires them. Put optional enhancements in docs/future-suggestions.md.

Acceptance criteria: the end-to-end auth lifecycle is functional; protected APIs return 401 when unauthenticated; invalid/expired sessions are rejected; secrets are not sent to frontend storage or logs; email failure is honest and recoverable; frontend and backend tests pass.

Run the relevant tests and update docs/security.md, docs/api-contracts.md, docs/testing.md and the traceability matrix. Report exact outcomes and stop after Phase 3.
```

---

# Phase 4 — Organisations, memberships, invitations and onboarding

```text
PHASE 4 — ORGANISATION LIFECYCLE, MEMBERSHIPS, INVITATIONS AND ONBOARDING

Implement tenant/workspace management on top of the approved authentication and RLS foundations. Read the PRD's organisation-owner/admin/member and invitation requirements. Do not implement full RBAC configuration yet beyond the minimal owner protection explicitly required for onboarding; Phase 5 owns the full permission system.

A. Organisation creation and onboarding
- Allow an authenticated user to create an organisation with validated name and approved settings.
- In one transaction, create the organisation and its initial owner membership/owner role relationship using the approved schema. Do not create an organisation without a valid owner or create an owner without an organisation.
- Guide a newly registered user through their real onboarding state: verify email if required, create or join an organisation, select a workspace, and land on the correct workspace overview.
- Handle zero organisations, one organisation and multiple organisations explicitly. Avoid trapping the user in a broken onboarding loop.

B. Organisation list and switcher
- List only organisations in which the current user has an active membership.
- Support organisation switching with a clearly visible selected organisation.
- Re-resolve and validate the selected organisation on the server for every protected API request. A route parameter or cached frontend selection is not proof of membership.
- Clear or refetch tenant-specific client cache/state on switch/logout so records from the prior organisation cannot flash or remain visible.
- If membership is suspended/removed, subsequent API requests must fail even if a browser tab remains open.

C. Membership administration
- Implement member list/detail where required, status lifecycle, role-safe display and authorized suspend/remove operations.
- Prevent removing or suspending the final active owner. If ownership transfer is required, follow the PRD's high-impact workflow with explicit confirmation and reauthentication when specified. Keep invariants safe under concurrent requests via transactions/constraints.
- Members cannot grant themselves higher privileges or bypass ownership protections.
- Record appropriate organisation/membership changes in audit logs.

D. Invitations
- Invite an email address with an intended organisation role/scope that the inviter is authorized to delegate.
- Store only appropriately protected invitation tokens; use expiry, single-use acceptance, email binding and revocation rules.
- Accept invitations idempotently/safely: reject expired/revoked/replayed invitations, wrong email where binding is required, unauthorized states and already-consumed tokens. Existing users may join after authenticating; new users may be routed through registration/verification first.
- Ensure concurrent invitation acceptance does not create duplicate memberships or bypass the permitted member role.
- Display pending, accepted, expired and revoked states accurately. Do not claim an invitation email was sent unless provider acceptance was confirmed.

E. Organisation settings and boundaries
- Implement only settings defined by the PRD; do not add billing, custom domains or unrelated configurable features.
- Every query, child record and response must respect tenant scope and the current membership status.
- Ensure an organisation administrator is not a platform administrator and cannot grant platform roles.

F. UI, APIs and tests
- Use established design-system forms/tables/dialogs/alerts and responsive behaviour.
- Add loading, empty, error, forbidden and confirmation states. High-impact removal/ownership actions require confirmation; no fake success.
- Use consistent `/api/v1/organisations` endpoints and documented contracts. All incoming bodies are validated with Zod.
- Test User A in Organisation X and Y; User B in Y only; direct URL manipulation; suspended/removed membership; invitation expiry/replay/wrong email; final-owner protections; duplicate/concurrent acceptance; RLS and audit behavior.

Acceptance criteria: a user can belong to multiple organisations; switching is clear and safe; invitations expire and cannot be reused; membership changes take effect immediately; cross-organisation access fails; ownership invariants hold under concurrent operations.

Update architecture/data dictionary/API/security/testing/runbook/traceability docs and report actual tests. Stop after Phase 4.
```

---

# Phase 5 — Platform/organisation/module RBAC, module catalogue and entitlements

```text
PHASE 5 — CENTRAL PERMISSION CATALOGUE, SCOPED RBAC AND MODULE ENTITLEMENTS

Build the authorization and module-entitlement layer that all three modules must reuse. Read the PRD's full three-level model and approved security design. Do not implement the platform-admin interface; Phase 9 owns that UI. This phase establishes data models, policies, APIs and authorised organisation-side access management needed by later module phases.

1. Central permissions and scoped roles
- Create a central, seeded permission catalogue with stable keys and descriptions. Preserve established keys from the PRD, including event, meeting, project/task and administration permissions.
- Model platform roles, organisation roles and module roles as distinct scope types. Do not use one global `users.role` field as the authorization system.
- Model role-to-permission assignments and membership-to-role assignments explicitly. Where applicable, role assignment must identify organisation and module/resource scope.
- Seed only documented baseline roles: platform Super Admin and Support Agent; organisation Owner, Admin and Member; module defaults such as Event Admin/Manager/Judge/Participant/Viewer, Meeting Admin/Organiser/Participant/Viewer, Project Admin/Manager/Team Member/Viewer. Actual capabilities must come from permission assignments and resource policy, not role-name string comparisons.
- Custom-role creation is permitted only where the PRD supports it. Users may delegate only permissions they are authorized to grant; prevent self-escalation and scope escalation.

2. Shared authorization evaluator
- Build reusable middleware/domain helpers for authentication, active membership, module entitlement, action permission and resource scope. Explicitly distinguish 401 unauthenticated, 403 authenticated but unauthorized, and intentional 404 hiding policy as documented.
- Evaluation order for an organisation request: authenticated identity → trusted/validated organisation context → active membership → module entitlement → action permission → resource ownership/assignment/participation constraints → tenant-scoped transaction/RLS → audit where required.
- Every service/API must use this reusable evaluator. UI visibility is only a convenience, never the enforcement layer.
- Ensure module roles do not automatically grant access to all resources; event judges see only assigned eligible work, meeting participants only entitled meetings/notes, and project members only authorized project/task scope.

3. Module catalogue and organisation entitlements
- Establish module catalogue records keyed by the PRD's stable keys: `events`, `meetings`, and `projects`.
- Support organisation-level activation/deactivation only for authorized users and allowed catalogue options.
- Centralize entitlement checks so controller logic cannot drift across modules.
- Inactive/disabled modules must fail protected API calls even when the user knows the URL.
- Define safe behaviour for deactivation where data already exists. Do not delete tenant data as a side effect of disabling a module. Follow PRD; if retention/access policy is unspecified, document the decision and choose a safe non-destructive default.
- Distinguish platform catalogue availability from an organisation's module entitlement and from individual user permission.

4. Audit
- Add audit records for role/permission changes, module activation/deactivation, permission delegation and other sensitive administration. Include actor, organisation when applicable, action, resource type/id, result, request ID, safe metadata and timestamp. Never log passwords/tokens or confidential contents.
- Protect audit reads by scoped permission and do not provide ordinary UI actions to edit/delete audit history.

5. UI and API
- Build organisation-side module catalogue/access screens and permission-aware member/role views according to the PRD. Do not build platform admin console now.
- Use typed frontend contracts with backend Zod schemas; standard pagination/error response shapes; optimistic UI only if safe and reconciled after server confirmation.
- On permission denial, explain that access is unavailable without leaking private resource existence/details.

6. Authorization test matrix
- Test same user with different organisation roles, module roles and resource assignments.
- Test organisation admin cannot access platform routes/actions or grant platform privileges.
- Test inactive module API denial; revoked role effect; unauthorized permission delegation; judge/participant/project resource restrictions; cross-tenant IDs in every relevant route/body; RLS remains a backstop.
- Test direct API calls bypassing the frontend.

Acceptance criteria: platform/organisation/module scopes are independent; authorization derives from explicit assignments/policies; deactivated modules reject API access; self-escalation is blocked; resource-level restrictions work; all critical policy paths have automated evidence.

Update docs/security.md, docs/database.md, docs/api-contracts.md, role/permission matrix, tests and requirements traceability. Stop after Phase 5.
```

---

# Phase 6A — Events & Hackathons: model, list/detail, create/edit and lifecycle

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 6A — EVENTS MODULE CORE AND EVENT LIFECYCLE

Implement only the Events & Hackathons core vertical slice. Re-read PRD section 6.1, the route structure, the event data model and the current authorization model. Do not implement unrelated modules. Preserve module key `events` and all shared auth/tenant/RBAC mechanisms.

Data and validation
- Add versioned SQL migrations for event core entities, tenant-aware constraints and query-driven indexes. At minimum support title, description, type (general event or hackathon), start/end date-time, IANA time zone, venue or online URL where applicable, registration open/close times, optional maximum participant count, status, organising/responsible users, participant instructions and relevant visibility/publication fields as defined by the PRD.
- Use UTC instants for persisted timestamps while preserving the event time-zone identifier needed for local scheduling/display. Validate start/end and registration windows consistently; reject nonsensical or conflicting dates. Document the precise policy for edge cases rather than relying on client validation.
- Store the exact PRD lifecycle: Draft, Published, Registration Closed, In Progress, Completed, Cancelled, Archived. Implement an explicit server-side transition map/guard. Do not accept arbitrary status strings or let the browser directly force any transition.
- Use only documented event fields. Do not add ticket sales, payments, file uploads, chat, livestream, certificate generation, QR admission, or external calendar sync.

APIs and security
- Add endpoints under `/api/v1/organisations/:organisationId/events` plus event subresources consistent with docs/api-contracts.md.
- Validate request params/query/body with Zod. Use parameterized SQL, transactions and standardized response/error formats.
- Require active organisation membership, active `events` entitlement, the relevant event permission and resource scope. A module role must not automatically permit every event.
- Draft/private events must not appear to unauthorized users. A published public event exposes only explicitly designated public fields; never serialize private fields then try to hide them in the UI.
- Enforce audit entries for event creation, meaningful updates, publish, cancellation and archive.

UI/UX
- Build Events index, event detail, create/edit form, status indicator and safe publish/cancel/archive confirmations.
- List supports server-side pagination and useful filters such as status, type and date range where supported by the PRD; sorting must be deterministic. Include search if approved by shared API convention.
- Detail layout should organize Overview, Schedule, Location/Access, Registration settings and Organisers without stuffing everything into one form.
- Provide proper empty, loading, request-failure, permission-denied, not-found and validation states. Forms preserve safe input after recoverable validation errors. Disable duplicate submissions while requests are pending.
- Use shared design-system components, responsive layout and accessible labels/focus states.

Tests
- Create/update/list/detail, permission denial, cross-tenant event ID, inactive module, invalid dates/time zone, every allowed/forbidden lifecycle transition, draft visibility, private event visibility, audit creation and server-side pagination.
- Include timezone boundary tests and ensure client and backend do not disagree about which registration/scheduling instant is being displayed.

Do not begin registration, teams, submissions or judging in this subphase; those are later Phase 6 subphases. Acceptance means event lifecycle is truly persisted and enforced from API to UI, not merely represented by badges. Update migrations, docs, traceability and tests; report actual results and stop.
```

---

# Phase 6B — Events & Hackathons: public/event-scoped participant registration

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 6B — EVENT REGISTRATION, CAPACITY AND EXTERNAL PARTICIPANTS

Implement event registration and participant management only. Preserve Phase 6A event lifecycle and use the shared authorization/RLS/entitlement layers. Carefully read EVT-004 and EVT-005 in docs/PRD.md.

Registration workflow
- Support eligible authenticated organisation users and the PRD's external event-participant path for public events. An external participant is NOT automatically an organisation member and must receive no organisation-wide access.
- Validate on the server: event is published and accepting registration; registration opening/closing window; event not cancelled/archived/closed; capacity; duplicate registration; eligibility rules where configured; and every required field. Store registration state and timestamps using a clearly documented model.
- Enforce capacity transactionally under concurrent registration attempts. Use a locking/atomic strategy that prevents overbooking; write a concurrency integration test where simultaneous requests compete for the final available slot.
- Prevent duplicate registrations using database uniqueness constraints as well as service-level checks. Handle retries/idempotency safely so double-click/network retry does not create duplicates.
- Respect any event registration rules/required fields present in the PRD. Do not invent payment, waitlists or complex participant verification workflows. If waitlist behaviour is not specified, do not implement it; record it as a future suggestion.
- Allow a participant to view their own registration and allowed public event information. Event staff can search/manage participants only inside their assigned/permitted event scope. Avoid returning participant personal details to unauthorized users.

API/UI
- Implement registration create/read/update/cancel or withdrawal only to the extent defined by the PRD. Define status transition rules; do not silently permit arbitrary state edits.
- Build event registration form, confirmation/success only after server confirmation, own-registration status view and authorized staff participant table with search/filter/pagination.
- Handle sold-out/full event, not-yet-open, registration-closed, duplicate, ineligible and cancelled-event states with clear copy. Never show a success screen when the API rejected registration.
- Keep public endpoints narrowly scoped and rate-limited. Avoid public enumeration of registrants or private event details. Validate and rate-limit guest access paths.
- Audit administrative registration changes and other sensitive participant actions.

Tests
- Before opening/after closing registration; published vs draft/private/cancelled/archived event; capacity edge; concurrent overbooking attempt; duplicate retries; ineligible participant; own-registration visibility; staff permission scope; malicious organisationId/eventId changes; external participant cannot list organisation members or access other modules; RLS and audit policy.

Do not add email notifications unless already required/enabled by the PRD's approved email configuration; do not add file uploads, payments, ticketing or QR codes. Update docs and traceability. Run tests and stop after Phase 6B.
```

---

# Phase 6C — Events & Hackathons: teams and URL-based submissions

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 6C — HACKATHON TEAMS AND SUBMISSION WORKFLOW

Implement team management and submission handling for hackathons only where the event has these capabilities enabled. Follow EVT-006 and EVT-007. Do not build a generic social network or file-storage feature.

Teams
- Teams exist only for eligible hackathon events where teams are enabled by the event's configuration.
- Team creation requires an eligible participant and permission; model team owner, members, timestamps and status only as needed by the PRD.
- Enforce configurable minimum/maximum team size only if those settings are present in the approved event rules; at minimum enforce the configured maximum. Make eligibility and the exact transition rules explicit in docs.
- Validate invitations/additions so participants are eligible for this event, are not duplicated, and cannot join multiple teams in violation of the event's rules. Prevent race conditions with database uniqueness constraints and transactions.
- Team owners can invite/add eligible participants only within the allowed rules. Do not allow a participant to silently bypass an invitation/approval rule by calling an API directly.
- Provide authorized team list/detail and clear membership actions. Users may see only eligible team information and their own participation scope.

Submissions
- Support URL-based submission records with title, description, repository URL, demo URL and safe relevant metadata per PRD. Validate URL schemes and input length; reject unsafe or invalid URLs according to a documented rule. Do not fetch arbitrary supplied URLs server-side.
- Allow submissions only during the configured submission window and only by eligible individual participants/teams. Check the correct participant/team ownership, event status and permission.
- Define whether an eligible team has one submission or multiple revisions based on the PRD/event configuration. If unspecified, choose a simple documented rule consistent with the competition workflow and do not invent a complex versioning system.
- Enforce ownership on create/update; `submission.update_own` may update only the user's eligible submission and only while editing is permitted. Keep timestamps and audit significant submission changes as required.
- File uploads are expressly out of scope for MVP because storage, scanning, access and retention controls are not specified. Do not implement attachments.

UI/UX
- Team list/detail/member management with invitation/add/leave/remove states and confirm destructive membership changes.
- Participant view shows own eligible team and submissions. Event manager view shows team/submission lists only if authorized.
- Submission form has validation, URL fields, save state and precise closed-window/ineligible states. Do not display private repository/demo URLs beyond authorized scope.
- Use shared design-system patterns; responsive tables/cards; server-side pagination/filtering for staff lists.

Tests
- Team size cap, duplicate membership, cross-event membership, ineligible user, concurrent add-to-team, unauthorized owner/team mutation, submission window boundaries, own submission vs another participant's submission, editing after deadline, event cancellation/archive, malicious cross-tenant references and RLS constraints.

Do not implement chat, file upload, GitHub OAuth/webhooks, automatic repository inspection, code execution, plagiarism checking or judge AI. Update the data model/API/policies/tests/docs and stop after Phase 6C.
```

---

# Phase 6D — Events & Hackathons: judge assignment, scoring and results

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 6D — JUDGE ASSIGNMENTS, SCORING, FEEDBACK AND RESULTS

Implement event judging/evaluation/results as defined by EVT-008 and EVT-009. This is a sensitive resource-scoped workflow. Do not treat “Judge” role membership as access to every event or submission.

1. Judge assignments
- Authorized event managers assign a judge to the permitted event and/or eligible submissions, following the approved data model.
- Validate that the judge is an eligible identity and that the assignment belongs to the same organisation/event. Use tenant-aware constraints and transactional changes.
- Judges can list/view only assigned events/submissions. Test APIs directly with unassigned IDs; hiding the UI is insufficient.
- Assignment changes and revocation must take effect immediately and be audited.

2. Scoring criteria and scores
- Allow authorized event administrators to configure criteria with clear name/description and defined score ranges while the event permits configuration.
- Enforce numeric boundaries and required criteria on the server, not just with frontend input constraints. Prevent duplicate or conflicting scores according to the selected scoring model.
- Support evaluator comments/feedback if enabled. Define whether scoring can be edited and until when. Enforce a controlled submission/editing period; closed evaluation must reject updates.
- Store judge/submission/criterion relationships and scoring timestamps with correct FKs and uniqueness.
- If a scoring aggregation/result calculation is specified by the PRD, implement it transparently and test it. If the PRD does not specify weighting/tie-breaking, do not invent elaborate rules: document the simple calculation/proposal and keep configuration limited to what's approved.

3. Results and visibility
- Authorized admins can review evaluation results and publish results where appropriate.
- Unpublished scores, internal judge feedback and evaluation details must never be exposed to participants, external guests, other judges or unrelated organisation members unless a specific permission allows it.
- Results publication must be an explicit authorized action with confirmation and audit log. Define behavior for event cancellation/archive and unpublished evaluation records consistently.

4. UI
- Judge assignment interface; judge-only assigned work list; submission detail; criteria/score form; evaluation completion states; restricted admin results view; explicit result-publish workflow.
- Clear empty states for no assignments/no submissions/no scores; loading/error states; prevent duplicate score submission; display validation errors for out-of-range/closed scoring.
- Use the existing design system and responsive layouts, not a separate judging UI theme.

5. Tests
- Assigned vs unassigned judge; judge from other organisation; unauthorized criteria changes; out-of-range score; duplicate score; closed/edit-disabled score; unpublished result access attempt; publishing permission/audit; concurrent score submissions; cross-tenant references; role revocation.

Do not add tournament brackets, automated judge matching, AI scoring, public leaderboards beyond explicit result publication, video judging or file uploads. Update module documentation and traceability; run the complete Events suite (6A–6D), database/RLS/integration tests and relevant e2e workflows. Report any failure honestly and stop.
```

---

# Phase 7A — Meetings: scheduling, attendees, lifecycle and calendar/list

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 7A — MEETINGS CORE, SCHEDULING, ATTENDEES AND CALENDAR

Implement the meeting core from PRD section 6.2 and MTG-001 through MTG-004/007. Reuse shared identity, organisation context, RBAC, RLS, audit and design-system utilities; never duplicate them inside the meetings module.

Data/lifecycle
- Create migrations for meetings and attendee relationships, with organisation scope, tenant-aware constraints, uniqueness for attendees and query-relevant indexes.
- Fields required by the PRD: title; description/objective; start/end date-time; time zone; location or meeting URL; organiser; attendees; ordered agenda; visibility; status.
- Use the exact lifecycle statuses: Scheduled, In Progress, Completed, Cancelled. Do not silently transition old meetings based only on a client page render. Any automatic transition must be documented and tested; otherwise require explicit transitions/actions according to approved rules.
- Validate end after start, time-zone handling, organizer eligibility, attendee eligibility, visibility and status transitions on the backend. Persist instants consistently in UTC and retain the relevant time-zone identifier for correct local display.
- Use parameterized queries and transactions for creating/updating a meeting plus attendee/agenda records.

Attendees and access
- Organizers can add/invite eligible attendees only with the relevant permission.
- Attendee lists and participation details are visible only to authorized users. Ordinary attendees can view only meetings they're entitled to access and their own participation information.
- Meeting visibility must be an authorization rule backed by backend policy and database filtering; it is not just a UI checkbox.
- Remove/revoke attendee access immediately on subsequent requests. Do not accidentally make all organisation meetings visible to all organisation members merely because they share a tenant.

Agenda
- Provide ordered agenda items with optional descriptions and time allocation. Validate ordering and reasonable numeric/time input. Preserve sequence and update it safely when items are reordered.

UI/APIs
- Meeting list includes upcoming and past views and filters by date/status/organizer; implement deterministic server-side pagination. Calendar-style presentation is required where practical; if a full calendar library is proposed, assess bundle size, accessibility and dependency need before adding it.
- Meeting detail sections: Overview/Schedule, Attendees, Agenda, and later Notes/Action Items (the latter become functional in Phase 7B).
- Create/edit/cancel flow with explicit confirmation where high impact. Never show a cancellation or invitation as complete until the API/provider outcome is known.
- Implement `/api/v1/organisations/:organisationId/meetings` routes and subresources consistent with the shared contract.

Tests
- Valid/invalid time ranges; time-zone boundaries/DST where testable; unauthorized visibility; non-attendee access; attendee add/remove; duplicate attendee; cancelled meeting access/update rules; invalid lifecycle transition; cross-tenant meeting IDs; module disabled; pagination/filter correctness; audit event creation.

Do not implement integrated video conferencing, automatic transcript, external calendar sync, recurring meeting series or file attachments unless the PRD explicitly includes them. Put unapproved ideas in future suggestions. Update docs and stop after Phase 7A.
```

---

# Phase 7B — Meetings: confidential notes/minutes and action items

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 7B — MEETING NOTES, CONFIDENTIAL MINUTES AND ACTION ITEMS

Extend the existing meeting core without altering its tenancy/auth conventions. Follow MTG-005, MTG-006 and meeting permission keys in docs/PRD.md.

Notes/minutes
- Implement notes/minutes with author and timestamps and the visibility policy defined by the PRD/security design. If confidential-note scope is not represented in the approved model, pause only that part, write a decision proposal, and do not ship a default that exposes confidential notes to all attendees.
- Apply permission checks before loading notes; do not return private note text in API payloads to users who cannot read it and then hide it in the browser.
- Support create/update only for authorized users. Audit protected-note changes as appropriate, but never copy the full confidential note body into audit metadata.

Action items
- Implement action items with title, description, assigned user, due date, priority, status and optional source agenda item as specified in the PRD.
- Ensure each action item has correct organisation and meeting relationship; assigned users must be eligible users or explicitly supported participants under the approved rules.
- Validate updates and any defined status transitions on the server. Keep action items attached to their source meeting and validate any source agenda item belongs to the same meeting/organisation.
- Enforce resource permissions: only appropriate organisers/attendees/assignees/roles may view or change an action item, based on approved policies. Do not make every action item visible globally within an organisation by default.
- Provide meaningful due-date display and overdue state based on server time/date semantics; do not silently change action status simply because its due date passed.

UI
- Meeting detail tabs/sections for Notes & Minutes and Action Items; add/edit form; assignee/due date/priority/status; empty/loading/error/forbidden states; clear confidential badge/visibility explanation when appropriate; confirmation for destructive changes.
- Provide accessible form labels and keyboard operation. Keep screen clutter manageable; do not create a giant one-page form containing all meeting data.
- Link action items back to the meeting and optional agenda item without exposing resources the current user cannot access.

Email notifications
- Only send meeting invitations/updates when the configured email provider is enabled and the PRD-approved notification behaviour requires it. Use the established email abstraction; do not add a second provider. Do not report an email as “sent” until the provider accepts the send request; clarify that acceptance is not proof of final delivery. Failures must be observable and retriable only according to a safe documented policy.

Tests
- Confidential note access by organizer, authorized roles, attendees and unauthorized users; direct API and cross-tenant access attempts; action item assignment eligibility; agenda/meeting mismatch; date/status validation; removal of attendee and subsequent note/action access; notification provider failure and duplicate submission handling; audit without sensitive content.

Do not add tasks to Projects automatically unless the PRD explicitly defines that integration. Do not add chat/transcripts/video. Update API/data/security/testing docs and traceability. Run the complete Meetings suite (7A–7B), report results and stop.
```

---

# Phase 7C — Meetings: integration and end-to-end acceptance

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 7C — MEETINGS INTEGRATION, ACCESS REGRESSION AND E2E ACCEPTANCE

Do not add new meeting features. Stabilize and verify the complete meeting module built in 7A–7B.

Walk through the complete user journeys in the actual UI:
1. An authorized organiser creates a scheduled meeting with time zone, location/URL, attendees and ordered agenda.
2. Invalid schedule/attendee data is rejected clearly.
3. The meeting is edited or cancelled by an authorized organiser and the audit trail is correct.
4. An attendee sees only entitled meeting data and cannot access confidential notes without permission.
5. An authorized user creates/updates notes and action items; eligible assignee can see the permitted item; cross-tenant and cross-meeting references fail.
6. Search, filters, upcoming/past lists, calendar-style view and pagination behave correctly.
7. Any configured email operation handles accepted/failed provider responses honestly.
8. Module deactivation or membership/role revocation blocks subsequent access.

Add/fix unit, API integration, RLS, security and browser E2E tests. Test Tenant A/Tenant B plus two users in the same organisation with different roles. Check accessible keyboard operation, narrow viewport layout, loading, empty, error and forbidden states. Run lint, frontend typecheck/build, backend tests and the relevant DB/RLS suites.

Only change code when needed to fix a demonstrable defect or complete a PRD requirement. Do not refactor unrelated modules or add features. Update the Meetings traceability checklist and record all known limitations. If any security-critical test fails, mark Phase 7C BLOCKED and explain the issue rather than masking it. Stop after reporting actual evidence.
```

---

# Phase 8A — Projects & Tasks: projects, membership and project lifecycle

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 8A — PROJECT CORE, MEMBERSHIP AND PROJECT LIFECYCLE

Implement the Project part of Projects & Tasks using PRD section 6.3 and PRJ-001/PRJ-002. Preserve module key `projects` and shared permission, tenant and audit utilities.

Project model
- Create project tables/migrations with organisation scope, name, description, project owner, start/target completion dates, status, priority, project members and optional labels as defined by the approved model.
- Enforce tenant-aware references for project owner/members/labels where applicable. A project member must belong to the same organisation and be eligible under the approved rules.
- Use the exact project lifecycle: Planning, Active, On Hold, Completed, Archived. Implement server-side transition validation. Do not allow arbitrary status values or a browser-only status change.
- Validate dates, text length, allowed priority values and archive rules. Do not silently permit editing archived projects or create a destructive cascade without an approved retention policy.
- Project membership is resource-scoped: organisation membership alone does not necessarily authorize access to every project. Read the approved project visibility policy and enforce it consistently for list, detail and nested tasks.

APIs/UI
- Endpoints under `/api/v1/organisations/:organisationId/projects`, with subresources for project detail and members where appropriate.
- List/detail/create/edit/archive flows, project status/priority badges, dates, owner, members and optional labels.
- List uses server-side pagination, useful filters and deterministic sorting. Search should use the shared convention and not load every project into the browser.
- Project detail should have a clear header and separate Overview, Members and Tasks section/route placeholder (Tasks will become functional in 8B).
- Restrict member management to permitted users; prevent removing the last required owner/manager if that invariant is defined. Confirm high-impact operations.
- Use shared design-system components and proper responsive/accessibility states; no fake analytics or populated sample project metrics presented as live data.

Authorization/audit
- Check active membership, module entitlement, `project.*` permission and project resource scope on every operation.
- Audit project creation, archive, membership and permission-sensitive changes.
- RLS and tenant-aware foreign keys must block cross-tenant projects/members/labels.

Tests
- Valid lifecycle transitions and invalid transitions; owner/member eligibility; project visibility between authorised and unauthorized members; archive behaviour; role/module revocation; cross-tenant project ID; pagination/filter; audit records and permission-denied UI/API behaviour.

Do not implement task workflows yet; Phase 8B owns tasks. Do not add Gantt charts, sprints, story points, time tracking, billing, project templates or external integrations unless explicitly present in the PRD. Update docs/tests/traceability and stop.
```

---

# Phase 8B — Projects & Tasks: task workflow, assignment, list and Kanban

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 8B — TASK MODEL, ASSIGNMENT, STATUS RULES, LIST AND KANBAN

Implement task workflows exactly around PRJ-003 through PRJ-006. Inspect the current project model and permission matrix first. Use the shared project membership and authorisation policies; do not build a separate task authorization framework.

Task model and integrity
- Task fields: title, description, parent project, assignee, creator, status, priority, optional start date, due date, creation/update timestamps and optional labels where approved.
- Exact initial statuses: Backlog, To Do, In Progress, Blocked, Done. Store and validate status in the backend domain layer. Create an explicit transition map; if PRD does not explicitly restrict which transitions are valid, document the chosen simple workflow and test it. Do not let the frontend submit arbitrary transition states without server validation.
- Assignment is permitted only to eligible project members according to policy. Enforce this in the server and with appropriate DB constraints wherever possible. Prevent assignment to a user from another organisation or an unauthorized project.
- A task must reference a project from the same organisation. Label relations must not cross organisations. Use transactions for task-plus-label updates and tenant-aware foreign keys.
- Define task delete/archive behaviour. Avoid destructive cascading of tasks/comments without an approved retention policy.

Task operations
- Create, view, update, assign/reassign and delete only where permission and lifecycle rules allow.
- Filter by status, assignee, priority, due date, project, and labels where implemented. Search/pagination run on the server and use stable sorting.
- Provide List view and Kanban view; also `Assigned to me`, `Due soon` and `Overdue` views per PRD. Do not fetch all tasks and filter locally.
- Kanban drag/drop must call an authorized API mutation, show pending/error state and revert or reconcile if the server rejects the change. Do not mark a card moved permanently before the server accepts the transition.
- Handle overdue based on due date and defined time-zone semantics; do not auto-change task status solely due to its due date.
- Build usable filters that can be cleared; maintain URL/query state only where useful and safe.

UI
- Task create/edit panel/page with clear fields, project, assignee, priority, status, dates and labels where enabled.
- Task detail should show context such as project, assignee, creator, status, due date and audit/activity summary only where implemented.
- Provide empty/loading/error/forbidden/not-found/validation states, confirmation before delete, and safeguards against double submission.
- Keep board cards compact and accessible. Provide a keyboard-accessible alternative to drag/drop; do not make dragging the sole way to change status.

Tests
- Invalid status transition; unauthorized assignee; non-project-member assignment; cross-tenant project/task/label; permission denied through direct API; concurrent status changes if relevant; due-date boundaries; pagination and filters; Kanban rejected mutation; disabled module and revoked membership.

Do not add dependencies, recurring tasks, subtasks, dependencies/Gantt, time logging, file attachments, external integrations or notification delivery unless explicitly defined by PRD. Update docs/traceability and stop after Phase 8B.
```

---

# Phase 8C — Projects & Tasks: comments/activity and full acceptance

**Mandatory inheritance:** Before editing, follow “Mandatory common-platform contract — shared once, reused everywhere” above. Reuse the established shared auth/session, tenant context/RLS, RBAC evaluator, module entitlement checks, audit infrastructure, API client/response conventions, design system, form/table/dialog/feedback components, navigation, error handling and accessibility patterns. Do not create module-local replacements. Add only the domain-specific behaviour listed in the approved PRD and this phase.

```text
PHASE 8C — TASK COMMENTS/ACTIVITY (ONLY IF MVP-APPROVED), INTEGRATION AND E2E

First inspect docs/PRD.md and the Phase 0 traceability matrix to confirm whether task comments/activity are included in the approved MVP. If not included, do not implement them; document as a future suggestion and use this subphase for end-to-end acceptance only.

If included:
- Implement task comments with author, timestamp and task/organisation relationship. Comments inherit the task's tenant and resource permissions; unauthorized users must not list, create, edit or delete comments by changing IDs.
- Keep edit/delete policy simple and documented; do not implement a complex moderation system without approval.
- A project/task activity feed may record selected changes such as assignment, status and due-date changes. Avoid exposing internal security metadata, session details, secrets or confidential audit payloads in the general activity feed. Separate compliance audit logs from user-facing activity when required.

Regardless of comments:
- Walk through create project → add eligible member → create task → assign task → change status in List and Kanban → filter assigned/due-soon/overdue → verify audit/activity → revoke access → verify access is blocked.
- Test the full resource hierarchy and all cross-tenant references.
- Verify UI at desktop/tablet/mobile widths, keyboard usage, loading/empty/error/forbidden states and server-side pagination.
- Add or fix tests for project lifecycle, task lifecycle, assignment policy, labels, comments if included, audit behaviour and API/RLS tenant isolation.
- Run all relevant migrations from a fresh test database, unit tests, API integration tests, RLS suite, frontend typecheck/build/lint and browser E2E tests.
- Do not add unapproved features or do unrelated cleanup. Update docs, evidence, limitations and requirements traceability.

Acceptance: project/task workflows are complete in the real UI; invalid transitions/assignments are rejected server-side; task/project/label/comment references cannot cross tenants; shared authorization is used throughout; all actual test results are reported. Stop after Phase 8C.
```

---

# Phase 9 — Platform administration and operational controls

```text
PHASE 9 — PLATFORM ADMIN CONSOLE AND OPERATIONAL CONTROLS

Implement only the platform-level administration scope in the PRD, re-reading role boundaries for Platform Super Admin and Platform Support Agent. This is not an organisation-admin dashboard. Keep platform routes under `/platform` and use a distinct layout/navigation.

A. Platform authorization boundary
- Platform actions require explicit platform-scoped permissions, not simply organisation Owner/Admin role names.
- Platform Support Agent receives only permitted account and operational metadata and support workflows. Support does not imply unrestricted access to private tenant content.
- Super Admin powers must still be audited and least-privileged. Do not build an unlogged “view as tenant” or unrestricted private-content browser. Do not allow a support user to assign themselves platform privileges.
- Protect UI routes and every API separately. Test direct API access by normal users, organisation admins and support roles.

B. Platform screens/features from the PRD
- Platform overview using real, appropriately aggregated operational data only; if data is unavailable, display a transparent empty state, not made-up counts.
- Organisation administration: list/search/paginate organisations; view permitted metadata and status; perform allowed disable/enable operations only with explicit confirmation and audit. Do not expose tenant private records through these views.
- Module catalogue administration: manage the approved catalogue state/availability for `events`, `meetings`, `projects`; validate changes and audit them. Do not create arbitrary new product modules via UI unless PRD explicitly allows that.
- Platform users/support roles and permitted support workflows, within the PRD. Do not create a ticketing product unless approved.
- Platform audit logs with secure filtering/pagination and protection against editing/deleting audit entries through normal screens.
- Operational health/readiness status using safe metadata only; do not expose secrets, connection strings or detailed internal errors.
- Platform settings only for fields defined in the PRD. Do not add billing, payments, pricing administration or customer subscription provider integration.

C. Tenant and audit behaviour
- Platform-wide operations with no organisation ID must be explicitly represented and audited as global operations; tenant operations record the relevant organisation.
- Disabling an organisation/module must be safe and non-destructive; define exactly which subsequent actions are blocked and what happens to existing records according to the PRD and documented decision.
- Use transactions for high-impact state transitions and prevent accidental duplicate submissions.
- Audit actor, action, resource, result, request ID, safe metadata and timestamp; never log sensitive tenant payloads or secrets.

D. UI and operations
- Distinct platform header/navigation and clear indication that an admin is in the platform console, not a customer workspace.
- Search, filters, pagination, empty/error/forbidden states and confirmations; no action that silently does nothing.
- Document health checks, monitoring approach, backups/restoration and support limitations in docs/runbook.md. Only integrate tooling already configured/approved; do not claim monitoring/backups are active when only docs exist.

E. Tests
- Platform role allowed/denied matrix; organization admin cannot access platform endpoints; support cannot browse private tenant content or promote themselves; module/organisation disable effects; audit event generation; audit records cannot be mutated using ordinary platform APIs; cross-tenant data not leaked in counts/search/errors.

Do not add tenant impersonation, unrestricted support access, billing, payment providers or extra platform roles not required for MVP. Update docs/security.md, api contracts, runbook, tests and traceability. Report implemented vs merely documented operational controls clearly, then stop.
```

---

# Phase 10 — Security, UX, accessibility, reliability and performance hardening

```text
PHASE 10 — CROSS-CUTTING HARDENING; NO NEW PRODUCT SCOPE

Run a structured review of the complete implementation built through Phase 9. This phase is for finding and fixing defects against the PRD, not for adding features or redesigning the architecture without evidence.

1. Tenant-isolation and authorization audit
- Build a route-by-route inventory of protected APIs and map each to authentication, organisation membership/status, module entitlement, permission, resource scope, RLS and audit requirements.
- Review every list/detail/create/update/delete route for direct-ID and organisationId manipulation, mass assignment, insecure object references, role escalation and hidden-field leakage.
- Verify every organisation-owned table has correct RLS and tenant constraints. Test SELECT/INSERT/UPDATE/DELETE and missing context separately.
- Test RLS using the actual least-privilege runtime DB role, not superuser/owner/BYPASSRLS. Test pooled connection reuse alternating tenants and error/rollback paths. Check no transaction-local tenant context leaks.
- Test external event participant isolation, assigned-vs-unassigned judges, confidential meeting notes, project membership and platform support restrictions.

2. Authentication/session/HTTP security
- Check secure cookie flags, session rotation/invalidation, CSRF protection, origin/CORS validation, rate limiting, token expiry/replay, reset/verification flows, request size limits and security headers.
- Verify sensitive fields never appear in logs, traces, generic error responses or frontend storage. Ensure production errors do not leak stack traces/SQL detail.
- Confirm authorization failures are consistent (401 vs 403, or intentional documented 404). Confirm rate limiting does not inadvertently reveal account existence.

3. Validation and database consistency
- Review Zod schemas for route params/query/body; protect mass assignment; validate pagination limits, URLs, dates, time zones, statuses and enums on the server.
- Review SQL parameterization, transaction boundaries, FK/unique/check constraints, migration order, deletion/archive behaviour and index rationale.
- Test concurrency-sensitive workflows: event capacity, registration uniqueness, team membership, invitation acceptance, owner invariants, scoring, assignment and task status changes.

4. UX/accessibility/responsiveness
- Exercise loading, empty, error, forbidden, not-found and validation states for every major page. Make sure state changes appear only after API success or safely roll back on failure.
- Confirm all buttons/menus/forms behave; remove dead controls and unmarked mock placeholders.
- Test keyboard navigation, focus indication, modal focus handling, labels, contrast, heading structure, accessible names, reduced-motion preference and WCAG 2.2 AA checks where applicable.
- Test desktop, tablet and narrow mobile widths. Fix overlap, clipped primary actions and unreadable tables. Avoid adding visual effects/features during hardening.

5. Reliability/performance
- Measure key API/database paths under realistic test data; inspect EXPLAIN plans where useful and add indexes only with query-based justification.
- Check server-side pagination, stable sorting, N+1 query patterns, unnecessary payload sizes, timeouts, DB pool handling, retries and duplicate submission behaviour.
- Ensure logs have request IDs and redact credentials/tokens. Health/readiness endpoints are safe. Do not add a paid monitoring vendor; identify optional tooling separately.
- Run dependency/security checks available in the existing stack, lint, frontend typecheck/build, backend unit/integration tests, DB migration tests, RLS suite and E2E workflows. Do not state a vulnerability scan is clean if a scan did not actually run.

6. Remove development-only artifacts
- Remove accidental test accounts, default credentials, debug endpoints, stale mock data and development-only bypasses from runtime code. Keep safe tests/fixtures. Production seed data must not include a known privileged password.
- Confirm all features shown as complete are backed by real API/database behaviour.

Deliverables
- `docs/security-review.md` listing checks performed, evidence, findings by severity, fixes and residual risks.
- Updated `docs/testing.md`, `docs/runbook.md`, traceability matrix and ADRs as needed.
- A release blocker list. Any unresolved critical tenant isolation/auth finding means BLOCKED, not PASS.

Do not automatically apply destructive fixes to production. Run safe tests and local migrations only. Report commands, exact pass/fail results, skipped tests and remaining risks. Stop after Phase 10.
```

---

# Phase 11 — Staging/production release readiness and free-tier deployment

```text
PHASE 11 — RELEASE READINESS AND CONTROLLED VERCEL/RENDER/NEON DEPLOYMENT

Goal: prepare and, only when explicitly authorized and credentials are already configured by the owner, execute a controlled deployment to the approved Vercel frontend, Render backend and Neon PostgreSQL setup. Do not create paid resources, disclose secrets, run destructive production migrations or publish production without explicit approval. If authorization or credentials are absent, complete deployment documentation and a verified preflight instead of claiming deployment.

A. Environment separation and secrets
- Document local, automated-test, staging and production environments with separate credentials and databases.
- Produce a variable-name inventory for frontend/build-time variables and backend runtime variables. Never print actual secret values. Ensure frontend-exposed variables contain no database password, signing secret, provider key or privileged configuration.
- Configure Vercel build/root/output settings for the actual frontend folder; configure Render build/start/health settings for the actual backend folder; configure Neon connection settings only through the hosting secret manager.
- Verify the application can connect using a least-privilege runtime database role and that TLS/SSL settings are correct for the provider.
- Document free-tier limitations honestly: cold starts/sleep, quotas, database compute/storage limits, email provider restrictions and backup/availability limitations. Do not guarantee uninterrupted uptime.

B. Build/start/migrations
- Verify clean checkout installation, frontend production build, frontend typecheck, backend lint/tests/start and health/readiness routes.
- Ensure migrations are a controlled deployment step. Never auto-drop/recreate tables on app startup. Run migrations against a fresh staging database first; verify migration ordering, RLS policies, grants and rollback plan.
- Production migration should only execute after explicit human approval and verified backup/rollback procedure. Do not run destructive or irreversible migration steps without approval.
- Confirm development seed accounts/default passwords/debug endpoints cannot be enabled in production accidentally.

C. Origin, cookies, email and app integration
- Configure explicit frontend origins on the backend; no wildcard credentialed CORS.
- Verify production cookie Secure/SameSite/Domain/Path semantics and CSRF policy across actual deployment origins.
- Verify email provider settings via safe test operations and provider acceptance semantics. Do not claim delivery merely because API returned success; record provider acceptance/failure only.
- Verify frontend API base URL points to the intended backend; test login/logout/verification/recovery, organisation create/switch, invitation, entitlement/permission checks and all three module journeys.

D. Operations and recovery
- Validate health/readiness behaviour, structured logging/request IDs and secret redaction.
- Document how backups are configured and how a restore is tested. Do not call backups “configured” if only a recommendation/document exists.
- Define rollback steps for frontend and backend and database restore/migration rollback limitations.
- Add a deployment smoke-test checklist and incident/runbook notes. Avoid paid integrations unless explicitly authorized.

E. Final gate
- Run all critical end-to-end and cross-tenant isolation suites against the preproduction target with safe test data.
- Verify support/platform access boundaries and ensure no known critical authorization defect remains.
- Build a release checklist with each item marked `verified`, `failed`, `not run`, or `requires owner action` plus evidence.
- If actual deployment tools/auth are not configured, say `deployment not executed` and give the exact remaining manual steps. Never invent a live URL, claim a successful deployment without checking it, or claim email/backup/monitoring works without evidence.

Acceptance: a new environment is reproducible from docs; secrets are configured outside source control; migrations/health/cookies/origin/email/RLS/runtime privileges are verified; smoke tests and isolation suite pass; rollback and backup/restore procedures are documented and tested to the extent possible. Stop after the release report.
```

---

# Optional final independent acceptance audit (run only after Phase 11)

```text
MANAGEX FINAL ACCEPTANCE AUDIT — READ-ONLY FIRST, FIX ONLY WITH EVIDENCE

Read docs/PRD.md, AGENTS.md, requirements traceability, the full test reports and security review. Independently compare every PRD requirement and acceptance criterion against the actual code, database migrations, API contracts, UI and automated test evidence. Do not trust an earlier agent's completion statement without verifying files and command outputs.

Create docs/final-acceptance-report.md with a table containing: PRD requirement ID/description; implemented location; permission/RLS rule; tests run and evidence; status (PASS/FAIL/PARTIAL/NOT VERIFIED); and remaining limitation. Include separate sections for product workflow completeness, tenant isolation, auth/session/CSRF, RBAC/delegation, platform support boundary, UX/accessibility, data integrity/concurrency, deployment/operations and known limitations.

Run only safe, non-destructive verification commands. Do not change production data or silently change scope. If any critical tenant-isolation/auth defect is found, mark the release BLOCKED and describe reproduction and remediation. Distinguish automated evidence from manual checks and documentation-only claims. Do not label the product production-ready if critical checks are not verified.

Report exact commands and results, include unresolved findings and stop.
```

---

# Phase completion report format Antigravity must use every time

Ask it to finish each phase using this structure (the prompts above also require this):

```text
PHASE REPORT
1. Result: PASS / BLOCKED / PARTIAL
2. Implemented (tied to PRD requirement IDs)
3. Files/areas changed
4. Database migrations/schema/RLS changed
5. API routes/contracts/validation changed
6. Authorization, tenant isolation and audit implications
7. UI routes and states added
8. Commands executed with exact pass/fail results
9. Tests added and actual test outcomes
10. Tests/checks not run and why
11. Assumptions or decisions recorded (links to ADRs)
12. Known limitations and remaining risks
13. Requirement traceability updated? yes/no
14. Next phase recommendation (do not start it)
```

## Recommended execution order

**0 → 1 → 2 → 3 → 4 → 5 → 6A → 6B → 6C → 6D → 7A → 7B → 7C → 8A → 8B → 8C → 9 → 10 → 11 → Final acceptance audit**

Don't judge a module complete just because its screens render. It is complete only when UI, API, database, tenant/RBAC enforcement, validation, errors, audit behaviour and tests work together.
