# Integration Test Suites
#
# Multi-tenant API integration tests spanning Phases 3–9.
# These tests run against a real PostgreSQL database as the managex_app role
# and verify the full authorization pipeline (identity → tenant → module → resource).
#
# Test categories:
#   auth/         — Authentication lifecycle (register, login, logout, password reset)
#   organisations/— Organisation CRUD, memberships, invitations, ownership transfer
#   rbac/         — Permission catalogue, role assignment, anti-escalation
#   modules/      — Module entitlement, activation/deactivation
#   events/       — Events, registrations, teams, submissions, judging, results
#   meetings/     — Meetings, attendees, agenda, notes, action items
#   projects/     — Projects, tasks, comments, activity
#   platform/     — Platform admin console (accounts, orgs, modules, audit)
#
# Each test file must exit with code 0 to be reported as passing.
