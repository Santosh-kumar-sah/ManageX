# ManageX Testing Strategy & Quality Assurance Plan

## 1. Testing Philosophy & Invariants

ManageX enforces strict multi-tenant isolation, defense-in-depth authorization, and reliable data consistency.
- **Rule 1:** A test is never considered "passed" unless the execution command ran and exited with status 0.
- **Rule 2:** Unit tests alone are insufficient for security verification. PostgreSQL RLS and tenant isolation must be proven with real database integration tests using the unprivileged runtime role (`managex_app`).
- **Rule 3:** Authorization failure paths (401, 403, 404) must be tested as thoroughly as success paths.

---

## 2. Testing Levels & Tooling

```text
┌────────────────────────────────────────────────────────┐
│ 1. Unit Tests (Node.js test runner / Vitest)           │
│    - Status transition guards & state machines         │
│    - Zod schema validation edge cases                  │
│    - Due-date & registration window calculations       │
│    - Straight-sum score aggregations                   │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. API Integration Tests (Supertest)                   │
│    - Authentication lifecycle & session rotation       │
│    - Permission & role evaluation matrix               │
│    - Module entitlement gating (403 for disabled)      │
│    - Multi-tenant query tampering & path manipulation  │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Database & RLS Integration Tests (Real Postgres)    │
│    - Executed strictly as `managex_app` runtime role   │
│    - Missing context -> Deny all (0 rows returned)     │
│    - Cross-tenant SELECT/INSERT/UPDATE/DELETE tests    │
│    - Pooled connection context leak tests (Org A -> B) │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Concurrency & Integrity Tests                       │
│    - Event capacity overbooking race condition tests   │
│    - Duplicate invitation acceptance under race        │
│    - Last-owner concurrent demotion prevention         │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ 5. End-to-End & UI Acceptance Tests (Playwright)       │
│    - Complete user journeys across all modules         │
│    - Keyboard navigation & focus management (WCAG)     │
│    - Mobile/tablet responsive layout checks            │
└────────────────────────────────────────────────────────┘
```

---

## 3. High-Risk Security Test Suites

### Suite A: PostgreSQL RLS Context Isolation & Pooling Test
1. Connect using the runtime role `managex_app` (verify role is NOT superuser and has NO `BYPASSRLS`).
2. Run transaction for Tenant A (`org-1`): insert private event row.
3. On the **exact same pooled connection**, run query for Tenant B (`org-2`):
   - Assert `SELECT * FROM events` returns **0 rows** for `org-1`.
4. Run query with **empty/missing context**:
   - Assert all reads and writes fail closed (0 rows or exception).
5. Attempt cross-tenant insert (Tenant A transaction setting Tenant B's `organisation_id` in payload):
   - Assert `WITH CHECK` violation throws PostgreSQL error `42501` (insufficient privilege).

### Suite B: External Participant Boundary Test
1. Create User X (verified ManageX user, not a member of Org 1).
2. Register User X for public hackathon in Org 1.
3. Assert User X can retrieve their registration and submission details.
4. User X calls `/api/v1/organisations/org-1/members`:
   - Assert `403 Forbidden` ("Active membership required").
5. User X calls `/api/v1/organisations/org-1/meetings`:
   - Assert `403 Forbidden` ("Active membership required").
6. User X queries another participant's registration:
   - Assert `404 Not Found` or `403 Forbidden`.

### Suite C: Hackathon Capacity Concurrency Test
1. Create a published hackathon with remaining capacity = 1.
2. Fire 10 simultaneous registration requests for 10 distinct verified users using `Promise.all()`.
3. Assert:
   - Exactly **1 request** succeeds with `201 Created`.
   - Exactly **9 requests** fail with `409 Conflict` ("Event capacity reached").
   - Total registrations in database equals exactly 1.

### Suite D: Final-Owner Invariant Test
1. Organisation has exactly 1 active owner (User A).
2. Attempt to delete or suspend User A via API:
   - Assert `409 Conflict` ("Cannot remove the final active owner").
3. Simultaneously dispatch two demotion requests:
   - Assert database transaction and unique lock prevent both from succeeding.

### Suite E: Meetings Core, Access Control & RLS Regression Test
1. **10 Complete User Journeys (`meetings_regression.integration.test.js`):**
   - Journey 1: Meeting scheduling, time zone validation, eligible org attendees, and auto-attached organiser.
   - Journey 2: Ordered agenda items creation, sequential order preservation, and atomic reordering.
   - Journey 3: Meeting updates and lifecycle progression (`scheduled` -> `in_progress` -> `completed` -> terminal lockout).
   - Journey 4: Visibility policy enforcement (`organisation` vs `attendees_only` denying non-attendees with `MEETING_ACCESS_DENIED`).
   - Journey 5: Confidential notes confidentiality: non-organisers without notes permissions denied; note content omitted from audit logs.
   - Journey 6: Action item management: assignee must be active org member, non-managers restricted from modifying title/due-date/assignee.
   - Journey 7: Deterministic pagination and filter regression (`status`, `timeframe`, `page`, `limit`).
   - Journey 8: Cross-meeting and cross-tenant agenda/action item tampering rejected (404/403).
   - Journey 9: Email delivery resilience: captured in test mailbox, cancellation/reschedule updates sent, body never contains confidential notes.
   - Journey 10: Dynamic revocation: revoking organisation membership or disabling `meetings` module immediately cuts off protected API access.
2. **Direct PostgreSQL RLS Least-Privilege Verification (`managex_app` role):**
   - Tenant A cannot query or mutate meetings, attendees, agenda items, notes, or action items belonging to Tenant B.
   - Composite foreign keys (`organisation_id, meeting_id`) strictly prevent cross-tenant referencing at the database engine level (`23503`).
   - Deny-by-default verified when tenant context is cleared or invalid.

### Suite F: Projects Core, Membership & Lifecycle Suite (`projects.integration.test.js`)
1. **Creation & Data Validation:**
   - Valid project creation initializes default priority (`medium`) and initial status (`planning`).
   - Project creator is automatically registered as a project member with `manager` role.
   - Non-existent or cross-tenant owner references are rejected with `422 INVALID_OWNER`.
   - Date validation enforces `start_date <= target_date`; inverted ranges are rejected with `422 VALIDATION_ERROR`.
2. **Canonical Lifecycle Transitions:**
   - Valid forward progressions (`planning` -> `active` -> `on_hold` -> `completed` -> `archived`) are verified.
   - Invalid lifecycle leaps (e.g., `planning` -> `completed`, `completed` -> `active`) are rejected with `409 INVALID_PROJECT_TRANSITION`.
   - Terminal state invariant: Once in `archived` status, status transitions and field updates are blocked with `409 PROJECT_ARCHIVED`.
3. **Project Membership & Owner Safety Invariants:**
   - Members can be added (`manager`, `contributor`, `viewer`) and updated.
   - Cross-tenant user addition is rejected with `422 INVALID_MEMBER`.
   - Owner removal guard: Attempting to remove the project owner without ownership transfer is rejected with `409 CANNOT_REMOVE_PROJECT_OWNER`.
   - Owner demotion guard: Attempting to demote the owner from `manager` to `contributor` or `viewer` is rejected with `409 CANNOT_DEMOTE_PROJECT_OWNER`.
   - Project non-members without `project.view_all` / `org.admin` permissions are denied access with `403 PROJECT_ACCESS_DENIED`.
4. **Tenant Isolation & RLS Engine Checks (`managex_app`):**
   - Direct database queries under restricted runtime role `managex_app` return 0 rows for foreign tenant projects and members.
   - Attempts to insert cross-tenant project members violate composite foreign key constraints (`organisation_id, project_id`).

### Suite G: Tasks Core, Workflow & Filtering Suite (`tasks.integration.test.js`)
1. **Creation, Data Validation & Soft Deletion (PRJ-003):**
   - Tasks initialize with default status (`backlog`) and priority (`medium`).
   - Priority validation accepts only `urgent`, `high`, `medium`, `low`.
   - Dates validation enforces `start_date <= due_date`.
   - Invalid status strings rejected with `422 VALIDATION_ERROR`.
   - Soft deletion retains record with `deleted_at` and `deleted_by_id`, filtering it out from active task listings.
2. **Assignee Eligibility & Assignment Invariant Guards (PRJ-004):**
   - Assignees must belong to both the parent organisation and project (`project_members`).
   - Assigning non-members or cross-tenant users is rejected with `422 VALIDATION_ERROR`.
   - Removing a project member who has active tasks (`deleted_at IS NULL AND status != 'done'`) is blocked with `409 MEMBER_HAS_ACTIVE_TASKS`.
   - Suspending or removing an organisation member with active tasks is blocked with `409 MEMBER_HAS_ACTIVE_TASKS`.
   - Once tasks are completed (`done`), member removal succeeds without error.
3. **Canonical Lifecycle Transitions & Board Workflow (PRJ-005):**
   - Strict server-enforced state machine: `backlog` -> `todo` -> `in_progress` -> `done`/`blocked`.
   - Invalid transitions (e.g., `backlog` -> `done`, `done` -> `todo`) rejected with `409 INVALID_TASK_TRANSITION`.
   - Reopening a completed task (`done` -> `in_progress`) requires `project.edit` or manager/admin role; ordinary assignees without permission are rejected with `403 FORBIDDEN`.
   - Mutating or creating tasks in an `archived` project is blocked with `409 PROJECT_ARCHIVED`.
4. **Server-Side Filtering, Pagination & My Tasks (PRJ-006):**
   - Filters tasks by `status`, `priority`, `assigneeId`, `assigned_to_me`.
   - Special view filters: `due_soon` ($\le 7\text{ days}$ in future) and `overdue` ($< \text{now}$ UTC and status $\ne$ `done`).
   - Search filter queries across title and description.
   - Cross-project `GET /api/v1/organisations/:orgId/tasks/my` retrieves all non-deleted, non-archived tasks assigned to the caller across the entire organisation.
5. **Multi-Tenancy & RLS Isolation (`managex_app`):**
   - Cross-tenant task creation and querying return empty sets under RLS.
   - Composite foreign keys `(project_id, organisation_id)` block cross-tenant project referencing at the database level (`23503`).

### Suite H: Task Comments, Activity Timeline & Full Acceptance Suite (`comments_activity.integration.test.js`)
1. **Safe Text Comments & Authorization (PRJ-007):**
   - Any project member can post plain-text comments (1..2000 chars); empty string and >2000 chars rejected with `422 VALIDATION_ERROR`.
   - Script injection and HTML payload stored safely as literal strings, neutralized upon frontend rendering.
   - Non-members of the project are forbidden from creating or listing comments (`403 PROJECT_ACCESS_DENIED`).
   - Author can edit their own comment while project is not archived; other members attempting to edit receive `403 FORBIDDEN`.
   - Author can soft-delete their own comment; deleted comments display placeholder `[This comment has been deleted]`, preserve author and timestamp, but purge comment body from public payload.
   - Moderator/manager can soft-delete others' comments when possessing `project.comment.moderate` or manager role; unauthorized members attempting to delete others' comments receive `403 FORBIDDEN`.
   - When project is `archived`, all comment creation, editing, and deletion operations fail closed with `409 PROJECT_ARCHIVED`.
2. **Concise Project Activity Timeline (PRJ-008):**
   - Material domain events recorded in `project_activity`: `project_created`, `project_status_changed`, `member_added`, `member_role_changed`, `member_removed`, `task_created`, `task_status_changed`, `task_assigned`, `task_deleted`, `comment_added`, `comment_edited`, `comment_deleted`.
   - Timeline queries return entries in strict descending chronological order (`created_at DESC`).
   - Sensitive payloads (passwords, tokens, cookies, comment bodies) are strictly excluded from activity metadata and compliance audit logs.
   - Archiving project preserves full historical activity and task records for read-only inspection.
3. **Multi-Tenancy, Composite FK & RLS Engine Checks (`managex_app`):**
   - Queries under restricted role `managex_app` enforce `organisation_id` boundaries: Tenant A cannot view Tenant B task comments or activity.
   - Composite foreign keys `(project_id, organisation_id)` and `(task_id, organisation_id)` reject cross-tenant parent tampering at database level (`23503`).
   - Dynamic module deactivation of `projects` immediately returns `403 MODULE_DISABLED` on comment and activity endpoints while preserving all records intact.

### Suite I: Platform Administration Console & Operational Controls Suite (`platform.integration.test.js`)
1. **Namespace & Layout Segregation (PLAT-001):**
   - Unauthenticated requests to `/api/v1/platform/*` fail closed with `401 AUTH_REQUIRED`.
   - Regular workspace members fail closed with `403 PLATFORM_ACCESS_DENIED`.
   - Distinct `/platform` operator console layout completely separated from customer workspace layouts.
2. **Global Account Lifecycle & Suspension Controls (PLAT-002):**
   - Paginated user account listing returns allowlisted operational fields only (`id`, `fullName`, `email`, `status`, `isPlatformAdmin`, `platformRole`, `emailVerifiedAt`, `createdAt`, `updatedAt`).
   - Zero password hashes, reset tokens, or session secrets exposed.
   - Super Admin can suspend accounts; suspended accounts have all active sessions revoked immediately and fail closed on login (`403 ACCOUNT_DISABLED`).
   - Super Admin cannot suspend self (`409 CANNOT_SUSPEND_SELF`).
   - Super Admin can reactivate accounts to restore login capability.
3. **Organisation Operational Inspection & Non-destructive Suspension (PLAT-003):**
   - Super Admin and Support Agent can list customer workspaces with member counts, active module counts, and status.
   - Detailed inspection endpoint returns operational metadata only.
   - Super Admin can suspend customer workspaces; suspension immediately blocks workspace access for all members (`403 ORG_INACTIVE`).
   - Suspension is strictly non-destructive: all underlying events, meetings, tasks, and data are preserved intact.
4. **Platform Module Catalogue Availability Controls (PLAT-004):**
   - Lists fixed 3 MVP modules (`events`, `meetings`, `projects`).
   - Arbitrary module keys cannot be queried or updated (`404 MODULE_NOT_FOUND`).
   - Super Admin can disable module platform-wide; disabling immediately cascades and blocks workspace API calls with `403 MODULE_PLATFORM_UNAVAILABLE`.
   - Disabling platform availability preserves customer data and restores access immediately upon re-enablement.
5. **Least-Privilege Support Agent Role (PLAT-005):**
   - Support Agent can read platform overview, account directory, organisation metadata, and audit logs.
   - Support Agent is strictly forbidden from executing mutations (account suspension, workspace suspension, module toggling) with `403 FORBIDDEN`.
6. **Strict Avoidance of Ticketing Scope (PLAT-006):**
   - Codebase audit verifies zero support ticketing schemas, queues, customer inboxes, or SLA workflows.
7. **Append-Only Platform Audit Log (PLAT-007):**
   - All high-impact platform operations generate immutable audit log entries with `organisation_id IS NULL`.
   - Audit logs capture actor ID, action key, target entity, caller IP, and sanitized metadata (zero passwords, tokens, or confidential content).
8. **Tenant Isolation & RLS Boundary (SEC-009):**
   - Runtime role `managex_app` has `NOBYPASSRLS`.
   - Platform operator credentials do not grant blanket bypass to private tenant records.

### Suite H: Phase 10 — Cross-Cutting Security Audit, Fuzzing & Performance Suites
1. **Security Audit & Fuzzing (`security_audit.integration.test.js` - 13/13 Pass):**
   - Timing attack mitigation: dummy 12-round bcrypt compare on non-existent users.
   - CSRF protection: state-changing mutations without or with mismatched `X-CSRF-Token` fail closed (401/403).
   - Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Content-Security-Policy`.
   - Restrictive CORS: unapproved origins rejected.
   - 100KB payload limit: payloads > 100KB rejected with 413 `PAYLOAD_TOO_LARGE`.
   - Injection fuzzing: SQLi vectors safely parameterized; XSS scripts stored and returned as safe text; null bytes handled with 400 `INVALID_ENCODING`.
   - Secret redaction: zero password hashes, session tokens, or API secrets in logs, audit records, or API error envelopes.
   - Exhaustive RLS CRUD matrix: User in Org B cannot read, create, update, or delete Org A events, meetings, notes, projects, tasks, or comments under `managex_app`.
   - Composite FK integrity: foreign tenant references rejected with PostgreSQL error `23503`.
2. **Database Performance & Pool Resilience (`performance.integration.test.js` - 4/4 Pass):**
   - Connection pool exhaustion & recovery: queued clients succeed once capacity is freed without deadlocks.
   - Transaction cleanup: `app.current_organisation_id` strictly reset to blank upon commit/rollback.
   - p95 read latency measured at 32ms (< 200ms target).
   - p95 write latency measured at 58ms (< 500ms target).
   - 1,000-row task pagination measured at 181ms (< 2.0s target).
   - `EXPLAIN ANALYZE` confirms execution utilizes `idx_tasks_project_status` index scan with zero unindexed table scans.
3. **Frontend Accessibility Verification (`Accessibility.test.tsx` - 6/6 Pass):**
   - WCAG 2.2 AA contrast verified across light theme palette (>= 4.5:1 text, >= 3:1 UI components).
   - Semantic primitives: `Button` (`aria-busy`, visible focus), `Input` (`aria-invalid`), `Dialog` (`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`), `TableHead` (`scope="col"`).

---

## 4. Accessibility & Responsive Verification Plan

- **Standards Target:** WCAG 2.2 AA.
- **Automated Check:** `@axe-core/playwright` run across all public and authenticated workspace views.
- **Manual Checklist:**
  - Complete full workflow using only `Tab`, `Shift+Tab`, `Enter`, and `Space`.
  - Ensure focus rings are visibly distinct on all buttons, inputs, and links.
  - Verify modals trap focus and restore focus to trigger button upon close.
  - Verify color contrast ratio $\ge 4.5:1$ for normal text and $\ge 3:1$ for large text/icons.
  - Test responsive viewports: Desktop (1440px), Tablet (768px), and Mobile (375px).

---

## 5. Deployment Smoke Test Checklist (Phase 11)

| Check | Target | Expected Result |
|---|---|---|
| Health Probe | `GET /api/v1/health` | `200 OK`, `{ status: "ok" }` |
| Readiness Probe | `GET /api/v1/ready` | `200 OK`, database connection verified |
| Same-Origin Rewrite | `GET /api/v1/...` via Vercel | Proxied to Render without CORS failure |
| Cookie Flags | `Set-Cookie` on login | `HttpOnly`, `Secure` (prod), `SameSite=Lax` |
| CSRF Guard | `POST` without `X-CSRF-Token` | `403 Forbidden` |
| Email Fallback | Send email without credentials | Graceful error, no fake success |
