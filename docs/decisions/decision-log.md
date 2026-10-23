# ManageX Decision Log — Phase 0

This document tracks all foundational architecture, data model, and security decisions required by Section 20 of `docs/PRD.md` and Phase 0 of the Antigravity Prompt Pack.

Each decision is labeled with one of:
- `PRD-defined`: Explicitly specified in `docs/PRD.md`.
- `safe implementation decision`: Standard technical decision derived directly from PRD invariants without expanding product scope.
- `requires product decision`: Item with product-level trade-offs requiring product owner sign-off.

---

## Decision Table

| ADR ID | Decision Area | Status | Classification | PRD / Prompt Ref | Summary of Decision |
|---|---|---|---|---|---|
| **ADR-001** | Transaction-Local RLS Context Lifecycle | Accepted | `PRD-defined` | PRD §11.3, §20.1 | Use `SET LOCAL app.current_user_id` & `SET LOCAL app.current_organisation_id` inside an explicit transaction on a single checked-out connection. Closes on commit/rollback. Deny by default when context missing. |
| **ADR-002** | Runtime vs Migration Database Roles | Accepted | `PRD-defined` | PRD §11.3, §20.2 | Separate `managex_migration` (table owner, schema migrations) and `managex_app` (least privilege, DML only, NO `BYPASSRLS`, `FORCE RLS` on all tenant tables). |
| **ADR-003** | External Event Participant Access Boundary | Accepted | `PRD-defined` | PRD §5.1, §7.2, §20.3 | External participants register with a verified ManageX account but receive **no organisation membership**. Scoped strictly to event registration, their team, and URL submission. |
| **ADR-004** | Three-Level Scoped Permission Catalogue | Accepted | `PRD-defined` | PRD §6.3, §20.4 | Central permission catalogue with separate Platform, Organisation, and Module scopes. Module roles are resource-scoped. Deny by default. |
| **ADR-005** | Final-Owner Invariant & Transfer Protocol | Accepted | `PRD-defined` | PRD §6.2 (ORG-008), §20.5 | At least one active owner must exist at all times. Transfer requires reauthentication within the previous 10 minutes, explicit confirmation, and is executed in an atomic transaction. |
| **ADR-006** | Task Assignee Membership Removal Guard | Accepted | `PRD-defined` | PRD §9.2 (PRJ-004), §20.6 | Removing or suspending project/org members with active tasks is blocked until reassigned. Account-level security suspension takes effect immediately but preserves assignments in an actionable reassignment state. |
| **ADR-007** | Hackathon Team Size & Invitation Expiry | Accepted | `PRD-defined` | PRD §7.3 (EVT-006), §20.7 | Min size defaults to 1, Max size configured up to 100. Invitations expire in 7 days, are single-use, and acceptance requires matching verified email. |
| **ADR-008** | Event Registration Window Defaults | Accepted | `PRD-defined` | PRD §7.2 (EVT-005), §20.8 | If `registration_opens_at` is null, effective instant is first publication. If `registration_closes_at` is null, effective instant is event start. Statuses other than `published` categorically reject registration. |
| **ADR-009** | Hackathon Scoring Calculation & Publication | Accepted | `PRD-defined` | PRD §7.4 (EVT-008/009), §20.9 | Straight sum of criteria scores (1..100). No weights or hidden tie-breaks. Tied totals share ranks. Publication is allowed only when all assigned judges submit all criteria scores. |
| **ADR-010** | Email Provider Abstraction & Safe Delivery | Accepted | `PRD-defined` | PRD §6.1 (AUTH-008), §20.10 | Shared email abstraction. Local development uses test logger / memory sink. In production without credentials, returns a clear recoverable error; never claims "sent" falsely. |
| **ADR-011** | Vercel Rewrite & Session Cookie Strategy | Accepted | `PRD-defined` | PRD §3.1, §14.1, §20.11 | Browser calls same-origin `/api/v1/*`. Vercel rewrites `/api/*` to Render backend. Session cookies are `HttpOnly`, `Secure` in prod, `SameSite=Lax`, `Path=/`. CSRF token header required for state-changing calls. |
| **ADR-012** | Audit Immutability, Scope, and Retention | Accepted | `PRD-defined` | PRD §6.5, §20.12 | Append-only audit table. Normal application users cannot edit or delete audit logs. No passwords, tokens, secrets, or confidential notes/request bodies logged. |
| **ADR-013** | Soft Deletion & Archive Invariants | Accepted | `PRD-defined` | PRD §9.2 (PRJ-005), §20.13 | Tasks use soft deletion (`deleted_at IS NOT NULL`). Projects, events, and meetings use lifecycle statuses. No physical cascades that destroy audit history. |
| **ADR-014** | Meeting Notes & Action Items Privacy | Accepted | `PRD-defined` | PRD §8.2 (MTG-005/006), §20.14 | Confidential minutes/notes are restricted to meeting organiser and users with explicit `meeting.notes.read` permission. Attendees cannot read notes by default. |
| **ADR-015** | Migrations and Environment Seeding | Accepted | `PRD-defined` | PRD §6.8 (OPS-003/005), §20.15 | Sequential versioned SQL files executed via a lightweight Node.js runner. Seeds are strictly non-production and contain no default production credentials. |
| **ADR-016** | Module Activation Safe Deactivation Policy | Accepted | `safe implementation decision` | PRD §6.4 (MOD-002), Prompt §5 | Deactivating a module in an organisation blocks all `/api/v1/organisations/:orgId/{module}/*` endpoints with 403 Forbidden ("Module disabled") but retains all database tables and historical rows intact. |
| **ADR-017** | Password Hashing Algorithm Selection | Accepted | `safe implementation decision` | PRD §6.1 (AUTH-001) | Use Argon2id (or bcrypt with work factor 12 if native binaries pose deployment friction in Render/Neon environment). Argon2id is preferred for modern password hashing. |
| **ADR-018** | Render Free-Tier Cold-Start & Mutation Protection | Accepted | `safe implementation decision` | PRD §14.4 | Render web service spins down after 15m; cold start (~50s) can trigger Vercel 502/504 edge timeouts. Display non-intrusive waking banner, poll bounded health checks (`GET /api/v1/health` up to 60s), auto-retry safe idempotent `GET` reads only, and strictly forbid auto-replaying interrupted mutations without explicit reconciliation. |
| **ADR-019** | Events Route Inventory, Namespace Collision & Precedence | Accepted | `safe implementation decision` | PRD §11.3, §16 | Declare static `/events/dashboard` prior to parametric `/events/:orgSlug` to prevent collision. Disambiguate single-segment paths dynamically (UUID = event detail, text slug = org directory) to ensure 100% backward compatibility with existing links. |
| **ADR-020** | Public Events Discovery Boundary & Data Allowlist | Accepted | `PRD-defined` | PRD §4.2, §7.1 (EVT-003), §20.3 | Organisation-scoped public directory filters strictly by tenant slug. Global `/events` acts as default discoverability portal for published, public events only. Responses enforce strict property allowlist excluding drafts, internal notes, PII, and unpublished scores. |
| **ADR-021** | Student/Participant vs Organisation Persona Isolation & Fail-Closed Route Guarding | Accepted | `safe implementation decision` | PRD §5.1, §6.2, §20.3 | 1. Active organisation context in client storage is strictly user-scoped (`managex_active_org_id_${user.id}`) and purged on logout.<br>2. Route guard `RequireOrgAccess` verifies active `:orgId` membership, failing closed with accessible CTAs for participant personas without membership.<br>3. `WorkspaceLayout` resolves role dynamically to 'Participant' (never 'Member') for 0-organisation users and replaces module nav with participant links.<br>4. Pure internal organisation backend routers (`meetingsRouter`, `projectsRouter`) enforce top-level fail-closed `requireOrgMembership` and module entitlement middleware. |
| **ADR-022** | Router Middleware Granularity for Hybrid Modules (Events & Hackathons) | Accepted | `PRD-defined` | PRD §5.1, §7.2, §20.3 | Because `eventsRouter` handles both organiser-only actions and external participant actions (registration, teams, submissions), top-level router membership middleware breaks external participant flows. The boundary is enforced granularly: all 27 organiser routes explicitly require `requireOrgMembership`, `requireModuleEntitlement('events')`, and scoped RBAC permissions; participant routes require authentication and tenant resolution without requiring organisation membership; public endpoints remain publicly accessible and allowlist-filtered. |

---

## Detailed Architectural Notes on Critical Security Invariants

### ADR-001: Transaction-Local RLS Context Lifecycle
- **Setting Context:** Inside the transaction runner:
  ```sql
  BEGIN;
  SELECT set_config('app.current_user_id', $1, true);
  SELECT set_config('app.current_organisation_id', $2, true);
  SELECT set_config('app.current_is_platform_admin', $3, true);
  -- Execute protected domain queries
  COMMIT;
  ```
  The third argument `true` ensures the setting is local to the current transaction (`is_local = true`). When the transaction finishes (commit or rollback), PostgreSQL automatically resets the setting.
- **Fail-Closed Policy:**
  ```sql
  CREATE POLICY tenant_isolation_policy ON <table_name>
    FOR ALL
    TO managex_app
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
  ```
  If `app.current_organisation_id` is unset or empty, `NULLIF` evaluates to `NULL`, resulting in `organisation_id = NULL`, which evaluates to `FALSE` (deny all).

### ADR-002: Runtime DB Role Privileges
- Role `managex_migration`:
  - Owns schemas, tables, sequences, indexes, and migrations.
  - Used only during build/migration tasks.
- Role `managex_app`:
  - Runtime connection pool uses this role.
  - Grants: `SELECT, INSERT, UPDATE, DELETE` on application tables.
  - Revokes: `CREATE, DROP, ALTER, TRUNCATE`.
  - `FORCE ROW LEVEL SECURITY` applied to all tables so even if table ownership nuances exist, RLS is unconditionally evaluated.
  - `managex_app` does NOT possess `BYPASSRLS` or superuser privileges.

### ADR-018: Render Free-Tier Cold-Start Handling, Bounded Probes & Mutation Protection
- **Context:** Render's free tier spins down idle instances after 15 minutes. Cold-start boot time (~40–60s) exceeds Vercel proxy rewrite timeouts (15–30s), causing edge 502/504 errors on initial requests.
- **Client Waking Banner:** Display a non-intrusive status indicator informing the user that the backend service is waking up.
- **Bounded Health Probes:** Poll `GET /api/v1/health` at 5-second intervals with an overall cap of 60 seconds. If probes exceed 60s without response, transition to a clear failure state.
- **Idempotent vs Non-Idempotent Request Handling:**
  - **Safe `GET` Requests:** Automatically retry after `GET /api/v1/health` responds `200 OK`.
  - **State-Changing Mutations (`POST`, `PUT`, `PATCH`, `DELETE`):** **Strictly forbidden from automatic replaying.** A gateway timeout or 502/504 does NOT indicate whether the server received or committed the mutation prior to proxy disconnect. A healthy probe only proves the server is online, not the outcome of the interrupted request.
  - **Reconciliation Requirement:** Mutation retries require an explicitly designed and tested idempotency mechanism (e.g. client-supplied idempotency key) or an operation-status reconciliation prompt allowing the user to inspect existing state before safely re-submitting.
- **Constraint:** Zero paid infrastructure or external keep-alive pingers are introduced; all handling remains entirely within the free-tier stack.

### ADR-019: Events Route Inventory, Namespace Collision Resolution & Route Precedence
- **Context & Collision Risk:**
  - Route `/events/dashboard` serves authenticated student and participant portfolios.
  - Introducing organisation vanity routes `/events/:orgSlug` and `/events/:orgSlug/:eventSlug` creates a routing ambiguity: if `/events/:orgSlug` is mounted before `/events/dashboard`, React Router parses `dashboard` as `:orgSlug`, breaking the participant dashboard.
  - Existing shareable links generated by the app (e.g. `navigator.clipboard.writeText("${origin}/events/${event.id}")`) and existing automated integration tests use single-segment UUID paths (`/events/:eventId`).
- **Resolution Strategy:**
  1. **Route Priority:** Mount `/events/dashboard` (wrapped with `<RequireAuth />`) strictly ahead of any dynamic `:orgSlug` route in the router hierarchy.
  2. **Single-Segment Disambiguation:** Single-segment path `/events/:param` inspects parameter format:
     - If `:param` matches UUID v4 regex pattern (`^[0-9a-f]{8}-[0-9a-f]{4}-...`), render `PublicEventDetailPage` by event ID.
     - Otherwise, treat `:param` as `:orgSlug` and render the organisation's public events directory.
  3. **Two-Segment Vanity Routing:** Route `/events/:orgSlug/:eventSlug` uniquely matches the scoped public event detail page.
  4. **Reserved Slugs:** The keyword `dashboard` (as well as system terms `app`, `platform`, `admin`, `api`, `auth`, `public`, `login`, `register`) is globally reserved and prohibited as an organisation slug.

### ADR-020: Public Events Discovery Boundary & Data Allowlist
- **Context:** PRD §4.2 prohibits unrestricted cross-tenant multi-tenant browsing, while PRD §7.1 (`EVT-003`) allows public published events to be listed and viewed by prospective attendees without granting organisation access.
- **Organisation-Scoped Portal:** By default, `/events/:orgSlug` strictly filters published events owned by `:orgSlug`. The root directory `/events` serves as a discoverability catalog for all published events configured with `is_public = true` across the platform.
- **Fail-Closed Data Exposure Boundary:**
  - Public endpoints (`/api/v1/events` and `/api/v1/events/:id`) evaluate runtime database RLS with `app.is_public_read = true`, which enforces `status = 'published' AND is_public = true`.
  - Non-published statuses (`draft`, `registration_closed`, `in_progress`, `completed`, `cancelled`, `archived`) categorically return `404 Not Found` to unauthenticated public callers.
  - JSON serialization strictly allowlists public metadata (title, slug, description, type, timezone, start/end dates, location, capacity, team size bounds, published results).
  - Draft notes, attendee rosters, judge identities, individual criteria scores, and submission drafts are strictly excluded from public serialization.
