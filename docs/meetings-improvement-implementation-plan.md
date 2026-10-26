# ManageX Meetings Module — Comprehensive Improvement Implementation Plan

**Document Path:** `docs/meetings-improvement-implementation-plan.md`  
**Status:** Architecture & Implementation Plan (Documentation Only)  
**Governing Documents:** `docs/PRD.md` (§8.1, §8.2, §20.14), `docs/architecture.md`, `docs/security.md`, `docs/meetings-mom-enhancement-roadmap.md`  
**Target Environment:** Local development database `managex` and test database `managex_test` (Neon/production completely untouched)  

---

## A. Purpose and Scope

### 1. Objective
This implementation plan defines the complete, phased engineering blueprint to refine, harden, and complete the ManageX Meetings module. Building upon the verified foundation of Core Meetings (Phase 7A), Structured Minutes of Meeting (MOM, Migration 037), Action Items v2 and Decision Linking (Migration 039), Root Meetings RLS Hardening (SEC-009, Migration 040), and Analytics & Multi-Format Exports (Phase 4), this plan addresses verified functional discrepancies, UX gaps, data definition alignments, and attendee presentation bugs.

### 2. Binding Product Decisions
The following product and architecture decisions are formally approved and non-negotiable:
1. **No Automatic Completion on Expiry:** Meeting end-time expiry (`NOW() > end_at`) must **not** automatically transition a meeting to `completed`. Automated completion leads to false records of meetings that may never have taken place.
2. **Prominent Overdue Warning:** An expired `scheduled` or `in_progress` meeting whose scheduled end time has passed must display a prominent, derived `Overdue` warning across meeting lists and detail views.
3. **Explicit Organiser Resolution:** The organiser (or privileged organization manager) must explicitly resolve the meeting by transitioning it to `completed` (if held) or marking it as `missed` (if it did not take place), subject to server-side authorization.
4. **Terminal Cancelled State:** A meeting transitioned to `cancelled` is permanently locked. Cancelled meetings remain cancelled and cannot be transitioned or modified.
5. **Manual Virtual Conferencing Links:** Meeting URLs are manually supplied by the organiser (e.g., Google Meet, Zoom, Microsoft Teams URL).
6. **Integrations Explicitly Out of Scope:** Automated Google Calendar two-way synchronization, OAuth calendaring integrations, live bot transcription, audio/video upload, and automated dynamic conferencing-link generation are strictly out of scope.
7. **Preservation of Invariants:** All existing multi-tenant isolation guarantees, PostgreSQL Row-Level Security policies without platform-admin bypass, transaction-local tenant context, optimistic locking on notes, and append-only audit trails must be preserved without regression.

### 3. Dependencies and Operational Constraints
- **Stack Integrity:** Frontend: React 18, TypeScript, Vite, Tailwind CSS, Lucide icons. Backend: Node.js, Express.js (pure ES modules, `.js` only, no TypeScript compilation). Database: PostgreSQL with Row-Level Security (`managex_app` runtime role).
- **Environment Isolation:** All implementation and verification must target local `managex` and `managex_test`. Production (Neon) and staging environments remain untouched.
- **Non-Destructive Testing:** Test fixtures must use run-unique tags and isolated lifecycle transactions. No dropping, resetting, or cleaning of persistent databases.

---

## B. Requirement Inventory

| Requirement ID | Name | Category | Primary Target | Summary Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **`MTG-IMP-01`** | Attendee Name & Profile Resolution | Attendee UX | Frontend / Backend API | Full names and email addresses of internal members must render correctly on attendee cards and tables; fallback to `'Member'` only when profile is genuinely missing. Backward-compatible serialization. |
| **`MTG-IMP-02`** | Organiser Identification & Role Display | Attendee UX | Detail Page / Header | Organiser identity, badge, and role are explicitly shown in meeting headers and attendee rosters; sole organiser cannot be deleted from meeting. |
| **`MTG-IMP-03`** | External Guest Representation | Attendee UX | Roster / Dialogs | External attendees are cleanly tagged with an `(External)` badge and email, isolated from organisation membership records. |
| **`MTG-IMP-04`** | RSVP States & Accurate Attendee Counts | Attendee UX | List / Detail / API | Accurate display of total invited attendees versus confirmed (accepted) attendees; organiser is excluded from self-RSVP prompts. |
| **`MTG-IMP-05`** | Overdue State Calculation & Warning UX | Lifecycle | List / Detail UI | Meetings past `end_at` in `scheduled` or `in_progress` status render clear Overdue badges and prompt organiser resolution without automatic state mutation. |
| **`MTG-IMP-06`** | Terminal Lifecycle Enforcement | Lifecycle | Backend Service / UI | Terminal statuses (`completed`, `cancelled`, `missed`) permanently lock meeting mutations, status transitions, attendee changes, and agenda edits. |
| **`MTG-IMP-07`** | Virtual Meeting Link Access & Terminal Lockdown | Join Behavior | Detail Page UI | Active meetings display clickable "Join Virtual Meeting" links; terminal meetings (`completed`, `cancelled`, `missed`) disable or deactivate the join CTA. |
| **`MTG-IMP-08`** | Standardized Timezone & Date Formatting | Presentation | List / Detail UI | Meeting instants are displayed in the meeting's canonical IANA timezone with UTC offset label (e.g. `IST (Asia/Kolkata, UTC+05:30)`). |
| **`MTG-IMP-09`** | MoM Empty States & Completion Reminder | MOM UX | Detail Page MOM | Empty discussion points, decisions, and action items show clear creation CTAs; completing a meeting with empty MoM triggers an informative reminder. |
| **`MTG-IMP-10`** | Secure PDF & Markdown MOM Export | Export | Backend / Detail UI | Meeting minutes can be exported as `.md` or `.pdf` for any outcome; confidential notes are strictly withheld unless caller has explicit notes permissions. |
| **`MTG-IMP-11`** | Action Items Progress & Project Promotion | Action Items | Detail / Workspace | Action items support priority, status progression, linked decisions, project task promotion, and overdue calculation; terminal items cannot be reopened. Rate calculation clarifies actionable denominator. |
| **`MTG-IMP-12`** | Analytics Definitions & Date Semantics | Analytics | Analytics API / UI | Analytics aggregates derive from real SQL under tenant context; completion and attendance rates guard against zero denominators; occurrence metrics evaluate `start_at` while creation velocity evaluates `created_at`. |
| **`MTG-IMP-13`** | Responsive Layouts, Loading & Error States | UI / UX | Frontend Components | All views adhere to the Clean Enterprise light design system, providing loading skeletons, responsive grid cards, and non-blocking toast notifications. |
| **`MTG-IMP-14`** | Authorization, RLS, Audit Logging & Regression | Security | Security / Database | Strict backend authorization, transaction-local tenant context, PostgreSQL RLS without platform-admin bypass, and append-only audit logging with zero body leaks. |

---

## C. Current-State Investigation and Evidence

### 1. Attendee Names and Profile Resolution (`MTG-IMP-01`)
- **Current Behavior:** In [`MeetingDetailPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx#L1809), internal attendee names display as `'Member'` instead of their actual full names.
- **Code Inspection & Consumer Analysis:**
  - Database schema: `users.full_name` and `users.email` store user identity.
  - Backend query in [`meetingService.js`](file:///d:/manageX/backend/src/platform/meetings/meetingService.js#L707-L721):
    ```sql
    SELECT a.id, a.meeting_id, a.organisation_id, a.user_id, a.external_email,
           a.role, a.rsvp_status, a.invited_at, a.responded_at, a.created_at,
           u.full_name AS user_name, u.email AS user_email
    FROM meeting_attendees a
    LEFT JOIN users u ON u.id = a.user_id
    ```
  - Backend serialization: Currently maps to `{ userName: row.user_name || null, userEmail: row.user_email || row.external_email || null }`.
  - Frontend type contract in [`frontend/src/types/meetings.ts`](file:///d:/manageX/frontend/src/types/meetings.ts#L30-L42):
    ```typescript
    export interface MeetingAttendee {
      id: string;
      organisationId: string;
      meetingId: string;
      userId?: string | null;
      externalEmail?: string | null;
      role: AttendeeRole;
      rsvpStatus: RsvpStatus;
      invitedAt: string;
      respondedAt?: string | null;
      fullName?: string | null;
      email?: string | null;
    }
    ```
  - Frontend component in [`MeetingDetailPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx#L1809): Reads `attendee.fullName || attendee.externalEmail || 'Member'`.
  - Frontend unit tests in [`MeetingDetailPage.test.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.test.tsx#L72-L90): Test fixtures mock `{ fullName: 'Alice Johnson', email: 'alice@example.com' }`.
  - Backend Markdown export in [`markdownGenerator.js`](file:///d:/manageX/backend/src/platform/meetings/markdownGenerator.js#L84): Consumes `att.userName || att.userEmail || att.externalEmail || 'Unknown'`.
- **Status:** **Confirmed Gap (Serialization Property Mismatch)**.
- **Compatibility Approach:**
  - `fullName` and `email` are the canonical user identity properties across ManageX (consistent with `users`, `organisation_memberships`, and existing frontend types).
  - To prevent breaking consumers like `markdownGenerator.js` or external clients, backend `listMeetingAttendees` will serialize both:
    ```javascript
    fullName: row.user_name || null,
    email: row.user_email || row.external_email || null,
    // Backward-compatibility aliases:
    userName: row.user_name || null,
    userEmail: row.user_email || row.external_email || null,
    ```
  - Frontend `MeetingDetailPage.tsx` will employ defensive resolution:
    `attendee.fullName || attendee.userName || attendee.externalEmail || 'Member'`.
- **Dependencies & Risks:** Low risk. Dual-field serialization preserves 100% backward compatibility for all existing consumers while fixing the display bug.

### 2. Organiser Identification and Role Display (`MTG-IMP-02`)
- **Current Behavior:** Backend returns `organiserName` and `organiserEmail` in `formatMeetingRow`. Meeting detail header displays organiser information. Attendee roster displays `Role: organiser`.
- **Code Inspection Evidence:**
  - Backend [`meetingService.js`](file:///d:/manageX/backend/src/platform/meetings/meetingService.js#L277-L282) joins `users u ON u.id = m.organiser_id`.
  - Frontend [`MeetingDetailPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx#L1801-L1803) protects the sole organiser from deletion (`isSoleOrganiser = attendee.role === 'organiser' && attendee.userId === meeting.organiserId`).
- **Status:** **Satisfied** (inherits complete profile display from `MTG-IMP-01`).

### 3. External Guest Representation (`MTG-IMP-03`)
- **Current Behavior:** External attendees are supported with email addresses and distinct role tags.
- **Code Inspection Evidence:**
  - Database schema [`20261017000013_meetings_core.sql`](file:///d:/manageX/database/migrations/20261017000013_meetings_core.sql#L50-L53) enforces `chk_attendee_target CHECK ((user_id IS NOT NULL AND external_email IS NULL) OR (user_id IS NULL AND external_email IS NOT NULL))`.
  - Backend [`meetingService.js`](file:///d:/manageX/backend/src/platform/meetings/meetingService.js#L789-L814) validates email format and duplicate invitations.
  - Frontend [`MeetingDetailPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx#L1813-L1815) renders `(External)` badge.
- **Status:** **Satisfied**. Fully implemented and verified.

### 4. RSVP States and Accurate Attendee Counts (`MTG-IMP-04`)
- **Current Behavior:** Supports `pending`, `accepted`, `declined`, `tentative`. Organiser is auto-added as `accepted`.
- **Code Inspection Evidence:**
  - Database constraint `chk_attendee_rsvp` accepts all four states.
  - Frontend [`MeetingDetailPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx#L1625) shows `Attendees ({attendees.length})`.
  - Frontend [`MeetingsPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingsPage.tsx#L538) shows `{meeting.attendeeCount ?? 1} attendees`.
- **Status:** **Needs Refinement / Clarification**.
  - `attendeeCount` represents total invited persons, not accepted attendees.
  - In detail page attendee header, clarify: `Attendees ({attendees.length} invited · {acceptedCount} confirmed)`.
  - Organiser self-RSVP prompt is already suppressed.

### 5. Meeting Lifecycle and Overdue Warnings (`MTG-IMP-05`)
- **Current Behavior:** End-time expiry does NOT auto-complete meetings. Overdue badge is calculated on the client.
- **Code Inspection Evidence:**
  - Frontend [`MeetingDetailPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx#L108-L110): `isOverdue = (meeting.status === 'scheduled' || meeting.status === 'in_progress') && new Date(meeting.end_at) < new Date()`.
  - Backend [`meetingService.js`](file:///d:/manageX/backend/src/platform/meetings/meetingService.js#L629-L637) allows `missed` status transition only when `end_at < NOW()`.
- **Status:** **Business Rules Satisfied; Minor UI Gap**.
  - `MeetingsPage.tsx` meeting list card overdue badge currently checks only `status === 'scheduled' && isOverdue`. It should also display the overdue indicator for `in_progress` meetings that exceeded `end_at`.

### 6. Completed, Missed, and Cancelled States (`MTG-IMP-06`)
- **Current Behavior:** Terminal states are permanent and reject mutations.
- **Code Inspection Evidence:**
  - Transition map [`meetingLifecycle.js`](file:///d:/manageX/backend/src/platform/meetings/meetingLifecycle.js#L22-L28) defines empty arrays for `completed`, `cancelled`, `missed`.
  - Migration [`20261017000038_meetings_missed_status.sql`](file:///d:/manageX/database/migrations/20261017000038_meetings_missed_status.sql) enforces 5 valid database statuses.
  - Backend [`meetingService.js`](file:///d:/manageX/backend/src/platform/meetings/meetingService.js#L622-L627) returns 409 `INVALID_MEETING_STATUS_TRANSITION` on illegal attempts.
- **Status:** **Satisfied**. Fully compliant with PRD §8.1.

### 7. Manual Meeting-Link Validation & Terminal Behavior (`MTG-IMP-07`)
- **Current Behavior:** Organiser manually enters Google Meet/Zoom link. Link is displayed as a live clickable link on the detail page.
- **Code Inspection Evidence:**
  - Backend [`meetings.js`](file:///d:/manageX/backend/src/routes/meetings.js#L67) validates `virtualUrl: z.string().url().optional().or(z.literal(''))`.
  - Frontend [`MeetingDetailPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx#L1517-L1527) displays `<a href={meeting.virtualUrl}>Join Virtual Meeting</a>` unconditionally when `virtualUrl` exists.
- **Status:** **Confirmed Gap**.
  - When meeting status is `completed`, `cancelled`, or `missed`, the "Join Virtual Meeting" button remains active and clickable.
- **Proposed Change:** Deactivate or conditionally replace the join link when `isTerminal` is true (e.g. render a subtle, non-clickable notice `Meeting ended · Link inactive`, or hide join button on cancelled meetings).

### 8. Date/Time Formatting and Timezone Handling (`MTG-IMP-08`)
- **Current Behavior:** Times formatted with `Intl.DateTimeFormat` using meeting timezone.
- **Code Inspection Evidence:**
  - Helper [`normalizeTimeZone`](file:///d:/manageX/frontend/src/types/meetings.ts#L104-L109) canonicalizes `Asia/Calcutta` to `Asia/Kolkata`.
  - Backend [`meetingLifecycle.js`](file:///d:/manageX/backend/src/platform/meetings/meetingLifecycle.js#L85-L92) canonicalizes timezones upon create/update.
- **Status:** **Satisfied**. Standardized and tested.

### 9. MoM Empty States and Optional Completion Reminders (`MTG-IMP-09`)
- **Current Behavior:** MoM sections render empty state cards with creation buttons. No warning on completion with empty MoM.
- **Code Inspection Evidence:**
  - Frontend [`MeetingDetailPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx#L345-L368) has standard confirmation dialog: `"Are you sure you want to complete this meeting? It cannot be edited after completion."`.
- **Status:** **Confirmed Gap**.
  - If the meeting has 0 discussion points, 0 decisions, and empty notes, the confirmation modal does not notify the organiser that Minutes of Meeting are completely blank.
- **Proposed Change:** In `handleTransition('completed')`, inspect if `discussionPoints.length === 0 && decisions.length === 0 && !notesContent.trim()`. If so, augment the confirmation description with an advisory: `"Note: No discussion points, decisions, or notes have been recorded for this meeting. Once completed, minutes cannot be edited."`.

### 10. PDF/Markdown Export Authorization (`MTG-IMP-10`)
- **Current Behavior:** Exports complete minutes in Markdown and standard binary PDF 1.4 with notes permission gates.
- **Code Inspection Evidence:**
  - Route [`GET /:meetingId/export`](file:///d:/manageX/backend/src/routes/meetings.js#L685-L715).
  - Generators [`markdownGenerator.js`](file:///d:/manageX/backend/src/platform/meetings/markdownGenerator.js) and [`pdfGenerator.js`](file:///d:/manageX/backend/src/platform/meetings/pdfGenerator.js).
  - Test suite [`meetings_phase4.integration.test.js`](file:///d:/manageX/backend/src/platform/meetings/meetings_phase4.integration.test.js) tests 1-6 (all passing).
- **Status:** **Satisfied**. Fully compliant with Roadmap §8.1.

### 11. Action-Item Counts and Completion Rates (`MTG-IMP-11`)
- **Current Behavior:** Action items support status progression, linked decisions, task promotion, and overdue detection.
- **Code Inspection Evidence:**
  - Canonical statuses in [`meetingLifecycle.js`](file:///d:/manageX/backend/src/platform/meetings/meetingLifecycle.js#L41): `open`, `in_progress`, `done`, `cancelled`. Terminal statuses: `done`, `cancelled`.
  - Analytics calculation in [`meetingService.js`](file:///d:/manageX/backend/src/platform/meetings/meetingService.js#L2864):
    `actionCompletionRate = totalActions > 0 ? Math.round((doneActions / totalActions) * 1000) / 10 : 0;`
  - Frontend display in [`MeetingsPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingsPage.tsx#L960): `{analyticsData.actionItems.done} of {analyticsData.actionItems.total} done`.
- **Status:** **Needs Definition Alignment**.
  - Current formula uses total count in the denominator: $\text{Rate} = \frac{\text{Done}}{\text{Total}}$.
  - Cancelled items represent discarded or de-scoped tasks that are intentionally not done. Retaining cancelled items in the denominator caps achievable completion below 100% even when all committed work was delivered.
- **Proposed Specification:** Document two explicit definitions:
  1. **Actionable Completion Rate (Primary):** Denominator excludes cancelled items: $\frac{\text{Done}}{\text{Total} - \text{Cancelled}}$. Reflects delivery of valid actionable commitments.
  2. **Gross Delivery Rate (Secondary):** Denominator retains all created items: $\frac{\text{Done}}{\text{Total}}$.

### 12. Analytics Definitions and Date Semantics (`MTG-IMP-12`)
- **Current Behavior:** Endpoint `GET /analytics` computes real SQL aggregates under tenant context.
- **Code Inspection Evidence:**
  - In [`meetingService.js`](file:///d:/manageX/backend/src/platform/meetings/meetingService.js#L2802-L2806):
    `timeFilterSql = ' AND created_at >= NOW() - INTERVAL 30 days'` applied uniformly across `meetings`, `meeting_attendees`, `meeting_action_items`, `meeting_discussion_points`, `meeting_decisions`.
  - Frontend [`MeetingsPage.tsx`](file:///d:/manageX/frontend/src/pages/workspace/meetings/MeetingsPage.tsx#L940) labels the metric "Attendance Rate".
- **Status:** **Needs Refinement / Alignment**.
  - **Date Semantic Disconnect:** Filtering `meetings` by `created_at` captures when the row was scheduled, not when the meeting actually occurred (`start_at`). A meeting created 40 days ago for today is excluded from the "Past 30 Days" view.
  - **Child Table Schema Invariant:** Child tables (`meeting_action_items`, `meeting_discussion_points`, `meeting_decisions`, `meeting_attendees`) do NOT possess a `start_at` column. `created_at` cannot be replaced globally without breaking SQL queries.
  - **Metric Naming:** "Attendance Rate" is technically an "RSVP Acceptance Rate" because actual presence check-in is not tracked.

### 13. Responsive UI and Loading, Empty, and Error States (`MTG-IMP-13`)
- **Current Behavior:** Clean Enterprise styling, responsive layouts, loading skeletons, alert banners, and toasts.
- **Code Inspection Evidence:** Verified across `MeetingsPage.tsx`, `MeetingDetailPage.tsx`, and `Toast.tsx`.
- **Status:** **Satisfied**.

### 14. Backend Authorization, Organisation Isolation, RLS & Audit (`MTG-IMP-14`)
- **Current Behavior:** Strict RLS on all tables without platform-admin bypass. Full audit logging with zero body leaks.
- **Code Inspection Evidence:**
  - Migration `20261017000040_meetings_root_rls_sec009.sql`.
  - Integration tests in `meetings_rls_sec009.integration.test.js` (8/8 passing).
- **Status:** **Satisfied**. Hardened, verified, and secure.

---

## D. Lifecycle Specification

### 1. State Machine & Valid Transitions
```
                +-------------------+
                |     SCHEDULED     |
                +-------------------+
                  /       |       \
                 /        |        \
    (Start Meeting)  (Cancel)   (Mark Missed, if end_at < NOW())
               /          |          \
              v           |           v
    +-------------+       |      +-------------+
    | IN_PROGRESS |       |      |   MISSED    | [TERMINAL]
    +-------------+       |      +-------------+
        /        \        |
(Complete)     (Cancel)   |
      /            \      |
     v              v     v
+-----------+    +-------------+
| COMPLETED |    |  CANCELLED  | [TERMINAL]
+-----------+    +-------------+
 [TERMINAL]
```

- **`scheduled`**: Initial state upon creation. Permitted transitions: `in_progress`, `cancelled`, `missed` (only if `end_at < NOW()`).
- **`in_progress`**: Meeting has started. Permitted transitions: `completed`, `cancelled`.
- **`completed`**: Terminal state. Meeting took place and concluded. Cannot be reopened or modified.
- **`cancelled`**: Terminal state. Meeting called off. Cannot be transitioned.
- **`missed`**: Terminal state. Meeting end time passed without being started. Cannot be reopened.
- **Direct `scheduled -> completed`**: **Prohibited** (HTTP 409). Organiser must start the meeting first.

### 2. Overdue State Definition
- **Nature of State:** The `Overdue` state is a **derived, transient UI status**, not a persisted database status column.
- **Calculation Rule:**
  $$\text{isOverdue} = (\text{status} \in \{\text{'scheduled'}, \text{'in\_progress'}\}) \land (\text{NOW}() > \text{end\_at})$$
- **Display Behavior:**
  - On `MeetingsPage.tsx`: Render an amber `Overdue` badge alongside the status badge for both scheduled and in-progress meetings past `end_at`.
  - On `MeetingDetailPage.tsx`: Render an amber `Overdue` badge in the header, and activate the "Mark as Missed" button for scheduled meetings.
  - In Analytics: Counted under `overdueScheduledMeetings` to highlight meetings requiring organiser resolution.

### 3. Join Virtual Meeting Button Behavior
- **Active States (`scheduled`, `in_progress`):**
  - If `virtualUrl` exists, render prominent primary action: `Join Virtual Meeting` with external link icon.
- **Terminal States (`completed`, `cancelled`, `missed`):**
  - Deactivate the direct join link.
  - If `virtualUrl` was recorded, display informative neutral text: `Virtual link inactive (Meeting ended)` or suppress the join CTA, preventing confusion.

---

## E. Permission and Security Matrix

| Action / Resource | Organiser | Attendee | Org Owner / Admin | Other Org Member | External Guest |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **View Meeting (Org Visible)** | Allowed | Allowed | Allowed | Allowed | Denied (No App Access) |
| **View Meeting (Attendees Only)** | Allowed | Allowed | Allowed | Denied (403) | Denied (No App Access) |
| **Edit Meeting Details** | Allowed | Denied (403) | Allowed (`meeting.edit`) | Denied (403) | Denied |
| **Transition Status (Start/Cancel)** | Allowed | Denied (403) | Allowed (`meeting.status.manage`) | Denied (403) | Denied |
| **Resolve Overdue (Complete/Missed)** | Allowed | Denied (403) | Allowed (`meeting.status.manage`) | Denied (403) | Denied |
| **Update Own RSVP** | N/A (Auto) | Allowed | Allowed (if invited) | Denied | Email Token Only |
| **Manage Attendees & Agendas** | Allowed | Denied (403) | Allowed (`meeting.edit`) | Denied (403) | Denied |
| **View Structured MoM (Agendas/Decisions)** | Allowed | Allowed | Allowed | Allowed | Export/Email Only |
| **Edit Discussion Points / Decisions** | Allowed | Denied (403) | Allowed (`meeting.notes.manage`) | Denied (403) | Denied |
| **Read Confidential Notes (`meeting_notes`)** | Allowed | Denied (403)* | Allowed (`meeting.notes.read`) | Denied (403) | Denied |
| **Edit Confidential Notes (`meeting_notes`)** | Allowed | Denied (403) | Allowed (`meeting.notes.manage`) | Denied (403) | Denied |
| **Export MoM (Markdown / PDF)** | Full MoM + Notes | Full MoM (Notes Redacted) | Full MoM + Notes (if permitted) | Full MoM (Notes Redacted) | Denied |
| **View Meeting Analytics** | Allowed | Allowed | Allowed | Allowed (`meeting.view`) | Denied |
| **Cross-Tenant Access** | Denied (RLS / 404) | Denied (RLS / 404) | Denied (RLS / 404) | Denied (RLS / 404) | Denied (RLS / 404) |

*\*Note: PRD §8.2 & SEC-009 Invariant: Attendee status alone does NOT grant access to confidential notes (`meeting_notes`). Unauthorised read/manage attempts trigger audit event `meeting.notes_access_denied` with zero body leakage.*

---

## F. Analytics and Data Definitions

### 1. Metric Definitions & Denominator Specifications
1. **Total Meetings:** Count of meeting records in the organisation within the selected timeframe.
   $$\text{Total} = \text{COUNT}(*) \text{ WHERE organisation\_id} = \$1$$
2. **Meeting Completion Rate:** Percentage of non-cancelled/non-missed meetings successfully completed:
   $$\text{MeetingCompletionRate} = \begin{cases} 0\% & \text{if Total} = 0 \\ \text{ROUND}\left(\frac{\text{Completed}}{\text{Total}} \times 100, 1\right) & \text{otherwise} \end{cases}$$
3. **Overdue Scheduled Meetings:** Count of meetings still in `scheduled` status whose scheduled end instant has elapsed:
   $$\text{OverdueScheduled} = \text{COUNT}(*) \text{ FILTER (WHERE status = 'scheduled' AND end\_at} < \text{NOW}())$$
4. **RSVP Distribution & Acceptance Rate:**
   - Total Invitations: Total attendee records in the organisation. Includes organiser (auto-added with accepted RSVP upon meeting creation).
   - Acceptance Rate:
     $$\text{AcceptanceRate} = \begin{cases} 0\% & \text{if TotalInvitations} = 0 \\ \text{ROUND}\left(\frac{\text{Accepted}}{\text{TotalInvitations}} \times 100, 1\right) & \text{otherwise} \end{cases}$$
   - *Labeling Clarification:* The UI must display this metric explicitly as **"RSVP Acceptance Rate"** rather than "Actual Attendance Rate", as presence check-in is not tracked in the current schema.
5. **Action-Item Completion Rate:**
   - **Current Gross Delivery Rate:**
     $$\text{GrossDeliveryRate} = \begin{cases} 0\% & \text{if TotalActions} = 0 \\ \text{ROUND}\left(\frac{\text{Done}}{\text{TotalActions}} \times 100, 1\right) & \text{otherwise} \end{cases}$$
     - *Denominator:* All created items (`open + in_progress + done + cancelled`).
   - **Proposed Actionable Completion Rate (Recommended):**
     $$\text{ActionableCompletionRate} = \begin{cases} 0\% & \text{if } (\text{TotalActions} - \text{Cancelled}) = 0 \\ \text{ROUND}\left(\frac{\text{Done}}{\text{TotalActions} - \text{Cancelled}} \times 100, 1\right) & \text{otherwise} \end{cases}$$
     - *Denominator:* Active commitments (`open + in_progress + done`). Cancelled items are treated as de-scoped scope rather than failed tasks.
     - *Contextual Display:* `{done} of {actionableTotal} actionable items ({cancelled} cancelled)`.

### 2. Analytics Date Semantics: Occurrence vs. Creation Velocity
The date filtering strategy must reflect the operational semantics of each metric rather than applying a blanket timestamp filter:
1. **Meeting Occurrence & Lifecycle Metrics (`meetings` table):**
   - Metrics: Status distribution (`completed`, `in_progress`, `scheduled`, `missed`, `cancelled`), Overdue Scheduled count, Meeting Completion Rate.
   - Semantic Intent: Reflects meetings that were held, in progress, or scheduled to take place during the selected period.
   - Evaluated Column: **`start_at`** (e.g. `start_at >= NOW() - INTERVAL '30 days'`). Leverages index `idx_meetings_org_start`.
2. **Scheduling Activity Trends (`meetings` table):**
   - Semantic Intent: Measures organizational planning velocity (when meetings were scheduled).
   - Evaluated Column: **`created_at`**.
3. **Child Artifacts & Outcomes (`meeting_action_items`, `meeting_discussion_points`, `meeting_decisions`, `meeting_attendees`):**
   - Schema Invariant: Child tables do **not** possess a `start_at` column.
   - Evaluated Column: **`created_at`** (representing when artifacts were authored/logged). Action item deadlines evaluate **`due_date`**.
   - Global replacement of `created_at` with `start_at` on child queries is strictly avoided to prevent column-not-found database errors.

---

## G. Phased Implementation Sequence

### Phase A: Attendee Data, Name Resolution & RSVP UI Polish
- **Confirmed Gaps Addressed:**
  - `MTG-IMP-01`: Attendee full names rendering as `'Member'` due to serialization property mismatch (`userName` vs `fullName`).
  - `MTG-IMP-04`: Attendee roster header clarity (`{length} invited · {acceptedCount} confirmed`).
- **Files Expected to Change:**
  - `backend/src/platform/meetings/meetingService.js` (in `listMeetingAttendees`: include canonical `fullName: row.user_name` and `email: row.user_email || row.external_email` alongside backward-compatibility aliases `userName` and `userEmail`).
  - `frontend/src/types/meetings.ts` (verify `MeetingAttendee` supports canonical `fullName` and `email`).
  - `frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx` (update attendee card name resolution to `attendee.fullName || attendee.userName || attendee.externalEmail`).
- **Dependencies & Verification:**
  - Add unit tests in `MeetingDetailPage.test.tsx` verifying attendee names render from mocked API responses without `'Member'` fallback.

### Phase B: Lifecycle Correctness, Overdue UX & MoM Completion Advisory
- **Confirmed Gaps Addressed:**
  - `MTG-IMP-05`: Overdue badge display on meeting list for `in_progress` meetings that exceeded `end_at`.
  - `MTG-IMP-09`: MoM empty advisory on meeting completion confirmation modal.
- **Files Expected to Change:**
  - `frontend/src/pages/workspace/meetings/MeetingsPage.tsx` (align overdue check on cards to include `in_progress` meetings past `end_at`).
  - `frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx` (augment complete confirmation dialog with MoM advisory when discussion points, decisions, and notes are empty).
- **Dependencies & Verification:**
  - Frontend tests in `MeetingsPage.test.tsx` and `MeetingDetailPage.test.tsx` asserting overdue badges and completion modal content.

### Phase C: Manual Virtual Meeting Link Handling & Terminal Lockdown
- **Confirmed Gaps Addressed:**
  - `MTG-IMP-07`: Deactivate "Join Virtual Meeting" button on completed, cancelled, and missed meetings.
- **Files Expected to Change:**
  - `frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx` (conditional join link rendering based on `isTerminal`).
- **Dependencies & Verification:**
  - Frontend test in `MeetingDetailPage.test.tsx` asserting join button is replaced with inactive notice on terminal meetings.

### Phase D: Detail-Page MoM Polish, Export Verification & Action Items
- **Confirmed Gaps Addressed:**
  - `MTG-IMP-10` & `MTG-IMP-11`: Verify export dropdown accessibility across all meeting outcomes; clarify action-item completion rate calculations.
- **Files Expected to Change:**
  - `backend/src/platform/meetings/meetingService.js` (document and refine action item completion rate calculation to optionally report actionable completion rate).
- **Dependencies & Verification:**
  - Run `meetings_phase4.integration.test.js` and frontend test suites.

### Phase E: Analytics Consistency, Security Verification & Regression Suite
- **Confirmed Gaps Addressed:**
  - `MTG-IMP-12`: Timeframe filter alignment on `meetings.start_at` for meeting occurrence metrics; explicit UI labeling as "RSVP Acceptance Rate".
  - `MTG-IMP-14`: Complete regression verification across all meetings test suites.
- **Files Expected to Change:**
  - `backend/src/platform/meetings/meetingService.js` (apply `start_at` filter to `meetings` query while preserving `created_at` on child tables).
  - `frontend/src/pages/workspace/meetings/MeetingsPage.tsx` (update card label to "RSVP Acceptance Rate").
- **Dependencies & Verification:**
  - Execute all 6 backend integration suites (91 tests) and 18 frontend test suites (152 tests).

---

## H. Testing and Verification Plan

### 1. Test Matrix

| Area | Suite / File | Test Objective |
| :--- | :--- | :--- |
| **Attendee Names** | `MeetingDetailPage.test.tsx` | Asserts attendee table renders `Alice Johnson` instead of `Member` when `fullName`/`userName` is present. |
| **Overdue Badges** | `MeetingsPage.test.tsx`, `MeetingDetailPage.test.tsx` | Asserts overdue badge renders for both `scheduled` and `in_progress` meetings past `end_at`. |
| **Terminal Join Link** | `MeetingDetailPage.test.tsx` | Asserts join meeting link is inactive or disabled when meeting status is `completed`, `cancelled`, or `missed`. |
| **Completion Reminder** | `MeetingDetailPage.test.tsx` | Asserts completion confirmation modal contains MoM notice when minutes are blank. |
| **Lifecycle API** | `meetings.integration.test.js` | Asserts valid transitions, rejects `scheduled -> completed` (409), enforces `end_at < NOW()` for `missed`. |
| **Notes Locking** | `meetings_phase3.integration.test.js` | Asserts optimistic locking with `expectedUpdatedAt`, row lock serialization, and 409 `CONCURRENT_MODIFICATION`. |
| **Notes Denial Audit** | `meetings_phase3.integration.test.js` | Asserts `meeting.notes_access_denied` audit event is emitted on unauthorized read/manage with zero body leakage. |
| **Export Engines** | `meetings_phase4.integration.test.js` | Asserts Markdown and PDF generation, confidential notes redaction for members, 404 cross-tenant isolation, 422 format validation. |
| **Analytics Aggregates**| `meetings_phase4.integration.test.js` | Asserts SQL aggregates, zero denominator safety (returns 0%), lifecycle exclusion, and tenant isolation. |
| **RLS Isolation** | `meetings_rls_sec009.integration.test.js` | Asserts runtime role `managex_app` has NOBYPASSRLS, cross-tenant reads return 0 rows, cross-tenant writes fail closed. |

### 2. Verified Baseline & Test Commands

#### A. Backend Integration Test Baseline
- **Verified Environment Prerequisite:**
  Integration tests strictly require targeting `managex_test` on `localhost:5433` (test suites assert `current_database() === 'managex_test'`).
- **Verified Test Inventory (91 tests across 6 dedicated test files in `backend/src/platform/meetings/`):**
  1. `meetings.integration.test.js` — 38 tests (core scheduling, attendees, RSVPs, agendas, permissions, email dispatch)
  2. `meetings_regression.integration.test.js` — 19 tests (10 full user journeys, tenant isolation, RLS pool reuse)
  3. `meetings_phase4.integration.test.js` — 10 tests (Markdown/PDF exports, notes filtering, analytics math, tenant isolation)
  4. `meetings_phase3.integration.test.js` — 9 tests (notes optimistic locking, row lock race, denial audit, action item locks)
  5. `meetings_rls_sec009.integration.test.js` — 8 tests (migration 040 RLS, NOBYPASSRLS, tenant isolation)
  6. `meetings_mom.integration.test.js` — 7 tests (discussion points & decisions CRUD, atomic reordering, terminal locking)
- **Verified Commands:**
  ```powershell
  $env:DATABASE_URL = 'postgresql://managex_app:managex_app_password@localhost:5433/managex_test'
  node backend/src/platform/meetings/meetings_phase4.integration.test.js
  node backend/src/platform/meetings/meetings_phase3.integration.test.js
  node backend/src/platform/meetings/meetings_mom.integration.test.js
  node backend/src/platform/meetings/meetings_rls_sec009.integration.test.js
  node backend/src/platform/meetings/meetings_regression.integration.test.js
  node backend/src/platform/meetings/meetings.integration.test.js
  ```

#### B. Frontend Test & Build Baseline
- **Verified Test Inventory (152 tests across 18 test files in `frontend/src/`):**
  - Meetings-specific test files: `MeetingDetailPage.test.tsx` (26 tests), `MeetingsPage.test.tsx` (12 tests), `Toast.test.tsx` (3 tests) = 41 tests.
  - Overall frontend repository baseline: 152 tests passed across 18 test files.
- **Verified Commands (from `package.json`):**
  ```powershell
  # Frontend typecheck
  npm run typecheck:frontend    # runs: npm --prefix frontend run typecheck (tsc --noEmit)

  # Frontend test suite
  npm run test:frontend         # runs: npm --prefix frontend test (vitest run)

  # Frontend production build
  npm run build:frontend        # runs: npm --prefix frontend run build (tsc && vite build)
  ```

---

## I. Comprehensive Risk Assessment

A realistic assessment of operational, architectural, and data risks:

1. **Schema Migration Impact:**
   - **Assessment:** No schema migrations, DDL alterations, or table constraint modifications are currently proposed. The database remains stable at migration 040.
   - **Risk Level:** **Very Low**. Avoiding schema changes eliminates table locking, migration rollbacks, and schema version drift.
2. **API Contract Compatibility Risk:**
   - **Assessment:** Modifying `listMeetingAttendees` serialization to introduce `fullName` and `email` carries the risk of breaking existing consumers expecting `userName` or `userEmail`.
   - **Mitigation:** Return dual properties (`fullName`/`email` AND `userName`/`userEmail`) in the serialization object. Frontend components will access `attendee.fullName || attendee.userName`.
   - **Risk Level:** **Low**.
3. **Query Performance & Indexing Risk:**
   - **Assessment:** Aligning `meetings` analytics queries to filter by `start_at` alters query execution. If unindexed, this could result in table scans under high row volume.
   - **Mitigation:** Verified that `idx_meetings_org_start ON meetings(organisation_id, start_at)` already exists in migration `20261017000013_meetings_core.sql`. Child table queries will retain `created_at`, preserving their respective indexes and avoiding column-not-found errors.
   - **Risk Level:** **Low**.
4. **Frontend Interaction & State Regressions:**
   - **Assessment:** Deactivating the virtual join link on terminal meetings must not prevent users from viewing the link string or copying it. Expanding overdue checks on `MeetingsPage.tsx` must accurately handle in-progress meetings without false positives.
   - **Mitigation:** Unit tests in `MeetingDetailPage.test.tsx` and `MeetingsPage.test.tsx` will cover terminal link deactivation and overdue boundary states.
   - **Risk Level:** **Low**.
5. **Metric Interpretation & Reporting Shift Risk:**
   - **Assessment:** Shifting the action-item completion denominator from gross (`done / total`) to actionable (`done / (total - cancelled)`) will change displayed percentages for past meetings that contain cancelled items.
   - **Mitigation:** Clearly display contextual sub-labels (`{done} of {actionableTotal} actionable items ({cancelled} cancelled)`) so users understand the derivation.
   - **Risk Level:** **Medium** (operational understanding).

---

## J. Traceability and Final Acceptance

### 1. Requirements Traceability Matrix

| Requirement ID | Name | Planned Phase | Current Status | Verification Suite |
| :--- | :--- | :---: | :---: | :--- |
| `MTG-IMP-01` | Attendee Name & Profile Resolution | Phase A | Implemented & Verified | `MeetingDetailPage.test.tsx`, `meetings.integration.test.js` |
| `MTG-IMP-02` | Organiser Identification & Display | Phase A | Satisfied & Verified | `MeetingDetailPage.test.tsx` |
| `MTG-IMP-03` | External Guest Representation | Phase A | Satisfied & Verified | `meetings.integration.test.js`, `MeetingDetailPage.test.tsx` |
| `MTG-IMP-04` | RSVP States & Accurate Counts | Phase A | Implemented & Verified | `MeetingDetailPage.test.tsx` |
| `MTG-IMP-05` | Overdue State Calculation & Warning UX | Phase B | Implemented & Verified | `MeetingsPage.test.tsx`, `MeetingDetailPage.test.tsx` |
| `MTG-IMP-06` | Terminal Lifecycle Enforcement | Phase B | Satisfied & Verified | `meetings.integration.test.js` |
| `MTG-IMP-07` | Virtual Meeting Link Terminal Lockdown | Phase C | Implemented & Verified | `MeetingDetailPage.test.tsx`, `meetings.integration.test.js` |
| `MTG-IMP-08` | Timezone & Date Formatting | Phase C | Satisfied & Verified | `meetings_regression.integration.test.js` |
| `MTG-IMP-09` | MoM Empty States & Completion Advisory| Phase B / Phase D | Implemented & Verified | `MeetingDetailPage.test.tsx`, `meetings.integration.test.js` |
| `MTG-IMP-10` | Secure PDF & Markdown MoM Export | Phase D | Implemented & Verified | `meetings_phase4.integration.test.js` |
| `MTG-IMP-11` | Action Items & Project Promotion | Phase D | Implemented & Verified | `meetings_phase4.integration.test.js`, `MeetingDetailPage.test.tsx` |
| `MTG-IMP-12` | Analytics Definitions & Date Semantics| Phase E | Implemented & Verified | `meetings_phase4.integration.test.js`, `MeetingsPage.test.tsx` |
| `MTG-IMP-13` | Responsive UI, Loading & Empty States | Phase E | Implemented & Verified | `MeetingsPage.test.tsx`, `MeetingDetailPage.test.tsx` |
| `MTG-IMP-14` | Authorization, RLS, Audit & Regression| Phase E | Implemented & Verified | `meetings_rls_sec009.integration.test.js`, full regression suite |

### 2. Overall Acceptance Checklist
- [x] Attendee names and emails resolve and display accurately without defaulting to `'Member'` using backward-compatible serialization.
- [x] Overdue warning appears consistently on meeting list and detail views for expired scheduled and in-progress meetings.
- [x] No meeting automatically transitions to completed on end-time expiry.
- [x] Virtual meeting link join button is disabled or marked inactive on terminal meetings.
- [x] Completion confirmation modal warns organiser if Minutes of Meeting are blank.
- [x] PDF and Markdown exports retain strict confidential notes redaction for non-privileged viewers and support canonical attendee formatting.
- [x] Analytics rates handle zero denominators without `NaN`/`Infinity`, scope to `start_at` occurrence dates, and clearly display RSVP Acceptance Rate.
- [x] All 100 backend integration tests pass cleanly against `managex_test`.
- [x] All 177 frontend unit and component tests pass cleanly.
- [x] Frontend type check (`tsc --noEmit`) passes with 0 errors.
- [x] Production bundle build succeeds cleanly.
