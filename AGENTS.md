# ManageX — Permanent Agent Instructions

## 1. Source of Truth

- `docs/PRD.md` is the authoritative product specification.
- Read the relevant PRD sections before implementing any feature.
- Do not change product scope, technology stack, permissions, business rules, or UI requirements without documenting the issue and obtaining explicit approval for material changes.
- If the PRD conflicts with existing code, inspect the code and document the conflict before changing behavior.
- Never silently weaken a security requirement to make tests pass.

## 2. Fixed Technology Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Router, and TanStack Query where appropriate.
- Backend: Node.js, Express.js, JavaScript ES Modules.
- Backend application files must use `.js`; do not introduce backend `.ts` files or TypeScript compilation.
- Database: PostgreSQL, `pg`/node-postgres, version-controlled SQL migrations, and PostgreSQL Row-Level Security.
- Runtime request validation: Zod.
- Deployment target: Vercel for the frontend, Render for the backend, and Neon for PostgreSQL.
- Architecture: modular monolith with separate frontend and backend application workspaces.

## 3. Product Scope

The initial modules are:
1. Events & Hackathons
2. Meetings
3. Projects & Tasks

Implement shared identity, organisation, membership, module entitlement, permissions, platform administration, and audit functionality as required by the PRD.

Keep the architecture ready for future modules without implementing future module workflows prematurely.

## 4. Architecture and Code Quality

- Keep frontend and backend as separate application workspaces.
- Organise backend code by domain and keep controllers, validation, database queries, and business rules understandable.
- Avoid unnecessary service layers, abstraction layers, microservices, and duplicate utilities.
- Reuse the shared UI system, API client, error conventions, and access-control infrastructure.
- Prefer small, readable functions and explicit naming.
- Do not duplicate authentication, tenant isolation, or permission logic inside individual modules.
- Keep configuration and secrets outside source code.

## 5. Security Invariants

- Enforce Platform, Organisation, and Module permissions as separate scopes.
- Never trust frontend route guards, hidden navigation, submitted organisation IDs, or frontend TypeScript types as authorization.
- Derive the effective user and organisation context from verified server-side identity and membership.
- Enforce organisation isolation in backend queries and PostgreSQL RLS.
- Use transaction-local tenant context and prevent context leakage through pooled database connections.
- Ensure the runtime database role cannot bypass RLS.
- Apply tenant-aware constraints and foreign keys where required.
- Prevent cross-tenant reads, writes, updates, and deletes.
- Validate resource-level access for events, submissions, judges, meetings, attendees, projects, and tasks.
- Log sensitive administrative and security-related actions.
- Never log passwords, authentication tokens, session secrets, or other sensitive credentials.
- Use secure authentication, password hashing, rate limiting, safe cookie settings, and CSRF protection as required by the chosen authentication design.
- Test authorization failures, not just successful requests.

## 6. API and Validation

- Use the API base path `/api/v1`.
- Use consistent resource names, HTTP methods, status codes, pagination, and error response formats.
- Validate incoming data on the backend using Zod.
- Keep API contracts documented and frontend request/response types aligned with backend behavior.
- Apply authentication, membership, module entitlement, permission, resource-scope, and RLS checks independently.
- Never trust client-supplied roles or permissions.

## 7. UI and UX

- Follow the ManageX Clean Enterprise light design.
- Use white surfaces, light neutral backgrounds, restrained indigo accents, readable typography, subtle borders, and consistent spacing.
- Avoid excessive gradients, neon colors, heavy glassmorphism, excessive animations, fake charts, and decorative elements that harm usability.
- Build accessible, responsive shared components.
- Every interactive control must work or be clearly marked unavailable.
- Include loading, success, error, empty, disabled, and permission-denied states where applicable.
- Prevent duplicate form submissions and confirm destructive actions.
- Do not invent testimonials, customers, usage statistics, certifications, or production data.

## 8. Testing and Verification

- Add tests alongside implementation.
- Test business rules, validation, authentication, authorization, RLS, tenant isolation, and critical end-to-end flows.
- Run relevant tests, linting, frontend type checking, and production builds after changes.
- Fix regressions caused by the current work.
- Never claim that a test passed unless the command actually completed successfully.
- Never claim deployment or integration is complete without verifying it.
- If an external service or required secret is unavailable, report the exact limitation and provide a repeatable verification path.

## 9. Autonomous Execution Policy

- Work autonomously within the explicitly requested phase.
- Inspect before editing; preserve working code and unrelated user changes.
- Break work into logical, reviewable changes.
- Do not ask for approval for routine implementation, local tests, or reversible fixes.
- Do not run destructive commands, delete important data, expose credentials, create paid resources, or publish a production release without explicit authorization.
- Do not deploy to production or run destructive database migrations without explicit authorization.
- If a security-critical decision is unresolved, stop and document the options instead of guessing.
- Do not claim that the whole project is complete when only the current phase is complete.

## 10. Required Phase Completion Report

At the end of each phase, report:

1. Requirements implemented.
2. Important files created or changed.
3. Database migrations added, if any.
4. Commands and tests actually executed.
5. Pass/fail results and unresolved failures.
6. Security implications and remaining risks.
7. Acceptance criteria completed and outstanding.
8. Documentation and requirement-traceability updates.
9. Exact next phase and any blocking dependencies.

Update `docs/progress.md`, `docs/implementation-plan.md`, and `docs/requirements-traceability.md` as work progresses.

The project is complete only when the PRD acceptance criteria are implemented, tested, documented, and verified to the extent supported by the available environment.
