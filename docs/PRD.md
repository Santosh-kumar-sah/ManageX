ManageX — Product Requirements Document (Canonical, Prompt-Pack-Aligned)
Document ID: MX-PRD-001
Version: 1.1
Date: 16 October 2026
Status: Canonical implementation baseline for Phase 0 review
Product name: ManageX
Document owner: Product owner
Intended implementation tool: Google Antigravity
Purpose and precedence
This document is the single source of truth for ManageX product scope, behaviour, roles, workflows, acceptance criteria and non-goals. Save this document as docs/PRD.md. The separate Antigravity prompt pack defines execution discipline, phase prompts and reporting. AGENTS.md defines repository-wide coding guardrails. These documents must be consistent: the PRD defines what the product must do; the prompt pack and AGENTS.md define how implementation is staged and controlled. No document may silently override the other. If a genuine conflict is discovered, stop the affected work, record it in docs/decisions/, and resolve it before coding that area.

1. Executive summary
ManageX is a modular, multi-tenant organisation-management SaaS. An organisation can activate the available product modules it needs while sharing one account system, organisation/membership system, permission framework, audit mechanism, API conventions and design system. The initial modules are Events & Hackathons, Meetings, and Projects & Tasks.
ManageX is a modular monolith, not a microservice platform. The initial version uses one PostgreSQL database and schema with strict tenant isolation. Organisation-owned data is scoped to an organisation and protected by backend authorization plus PostgreSQL Row-Level Security (RLS). Platform operations, organisation administration and module permissions are separate scopes.
The MVP prioritises a coherent, secure product over breadth. Features explicitly excluded in this document must not be added just because they are common in other SaaS products.
2. Product goals and success criteria
2.1 Goals
- G-01 — One shared platform: identity, sessions, organisations, memberships, authorization, tenant context, module catalogue, audit, API client and UI primitives are built once and reused.
- G-02 — Tenant isolation: one organisation must not be able to access another organisation's private data by changing a URL, request body, query, identifier, role claim or client state.
- G-03 — Least privilege: permissions are explicit and scoped. Hiding a UI control is never treated as authorization.
- G-04 — Practical modules: users with permission can manage events/hackathons, meetings, projects and tasks through usable end-to-end workflows.
- G-05 — Free-tier-conscious delivery: the initial product can be developed and prepared for deployment using Vercel, Render and Neon without requiring paid infrastructure or AWS.
- G-06 — Verifiable implementation: every requirement is mapped to a phase and test evidence; phase reports state the actual result, not intended or assumed success.
2.2 MVP success criteria
The MVP is accepted only when:
1. A user can create and verify an account, sign in and out, recover access, and maintain a revocable session.
2. A user can create or join more than one organisation and switch between them without seeing stale data from the previous organisation.
3. An organisation has a protected owner, member management and expiring, single-use invitations.
4. Platform, organisation and module access are separately evaluated by the backend using a shared permission system.
5. PostgreSQL RLS protects tenant-owned tables when queries run under a least-privilege runtime database role.
6. The organisation can activate/deactivate the approved modules while platform-level availability is respected.
7. Events & Hackathons supports event lifecycle, registration, teams, URL-based submissions, judge assignment, scoring and controlled result publication.
8. Meetings supports scheduling, attendees, agendas, confidential minutes/notes and action items.
9. Projects & Tasks supports project membership/lifecycle, tasks, assignment, List/Kanban views, filters, comments/activity and due-date visibility.
10. Platform administration is separated from organisation administration, with no unrestricted platform-support access to private tenant content.
11. Cross-tenant, unauthorized-resource, session, permission-revocation and concurrency-sensitive tests pass.
12. Deployment instructions and preflight checks accurately describe Vercel, Render and Neon, including free-tier limitations.
3. Fixed technical and delivery contract
These constraints are locked for MVP and must not be independently changed by an AI coding assistant.
Area	Canonical requirement
Frontend	React + TypeScript + Vite. TypeScript is required in the frontend.
Backend	Node.js + Express.js + JavaScript ES Modules. Backend source files use .js; no backend TypeScript source or backend TypeScript compilation.
Database	PostgreSQL. Neon is the intended hosted PostgreSQL option.
Frontend hosting	Vercel.
Backend hosting	Render.
Architecture	Modular monolith; one application backend and one shared PostgreSQL database/schema for the initial multi-tenant model. No microservices.
API	/api/v1 base path; resource-oriented routes, Zod runtime validation and consistent error responses.
UI	Clean Enterprise, light theme.
Modules	events = Events & Hackathons; meetings = Meetings; projects = Projects & Tasks. Use these exact stable keys.
Authorization	Platform → Organisation → Module, plus resource-specific authorization where relevant.
Tenant security	Backend authorization and PostgreSQL RLS; no client-trusted tenant or role values.
Deployment objective	Free-tier-conscious; no AWS requirement, no paid provider requirement.
Repository folders	frontend/, backend/, database/, tests/, docs/, with root AGENTS.md, README.md, .gitignore and .env.example. Do not replace these with client/ or server/.
Delivery	One approved phase at a time. No next phase until the product owner has reviewed the prior phase report and approved continuation.


3.1 Production request routing and session cookies
For the default Vercel + Render deployment, the browser must call a same-origin frontend path such as /api/v1/.... Configure a Vercel rewrite/proxy to forward /api/* to the Render backend, preserving request paths, relevant headers, status codes, response headers and Set-Cookie headers. In local development, configure the Vite development proxy to forward /api/* to the local Express server. The browser API client must use relative /api/v1 paths by default. Do not rely on third-party cookies between unrelated vercel.app and onrender.com sites as the only production session strategy.
Session cookies must be HttpOnly, Secure in production, SameSite=Lax, Path=/, and must not set a broad Domain attribute unless a reviewed custom-domain deployment ADR requires it. State-changing requests must have CSRF protection, such as a server-validated CSRF token sent in a custom header, in addition to cookie and Origin checks. Exact framework mechanics are implementation details, but the resulting security properties are mandatory. Phase 0 must verify that the hosting rewrite supports this design; if not, document the safest viable alternative and obtain approval before implementation.
3.2 Source-of-truth rules
- This PRD defines product behaviour and scope.
- docs/architecture.md, docs/database.md, docs/security.md and docs/api-contracts.md record implementation decisions derived from this PRD. They cannot expand product scope silently.
- AGENTS.md and the prompt pack enforce stack, safety, repository conventions and phase gates. They cannot turn backend JavaScript into TypeScript or change hosting targets.
- Code and tests are evidence of implementation; they are not authority to redefine a product requirement.
- If an existing repository contains valid working code, inspect it and preserve useful work unless a documented conflict or defect requires a change.
4. Scope
4.1 In scope for MVP
Shared platform: account lifecycle, sessions, organisation creation/switching, memberships and invitations, scoped RBAC, permission catalogue, module catalogue and organisation module activation, tenant context/RLS, audit logs for sensitive actions, common API/error/validation conventions, shared design system, responsive application shell, email delivery abstraction for required emails, platform operations and release documentation.
Events & Hackathons: event creation/management and lifecycle, public/published event details, registration and participant management, capacity controls, teams, URL-only submissions, judge assignments, criteria-based scoring, private/unpublished scores and controlled result publication.
Meetings: meeting scheduling and lifecycle, timezone-aware display, attendees, visibility rules, ordered agenda items, confidential notes/minutes, action items and configured email invitations/updates.
Projects & Tasks: project creation/lifecycle, project membership, tasks and assignment, task statuses/priorities/due dates, List and Kanban views, assigned-to-me/due-soon/overdue filters, comments and activity history within the approved project/task scope.
Platform operations: manage platform accounts and organisation metadata, manage availability of the three approved modules, inspect permitted operational metadata, and manage approved baseline platform configuration. Support access is restricted as defined in Section 8.6.
4.2 Explicitly out of scope
The following are not MVP requirements and must not be implemented without a separately documented product-owner approval and a PRD version change:
- Billing, payments, invoicing, pricing administration, subscription checkout, payment-provider integration or paid plan enforcement.
- A customer support ticketing portal, support inbox, ticket queues, or unrestricted support-agent access to tenant data.
- File uploads or document storage in event submissions; submissions are URLs only.
- Event ticket sales, waitlists, livestreaming, built-in video conferencing, certificates or payment collection.
- Built-in meeting video/audio, transcripts, chat, recording, or real-time collaborative note editing.
- Automatic creation of Projects tasks from meeting action items.
- Jira-like sprint planning, time tracking, Gantt charts, project dependency engines, workload/capacity planning, arbitrary status/workflow builders, or complex automation rules.
- Microservices, Kubernetes, AWS-only architecture, paid monitoring services, or paid vendor requirements.
- User-created custom modules or arbitrary plugin marketplace.
- A native mobile application.
- Unapproved AI features, generative content, analytics dashboards, customer-usage claims, seeded fake customers or fabricated product activity.
- Public multi-tenant data browsing, cross-organisation collaboration or cross-tenant resource sharing.
Phase 0 may record optional future ideas in docs/future-suggestions.md, but must not pull them into implementation scope.
5. User types, identities and terminology
5.1 Terminology
- User account: a ManageX identity that can authenticate. It may be a member of zero, one or multiple organisations.
- Platform operator: an account assigned a platform-scoped role. Platform role does not automatically grant organisation membership or private data access.
- Organisation: a customer workspace and the tenant boundary for organisation-owned data.
- Membership: the relationship between a user and an organisation, with an explicit lifecycle state.
- Module: an independently activatable product area: events, meetings or projects.
- Module entitlement: whether a module is available to an organisation. It is not the same as the current user's permission.
- Role: a named collection of permission assignments at one scope. Authorization is based on assigned permissions and resource policies, not role-name string comparisons alone.
- Resource scope: restrictions to a particular event, meeting, project, task, assignment or other record in addition to module permission.
- External event participant: an authenticated ManageX user participating in a public event without being granted general membership in the organising organisation solely because they registered.
- Audit event: a protected record of a sensitive action and its outcome.
5.2 User personas
1. Unaffiliated account holder: can manage their account, join organisations by invitation, and register for public events where eligible; has no access to an organisation until they have active membership or an explicitly granted event-scoped capability.
2. Organisation Owner: accountable for the workspace; owns membership and core organisation settings and must not be accidentally removed as the final active owner.
3. Organisation Admin: manages allowed workspace operations but cannot bypass platform, tenant or permission boundaries.
4. Organisation Member: has only permissions granted through scoped assignments.
5. Event Manager / Judge / Participant: can act only within the assigned event and permitted operations.
6. Meeting Organiser / Attendee: has access according to meeting visibility, attendance and note/action-item policy.
7. Project Manager / Team Member / Viewer: can act only within a project and assigned capabilities.
8. Platform Super Admin: manages platform-level operational settings and catalogue availability; tenant-private content is not automatically visible merely due to this role.
9. Platform Support Agent: can view limited account and operational metadata for support purposes, but not private event/meeting/project contents by default. The MVP does not include a support-ticketing product.
6. Functional requirements — shared platform
All requirements below are mandatory unless explicitly marked conditional. Every requirement must be mapped to a phase, UI surface, API/data/security implementation and test in docs/requirements-traceability.md during Phase 0.
6.1 Account, authentication and session lifecycle
AUTH-001 — Registration. A visitor can create a ManageX account with name, normalized email and password. Server-side validation is authoritative. Email must be unique under a documented case-normalization policy. Passwords must be hashed using a modern password-hashing algorithm and must never be stored/logged in plaintext.
AUTH-002 — Email verification. New accounts must verify email before receiving access to protected organisation or event-participant actions. Verification tokens must be unpredictable, purpose-bound, time-limited, stored safely (e.g. hashed), single-use and invalidated after success.
AUTH-003 — Login/logout. A verified, active user can log in and log out. Login failures must not disclose whether an email exists. Logout revokes the current session server-side.
AUTH-004 — Password recovery. A user can request a password reset and complete it using a time-limited, single-use token. The request response must not reveal whether an account exists. Resetting a password revokes all existing sessions server-side; the user must authenticate again.
AUTH-005 — Session lifecycle. Sessions must be server-side and revocable, with a 30-minute idle timeout and a 7-day absolute lifetime. Rotate the session after authentication and privilege changes. Session identifiers/tokens must not be stored in localStorage or printed in logs. A disabled/suspended account cannot continue making authenticated requests. Reauthentication is required for ownership transfer and other high-impact operations, and must have occurred within the previous 10 minutes.
AUTH-006 — Rate limiting. Apply appropriate rate limits to login, registration, email-verification resend and password-recovery endpoints. Limits must not make simple account-targeted denial of service easy. Return a consistent safe error response.
AUTH-007 — Cookie and CSRF security. Meet Section 3.1. State-changing cookie-authenticated requests must validate CSRF protections and the request origin policy. No wildcard credentialed CORS.
AUTH-008 — Email provider unavailable. Email sending is routed through one shared provider abstraction. Development can use a documented local-only test mail approach. In production, if provider configuration is absent or delivery fails, the UI/API must not claim the email was sent; return a clear recoverable error and log safe operational details. Do not silently mark verification/reset/invitation/meeting emails as delivered.
Acceptance: verification and recovery tokens expire and cannot be reused; inactive sessions are rejected; invalid authentication does not leak secrets or account existence; logout/password reset revokes sessions as documented; cookie/CSRF tests pass.
6.2 Organisation lifecycle and membership
ORG-001 — Create organisation. A signed-in, verified user can create an organisation with required name and validated slug/identifier. The organisation and initial Owner membership/role assignment must be created in one transaction so neither can exist without the other.
ORG-002 — Multiple memberships. One user may belong to multiple organisations. The active organisation is application context only and is never proof of authorization. Every request must validate requested organisation access server-side.
ORG-003 — Organisation switch. UI shows the active organisation clearly. Switching resets or rekeys organisation-scoped client caches and reloads the new organisation context. Old data must not flash or remain accessible through cached screens after a switch or logout.
ORG-004 — Membership status. Support explicit states at minimum: invited, active, suspended, removed. Only active membership grants ordinary organisation access. The allowed transitions must be documented and tested.
ORG-005 — Invitations. An authorised owner/admin can invite by email and assign only the permitted initial scope/role. Invitations must be unpredictable, expire after 7 days, be revocable and single-use. Accepting an invitation requires authenticated email identity matching the invitation's normalized email. Acceptance must be safe under concurrent requests and retries.
ORG-006 — Existing/new users. Existing accounts can authenticate and accept matching invitations. New invitees must complete registration and email verification before acceptance. An invitation does not authorize access until successfully accepted and a valid active membership exists.
ORG-007 — Membership management. Permitted administrators can list members, change allowed roles, suspend/reactivate members and remove members. Every action is enforced server-side and audited. A user cannot grant themselves additional privileges.
ORG-008 — Owner invariants. An organisation must always have at least one active owner. The final active owner cannot be suspended, removed or demoted unless another active owner is atomically established. Ownership transfer is a high-impact action requiring explicit confirmation and reauthentication or another documented step-up control.
ORG-009 — Organisation settings. Authorised users can update approved organisation profile/settings fields only. No arbitrary settings or custom workflow configuration is added without approval.
ORG-010 — Leave organisation. A member may leave where policy permits, but the last-owner invariant must be preserved. UI must explain when an action cannot be completed.
Acceptance: concurrent invitation acceptance cannot duplicate membership; expired/revoked/replayed/wrong-email invitations fail; the final owner cannot be removed; switching organisations yields no cross-tenant cache leakage; membership revocation takes effect on the next protected request.
6.3 Role-based access control (RBAC), permissions and resource scope
RBAC-001 — Scope separation. Authorization scopes are platform, organisation, module, and resource where applicable. A platform role is not an organisation role. An organisation role is not automatically a module role. A module role does not bypass event/meeting/project resource restrictions.
RBAC-002 — Central permission catalogue. Permissions use stable machine-readable keys, descriptions and scope definitions. Permission keys are assigned to roles through persisted relationships. Use shared authorization helpers; do not scatter role-name conditionals throughout handlers.
RBAC-003 — Default roles. Seed only documented baseline roles and permission assignments:
- Platform: Platform Super Admin, Platform Support Agent.
- Organisation: Owner, Admin, Member.
- Events module: Event Admin, Event Manager, Judge, Participant, Viewer.
- Meetings module: Meeting Admin, Organiser, Participant, Viewer.
- Projects module: Project Admin, Project Manager, Team Member, Viewer.
  These labels are defaults, not security logic. Exact permissions must be enumerated in docs/security.md and docs/api-contracts.md during Phase 0. The AI must not give every default role full access merely to make a UI work.
RBAC-004 — Permission checks. Every protected backend operation checks identity, organisation context, active membership (where required), module entitlement, permission and resource/assignment/participation policy. Client-side route guards and hidden controls are usability only.
RBAC-005 — Delegation. Users may only grant permissions/roles they are allowed to delegate. No user can create platform roles, alter the protected system permission catalogue or elevate themselves through request payloads.
RBAC-006 — Immediate revocation. Role, membership, account or module-entitlement revocation must affect subsequent requests without relying on a long-lived, stale client role claim.
RBAC-007 — Testability. Permission tests must cover allowed and denied cases at both API and database levels, including direct identifier tampering and resource IDs belonging to another tenant.
6.4 Module catalogue and activation
MOD-001 — Stable catalogue. The MVP catalogue contains exactly events, meetings and projects, with human-readable names, descriptions, platform availability and documented metadata. Event registration opens at first publication when no opening time is configured and closes at event start when no closing time is configured. Team mode requires configured min/max size as defined in EVT-006.
MOD-002 — Organisation activation. An organisation can activate a module only if that module is platform-available. Only authorised organisation administrators can change activation. Deactivation blocks ordinary module requests and hides module navigation but does not delete or mutate historical module data.
MOD-003 — Independent checks. Module platform availability, organisation activation, current user's permissions and resource scope are separate checks. Passing one does not imply the others.
MOD-004 — Disabled module behaviour. Requests to a disabled module return a consistent forbidden/unavailable response. Data cannot be read or modified through guessed API URLs, legacy UI routes or direct calls.
MOD-005 — No billing dependency. Module activation in MVP is not a payment or paid subscription workflow. No subscription provider, billing plan, pricing tier or checkout UI is required. Do not invent an internal plan/limits system unless separately approved.
Acceptance: module activation/deactivation is audited, server-enforced, and does not delete data; unavailable modules cannot be accessed by direct API calls.
6.5 Audit logs
AUD-001 — Shared audit infrastructure. Use one append-oriented audit mechanism for sensitive platform, organisation, membership, role/permission, module activation, event, meeting, project, participant and other high-impact actions.
AUD-002 — Fields. Store actor identity when known, scope/organisation, action key, resource type and ID, outcome, timestamp, request/correlation ID and safe metadata. Capture before/after differences only for non-sensitive fields where useful and permitted.
AUD-003 — Sensitive data exclusion. Never log passwords, raw session identifiers/cookies, access/reset/invitation tokens, secrets, full payment-like credentials or confidential meeting note contents. Avoid copying entire request bodies into audit metadata.
AUD-004 — Read and integrity controls. Normal product users cannot edit/delete audit events. Access to viewing audit data is permission-controlled. Retention policy and any database immutability guarantees must be documented; do not claim tamper-proof storage unless technically implemented.
AUD-005 — Outcomes. Record success and security-relevant denial/failure events where appropriate without creating unbounded noisy logs or leaking data.
6.6 Shared API conventions
API-001 — Base path. All product endpoints use /api/v1.
API-002 — Validation. Validate path parameters, query parameters, request bodies and relevant headers with Zod at the backend boundary. Frontend validation improves usability but is not authoritative.
API-003 — Response format. Use a consistent JSON success/error structure. Document the exact schemas in docs/api-contracts.md; do not mix response envelopes between modules. Do not return stack traces or SQL details in production.
API-004 — Pagination. Collections use server-side pagination with a default page size of 20 and maximum page size of 100 unless a documented endpoint-specific reason requires otherwise. Search, sort and filter fields are allowlisted, bounded and validated.
API-005 — HTTP semantics. Use appropriate status codes for validation, unauthenticated, forbidden, not found, conflict, rate limit and server error. Do not report successful writes before database commit/provider acceptance.
API-006 — Database access. Use parameterized SQL (or a reviewed library that guarantees parameterization), explicit transactions for multi-step security-sensitive changes and predictable error mapping. Do not build SQL from untrusted string fragments.
API-007 — Request tracing. Include a request/correlation ID in structured server logs and suitable error responses. Redact secrets.
API-008 — API inventory. Every protected endpoint is documented with authentication requirement, scope, permissions, entitlement requirement, resource constraints, expected errors and tests.
6.7 Shared UI, data layer and accessibility
UI-001 — Design direction. Use a Clean Enterprise light UI: white/light neutral surfaces, restrained blue/indigo accents, readable typography, subtle borders, moderate corner radii, restrained shadows and minimal animation. Avoid excessive gradients, glassmorphism, noisy backgrounds or ornamental motion.
UI-002 — Shared design system. Establish central design tokens and reusable components for buttons, form fields, selects/comboboxes, checkboxes/switches, date/time inputs, tables, cards, badges, menus, tabs, breadcrumbs, dialogs, tooltips, pagination, search/filter bars, avatars, toasts/alerts, skeletons, empty states, loading states, error states, forbidden states and not-found states. Reuse shared components in all modules.
UI-003 — Shared shell. Provide a responsive organisation workspace shell with organisation switcher, active-organisation indicator, profile/account controls, permission-aware navigation, breadcrumbs and consistent page headers. Platform administration uses a separate shell and route namespace.
UI-004 — Frontend API client. One shared API client handles base path, credentials, JSON parsing, typed contracts, request IDs where applicable, normalized errors and session expiry. Modules must not create independent fetch wrappers or incompatible error handling.
UI-005 — Cache isolation. Organisation-specific cache keys must include organisation ID. On organisation switch/logout, segregate, invalidate or clear protected cached data. Do not expose prior-org data in the new-org UI.
UI-006 — Form behaviour. Disable duplicate submissions, show server-confirmed success only, preserve safe user input when recoverable, surface field errors clearly and confirm destructive/high-impact actions.
UI-007 — Accessibility. Target WCAG 2.2 AA. Support keyboard interaction, visible focus, semantic headings, labelled controls, accessible dialog focus management, reasonable contrast, error association and status indicators not based on colour alone.
UI-008 — Responsive states. Main flows must work on desktop, tablet and mobile widths. Tables may switch to a suitable compact/card presentation on narrow viewports without losing actions or labels.
UI-009 — Real data only. Do not fabricate testimonials, customers, events, usage metrics, recent activity, email-send confirmations or dashboard statistics. Development seed data must be clearly identified and isolated to development/test environments.
6.8 Operational foundation
OPS-001 — Health and readiness. Provide a minimal health endpoint and a readiness check that reports whether the application can serve requests without disclosing credentials, internal stack traces or sensitive infrastructure data.
OPS-002 — Configuration. Validate required environment variables on startup and display names of missing variables only. Commit .env.example with names and safe placeholder values; never commit actual secrets.
OPS-003 — Migrations. Database changes are versioned migrations with documented order, rollback/forward-fix strategy and environment safety. Production migrations must not run automatically without the deployment/release process defined in Section 14.
OPS-004 — Logs. Use structured logs with secret redaction and request correlation. No raw passwords, cookies, tokens, database URLs or confidential record contents.
OPS-005 — Seeds. Seed data is explicit and limited to local/test environments. Never seed default production credentials or a fake customer dataset.
OPS-006 — Recovery documentation. Document backup/restore assumptions and procedures appropriate to Neon and the selected plan. Do not claim backups were tested unless a restore test was executed and evidence recorded.
7. Functional requirements — Events & Hackathons (events)
7.1 Event model, visibility and lifecycle
EVT-001 — Event model and create/edit. An authorised event manager can create and edit an event with title, description, type (general_event or hackathon; display labels: General Event or Hackathon), start/end date-time, IANA time-zone identifier, venue/location or online URL where applicable, registration opening/closing instants, optional maximum participant count, responsible/organising users, participant instructions, team/submission/judging configuration where applicable, visibility and publication information. Validate required fields, lengths, date ordering, URL scheme/format and time-zone identifier server-side.
EVT-002 — Canonical event lifecycle. The exact status labels are Draft, Published, Registration Closed, In Progress, Completed, Cancelled, and Archived; use corresponding stable machine values draft, published, registration_closed, in_progress, completed, cancelled, and archived. Implement a server-side transition map. Default allowed transitions are: draft → published or archived; published → registration_closed, in_progress, cancelled, or archived; registration_closed → in_progress, cancelled, or archived; in_progress → completed, cancelled, or archived; completed → archived; cancelled → archived; archived is terminal. Any exception requires a documented product decision before implementation. Registration windows are also enforced by exact timestamps: passing the registration closing instant rejects new registrations even if a manager has not yet changed the displayed event status. Do not silently change persisted status during page rendering.
EVT-003 — Time, visibility and public data. Persist timestamps as UTC instants and retain the event's IANA time-zone identifier. Only Published events configured as public may appear in public event listings. Public responses include only explicitly approved public fields. Draft/private/internal notes, judge feedback, unpublished scores and private participant data must never be serialized to unauthorised users. A published event does not imply registration is open.
7.2 Registration and external participants
EVT-004 — Registration workflow and participant scope. Support eligible authenticated organisation users and external event participants for public events. A registrant must have a verified ManageX account, but registering does not create membership in the organising organisation. Provide a registration form, server-confirmed success state, own-registration status view and authorised event-staff participant table. External participants may access only their own registration and the event-scoped actions expressly permitted to them; they cannot enumerate organisation members, access unrelated organisation modules or view another participant's private data.
EVT-005 — Registration validation, capacity and uniqueness. Registration is allowed only when the persisted event status is published, the current instant is within the effective registration window, and the participant meets any configured eligibility rules. Statuses registration_closed, in_progress, completed, cancelled, and archived categorically reject new registrations. If registration_opens_at is unset, its effective value is the first publication instant. If registration_closes_at is unset, its effective value is the event start instant. The effective closing instant must be after the opening instant and may not be later than the event start. Show the effective window in the UI and use the same server-side rule in every endpoint. Support registration statuses registered and withdrawn. Active capacity counts registered registrations only. A participant may withdraw while the registration window permits it; withdrawn records are retained for history. If the same participant registers again before the window closes, reactivate the existing registration row instead of creating a duplicate; preserve the original registration timestamp and record the reactivation timestamp. Prevent duplicate registration with database uniqueness constraints and service-level checks. Enforce capacity transactionally under concurrency so simultaneous requests cannot exceed the maximum. No waitlist or payment is included. Public endpoints are rate-limited and must not enumerate registrants. Staff can search/filter/paginate registrations only within their permitted event scope; administrative changes are audited.
7.3 Teams and URL-based submissions
EVT-006 — Hackathon teams. Teams are available only for hackathon events where team participation is enabled. Eligible registered participants can create/join teams according to event rules. Store team/event relationships, an explicit team owner, member relationships and timestamps. When team mode is enabled, require event-level team_size_min and team_size_max values; default the minimum to 1, require maximum to be at least the minimum, and cap configured maximum at 100 to protect the service. Enforce uniqueness, event eligibility and restrictions on joining multiple teams. Team owners send invitations that require invitee acceptance; invitations expire after 7 days and are single-use. An event manager may add/remove a participant directly only with explicit event participant-management permission. All team membership changes are validated server-side and sensitive administrative changes are audited. Team owner/manager operations require the relevant permission and resource scope. Invitation/addition/leave/removal operations must not bypass eligibility rules through direct API calls. Use constraints and transactions to prevent concurrent team-size and duplicate-membership violations.
EVT-007 — URL-based submissions. Support submission records with title, description, repository URL and demo URL where applicable, plus only necessary safe metadata and timestamps. Submissions are allowed only during the configured submission window and only by an eligible individual participant/team for that event. Validate http/https URLs and reasonable lengths. Do not fetch arbitrary user-provided URLs from the backend. Define whether an eligible team has one active submission or supports revisions in docs/database.md; default to one current submission per eligible individual/team with edits permitted during the allowed window, unless an event setting explicitly approved in Phase 0 requires otherwise. Submitters can update only their own eligible submission and only while editing is permitted. Admin overrides require explicit permission and audit. No file uploads or attachments.
7.4 Judging, scoring and results
EVT-008 — Judge assignments and scoring. Authorised event managers can assign eligible judges to permitted events/submissions. Judges can list/view only their assigned work and the fields needed to score it. Scoring criteria have name, description/order and maximum score. Judges can submit one score per assigned judge/submission/criterion combination within the allowed numeric range, with an optional comment if enabled. Prevent duplicate/conflicting records with constraints. Score edits are allowed only under the documented judging state. Criteria changes after scoring starts must be blocked or follow a documented audited reset/re-score process. Unpublished scores and private judge feedback are not visible to participants or unrelated judges.
EVT-009 — Result calculation and publication. Only an authorised event manager can review and publish final results. Use the straight sum of criterion scores; score weights are not part of MVP. Each criterion has a maximum score greater than 0 and no greater than 100. A result is publishable only when all required criteria have a score from every judge assigned to that submission under the event's approved judging configuration. Tied totals share a rank; do not invent a hidden tie-break. Before publication, participants cannot view unpublished score totals, rankings or internal judge feedback. After publication, show only fields designated participant-visible/public. Publish/unpublish actions are audited. Event cancellation/archive must not expose unpublished scores accidentally.
7.5 Events acceptance criteria
- Event CRUD, public/private visibility, date/time validation and all seven lifecycle statuses are enforced by API and UI.
- Published event pages never expose drafts or private fields.
- Registration open/close boundaries, eligibility, duplicate requests, withdrawal, capacity and concurrent last-slot attempts behave correctly.
- External participants cannot access organisation members or other modules without separate membership and permission.
- Team membership enforces event scope, eligibility, configured size limits and concurrency invariants.
- Submissions include only approved URL/text fields, enforce ownership/deadlines and cannot upload files.
- Judges can access only assigned work; scores remain private until publication.
- Unauthorised users cannot publish results; module deactivation or permission revocation blocks operations without deleting historical data.
8. Functional requirements — Meetings (meetings)
8.1 Scheduling, attendees, agenda and lifecycle
MTG-001 — Meeting model and create/edit. An authorised organiser can create/edit a meeting with title, description/objective, start/end instants, IANA time-zone identifier, location or external meeting URL where applicable, organiser, attendees, visibility, ordered agenda and timestamps. Validate all fields server-side. No built-in video conferencing or real-time collaborative editing is provided.
MTG-002 — Canonical meeting lifecycle. Use exactly these status labels: Scheduled, In Progress, Completed, and Cancelled, stored as scheduled, in_progress, completed, and cancelled. Default allowed transitions are scheduled → in_progress, completed, or cancelled; in_progress → completed or cancelled; completed and cancelled are terminal for ordinary users. Any reopening/other exception requires a documented, approved decision. Do not introduce an archived meeting status or silently change status during page rendering. Validate end after start and retain UTC instants plus the IANA zone for display.
MTG-003 — Attendees and visibility. Attendees are unique per meeting. Internal attendees must be active members of the same organisation. External attendee email addresses may be recorded for invitation purposes but do not create organisation membership or an external meeting portal. Support visibility values organisation and attendees_only; organisation visibility does not automatically grant every action permission, and attendees_only restricts meeting details to the organiser and authorised attendees/admins. Attendee lists and participation details are exposed only to authorised users. Removing/revoking attendance blocks access on subsequent requests. Meeting visibility is enforced on the backend and through data access policy, not only with a UI checkbox.
MTG-004 — Ordered agenda and list/calendar. Organisers/authorised users can add, edit, reorder and remove agenda items. Each item supports title, optional description and optional time allocation; sequence is persisted and safely updated. Provide upcoming and past meeting lists with server-side pagination and filters by date range, status and organiser; attendee filters may be used only when permitted. A calendar-style presentation is required where practical; it must use the same permission-enforced data and should not introduce a heavy/inaccessible dependency without review. At minimum, date-filtered lists are mandatory.
8.2 Notes/minutes and action items
MTG-005 — Confidential notes/minutes. Notes/minutes have an author and timestamps and a separate access rule from meeting detail/attendance. By default only the organiser and users granted the relevant meeting.notes.read or meeting.notes.manage permission in the appropriate scope can read or edit private notes. Attendee status alone does not grant access. Check permission before querying/serializing note content. Do not put note bodies in audit metadata. If an explicit share-with-attendees feature is needed, document its exact permissions and audit effects before implementation; it is not the default.
MTG-006 — Action items. Authorised users can create action items linked to a meeting with title, description, eligible assigned user, due date, priority, status, timestamps and optional source agenda item. Assignees must be eligible active organisation members. Validate that a source agenda item belongs to the same meeting and organisation. Canonical statuses are open, in_progress, done, and cancelled. Allowed transitions are open → in_progress, done, or cancelled; in_progress → open, done, or cancelled; done and cancelled are terminal for ordinary users. Enforce transitions and permission checks server-side. Define resource-specific visibility for organisers, authorised attendees and assignees; an action item must not reveal confidential notes. Action items remain meeting records and must not automatically create or change Projects & Tasks tasks.
8.3 Email and notifications
MTG-007 — Invitations, updates and cancellations. Where provider configuration is present and the email behaviour is enabled, send meeting invitations, updates and cancellations through the shared email abstraction. Do not add a separate email provider, mandatory queue or notification centre. If provider configuration is absent or a send request fails, do not claim the email was sent. The app may record a provider-accepted request only when the provider actually accepts it; acceptance is not proof of final inbox delivery. Record safe operational failures without logging confidential notes or raw attendee tokens.
8.4 Meetings acceptance criteria
- Meeting statuses exactly match the four canonical values; invalid transitions fail.
- Scheduling, timezone, attendee eligibility, duplicate attendees and visibility are enforced consistently.
- An attendee cannot read confidential minutes merely because they are invited.
- External attendee records do not grant organisation membership or an external meeting portal.
- Action items enforce eligible assignment, due date/priority/status and same-meeting references; no automatic project integration occurs.
- Disabled module, revoked membership or permission changes block relevant requests.
- Email success/failure UI reflects the actual configured provider outcome.
9. Functional requirements — Projects & Tasks (projects)
9.1 Projects and project membership
PRJ-001 — Project model, create/edit and membership. An authorised project manager can create/edit a project with name, description, owner/manager, start date, target completion date, status, priority, members and optional labels. Project owners and members must be eligible active users in the same organisation. Membership is resource-scoped: organisation membership alone does not automatically allow access to every project. Only permitted managers/admins can change project membership. The current responsible owner/manager cannot be removed without an eligible replacement being assigned atomically or the operation being rejected.
PRJ-002 — Project lifecycle and priority. Use exactly these status labels: Planning, Active, On Hold, Completed, and Archived, stored as planning, active, on_hold, completed, and archived. Implement a server-side transition map. Default transitions are planning → active or archived; active → on_hold, completed, or archived; on_hold → active, completed, or archived; completed → archived; archived is terminal for ordinary users. Reopening an archived project requires explicit manager permission and audit only if the product owner approves it. Project and task priority values are exactly low, medium, high, and urgent. Archived projects are read-only to ordinary users; records/history are preserved.
9.2 Tasks and workflow
PRJ-003 — Task model and canonical status values. Tasks support title, description, parent project, creator, assignee, status, priority, optional start date, due date, optional approved labels, and creation/update timestamps. Use exactly these status labels: Backlog, To Do, In Progress, Blocked, and Done, stored as backlog, todo, in_progress, blocked, and done. Do not add a Cancelled task status. Deletion, where allowed, is a separately authorised soft-delete operation and does not invent a new status. A task must reference a project in the same organisation; label relationships cannot cross organisations.
PRJ-004 — Assignment eligibility and membership changes. A task assignee must be an active organisation member and an eligible member of the same project. Validate eligibility when assigning/reassigning and when project membership or organisation membership changes. If a user has active task assignments, block removal from the project or suspension/removal of their organisation membership until the tasks have been reassigned or marked otherwise by an authorised project manager. Account-level security suspension may take effect immediately, but it must preserve task history and create an actionable reassignment state. Do not silently orphan assignments. Client-submitted user IDs are never authoritative.
PRJ-005 — Task operations and status transitions. Permitted users can create, view, update, assign/reassign and soft-delete tasks according to permission and project lifecycle. Default status transitions are backlog → todo; todo → backlog or in_progress; in_progress → blocked or done; blocked → in_progress; and done → in_progress only for a user with explicit reopen permission. Invalid transitions fail at the backend. Task deletion is soft deletion: remove the task from normal lists, retain audit/history according to retention policy, and do not physically cascade-delete comments/history. Restoration is not in MVP unless separately approved. List and Kanban views use the same data model. Kanban status changes are server-confirmed, show pending/error state, and revert/reconcile when rejected; keyboard-accessible status change is available as an alternative to drag/drop.
PRJ-006 — Filters, lists, Kanban and due-date views. Provide server-side filtering by status, assignee, priority, due date, project and approved labels where relevant, with pagination and deterministic sorting. Provide Assigned to me, Due soon, and Overdue views. Define due soon as due within the next 7 days; overdue means due instant is before current server time and status is not done. Use consistent server-side UTC/timezone semantics. Do not fetch all tasks and filter locally, and do not automatically change task status because its due date passed. Provide both List and Kanban views over the same records.
9.3 Comments and activity
PRJ-007 — Comments. Authorised project members can add simple text comments to a project/task where granted the relevant permission. Comments inherit parent task/project and tenant/resource permissions. Safely render text; do not allow raw HTML. No file attachments, mentions, direct messages or rich-text collaboration. Authors may edit their own comments while the parent project is not archived. Authors may soft-delete their own comments; deleting another user’s comment requires an explicit project.comment.moderate permission. Comment deletion preserves an audit/history marker and does not physically erase the record. Audit metadata must not copy the comment body. Do not expose comments through guessed IDs or cross-tenant references.
PRJ-008 — Activity history and archive behaviour. Show a concise activity timeline for material project/task events such as creation, status change, assignment and comment addition. This is separate from compliance audit logs and must not expose secrets or private audit payloads. Archiving a project preserves task/history data and prevents ordinary writes. Any approved restore/unarchive action must be permission-controlled and audited. Disabling the projects module never deletes project data.
9.4 Projects & Tasks acceptance criteria
- Project statuses exactly match Planning, Active, On Hold, Completed and Archived.
- Task statuses exactly match Backlog, To Do, In Progress, Blocked and Done; backend transition enforcement matches this PRD.
- Cross-tenant references and access through guessed project/task/label/comment IDs fail.
- Only eligible project members can be assigned to tasks, and membership changes cannot silently orphan assignments.
- List/Kanban/assigned-to-me/due-soon/overdue share consistent backend filtering and permissions.
- Archived projects are read-only to ordinary users and history is retained.
- Comments/activity use safe rendering, are appropriately scoped and are not treated as a substitute for audit logs.
10. Platform administration and support boundary
PLAT-001 — Separate console. Platform pages use the /platform namespace and a distinct layout/navigation from organisation workspaces. Platform operators must not accidentally operate as organisation owners/admins.
PLAT-002 — Account operations. Platform Super Admin may inspect/manage account status and permitted global account metadata, with audited high-impact changes. No password display, token display, impersonation or silent login-as-user feature.
PLAT-003 — Organisation metadata. Platform Super Admin may view permitted organisation metadata and manage approved operational flags. This does not grant blanket access to private events, meeting minutes, projects, comments or participant data.
PLAT-004 — Module catalogue. Super Admin can enable/disable platform availability of the three fixed modules. Catalogue changes are validated, audited and enforced by the backend. Arbitrary module creation is not supported.
PLAT-005 — Support Agent. Support Agent may see limited account/organisation status and operational metadata needed for basic assistance. Support Agent cannot read private event submissions, participant personal details beyond specifically permitted minimum metadata, private meeting notes, project comments or arbitrary tenant records. Any request for elevated, time-limited access is out of scope until explicitly designed and approved.
PLAT-006 — No ticketing product. The MVP has no support ticket portal, inbox, ticket queues, customer-facing case management, or support workflow engine. The Support Agent role exists only for the limited operations defined above.
PLAT-007 — Operational safety. Platform actions that disable accounts/modules or change roles require confirmation and audit records. A module disable blocks requests without deleting organisation data.
11. Data architecture and integrity requirements
This section defines logical expectations, not a demand to create every table in one migration. Exact physical schema, column types, foreign keys, indexes and migration ordering must be designed in Phase 0 and documented in docs/database.md before Phase 2.
11.1 Core logical entities
At minimum, evaluate and model the following entities with stable IDs and timestamps where appropriate:
- Identity/session: users, sessions, email verification tokens, password reset tokens.
- Organisation: organisations, organisation memberships, invitations.
- Authorization: permission catalogue, scoped roles, role-permission assignments, user/membership role assignments, resource-scoped assignments where required.
- Module entitlements: module catalogue, platform availability state, organisation module activation.
- Audit: audit events.
- Events: events, event registrations/participants, teams, team membership, submissions, scoring criteria, judge assignments, scores/results.
- Meetings: meetings, meeting attendees, agenda items, minutes/notes, action items.
- Projects: projects, project membership, tasks, labels if approved, comments and activity records.
- Delivery/operations: email delivery metadata only where useful and supported; do not store secrets or raw sensitive token values.
Do not add billing, payment, support-ticket, file-upload, arbitrary workflow, or unrelated business entities.
11.2 Tenant ownership and constraints
- Organisation-owned rows must have an explicit tenant boundary, normally organisation_id, or be reachable only through a rigorously enforced parent chain with tenant-aware constraints documented.
- Add tenant-aware foreign keys/constraints so a child row in Organisation A cannot reference a parent/resource in Organisation B. Examples include membership-to-organisation, project-to-organisation, task-to-project, event-to-organisation, team/submission-to-event and attendee/action item-to-meeting.
- Use uniqueness constraints for normalized user email, organisation slug, membership pair, invitation token digest, event registration uniqueness, team membership and other domain invariants.
- Index real query patterns: organisation_id, foreign keys, status, created/updated dates, due dates, event/meeting start instants and common list filters. Avoid indexes without a justified query pattern.
- Store secrets/tokens as digests where feasible; return raw high-entropy tokens only where a one-time user flow requires it.
- Avoid cascading deletes that erase audit/history or silently remove dependent user data. Prefer explicit archive/retention behaviour; every cascade must be justified in docs/database.md.
11.3 RLS and database roles
- Create separate migration/admin and runtime database roles. The runtime role must not be superuser, must not own protected tables in a way that bypasses RLS, and must not have BYPASSRLS.
- Enable RLS on every tenant-owned table and use FORCE ROW LEVEL SECURITY where needed to enforce policies for table owners subject to PostgreSQL semantics.
- Fail closed when transaction-local context is absent or malformed. Do not default missing tenant context to unrestricted access.
- Set authenticated actor and active organisation context using transaction-local settings on the same database connection and transaction used for the protected queries. Clear automatically at transaction end; test pooled-connection reuse and rollback paths.
- Policies must account for SELECT, INSERT, UPDATE and DELETE with appropriate USING and WITH CHECK logic. Backend permissions and RLS are complementary, not substitutes.
- Use a dedicated, narrowly scoped access path and explicit policies for public event data and event-scoped external participant access. Never disable RLS globally or use a privileged connection to make public endpoints work.
- Platform operations that need cross-tenant metadata must use narrowly scoped policy/queries and be audited. The support role does not bypass RLS to access private content.
- Integration tests must use the same least-privilege runtime role intended for the app, not a superuser/table-owner connection.
11.4 Transaction and concurrency rules
Use database transactions for operations that span related invariants, including organisation plus owner creation, invitation acceptance, owner transfer, role/entitlement change, capacity-constrained registration, team membership limits and score/result publication where required. Add appropriate unique constraints, locking or atomic updates so concurrent requests cannot bypass invariants. Do not depend on frontend disabled buttons to prevent duplicates.
12. Security requirements and threat boundaries
SEC-001 — Server-trusted identity only. Never trust userId, role, membership, organisation entitlement or permission supplied by the client as authoritative. Derive identity from the server-validated session and resolve active membership/permissions from trusted data.
SEC-002 — Authorization evaluation order. For an organisation request, validate in this order (with safe implementation-specific adjustments documented): authenticated identity → requested organisation context → active membership (unless an explicitly designed public/event-scoped path applies) → platform/module availability → organisation module entitlement → action permission → resource/assignment/participant scope → transaction-local tenant context/RLS → audit where required.
SEC-003 — Tenant isolation. Test with at least two organisations and multiple users, including a user belonging to both organisations. Test tampered path IDs, query filters, request bodies, foreign keys, caches, direct API calls, pooled connection reuse, failed transaction rollback and missing tenant context.
SEC-004 — Least privilege. Deny by default. Missing permission, missing membership, disabled module, invalid session, missing tenant context and unrecognised status must fail closed.
SEC-005 — Input/output safety. Validate user-controlled data, escape/render comments and descriptions safely, prevent SQL injection, prevent unsafe redirect/open-redirect patterns, restrict URL schemes to http/https where URLs are permitted and avoid returning unnecessary personal data.
SEC-006 — Abuse controls. Rate-limit sensitive public/auth endpoints, protect invitation and verification workflows from replay, prevent event registration overbooking, and avoid account enumeration.
SEC-007 — Secret management. Keep secrets out of source control, prompts, logs, screenshots and error payloads. Do not print environment-variable values to make debugging easier.
SEC-008 — Audit controls. Audit sensitive changes and permission decisions as specified in Section 6.5 without storing confidential record contents.
SEC-009 — Platform boundary. Super Admin and Support Agent must not be implemented as blanket RLS bypass roles for tenant business data. Any new exceptional access pathway requires explicit product/security approval, purpose limitation, audit design and tests.
SEC-010 — Security evidence. Security-sensitive acceptance requires reproducible test evidence. A green unit test suite alone is not proof of RLS or tenant isolation. Use database integration tests under the least-privilege runtime role.
13. Non-functional requirements
13.1 Reliability and data integrity
- Multi-step writes must be atomic where consistency requires it.
- Database constraints enforce invariants as a second line of defence behind backend validation.
- Failures must return safe, actionable errors and must not leave partially created organisation, invitation acceptance, registration or role state.
- UI handles loading, empty, success, validation error, general error, forbidden and not-found states where relevant.
13.2 Performance
- All potentially large collections are paginated server-side; do not load entire organisation datasets into the browser.
- Search/filter/sort parameters are bounded and backed by appropriate indexes where query patterns justify them.
- Avoid N+1 queries for list pages and avoid exposing full confidential records in list endpoints.
- With a warm backend and representative test fixtures of approximately 1,000 rows per principal list, common list/detail API operations should be designed to respond within 2 seconds under light development/test load. This is an engineering target, not a production SLA, and must be measured rather than claimed without evidence. Free-tier cold starts are reported separately.
13.3 Accessibility and responsive design
Target WCAG 2.2 AA. All major flows should be keyboard-accessible, labels and errors must be associated with controls, focus must remain managed in dialogs, and status must not be communicated only through colour. The product must be usable at common mobile/tablet/desktop widths without hiding essential functionality.
13.4 Maintainability
- Keep the backend JavaScript ES Module codebase readable and domain-separated without introducing unnecessary service layers or abstractions.
- Keep shared platform logic in one shared location; module domain rules remain in their module.
- Keep TypeScript strictness and typed API contracts on the frontend.
- Avoid code generation, libraries or infrastructure that do not provide a real MVP benefit.
- Document non-obvious security decisions and migration risks.
14. Deployment, environments and release requirements
14.1 Target topology
- Frontend: Vercel, React + TypeScript + Vite build.
- Backend: Render, Node.js + Express.js JavaScript ES Modules.
- Database: Neon PostgreSQL.
- Browser API path: same-origin /api/* proxy/rewrite from Vercel to Render, subject to a Phase 0 validation of forwarding and cookie behaviour.
- Local development: Vite dev server proxies /api/* to local Express; local environment variables are untracked.
Do not make AWS, a paid custom domain, paid email provider, managed queue or paid monitoring service a launch prerequisite.
14.2 Environments
Document local development, automated test, and production environments separately. Use distinct credentials and database instances/branches where available. Production data must not be copied into local/test environments without an approved sanitization process. Production startup must fail safely when mandatory secrets/configuration are missing.
14.3 Migration/release safety
- Run migrations explicitly as part of a controlled release process with a verified target environment.
- Before production migration, check database target, backup/recovery posture and migration reversibility/forward-fix plan.
- Do not delete production data or run destructive migrations without explicit owner approval.
- Verify health/readiness, auth, organisation isolation, core module smoke tests and logs after deployment.
- Mark every release-check item verified, failed, not run or requires owner action; include evidence.
14.4 Free-tier disclosure
Document the actual current service limits at deployment time, including possible Render sleep/cold starts, database/storage limits and email-provider restrictions. Do not promise uninterrupted uptime, a latency SLA or automatic scaling based solely on free-tier hosting. Re-verify provider policies during Phase 11 because vendor limits may change.
15. Error handling and user-facing behaviour
- Use common error codes and field-validation error shape documented in docs/api-contracts.md.
- 401 means authentication is missing/invalid; 403 means the request is authenticated but disallowed; 404 may be used to avoid leaking whether a protected resource exists, according to the documented policy; 409 represents conflicts such as duplicate registration, stale update or invalid state transition; 422 may be used consistently for semantic validation if that convention is chosen.
- Do not reveal whether a private resource exists if doing so would leak cross-tenant information.
- Display a specific, helpful message for known expected failures (registration closed/full, invitation expired, permission denied, module disabled, stale session) without exposing SQL, secrets or stack traces.
- A UI success message must only appear after the server confirms a successful operation and, for email, after the provider accepts the delivery request where the wording implies delivery.
- Destructive/high-impact operations require confirmation and clear consequences.
16. Navigation and route inventory
Route details may evolve within the fixed architecture, but product areas must remain distinct and protected appropriately.
Public routes
- / — product landing page with accurate descriptions only.
- /modules — overview of Events & Hackathons, Meetings, Projects & Tasks.
- /security — factual security/tenancy summary; do not claim controls that are not implemented.
- /auth/register, /auth/login, /auth/verify-email, /auth/forgot-password, /auth/reset-password.
- Published public event detail/registration routes using a documented stable route pattern; drafts and private event paths remain protected.
Authenticated workspace routes
- /app — organisation/workspace chooser and user's allowed overview; no fabricated metrics.
- /app/organisations — list/create/switch organisations.
- /app/organisations/:organisationId/settings — permitted organisation settings.
- /app/organisations/:organisationId/members — member/invitation management subject to permissions.
- /app/organisations/:organisationId/events/... — event module routes.
- /app/organisations/:organisationId/meetings/... — meetings routes.
- /app/organisations/:organisationId/projects/... — project/task routes.
- Account/profile/security pages as needed for account lifecycle requirements.
Platform routes
- /platform — distinct platform console.
- Platform accounts, organisation metadata and module catalogue pages only as defined in Section 10.
The frontend route inventory does not itself authorize data. Every request is checked by the backend and database policies.
17. Acceptance test strategy
Phase 0 must create docs/testing.md and map every requirement ID to a test type. At minimum, include:
1. Unit tests: state transitions, validation, permission decision functions, due-date calculations, scoring calculation and safe error mapping.
2. API integration tests: auth/session lifecycle, membership, invitations, RBAC, module activation, each module's core workflows and error cases.
3. Database/RLS integration tests: run as the intended least-privilege runtime role; test all relevant CRUD policy types, cross-tenant foreign keys, missing context, transaction rollback and pooled connections alternating between organisations.
4. Concurrency tests: owner invariant, invitation acceptance, event capacity/registration uniqueness, team-size limits and other identified simultaneous writes.
5. End-to-end tests: representative happy path for each major user journey, including permission-denied paths.
6. Accessibility checks: keyboard-only flows, focus management, labels, validation errors and representative responsive layouts.
7. Deployment smoke tests: health/readiness, same-origin /api proxy, secure cookies/CSRF, configured/missing email provider behaviour, migrations and core tenant isolation.
Never treat a test as passing if it was skipped, not executed, mocked in a way that removes the security boundary under test, or merely described. Report the commands and actual outcomes.
18. Phase plan and phase gates
Follow the existing Antigravity prompt pack. Its finer subphases are implementation slices, not scope additions.
Product phase	Work	Must be true before moving on
Phase 0	Read-only repository/PRD audit; decision/risk log; implementation plan; architecture, DB, security, API, traceability, testing, deployment/runbook docs; map every requirement	Every requirement is mapped; stack and folder contract match; unresolved security/data-model decisions are documented and resolved or explicitly gated; no product code/migrations created
Phase 1	Repository/tooling foundation, backend shell, frontend shell, shared design system and API conventions	Builds/lint/type checks work as configured; placeholder pages are honest; no business feature is falsely claimed complete
Phase 2	PostgreSQL migrations foundation, core schema, runtime/migration roles, RLS and tenant context	Least-privilege database integration tests prove tenant isolation before business modules depend on it
Phase 3	Shared authentication/account lifecycle/session and email abstraction	Verification/reset/session/CSRF/rate-limit tests pass
Phase 4	Organisation lifecycle, memberships, invitation onboarding and ownership invariants	Multiple-organisation and owner/invitation concurrency tests pass
Phase 5	Shared scoped RBAC, permission catalogue, module catalogue/activation and audit infrastructure	Deny-by-default, entitlement/permission and audit tests pass
Phase 6A	Events core, event lifecycle, list/detail/create/edit	Event persistence, lifecycle, tenant/resource authorization and time handling pass
Phase 6B	Public event view, registration and participant management	Eligibility, duplicate/capacity/concurrency/privacy tests pass
Phase 6C	Teams and URL-based submissions	Team membership, ownership, deadlines and submission tests pass
Phase 6D	Judge assignments, scoring and results	Assignment-only judge access, private scoring and controlled publication tests pass
Phase 7A	Meetings, scheduling, attendee records, lifecycle and list/date view	Access, lifecycle and timezone tests pass
Phase 7B	Confidential minutes/notes and action items	Note visibility and action-item assignment tests pass
Phase 7C	Meetings full integration/E2E acceptance	Complete Meetings suite passes; no critical privacy defect remains
Phase 8A	Projects, membership and lifecycle	Project tenancy, membership and archive behaviour pass
Phase 8B	Tasks, statuses, assignment, List/Kanban and filters	Assignment, workflow, due-date and filter tests pass
Phase 8C	Comments/activity and full Projects & Tasks acceptance	Safe rendering, access scope, audit/activity and end-to-end tests pass
Phase 9	Platform administration and permitted operational controls	Separate platform boundary, role separation and audit tests pass
Phase 10	Security, UX, accessibility, reliability and performance hardening	No unresolved critical/high security defect; regression and tenant isolation suite passes
Phase 11	Controlled Vercel/Render/Neon release preparation/deployment	Deployment, env, migration, cookie/CSRF and smoke checks are evidenced; unrun steps are labelled honestly
Optional final audit	Independent acceptance review	Requirement coverage, known limitations and release status are reported clearly


Phase gate policy: Antigravity must implement only the current approved phase. It must report changes, commands, actual test results, blockers, scope deviations and remaining work. Stop after the report. Do not start a later phase without explicit user approval.
19. Requirement traceability
During Phase 0, create docs/requirements-traceability.md with at least these columns:
Requirement ID | Requirement summary | Phase | UI/page | API endpoint(s) | Data entities | Authorization/RLS rule | Test case/evidence | Status | Notes/decision reference
Every ID in this PRD must have a row. A row is not complete when it merely says “tested”; it must point to the concrete test or command and record the real result once implemented. If a requirement is intentionally deferred or blocked, record the reason and obtain product-owner approval before changing scope.
20. Mandatory architecture and security decisions for Phase 0
These are implementation-verification tasks, not permission to change product scope. Phase 0 must document each item as PRD-defined, safe implementation decision, or requires product-owner decision. The defaults below are fixed; changing them requires explicit product-owner approval and a PRD version update.
1. RLS context lifecycle: document the transaction helper, transaction-local setting names, pooling strategy, rollback semantics and USING/WITH CHECK policies. Missing context fails closed.
2. Runtime database privileges: use separate migration/runtime roles and prove the runtime role cannot bypass RLS.
3. External event participant path: a verified account without organisation membership uses the common account identity but can access only its own registration/team/submission and published public results through narrowly scoped event-resource policies. Registration never creates organisation membership.
4. Role/permission matrix: enumerate permission keys for every default role in docs/security.md and docs/api-contracts.md. Functional boundaries in Sections 5–10 are authoritative. Unspecified capabilities are denied by default; do not broaden permissions to make a workflow pass.
5. Owner transfer: require explicit confirmation and reauthentication within the previous 10 minutes. Transfer must be transactional, safe under concurrent requests and audited. At least one active organisation owner must always exist.
6. Task-assignee membership removal: use the fixed policy in PRJ-004. Block project/org membership removal until active assignments are reassigned, except immediate account-level security suspension, which preserves history and creates an actionable reassignment state.
7. Event team size: when team mode is enabled, require team_size_min and team_size_max; minimum defaults to 1, maximum must be at least minimum and cannot exceed 100. Team invitations require acceptance, expire after 7 days and are single-use.
8. Registration windows: unset opening time means the first publication instant; unset closing time means event start. Closing must be after opening and not after event start. Server-side behaviour is authoritative.
9. Scoring: criterion maximum is greater than 0 and at most 100; MVP uses straight sum, requires all criteria assigned for a submission to be completed, and gives tied totals shared rank. No weights or hidden tie-breaks.
10. Email: use one shared abstraction. Verification, password recovery and organisation invitations require email capability. Meeting invitations/updates are sent only when enabled/configured. Use a local-only development test mechanism; production must never represent an unconfigured/failed send as delivered.
11. Vercel rewrite/session behaviour: validate forwarding of cookies and CSRF headers through the /api/* rewrite before claiming the deployment model is verified. If the rewrite cannot safely support the design on the target plan, stop and request approval for an alternative. Do not silently switch to third-party cookies or localStorage tokens.
12. Audit retention/access: ordinary application users cannot edit/delete audit records. Do not automatically delete audit records in MVP. Restrict reads by permission and document operational retention/backup implications; do not claim tamper-proof storage unless implemented.
13. Deletion/archive: organisation/module/event/project history is preserved by default. Task deletion is soft deletion as specified in PRJ-005. Physical deletion of core business or audit records is not a standard user workflow in MVP.
14. Meeting notes sharing: confidential notes are private to the organiser and users with explicit note permissions. No share-with-attendees toggle is included in MVP.
15. Migrations/seeds: use versioned SQL migrations, explicit local/test seed commands, no default production credentials, and controlled production migration with a recovery procedure.
No unrelated feature may be created as a workaround for a technical/security decision. If a required security property cannot be verified, report BLOCKED and explain the smallest decision or environment capability needed.
21. Definition of done
A requirement or phase is done only when all applicable checks below are satisfied:
- Behaviour matches this PRD and documented decisions.
- Frontend and backend validation exist where applicable; backend remains authoritative.
- Relevant scope, permission, entitlement, resource and RLS checks are implemented.
- Normal, empty, loading, validation failure, server failure, forbidden and not-found states are covered where relevant.
- Database migrations, indexes, constraints and rollback/forward-fix notes are documented.
- Unit, integration, tenant/RLS, concurrency, end-to-end or accessibility tests applicable to the requirement were actually run and their outcome recorded.
- UI reuses the shared design system and API client; no duplicate module-specific authentication/RBAC/tenant/client infrastructure was introduced.
- Audit and privacy requirements are implemented for sensitive actions.
- Docs and requirement traceability are updated.
- No out-of-scope feature was added and no requirement was silently dropped.
- Completion report distinguishes PASS, FAIL, BLOCKED, and NOT RUN, includes evidence and stops at the current phase.
22. Required repository structure
Use this repository structure as the canonical target. Add subfolders only when justified by the approved architecture; do not introduce client/ or server/ as competing roots.
ManageX/
├── AGENTS.md
├── README.md
├── .gitignore
├── .env.example
├── docs/
│   ├── PRD.md
│   ├── implementation-plan.md
│   ├── architecture.md
│   ├── database.md
│   ├── security.md
│   ├── api-contracts.md
│   ├── requirements-traceability.md
│   ├── testing.md
│   ├── deployment.md
│   ├── runbook.md
│   ├── future-suggestions.md
│   └── decisions/
│       ├── README.md
│       └── decision-log.md
├── frontend/       # React + TypeScript + Vite
├── backend/        # Node.js + Express + JavaScript ES Modules only
├── database/       # versioned SQL migrations and safe seeds
└── tests/          # shared/integration/e2e tests as documented
The exact internal layout of each code directory is decided in Phase 0 based on the existing repo and documented architecture. Do not pre-build all future module code in Phase 1.
23. Phase completion report format
Every phase report must include:
1. Phase and result: PASS, FAIL or BLOCKED (with a short reason).
2. Scope completed: requirement IDs completed and anything intentionally not done.
3. Files changed: actual file paths and purpose.
4. Commands run: exact commands, including migration/test/build/lint commands.
5. Test evidence: passed/failed/skipped/not-run counts and key output; distinguish mocks from real DB/RLS tests.
6. Security/tenant checks: exact relevant tests and whether the least-privilege runtime role was used.
7. Decisions/risks: decision-log references and unresolved blockers.
8. Traceability update: requirements whose status changed and evidence locations.
9. Scope integrity: confirm no unapproved feature/stack change; report any deviation explicitly.
10. Next phase: name it as a proposal only. Do not start it until the product owner approves.
24. Final product acceptance checklist
ManageX MVP is release-ready only when every applicable item is evidenced:
- [ ] Frontend is React + TypeScript + Vite; backend is Node.js + Express + JavaScript ES Modules; no backend TypeScript compilation exists.
- [ ] Vercel + Render + Neon deployment path and limitations are documented and verified to the extent credentials/permissions allow.
- [ ] Authentication, verification, recovery, revocable sessions, cookie/CSRF and rate limits work.
- [ ] Multi-organisation membership/switching/invitations/owner invariants work.
- [ ] Platform/organisation/module/resource authorization is centrally implemented and server-enforced.
- [ ] RLS is enabled on all tenant-owned tables and passes tests under the least-privilege runtime role.
- [ ] Module catalogue/activation is enforced by API and audited; disabling does not delete records.
- [ ] Common audit, API, email and UI infrastructure is shared rather than duplicated.
- [ ] Events lifecycle, registration/capacity, teams, URL submissions, judging and controlled results work.
- [ ] Meetings scheduling/attendees, confidential notes/minutes and action items work.
- [ ] Projects/membership, tasks, assignment, workflow, List/Kanban, filters, comments and activity work.
- [ ] Platform support cannot read private tenant contents by default; no support-ticketing scope has been added.
- [ ] Cross-tenant, permission-revocation, replay, concurrency and confidentiality tests pass.
- [ ] No secrets, fake activity, false email-delivery claims or fabricated deployment claims are present.
- [ ] Requirement traceability is complete; known limitations are explicit; all release checks have truthful statuses.
Implementation instruction: Read this document in full before starting any phase. During Phase 0, compare it against the repository and the Antigravity prompt pack. If this document is installed as docs/PRD.md, the prompt pack's product contract and phase plan should be followed as written. Do not use appended “Updated …” sections or duplicate structures; this canonical document already consolidates the agreed requirements. Stop and request a product-owner decision only for the explicit Phase 0 decision points above or a genuine newly discovered conflict.