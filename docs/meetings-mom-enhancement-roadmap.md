# ManageX — Meetings & MOM Enhancement Roadmap

**Document:** Meetings and Minutes of Meeting (MOM) Enhancement Roadmap
**File:** `docs/meetings-mom-enhancement-roadmap.md`
**Status:** Proposed implementation plan
**Purpose:** Single reference document for phased implementation through Antigravity
**Current priority:** Phase 1, Meeting Lifecycle and UI Fixes
**AI scope:** Text-based AI assistance only, in a later phase
**Audio/live transcription:** Explicitly deferred

---

## 1. Purpose and Vision

The objective is to make the ManageX Meetings module reliable, secure, and useful for real organisational workflows.

The module should connect the complete meeting lifecycle:

**Meeting → Agenda → Discussion → Decisions → Action Items → Follow-up → MOM and AI-assisted summary**

This roadmap covers:

- Existing meeting lifecycle and UI fixes.
- Structured Minutes of Meeting (MOM).
- Decisions and Agenda linked to Action Items.
- Action Item tracking across meetings.
- Security, audit logging, and concurrent editing.
- Agenda time-boxing, MOM templates, and carry-forward.
- Invitations, reminders, and recurring meetings.
- Text-based AI MOM generation and action-item extraction.
- Export, search, and external integrations.

Audio recording, audio upload, speech-to-text, and live transcription are not part of the current implementation scope.

**Important:** This is a planned roadmap, not a claim that these features are implemented. Antigravity must inspect the current repository and identify existing functionality before changing anything.

## 2. Core Product Principles

1. **Inspect before implementing.** Read the existing PRD, architecture, security rules, routes, services, schema, migrations, and tests.
2. **Reuse existing functionality.** Do not create duplicate MOM tables, Action Item systems, services, or APIs when suitable implementations already exist.
3. **One phase at a time.** Do not implement the next phase until the current phase is verified and explicitly accepted.
4. **Security is backend-enforced.** Hiding frontend controls is not authorization.
5. **Preserve existing data.** Do not delete seeded accounts, users, organisations, memberships, meetings, decisions, notes, or action items.
6. **Never reset databases.** No database reset, drop, truncate, clean, or reseed operations.
7. **Use forward-only migrations.** Never edit an already-applied migration. Add a new migration when a schema change is necessary.
8. **Separate environments.**
   - `managex`: local development database.
   - `managex_test`: integration-test database.
   - Neon: production database.
9. **Verify database targets before writes.** Never assume a connection points to the intended database.
10. **No unapproved deployment.** Production migrations and deployment require separate explicit approval.
11. **Protect confidential content.** Notes, decisions, exports, audit logs, and AI processing must respect existing access policies.
12. **Report actual evidence.** Never claim a migration, feature, test, or build succeeded without evidence.
13. **Avoid unnecessary infrastructure.** Do not introduce Redis, BullMQ, a new scheduler, WebSockets, or paid external services without reviewing the existing architecture and obtaining approval for material scope changes.
14. **Decisions marked "Decided" are binding.** Where this roadmap records a business rule as decided, implement it as written. Where something is marked "Open", stop and ask instead of guessing.

## 3. Existing Architecture and Source of Truth

Use the actual repository and canonical documentation as the authority.

Known project baseline:

- Frontend: React, TypeScript, Vite.
- Backend: Node.js, Express, JavaScript ES modules.
- Database: PostgreSQL.
- API namespace: `/api/v1`.
- Request validation: existing Zod patterns where applicable.
- Multi-tenant architecture with organisation-scoped authorization and PostgreSQL RLS.
- Existing Structured MOM reportedly includes discussion points, decisions, and additional/historical notes.
- Existing Action Items must be inspected and reused.
- Existing meeting permissions must remain authoritative.

Before implementation, inspect at least:

- `docs/PRD.md`
- `docs/implementation-plan.md`
- `docs/progress.md`
- `docs/requirements-traceability.md`
- `docs/security.md`, if present
- Existing architecture and permission documentation
- Relevant meeting services, routes, frontend pages, database migrations, and tests

If a file has a different name or location, discover the canonical equivalent rather than creating a duplicate.

---

## 4. Implementation Roadmap

| Phase | Name | Priority | Main outcome |
|---|---|---|---|
| 1 | Meeting Lifecycle and UI Fixes | P0 | Correct status transitions and UI consistency |
| 2 | Action Items v2 and Decision/Agenda Linking | P0 | Traceable decisions and accountable tasks |
| 3 | Security, Audit, and Concurrent Editing | P0 | Reliable confidentiality and data integrity |
| 4 | Agenda Time-Boxing, MOM Templates, Carry-Forward | P1 | Better meeting facilitation |
| 5a | Invitations and ICS export | P1 | Reliable meeting communication |
| 5b | Email reminders | P1 | Idempotent reminders |
| 5c | Recurring meetings | P2 | Series/occurrence scheduling |
| 5d | Guest and login-free RSVP | P2 | Token-based external RSVP |
| 6a | Text-Based AI MOM Assistant (core) | P1 | AI-generated MOM drafts from pasted text |
| 6b | AI extras (agenda suggestions, digest, NL search) | P2 | Optional AI enhancements |
| 7 | Export, Search, and Integrations | P2 | Better discovery, sharing, and interoperability |
| Future | Audio and Live Transcription | Deferred | Separate future feature |

Priority labels describe proposed sequencing, not delivery dates.

**Dependencies:**

- Phase 4 carry-forward depends on Phase 2 (Action Items v2).
- Phase 6a depends on Phase 2 (Action Items) and Phase 3 (permissions and audit).
- Phase 5b depends on 5a. Phase 5c and 5d depend on 5a and 5b.
- Phase 7 export depends on Phase 3 permissions.

---

# Phase 1: Meeting Lifecycle and UI Fixes

## 5. Objective

Fix current meeting lifecycle inconsistencies and user-interface defects before adding major new functionality.

### 5.1 Meeting Status State Machine

Target lifecycle:

- `Scheduled → In Progress`
- `Scheduled → Cancelled`
- `Scheduled → Missed` (manual action only, see rule below)
- `In Progress → Completed`
- `In Progress → Cancelled`

`Completed`, `Cancelled`, and `Missed` are terminal states unless an explicit, audited correction or reopening workflow is approved later.

#### Requirements

- Inspect existing status values, database constraints, API handlers, and transition logic before making changes.
- Enforce valid transitions on the backend.
- Make the frontend reflect the same transition rules.
- Reject invalid transitions with a stable API error.
- Disable or hide unavailable buttons and explain the reason when useful.
- Handle concurrent requests and repeated transitions safely (idempotent or clearly rejected).
- Preserve existing meeting data and historical records.

#### Overdue versus Missed (Decided)

These are separate concepts:

- **Scheduled:** The meeting has not started.
- **In Progress:** The meeting has explicitly been started.
- **Completed:** The meeting has finished.
- **Cancelled:** The meeting was cancelled.
- **Overdue:** A **derived display badge only**, not a stored status. Shown when stored status is `Scheduled` and the current time (in the meeting's timezone) is past the meeting's end time. No database change is needed for this.
- **Missed:** A **stored status applied only by explicit user action** ("Mark as Missed") by a user with meeting manage permission. It is allowed only when status is `Scheduled` and the meeting end time has passed. The action must be audited.

Rules:

- Do not automatically change any meeting to `Missed`.
- Do not introduce a scheduler, cron job, or background worker for this.
- An overdue `Scheduled` meeting may still be started late, cancelled, or marked as missed by an authorized user.
- If `Missed` requires a new database enum value or constraint, inspect the existing schema first, propose the migration, and wait for approval before applying it.

#### Cancellation Rules (Decided)

- `Scheduled → Cancelled` and `In Progress → Cancelled` are both allowed for users with meeting manage permission.
- Cancellation requires a confirmation dialog.
- Cancelling an in-progress meeting must not delete notes, decisions, or Action Items already recorded.

### 5.2 RSVP Controls

- If RSVP is already `Accepted`, the Accept button must appear selected or disabled.
- Apply equivalent behaviour to `Declined` and `Tentative`, where supported.
- Hide unnecessary RSVP controls for the organiser.
- Prevent duplicate or misleading RSVP actions.
- Ensure the backend validates RSVP updates.
- RSVP or attendance must not grant access to confidential MOM.

### 5.3 Timezone Handling

- Use `Asia/Kolkata` as the canonical India timezone identifier.
- Handle legacy `Asia/Calcutta` values safely.
- Display a friendly timezone label such as `IST (UTC+05:30)`.
- Keep the actual IANA timezone identifier available internally for calculations.
- Use the correct timezone when displaying meeting dates, validating transitions, computing Overdue, scheduling reminders, handling recurrence, and exporting calendar events.
- Avoid ambiguous date parsing or double conversion.

Do not rewrite existing stored values blindly. Determine whether safe application-level normalization or a reviewed migration is appropriate.

### 5.4 Success Messages and UI Cleanup

- Replace permanent success banners such as `Decision recorded successfully` and `Confidential minutes saved successfully` with accessible toast notifications that disappear after approximately 3-4 seconds.
- Do not show success until the backend confirms the operation.
- Keep important errors and warnings visible until the user can understand or resolve them.
- Remove duplicate breadcrumbs (keep one).
- Hide decision reorder arrows when only one decision exists.
- Disable the relevant direction at the top and bottom of a list.
- Remove the duplicate Action Items empty-state CTA. Keep one clear primary Add Action Item action.
- Check loading, error, disabled, and empty states.
- Ensure controls remain accessible and usable on different screen sizes.

### 5.5 Phase 1 Acceptance Criteria

- Status transitions are enforced on the backend and reflected in the UI.
- Past meetings show the Overdue badge according to the rule above.
- Missed can only be set by explicit authorized action.
- Invalid transitions are rejected by the API with a stable error.
- RSVP buttons reflect the actual response.
- Timezone display and date calculations are correct.
- Duplicate breadcrumbs, duplicate CTAs, and permanent success banners are fixed.
- Existing meetings, accounts, MOM, decisions, and Action Items remain intact.
- Relevant backend tests, frontend tests, and build checks pass with actual output reported.

---

# Phase 2: Action Items v2 and Decision/Agenda Linking

## 6. Objective

Connect meeting discussions and decisions to trackable work, while preserving the distinction between a decision and a task.

### 6.1 Decision-to-Action Item Flow

Example: Decision "Model accuracy must exceed 70%" can generate the Action Item "Perform hyperparameter tuning".

Suggested fields:

- Title
- Description
- Assignee
- Due date
- Priority
- Status
- Source decision
- Related agenda item
- Meeting reference

An authorized user should be able to create an Action Item from a decision directly, without manually copying context.

### 6.2 Linkage Requirements

An Action Item may be linked to its meeting, a decision, an agenda item, or both a decision and an agenda item when relevant.

- Inspect the existing Action Item and agenda models first.
- Prefer explicit foreign keys and referential integrity. Avoid an unnecessary generic polymorphic model.
- Deleting a decision or agenda item must not silently delete existing Action Items unless explicitly approved. Preserve task history and define what happens to links when a source record is deleted.

### 6.3 Action Item Tracking

Support or verify, using the existing canonical model:

- Title and optional description.
- Assignee.
- Due date.
- Priority.
- Status: `Todo`, `In Progress`, `Done` (mapped to existing canonical values if different).
- Related meeting, decision, and agenda item.
- Creation and update metadata.

Provide clear indicators for Overdue, Due soon, Unassigned, In progress, and Completed. Overdue is derived from due date and current status, not stored as a separate status.

### 6.4 My Action Items Dashboard

A cross-meeting view for the current authorized user:

- Assigned to me, Due soon, Overdue, In progress, Completed.
- Filters by status, priority, due date, and meeting.
- Must respect organisation boundaries, module entitlements, and task-level permissions.

### 6.5 Projects & Tasks Integration

Inspect the Projects & Tasks module before implementation.

- Reuse the canonical task model or define an explicit integration contract.
- Do not build a duplicate task system in Meetings.
- Do not automatically create a Projects task for every Action Item.
- If conversion to a Projects task is introduced, it must be explicit, idempotent, and auditable, and must preserve the link back to the source Action Item.
- Respect module entitlements and permissions.

### 6.6 Phase 2 Acceptance Criteria

- Users can create an Action Item directly from a decision.
- Tasks can be linked to decisions and agenda items.
- Assignee, due date, priority, and status persist correctly.
- The same Action Item appears consistently across relevant views.
- Cross-organisation access is denied.
- Source-record deletion does not unexpectedly destroy tasks.
- Duplicate task creation is prevented or clearly controlled.
- Existing Action Items and seeded data remain intact.

---

# Phase 3: Security, Audit, and Concurrent Editing

## 7. Objective

Protect confidential MOM and prevent data loss when multiple users collaborate.

### 7.1 Permission Enforcement

- Reuse the central permission catalogue.
- Follow the existing meeting permission model, including `meeting.notes.read`, `meeting.notes.edit`, and `meeting.notes.manage` where these are the canonical keys.
- Do not add ad hoc role-string checks.
- Do not grant Owner/Admin or platform support roles automatic access to confidential notes.
- Attendance alone must not grant confidential MOM access.
- Enforce permissions on aggregate endpoints and individual endpoints for discussion points, decisions, reordering, Action Items, export, and AI operations.

### 7.2 Tenant Isolation and RLS

- Verify organisation-scoped queries and database constraints.
- Verify RLS policies on relevant tables.
- Keep runtime application roles least-privileged, without superuser or `BYPASSRLS` privileges.
- Establish tenant context according to the existing transaction and database patterns.
- Never add a platform-admin bypass for private tenant content.
- Inspect migration history before changing policies.

### 7.3 Audit Logging

Audit important actions:

- Meeting status changes, including Mark as Missed and Cancel.
- Decision created, updated, deleted, or reordered.
- Discussion point created, updated, deleted, or reordered.
- Action Item created, updated, reassigned, completed, or linked.
- Relevant access denials, according to existing audit conventions.
- AI draft generation and user approval.

Audit records contain minimum metadata only (resource IDs, actor IDs, action types, timestamps). Never put confidential note bodies, private decision details, raw pasted text, provider secrets, or full sensitive request payloads into audit metadata.

### 7.4 Concurrent Editing

Inspect the current save model first. Where needed:

- Add optimistic locking using a version field or reliable `updated_at` precondition.
- Return a clear conflict response if a stale edit would overwrite newer data.
- Preserve the user's draft.
- Offer reload, compare, or retry where appropriate.
- Show `Saving…`, `Saved`, or `Unsaved changes`.
- Warn before navigating away when content is unsaved.

Do not introduce WebSockets or real-time infrastructure unless required and approved.

### 7.5 Delete Confirmation and Undo

- Require confirmation for destructive operations.
- Offer undo only if restoration is technically safe and explicitly supported.
- If soft delete is introduced, define retention, access, and audit behaviour.
- Do not promise undo for permanent deletion.

### 7.6 Phase 3 Acceptance Criteria

- All sensitive APIs enforce backend authorization.
- Cross-organisation reads and writes are denied.
- Audit logs contain no confidential content.
- Concurrent edits cannot silently overwrite newer changes.
- Draft and save states are reliable.
- Existing RLS and MOM security regression tests pass.

---

# Phase 4: Agenda Time-Boxing, MOM Templates, and Carry-Forward

## 8. Objective

Help organisers run meetings to a plan and capture consistent outcomes.

### 8.1 Agenda Time-Boxing

Support:

- Planned duration for each agenda item.
- Optional presenter.
- Total planned agenda duration.
- Warning when planned agenda duration exceeds meeting duration.
- Running agenda timer after an authorized meeting start.
- Pause/resume and next-item controls, if appropriate.
- Recovery after page refresh using a reliable start timestamp and elapsed time.

A browser timer must not be the authoritative source of meeting state. The timer must respect Cancelled, Completed, and Missed states.

### 8.2 MOM Templates

Initial templates: Daily Standup, Retrospective, Client Call, Sprint Planning.

- Templates may pre-fill agenda items and suggested MOM sections.
- Templates remain editable.
- Applying a template must not silently overwrite existing notes or agenda items. Provide an explicit merge or replace choice.
- Reuse existing MOM sections and models.

### 8.3 Carry-Forward from Previous Meetings

Allow an organiser to review and carry forward open Action Items from a related previous meeting.

- Carry-forward must be explicit and reviewable.
- Preserve original ownership, due date, history, and source meeting.
- Link existing tasks where possible instead of copying.
- Prevent duplicate tasks on retries.
- Never carry items across organisation boundaries.

### 8.4 Phase 4 Acceptance Criteria

- Agenda duration and meeting duration are displayed correctly.
- Timers recover after refresh.
- Templates do not cause unintended data loss.
- Carry-forward preserves task history and prevents duplicates.

---

# Phase 5: Communication and Scheduling

Phase 5 is split into four independently approvable subphases. Do not start a subphase before the previous one is accepted.

## 9. Phase 5a: Invitations and ICS Export

- Inspect the existing email abstraction before implementation.
- Support meeting invitations, update notifications, and cancellation notifications.
- Support external guests invited by email. External guests must not be automatically granted organisation membership or portal access.
- Report email delivery state honestly. Email failure must not silently corrupt meeting state.
- Implement `.ics` export and invitation attachments with correct date and timezone information, stable event identifiers, and correct handling of updates and cancellations.
- Protect private meeting information in exports.
- Google Calendar and Outlook two-way sync is NOT part of 5a. It is a separate future subphase because it needs provider authorization, credentials, token storage, and revocation handling.

## 9.1 Phase 5b: Email Reminders

Proposed defaults: 24 hours and 15 minutes before the meeting.

- Use the meeting's intended timezone.
- Do not send reminders for Cancelled, Completed, or Missed meetings.
- Prevent duplicate reminders (idempotency).
- Handle rescheduling and attendee changes.
- Record delivery attempts and failures using existing conventions.
- Inspect existing scheduling infrastructure before proposing any new dependency. Do not silently introduce Redis, BullMQ, cron infrastructure, or a paid scheduling service. If none exists, stop and propose options for approval.

## 9.2 Phase 5c: Recurring Meetings

- Support daily, weekly, and custom recurrence using a reviewed series/occurrence model.
- Distinguish editing one occurrence from editing the entire series.
- Preserve stable series and occurrence identifiers.
- Handle exceptions, timezone changes, and daylight-saving rules where relevant.
- Prevent duplicate reminders.
- Do not implement recurrence as naive row duplication.

## 9.3 Phase 5d: Guest and Login-Free RSVP

Only if explicitly approved:

- Use high-entropy, single-purpose, expiring tokens.
- Store only safe token representations (such as hashes).
- Limit each token to its intended invitation and RSVP operation.
- Support revocation and prevent replay.
- Do not expose meeting notes, attendee lists, or other private information.
- Apply rate limits and appropriate audit logging.

## 9.4 Phase 5 Acceptance Criteria

- Email delivery outcomes are reported honestly.
- Reminders are idempotent.
- ICS files contain correct dates and timezone information.
- Recurring-series edits are predictable.
- Guest RSVP links expose only the intended capability.

---

# Phase 6: Text-Based AI MOM Assistant

## 10. Objective

Use AI to reduce manual MOM preparation and improve follow-up while keeping users in control of decisions and data.

**In scope:** text pasted by the user (meeting notes or an existing transcript text).
**Out of scope:** audio recording, audio upload, speech-to-text, live transcription.

### 10.0 Provider Approval Gate (Open, requires user input)

Before any Phase 6 implementation, the user must approve:

- Which AI provider and model to use.
- Where the API key is stored (server-side environment only).
- Cost assumptions and per-organisation usage limits.
- Whether AI is enabled by default or via an organisation-level toggle.

Antigravity must not choose a provider, add keys, or claim a provider is configured without this approval and verification.

## Phase 6a: Core MOM Generation (build this first)

### 10.1 Generate Structured MOM Draft from Text

An authorized user pastes meeting notes and generates a draft containing:

- Short summary.
- Discussion points.
- Decisions.
- Suggested Action Items.
- Open questions.

The AI must distinguish facts present in the input from suggestions and inferences.

### 10.2 Action Item Extraction

For each proposed Action Item, generate title, optional description, suggested assignee, due date, priority, and related decision reference when grounded in the input.

- Suggest an assignee only when supported by the text and the authorized candidate list.
- Due date only when stated in the text.
- Distinguish extracted values from inferred values.
- If information is missing, use `null` or `Not specified`.
- Do not invent names, deadlines, decisions, or commitments.
- The server must validate assignees against the authorized user/member list. Never trust an AI-provided user ID. If no confident match exists, leave the assignee empty for the user to choose.

### 10.3 Human Approval Workflow (mandatory)

**User pastes notes → AI generates draft → User reviews/edits → User confirms → Application saves**

AI must not automatically finalize decisions, assign tasks, send emails, overwrite existing MOM, change meeting status, or perform any consequential operation without explicit user action.

- AI-generated content is labelled as a draft until reviewed.
- Each draft item can be individually accepted, edited, or discarded.
- Saving uses the existing MOM and Action Item APIs and services.

### 10.4 AI Architecture and Privacy

- Inspect existing provider/configuration patterns before implementation.
- Use a backend provider abstraction. Keep API keys and secrets server-side only.
- Validate inputs and structured outputs using existing validation patterns, and define the output schema from the project's actual enums and types.
- Apply request-size limits, rate limits, timeouts, and safe error handling.
- For long input, define a chunking and merge strategy or reject with a clear message.
- Treat AI output as untrusted data. Render AI text safely.
- Preserve the original user input when generation fails.
- Do not log raw confidential input unnecessarily.
- Respect module entitlements and permission checks. Users who cannot access MOM must not be able to use AI to bypass this.
- Clearly disclose that content will be sent to an external AI provider, and require explicit user action before sending.
- Document provider availability, cost assumptions, privacy implications, and failure modes.

### 10.5 Phase 6a Acceptance Criteria

- Users can generate a structured MOM draft from pasted text.
- Output is validated and editable.
- Missing facts are not invented.
- No changes are persisted until the user confirms.
- Existing MOM is not overwritten by generation.
- Provider errors leave original notes intact.
- Unauthorized users cannot use AI to bypass MOM permissions.
- Tests cover provider failure, invalid or malformed output, authorization, tenant isolation, and successful approval/save.

## Phase 6b: AI Extras (only after 6a is stable and accepted)

- **Meeting summary and digest:** key decisions, outstanding Action Items, unresolved questions. An absent-participant digest is allowed only if the requesting user is authorized to access all source content included.
- **Agenda suggestions:** reviewable suggestions from authorized context (objective, existing agenda, previous related decisions, pending Action Items). Must never alter the meeting automatically.
- **Natural-language search assistance:** for example "Which Action Items are overdue?". All results must respect the current user's permissions and organisation scope. Never allow an LLM to execute arbitrary SQL.

---

# Phase 7: Export, Search, and Integrations

## 11. Objective

Make meeting outcomes easier to retrieve and share without exposing confidential information.

### 11.1 Export and Sharing

- Export authorized MOM content to PDF and DOCX, preserving readable headings, discussion points, decisions, and Action Items.
- Distinguish attendee-visible content from confidential content.
- Confirm recipients and visibility before emailing MOM.
- Never include confidential content in public exports or external links by default.
- Reuse the existing email abstraction and report actual delivery outcomes.

### 11.2 Meeting Search and Filters

Filters: status, date range, organiser, and tags if supported by the canonical schema.

Permission-aware search over decisions and Action Items:

- Organisation-scoped results.
- Pagination and bounded queries.
- Suitable indexes where justified.
- No unbounded full-table scans as a substitute for a search design.
- Search snippets must not reveal inaccessible content.

### 11.3 Google Meet and Zoom Links

Treat automatic link generation as a separate integration subphase.

- Verify provider APIs and authentication requirements first.
- Define credential and OAuth token handling, revocation, and failure recovery.
- Keep provider secrets out of frontend code and logs.
- Do not make a paid provider mandatory for core Meetings functionality.

### 11.4 Phase 7 Acceptance Criteria

- Export and search use the same authorization rules as the source content.
- Confidential content is not included in public exports or unauthorized emails.
- Search results are bounded and tenant-scoped.
- Integration failures are visible and recoverable.

---

# 12. Explicitly Deferred: Audio and Live Transcription

Out of scope for Phases 1-7:

- Microphone recording.
- Audio file uploads, storage, and processing.
- Live streaming transcription.
- Speech-to-text integrations (Whisper, Deepgram, or others).
- Speaker diarization or identification.
- MOM generation directly from audio.

Pasted text, including a transcript the user already has as text, is in scope for Phase 6a. Only audio-based input and transcription are deferred.

When approved later, create a separate plan covering recording consent and visible indicators, audio retention and deletion, provider privacy and data residency, cost and usage controls, Hindi and Hinglish support, speaker attribution uncertainty, transcript permissions, and secure storage with access logging.

---

# 13. Cross-Cutting Technical Requirements

## 13.1 Database Safety

- Inspect actual migration history and schema before any migration.
- Never edit an applied migration. Use new ordered migrations only.
- Preserve seeded accounts and all existing business data.
- Never reset, drop, truncate, clean, or reseed databases.
- Verify the actual target database before every write.
- Keep `managex`, `managex_test`, and Neon/production separate.
- Do not deploy or migrate production without explicit approval.
- Do not assume a migration is applied merely because its file exists.

## 13.2 API and Backend

- Follow existing `/api/v1` conventions and validation patterns.
- Enforce permissions and organisation scope on the backend.
- Use transactions for operations that must succeed or fail together.
- Define stable errors for invalid transitions, permission denials, conflicts, and provider failures.
- Do not leak SQL details, secrets, or confidential content in errors.
- Prevent duplicate submissions and non-idempotent retries where appropriate.

## 13.3 Frontend

- Provide loading, empty, error, success, and disabled states.
- Use accessible controls and prevent duplicate submissions.
- Preserve drafts during recoverable failures.
- Do not show success before server confirmation.
- Follow ManageX's existing design system.
- Keep confidential content visibility consistent across pages, modals, exports, and notifications.

## 13.4 Testing

For each phase, identify and run appropriate tests only after verifying their database-write behaviour and target.

Required categories where applicable:

- Unit tests for status transitions and validation.
- Backend integration tests for permissions and tenant isolation.
- Frontend component tests for controls and states.
- Regression tests for existing Meetings and MOM behaviour.
- Build and type checks.
- Tests for audit privacy and confidential content.
- Concurrency tests for stale writes.
- AI tests for malformed output, provider failure, and user approval.

Never claim a test passed without actual output. If a test cannot safely be run, report the limitation rather than bypassing safety rules.

## 13.5 Documentation

After an approved implementation phase, update relevant canonical documentation when warranted: `docs/progress.md`, `docs/implementation-plan.md`, `docs/requirements-traceability.md`, and relevant architecture and security documents.

Record actual changes, migrations, test results, limitations, and follow-up work. Do not mark unverified requirements complete.

---

# 14. Antigravity Execution Protocol

This protocol applies to every phase and subphase.

## Step A: Read-Only Discovery

1. Read this roadmap and the canonical PRD, architecture, security, and permission documents.
2. Inspect the actual implementation relevant to the phase.
3. Identify existing functionality, defects, gaps, and dependencies.
4. Inspect relevant database schema and migration history using read-only operations.
5. Verify database targets without exposing credentials.
6. Report the exact proposed scope and files likely to change.
7. Identify any destructive or high-risk operation before proposing it.

Do not edit files or apply migrations during discovery.

## Step B: Approval Gate

Stop after discovery and wait for explicit approval before implementation, unless the user has already explicitly approved that exact phase.

Do not automatically continue to the next phase after completing the current one.

## Step C: Focused Implementation

1. Implement only the approved phase.
2. Reuse existing code, models, routes, services, and UI patterns.
3. Add a new migration only when necessary and within the approved scope.
4. Preserve existing accounts and data.
5. Keep audio and live transcription out of scope.
6. Avoid unrelated refactors.
7. Do not deploy.

## Step D: Verification

1. Run relevant safe tests and build/type checks.
2. Verify authorization and tenant isolation.
3. Verify data preservation.
4. Review the actual code diff.
5. Report exact tests, commands, results, and migration state.
6. Clearly distinguish verified facts from assumptions and untested behaviour.

## Step E: Completion Report

Report: what changed, what existing functionality was reused, files modified, migrations created or applied (with verified target), tests and build results, security and data-preservation checks, known limitations, and follow-up items.

Stop after the report and wait for user acceptance.

---

# 15. Definition of Done

A phase is complete only when:

- Its requirements are implemented or explicitly reported as blocked.
- Existing features and seeded data are preserved.
- Backend permissions and tenant isolation are verified for affected operations.
- Relevant tests and build checks have actual results.
- Database changes, if any, are reviewed and accurately documented.
- Canonical documentation reflects verified work.
- Known limitations are recorded.
- No subsequent phase has been started without approval.

---

# 16. Immediate Execution Instruction

**Begin with Phase 1 only.**

Perform read-only discovery of:

1. Meeting status values, database constraints, and allowed transitions.
2. Start/end time and timezone handling (including `Asia/Calcutta` vs `Asia/Kolkata` data).
3. Past meeting display, and how to implement the derived Overdue badge and the manual Mark as Missed action per Section 5.1.
4. RSVP state and button behaviour.
5. Permanent success banners and existing toast handling.
6. Duplicate breadcrumbs.
7. Decision reorder controls.
8. Duplicate Action Items empty-state buttons.
9. Existing tests and database migration dependencies.

Compare the actual implementation against Phase 1 acceptance criteria.

Return a concise gap report containing:

- Current behaviour.
- Confirmed defects.
- Existing functionality that should be reused.
- Proposed files and API/schema changes.
- Required migrations, if any (for example, whether `Missed` needs a new enum value).
- Test plan and risks.

**Do not edit code, apply migrations, reset data, reseed accounts, or deploy during this initial discovery.**

# ManageX — Meetings & MOM Enhancement Roadmap

**Document:** Meetings and Minutes of Meeting (MOM) Enhancement Roadmap
**File:** `docs/meetings-mom-enhancement-roadmap.md`
**Status:** Proposed implementation plan
**Purpose:** Single reference document for phased implementation through Antigravity
**Current priority:** Phase 1, Meeting Lifecycle and UI Fixes
**AI scope:** Text-based AI assistance only, in a later phase
**Audio/live transcription:** Explicitly deferred

---

## 1. Purpose and Vision

The objective is to make the ManageX Meetings module reliable, secure, and useful for real organisational workflows.

The module should connect the complete meeting lifecycle:

**Meeting → Agenda → Discussion → Decisions → Action Items → Follow-up → MOM and AI-assisted summary**

This roadmap covers:

- Existing meeting lifecycle and UI fixes.
- Structured Minutes of Meeting (MOM).
- Decisions and Agenda linked to Action Items.
- Action Item tracking across meetings.
- Security, audit logging, and concurrent editing.
- Agenda time-boxing, MOM templates, and carry-forward.
- Invitations, reminders, and recurring meetings.
- Text-based AI MOM generation and action-item extraction.
- Export, search, and external integrations.

Audio recording, audio upload, speech-to-text, and live transcription are not part of the current implementation scope.

**Important:** This is a planned roadmap, not a claim that these features are implemented. Antigravity must inspect the current repository and identify existing functionality before changing anything.

## 2. Core Product Principles

1. **Inspect before implementing.** Read the existing PRD, architecture, security rules, routes, services, schema, migrations, and tests.
2. **Reuse existing functionality.** Do not create duplicate MOM tables, Action Item systems, services, or APIs when suitable implementations already exist.
3. **One phase at a time.** Do not implement the next phase until the current phase is verified and explicitly accepted.
4. **Security is backend-enforced.** Hiding frontend controls is not authorization.
5. **Preserve existing data.** Do not delete seeded accounts, users, organisations, memberships, meetings, decisions, notes, or action items.
6. **Never reset databases.** No database reset, drop, truncate, clean, or reseed operations.
7. **Use forward-only migrations.** Never edit an already-applied migration. Add a new migration when a schema change is necessary.
8. **Separate environments.**
   - `managex`: local development database.
   - `managex_test`: integration-test database.
   - Neon: production database.
9. **Verify database targets before writes.** Never assume a connection points to the intended database.
10. **No unapproved deployment.** Production migrations and deployment require separate explicit approval.
11. **Protect confidential content.** Notes, decisions, exports, audit logs, and AI processing must respect existing access policies.
12. **Report actual evidence.** Never claim a migration, feature, test, or build succeeded without evidence.
13. **Avoid unnecessary infrastructure.** Do not introduce Redis, BullMQ, a new scheduler, WebSockets, or paid external services without reviewing the existing architecture and obtaining approval for material scope changes.
14. **Decisions marked "Decided" are binding.** Where this roadmap records a business rule as decided, implement it as written. Where something is marked "Open", stop and ask instead of guessing.

## 3. Existing Architecture and Source of Truth

Use the actual repository and canonical documentation as the authority.

Known project baseline:

- Frontend: React, TypeScript, Vite.
- Backend: Node.js, Express, JavaScript ES modules.
- Database: PostgreSQL.
- API namespace: `/api/v1`.
- Request validation: existing Zod patterns where applicable.
- Multi-tenant architecture with organisation-scoped authorization and PostgreSQL RLS.
- Existing Structured MOM reportedly includes discussion points, decisions, and additional/historical notes.
- Existing Action Items must be inspected and reused.
- Existing meeting permissions must remain authoritative.

Before implementation, inspect at least:

- `docs/PRD.md`
- `docs/implementation-plan.md`
- `docs/progress.md`
- `docs/requirements-traceability.md`
- `docs/security.md`, if present
- Existing architecture and permission documentation
- Relevant meeting services, routes, frontend pages, database migrations, and tests

If a file has a different name or location, discover the canonical equivalent rather than creating a duplicate.

---

## 4. Implementation Roadmap

| Phase | Name | Priority | Main outcome |
|---|---|---|---|
| 1 | Meeting Lifecycle and UI Fixes | P0 | Correct status transitions and UI consistency |
| 2 | Action Items v2 and Decision/Agenda Linking | P0 | Traceable decisions and accountable tasks |
| 3 | Security, Audit, and Concurrent Editing | P0 | Reliable confidentiality and data integrity |
| 4 | Agenda Time-Boxing, MOM Templates, Carry-Forward | P1 | Better meeting facilitation |
| 5a | Invitations and ICS export | P1 | Reliable meeting communication |
| 5b | Email reminders | P1 | Idempotent reminders |
| 5c | Recurring meetings | P2 | Series/occurrence scheduling |
| 5d | Guest and login-free RSVP | P2 | Token-based external RSVP |
| 6a | Text-Based AI MOM Assistant (core) | P1 | AI-generated MOM drafts from pasted text |
| 6b | AI extras (agenda suggestions, digest, NL search) | P2 | Optional AI enhancements |
| 7 | Export, Search, and Integrations | P2 | Better discovery, sharing, and interoperability |
| Future | Audio and Live Transcription | Deferred | Separate future feature |

Priority labels describe proposed sequencing, not delivery dates.

**Dependencies:**

- Phase 4 carry-forward depends on Phase 2 (Action Items v2).
- Phase 6a depends on Phase 2 (Action Items) and Phase 3 (permissions and audit).
- Phase 5b depends on 5a. Phase 5c and 5d depend on 5a and 5b.
- Phase 7 export depends on Phase 3 permissions.

---

# Phase 1: Meeting Lifecycle and UI Fixes

## 5. Objective

Fix current meeting lifecycle inconsistencies and user-interface defects before adding major new functionality.

### 5.1 Meeting Status State Machine

Target lifecycle:

- `Scheduled → In Progress`
- `Scheduled → Cancelled`
- `Scheduled → Missed` (manual action only, see rule below)
- `In Progress → Completed`
- `In Progress → Cancelled`

`Completed`, `Cancelled`, and `Missed` are terminal states unless an explicit, audited correction or reopening workflow is approved later.

#### Requirements

- Inspect existing status values, database constraints, API handlers, and transition logic before making changes.
- Enforce valid transitions on the backend.
- Make the frontend reflect the same transition rules.
- Reject invalid transitions with a stable API error.
- Disable or hide unavailable buttons and explain the reason when useful.
- Handle concurrent requests and repeated transitions safely (idempotent or clearly rejected).
- Preserve existing meeting data and historical records.

#### Overdue versus Missed (Decided)

These are separate concepts:

- **Scheduled:** The meeting has not started.
- **In Progress:** The meeting has explicitly been started.
- **Completed:** The meeting has finished.
- **Cancelled:** The meeting was cancelled.
- **Overdue:** A **derived display badge only**, not a stored status. Shown when stored status is `Scheduled` and the current time (in the meeting's timezone) is past the meeting's end time. No database change is needed for this.
- **Missed:** A **stored status applied only by explicit user action** ("Mark as Missed") by a user with meeting manage permission. It is allowed only when status is `Scheduled` and the meeting end time has passed. The action must be audited.

Rules:

- Do not automatically change any meeting to `Missed`.
- Do not introduce a scheduler, cron job, or background worker for this.
- An overdue `Scheduled` meeting may still be started late, cancelled, or marked as missed by an authorized user.
- If `Missed` requires a new database enum value or constraint, inspect the existing schema first, propose the migration, and wait for approval before applying it.

#### Cancellation Rules (Decided)

- `Scheduled → Cancelled` and `In Progress → Cancelled` are both allowed for users with meeting manage permission.
- Cancellation requires a confirmation dialog.
- Cancelling an in-progress meeting must not delete notes, decisions, or Action Items already recorded.

### 5.2 RSVP Controls

- If RSVP is already `Accepted`, the Accept button must appear selected or disabled.
- Apply equivalent behaviour to `Declined` and `Tentative`, where supported.
- Hide unnecessary RSVP controls for the organiser.
- Prevent duplicate or misleading RSVP actions.
- Ensure the backend validates RSVP updates.
- RSVP or attendance must not grant access to confidential MOM.

### 5.3 Timezone Handling

- Use `Asia/Kolkata` as the canonical India timezone identifier.
- Handle legacy `Asia/Calcutta` values safely.
- Display a friendly timezone label such as `IST (UTC+05:30)`.
- Keep the actual IANA timezone identifier available internally for calculations.
- Use the correct timezone when displaying meeting dates, validating transitions, computing Overdue, scheduling reminders, handling recurrence, and exporting calendar events.
- Avoid ambiguous date parsing or double conversion.

Do not rewrite existing stored values blindly. Determine whether safe application-level normalization or a reviewed migration is appropriate.

### 5.4 Success Messages and UI Cleanup

- Replace permanent success banners such as `Decision recorded successfully` and `Confidential minutes saved successfully` with accessible toast notifications that disappear after approximately 3-4 seconds.
- Do not show success until the backend confirms the operation.
- Keep important errors and warnings visible until the user can understand or resolve them.
- Remove duplicate breadcrumbs (keep one).
- Hide decision reorder arrows when only one decision exists.
- Disable the relevant direction at the top and bottom of a list.
- Remove the duplicate Action Items empty-state CTA. Keep one clear primary Add Action Item action.
- Check loading, error, disabled, and empty states.
- Ensure controls remain accessible and usable on different screen sizes.

### 5.5 Phase 1 Acceptance Criteria

- Status transitions are enforced on the backend and reflected in the UI.
- Past meetings show the Overdue badge according to the rule above.
- Missed can only be set by explicit authorized action.
- Invalid transitions are rejected by the API with a stable error.
- RSVP buttons reflect the actual response.
- Timezone display and date calculations are correct.
- Duplicate breadcrumbs, duplicate CTAs, and permanent success banners are fixed.
- Existing meetings, accounts, MOM, decisions, and Action Items remain intact.
- Relevant backend tests, frontend tests, and build checks pass with actual output reported.

---

# Phase 2: Action Items v2 and Decision/Agenda Linking

## 6. Objective

Connect meeting discussions and decisions to trackable work, while preserving the distinction between a decision and a task.

### 6.1 Decision-to-Action Item Flow

Example: Decision "Model accuracy must exceed 70%" can generate the Action Item "Perform hyperparameter tuning".

Suggested fields:

- Title
- Description
- Assignee
- Due date
- Priority
- Status
- Source decision
- Related agenda item
- Meeting reference

An authorized user should be able to create an Action Item from a decision directly, without manually copying context.

### 6.2 Linkage Requirements

An Action Item may be linked to its meeting, a decision, an agenda item, or both a decision and an agenda item when relevant.

- Inspect the existing Action Item and agenda models first.
- Prefer explicit foreign keys and referential integrity. Avoid an unnecessary generic polymorphic model.
- Deleting a decision or agenda item must not silently delete existing Action Items unless explicitly approved. Preserve task history and define what happens to links when a source record is deleted.

### 6.3 Action Item Tracking

Support or verify, using the existing canonical model:

- Title and optional description.
- Assignee.
- Due date.
- Priority.
- Status: `Todo`, `In Progress`, `Done` (mapped to existing canonical values if different).
- Related meeting, decision, and agenda item.
- Creation and update metadata.

Provide clear indicators for Overdue, Due soon, Unassigned, In progress, and Completed. Overdue is derived from due date and current status, not stored as a separate status.

### 6.4 My Action Items Dashboard

A cross-meeting view for the current authorized user:

- Assigned to me, Due soon, Overdue, In progress, Completed.
- Filters by status, priority, due date, and meeting.
- Must respect organisation boundaries, module entitlements, and task-level permissions.

### 6.5 Projects & Tasks Integration

Inspect the Projects & Tasks module before implementation.

- Reuse the canonical task model or define an explicit integration contract.
- Do not build a duplicate task system in Meetings.
- Do not automatically create a Projects task for every Action Item.
- If conversion to a Projects task is introduced, it must be explicit, idempotent, and auditable, and must preserve the link back to the source Action Item.
- Respect module entitlements and permissions.

### 6.6 Phase 2 Acceptance Criteria

- Users can create an Action Item directly from a decision.
- Tasks can be linked to decisions and agenda items.
- Assignee, due date, priority, and status persist correctly.
- The same Action Item appears consistently across relevant views.
- Cross-organisation access is denied.
- Source-record deletion does not unexpectedly destroy tasks.
- Duplicate task creation is prevented or clearly controlled.
- Existing Action Items and seeded data remain intact.

---

# Phase 3: Security, Audit, and Concurrent Editing

## 7. Objective

Protect confidential MOM and prevent data loss when multiple users collaborate.

### 7.1 Permission Enforcement

- Reuse the central permission catalogue.
- Follow the existing meeting permission model, including `meeting.notes.read`, `meeting.notes.edit`, and `meeting.notes.manage` where these are the canonical keys.
- Do not add ad hoc role-string checks.
- Do not grant Owner/Admin or platform support roles automatic access to confidential notes.
- Attendance alone must not grant confidential MOM access.
- Enforce permissions on aggregate endpoints and individual endpoints for discussion points, decisions, reordering, Action Items, export, and AI operations.

### 7.2 Tenant Isolation and RLS

- Verify organisation-scoped queries and database constraints.
- Verify RLS policies on relevant tables.
- Keep runtime application roles least-privileged, without superuser or `BYPASSRLS` privileges.
- Establish tenant context according to the existing transaction and database patterns.
- Never add a platform-admin bypass for private tenant content.
- Inspect migration history before changing policies.

### 7.3 Audit Logging

Audit important actions:

- Meeting status changes, including Mark as Missed and Cancel.
- Decision created, updated, deleted, or reordered.
- Discussion point created, updated, deleted, or reordered.
- Action Item created, updated, reassigned, completed, or linked.
- Relevant access denials, according to existing audit conventions.
- AI draft generation and user approval.

Audit records contain minimum metadata only (resource IDs, actor IDs, action types, timestamps). Never put confidential note bodies, private decision details, raw pasted text, provider secrets, or full sensitive request payloads into audit metadata.

### 7.4 Concurrent Editing

Inspect the current save model first. Where needed:

- Add optimistic locking using a version field or reliable `updated_at` precondition.
- Return a clear conflict response if a stale edit would overwrite newer data.
- Preserve the user's draft.
- Offer reload, compare, or retry where appropriate.
- Show `Saving…`, `Saved`, or `Unsaved changes`.
- Warn before navigating away when content is unsaved.

Do not introduce WebSockets or real-time infrastructure unless required and approved.

### 7.5 Delete Confirmation and Undo

- Require confirmation for destructive operations.
- Offer undo only if restoration is technically safe and explicitly supported.
- If soft delete is introduced, define retention, access, and audit behaviour.
- Do not promise undo for permanent deletion.

### 7.6 Phase 3 Acceptance Criteria

- All sensitive APIs enforce backend authorization.
- Cross-organisation reads and writes are denied.
- Audit logs contain no confidential content.
- Concurrent edits cannot silently overwrite newer changes.
- Draft and save states are reliable.
- Existing RLS and MOM security regression tests pass.

---

# Phase 4: Agenda Time-Boxing, MOM Templates, and Carry-Forward

## 8. Objective

Help organisers run meetings to a plan and capture consistent outcomes.

### 8.1 Agenda Time-Boxing

Support:

- Planned duration for each agenda item.
- Optional presenter.
- Total planned agenda duration.
- Warning when planned agenda duration exceeds meeting duration.
- Running agenda timer after an authorized meeting start.
- Pause/resume and next-item controls, if appropriate.
- Recovery after page refresh using a reliable start timestamp and elapsed time.

A browser timer must not be the authoritative source of meeting state. The timer must respect Cancelled, Completed, and Missed states.

### 8.2 MOM Templates

Initial templates: Daily Standup, Retrospective, Client Call, Sprint Planning.

- Templates may pre-fill agenda items and suggested MOM sections.
- Templates remain editable.
- Applying a template must not silently overwrite existing notes or agenda items. Provide an explicit merge or replace choice.
- Reuse existing MOM sections and models.

### 8.3 Carry-Forward from Previous Meetings

Allow an organiser to review and carry forward open Action Items from a related previous meeting.

- Carry-forward must be explicit and reviewable.
- Preserve original ownership, due date, history, and source meeting.
- Link existing tasks where possible instead of copying.
- Prevent duplicate tasks on retries.
- Never carry items across organisation boundaries.

### 8.4 Phase 4 Acceptance Criteria

- Agenda duration and meeting duration are displayed correctly.
- Timers recover after refresh.
- Templates do not cause unintended data loss.
- Carry-forward preserves task history and prevents duplicates.

---

# Phase 5: Communication and Scheduling

Phase 5 is split into four independently approvable subphases. Do not start a subphase before the previous one is accepted.

## 9. Phase 5a: Invitations and ICS Export

- Inspect the existing email abstraction before implementation.
- Support meeting invitations, update notifications, and cancellation notifications.
- Support external guests invited by email. External guests must not be automatically granted organisation membership or portal access.
- Report email delivery state honestly. Email failure must not silently corrupt meeting state.
- Implement `.ics` export and invitation attachments with correct date and timezone information, stable event identifiers, and correct handling of updates and cancellations.
- Protect private meeting information in exports.
- Google Calendar and Outlook two-way sync is NOT part of 5a. It is a separate future subphase because it needs provider authorization, credentials, token storage, and revocation handling.

## 9.1 Phase 5b: Email Reminders

Proposed defaults: 24 hours and 15 minutes before the meeting.

- Use the meeting's intended timezone.
- Do not send reminders for Cancelled, Completed, or Missed meetings.
- Prevent duplicate reminders (idempotency).
- Handle rescheduling and attendee changes.
- Record delivery attempts and failures using existing conventions.
- Inspect existing scheduling infrastructure before proposing any new dependency. Do not silently introduce Redis, BullMQ, cron infrastructure, or a paid scheduling service. If none exists, stop and propose options for approval.

## 9.2 Phase 5c: Recurring Meetings

- Support daily, weekly, and custom recurrence using a reviewed series/occurrence model.
- Distinguish editing one occurrence from editing the entire series.
- Preserve stable series and occurrence identifiers.
- Handle exceptions, timezone changes, and daylight-saving rules where relevant.
- Prevent duplicate reminders.
- Do not implement recurrence as naive row duplication.

## 9.3 Phase 5d: Guest and Login-Free RSVP

Only if explicitly approved:

- Use high-entropy, single-purpose, expiring tokens.
- Store only safe token representations (such as hashes).
- Limit each token to its intended invitation and RSVP operation.
- Support revocation and prevent replay.
- Do not expose meeting notes, attendee lists, or other private information.
- Apply rate limits and appropriate audit logging.

## 9.4 Phase 5 Acceptance Criteria

- Email delivery outcomes are reported honestly.
- Reminders are idempotent.
- ICS files contain correct dates and timezone information.
- Recurring-series edits are predictable.
- Guest RSVP links expose only the intended capability.

---

# Phase 6: Text-Based AI MOM Assistant

## 10. Objective

Use AI to reduce manual MOM preparation and improve follow-up while keeping users in control of decisions and data.

**In scope:** text pasted by the user (meeting notes or an existing transcript text).
**Out of scope:** audio recording, audio upload, speech-to-text, live transcription.

### 10.0 Provider Approval Gate (Open, requires user input)

Before any Phase 6 implementation, the user must approve:

- Which AI provider and model to use.
- Where the API key is stored (server-side environment only).
- Cost assumptions and per-organisation usage limits.
- Whether AI is enabled by default or via an organisation-level toggle.

Antigravity must not choose a provider, add keys, or claim a provider is configured without this approval and verification.

## Phase 6a: Core MOM Generation (build this first)

### 10.1 Generate Structured MOM Draft from Text

An authorized user pastes meeting notes and generates a draft containing:

- Short summary.
- Discussion points.
- Decisions.
- Suggested Action Items.
- Open questions.

The AI must distinguish facts present in the input from suggestions and inferences.

### 10.2 Action Item Extraction

For each proposed Action Item, generate title, optional description, suggested assignee, due date, priority, and related decision reference when grounded in the input.

- Suggest an assignee only when supported by the text and the authorized candidate list.
- Due date only when stated in the text.
- Distinguish extracted values from inferred values.
- If information is missing, use `null` or `Not specified`.
- Do not invent names, deadlines, decisions, or commitments.
- The server must validate assignees against the authorized user/member list. Never trust an AI-provided user ID. If no confident match exists, leave the assignee empty for the user to choose.

### 10.3 Human Approval Workflow (mandatory)

**User pastes notes → AI generates draft → User reviews/edits → User confirms → Application saves**

AI must not automatically finalize decisions, assign tasks, send emails, overwrite existing MOM, change meeting status, or perform any consequential operation without explicit user action.

- AI-generated content is labelled as a draft until reviewed.
- Each draft item can be individually accepted, edited, or discarded.
- Saving uses the existing MOM and Action Item APIs and services.

### 10.4 AI Architecture and Privacy

- Inspect existing provider/configuration patterns before implementation.
- Use a backend provider abstraction. Keep API keys and secrets server-side only.
- Validate inputs and structured outputs using existing validation patterns, and define the output schema from the project's actual enums and types.
- Apply request-size limits, rate limits, timeouts, and safe error handling.
- For long input, define a chunking and merge strategy or reject with a clear message.
- Treat AI output as untrusted data. Render AI text safely.
- Preserve the original user input when generation fails.
- Do not log raw confidential input unnecessarily.
- Respect module entitlements and permission checks. Users who cannot access MOM must not be able to use AI to bypass this.
- Clearly disclose that content will be sent to an external AI provider, and require explicit user action before sending.
- Document provider availability, cost assumptions, privacy implications, and failure modes.

### 10.5 Phase 6a Acceptance Criteria

- Users can generate a structured MOM draft from pasted text.
- Output is validated and editable.
- Missing facts are not invented.
- No changes are persisted until the user confirms.
- Existing MOM is not overwritten by generation.
- Provider errors leave original notes intact.
- Unauthorized users cannot use AI to bypass MOM permissions.
- Tests cover provider failure, invalid or malformed output, authorization, tenant isolation, and successful approval/save.

## Phase 6b: AI Extras (only after 6a is stable and accepted)

- **Meeting summary and digest:** key decisions, outstanding Action Items, unresolved questions. An absent-participant digest is allowed only if the requesting user is authorized to access all source content included.
- **Agenda suggestions:** reviewable suggestions from authorized context (objective, existing agenda, previous related decisions, pending Action Items). Must never alter the meeting automatically.
- **Natural-language search assistance:** for example "Which Action Items are overdue?". All results must respect the current user's permissions and organisation scope. Never allow an LLM to execute arbitrary SQL.

---

# Phase 7: Export, Search, and Integrations

## 11. Objective

Make meeting outcomes easier to retrieve and share without exposing confidential information.

### 11.1 Export and Sharing

- Export authorized MOM content to PDF and DOCX, preserving readable headings, discussion points, decisions, and Action Items.
- Distinguish attendee-visible content from confidential content.
- Confirm recipients and visibility before emailing MOM.
- Never include confidential content in public exports or external links by default.
- Reuse the existing email abstraction and report actual delivery outcomes.

### 11.2 Meeting Search and Filters

Filters: status, date range, organiser, and tags if supported by the canonical schema.

Permission-aware search over decisions and Action Items:

- Organisation-scoped results.
- Pagination and bounded queries.
- Suitable indexes where justified.
- No unbounded full-table scans as a substitute for a search design.
- Search snippets must not reveal inaccessible content.

### 11.3 Google Meet and Zoom Links

Treat automatic link generation as a separate integration subphase.

- Verify provider APIs and authentication requirements first.
- Define credential and OAuth token handling, revocation, and failure recovery.
- Keep provider secrets out of frontend code and logs.
- Do not make a paid provider mandatory for core Meetings functionality.

### 11.4 Phase 7 Acceptance Criteria

- Export and search use the same authorization rules as the source content.
- Confidential content is not included in public exports or unauthorized emails.
- Search results are bounded and tenant-scoped.
- Integration failures are visible and recoverable.

---

# 12. Explicitly Deferred: Audio and Live Transcription

Out of scope for Phases 1-7:

- Microphone recording.
- Audio file uploads, storage, and processing.
- Live streaming transcription.
- Speech-to-text integrations (Whisper, Deepgram, or others).
- Speaker diarization or identification.
- MOM generation directly from audio.

Pasted text, including a transcript the user already has as text, is in scope for Phase 6a. Only audio-based input and transcription are deferred.

When approved later, create a separate plan covering recording consent and visible indicators, audio retention and deletion, provider privacy and data residency, cost and usage controls, Hindi and Hinglish support, speaker attribution uncertainty, transcript permissions, and secure storage with access logging.

---

# 13. Cross-Cutting Technical Requirements

## 13.1 Database Safety

- Inspect actual migration history and schema before any migration.
- Never edit an applied migration. Use new ordered migrations only.
- Preserve seeded accounts and all existing business data.
- Never reset, drop, truncate, clean, or reseed databases.
- Verify the actual target database before every write.
- Keep `managex`, `managex_test`, and Neon/production separate.
- Do not deploy or migrate production without explicit approval.
- Do not assume a migration is applied merely because its file exists.

## 13.2 API and Backend

- Follow existing `/api/v1` conventions and validation patterns.
- Enforce permissions and organisation scope on the backend.
- Use transactions for operations that must succeed or fail together.
- Define stable errors for invalid transitions, permission denials, conflicts, and provider failures.
- Do not leak SQL details, secrets, or confidential content in errors.
- Prevent duplicate submissions and non-idempotent retries where appropriate.

## 13.3 Frontend

- Provide loading, empty, error, success, and disabled states.
- Use accessible controls and prevent duplicate submissions.
- Preserve drafts during recoverable failures.
- Do not show success before server confirmation.
- Follow ManageX's existing design system.
- Keep confidential content visibility consistent across pages, modals, exports, and notifications.

## 13.4 Testing

For each phase, identify and run appropriate tests only after verifying their database-write behaviour and target.

Required categories where applicable:

- Unit tests for status transitions and validation.
- Backend integration tests for permissions and tenant isolation.
- Frontend component tests for controls and states.
- Regression tests for existing Meetings and MOM behaviour.
- Build and type checks.
- Tests for audit privacy and confidential content.
- Concurrency tests for stale writes.
- AI tests for malformed output, provider failure, and user approval.

Never claim a test passed without actual output. If a test cannot safely be run, report the limitation rather than bypassing safety rules.

## 13.5 Documentation

After an approved implementation phase, update relevant canonical documentation when warranted: `docs/progress.md`, `docs/implementation-plan.md`, `docs/requirements-traceability.md`, and relevant architecture and security documents.

Record actual changes, migrations, test results, limitations, and follow-up work. Do not mark unverified requirements complete.

---

# 14. Antigravity Execution Protocol

This protocol applies to every phase and subphase.

## Step A: Read-Only Discovery

1. Read this roadmap and the canonical PRD, architecture, security, and permission documents.
2. Inspect the actual implementation relevant to the phase.
3. Identify existing functionality, defects, gaps, and dependencies.
4. Inspect relevant database schema and migration history using read-only operations.
5. Verify database targets without exposing credentials.
6. Report the exact proposed scope and files likely to change.
7. Identify any destructive or high-risk operation before proposing it.

Do not edit files or apply migrations during discovery.

## Step B: Approval Gate

Stop after discovery and wait for explicit approval before implementation, unless the user has already explicitly approved that exact phase.

Do not automatically continue to the next phase after completing the current one.

## Step C: Focused Implementation

1. Implement only the approved phase.
2. Reuse existing code, models, routes, services, and UI patterns.
3. Add a new migration only when necessary and within the approved scope.
4. Preserve existing accounts and data.
5. Keep audio and live transcription out of scope.
6. Avoid unrelated refactors.
7. Do not deploy.

## Step D: Verification

1. Run relevant safe tests and build/type checks.
2. Verify authorization and tenant isolation.
3. Verify data preservation.
4. Review the actual code diff.
5. Report exact tests, commands, results, and migration state.
6. Clearly distinguish verified facts from assumptions and untested behaviour.

## Step E: Completion Report

Report: what changed, what existing functionality was reused, files modified, migrations created or applied (with verified target), tests and build results, security and data-preservation checks, known limitations, and follow-up items.

Stop after the report and wait for user acceptance.

---

# 15. Definition of Done

A phase is complete only when:

- Its requirements are implemented or explicitly reported as blocked.
- Existing features and seeded data are preserved.
- Backend permissions and tenant isolation are verified for affected operations.
- Relevant tests and build checks have actual results.
- Database changes, if any, are reviewed and accurately documented.
- Canonical documentation reflects verified work.
- Known limitations are recorded.
- No subsequent phase has been started without approval.

---

# 16. Immediate Execution Instruction

**Begin with Phase 1 only.**

Perform read-only discovery of:

1. Meeting status values, database constraints, and allowed transitions.
2. Start/end time and timezone handling (including `Asia/Calcutta` vs `Asia/Kolkata` data).
3. Past meeting display, and how to implement the derived Overdue badge and the manual Mark as Missed action per Section 5.1.
4. RSVP state and button behaviour.
5. Permanent success banners and existing toast handling.
6. Duplicate breadcrumbs.
7. Decision reorder controls.
8. Duplicate Action Items empty-state buttons.
9. Existing tests and database migration dependencies.

Compare the actual implementation against Phase 1 acceptance criteria.

Return a concise gap report containing:

- Current behaviour.
- Confirmed defects.
- Existing functionality that should be reused.
- Proposed files and API/schema changes.
- Required migrations, if any (for example, whether `Missed` needs a new enum value).
- Test plan and risks.

**Do not edit code, apply migrations, reset data, reseed accounts, or deploy during this initial discovery.**

Wait for explicit approval to implement Phase 1. After implementation, verify it and stop for acceptance. Do not start Phase 2 until Phase 1 has been accepted.



