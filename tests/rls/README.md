# RLS Test Suites
#
# PostgreSQL Row-Level Security isolation tests running as the managex_app role.
# These tests verify fail-closed tenant isolation: cross-tenant reads/writes must
# be denied, missing transaction context must fail closed, and pooled connections
# must not leak tenant context.
#
# Test categories (per docs/testing.md Suite A–I):
#   context_isolation    — Missing context denies all; cross-tenant fails closed
#   external_participant — Non-member users cannot access org resources
#   capacity_concurrency — Race conditions on event registration capacity
#   final_owner_invariant — Last owner cannot be removed/suspended/demoted
#   meetings_rls         — Meeting notes/action items confidentiality
#   projects_rls         — Task RLS isolation
#   comments_rls         — Task comment/activity RLS
#   platform_rls         — Platform admin least-privilege (no private tenant content)
#   security_fuzzing     — Timing attack, CSRF, injection, exhaustive RLS matrix
#
# Each test file must exit with code 0 to be reported as passing.
