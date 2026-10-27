# End-to-End Test Suites
#
# Playwright browser acceptance tests spanning Phases 7, 8, 10.
# These tests verify complete user journeys from the browser, including
# keyboard navigation (WCAG 2.2 AA), responsive layouts, and auth flows.
#
# Test categories:
#   auth/         — Login, register, verify email, password recovery
#   organisations/— Org switching, member management, module toggles
#   events/       — Event creation, registration, team workflow, judging
#   meetings/     — Meeting scheduling, minutes, action items, export
#   projects/     — Project creation, task kanban, comments
#   platform/     — Platform admin console journeys
#   accessibility/— WCAG 2.2 AA: focus rings, contrast, keyboard navigation
#
# Each test file must exit with code 0 to be reported as passing.
