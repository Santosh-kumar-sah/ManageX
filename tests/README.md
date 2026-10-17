# ManageX Cross-Cutting Test Suites

This directory contains cross-cutting integration, tenant isolation, concurrency, and end-to-end test suites.

## Test Suites
- `integration/` — Multi-tenant API integration tests (Phases 3–9).
- `rls/` — PostgreSQL Row-Level Security isolation suites executed under the unprivileged runtime role `managex_app` (Phase 2 & Phase 10).
- `e2e/` — Playwright browser acceptance tests across user journeys and viewports (Phases 7, 8, 10).

## Testing Invariant
No test is reported as passing without actual execution evidence and a 0 exit status.
