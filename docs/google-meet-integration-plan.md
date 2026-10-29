# ManageX Phase 1B — Automatic Google Meet Integration
## Canonical Implementation Plan & Architectural Blueprint

**Document Reference:** `docs/google-meet-integration-plan.md`  
**Revision:** 2.5 (Final Documentation Audit & Pre-Phase 1B.3 Reconciliation)  
**Status:** DRAFT — PHASE 1B.1 & 1B.2 IMPLEMENTED & LOCALLY VERIFIED; PHASE 1B.3 AWAITING USER AUTHORIZATION  
**Governing Documents:** `AGENTS.md`, `docs/PRD.md` (§§8.1, 8.2, 20.14), `docs/meetings-mom-enhancement-roadmap.md` (§11.3), `docs/security.md` (SEC-001 through SEC-010)  
**Execution Boundary:** STRICTLY PLAN-ONLY. Phases 1B.1 and 1B.2 have been implemented and verified locally. Phase 1B.3 and all subsequent phases remain strictly unauthorized until explicit user approval is granted.

---

## Revision History

| Revision | Date | Author / Context | Summary of Changes |
| :---: | :---: | :---: | :--- |
| **1.0** | 2026-10-27 | Initial Draft | Baseline Google Meet architecture, OAuth 2.0 web server flow, and Calendar event creation. |
| **2.0** | 2026-10-27 | Architecture Audit Review | Resolved global OAuth callback tenant context, introduced atomic claim leasing, decoupled DB transactions from HTTP I/O, added historical data backfill. |
| **2.1** | 2026-10-27 | Targeted Architecture Corrections | Enforced user-isolated RLS for `oauth_states`; defined in-flight cancellation race compensation; adopted deterministic Google event IDs; corrected credential erasure; added `abandoned` state. |
| **2.2** | 2026-10-27 | Targeted Verification & Hardening | Formally mapped OAuth RLS context to existing `organisation_memberships` and `membership_roles` select policies (zero platform-admin bypass); reconciled 45s lease vs 17s worst-case HTTP budget; corrected base32hex prefix to `meet` (RFC 4648 disallows `x`); clarified `sendUpdates=none` and attendee roster trade-offs using official API docs; added idempotent compensation for missing/revoked credentials; aligned test inventory and unverified test counts. |
| **2.3** | 2026-10-27 | Concurrency Clarification | Formally verified PostgreSQL RLS interpretation of unset `app.current_organisation_id` (`NULLIF('', '')` returning NULL) in `withTenantTransaction`; verified `membership_roles_user_select` excludes inactive memberships and prevents cross-tenant leakage under `managex_app` `NOBYPASSRLS` without platform-admin bypass; defined single-use token burn on permission failure; resolved stale-worker races across create, update/reschedule, and delete beyond database tokens using ETag concurrency (`If-Match`) and post-mutation self-healing; defined in-flight cancellation recovery and compensation failure modes with revoked credentials; confirmed deterministic event IDs do not prevent stale mutations; delineated Google event attendees vs ManageX notifications vs `sendUpdates=none`; maintained open stakeholder decisions. |
| **2.4** | 2026-10-27 | Implementation Reconciliation | Reconciled cryptographic contract with implemented `crypto.js` (AES-256-GCM, 12-byte IV, 16-byte tag, exact AAD `managex:v${envelopeVersion}:k${keyVersion}`); documented separation of GCM authentication from database RLS tenant isolation; updated Section 8 SQL schema snippet to match applied Migration 041 (`envelope_version INT`, `key_version VARCHAR(64)`, `google_calendar_etag`, and partial indexes); documented required adapter between snake_case DB columns and camelCase crypto envelope for Phase 1B.3; corrected key-rotation contract to reflect `env.js` and `crypto.js`; formalized resolved stakeholder decisions (Testing mode approved with 7-day token expiry risk; Option A approved without attendee emails); updated phase status tracking. |
| **2.5** | 2026-10-27 | Final Documentation Audit & Reconciliation | **(Current)** Completed exhaustive repository reconciliation across Sections 1–14; labeled Section 8.1 SQL as exact migration excerpt; marked Section 8.2 adapter helpers as proposed for Phase 1B.3; categorized Section 11 file inventory into implemented (1B.1/1B.2) vs planned (1B.3/1B.4/1B.5); clarified cryptographic boundary vs application-level context validation (RLS is never a substitute for application authorization); documented offline re-encryption utility as future work prerequisite before key retirement; refined Testing-mode operational limitations and Option A notification ownership; maintained strict stop condition with Phase 1B.3 remaining unauthorized. |

---

## 1. Document Purpose, Scope & Status

### 1.1 Purpose
This document establishes the canonical product, architecture, security, and engineering blueprint for **Phase 1B: Automatic Meeting Link Generation using Google Meet via Google Calendar API**.

ManageX currently supports manually entered conferencing links (`virtual_url`). Phase 1B introduces a shared, organisation-level Google Workspace/Calendar integration that automatically provisions genuine Google Meet conferencing links (`https://meet.google.com/xxx-yyyy-zzz`) upon meeting scheduling, keeps them synchronized during rescheduling, safely removes calendar events upon meeting cancellation, and provides non-blocking failure recovery with manual link fallback.

### 1.2 Status & Authorization Gate
* **Current Status:** `DRAFT — PHASE 1B.1 & 1B.2 IMPLEMENTED & LOCALLY VERIFIED; PHASE 1B.3 AWAITING USER AUTHORIZATION`
* **Implementation Gate:**
  - **Phase 1B.1 (Cryptography, Tokens & Security Infrastructure):** IMPLEMENTED and LOCALLY VERIFIED (37/37 unit tests passing in `backend/src/platform/common/crypto.test.js`).
  - **Phase 1B.2 (Database Migration & RLS Isolation):** IMPLEMENTED and LOCALLY VERIFIED (Migration 041 applied on local development and test databases `managex` and `managex_test`; 18/18 RLS integration tests passing in `backend/src/platform/database/google_integrations_rls.integration.test.js`).
  - **Phase 1B.3 (OAuth 2.0 Integration & Admin UI):** STRICTLY GATED. Implementation is blocked until explicit user authorization to proceed with Phase 1B.3 is granted.
  - **Phases 1B.4 through 1B.6:** Gated behind successful completion and verification of Phase 1B.3.

### 1.3 Scope Boundaries
* **In Scope:**
  - Organisation-level Google OAuth 2.0 connection and secure credential storage.
  - Automatic Google Meet link generation for scheduled virtual/hybrid meetings.
  - Non-blocking asynchronous conference reconciliation, retry handling, and lease-based concurrency control.
  - Rescheduling synchronization and cancellation event cleanup.
  - Authenticated Join gateway enforcing existing visibility, membership, and terminal-state lockouts.
  - Manual conferencing link preservation and fallback.
* **Explicitly Out of Scope:**
  - Jitsi, Zoom, Microsoft Teams, or arbitrary conferencing provider adapters (deferred to future phases).
  - Two-way calendar synchronization (importing external Google events into ManageX).
  - Built-in video/audio streaming, recording, real-time transcription, or live chat.
  - Background cron daemons, Redis, or BullMQ queue infrastructure.

---

## 2. Verified Repository Baseline & Invariants

An exhaustive, read-only inspection of the repository established the following concrete architectural facts:

| Component / Subsystem | Repository Location | Verified Architectural Baseline |
| :--- | :--- | :--- |
| **Backend Runtime** | [`backend/package.json`](file:///d:/manageX/backend/package.json) | Node.js (>=20.0.0), Express 4.x, pure ES modules (`"type": "module"`). All files must use `.js`; backend TypeScript compilation is strictly prohibited (`AGENTS.md` Rule 2). |
| **API Entry Point** | [`backend/src/index.js`](file:///d:/manageX/backend/src/index.js#L5) | Listens on `env.PORT` (`4000` default). |
| **App Configuration** | [`backend/src/app.js`](file:///d:/manageX/backend/src/app.js#L16-L36) | Mounts API under `/api/v1`, sets `trust proxy: 1` for Vercel/Render edge proxies. `authenticateSession` runs globally. |
| **Router Hierarchy** | [`backend/src/routes/organisations.js`](file:///d:/manageX/backend/src/routes/organisations.js#L526) | Mounts meetings at `/api/v1/organisations/:orgId/meetings`. |
| **Database Pool** | [`backend/src/platform/database/pool.js`](file:///d:/manageX/backend/src/platform/database/pool.js#L12) | Pinned `pg.Pool` (`max: 10` in dev/test, `max: 20` in prod). **Pool Invariant:** Database transactions must never be held open across external HTTP requests. |
| **Tenant Transactions** | [`backend/src/platform/database/transaction.js`](file:///d:/manageX/backend/src/platform/database/transaction.js#L27) | `withTenantTransaction` sets `app.current_organisation_id`, `app.current_user_id`, and `app.current_is_platform_admin` with `is_local = true`. |
| **Row-Level Security** | [`database/migrations/20261017000003_rls_policies.sql`](file:///d:/manageX/database/migrations/20261017000003_rls_policies.sql), [`000007`](file:///d:/manageX/database/migrations/20261017000007_refine_membership_roles_user_select.sql) | Runtime role `managex_app` has `NOBYPASSRLS`. Tables enforce strict tenant isolation. User discovery policies permit reading own memberships/roles when `organisation_id` is unset. |
| **Meeting Schema** | [`database/migrations/20261017000013_meetings_core.sql`](file:///d:/manageX/database/migrations/20261017000013_meetings_core.sql#L5-L28) | Stores `location_type` (`in_person`, `virtual`, `hybrid`), `virtual_url` (`TEXT`), and `status` (`scheduled`, `in_progress`, `completed`, `cancelled`, `missed`). |
| **Permissions** | [`database/migrations/20261017000008_seed_rbac_roles_permissions.sql`](file:///d:/manageX/database/migrations/20261017000008_seed_rbac_roles_permissions.sql#L40) | Seeds `org.update` ("Update organisation name, slug, settings, and branding"). Governs organisation-level integrations. |
| **Audit Logging** | [`backend/src/platform/audit/auditService.js`](file:///d:/manageX/backend/src/platform/audit/auditService.js#L34) | Writes immutable logs to `audit_logs` and deeply sanitizes secrets via `redactSecrets`. |
| **Frontend Client** | [`frontend/src/api/client.ts`](file:///d:/manageX/frontend/src/api/client.ts#L73) | Requests default to `/api/v1` and proxy via Vite (`localhost:5173`) to backend (`localhost:4000`). |
| **Test Baseline** | Repository Test Suites | **Verified Suite Results:** 461 backend tests passing (including 100 meetings tests); 37/37 Phase 1B.1 cryptography tests passing (`crypto.test.js`); 18/18 Phase 1B.2 RLS integration tests passing on `managex_test` (`google_integrations_rls.integration.test.js`); 41 forward migrations verified on `managex` and `managex_test`; 177 frontend tests passing. |

---

## 3. Architecture & Component Responsibilities

### 3.1 High-Level Architecture Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   MANAGE-X GOOGLE MEET INTEGRATION ARCHITECTURE                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  1. OAuth Initiation (Admin Only)                                                      │
│     Admin Browser ──────▶ GET /api/v1/organisations/:orgId/integrations/google/authorize│
│                           • Verified requireOrgPermission('org.update')                │
│                           • Generates rawStateToken, stores sha256 in oauth_states     │
│                           • Sets HttpOnly managex_oauth_nonce cookie                   │
│                     ◀──── 302 Redirect to accounts.google.com                          │
│                                                                                        │
│  2. Global Callback & Context Elevation                                                │
│     Google Redirect ────▶ GET /api/v1/integrations/google/callback?code=...&state=...  │
│                           • authenticateSession verifies user session                  │
│                           • Step 1 (User Context Tx): Atomically marks state used      │
│                             via RLS (user_id = current_user), verifies org.update      │
│                           • Step 2 (HTTP Call): Code exchange via Google token API     │
│                           • Step 3 (Tenant Context Tx): Encrypts refresh token (AES-   │
│                             256-GCM) and stores credentials in organisation_integrations│
│                     ◀──── 302 Redirect to /app/organisations/:orgId/settings           │
│                                                                                        │
│  3. Meeting Scheduling (Two-Stage Decoupled Pattern)                                   │
│     Organiser ──────────▶ POST /api/v1/organisations/:orgId/meetings                   │
│     Stage 1 (DB Tx):      Persist meeting (conference_provider='google_meet',          │
│                           google_sync_status='pending_create', virtual_url=NULL)       │
│     Stage 2 (HTTP Call):  Acquire 45s atomic lease -> Refresh access token             │
│                           Deterministic event check: GET /events/meet${cleanUuid}      │
│                           If 404: events.insert with deterministic ID and conference   │
│     Stage 3 (DB Tx):      Release lease -> Save virtual_url, status='synced'           │
│                           (Guarded: if meeting was cancelled during call, abort & clean)│
│                     ◀──── 201 Created                                                  │
│                                                                                        │
│  4. Lifecycle Sync (Reschedule & Cancel)                                               │
│     Reschedule ─────────▶ PATCH /meetings/:id -> DB updated -> Google events.patch     │
│     Cancellation ───────▶ POST /meetings/:id/status -> DB cancelled -> events.delete   │
│                                                                                        │
│  5. Authenticated Join Gateway                                                         │
│     Attendee ───────────▶ GET /api/v1/organisations/:orgId/meetings/:id/join           │
│                           • Verifies session, org membership, and attendee visibility  │
│                           • Asserts meeting is NOT completed/cancelled/missed          │
│                           • Validates http/https scheme, records audit, returns URL    │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Responsibilities

1. **`crypto.js` (Symmetric Encryption Utility):**
   - Provides authenticated encryption and decryption using AES-256-GCM.
   - Generates cryptographically secure 12-byte initialization vectors (`IV_LENGTH_BYTES = 12`) via `crypto.randomBytes()`.
   - Computes and verifies 16-byte authentication tags (`AUTH_TAG_LENGTH_BYTES = 16`) to guarantee ciphertext integrity.
   - Binds envelope format version and key version as Additional Authenticated Data (`managex:v${envelopeVersion}:k${keyVersion}`) into the GCM authentication tag.
   - **Architectural Boundary:** GCM authentication guarantees cryptographic payload and envelope integrity; it does NOT establish tenant identity, database row ownership, `organisation_id`, or `connected_email`. Tenant boundary isolation is enforced separately by PostgreSQL Row-Level Security (`org_integrations_tenant_isolation`) and server-side RBAC. Crucially, database RLS is a defense-in-depth safety net and **never a substitute for validating tenant context and membership permissions in application code**.
   - Enforces key versioning (`key_version`) resolving active key from `TOKEN_ENCRYPTION_KEY` and historical keys from `TOKEN_ENCRYPTION_KEYRING` JSON map.
   - **Phase 1B.3 Adapter Requirement:** Encrypts and decrypts pure in-memory envelope objects `{ version, keyVersion, iv, tag, ciphertext }`. The Phase 1B.3 service layer (`googleOAuthService.js`) must provide a deliberate adapter mapping these properties to and from the database's snake_case columns (`envelope_version`, `key_version`, `token_iv`, `token_auth_tag`, `encrypted_refresh_token`).

2. **`googleOAuthService.js` (OAuth Lifecycle Orchestrator):**
   - Generates cryptographically unguessable OAuth state nonces and stores hashes in `oauth_states`.
   - Coordinates single-use state consumption via user-isolated database queries.
   - Re-verifies user session, organisation membership, and administrative permissions.
   - Exchanges authorization codes for refresh/access tokens at Google's token endpoint.
   - Refreshes expired access tokens and preserves existing refresh tokens on reauthorization.

3. **`googleCalendarClient.js` (Low-Level Google Calendar Gateway):**
   - Encapsulates HTTPS requests to Google Calendar API v3 (`https://www.googleapis.com/calendar/v3/calendars/primary/events`).
   - Manages bounded request timeouts (8,000ms per attempt) via `AbortController`.
   - Enforces mandatory `conferenceDataVersion=1` and `sendUpdates=none` query parameters.
   - Implements bounded backoff (max 1 retry) for transient HTTP 429 and 503 provider errors.

4. **`googleMeetService.js` (High-Level Synchronization Engine):**
   - Executes the Two-Stage Decoupled Pattern for meeting link provisioning.
   - Manages the Non-Blocking Database Lease Claim (`google_sync_claimed_at`, `google_sync_claim_token`).
   - Uses deterministic Google event IDs (`meet` + 32-character hex UUID) to prevent duplicate calendar events under timeouts.
   - Manages synchronization on rescheduling (`events.patch`) and cancellation (`events.delete`).

5. **`integrationsRouter` & `meetingsRouter` (API Controllers):**
   - `/api/v1/organisations/:orgId/integrations/google/authorize`: Initiates OAuth.
   - `/api/v1/integrations/google/callback`: Global callback receiver.
   - `/api/v1/organisations/:orgId/integrations/google/disconnect`: Revokes upstream and erases credentials locally.
   - `/api/v1/organisations/:orgId/meetings/:id/join`: Authenticated join gateway.
   - `/api/v1/organisations/:orgId/meetings/:id/sync-google`: Explicit on-demand retry endpoint.

---

## 4. OAuth State & Database-Enforced Security

### 4.1 RLS Context Mapping for Callback Under NOBYPASSRLS

To ensure the global callback `GET /api/v1/integrations/google/callback` operates with least privilege without any platform-admin bypass:

#### 1. Transaction Helper & Setting Interpretation
In [`backend/src/platform/database/transaction.js`](file:///d:/manageX/backend/src/platform/database/transaction.js#L34-L39), `withTenantTransaction` sets PostgreSQL session variables with transaction-local scope (`is_local = true`):
```javascript
await client.query(
  `SELECT
    set_config('app.current_user_id', $1, true),
    set_config('app.current_organisation_id', $2, true),
    set_config('app.current_is_platform_admin', $3, true)`,
  [
    userId ? String(userId) : '',
    organisationId ? String(organisationId) : '',
    isPlatformAdmin ? 'true' : 'false',
  ]
);
```
- **Interpretation of Unset or Empty Organisation ID:** When `organisationId` is `null` or omitted, parameter `$2` is passed as `''` (empty string).
- **PostgreSQL RLS Handling:** Every RLS policy across ManageX wraps the setting in `NULLIF(current_setting('app.current_organisation_id', true), '')`. When empty string is set, `NULLIF('', '')` strictly evaluates to `NULL`. Consequently, `NULLIF(...) IS NULL` evaluates to `TRUE`.

#### 2. Database RLS Policies Under `managex_app` (NOBYPASSRLS)
The runtime database role `managex_app` has `NOBYPASSRLS`. All queries strictly respect database-level policies:
- **`oauth_states`:** Policy `oauth_states_user_isolation` permits access only where `user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid`. A user cannot read, update, or steal another user's OAuth state token.
- **`organisation_memberships`:** Migration `003` policy `memberships_tenant_isolation` ([line 66](file:///d:/manageX/database/migrations/20261017000003_rls_policies.sql#L66)) permits reading memberships when `app.current_organisation_id` is empty (`NULL`):
  ```sql
  NULLIF(current_setting('app.current_organisation_id', true), '') IS NULL 
  AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  ```
  This restricts the user strictly to their own membership records across organisations. Cross-tenant reads of other members are physically blocked.
- **`membership_roles`:** Migration `007` policy `membership_roles_user_select` ([`20261017000007_refine_membership_roles_user_select.sql`](file:///d:/manageX/database/migrations/20261017000007_refine_membership_roles_user_select.sql#L16-L25)) explicitly permits reading assigned roles when `app.current_organisation_id` is empty (`NULL`):
  ```sql
  NULLIF(current_setting('app.current_organisation_id', true), '') IS NULL
  AND EXISTS (
    SELECT 1 FROM organisation_memberships m
    WHERE m.id = membership_roles.membership_id
      AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND m.status = 'active'
  )
  ```
  **Exclusion of Inactive Memberships:** Notice that `m.status = 'active'` is explicitly enforced directly inside this RLS policy! Inactive, suspended, or archived memberships have their roles masked completely by PostgreSQL RLS.
- **`roles`:** Migration `003` policy `roles_tenant_isolation` permits reading system roles (`organisation_id IS NULL AND is_system = true`).
- **`role_permissions` & `permissions`:** Global un-isolated catalog tables with standard `SELECT` grant.

#### 3. Two-Phase RLS Context Transition in Step 1
To support both system roles (`organisation_admin`) and any custom tenant roles with `org.update` while preserving least privilege:
1. **Phase 1A (User Discovery Context):** Transaction starts with `userId = req.user.id`, `organisationId = ''`, `isPlatformAdmin = 'false'`.
   - Atomically consumes `oauth_states` where `token_hash = sha256(rawStateToken) AND user_id = current_user`.
   - Returns verified `state.organisation_id`.
2. **Phase 1B (Explicit Tenant Context Elevation):** Within the exact same transaction connection, execute:
   ```sql
   SELECT set_config('app.current_organisation_id', $1, true);
   ```
   passing `state.organisation_id`.
   - This sets `app.current_organisation_id` to the verified tenant ID with transaction-local scope (`is_local = true`).
   - Activates tenant isolation on `organisation_memberships`, `membership_roles`, and `roles` (`roles.organisation_id = state.organisation_id`), allowing verification of custom tenant roles while strictly locking down the transaction to `state.organisation_id`.
3. **Zero Platform-Admin Bypass:** `app.current_is_platform_admin` remains `'false'` throughout. No platform-admin bypass (`withSystemTransaction` or `isPlatformAdmin: true`) is introduced.

#### 4. Single-Use State Enforcement & Atomic Commit on Permission Failure
To strictly prevent replay attacks, the OAuth state token must be permanently consumed (burned) even if the initiating user's membership or `org.update` permission check fails:
- In PostgreSQL, rolling back a transaction rolls back all updates within it, including `UPDATE oauth_states SET used_at = NOW()`. A rollback would leave the state token unconsumed, creating a window for replay attacks.
- Therefore, Step 1 evaluates state consumption and permission revalidation within a single database transaction, and **commits** the transaction returning `{ valid: true, hasPermission }`.
- If `hasPermission` is false, the database transaction has already safely committed `used_at = NOW()`, permanently burning the token in the database. The application layer then immediately throws `AuthorizationError('FORBIDDEN')`, returning HTTP 403 to the caller.
- This guarantees single-use state consumption, eliminates token replay vulnerabilities, and enforces strict authorization under `managex_app` with `NOBYPASSRLS`.

### 4.2 Exact Callback Execution Boundaries

```
[Google Callback GET /api/v1/integrations/google/callback]
        │
        ▼
1. authenticateSession (Middleware)
   • Reads managex_session cookie -> validates SHA-256 hash -> populates req.user.
   • If unauthenticated -> 401 Unauthorized.
        │
        ▼
2. Step 1: User Context Database Transaction (< 5ms)
   • BEGIN (withTenantTransaction: userId = req.user.id, organisationId = '')
   • Atomic State Consumption:
       UPDATE oauth_states
       SET used_at = NOW()
       WHERE token_hash = sha256(rawStateToken)
         AND user_id = current_setting('app.current_user_id')::uuid
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING organisation_id, user_id;
     (If 0 rows: ROLLBACK -> HTTP 403 OAUTH_STATE_INVALID_OR_EXPIRED)
   • Cookie Nonce Verification: Asserts req.cookies.managex_oauth_nonce === rawStateToken.
   • Explicit Tenant Context Elevation:
       SELECT set_config('app.current_organisation_id', state.organisation_id, true);
   • Permission Revalidation:
       SELECT 1 FROM organisation_memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id AND mr.organisation_id = m.organisation_id
       JOIN roles r ON r.id = mr.role_id
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE m.organisation_id = current_setting('app.current_organisation_id')::uuid
         AND m.user_id = current_setting('app.current_user_id')::uuid
         AND m.status = 'active'
         AND p.key = 'org.update';
   • COMMIT & Release connection back to pool.
     (State token is permanently burned; if permission check returned 0 rows, app throws 403 FORBIDDEN)
        │
        ▼
3. Step 2: External HTTP Token Exchange (Outside DB, 1–2s)
   • POST https://oauth2.googleapis.com/token
   • GET https://www.googleapis.com/oauth2/v2/userinfo (fetches connected email)
        │
        ▼
4. Step 3: Tenant Context Database Transaction (< 5ms)
   • withTenantTransaction({ organisationId: state.organisation_id, userId: req.user.id }):
     - Encrypts refresh token via AES-256-GCM using crypto.encrypt().
     - Maps crypto envelope { version, keyVersion, iv, tag, ciphertext } via adapter to database columns (envelope_version, key_version, token_iv, token_auth_tag, encrypted_refresh_token).
     - Upserts organisation_integrations (strictly tenant-isolated RLS).
     - Records audit log organisation.integration_connected.
   • COMMIT & Release connection back to pool.
        │
        ▼
5. 302 Redirect to /app/organisations/:orgId/settings?tab=integrations&status=connected
```

---

## 5. Meeting Lifecycle & Concurrency Control

### 5.1 Meeting State Machine & Transitions

The `meetings` table manages external provider synchronization through durable states:

```
               ┌────────────────┐
               │      none      │ (Manual or in-person)
               └───────┬────────┘
                       │ User schedules Google Meet
                       ▼
               ┌────────────────┐
         ┌────▶│ pending_create │
         │     └───────┬────────┘
         │             │
    Google 200         │ Google 500 / Network Error / Timeout
         │             ▼
         │     ┌────────────────┐
         │     │ failed_create  │ (User clicks "Retry Link")
         │     └───────┬────────┘
         │             │
         └─────────────┘
         │
         ▼
 ┌───────────────┐  Start/End Updated  ┌───────────────────┐
 │    synced     │────────────────────▶│   pending_update  │
 └───────┬───────┘                     └─────────┬─────────┘
         │                                       │ Google Patch Fails
         │ Cancelled                             ▼
         ▼                             ┌───────────────────┐
 ┌───────────────┐                     │ failed_reschedule │ (User clicks "Sync Calendar")
 │ pending_delete│                     └───────────────────┘
 └───────┬───────┘
         │ Google Delete Fails
         ▼
 ┌───────────────────┐
 │   failed_cancel   │ (Admin clicks "Clean Up Event" or "Abandon")
 └───────┬───────────┘
         │ Disconnected or permanently abandoned
         ▼
 ┌───────────────────┐
 │     abandoned     │ (Upstream event cleanup abandoned)
 └───────────────────┘
```

### 5.2 Reconciled Lease, Timeout & Retry Budget

#### 1. Nominal HTTP Budget vs Real-World Execution Latencies
- **HTTP Request Timeout:** **8,000ms** (8 seconds) enforced via `AbortController`.
- **Retry Budget:** Max **1 retry** on transient HTTP 429 or 503 provider errors (backoff: 1,000ms).
  - Attempt 1: max 8s.
  - Backoff: 1s.
  - Attempt 2: max 8s.
  - Nominal worst-case HTTP I/O execution time: $8\text{s} + 1\text{s} + 8\text{s} = \mathbf{17\text{ seconds}}$.
- **Database Lease Duration:** **45 seconds** (`INTERVAL '45 seconds'`).
- **No Absolute Guarantee Against Outliving Lease:** While 17s is the nominal HTTP I/O ceiling under ideal conditions, this does **not** provide a mathematical guarantee that a worker cannot outlive its 45-second lease. Real-world execution delays can cause total execution time to exceed 45 seconds:
  - **Node.js Process Pauses & Event Loop Starvation:** Long-running synchronous code, heavy serialization, or major stop-the-world Garbage Collection (GC) pauses.
  - **OS & Container Throttling:** Cloud platform resource limits (e.g. Render CPU throttling, AWS/GCP noisy neighbours, or live container migration).
  - **Database Connection Delays:** Latency when acquiring a pooled client from `pg.Pool` for the Stage 3 write during connection pool exhaustion, or database lock queueing.
  - **Network Stalls:** TCP socket stalls or TLS handshakes that hang immediately prior to timeout triggering.

#### 2. Lease Expiry, Competing Workers & Late Response Handling
If total worker latency exceeds 45 seconds, the system handles the condition deterministically:
1. **Lease Expiry:** At $t > 45\text{s}$, the database lease expires (`google_sync_claimed_at < NOW() - INTERVAL '45 seconds'`).
2. **Competing Worker Claim:** A competing worker (triggered by a concurrent request, meeting reschedule, or explicit user retry) can acquire the lease:
   ```sql
   UPDATE meetings
   SET google_sync_claimed_at = NOW(),
       google_sync_claim_token = gen_random_uuid(),
       google_sync_last_attempt_at = NOW()
   WHERE id = $1 AND organisation_id = $2
     AND google_sync_status IN ('pending_create', 'failed_create', 'pending_update', 'failed_reschedule', 'pending_delete', 'failed_cancel')
     AND (google_sync_claimed_at IS NULL OR google_sync_claimed_at < NOW() - INTERVAL '45 seconds')
     AND status != 'cancelled'
   RETURNING id, google_sync_claim_token, google_calendar_event_id, google_conference_request_id, status;
   ```
3. **Late HTTP Return & Stale Write Discard:**
   When the original slow worker finally returns and attempts its Stage 3 database write:
   ```sql
   UPDATE meetings
   SET virtual_url = $3,
       google_calendar_event_id = $4,
       google_sync_status = 'synced',
       google_sync_claimed_at = NULL,
       google_sync_claim_token = NULL
   WHERE id = $1 AND organisation_id = $2 AND google_sync_claim_token = $slowWorkerToken;
   ```
   Because `$slowWorkerToken` no longer matches the row's `google_sync_claim_token`, this query updates **0 rows** (`result.rowCount === 0`).
   The slow worker's stale write is safely discarded locally, preventing it from corrupting database state or clearing a claim held by the competing worker.

#### 3. Compensation & Reconciliation After Stale Return
When a worker detects `result.rowCount === 0`, it queries the current meeting record to classify the situation:
- **Case A: Competing Worker Active or Finished:** If the meeting is active and either has a newer claim token or is already marked `synced`, the slow worker stands down. Deterministic event IDs (`meet${cleanUuid}`) serve as an essential **reconciliation aid** rather than an absolute guarantee against provider-side anomalies: when the competing worker runs its sync probe, it performs `events.get(meet${cleanUuid})` and adopts the event already provisioned upstream by the slow worker, avoiding duplicate calendar entries.
- **Case B: Concurrent Cancellation:** If the meeting was cancelled in ManageX while the worker was stalled (`status = 'cancelled'`), the meeting must not leave an active calendar event or conference link on Google Calendar. The worker initiates an asynchronous compensation call: `events.delete(meet${cleanUuid})`.
- **Case C: Revoked Credentials During Compensation:**
  If during compensation, the organisation's Google integration was disconnected, or Google returns HTTP 400/401 `invalid_grant` (refresh token expired or revoked):
  - The worker does NOT loop or retry indefinitely.
  - It records an operational audit log warning (`organisation.integration_error`).
  - It marks the cancelled meeting's sync status as `abandoned` (`google_sync_status = 'abandoned'`), acknowledging that upstream cleanup cannot proceed without valid authorization while leaving the cancelled meeting record intact in ManageX.

#### 4. Reconciling Stale External API Mutations (Beyond Database Fencing)
A database fencing token (`google_sync_claim_token`) protects PostgreSQL from stale writes, but **it cannot prevent a paused worker from issuing a late, mutating HTTP request to Google Calendar API after losing its lease**. Because Google Calendar is an external third-party service with no visibility into ManageX's database tokens, the architecture reconciles stale external mutations across all three lifecycle operations:

1. **Stale Create Operations (`events.insert`):**
   - **Mechanism:** Deterministic Event IDs (`meet${cleanUuid}`).
   - If Worker B already created the event upstream, Worker A's late `events.insert` receives **HTTP 409 Conflict**. No duplicate event is created.
   - If Worker A's insertion succeeds upstream first, Worker A's Stage 3 write fails (`rowCount === 0`). Worker B's subsequent probe performs `events.get(meet${cleanUuid})`, detects the existing event container, adopts `hangoutLink`, and reconciles database state.

2. **Stale Update/Reschedule Operations (`events.patch` / `events.update`):**
   - **Crucial Invariant:** **Deterministic event IDs DO NOT prevent stale mutations** (an `events.patch` targeting an existing event ID will overwrite the event with stale data if issued!).
   - **Two-Layered Defense & Self-Healing:**
     - **Layer 1: Upstream Optimistic Concurrency Control via ETag (`If-Match`):**
       Google Calendar API v3 provides an `etag` property on all event resources. On every read or mutation, ManageX tracks the latest `google_calendar_etag`. When issuing `events.patch`, the worker includes the HTTP header `If-Match: "<etag>"`. If another worker (Worker B) has already updated the event upstream, the ETag on Google's side has advanced, causing Google to immediately reject Worker A's stale mutation with **HTTP 412 Precondition Failed**.
     - **Layer 2: Post-Mutation Canonical Self-Healing on Stale Write Detection:**
       If an `events.patch` succeeds upstream but Worker A's Stage 3 database write fails (`rowCount === 0` due to lost claim token), Worker A recognizes: *"I just modified Google Calendar, but my database lease was revoked. Upstream Google Calendar may now have stale data."*
       Worker A immediately performs an authoritative read from PostgreSQL:
       - If the meeting in PostgreSQL was rescheduled to different times (e.g., DB has 14:00, but Worker A sent 11:00): Worker A immediately issues a corrective `events.patch(meet${cleanUuid}, { canonical_db_payload })` to restore Google Calendar to the database's true state.
       - If the meeting in PostgreSQL was cancelled: Worker A issues `events.delete(meet${cleanUuid})`.
       - If the corrective patch fails (or credentials revoked): Worker A marks `google_sync_status = 'failed_reschedule'`, prompting the UI banner for organiser/admin manual re-sync.
       This ensures PostgreSQL remains the single source of truth and self-heals external provider drift.

3. **Stale Delete Operations (`events.delete`):**
   - **Mechanism:** Idempotent deletion semantics.
   - In Google Calendar API v3, calling `events.delete` on an already deleted event returns **HTTP 404 Not Found** or **HTTP 410 Gone**, which the client treats as successful deletion.
   - Because ManageX meeting UUIDs are globally unique and immutable, a cancelled meeting is never revived under the same UUID. Therefore, a late `events.delete` for `meet${cleanUuid}` can never delete an active meeting.

### 5.3 Cancellation Races, In-Flight Recovery & Revoked Credentials

1. **Cancellation During In-Flight Create or Update:**
   - **Database State Transition:** When a user cancels a meeting (`POST /meetings/:id/status` with `status: 'cancelled'`), ManageX updates `meetings.status = 'cancelled'`, sets `google_sync_status = 'pending_delete'`, and clears claim tokens.
   - **In-Flight Worker Rejection:** An in-flight worker executing an `events.insert` or `events.patch` completes its external HTTP call and attempts Stage 3 write:
     ```sql
     UPDATE meetings
     SET virtual_url = $3,
         google_calendar_event_id = $4,
         google_sync_status = 'synced',
         google_sync_claimed_at = NULL,
         google_sync_claim_token = NULL
     WHERE id = $1 AND organisation_id = $2
       AND google_sync_claim_token = $workerToken
       AND status != 'cancelled';
     ```
     Because `status` is now `'cancelled'`, this query updates **0 rows** (`rowCount === 0`). The worker's write is rejected locally.
   - **Deterministic Event IDs Do Not Prevent Stale Mutations:** Although deterministic event IDs prevent duplicate events, they do *not* prevent an in-flight worker from having created an orphan calendar event or mutated an event immediately prior to cancellation.
   - **Compensation Dispatch:** Detecting `rowCount === 0` and seeing `status === 'cancelled'` in the database, the worker immediately dispatches an asynchronous compensation call:
     `DELETE https://www.googleapis.com/calendar/v3/calendars/primary/events/meet${cleanUuid}?sendUpdates=none`

2. **Compensation Outcomes & Failure Recovery:**
   - **Outcome A: Clean Compensation (HTTP 204 No Content, 404, or 410 Gone):**
     The upstream event is deleted. The worker updates PostgreSQL: `google_sync_status = 'none'`, `google_calendar_event_id = NULL`. Meeting remains cleanly cancelled in ManageX.
   - **Outcome B: Transient Network / Upstream Failure (HTTP 500, 503, Timeout):**
     Google is unreachable. The worker updates PostgreSQL: `google_sync_status = 'failed_cancel'`, `google_sync_error = 'Google Calendar deletion failed: ...'`.
     In ManageX UI: The meeting is shown as Cancelled, with an amber banner: *"Calendar event cleanup pending"*.
     The Organiser or Admin has two explicit actions:
     - **"Retry Cleanup"** (`POST /meetings/:id/sync-google`): triggers immediate retry of `events.delete`.
     - **"Dismiss / Mark as Abandoned"**: updates `google_sync_status = 'abandoned'`.
   - **Outcome C: Revoked Credentials or Disconnected Integration (HTTP 400/401 `invalid_grant` or integration `status = 'revoked'`):**
     If the admin disconnected Google Meet or Google revoked the refresh token:
     Upstream returns `invalid_grant` or local credentials are deleted. Retrying is guaranteed to fail.
     **Recovery Behavior:**
     - The worker terminates retries immediately (no infinite loops).
     - Records an operational audit log: `organisation.integration_error` with reason: *"Unable to delete calendar event for cancelled meeting: Google credentials revoked or disconnected"*.
     - Updates PostgreSQL: `google_sync_status = 'abandoned'`.
     - In ManageX UI: The meeting is cleanly Cancelled. The banner is dismissed, and an informational note explains: *"Integration disconnected; upstream calendar event could not be removed."*

---

## 6. Google Calendar Idempotency & Reconciliation

### 6.1 Verified API Behavior vs Assumptions

| Aspect | Status | Reality & API Behavior |
| :--- | :---: | :--- |
| **Deterministic Event ID** | **Verified** | Google Calendar API v3 explicitly allows client-specified IDs on `events.insert`. Constraint: characters must be base32hex (`[0-9a-v]`, length 5–1024). Characters `w, x, y, z` are **prohibited**. Standard hex UUIDs prefixed with `meet` form a 36-char valid ID (`m, e, t` are all in `[a-v]`). |
| **`conferenceData.createRequest.requestId`** | **Verified** | Scoped to Hangouts Meet creation *within* an event. Prevents duplicate conference rooms for the same event. |
| **`iCalUID` Behavior** | **Unverified Assumption** | While `iCalUID` is supported, Google Calendar documentation does not guarantee a uniform 409 Conflict across all Workspace domain policies. Deterministic event IDs are significantly more reliable. |
| **`privateExtendedProperty` Lookup** | **Verified** | Supported in `events.list`, but list queries are subject to search index propagation delays and are non-atomic with insertions. |

### 6.2 Deterministic Event ID Architecture
1. **Deterministic ID Derivation:**
   ```javascript
   // meeting.id is a canonical UUID: e.g. "c9bf9e57-1685-4c89-bafb-ff5af830be8a"
   // RFC 4648 base32hex uses 0-9 and a-v. 'meet' uses 'm', 'e', 't' (valid).
   const googleEventId = `meet${meeting.id.replace(/-/g, '').toLowerCase()}`;
   ```
2. **Reconciliation Sequence on Timeout / Retry:**
   - On retry, the engine executes direct `events.get(googleEventId)`.
   - **HTTP 200 OK:** Event was created upstream during the timeout. Adopt conference link and set `synced`.
   - **HTTP 404 Not Found:** Event was never created upstream. Safe to call `events.insert`.
   - **HTTP 409 Conflict on Insert:** Direct proof that the event exists upstream. Call `events.get(googleEventId)` to reconcile.
   - **Content Mismatch Guard:** If `events.get` returns an existing event whose description does not match `managex-meeting-${meeting.id}`, log a critical error and do not overwrite.
3. **Deterministic Event ID as Reconciliation Aid (Not an Absolute Guarantee):**
   Deterministic IDs (`meet` + 32-character hex UUID) serve as an essential **reconciliation aid** that eliminates duplicate calendar events under routine timeouts and competing workers.
   However, it must **not** be treated as an absolute guarantee against provider-side anomalies: Google Calendar API does not participate in distributed two-phase commits (2PC), and upstream replication latency across Google data centers or transient eventual-consistency windows can occasionally produce transient 404s after insert or delayed 409s. Therefore, the deterministic ID is treated as a foundational reconciliation aid backed by explicit GET queries, payload verification, and defensive retry bounds.

---

## 7. Attendee Calendar Behavior & The `sendUpdates=none` Policy

### 7.1 Verified Google Calendar API Documentation for `sendUpdates`
In Google Calendar API v3 (`events.insert`, `events.patch`, `events.delete`):
* `sendUpdates=all`: Google sends email notifications to all attendees.
* `sendUpdates=externalOnly`: Google sends email notifications only to non-Google Calendar attendees.
* `sendUpdates=none`: Google sends **zero email notifications**.

#### Distinguishing Key Semantics:
1. **Google Calendar Event Attendees (`attendees` array):**
   - The list of email addresses provided to Google Calendar in the event payload.
   - When `attendees` is empty (`[]`), Google creates the event strictly on the primary calendar of the authenticated shared Google account.
   - When `attendees` contains emails, Google associates those accounts with the event.
2. **ManageX Notification Delivery:**
   - ManageX's internal notification pipeline (e.g. `emailService.js`, web UI alerts, and future Phase 5a standard `.ics` attachments).
   - Independent of Google's email delivery; operates whether or not Google sends emails.
3. **`sendUpdates=none` Email Suppression vs Calendar Sync:**
   - `sendUpdates=none` **guarantees that Google will NOT send email notifications** (invitations, updates, or cancellations) to attendees.
   - However, `sendUpdates=none` **does NOT prevent Google from automatically placing the event on the personal Google Calendar of attendees who are Google Workspace or Gmail users**, depending on each user's personal Google Calendar setting ("Automatically add invitations: Always / Only if known / When I respond").
   - For **non-Google attendees** (e.g. Outlook, Yahoo, Apple Mail, corporate Exchange), `sendUpdates=none` means they receive **zero calendar entry and zero notification from Google**, because Google cannot push events to external third-party calendars without dispatching email invitations containing iCalendar payloads.
   - Consequently, passing attendees with `sendUpdates=none` creates an **asymmetric experience**: Google users may see the event appear on their calendar, while non-Google users receive nothing unless ManageX dispatches its own invitation.

### 7.2 Approved Attendee Architecture: Option A (Pure Conferencing Container)

Stakeholders have formally evaluated and **approved Option A (Pure Conferencing Container)**. Option B is rejected.

| Dimension | Option A: Pure Conferencing Container (Approved) | Option B: Roster Sync with `sendUpdates=none` (Rejected) |
| :--- | :--- | :--- |
| **Payload to Google** | `attendees: []` (Empty array passed to Google Calendar API) | `attendees: [ { email: attendee.email } ]` |
| **Google Email Delivery** | None (`sendUpdates=none`) | None (`sendUpdates=none` suppresses Google emails) |
| **Google User Personal Calendars** | **Not added** to personal Google Calendars. Event container exists exclusively on the shared organisation Google Calendar. | **Asymmetric:** Tentatively added only for Google Workspace / Gmail users depending on individual account auto-add settings. |
| **Non-Google User Calendars** | **Not added** (Managed via ManageX email / ICS). | **Not added** (Google sends no email, cannot push to external calendars). |
| **Privacy & Data Sharing** | **Complete Privacy:** Zero participant email addresses are transmitted, logged, or exposed to Google Cloud infrastructure. | **Data Disclosed:** Participant email rosters are shared with Google. |
| **Notification Pipeline** | **ManageX Owned:** ManageX exclusively manages all meeting invitations, schedule changes, and reminders via `emailService.js` and in-app alerts. Universal `.ics` calendar invite attachments are scheduled for Phase 5a. | **Split Pipeline:** ManageX must still send invitation emails to all attendees while dealing with partial Google auto-adds. |
| **Complexity & Drift** | **Zero Upstream Drift:** No need to patch Google Calendar attendee rosters when meeting attendees are invited, respond, or are removed in ManageX. | **High Drift:** ManageX would need complex bi-directional reconciliation to patch Google Calendar arrays on every attendee membership mutation. |

#### Architectural Guarantees Under Approved Option A:
1. **Strict Data Minimization:** Google Calendar is utilized strictly as a headless video container provider (Hangouts Meet). ManageX transmits only the meeting title, start time, end time, and deterministic event ID. Zero participant identities or email addresses are shared with Google.
2. **Deterministic Delivery:** Eliminates asymmetric user experiences where Gmail attendees see ghost calendar events while Outlook/Apple Mail attendees receive nothing. All participants receive identical, unified notifications from ManageX.
3. **Operational Simplicity:** Prevents attendee synchronization races, Google API quota exhaustion on large roster changes, and orphaned calendar invites.

---

## 8. Migration & Historical Data Backfill

### 8.1 Applied Database Schema: Exact Migration Excerpt (database/migrations/20261017000041_google_integrations.sql)

The following forward-only schema is **applied and verified** across both local development (`managex`) and test (`managex_test`) databases:

```sql
-- ManageX Database Migration: 20261017000041_google_integrations.sql
-- Integrations Foundation & Google Meet Support (Phase 1B)

-- 1. Create oauth_states table (Single-Use OAuth CSRF & Tenant State Tracking)
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_lookup 
  ON oauth_states(token_hash) WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_states_user 
  ON oauth_states(user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_states_org 
  ON oauth_states(organisation_id);

-- 2. Create organisation_integrations table (Tenant-Scoped Credential Storage)
CREATE TABLE IF NOT EXISTS organisation_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  envelope_version INT NOT NULL DEFAULT 1,
  key_version VARCHAR(64) NOT NULL DEFAULT '1',
  encrypted_refresh_token TEXT,
  token_iv VARCHAR(64),
  token_auth_tag VARCHAR(64),
  connected_email VARCHAR(255) NOT NULL,
  scopes TEXT[] NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'revoked', 'error')),
  last_error TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_organisation_integrations_provider UNIQUE (organisation_id, provider),
  CONSTRAINT chk_credentials_status CHECK (
    (status = 'connected' AND encrypted_refresh_token IS NOT NULL AND token_iv IS NOT NULL AND token_auth_tag IS NOT NULL)
    OR (status IN ('revoked', 'error'))
  )
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_lookup 
  ON organisation_integrations(organisation_id, provider);

-- 3. Extend meetings table with Google Meet Synchronization Columns
ALTER TABLE meetings 
  ADD COLUMN IF NOT EXISTS conference_provider VARCHAR(32) NOT NULL DEFAULT 'manual'
    CHECK (conference_provider IN ('manual', 'google_meet', 'none')),
  ADD COLUMN IF NOT EXISTS google_calendar_event_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS google_calendar_etag VARCHAR(255),
  ADD COLUMN IF NOT EXISTS google_conference_request_id UUID,
  ADD COLUMN IF NOT EXISTS google_sync_status VARCHAR(32) NOT NULL DEFAULT 'none'
    CHECK (google_sync_status IN ('none', 'synced', 'pending_create', 'failed_create', 'pending_update', 'failed_reschedule', 'pending_delete', 'failed_cancel', 'abandoned')),
  ADD COLUMN IF NOT EXISTS google_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS google_sync_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_sync_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_sync_claim_token UUID;

CREATE INDEX IF NOT EXISTS idx_meetings_google_event 
  ON meetings(organisation_id, google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_google_sync 
  ON meetings(organisation_id, google_sync_status)
  WHERE google_sync_status != 'none';

-- 4. Historical Meeting Data Backfill
-- Physical meetings without URL become 'none'; existing URLs preserved as 'manual'; virtual without URL remain 'manual'
UPDATE meetings
SET conference_provider = CASE
  WHEN virtual_url IS NOT NULL AND TRIM(virtual_url) <> '' THEN 'manual'
  WHEN location_type = 'in_person' THEN 'none'
  ELSE 'manual'
END,
google_sync_status = 'none'
WHERE google_calendar_event_id IS NULL;

-- 5. Row-Level Security Enablement & Force (SEC-009 Standard)
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states FORCE ROW LEVEL SECURITY;

ALTER TABLE organisation_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_integrations FORCE ROW LEVEL SECURITY;

-- 6. Row-Level Security Policies for managex_app (NOBYPASSRLS)
CREATE POLICY oauth_states_user_isolation ON oauth_states
  FOR ALL TO managex_app
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY org_integrations_tenant_isolation ON organisation_integrations
  FOR ALL TO managex_app
  USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

-- 7. Runtime Grants to managex_app
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_states TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_integrations TO managex_app;
```

### 8.2 Database Envelope Mapping & Phase 1B.3 Adapter Contract

The cryptographic envelope generated by `crypto.js` and the database columns stored in `organisation_integrations` map losslessly as follows:

| Crypto Envelope Property (`crypto.js`) | Database Column (`organisation_integrations`) | Database Data Type | Direction & Semantics |
| :--- | :--- | :--- | :--- |
| `version` (`number`, e.g. `1`) | `envelope_version` | `INT NOT NULL DEFAULT 1` | Persists format version to support future envelope format upgrades without breaking historical ciphertext. |
| `keyVersion` (`string`, e.g. `'1'`) | `key_version` | `VARCHAR(64) NOT NULL DEFAULT '1'` | Persists alphanumeric key version identifier matching active key or `TOKEN_ENCRYPTION_KEYRING`. |
| `iv` (`string`, 24 hex characters) | `token_iv` | `VARCHAR(64)` | 12-byte GCM initialization vector encoded as hex string. |
| `tag` (`string`, 32 hex characters) | `token_auth_tag` | `VARCHAR(64)` | 16-byte GCM authentication tag encoded as hex string. |
| `ciphertext` (`string`, hex) | `encrypted_refresh_token` | `TEXT` | Variable-length AES-256-GCM ciphertext hex representation. |

#### Phase 1B.3 Adapter Requirement (Proposed — Not Yet Implemented in Repository):
`crypto.js` is deliberately decoupled from the PostgreSQL database schema and expects an in-memory envelope object:
```javascript
{ version, keyVersion, iv, tag, ciphertext }
```
When `googleOAuthService.js` reads or writes database records during Phase 1B.3, it must use an explicit adapter. These proposed helper functions will be implemented in Phase 1B.3 (they do not yet exist in the codebase):
```javascript
// Proposed Helper Functions for Phase 1B.3 (Not yet implemented in repository)

// Database row to crypto envelope
export function rowToCryptoEnvelope(row) {
  return {
    version: row.envelope_version,
    keyVersion: row.key_version,
    iv: row.token_iv,
    tag: row.token_auth_tag,
    ciphertext: row.encrypted_refresh_token,
  };
}

// Crypto envelope to database row parameters
export function cryptoEnvelopeToRow(envelope) {
  return {
    envelope_version: envelope.version,
    key_version: envelope.keyVersion,
    token_iv: envelope.iv,
    token_auth_tag: envelope.tag,
    encrypted_refresh_token: envelope.ciphertext,
  };
}
```

### 8.3 Preconditions & Forward-Only Recovery
- **Preconditions:** Migrations `000001` through `20261017000040_meetings_root_rls_sec009.sql` applied cleanly.
- **Forward-Only Recovery Policy:** In compliance with `AGENTS.md` Rule 2 and Roadmap §2.7, **all production issues must be resolved via forward-only migrations**. Dropping tables or columns in production is strictly prohibited.

---

## 9. Encryption, Credential Lifecycle & Disconnect

### 9.1 Cryptographic Architecture (`crypto.js`)

ManageX implements envelope encryption using Node.js native `crypto` with zero external dependencies:
* **Algorithm:** Authenticated symmetric encryption using `aes-256-gcm`.
* **Initialization Vector (IV):** Cryptographically secure, randomized 12-byte IV (`IV_LENGTH_BYTES = 12`) generated via `crypto.randomBytes()`. An IV is never reused.
* **Authentication Tag:** 16-byte authentication tag (`AUTH_TAG_LENGTH_BYTES = 16`) produced by GCM mode, verified via `decipher.setAuthTag()` during decryption.
* **Additional Authenticated Data (AAD):**
  - **Exact Implemented Format:**
    ```javascript
    function buildAad(envelopeVersion, keyVersion) {
      return Buffer.from(`managex:v${envelopeVersion}:k${keyVersion}`, 'utf8');
    }
    ```
  - Both `cipher.setAAD(aadBuffer)` and `decipher.setAAD(aadBuffer)` receive this exact buffer.
  - **Integrity Guarantee:** AAD cryptographically binds the envelope format version and the key version into the authentication tag. Any tampering with the ciphertext, IV, tag, envelope version, or key version causes OpenSSL GCM verification to fail with `AUTHENTICATION_FAILED`.
  - **Cryptographic vs Database Access-Control Boundary:**
    - GCM authentication protects the confidentiality and integrity of the encrypted payload and its envelope metadata.
    - **AAD does NOT bind database row ownership, `organisation_id`, `connected_email`, or provider identity.** The cryptographic layer does not receive or validate tenant or account parameters.
    - **Tenant boundary isolation is enforced independently at the database level by PostgreSQL Row-Level Security (`org_integrations_tenant_isolation`) and composite uniqueness `uq_organisation_integrations_provider UNIQUE (organisation_id, provider)`.**
    - Runtime role `managex_app` has `NOBYPASSRLS`. Even if an encrypted credential could hypothetically be decrypted by any caller possessing the master key, PostgreSQL RLS physically blocks cross-tenant reads, writes, updates, and deletes.
    - **Crucial Invariant:** PostgreSQL RLS acts as a defense-in-depth safety net; application route handlers and services must always derive tenant context from verified server-side identity, validate active membership, and enforce RBAC permissions (`requireOrgPermission('org.update')`) prior to issuing queries. **Database RLS is never a substitute for application-level authorization.**
    - **Future Enhancement Scope:** Binding tenant and account identities directly into AAD (e.g. `managex:v${version}:k${keyVersion}:org${orgId}:email${email}`) is recognized as a potential defense-in-depth enhancement. Because altering AAD changes the cryptographic tag calculation and would invalidate all existing stored ciphertexts, it must be scoped as a deliberate future format upgrade (e.g. `envelope_version = 2`) with migration scripts and dual-version decryption support. It is not implemented in Phase 1B.

### 9.2 Key Configuration & Zero-Downtime Key Rotation Contract

Configuration is strictly validated via Zod in [`backend/src/config/env.js`](file:///d:/manageX/backend/src/config/env.js#L28-L58):

#### 1. Environment Variables:
* `TOKEN_ENCRYPTION_KEY`: Active 64-character hexadecimal key (32 bytes = 256 bits). Required for encryption.
* `TOKEN_ENCRYPTION_KEY_VERSION`: String identifier for the active key (default `'1'`).
* `TOKEN_ENCRYPTION_KEYRING`: Optional JSON string mapping historical key versions to 64-character hexadecimal keys (e.g. `'{"v1":"0123...","v2":"abcd..."}'`).

*(Note: Legacy variables such as `TOKEN_ENCRYPTION_KEY_V1` and `TOKEN_ENCRYPTION_KEY_V2` are obsolete and are not recognized by `env.js` or `crypto.js`.)*

#### 2. Key Resolution & Decryption Rules:
1. **Active Encryption:** All new tokens are encrypted using `TOKEN_ENCRYPTION_KEY` and stamped with `TOKEN_ENCRYPTION_KEY_VERSION` in `envelope.keyVersion` and `organisation_integrations.key_version`.
2. **Version Selection on Decryption:**
   - `resolveDecryptionKey(keyVersion)` compares `keyVersion` against the active `TOKEN_ENCRYPTION_KEY_VERSION`.
   - If it matches, the active key is used.
   - If it does not match, `crypto.js` inspects `TOKEN_ENCRYPTION_KEYRING` for a matching version key.
3. **Missing Key Handling:** If the requested `keyVersion` is absent from both the active key and the keyring, `resolveDecryptionKey` throws `CryptographicError('Key version not found in active key or keyring', 'KEY_VERSION_NOT_FOUND')` and fails closed.
4. **Strict Authentication (Zero Trial-and-Error Fallback):** If decryption fails (`AUTHENTICATION_FAILED`), `crypto.js` immediately throws and **never** falls back to trial decryption using other keys in the keyring.
5. **Pre-Retirement Re-Encryption Requirement:** Before an old key can be retired from `TOKEN_ENCRYPTION_KEYRING`, all database records encrypted under that version must be decrypted with the old key, re-encrypted with the active key, and updated with the new `key_version` in PostgreSQL.
6. **No Automated Rotation Script:** No automated rotation script currently exists in the repository. An offline re-encryption utility does not exist yet and is future work; developing and executing this utility is a mandatory prerequisite before any historical key version can be retired from `TOKEN_ENCRYPTION_KEYRING`. Active rotation is managed operationally by retaining superseded keys in `TOKEN_ENCRYPTION_KEYRING` until all historical rows are re-encrypted under the new active key.

### 9.3 Google Revocation & Credential Erasure
When an administrator disconnects the integration:
1. **Upstream Revocation Request:**
   Google's documented endpoint requires `POST` with `application/x-www-form-urlencoded` body (tokens must NOT be sent in query strings):
   ```javascript
   await fetch('https://oauth2.googleapis.com/revoke', {
     method: 'POST',
     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
     body: new URLSearchParams({ token: decryptedRefreshToken }).toString(),
   });
   ```
2. **Upstream Failure Resilience:** If Google returns 500 or token is already revoked upstream, ManageX logs an operational warning and proceeds with local erasure.
3. **Local Credential Erasure:**
   Credentials are set to `NULL` to eliminate stored ciphertext:
   ```sql
   UPDATE organisation_integrations
   SET status = 'revoked',
       encrypted_refresh_token = NULL,
       token_iv = NULL,
       token_auth_tag = NULL,
       updated_at = NOW()
   WHERE organisation_id = $1;
   ```
   Conforms to `chk_credentials_status` constraint.

---

## 10. Permissions, UX & Join Gateway

### 10.1 Permissions
- Connection, disconnection, and integration settings require `requireOrgPermission('org.update')`.
- Meeting creation and rescheduling require `requireOrgPermission('meeting.edit')`.
- Meeting cancellation requires `requireOrgPermission('meeting.status.manage')`.

### 10.2 Authenticated Join Gateway (`GET /meetings/:id/join`)
1. **Authentication:** Validates active session (`requireAuth`) and active organisation membership (`requireOrgMembership`).
2. **Visibility Check:**
   - If `visibility === 'organisation'`: permitted for all active members.
   - If `visibility === 'attendees_only'`: verifies user is organiser or invited attendee.
3. **Terminal Lockdown:** If meeting is `completed`, `cancelled`, or `missed`, rejects with HTTP 409 `MEETING_TERMINAL_STATE`.
4. **Status Invariant:** Joining **never** changes meeting status (does not mutate `scheduled` to `in_progress`).
5. **Scheme Safety:** Validates that `virtual_url` uses `http:` or `https:`. Blocks `javascript:`, `data:`, or protocol-relative `//` URLs to prevent open redirects and XSS.
6. **Audit Event:** Records `meeting.joined` with `actor_id`, `meeting_id`, and timestamp.
7. **Response:** Returns `{ success: true, data: { virtualUrl: meeting.virtual_url } }`.

### 10.3 Manual URL Preservation & Fallback
- Manual URL entry remains 100% available via `conferenceProvider: 'manual'`.
- If Google Meet generation fails, the meeting remains scheduled with `failed_create`. The organiser can paste a manual Zoom/Teams/Meet link, which sets `conference_provider = 'manual'` and `google_sync_status = 'none'`.

---

## 11. Exact File Inventory

### 11.1 Files Already Created or Modified in Phases 1B.1 & 1B.2 (Implemented & Locally Verified)

| File Path | Type | Phase | Implementation Status & Verification |
| :--- | :--- | :---: | :--- |
| `backend/src/platform/common/crypto.js` | Backend Utility | 1B.1 | **Implemented:** AES-256-GCM encryption/decryption, 12-byte IV, 16-byte tag, key versioning, AAD. Verified with 37 unit tests. |
| `backend/src/config/env.js` | Backend Config | 1B.1 | **Modified:** Added Zod schema for `TOKEN_ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY_VERSION`, `TOKEN_ENCRYPTION_KEYRING`, and Google OAuth credentials. |
| `backend/src/platform/common/crypto.test.js` | Unit Test | 1B.1 | **Implemented:** Comprehensive 37-test suite for crypto utility (IV uniqueness, tampering detection, key rotation). |
| `database/migrations/20261017000041_google_integrations.sql` | SQL Migration | 1B.2 | **Applied:** Migration 041 creates `oauth_states`, `organisation_integrations`, extends `meetings`, backfills historical rows, enables and forces RLS. Applied on `managex` and `managex_test`. |
| `backend/src/platform/database/google_integrations_rls.integration.test.js` | Integration Test | 1B.2 | **Implemented:** 18 integration tests verifying RLS isolation on `oauth_states` and `organisation_integrations` under `managex_app` with `NOBYPASSRLS`. |

### 11.2 Files to Create or Modify in Phase 1B.3 (Gated — Planned for Phase 1B.3)

| File Path | Type | Nature of Work | Responsibility |
| :--- | :--- | :---: | :--- |
| `backend/src/platform/integrations/googleOAuthService.js` | Backend Service | New | State token generation, atomic single-use state consumption, code exchange, token refresh, snake_case/camelCase envelope adapters. |
| `backend/src/routes/integrations.js` | Express Router | New | Route handlers for `/authorize`, `/callback`, `/disconnect`, and `/status`. |
| `backend/src/platform/integrations/googleOAuth.test.js` | Unit Test | New | Unit tests for OAuth state generation, nonce verification, cookie matching, and permission checks. |
| `backend/src/routes/organisations.js` | Express Router | Modify | Mount `integrationsRouter` at `/api/v1/organisations/:orgId/integrations`. |
| `backend/src/routes/index.js` | Express Router | Modify | Mount top-level global callback route `GET /api/v1/integrations/google/callback`. |
| `backend/src/platform/audit/auditService.js` | Backend Service | Modify | Add `encrypted_refresh_token`, `token_iv`, `token_auth_tag` to `redactSecrets`. |
| `frontend/src/pages/workspace/settings/IntegrationsSettingsTab.tsx` | UI Component | New | Admin settings panel to connect, monitor status, and disconnect the shared Google Workspace account. |

### 11.3 Files to Create or Modify in Phases 1B.4 through 1B.6 (Planned)

| File Path | Type | Phase | Responsibility |
| :--- | :--- | :---: | :--- |
| `backend/src/platform/integrations/googleCalendarClient.js` | Backend Client | 1B.4 | Low-level HTTPS client for Google Calendar v3 API (`events.insert`, `events.patch`, `events.delete`, `events.get`) with bounded timeouts and retries. |
| `backend/src/platform/integrations/googleMeetService.js` | Backend Service | 1B.4 | High-level orchestrator for decoupled meeting creation, atomic claim leasing, deterministic event lookups, and lifecycle sync. |
| `backend/src/routes/meetings.js` | Express Router | 1B.4 | Mount `GET /:meetingId/join`, `POST /:meetingId/sync-google`, and extend create meeting schema. |
| `backend/src/platform/meetings/meetingService.js` | Backend Service | 1B.4 | Integrate decoupled Meet creation in `createMeeting`, calendar sync in `updateMeeting`, calendar delete in `transitionMeetingStatus`, and `getMeetingJoinUrl`. |
| `backend/src/platform/integrations/googleMeet.integration.test.js` | Integration Test | 1B.4 | Integration test suite for Google Meet provisioning, retry leasing, compensation, and error recovery. |
| `backend/src/platform/meetings/meetings_join.integration.test.js` | Integration Test | 1B.5 | Security test suite for authenticated join gateway, visibility rules, URL scheme sanitization, and terminal lockouts. |
| `frontend/src/types/meetings.ts` | Frontend Types | 1B.5 | Add `conferenceProvider`, `googleMeetStatus`, `googleSyncStatus`, and `googleMeetError` to `MeetingItem`. |
| `frontend/src/pages/workspace/meetings/ScheduleMeetingDialog.tsx` | UI Component | 1B.5 | Add conferencing provider selector ("Google Meet", "Manual Link", "In-Person"). |
| `frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx` | UI Component | 1B.5 | Render pending/failed sync badges, retry link action, and authenticated join button. |

---

## 12. Ordered Implementation Phases & Acceptance Criteria

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1B ORDERED IMPLEMENTATION ROADMAP                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Phase 1B.1: Cryptography, Tokens & Security Infrastructure                 │
│   └── AES-256-GCM crypto.js, env schema updates, and unit test suites       │
│                                                                             │
│   Phase 1B.2: Database Migration & RLS Isolation                            │
│   └── Migration 041 (oauth_states, organisation_integrations, meetings RLS) │
│                                                                             │
│   Phase 1B.3: OAuth 2.0 Integration & Admin UI                              │
│   └── State validation, token exchange, settings tab, disconnect flow       │
│                                                                             │
│   Phase 1B.4: Google Calendar Client & Meet Orchestration                   │
│   └── Conference creation, retry handler, rescheduling, and cancellation    │
│                                                                             │
│   Phase 1B.5: Meetings Dialog & Detail Page UI                              │
│   └── Automatic toggle in Schedule dialog, retry button, authenticated join │
│                                                                             │
│   Phase 1B.6: Full Regression, Security Audit & Verification                │
│   └── Live RLS tests, mock API regression, typecheck, production build      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 1B.1: Cryptography, Tokens & Security Infrastructure
* **Status:** `IMPLEMENTED & VERIFIED` (Completed locally; 37/37 tests passed in `crypto.test.js`).
* **Files:** `backend/src/platform/common/crypto.js`, `backend/src/config/env.js`, `backend/src/platform/common/crypto.test.js`.
* **Prerequisites:** None.
* **Acceptance Criteria:**
  - AES-256-GCM correctly encrypts and decrypts strings using 12-byte IV and 16-byte tag.
  - Modifying ciphertext, IV, tag, or AAD metadata throws `CryptographicError` with code `AUTHENTICATION_FAILED`.
  - Process boots cleanly in development mode when Google credentials are omitted.

### Phase 1B.2: Database Migration & RLS Isolation
* **Status:** `IMPLEMENTED & VERIFIED` (Completed locally; applied to `managex` and `managex_test`; 18/18 tests passed in `google_integrations_rls.integration.test.js`).
* **Files:** `database/migrations/20261017000041_google_integrations.sql`, `backend/src/platform/database/google_integrations_rls.integration.test.js`.
* **Prerequisites:** Phase 1B.1.
* **Acceptance Criteria:**
  - Migration 041 applies cleanly on local databases `managex` and `managex_test` (port 5433).
  - RLS verifies Tenant A cannot query or modify Tenant B integration records (`oauth_states` and `organisation_integrations`).
  - Historical meetings backfill correctly: physical meetings become `'none'`, existing URLs become `'manual'`, all set to `google_sync_status = 'none'`.

### Phase 1B.3: OAuth 2.0 Integration & Admin Settings UI
* **Status:** `STRICTLY GATED — AWAITING EXPLICIT AUTHORIZATION` (Zero code implemented; implementation cannot begin until authorized).
* **Files:** `backend/src/platform/integrations/googleOAuthService.js`, `backend/src/routes/integrations.js`, `backend/src/routes/index.js`, `backend/src/routes/organisations.js`, `frontend/src/pages/workspace/settings/IntegrationsSettingsTab.tsx`.
* **Prerequisites:** Phase 1B.2.
* **Acceptance Criteria:**
  - Org Admin can initiate OAuth connection; non-admin receives 403 `FORBIDDEN`.
  - Callback atomically consumes `oauth_states` via user-isolated RLS, burning state token even on permission failure.
  - Reauthorization preserves existing refresh token if Google omits it.
  - Implements explicit adapter bridging database columns (`envelope_version`, `key_version`, etc.) and `crypto.js` envelope `{ version, keyVersion, ... }`.
  - Disconnect revokes tokens upstream via URL-encoded POST and erases local credentials to NULL.

### Phase 1B.4: Google Calendar Client & Meet Orchestration
* **Status:** `PLANNED / UNIMPLEMENTED` (Gated behind Phase 1B.3).
* **Files:** `backend/src/platform/integrations/googleCalendarClient.js`, `backend/src/platform/integrations/googleMeetService.js`, `backend/src/platform/meetings/meetingService.js`, `backend/src/routes/meetings.js`.
* **Prerequisites:** Phase 1B.3.
* **Acceptance Criteria:**
  - Meeting creation with `google_meet` provisions Hangouts Meet link using Option A (`attendees: []`, `sendUpdates=none`).
  - Two-Stage Decoupled Pattern holds 0 DB transactions open during Google HTTP calls.
  - 45s database lease claim blocks concurrent sync calls.
  - Rescheduling calls `events.patch`; cancellation calls `events.delete`.
  - Cancellation during in-flight creation triggers compensation `DELETE`.
  - Provider failure marks `google_sync_status = 'failed_create'` without invalidating the meeting.

### Phase 1B.5: Meetings Dialog, Detail Page & Join Gateway UI
* **Status:** `PLANNED / UNIMPLEMENTED` (Gated behind Phase 1B.4).
* **Files:** `frontend/src/pages/workspace/meetings/ScheduleMeetingDialog.tsx`, `frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx`, `frontend/src/types/meetings.ts`, `backend/src/platform/meetings/meetings_join.integration.test.js`.
* **Prerequisites:** Phase 1B.4.
* **Acceptance Criteria:**
  - Schedule dialog shows "Google Meet (Automatic)" when integration is connected.
  - Failed sync displays amber banner with "Retry Link" CTA.
  - Join CTA routes through `GET /meetings/:id/join`; rejects terminal meetings; never alters meeting status.
  - Manual URL input remains available and functional.

### Phase 1B.6: Full Regression, Security Audit & Verification
* **Status:** `PLANNED / UNIMPLEMENTED` (Gated behind Phases 1B.1–1B.5).
* **Files:** Entire backend and frontend suites.
* **Prerequisites:** Phases 1B.1 through 1B.5.
* **Acceptance Criteria:**
  - All existing backend and meetings tests pass.
  - All existing frontend tests pass.
  - `npm run typecheck:frontend` reports 0 errors.
  - `npm run build:frontend` builds cleanly.
  - Audit log verification asserts 0 tokens or keys leak into metadata.

---

## 13. Resolved Stakeholder Decisions & Operational Limitations

Stakeholders have formally resolved the open operational decisions as follows:

### 13.1 Google Cloud Publishing Status: Testing Mode Approved (With Operational Limitations)
* **Resolved Decision:** Initial Phase 1B implementation and verification will proceed under Google Cloud **Testing mode**.
* **Operational Limitation (7-Day Token Expiry):**
  - In Google Cloud "Testing" mode, OAuth refresh tokens for external test accounts expire automatically after **7 days**, requiring organisation administrators to re-authenticate weekly during testing and staging verification.
  - Testing mode is strictly an interim testing arrangement and is **not suitable for permanent production operation**.
* **Production Path & Verification Requirement:**
  - Prior to production general availability, ManageX must either:
    1. Complete Google Cloud OAuth consent screen app verification and publish the application, OR
    2. Restrict the application to an internal Google Workspace domain (which is exempt from the 7-day testing expiry limit).
  - The ManageX Google integration has **not** been approved, verified, or published for production by Google.

### 13.2 External Attendee Calendar Placement: Option A Approved (Pure Conferencing Container)
* **Resolved Decision:** Stakeholders have explicitly approved **Option A (Pure Conferencing Container)**. Option B is rejected.
* **Operational Contract:**
  - Google Calendar API calls (`events.insert`, `events.patch`) will strictly supply `attendees: []` (empty array) and `sendUpdates=none`.
  - The calendar event exists exclusively on the shared organisation Google Calendar as a video conferencing container.
* **Privacy & User Experience Guarantees:**
  - **Complete Email Privacy:** Zero attendee email addresses are transmitted, logged, or shared with Google Cloud infrastructure.
  - **Symmetric Delivery:** Eliminates asymmetric discrepancies where Gmail users see ghost calendar entries while non-Google participants receive nothing.
  - **Single Source of Truth:** ManageX exclusively owns participant notifications, schedule updates, and RSVPs via `emailService.js` and in-app alerts. Universal `.ics` calendar attachments will be introduced in Phase 5a.
  - **Zero Roster Drift:** Eliminates the need to synchronize attendee adds/removals with Google Calendar.

---

## 14. Implementation Gate & Approval Checklist

- [x] **Architecture Plan & Blueprint Reviewed:** Canonical architecture finalized and documented through Revision 2.5.
- [x] **Stakeholder Decisions Formally Resolved:** Testing mode (with 7-day token expiry risk) and Option A (pure conferencing container) approved and recorded.
- [x] **Phase 1B.1 Implemented & Verified:** Cryptography module `crypto.js`, environment schema `env.js`, and unit test suite `crypto.test.js` (37/37 tests passed).
- [x] **Phase 1B.2 Implemented & Verified:** Migration `20261017000041_google_integrations.sql` applied cleanly on local databases `managex` and `managex_test` (port 5433); RLS integration test suite `google_integrations_rls.integration.test.js` (18/18 tests passed); historical backfills verified.
- [ ] **Phase 1B.3 Authorization Gate (STRICT STOP CONDITION):** Explicit user authorization required before starting Phase 1B.3 implementation.
- [ ] **Google Cloud Credentials Provisioned:** Client ID and Secret obtained from Google Cloud Console in Testing mode and populated in local `.env`.
- [ ] **Phases 1B.4 through 1B.6:** Unimplemented and gated behind Phase 1B.3.

---

*End of Canonical Google Meet Integration Plan (Revision 2.5).*
