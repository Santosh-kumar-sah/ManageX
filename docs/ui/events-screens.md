# ManageX Events & Hackathons — UI Blueprint & Screen Specification

**Document ID:** MX-UI-EVT-001  
**Version:** 1.0  
**Date:** 22 October 2026  
**Status:** Approved UI Specification Baseline  
**Precedence:** Canonical PRD (`docs/PRD.md`) is authoritative over this document. In the event of any conflict, the PRD and approved Architectural Decision Records (ADRs) govern.

---

## 1. Executive Summary & Architectural Invariants

This blueprint defines the end-to-end user interface architecture for the **Events & Hackathons** module of ManageX. The interface spans two distinct user contexts:
1. **Authenticated Organisation Workspace (`/app/organisations/:orgId/events/*`)**: Staff management interfaces (S1–S8) for event creators, administrators, organizers, and assigned judges.
2. **Public & Participant Portal (`/events/*`)**: Organisation-scoped public event discovery (P1), event detail and registration portal (P2), and the authenticated student/participant dashboard (P3).

### Key Architectural Invariants
- **Clean Enterprise Light Design**: Follows `UI-001` with white/light neutral surfaces (`bg-slate-50`, `bg-white`), restrained indigo/brand accents (`text-brand-600`, `bg-brand-600`), readable sans-serif typography, subtle borders (`border-slate-200`), and zero distracting ornamental animations.
- **Tenant Isolation & RLS**: All staff management data is isolated by `organisation_id` via PostgreSQL Row-Level Security (`ADR-001`, `ADR-002`). Public endpoints evaluate strict visibility filters (`status = 'published'`, `is_public = true`, `ADR-020`).
- **External Participant Access Boundary**: In accordance with `ADR-003` and PRD §5.1 / §7.2, external participants register using a verified ManageX account but **never receive organisation membership**. They can access only their own registrations, their assigned team, and their submitted project.
- **Component Reuse**: 100% of UI controls reuse the existing shared component library in `frontend/src/components/ui/` (`Button`, `Card`, `Badge`, `Input`, `Dialog`, `Table`, `Pagination`, `Alert`, `Skeleton`). No duplicated module-specific component systems.

---

## 2. Screen Inventory & Specification (S1–S8, P1–P3)

```
ManageX Events Screen Architecture
│
├── Workspace Staff Management Area (S1–S8)
│   ├── S1: Events List & Overview (`/app/organisations/:orgId/events`)
│   ├── S2: Create / Edit Event Dialog (Modal Form)
│   ├── S3: Event Management & Lifecycle Hub (`/app/organisations/:orgId/events/:eventId`)
│   │   ├── S4: Participant Roster & Management (Tab)
│   │   ├── S5: Hackathon Teams & Invitations (Tab)
│   │   ├── S6: Competition Rounds & Deliverables (Tab)
│   │   ├── S7: Judge Assignments & Worklist (Tab & Modal)
│   │   └── S8: Scoring Criteria & Results Publication (Tab & Dialog)
│
└── Public & Participant Portal (P1–P3)
    ├── P1: Public Events Directory (`/events` & `/events/:orgSlug`)
    ├── P2: Public Event Detail & Registration Portal (`/events/:eventId` & `/events/:orgSlug/:eventSlug`)
    └── P3: Student / Participant Dashboard (`/events/dashboard`)
```

---

### S1: Events List & Overview
- **Route:** `/app/organisations/:orgId/events`
- **Mounting Context:** `WorkspaceLayout` (Authenticated staff workspace)
- **Target Roles:** `organisation_owner`, `organisation_admin`, `event_admin`, `event_manager`, `viewer`
- **Required Permission:** `event.view` (or org ownership) to view list; `event.create` to display the "Create Event" CTA button.

#### Purpose & Workflows
Serves as the operational landing dashboard for organisation staff to monitor all events within the active tenant. Organisers can search events, filter by lifecycle status, inspect key metrics (type, dates, capacity, registration window), and navigate to detailed management views.

#### UI Layout & Structure
1. **Header & Actions:**
   - Page title: "Events & Hackathons" with subtitle: "Manage your organisation's hackathons, workshops, and gatherings."
   - Action Button: `+ Create Event` (visible only if user holds `event.create`).
2. **Filter & Search Toolbar:**
   - Search Input: Debounced text filter matching event title or description.
   - Status Filter Tabs / Select: All, Draft, Published, Registration Closed, In Progress, Completed, Cancelled, Archived.
   - Event Type Filter: All Types, General Event, Hackathon.
3. **Events Grid / Table:**
   - Card/Row Item containing:
     - Event Title & Type Badge (`General Event` [blue] or `Hackathon` [purple]).
     - Status Badge (`Draft` [slate], `Published` [green], `Registration Closed` [amber], `In Progress` [indigo], `Completed` [teal], `Cancelled` [rose], `Archived` [slate]).
     - Timezone-Aware Dates: Formatted with event IANA timezone (e.g., `Asia/Kolkata`).
     - Location / Virtual indicator: Venue address or "Virtual / Online URL".
     - Active Capacity summary: e.g., "42 / 100 participants".
     - Chevron / Clickable action linking to `S3` (`/app/organisations/:orgId/events/:eventId`).
4. **Pagination Controls:** Server-side pagination (default 20/page, max 100).

#### Screen States
- **Loading:** 4 Skeleton cards simulating layout and badges.
- **Empty:** Clean enterprise empty state with `Calendar` icon: "No events found. Create your first event to get started." + Create Event CTA.
- **Error:** Inline `Alert variant="destructive"` with retry button.
- **Forbidden:** 403 Forbidden alert if organisation has deactivated the `events` module (`MOD-002`, `MOD-004`).

---

### S2: Create / Draft Event Dialog
- **Mounting Context:** Modal dialog launched from `S1` or `S3` (Edit mode)
- **Target Roles:** `organisation_owner`, `organisation_admin`, `event_admin`, `event_manager`
- **Required Permission:** `event.create` (creation) or `event.edit` (updates)

#### Purpose & Workflows
A guided form dialog enabling staff to draft new events or update existing non-terminal event properties. Enforces server-validated constraints prior to commit.

#### Form Fields & Validation Rules
| Field | Type | Rules & Validation |
|---|---|---|
| **Title** | Text Input | Required, 3–150 characters. Normalized. |
| **Slug** | Text Input | Auto-generated from title, editable. Lowercase alphanumeric + hyphens. |
| **Description** | Textarea | Optional, markdown/plain text, max 5,000 characters. |
| **Event Type** | Radio / Select | `general_event` ("General Event") or `hackathon` ("Hackathon"). Fixed after creation. |
| **Visibility** | Radio Group | `public` ("Public — Listed on Portal") or `private` ("Private — Direct link only"). |
| **Timezone** | Combobox | IANA Timezone string (e.g., `UTC`, `America/New_York`, `Asia/Kolkata`). Required. |
| **Start Date & Time** | DateTime Picker | Required UTC instant. Must be in future for new events. |
| **End Date & Time** | DateTime Picker | Required UTC instant. Must be strictly after Start Date & Time. |
| **Registration Opens At** | DateTime Picker | Optional UTC instant. If null, defaults to first publication instant (`ADR-008`). |
| **Registration Closes At** | DateTime Picker | Optional UTC instant. Must be before Event Start. If null, defaults to Start instant. |
| **Capacity Limit** | Number Input | Optional integer $\ge 1$. Null = unlimited capacity. |
| **Location Type** | Select | `in_person`, `virtual`, or `hybrid`. |
| **Venue / Address** | Text Input | Required if `in_person` or `hybrid`. |
| **Virtual URL** | URL Input | Required if `virtual` or `hybrid`. Must be valid `http://` or `https://`. |
| **Team Size (Hackathons)** | Min/Max Inputs | `team_size_min` (default 1) and `team_size_max` ($\le 100$). Enforces min $\le$ max. |
| **Participant Instructions**| Textarea | Optional instructions displayed to confirmed registrants only. |

#### Screen States & Interactions
- **Submitting:** Submit button disabled with spinner (`Creating Event...` / `Saving Changes...`). Prevents duplicate submission (`UI-006`).
- **Validation Failure:** Field-specific red helper text directly below invalid inputs.
- **Success:** Dialog closes immediately; displays toast notification and navigates to `S3`.

---

### S3: Event Management & Lifecycle Hub
- **Route:** `/app/organisations/:orgId/events/:eventId`
- **Mounting Context:** `WorkspaceLayout`
- **Target Roles:** `organisation_owner`, `organisation_admin`, `event_admin`, `event_manager`, `judge`, `viewer`
- **Required Permission:** `event.view` (base view); tab-level actions require granular permissions.

#### Purpose & Workflows
The central administrative hub for managing a specific event. Displays status transitions, copyable public share links, event metrics, and provides sub-navigation into roster management (S4), team management (S5), competition rounds (S6), judge assignment (S7), and scoring/results (S8).

#### UI Layout & Structure
1. **Header Breadcrumbs & Navigation:**
   - Breadcrumbs: `Organisations > [Org Name] > Events > [Event Title]`.
   - Back link returning to `S1`.
2. **Event Header Bar:**
   - Title, Slug, and Type Badge (`General Event` | `Hackathon`).
   - Visibility Badge (`Public` | `Private`).
   - Current Lifecycle Status Badge (`Draft`, `Published`, `Registration Closed`, `In Progress`, `Completed`, `Cancelled`, `Archived`).
   - Action Toolbar:
     - `Copy Shareable Public Link` (Generates clipboard URL to P2: `${origin}/events/${event.id}`).
     - `Edit Event Details` button (opens S2 modal, requires `event.edit`).
3. **Lifecycle Transition Control Panel (`EVT-002`):**
   - Displays legal transition actions according to the deterministic state machine:
     - From `draft`: `Publish Event` (`event.status.manage`) or `Archive`.
     - From `published`: `Close Registration`, `Start Event (In Progress)`, `Cancel Event`, `Archive`.
     - From `registration_closed`: `Start Event (In Progress)`, `Cancel Event`, `Archive`.
     - From `in_progress`: `Complete Event`, `Cancel Event`, `Archive`.
     - From `completed`: `Archive Event`.
     - From `cancelled`: `Archive Event`.
     - `archived`: Terminal status. No further state transitions allowed.
   - Destructive or final transitions (Cancel, Complete, Archive) trigger a confirmation dialog (`ConfirmDialog`).
4. **Tabbed Sub-Navigation:**
   - Tab 1: **Overview & Schedule** (Description, location, IANA timezone, registration window dates).
   - Tab 2: **Participants Roster** (S4).
   - Tab 3: **Hackathon Teams** (S5, conditionally visible if `eventType === 'hackathon'`).
   - Tab 4: **Competition Rounds** (S6, conditionally visible if `eventType === 'hackathon'`).
   - Tab 5: **Judging & Evaluation** (S7, staff assignment panel and judge worklist).
   - Tab 6: **Scores & Results** (S8, scoring criteria configuration and results publication).

---

### S4: Participant Roster & Management (Tab in S3)
- **Mounting Context:** Tab inside `S3` (`/app/organisations/:orgId/events/:eventId?tab=roster`)
- **Target Roles:** `organisation_owner`, `organisation_admin`, `event_admin`, `event_manager`
- **Required Permission:** `event.participant.manage` (Staff only; external participants cannot view roster, `EVT-004`).

#### Purpose & Workflows
Enables staff to inspect all registered attendees, monitor real-time capacity against the maximum limit, search registrants, filter between active registrations and withdrawals, and execute administrative withdrawals.

#### UI Layout & Structure
1. **Capacity Summary Bar:**
   - Metric Cards: Total Registered (`activeRegistrations`), Maximum Capacity (`capacity || 'Unlimited'`), Available Slots.
   - Capacity progress bar with color-coded warning when $>90\%$ capacity.
2. **Roster Search & Filters:**
   - Search input (queries attendee name and normalized email).
   - Status Filter: `All`, `Registered`, `Withdrawn`.
3. **Roster Data Table (`Table` component):**
   - Columns:
     - Participant (Avatar, Full Name, Email).
     - Registration Date (UTC instant formatted in event timezone).
     - Status Badge (`Registered` [green] | `Withdrawn` [slate]).
     - Actions: `Withdraw Participant` button (disabled if already withdrawn).
4. **Administrative Withdrawal Dialog:**
   - Modal warning: "Are you sure you want to administratively withdraw this participant? This action will free 1 capacity slot and will be recorded in the audit log." Requires explicit confirmation.
5. **Pagination:** Server-side pagination (20/page).

---

### S5: Hackathon Teams & Invitations (Tab in S3)
- **Mounting Context:** Tab inside `S3` (Hackathon events only)
- **Target Roles:** `organisation_owner`, `organisation_admin`, `event_admin`, `event_manager`
- **Required Permission:** `event.team.manage` (Staff overview) or active participant team owner (`EVT-006`).

#### Purpose & Workflows
Displays all formed teams for the hackathon. Staff can inspect team compositions, check team sizes against event boundaries (`teamSizeMin` to `teamSizeMax`), monitor invitation token states, and view member roles (Owner vs Member).

#### UI Layout & Structure
1. **Team Statistics Banner:**
   - Total Teams Formed, Average Team Size, Maximum Allowed Team Size (1..100).
2. **Team Cards / Accordion List:**
   - Team Header: Team Name, Creation Date, Current Size / Max Size Badge.
   - Team Owner: Highlighted with `Crown` / `Owner` badge.
   - Member Roster: Table of accepted members with joined timestamps.
   - Pending Invitations: Table of active single-use invitation tokens, invitee email, expiration date (7-day lifetime, `ADR-007`), and revocation control.
3. **Staff Intervention Controls:**
   - Staff with `event.team.manage` can remove members or disband teams if violations occur (all actions audited under `AUD-001`).

---

### S6: Competition Rounds & Deliverables (Tab in S3)
- **Mounting Context:** Tab inside `S3` (Multi-Round Hackathons)
- **Target Roles:** `organisation_owner`, `organisation_admin`, `event_admin`, `event_manager`
- **Required Permission:** `event.edit` or `event.admin`

#### Purpose & Workflows
Enables organizers to structure multi-stage hackathons (e.g., Round 1: Pitch Deck, Round 2: Prototype, Round 3: Finals). Staff configure submission windows, define advancement rules (Top-N, score threshold, or manual selection), and trigger advancement calculations.

#### UI Layout & Structure
1. **Rounds Timeline / Stepper:**
   - Visual numbered sequence: Round 1 $\to$ Round 2 $\to$ Round 3.
   - Status indicators per round: `Draft`, `Active / Accepting Submissions`, `Judging`, `Advancement Complete`.
2. **Round Configuration Drawer / Modal:**
   - Round Name (e.g., "Preliminary Screening").
   - Round Sequence Number (unique, deterministic order).
   - Submission Window: Start instant and End instant.
   - Required Deliverables: Description, required URL types (e.g., repository URL, demo URL, presentation URL).
   - Advancement Rules: `top_n` (e.g., Top 10 advance), `score_threshold` (e.g., score $\ge 75$), or `manual`.
3. **Advancement Execution Modal:**
   - Displays eligible submissions ranked by calculated score.
   - Preview of qualified teams.
   - Button: `Confirm & Advance Selected Teams` (locks current round scores, marks advancing teams eligible for subsequent round).

---

### S7: Judge Assignments & Worklist (Tab in S3 & Dedicated View)
- **Mounting Context:** Tab inside `S3` for managers; simplified view for assigned judges.
- **Target Roles:** `event_admin`, `event_manager` (assignment); `judge` (worklist evaluation).
- **Required Permission:** `event.judge.assign` (to assign); `event.score` (to evaluate assigned work).

#### Purpose & Workflows
Provides two-way functionality:
1. **Organiser Assignment Desk:** Allows staff to assign verified judges to specific submissions or all submissions in a round.
2. **Judge Evaluation Worklist:** Strictly scoped view showing only submissions assigned to the authenticated judge (`EVT-008`).

#### UI Layout & Structure
1. **Assignment Management Panel (Staff View):**
   - Judge Selection: Dropdown of verified users with `judge` role.
   - Submission Assignment Selector: Multi-select submissions or "Assign to All in Round".
   - Current Assignments Table: Judge Name, Assigned Submission, Status (`Pending` | `Scored`), Action to unassign (blocked once scores submitted).
2. **Judge Evaluation Worklist (Judge View):**
   - Header: "My Evaluation Worklist — [Event Title]".
   - List of Assigned Projects: Title, Pitch, Repo URL (`ExternalLink`), Demo URL (`ExternalLink`).
   - Scoring Status Badge: `Needs Evaluation` [amber] or `Completed` [green].
   - CTA Button: `Open Scorecard` (launches S8 scoring drawer/modal).

---

### S8: Scoring Criteria & Results Publication (Tab in S3)
- **Mounting Context:** Tab inside `S3`
- **Target Roles:** `organisation_owner`, `organisation_admin`, `event_admin`, `event_manager`
- **Required Permission:** `event.score.manage` (configure criteria); `event.result.publish` (publish results).

#### Purpose & Workflows
Organizers define criteria (1..100 max score). Once evaluations are completed, the system calculates final rankings using straight sum aggregation (`ADR-009`). Organizers review draft rankings, verify scoring completeness, and execute controlled public release.

#### UI Layout & Structure
1. **Scoring Criteria Configuration Panel:**
   - Table of Criteria: Name (e.g., "Innovation & Technical Complexity"), Description, Maximum Points (1..100).
   - `+ Add Criterion` Button (blocked once scoring begins to preserve competitive integrity, `EVT-008`).
2. **Results Verification & Completeness Audit:**
   - Completeness Warning Banner: If any assigned judge has not completed evaluation, displays amber alert: "Cannot publish results: 3 assigned evaluations are still pending."
   - Button `Publish Results` remains disabled until 100% of required scores are submitted.
3. **Draft Results & Leaderboard Preview:**
   - Table Columns:
     - Rank (1st, 2nd, 3rd, with shared ranks for tied totals, `ADR-009`).
     - Team / Participant Name.
     - Submission Title & Links.
     - Straight Sum Aggregate Score.
4. **Publish Results Confirmation Modal:**
   - Modal warning: "Publishing results will make final scores, ranks, and winner designations visible to all participants and on the public event portal. This action is audited."
   - Confirm CTA: `Publish Results Now` (`POST /api/v1/organisations/:orgId/events/:eventId/publish-results`).
5. **Post-Publication State:**
   - Displays green badge: `Results Published`.
   - Action to unpublish (`Unpublish Results`) with audit trail.

---

### P1: Organisation-Scoped Public Events Directory
- **Route:** `/events` (Global default) and `/events/:orgSlug` (Organisation-scoped)
- **Mounting Context:** `EventPortalLayout` (Public portal shell)
- **Target Audience:** Public visitors, prospective students, external participants
- **Required Permission:** Unauthenticated / Public access.

#### Purpose & Workflows
A welcoming, accessible public portal for visitors and students to discover published events and hackathons hosted by the organisation (`EVT-003`, `ADR-020`). Draft, private, cancelled, or archived events are strictly excluded.

#### UI Layout & Structure
1. **Hero Banner:**
   - Clean header: "Explore Events & Hackathons".
   - Subtitle: "Participate, build innovative solutions, and showcase your skills."
2. **Search & Filter Controls:**
   - Search bar: Real-time debounced query matching event titles and descriptions.
   - Type Pills: `All Events`, `Hackathons`, `General Events`.
3. **Public Event Cards Grid:**
   - Cards display:
     - Organisation Name & Logo/Avatar.
     - Event Title & Type Badge.
     - Date & Time formatted in event IANA timezone.
     - Location: In-Person Venue or "Virtual / Online".
     - Registration Status Badge:
       - `Open for Registration` [green] (within active window).
       - `Registration Opens Soon` [blue] (before opening instant).
       - `Registration Closed` [slate] (after closing instant or max capacity reached).
     - Action CTA: `View Event & Register` $\to$ links to P2.
4. **Empty State:** "No upcoming public events found at this time. Check back soon!"

---

### P2: Public Event Detail & Registration Portal
- **Route:** `/events/:eventId` (UUID/slug) and `/events/:orgSlug/:eventSlug`
- **Mounting Context:** `EventPortalLayout`
- **Target Audience:** Public visitors, registered participants, hackathon teams
- **Required Permission:** Public read for event details; authenticated verified user (`AUTH-002`) for registration and submission actions.

#### Purpose & Workflows
The single authoritative public destination for an event. Visitors can review event details, schedule, and guidelines. Verified users can register, withdraw, re-register, form/join hackathon teams, and submit project URLs.

#### UI Layout & Structure
1. **Header & Context:**
   - Back link: `← Back to Events Directory`.
   - Host Organisation attribution.
   - Event Title, Type, and IANA Timezone badge.
   - Share button: Copies public URL to clipboard with confirmation toast.
2. **Main Content Columns (2/3 width on desktop):**
   - **Overview Section:** Markdown-rendered description and event highlights.
   - **Schedule & Details:** Formatted start/end times and venue/virtual connection links.
   - **Participant Instructions:** Unlocked and displayed only if active user is confirmed registered.
   - **Hackathon Workspace (Conditional for Hackathons):**
     - Team Formation Card: If registered, shows user's team or "Create / Join Team" CTA.
     - Submission Portal: Submission form (Title, Description, Repo URL, Demo URL). Active only during submission window (`EVT-007`).
   - **Published Results / Leaderboard (Conditional):**
     - Rendered only if `resultsPublishedAt` is set (`EVT-009`). Displays winners, final ranks, and submission demo links.
3. **Registration Sidebar Card (1/3 width on desktop, sticky):**
   - **Registration Status Banner:**
     - `Registration Closes: [Formatted Date & Time]`.
     - Capacity Indicator: `Slots Remaining: X / Total` (if capacity limit configured).
   - **Dynamic Action Button (`EVT-004`, `EVT-005`):**
     - If unauthenticated: `Sign In to Register` (links to `/auth/login?redirect=/events/:eventId`).
     - If not registered and window open: `Register for this Event` (one-click with server confirmation).
     - If registered: Green banner `✓ You are registered for this event` + `Withdraw Registration` text button.
     - If withdrawn and window open: `Re-register for Event` (reactivates existing row, `EVT-005`).
     - If registration closed / full: Button disabled with text `Registration Closed` or `Event at Full Capacity`.

---

### P3: Student / Participant Workspace Dashboard
- **Route:** `/events/dashboard`
- **Mounting Context:** `EventPortalLayout` wrapped with `<RequireAuth />`
- **Target Audience:** Authenticated external participants and students
- **Required Permission:** Verified user account (`AUTH-001`, `AUTH-002`). No organisation membership required (`ADR-003`).

#### Purpose & Workflows
A personal participant hub providing students with a unified overview of all events they have registered for across organisations. Students can view registration statuses, team rosters, submission deadlines, round qualifications, and published awards without navigating internal organisation workspaces.

#### UI Layout & Structure
1. **Dashboard Welcome Header:**
   - "My Event Dashboard" with participant name and email badge.
   - Quick stats: `Events Registered`, `Active Hackathon Teams`, `Submissions Delivered`, `Awards Won`.
2. **Participating Events Portfolio:**
   - Card per registered event featuring:
     - Host Organisation name and badge.
     - Event title, dates, and event status badge.
     - Registration Status: `Confirmed` [green] or `Withdrawn` [slate].
     - Direct CTA: `View Event Portal` (links to P2).
3. **Hackathon Team & Submission Status Widget:**
   - Displays current team name, member list, and role (Team Owner / Member).
   - Submission status: `Submitted (v1)` with repo link or `Pending Submission — Due in 14 hours`.
4. **Competition Round Progress Tracker (Multi-round hackathons):**
   - Visual progress bar: Round 1 (Passed) $\to$ Round 2 (In Evaluation) $\to$ Finals.
5. **Published Results & Badges Widget:**
   - Displays podium placement (e.g., "🏆 1st Place Winner", "Top 5 Finalist") when results are published by organizers.

---

## 3. Route Inventory, Precedence & Ownership Matrix

| Route Path | Method / Mode | Scope & Context | Layout Shell | Required Roles / Permissions | Ownership & Component |
|---|---|---|---|---|---|
| `/events` | `GET` (Client) | Public Global Directory | `EventPortalLayout` | Public (Unauthenticated) | `EventsPortalHomePage.tsx` |
| `/events/dashboard` | `GET` (Client) | Participant Dashboard | `EventPortalLayout` | Verified User (`<RequireAuth />`) | `StudentDashboardPage.tsx` |
| `/events/:eventId` | `GET` (Client) | Public Event Detail | `EventPortalLayout` | Public (Unauthenticated) | `PublicEventDetailPage.tsx` |
| `/events/:orgSlug` | `GET` (Client) | Org Public Directory | `EventPortalLayout` | Public (Unauthenticated) | `EventsPortalHomePage.tsx` |
| `/events/:orgSlug/:eventSlug` | `GET` (Client) | Org Event Detail | `EventPortalLayout` | Public (Unauthenticated) | `PublicEventDetailPage.tsx` |
| `/app/organisations/:orgId/events` | `GET` (Client) | Workspace Events List | `WorkspaceLayout` | `event.view` | `EventsPage.tsx` (S1) |
| `/app/organisations/:orgId/events/:eventId` | `GET` (Client) | Workspace Event Hub | `WorkspaceLayout` | `event.view` | `EventDetailPage.tsx` (S3–S8) |
| `/api/v1/events` | `GET` (API) | Public Directory API | JSON Endpoint | Public (`is_public_read = true`) | `events.controller.js:listPublicEvents` |
| `/api/v1/events/:id` | `GET` (API) | Public Event API | JSON Endpoint | Public (`is_public_read = true`) | `events.controller.js:getPublicEvent` |
| `/api/v1/events/my-registrations` | `GET` (API) | Participant Portfolio | JSON Endpoint | Authenticated Session | `events.controller.js:getMyRegistrations` |
| `/api/v1/organisations/:orgId/events` | `GET/POST` (API)| Workspace CRUD | JSON Endpoint | `event.view` / `event.create` | `events.controller.js` |
| `/api/v1/organisations/:orgId/events/:id` | `GET/PATCH` (API)| Event Hub API | JSON Endpoint | `event.view` / `event.edit` | `events.controller.js` |
| `/api/v1/organisations/:orgId/events/:id/status`| `PATCH` (API)| Lifecycle State | JSON Endpoint | `event.status.manage` | `events.controller.js:updateStatus` |
| `/api/v1/organisations/:orgId/events/:id/register`| `POST` (API)| Participant Reg | JSON Endpoint | Authenticated Session | `events.controller.js:registerForEvent` |
| `/api/v1/organisations/:orgId/events/:id/participants`| `GET` (API)| Staff Roster | JSON Endpoint | `event.participant.manage` | `events.controller.js:listParticipants` |
| `/api/v1/organisations/:orgId/events/:id/teams`| `POST/GET` (API)| Teams API | JSON Endpoint | `event.team.create` / Reg User | `teams.controller.js` |
| `/api/v1/organisations/:orgId/events/:id/submissions`| `POST/GET` (API)| Submissions API | JSON Endpoint | Registered Team / User | `submissions.controller.js` |
| `/api/v1/organisations/:orgId/events/:id/judges`| `POST/GET` (API)| Judge Assignments| JSON Endpoint | `event.judge.assign` | `judging.controller.js` |
| `/api/v1/organisations/:orgId/events/:id/scores`| `POST` (API)| Scoring API | JSON Endpoint | `event.score` (Assigned Judge) | `judging.controller.js:submitScores` |
| `/api/v1/organisations/:orgId/events/:id/publish-results`| `POST` (API)| Publish Results| JSON Endpoint | `event.result.publish` | `judging.controller.js:publishResults` |

---

## 4. Route Compatibility & Collision Analysis (`ADR-019`)

### The Ambiguity Challenge
When introducing vanity paths such as `/events/:orgSlug` and `/events/:orgSlug/:eventSlug`, React Router evaluates parameters sequentially. If `/events/:orgSlug` is mounted before `/events/dashboard`, navigating to `/events/dashboard` causes React Router to assign `:orgSlug = 'dashboard'`, triggering an unintended organization lookup and 404 failure.

Furthermore, existing shareable links and automated tests rely on `/events/:eventId` (where `:eventId` is a UUID). If `/events/:orgSlug` is matched against single-segment paths, a UUID could be misinterpreted as an organisation slug.

### Exact Route Precedence & Resolution Rules
To eliminate collision and guarantee 100% backward compatibility:
1. **Explicit Static Paths First:** `/events/dashboard` is declared with higher precedence than dynamic parametric paths.
2. **Single-Segment Disambiguation:**
   - Single segment path `/events/:param` is evaluated dynamically:
     - If `:param` matches UUID format (`/^[0-9a-f]{8}-[0-9a-f]{4}-...$/i`), it resolves directly to `PublicEventDetailPage` by ID (preserving existing share links).
     - Otherwise, it resolves as an organisation public directory (`/events/:orgSlug`).
3. **Two-Segment Vanity Paths:** `/events/:orgSlug/:eventSlug` cleanly maps to `PublicEventDetailPage` using organization and event slugs.
4. **Reserved Slugs:** The following slugs are globally reserved and forbidden from organisation slug registration: `dashboard`, `app`, `platform`, `admin`, `api`, `auth`, `public`, `login`, `register`.

---

## 5. Role-Based Access Control (RBAC) & Permission-to-Tab Matrix

In accordance with PRD §6.3 (`RBAC-001`–`RBAC-004`) and `docs/security.md`, permissions are verified on the backend for every request. UI controls adapt based on assigned permissions:

| Permission Key | Scope | Granted Roles (Default) | UI Surfaces & Controls Enabled |
|---|---|---|---|
| `event.view` | Organisation | Owner, Admin, Event Admin, Event Manager, Viewer | View S1 (Event List) and S3 (Event Overview Tab). |
| `event.create` | Organisation | Owner, Admin, Event Admin, Event Manager | Displays `+ Create Event` button on S1; enables S2 Dialog. |
| `event.edit` | Organisation | Owner, Admin, Event Admin, Event Manager | Enables `Edit Event Details` button on S3; updates S2 fields. |
| `event.status.manage`| Organisation | Owner, Admin, Event Admin, Event Manager | Enables lifecycle transition buttons (Publish, Close Reg, Cancel, Complete, Archive). |
| `event.participant.manage`| Organisation | Owner, Admin, Event Admin, Event Manager | Unlocks S4 (Roster Tab), attendee search, and withdrawal dialog. |
| `event.team.manage` | Organisation | Owner, Admin, Event Admin, Event Manager | Unlocks S5 (Team Roster Tab) and member moderation controls. |
| `event.judge.assign` | Organisation | Owner, Admin, Event Admin, Event Manager | Unlocks S7 (Judge Assignment Panel) to assign judges. |
| `event.score.manage` | Organisation | Owner, Admin, Event Admin, Event Manager | Unlocks S8 (Add/Edit Criteria) before scoring starts. |
| `event.score` | Resource (Judge) | Assigned Judge | Enables scoring inputs in S7/S8 for assigned submissions. |
| `event.result.publish`| Organisation | Owner, Admin, Event Admin | Unlocks `Publish Results` and `Unpublish Results` modals on S8. |
| *No Org Permission* | Participant | External Verified User | Can view P1, P2; can register, withdraw own reg, form own team, submit URLs, and view P3 dashboard. |

---

## 6. Public Data Exposure Allowlist vs Excluded Sensitive Fields (`ADR-020`)

To enforce `EVT-003`, `SEC-004`, and `SEC-005`, public responses from `/api/v1/events/*` adhere to a strict property allowlist. Backend serialization filters out all internal and confidential properties:

### Explicit Public Response Allowlist
- `id`: Event UUID
- `slug`: Public URL slug
- `title`: Event name
- `description`: Public description text
- `eventType`: `general_event` or `hackathon`
- `status`: `published` (only published events are returned)
- `visibility`: `public`
- `startAt` & `endAt`: UTC timestamps
- `timezone`: IANA timezone string
- `locationType`: `in_person`, `virtual`, or `hybrid`
- `location`: Venue address (for in-person/hybrid events)
- `virtualUrl`: Video/stream URL (for virtual/hybrid events)
- `registrationOpensAt` & `registrationClosesAt`: Effective registration boundaries
- `capacity`: Maximum participants limit (or null)
- `teamSizeMin` & `teamSizeMax`: Allowed team bounds (for hackathons)
- `resultsPublishedAt`: Instant when results were officially released (or null)
- `organisation`: Public host summary (`{ id, name, slug }`)
- `publishedResults`: Array of winner leaderboards (included **only** when `resultsPublishedAt IS NOT NULL`)

### Categorical Public Exclusion List (Strictly Redacted)
- ❌ **Draft, Cancelled, Archived, or Private Events:** Categorically 404 on public routes.
- ❌ **Internal Notes & Instructions:** Staff-only notes and pre-registration instructions.
- ❌ **Full Participant Roster & PII:** Names, emails, and student IDs of other attendees.
- ❌ **Unpublished Scores & Raw Criteria Points:** Individual judge ratings and private comments prior to official publication (`EVT-008`).
- ❌ **Judge Personal Identities:** Judge profile details prior to results publication.
- ❌ **Internal Database Identifiers:** Foreign keys, internal sequence numbers, and database metadata.
- ❌ **Audit Trail Records:** Actor IPs, correlation IDs, and operational audit events (`AUD-003`).

---

## 7. UI Design System, Screen States & Shared Component Reuse

### Clean Enterprise Styling Tokens
- **Surfaces:** Pure white (`bg-white`) for cards and dialogs; cool neutral canvas (`bg-slate-50`) for page backgrounds.
- **Accents:** Indigo brand primary (`text-brand-600`, `bg-brand-600`, `hover:bg-brand-700`).
- **Typography:** Inter or system sans-serif font stack. Clear weight hierarchy: `font-bold` for headings, `font-medium` for table headers and labels, `font-normal` for body copy.
- **Borders & Radii:** Subtle border rules (`border border-slate-200`); standard radius `rounded-lg` (8px) for cards and inputs.
- **Elevation:** Restrained enterprise drop-shadows (`shadow-sm` on cards; `shadow-lg` on modals). Zero heavy glassmorphism.

### Shared Component Reuse Catalogue
All screens reuse components from `@/components/ui/`:
1. `Button`: Variants `primary`, `secondary`, `outline`, `destructive`, `ghost`. Sizes `sm`, `md`, `lg`.
2. `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`: Structured container blocks.
3. `Badge`: Variants `default`, `success`, `warning`, `destructive`, `secondary`.
4. `Input`, `Textarea`, `Select`: Accessible form controls with visible focus rings (`focus:ring-2 focus:ring-brand-500`).
5. `Dialog`, `ConfirmDialog`: Modal windows with focus trapping and ESC-key dismiss.
6. `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`: Responsive tabular data.
7. `Pagination`: Accessible page navigation with previous/next and page numbers.
8. `Alert`: Banner notifications for `info`, `warning`, `destructive`, `success`.
9. `Skeleton`: Animated placeholder loading state.

### Standard Screen States
- **Loading State:** Render structured skeletons mimicking final layout; avoid uninformative spinner-only full-page blocks.
- **Empty State:** Informative illustration/icon, clear explanation text, and prominent primary call-to-action button.
- **Error State:** Dismissible or recoverable alerts with explicit error message and "Try Again" trigger.
- **Forbidden State (403):** Informative enterprise banner explaining missing permission or deactivated module.
- **Not Found State (404):** Clean not-found card with return navigation to directory or dashboard.
- **Form Submission State:** Inputs locked; action buttons transition to disabled state with loading indicator. Prevents race conditions and double submission.

### Accessibility Standards (WCAG 2.2 AA)
- Visible focus indicator (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`).
- Contrast ratio $\ge 4.5:1$ for normal text and $\ge 3:1$ for large text/icons.
- Accessible dialogs using `aria-modal="true"` and `aria-labelledby`.
- Interactive icon buttons include `aria-label` or screen-reader accessible text (`sr-only`).
- Status badges do not rely on color alone; every badge includes descriptive text (e.g., `Draft`, `Published`).

---

## 8. Implementation Phase Mapping

The UI screens map directly to the phased implementation plan:

| Phase | Milestone Name | Screen Scope & Deliverables |
|---|---|---|
| **Phase 6A** | Event Model & Lifecycle Core | **S1** (Events List), **S2** (Create/Edit Modal), **S3** (Overview Tab & Lifecycle Control Panel). Core 7-status transitions. |
| **Phase 6B-1**| Public Discovery & Registration | **P1** (Public Directory), **P2** (Public Event Detail & Registration Card), **S4** (Staff Participant Roster Tab). Concurrency-safe registration and capacity locking. |
| **Phase 6B-2**| Participant Dashboard | **P3** (Student Dashboard: Portfolio, Registration Status, Direct Links). |
| **Phase 6C** | Teams & URL Submissions | **S5** (Staff Team Tab), **P2** Hackathon Sub-views (Team Creation/Invitations, URL Submission Form). |
| **Phase 6D** | Judging, Scoring & Results | **S6** (Multi-Round Engine), **S7** (Judge Assignment & Worklist), **S8** (Scoring Criteria, Aggregate Straight-Sum Rankings, Controlled Results Publication). |

---

## 9. Requirements Traceability Matrix

| Requirement ID | Description | UI Screen(s) | Verified Status |
|---|---|---|---|
| `EVT-001` | Event model, create/edit, UTC instants & timezones | **S1, S2, S3** | VERIFIED (`events.integration.test.js`) |
| `EVT-002` | Canonical 7-status lifecycle with transition guard | **S3** | VERIFIED (`events.integration.test.js`) |
| `EVT-003` | Time, visibility, and public data filtering | **P1, P2** | VERIFIED (`PublicEventDetailPage.test.tsx`) |
| `EVT-004` | Registration workflow & external participant boundary | **P2, S4** | VERIFIED (`registrations.integration.test.js`) |
| `EVT-005` | Registration window, capacity lock & uniqueness | **P2, S4** | VERIFIED (`registrations.integration.test.js`) |
| `EVT-006` | Hackathon teams (min/max 1..100, single-use invites) | **S5, P2** | VERIFIED (`teams_submissions.integration.test.js`)|
| `EVT-007` | URL-based submissions (no file uploads) | **P2, S6** | VERIFIED (`teams_submissions.integration.test.js`)|
| `EVT-008` | Judge assignments, criteria (1..100) & private scoring | **S7, S8** | VERIFIED (`judging_results.integration.test.js`) |
| `EVT-009` | Result calculation (straight sum) & publication | **S8, P2, P3** | VERIFIED (`judging_results.integration.test.js`) |
| `EVT-010` | Multi-round hackathon engine & advancement | **S6, P2, P3** | VERIFIED (`advancement.integration.test.js`) |
| `UI-001`–`UI-009`| Clean enterprise light theme, shared components, WCAG AA| **All Screens**| VERIFIED (`WorkspaceLayout`, `EventPortalLayout`) |
| `RBAC-001`–`004`| Scoped authorization, permission catalogue, fail closed | **S1–S8** | VERIFIED (`security.test.js`, RouteGuards) |
| `SEC-001`–`005`| Tenant isolation, RLS fail-closed, public allowlist | **P1, P2, S1–S8**| VERIFIED (PostgreSQL RLS Policies) |

---

## 10. Summary of Reconciled Architectural Decisions

1. **Route Precedence & Backward Compatibility (`ADR-019`)**:
   - Explicit precedence ensures `/events/dashboard` is evaluated before any parametric `:orgSlug` route.
   - Single segment `:param` dynamically disambiguates UUIDs from organisation slugs, ensuring all existing `/events/:eventId` links continue to function without breaking changes.
2. **Organisation-Scoped Public Discovery (`ADR-020`)**:
   - Public portal listings filter strictly by organisation slug where provided; fallback directory `/events` lists published public events without exposing private tenant records.
   - External participants operate entirely within the public/participant boundary (`EventPortalLayout`) without organisation membership.
