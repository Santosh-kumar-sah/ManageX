# ManageX — Feature PRD
## Judge Scheduling & Evaluation System for Events & Hackathons

**Document type:** New Feature PRD / Add-on Specification  
**Version:** 1.0  
**Date:** 23 October 2026  
**Product:** ManageX  
**Module:** Events & Hackathons  
**Status:** Product requirements baseline for repository inspection and implementation planning

---

## 1. Purpose

This PRD defines a new Judge Scheduling & Evaluation capability within the existing ManageX Events & Hackathons module.

The objective is to let event organisers configure judges, create evaluation panels, schedule team evaluations, manage external meeting links, and coordinate evaluation without compromising participant privacy, tenant isolation, existing scoring behaviour or round progression.

This is an **add-on to the existing Events & Hackathons product**, not a replacement for the existing event, registration, team, submission, judging, scoring or advancement systems.

The existing implementation must be inspected before deciding which parts require new code, which can be reused, and which need correction.

## 2. Problem Statement

Organising a hackathon or multi-round competition can require manual coordination across:

- Judge invitations and panel assignments.
- Team evaluation appointments.
- Judge availability and scheduling conflicts.
- Online meeting links and schedule publication.
- Submission reviews and individual judge scoring.
- Schedule changes, cancellations and access revocation.
- Participant-facing schedules and confidential judging information.

A scheduling system that only stores meeting times is insufficient. It must also ensure that a judge can access only assigned evaluations, a participant can see only their permitted team information, and platform support cannot automatically inspect confidential customer data.

ManageX should provide one integrated workflow within Events & Hackathons while preserving its existing multi-tenant architecture and scoring engine.

## 3. Product Goals

1. Let organisers configure optional evaluation for individual event rounds.
2. Support submission-based, live-showcase and hybrid evaluations.
3. Let organisers create fixed judge panels and rotate teams through those panels.
4. Generate or manually manage evaluation schedules with conflict prevention.
5. Provide separate, permission-scoped organiser, judge and participant experiences.
6. Integrate with existing submissions, judging assignments, scoring criteria, scores and advancement.
7. Protect private submissions, judge identities, unpublished scores and meeting URLs.
8. Preserve audit history for sensitive evaluation and scheduling operations.
9. Remain compatible with existing rounds that do not use the new evaluation feature.

## 4. Non-Goals

The following are outside this feature's scope:

- Replacing the existing Events & Hackathons module.
- Replacing the existing scoring or round-advancement engine.
- Building a custom video-conferencing platform.
- Implementing Meetings-module integration.
- Building a new organisation membership or global role system.
- Automatically granting organisation membership to judges or participants.
- Payments, billing or subscription management.
- Redis, BullMQ, cron-based scheduling or mandatory background workers.
- Automated calendar integrations, advanced analytics or AI judge matching.
- Frontend implementation before the existing backend and schema have been inspected and the implementation plan approved.

External meeting providers such as Google Meet or Zoom may be used through organiser-supplied links. ManageX does not host the video call.

---

## 5. User Types and Security Contexts

A single authenticated user may have different capabilities in different events. Access must be determined for each request and resource, rather than through a universal dashboard role.

### 5.1 Organiser

An organiser is an authorised member of the organisation managing the event.

Can, subject to the existing entitlement and permission model:

- Configure round evaluation.
- Create and manage judge panels.
- Invite, assign, replace and remove judges.
- Schedule teams and manage evaluation appointments.
- Configure meeting links and release policies.
- Validate and publish schedules.
- Reschedule or cancel appointments.
- Review permitted evaluation progress and existing scoring results.

Organisation membership alone must not automatically grant every evaluation-management permission. Existing scoped permissions and module entitlements remain authoritative.

### 5.2 Judge

A judge is an authenticated user with an active, scoped assignment to a panel, evaluation or appointment.

Can:

- Access their assigned evaluation workspace.
- View their permitted schedule and appointment details.
- Access eligible submissions or team information required for their assigned work.
- Open an authorised meeting link when its release policy permits.
- Submit scores through the existing scoring workflow when authorised.
- View their own submitted scores and permitted feedback.

Cannot:

- Manage organisation settings or memberships.
- Access unrelated events, teams or submissions.
- View other judges' confidential scores or private feedback unless explicitly permitted by the existing product rules.
- Manage panels or schedules unless separately authorised as an organiser.
- Retain access after their assignment is revoked.

**A judge assignment does not create organisation membership.**

### 5.3 Participant

A participant is an eligible event registrant or team member under the existing participant model.

Can:

- View their own team's published evaluation schedule.
- View permitted appointment details and public event information.
- Access their team's own submission workflow.
- View results only when permitted by the existing publication policy.

Cannot:

- View other teams' private appointments, meeting URLs or submissions.
- View unpublished scores or confidential judge feedback.
- Access organiser configuration or judge-management operations.
- Gain organisation membership merely by registering for an event.

### 5.4 Platform Support

Platform support remains subject to explicit support authorization.

Platform-level operational privileges must not automatically grant access to private tenant evaluation records, meeting URLs, judge assignments or unpublished scores. Support access must follow the existing ManageX security policy and must not be implemented through a blanket platform-admin bypass in evaluation RLS policies.

---

## 6. Feature Configuration

### 6.1 Optional Evaluation Per Round

Evaluation is configured independently for each event round.

- A round without an evaluation configuration must continue using its existing workflow.
- Organisers may configure evaluation at the appropriate point in the event lifecycle; the system must not impose an artificial sequence of setup steps.
- Evaluation configuration must not automatically complete, publish or advance a round.
- Existing round progression and manual advancement must continue to work.

### 6.2 Evaluation Modes

ManageX must support three modes:

| Mode | Intended workflow |
|---|---|
| `submission_based` | Judges evaluate eligible submitted work using the existing submission and scoring workflow. |
| `live_showcase` | Teams present live to assigned judges during scheduled sessions. Whether a submission is also required for scoring must be resolved against the existing scoring model. |
| `hybrid` | Judges review eligible submissions and evaluate teams during scheduled live sessions. |

There is no persisted `none` mode. The absence of an evaluation configuration means that evaluation has not been configured for that round.

### 6.3 Evaluation Configuration

The organiser must be able to configure:

- Evaluation mode.
- Applicable round and event.
- Panels and judge assignments.
- Evaluation criteria using the existing scoring-criteria system.
- Scheduling preferences and session duration.
- Transition buffer between appointments.
- External meeting links, where applicable.
- Schedule publication and meeting-link release rules.

Only fields supported by the approved schema and existing scoring model may be persisted. New fields or migrations must be justified during implementation planning.

---

## 7. Judge Invitation and Assignment

### 7.1 Invitation Workflow

The intended workflow is:

1. Organiser enters a judge's email and selects the relevant event, round or panel scope.
2. ManageX creates a scoped invitation using a secure, high-entropy, single-use token.
3. Only the token hash is stored; the token itself is not written to audit logs.
4. The invitation has an expiry time. Resending an invitation invalidates the previous pending token.
5. The invitee authenticates and verifies that their account email matches the invitation.
6. Successful acceptance activates the scoped assignment.
7. The judge can then access the assigned judge workspace.

The existing authentication, verified-email and invitation mechanisms must be inspected first. Reuse suitable existing mechanisms where possible instead of creating duplicate global authentication flows.

An invitation URL is not an authorization credential by itself.

### 7.2 Panel Management

Organisers can:

- Create and rename panels.
- Assign judges to panels.
- Replace or remove panel members.
- Review current assignments.
- Detect invalid or conflicting assignments before publication.

Default product model: **fixed panels with teams rotating through them**.

A judge should occupy no more than one panel in the same evaluation unless the existing approved product rules explicitly allow otherwise.

### 7.3 Assignment Revocation

Removing or replacing a judge must immediately prevent subsequent protected API requests from using the revoked assignment.

The implementation must address:

- Access to existing appointment details.
- Access to submissions.
- Score submission and editing.
- Stale browser tabs and cached data.
- Existing `event_judge_assignments` records used by the scoring engine.

Assignment synchronization must distinguish evaluation-generated assignments from manual assignments. Reconciliation must never delete unrelated or manually created assignments accidentally.

---

## 8. Scheduling and Session Management

### 8.1 Session Creation

A session represents an appointment to evaluate a particular team in the context of an evaluation.

The organiser must be able to:

- Create a session manually.
- Generate a schedule from eligible teams and panels.
- Set start and end times.
- Assign the applicable panel.
- Associate the exact submission when the scoring workflow requires one.
- Add an external meeting URL.
- Review the schedule before publication.

The system must validate that the event, round, evaluation, panel, team and submission relationships are consistent.

### 8.2 Scheduling Validation

The system must reject:

- Invalid timestamps.
- Sessions where `ends_at` is not later than `starts_at`.
- Teams that do not belong to the relevant event.
- Panels that belong to another evaluation.
- Submissions that do not match the intended event, round or team.
- Duplicate or otherwise invalid appointments under the approved scheduling rules.
- Assignments that create prohibited scheduling conflicts.

### 8.3 Conflict Prevention

The scheduler must prevent:

1. Overlapping sessions for the same panel.
2. Overlapping appointments for the same team.
3. Overlapping appointments for the same judge across panels, rounds or events.
4. Conflicts caused by the configured transition buffer.
5. Concurrent requests that both pass a stale pre-check and create a double booking.

Example: a session from 10:00–10:30 conflicts with another session from 10:15–10:45, even though their start times differ.

Conflict checks must be concurrency-safe. A simple application-level availability check without transaction or locking protection is insufficient.

The implementation must confirm which PostgreSQL constraints, exclusion constraints or transactional locking strategy are suitable for the existing schema and target database.

### 8.4 Capacity and Allocation

The scheduler must calculate whether the available panels, judges, time slots and buffers can accommodate the requested appointments.

For example, if every team requires two distinct panel evaluations, the generated schedule must provide two eligible, non-conflicting appointments per team.

If the required schedule cannot fit, the system must return a clear capacity or scheduling-conflict error. It must not silently omit teams or create partial, misleading schedules.

### 8.5 Rescheduling and Cancellation

Organisers can reschedule or cancel appointments.

- Rescheduling must validate the new time and all affected judge, panel and team conflicts.
- A failed operation must not leave partial changes.
- Cancellation must preserve historical records and auditability.
- Cancelled appointments must not expose active meeting links to participants.
- A previously published schedule must retain an audit trail when changed or unpublished.
- Changes must not silently overwrite the previous schedule history.

---

## 9. Schedule Publication and Lifecycle

Round lifecycle, evaluation configuration, schedule lifecycle, individual sessions and result publication are separate concepts.

| Object | State or condition | Meaning |
|---|---|---|
| Evaluation configuration | Absent | Evaluation is not configured. |
| Evaluation configuration | `draft` | Organiser is configuring the evaluation. |
| Schedule | Unpublished | Only authorised organisers can manage or preview it. |
| Schedule | Published | Eligible judges and participants can see their permitted schedule details. |
| Session | Scheduled | An appointment is planned. |
| Session | In progress | The appointment is currently underway, where this state is supported. |
| Session | Completed | The appointment has ended; this does not itself mean scoring is complete. |
| Session | Cancelled | The appointment has been cancelled, with history preserved. |
| Evaluation | Completed | Required evaluation work and scoring are complete under explicit completion rules. |
| Round | Completed | The existing round lifecycle has completed. |
| Results | Published | The existing results-publication policy permits participant access. |

The exact evaluation-completion condition must be defined against the existing scoring model. Completion of all appointments and submission of all required judge scores are different conditions and must not be treated as equivalent automatically.

Schedule publication must validate required configuration and appointment integrity before making the schedule visible.

---

## 10. Meeting-Link Management and Privacy

### 10.1 URL Validation

External meeting URLs must be validated server-side. Only approved HTTP/HTTPS URL formats should be accepted under the application's URL validation policy.

Meeting URLs must not appear in logs, audit payloads, generic event responses or exports unless explicitly required and authorised.

### 10.2 Access Rules

- Organisers can manage meeting URLs within their authorised event scope.
- Assigned judges can access links for appointments within their active assignment scope.
- Participants can access only their own team's permitted appointment link.
- Participants must never receive the round-level `default_meeting_url` as a fallback.
- Unassigned judges, unrelated teams, unrelated tenants and platform support must not obtain private links through evaluation APIs.

### 10.3 Time-Bounded Release

The default participant-facing meeting-link release window is **10 minutes before the session start**, unless an approved product configuration specifies another value.

Before the release window, the participant response must omit or redact the link.

Cancelled and `no_show` appointments must not expose an active meeting link.

The service must explicitly construct safe response objects rather than serializing database rows directly. PostgreSQL RLS controls row visibility; it does not redact sensitive columns within an otherwise permitted row.

ManageX can stop exposing a URL after cancellation, but cannot guarantee that an external provider has revoked the underlying meeting room.

---

## 11. Scoring and Results Integration

The new scheduling feature must integrate with the existing scoring and advancement system.

- Existing scoring criteria remain authoritative.
- Existing `event_scores` and related scoring services remain authoritative.
- Individual judges' scores remain separate.
- A session does not automatically create a score or complete an evaluation.
- A judge may score only a permitted submission under an active assignment.
- The existing result calculation, publication and round-advancement semantics must be preserved.
- Rounds without evaluation configuration must continue to work.
- Existing manual assignments must not be destroyed by panel synchronization.
- Existing score records and historical results must not be rewritten merely to support scheduling.

The team-centric scheduling model must be reconciled with the submission-centric scoring model. Where scoring requires a specific submission, the session must identify the exact eligible submission. The implementation must not assume one submission per team per round unless the existing schema demonstrably enforces that rule.

The `live_showcase` mode must not be considered fully supported for scoring until its compatibility with the existing submission and scoring model has been verified.

---

## 12. Dashboard and User Experience Requirements

The feature introduces distinct views within the existing ManageX product, not a new universal role system.

### 12.1 Organiser Evaluation Workspace

The organiser workspace should provide:

- Round evaluation overview.
- Configuration status and evaluation mode.
- Judge panels and assignment management.
- Team appointment schedule.
- Schedule conflict and capacity validation.
- Draft preview and publication controls.
- Reschedule and cancellation actions.
- Meeting-link configuration.
- Evaluation and scoring progress using existing scoring data.
- Relevant audit history.

The organiser should receive actionable errors identifying the affected session, judge, panel or team where doing so does not reveal unauthorised information.

### 12.2 Judge Workspace

The judge workspace should provide:

- Assigned events and evaluations.
- Upcoming and past assigned sessions.
- Relevant panel and appointment details.
- Permitted submission or team information.
- Meeting links only when authorised and released.
- Existing scoring workflow and the judge's own score history.

The view must not reveal unrelated teams, unassigned appointments or other judges' confidential scores.

### 12.3 Participant Workspace

The participant view should provide:

- Their team's published appointment schedule.
- Permitted session date, time and status.
- Applicable panel information without exposing private judge data.
- Meeting link only when its release conditions are satisfied.
- Existing submission and result experiences.

A participant must not be able to access another team's schedule by modifying an event, team, session or URL identifier.

### 12.4 Platform Support

No new support dashboard for inspecting private evaluation content is required in this feature.

Operational support must follow the existing platform policy. Debugging or support access must not become a shortcut around tenant isolation.

### 12.5 Common UX Requirements

- Use existing ManageX design conventions and components.
- Display loading, empty, success, validation and failure states.
- Prevent duplicate submissions during pending mutations.
- Show meaningful messages for conflict and capacity errors.
- Require confirmation for destructive or history-affecting actions.
- Do not present unpublished schedules as published.
- Ensure accessible keyboard interaction and clear status labels.
- Do not expose private fields through client-side caches, logs or hidden UI state.

---

## 13. Data Model and Existing System Boundaries

The implementation must inspect and reuse the following existing components where suitable:

- `events` and `event_rounds`
- `event_teams`
- Existing participant registration and team-membership models
- Existing submissions and scoring criteria
- `event_judge_assignments`
- `event_scores`
- Existing result and advancement services
- Existing authentication, organisation membership and entitlements
- Existing permission catalogue and audit service
- Existing tenant-aware database transaction helpers

The reported database foundation already contains these evaluation entities:

- `round_evaluations`
- `evaluation_panels`
- `evaluation_panel_judges`
- `evaluation_sessions`

These are the starting point for inspection, not permission to assume that every required invariant or workflow is implemented correctly.

### Required integrity properties

The final implementation must enforce:

1. An evaluation belongs to a valid round and the same event.
2. A panel belongs to its intended evaluation and organisation.
3. A judge assignment belongs to the intended panel and evaluation.
4. A session references a team from the intended event.
5. A session references a panel from the intended evaluation.
6. Any associated submission matches the intended event, round and team.
7. Session intervals are valid.
8. Prohibited panel, team and judge overlaps are prevented.
9. Tenant isolation is enforced by both database policy and service-level authorization.
10. Optional evaluation does not break existing rounds.
11. Historical scoring and audit data remain consistent.

Any schema change must be proposed after repository and database inspection. Already-applied migrations must not be edited; use a new forward-only migration when a justified change is necessary.

---

## 14. Security, Permissions and Audit

### 14.1 Authorization

Use the existing ManageX authorization architecture:

- Authenticated identity.
- Active organisation membership where required.
- Existing module entitlement.
- Existing scoped permission.
- Active judge assignment for judge-specific access.
- Participant registration/team membership for participant-specific access.
- Resource-level event, round, panel, team and submission validation.

Do not introduce a universal `judge` role or trust client-supplied role or organisation identifiers.

### 14.2 Tenant Isolation

The implementation must preserve shared-schema tenant isolation.

- Use tenant-aware transactions for protected database operations.
- Keep FORCE RLS protections intact where configured.
- Use the existing runtime database role with no superuser or `BYPASSRLS` privilege.
- Ensure missing tenant context fails closed.
- Confirm that RLS and application authorization agree.
- Never treat tenant context alone as proof of judge assignment or participant team membership.

### 14.3 Audit Events

Use the existing audit service for security-relevant changes, including:

- Evaluation configuration changes.
- Panel creation and updates.
- Judge invitations, assignments and revocations.
- Schedule creation, publication, rescheduling and cancellation.
- Meeting-link changes.
- Other relevant permission-sensitive evaluation operations.

Audit records should capture the actor, relevant resource identifiers, action and safe change metadata. They must not contain meeting URLs, invitation tokens, secrets, private submission contents or confidential score payloads.

---

## 15. Error Handling and Edge Cases

The implementation must handle at least the following cases:

- A round has no evaluation configuration.
- An organiser lacks the required permission or module entitlement.
- A judge's invitation expires or is accepted by an account with the wrong verified email.
- A judge is removed while their browser session remains open.
- A judge is assigned to conflicting sessions across different events.
- A session conflicts with another appointment only because of the transition buffer.
- Two concurrent requests attempt to reserve the same time.
- A team belongs to a different event than the evaluation.
- A submission belongs to a different team or round.
- A schedule cannot fit all required appointments.
- A published schedule is rescheduled or cancelled.
- A session is cancelled before its meeting-link release time.
- A participant attempts to view another team's appointment.
- An evaluation has no scoring criteria or no judge assignments.
- A live-showcase evaluation has no compatible submission to score.
- Existing manually created judge assignments coexist with panel-generated assignments.
- An evaluation is deleted or a round is removed under existing foreign-key and audit-retention rules.
- The database tenant context is missing or empty.
- An unauthorised platform-support account attempts to read or mutate evaluation data.

Errors must be predictable, safe and consistent with existing ManageX API conventions. Internal SQL, private identifiers and confidential data must not leak in error messages.

---

## 16. Non-Functional Requirements

- **Security:** Deny by default; server-side authorization and database isolation must both be enforced.
- **Integrity:** No cross-event, cross-round or cross-team relationships.
- **Concurrency:** Scheduling must remain correct under simultaneous requests.
- **Consistency:** Session changes, affected assignments and audit operations must follow established transaction conventions.
- **Compatibility:** Existing registration, rounds, submissions, scoring and advancement must continue working.
- **Maintainability:** Reuse existing services and conventions; avoid broad refactors and duplicate engines.
- **Performance:** Use appropriate indexes and bounded queries for schedule and assignment lookups.
- **Reliability:** Failed scheduling operations must not leave partial or inconsistent records.
- **Privacy:** Responses, logs and audit entries must exclude confidential data not required by the recipient.
- **Accessibility:** Views must follow ManageX's accessibility target and existing design conventions.

---

## 17. Acceptance Criteria

The feature is not considered complete merely because its tables or API routes exist.

### Configuration and compatibility

- [ ] Organisers can configure evaluation for a round using authorised APIs.
- [ ] All three evaluation modes are supported according to the approved scoring compatibility rules.
- [ ] A round without evaluation configuration continues to work.
- [ ] Existing round advancement and results behaviour remains intact.

### Judges and panels

- [ ] Organisers can create panels and manage judge assignments.
- [ ] Judges can access only their active, authorised evaluation scope.
- [ ] A revoked assignment denies subsequent protected reads and score submissions.
- [ ] Panel synchronization preserves unrelated manual assignments.

### Scheduling

- [ ] Organisers can create, validate, publish, reschedule and cancel sessions.
- [ ] Cross-event and cross-round relationships are rejected.
- [ ] Panel, team and judge conflicts are prevented.
- [ ] Conflict validation includes the approved transition buffer.
- [ ] Concurrent requests cannot bypass scheduling conflict prevention.
- [ ] Capacity errors do not silently omit required appointments.

### Participant and meeting-link privacy

- [ ] Participants can access their own team's permitted published sessions.
- [ ] Participants cannot access other teams' private sessions.
- [ ] Participants never receive the default round meeting URL.
- [ ] Meeting links are released according to the approved time window.
- [ ] Cancelled and `no_show` sessions do not expose active meeting links.
- [ ] Unpublished schedules and confidential judge information remain private.
- [ ] Platform support cannot bypass tenant isolation to inspect or mutate evaluation data.

### Quality and regression

- [ ] Tests use PostgreSQL and the actual restricted runtime role with FORCE RLS.
- [ ] Authorization, isolation, revocation, conflict and privacy tests pass.
- [ ] Existing round, judging, scoring and advancement regression suites pass.
- [ ] New migrations, if any, are forward-only and reviewed before application.
- [ ] Test results and any remaining limitations are documented accurately.

---

## 18. Implementation Governance

Implementation must proceed in controlled stages.

**Stage 1 — Current-State Inspection**

Inspect the repository, applied migrations, RLS policies, existing routes, services, permissions, scoring model and tests. Produce a gap report mapping every requirement in this PRD to the actual implementation.

Do not modify files, apply migrations or perform data writes during this stage.

**Stage 2 — Design and Gap Closure**

Identify which requirements are already satisfied, partially implemented, missing or unsafe. Propose only necessary changes, including any required schema changes, and document compatibility risks.

**Stage 3 — Backend Implementation**

After explicit approval, implement the approved backend changes with targeted tests. Preserve existing functionality and avoid unrelated refactors.

**Stage 4 — Verification and Acceptance**

Run the relevant new and existing tests, review tenant isolation and API response privacy, and report actual results. Do not begin frontend implementation or another phase until the current stage has been reviewed and approved.

---

## 19. Decisions Requiring Repository Verification

The PRD establishes product requirements, but the following implementation details must be confirmed against the actual code and schema before implementation:

1. Whether existing judge invitations or another secure invitation mechanism can be reused.
2. Whether one or multiple submissions are allowed per team per round.
3. How live-showcase scoring works when no submission exists.
4. How evaluation-generated assignments can be distinguished safely from manual judge assignments.
5. Which existing permissions govern each organiser, judge and participant operation.
6. How to prevent judge conflicts across evaluations and events under concurrent requests.
7. Which database constraints and extensions are available in the target environment.
8. How existing evaluation, scoring and advancement states interact.
9. Which meeting-link fields are currently exposed by existing API serializers or shared event endpoints.
10. Which existing audit, transaction and tenant-context helpers must be reused.

These are not permission to invent new architecture. Each decision must be supported by repository evidence and the smallest safe change.

---

## 20. Definition of Done

Judge Scheduling & Evaluation is complete when the approved requirements are implemented, existing functionality remains compatible, tenant and resource-level access controls are enforced, meeting-link privacy is verified, scheduling is concurrency-safe, and relevant tests pass.

A successful database migration alone does not constitute feature completion.

**This PRD is the feature-specific reference for the new Judge Scheduling & Evaluation capability in ManageX Events & Hackathons. It does not replace or rewrite the existing ManageX PRD.**