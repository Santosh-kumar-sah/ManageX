# Cross-Cutting Test Suites
#
# This directory holds integration, RLS, and end-to-end test suites that span
# multiple backend/frontend domains. Per the testing invariant in docs/testing.md:
#   "No test is reported as passing without actual execution evidence and a 0 exit status."
#
# Suite layout:
#   integration/  — Multi-tenant API integration tests (Phases 3–9)
#   rls/          — PostgreSQL RLS isolation suites under managex_app (Phase 2 & Phase 10)
#   e2e/          — Playwright browser acceptance tests (Phases 7, 8, 10)
#
# Directory structure created as part of Phase 11 deployment readiness.
# Individual test files are added per phase as features are implemented.
