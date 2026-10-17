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
