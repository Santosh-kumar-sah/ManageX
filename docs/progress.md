# ManageX Progress Tracking

This document tracks progress across implementation phases, completed requirements, and current phase gates.

---

## Phase 1B.5 (Google Meet Integration): Meetings UI & Join Gateway Integration

- **Objective & Status:**
  - Implemented the authenticated Join Gateway backend endpoint and frontend conferencing provider integration under the governing canonical specification `docs/google-meet-integration-plan.md` (Revision 2.5, Sections 10.2, 10.3, 11.3, 12).
  - Securely encapsulated meeting links behind the authenticated gateway `GET /api/v1/organisations/:orgId/meetings/:meetingId/join`.
  - Implemented terminal state lockdown (`completed`, `cancelled`, `missed` reject join requests with HTTP 409 `MEETING_TERMINAL_STATE`).
  - Enforced status invariance (joining a meeting never mutates `scheduled` or `in_progress` status).
  - Enforced strict URL scheme safety (`http:` / `https:` allowed; blocks `javascript:`, `data:`, `vbscript:`, protocol-relative `//` URLs with HTTP 422 `INVALID_URL_SCHEME`).
  - Emitted immutable audit event `meeting.joined` upon every successful join request.
  - Extended frontend UI with conferencing provider selector ("Google Meet (Automatic)" vs "Manual Link") in `ScheduleMeetingDialog.tsx` with dynamic Google Workspace connection status checks.
  - Implemented Google Meet sync status alert banners (`pending_create`, `failed_create` with "Retry Link" CTA button, `abandoned`) and synced badges in `MeetingDetailPage.tsx`.
  - Fully verified all backend join integration tests (8/8 pass), orchestration tests (15/15 pass), meetings suite (41/41 pass), frontend typecheck (0 errors), and frontend unit tests (184/184 pass across 19 test files).

- **Backend Components Implemented:**
  - `backend/src/platform/meetings/meetingService.js`:
    - `getMeetingJoinUrl(orgId, meetingId, actorId)`: Fetches meeting within tenant transaction, verifies active membership & module entitlement, enforces `attendees_only` access check, blocks terminal states with 409 `MEETING_TERMINAL_STATE`, validates sanitized URL scheme with 422 `INVALID_URL_SCHEME`, preserves status invariance, logs `meeting.joined` audit event, and returns `{ joinUrl, conferenceProvider, meetingId }`.
  - `backend/src/routes/meetings.js`:
    - Mounted `GET /:meetingId/join` under the meetings router with `requireOrgMembership` and `requireModuleEntitlement('meetings')`.
  - `backend/src/platform/meetings/meetings_join.integration.test.js`:
    - Comprehensive test suite covering 8 test scenarios:
      1. Valid 200 response with Google Meet URL for organisation-visible meeting.
      2. 401 unauthenticated rejection.
      3. `attendees_only` visibility enforcement (non-attendee receives 403, attendee receives 200).
      4. Terminal state lockdown: completed, cancelled, missed return 409 `MEETING_TERMINAL_STATE`.
      5. Status invariance: joining never mutates meeting status.
      6. Scheme safety: blocks dangerous schemes (`javascript:`, `data:`, relative URLs).
      7. 404 `MEETING_LINK_NOT_FOUND` when link is missing or empty.
      8. Immutable `meeting.joined` audit log emission.

- **Frontend Components Implemented & Extended:**
  - `frontend/src/types/meetings.ts`:
    - Extended `MeetingItem` with `conferenceProvider?: ConferenceProvider`, `googleEventId?: string | null`, `googleSyncStatus?: GoogleSyncStatus`, `googleSyncError?: string | null`, `googleSyncAttempts?: number`.
    - Added `ConferenceProvider` and `GoogleSyncStatus` union types.
  - `frontend/src/pages/workspace/meetings/ScheduleMeetingDialog.tsx`:
    - Fetches Google Workspace integration status (`/integrations/google/status`).
    - Renders Conferencing Provider selector with "Google Meet (Automatic)" (disabled when not connected with warning) and "Manual Link".
    - Omits manual URL input requirement when "Google Meet (Automatic)" is selected; submits `conferenceProvider: 'google_meet'` in payload.
  - `frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx`:
    - Banners rendered based on `meeting.googleSyncStatus`:
      - `pending_create` / `pending_update`: In-progress pulsing banner "Generating Google Meet conferencing link...".
      - `failed_create` / `failed_reschedule`: Warning banner with error details and "Retry Link" CTA button wired to `POST /meetings/:meetingId/sync-google`.
      - `abandoned`: Revocation / expiry banner directing administrators to reconnect in Settings.
    - Synced badge rendered for active Google Meet meetings.
    - Join CTA wired through authenticated backend join gateway `handleJoinMeeting` with popup launch upon verification.
  - `frontend/src/pages/workspace/meetings/ScheduleMeetingDialog.test.tsx`:
    - Verified dialog rendering, provider options, disabled state when disconnected, and modal close behavior.
  - `frontend/src/pages/workspace/meetings/MeetingDetailPage.test.tsx`:
    - Added tests for `pending_create`, `failed_create` with retry CTA, `abandoned`, and `synced` badges.

- **Verification Results:**
  - `backend/src/platform/meetings/meetings_join.integration.test.js`: **8/8 tests passed** on `managex_test`.
  - `backend/src/platform/integrations/googleMeet.test.js`: **15/15 tests passed** on `managex_test`.
  - `backend/src/platform/database/google_integrations_rls.integration.test.js`: **18/18 tests passed** on `managex_test`.
  - `backend/src/platform/common/crypto.test.js`: **42/42 tests passed**.
  - `backend/src/platform/meetings/meetings.integration.test.js`: **41/41 tests passed** on `managex_test`.
  - `npm run typecheck:frontend`: **0 errors (clean pass)**.
  - `npm run test:frontend`: **184/184 tests passed across all 19 test files**.

- **Verdict & Gate:** **PHASE 1B.5 COMPLETE**. Awaiting explicit authorization before starting Phase 1B.6 (Full Regression & Security Audit).

---

## Phase 1B.4 (Google Meet Integration): Google Calendar Client & Meet Orchestration Service

- **Objective & Status:**
  - Implemented the Google Calendar API v3 HTTPS gateway client and Google Meet orchestration engine under the governing canonical specification `docs/google-meet-integration-plan.md` (Revision 2.5, Sections 3.2 #3 & #4, 5, 6, 7.2, 11.3).
  - Enforced strict Option A Pure Conferencing Container guarantees (`attendees: []`, `sendUpdates=none`).
  - Implemented the Two-Stage Decoupled Pattern (zero open database transactions across external HTTP calls) with 45-second atomic lease claims (`google_sync_claim_token`).
  - Implemented deterministic Base32hex event ID derivation (`meet{cleanUuid}`) with conflict reconciliation probing on 409 and retry.
  - Implemented in-flight cancellation compensation (`events.delete`), optimistic concurrency via `If-Match: etag`, and graceful abandonment on revoked credentials.
  - Successfully verified all unit, RLS, OAuth, meetings integration, and frontend test suites with 100% pass rate.
- **Backend Components Implemented:**
  - `backend/src/platform/integrations/googleCalendarClient.js`:
    - `createCalendarEvent`: Dispatches `POST /calendars/primary/events?conferenceDataVersion=1&sendUpdates=none` with deterministic `id` and Option A payload. Enforces 8s timeout, bounded 1-retry backoff for 429/503, and extracts `hangoutLink` or video `entryPoints`.
    - `getCalendarEvent`: Dispatches `GET /calendars/primary/events/:eventId` returning parsed event or `null` on 404/410.
    - `patchCalendarEvent`: Dispatches `PATCH /calendars/primary/events/:eventId?sendUpdates=none` with `If-Match: etag`.
    - `deleteCalendarEvent`: Dispatches `DELETE /calendars/primary/events/:eventId?sendUpdates=none`, idempotently treating 200, 204, 404, and 410 as successful deletion.
  - `backend/src/platform/integrations/googleMeetService.js`:
    - `deriveGoogleEventId`: Converts meeting UUID to 36-char Base32hex ID (`meet[0-9a-f]{32}`).
    - `acquireMeetingSyncLease`: Atomically acquires 45-second claim lease with single-transaction lock.
    - `syncMeetingWithGoogle`: Two-Stage Decoupled sync orchestrator handling `pending_create`, `pending_update`, and `pending_delete` lifecycle states with lease renewal and reconciliation.
    - In-flight cancellation compensation: Detects status mutations to `cancelled` while external HTTP calls were in progress and dispatches compensation `deleteCalendarEvent`.
    - Upstream revocation handling: Marks sync state `abandoned` when credentials have been revoked, preventing infinite retry loops.
  - `backend/src/platform/meetings/meetingService.js`:
    - Updated `formatMeetingRow`: Added `conferenceProvider`, `googleCalendarEventId`, `googleCalendarEtag`, `googleConferenceRequestId`, `googleSyncStatus`, `googleSyncError`, and `googleSyncLastAttemptAt`.
    - Updated `createMeeting`: Accepts `conferenceProvider` (`'manual'`, `'google_meet'`, `'none'`), sets initial `google_sync_status = 'pending_create'`, and fires asynchronous post-commit sync dispatch.
    - Updated `updateMeeting`: Detects rescheduling of start/end/timezone/title, marks `pending_update`, and fires post-commit sync dispatch.
    - Updated `transitionMeetingStatus`: When transitioning to `cancelled`, marks `pending_delete` and dispatches post-commit calendar deletion.
  - `backend/src/routes/meetings.js`:
    - Updated `createMeetingSchema`: Added `conferenceProvider` enum validation.
    - Added route `POST /api/v1/organisations/:orgId/meetings/:meetingId/sync-google`: On-demand retry endpoint protected by `requireOrgMembership`, `requireModuleEntitlement('meetings')`, and fail-closed permission check (`meeting.edit` permission or meeting organiser).
- **Test & Verification Results:**
  - `backend/src/platform/integrations/googleMeet.test.js`: **15/15 passing tests** (5 Calendar API gateway tests, 8 sync engine and lifecycle integration tests on `managex_test`, 2 Express sync route authorization tests).
  - `backend/src/platform/common/crypto.test.js`: **37/37 passing tests**.
  - `backend/src/platform/database/google_integrations_rls.integration.test.js`: **18/18 passing tests**.
  - `backend/src/platform/integrations/googleOAuth.test.js`: **23/23 passing tests**.
  - `backend/src/platform/meetings/meetings.integration.test.js`: **41/41 passing tests**.
  - `npm run typecheck:frontend`: **0 errors (passed cleanly)**.
  - `npm run test:frontend`: **177/177 passing tests across all 18 test files**.
- **Verdict & Gate:** **PHASE 1B.4 COMPLETE**. Awaiting explicit authorization before starting Phase 1B.5.

---

- **Objective & Status:**
  - Implemented the Google OAuth 2.0 authorization, callback, token exchange, encrypted persistence, and disconnect lifecycle under the governing specification `docs/google-meet-integration-plan.md` (Revision 2.5).
  - Implemented the Clean Enterprise frontend workspace settings UI tab for managing Google Workspace integration status.
  - Successfully verified all unit and integration tests across crypto, RLS, and OAuth routes with 100% pass rate.
- **Backend Components Implemented:**
  - `backend/src/platform/integrations/googleOAuthService.js`:
    - `cryptoEnvelopeToRow` and `rowToCryptoEnvelope`: Bidirectional adapter functions mapping camelCase crypto envelopes to PostgreSQL snake_case columns (`encrypted_refresh_token`, `token_iv`, `token_auth_tag`, `key_version`).
    - `generateOAuthState`: Generates cryptographically secure 32-byte state tokens and cookie nonces, hashes tokens with SHA-256, and stores single-use state in `oauth_states` under user-isolated RLS.
    - `buildAuthorizationUrl`: Constructs Google OAuth authorization URL enforcing `access_type=offline`, `prompt=consent`, and `https://www.googleapis.com/auth/calendar.events` scope.
    - `consumeOAuthStateAndVerifyPermission`: Validates anti-CSRF double-submit cookie nonce, atomically consumes single-use state token, executes safe two-phase context transition (user-context state query -> tenant-context membership and permission check under `managex_app` with `NOBYPASSRLS`), and burns state token on permission failure to prevent state re-use.
    - `exchangeCodeForTokens`: Exchanges authorization code via Google OAuth token endpoint with robust error mapping.
    - `getGoogleUserInfo`: Retrieves authenticated user's email address from Google UserInfo endpoint.
    - `saveGoogleCredentials`: Encrypts refresh tokens with AES-256-GCM via `crypto.encrypt()`, preserves existing refresh tokens on re-authorization if Google omits the token, upserts into `organisation_integrations`, and records audit event `integration.connected`.
    - `getGoogleIntegrationStatus`: Queries integration status with zero secret column exposure.
    - `disconnectGoogleIntegration`: Invokes Google token revocation endpoint, sets local credentials to `NULL` (erasing encrypted tokens, IVs, tags), marks status `revoked`, and logs `integration.disconnected`.
    - `refreshAccessToken`: Decrypts refresh token, requests fresh access token, and gracefully handles `invalid_grant` revocation errors.
  - `backend/src/routes/integrations.js`:
    - `orgIntegrationsRouter`: Mounted at `/api/v1/organisations/:orgId/integrations`. Endpoints:
      - `GET /google/authorize`: Requires active org membership and `org.update` permission. Issues state token and sets HttpOnly `managex_oauth_nonce` cookie.
      - `GET /google/status`: Requires active org membership (`org.read`). Returns safe status payload with zero secrets exposed.
      - `POST /google/disconnect`: Requires active org membership and `org.update` permission, CSRF protected. Erases credentials and revokes tokens.
    - `globalIntegrationsRouter`: Mounted at `/api/v1/integrations`. Endpoints:
      - `GET /google/callback`: Validates double-submit nonce cookie, verifies caller permission, exchanges authorization code, encrypts and stores credentials, clears nonce cookie, and redirects user to frontend settings tab with success/error parameters.
  - `backend/src/platform/middleware/logger.js`:
    - Extended sensitive key redaction patterns to redact `token_iv`, `token_auth_tag`, `encrypted_refresh_token`, `ciphertext`, `iv`, `tag`, and `encryptedToken`.
- **Frontend Components Implemented:**
  - `frontend/src/pages/workspace/settings/IntegrationsSettingsTab.tsx`:
    - Clean Enterprise light UI matching ManageX design guidelines.
    - Integration card with Google logo, connected email, connection timestamp, and Option A Privacy Notice badge ("Option A Privacy: ManageX only requests calendar.events scope. ManageX never accesses, reads, or syncs your personal emails, Google Drive, or contacts.").
    - Interactive "Connect Google Workspace" button with redirect and loading states.
    - Disconnect confirmation dialog preventing accidental disconnects.
    - Tab-level success/error alert banners reacting to callback URL parameters (`?tab=integrations&google_success=true` or `&google_error=...`).
  - `frontend/src/pages/workspace/OrgSettingsPage.tsx`:
    - Added tab bar navigation ("General" and "Integrations") supporting `?tab=integrations` URL query parameter.
- **Verification & Test Results:**
  - `backend/src/platform/integrations/googleOAuth.test.js`: **23/23 tests passed cleanly (100%)** on `managex_test`:
    - Section 1: Crypto Envelope <-> Database Row Adapter (4/4 tests).
    - Section 2: Authorization URL Builder (1/1 test).
    - Section 3: External HTTP Gateway Token Exchange & Revocation (4/4 tests).
    - Section 4: Database RLS, State Lifecycle & Tenant Elevation (8/8 tests).
    - Section 5: Express Integration Routes & Authorization Guards (6/6 tests).
  - `backend/src/platform/common/crypto.test.js`: **37/37 tests passed**.
  - `backend/src/platform/database/google_integrations_rls.integration.test.js`: **18/18 tests passed**.
  - `npm run typecheck:frontend`: **0 errors (passed cleanly)**.
  - `npm run test:frontend`: **177/177 tests passed across all 18 test files**.
- **Verdict & Gate:** **PHASE 1B.3 COMPLETE**. Awaiting explicit authorization before starting Phase 1B.4.

---

## Phase 1B.2 (Google Meet Integration): Database Migration & RLS Isolation

- **Objective & Status:**
  - Implemented database migration `database/migrations/20261017000041_google_integrations.sql` establishing the foundation for Google Calendar/Meet integration, OAuth state management, and meeting synchronization.
  - Successfully verified and applied migration 041 across BOTH local databases: `managex` (development) and `managex_test` (test). Production and Neon were completely untouched.
- **Pre-Implementation Compatibility Audit:**
  - Audited `backend/src/platform/common/crypto.js` against database column representations.
  - Mapped envelope `version` (int) to `envelope_version INT DEFAULT 1`.
  - Mapped `keyVersion` (string) to `key_version VARCHAR(64) DEFAULT '1'` (supporting string keys like `'1'`, `'v1'`).
  - Mapped 12-byte IV (24 hex characters) and 16-byte GCM tag (32 hex characters) to `token_iv VARCHAR(64)` and `token_auth_tag VARCHAR(64)`.
  - Mapped ciphertext hex to `encrypted_refresh_token TEXT`.
- **Database Schema & Constraints Implemented:**
  - `oauth_states`: Stores ephemeral, single-use state tokens bound to initiating user and organisation with unique `token_hash`, indexed on lookup and expiry. Forced RLS with `oauth_states_user_isolation` policy under `managex_app`.
  - `organisation_integrations`: Stores tenant credentials with unique `(organisation_id, provider)`. Check constraint `chk_credentials_status` ensures active `'connected'` integrations require complete cryptographic credentials (`encrypted_refresh_token`, `token_iv`, `token_auth_tag`), while allowing NULL credentials on `'revoked'` and `'error'` states. Forced RLS with `org_integrations_tenant_isolation` policy under `managex_app`.
  - `meetings` Google Sync Columns: Extended with `conference_provider VARCHAR(32)` (`'manual'`, `'google_meet'`, `'none'`), `google_calendar_event_id`, `google_calendar_etag`, `google_conference_request_id`, `google_sync_status VARCHAR(32)` (9 states: `'none'`, `'synced'`, `'pending_create'`, `'failed_create'`, `'pending_update'`, `'failed_reschedule'`, `'pending_delete'`, `'failed_cancel'`, `'abandoned'`), `google_sync_error`, `google_sync_last_attempt_at`, `google_sync_claimed_at`, and `google_sync_claim_token UUID`.
- **Historical Meeting Backfill Results:**
  - Verified canonical backfill on both local databases:
    - `managex`: 179 in_person meetings set to `conference_provider = 'none'`; 76 virtual and 49 hybrid meetings set to `conference_provider = 'manual'`; all with `google_sync_status = 'none'`.
    - `managex_test`: 289 in_person meetings set to `'none'`; 67 virtual and 26 hybrid meetings set to `'manual'`; all with `google_sync_status = 'none'`.
- **Automated Verification & Test Results:**
  - Added dedicated integration test suite `backend/src/platform/database/google_integrations_rls.integration.test.js` targeting isolated `managex_test` database:
    - **18/18 tests passed cleanly (100% pass rate)**.
    - Verified `managex_app` lacks SUPERUSER and BYPASSRLS (`rolsuper=false`, `rolbypassrls=false`).
    - Verified user-level isolation on `oauth_states` (cross-user read/update/delete blocked, missing context fails closed, cross-user insert rejected by RLS WITH CHECK).
    - Verified tenant-level isolation on `organisation_integrations` (cross-tenant read/update/delete blocked, missing tenant context fails closed, cross-tenant insert rejected by RLS WITH CHECK).
    - Verified multi-column check constraint `chk_credentials_status` and unique constraint `uq_organisation_integrations_provider`.
    - Verified check constraints on `meetings.conference_provider` and `meetings.google_sync_status`.
    - Verified tenant isolation on `meetings` Google sync fields.
    - Verified historical backfill integrity across all pre-existing records.
  - ESLint verified with **0 errors, 0 warnings** across all Phase 1B files.
- **Verdict & Gate:** **PHASE 1B.2 COMPLETE**. Awaiting explicit approval before starting Phase 1B.3.

---

## Phase 1B.1 (Google Meet Integration): Cryptography, Token Security & Environment Configuration

- **Objective & Status:**
  - Implemented production-conscious cryptographic infrastructure for AES-256-GCM authenticated encryption and decryption of Google OAuth refresh tokens.
- **Implemented Components:**
  - `backend/src/platform/common/crypto.js`: AES-256-GCM encryption/decryption with key versioning, metadata binding via Additional Authenticated Data (AAD), randomized 12-byte IVs, 16-byte authentication tags, and tamper-resistant envelope serialization/deserialization.
  - `backend/src/config/env.js`: Zod environment validation for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` (64 hex characters), `TOKEN_ENCRYPTION_KEY_VERSION`, and `TOKEN_ENCRYPTION_KEYRING` (JSON map).
  - `backend/src/platform/common/crypto.test.js`: **37/37 tests passed**.
- **Verdict & Gate:** **PHASE 1B.1 COMPLETE**.

---

## Phase 00 (AI Implementation Plan): AI Readiness & Architecture Audit

- **Audit Objective & Scope:**
  - Evaluated repository readiness for the ManageX Canonical AI Architecture (`docs/managex-ai-implementation-plan.md`).
  - Read-only verification of authentication, organisation membership, module entitlement, PostgreSQL RLS, meeting-notes confidentiality, audit logging, OpenRouter client architecture, and quota enforcement.
  - Zero code modifications or destructive database operations; zero external LLM API calls executed during audit.
- **Key Verifications & Architectural Invariants:**
  - **Meeting Notes Confidentiality:** Verified private `assertMeetingNotesAccess` helper in `backend/src/platform/meetings/meetingService.js` (lines 1291–1340). Throws `AuthorizationError` with code `FORBIDDEN_NOTES_ACCESS`. Updated canonical plan to document this exact code and specify the shared service wrapper `getMeetingNotesForAi(meetingId, currentUserId, organisationId)`.
  - **Transaction Lifetime & Connection Pool Decoupling:** Identified critical pool starvation risk if database transactions were held open across external OpenRouter network I/O (pool size = 10 in dev/test, 20 in prod). Formalized the **Three-Stage Decoupled Transaction Pattern**:
    1. Short-lived DB transaction: Context retrieval, notes authorization, quota pre-check (releases connection immediately).
    2. Out-of-transaction asynchronous external HTTP dispatch to OpenRouter.
    3. Short-lived DB transaction: Accounting record insertion into `ai_usage_records` and audit logging.
  - **OpenRouter Gateway & Model Fallbacks:** Verified primary model (`google/gemini-2.0-flash-001`) and fallback (`openai/gpt-4o-mini`). Mandated env-driven model routing (`OPENROUTER_DEFAULT_MODEL`, `OPENROUTER_FALLBACK_MODEL`) and automated model catalog probe.
  - **Zero-Data-Retention (ZDR) Privacy:** Mandated `X-Data-Collection: deny` request header on OpenRouter calls to prevent upstream model training on confidential meeting minutes.
  - **Database Migration Alignment:** Confirmed forward migration `20261017000042_ai_foundation.sql` (sequenced after `20261017000041_google_integrations.sql`) creates `organisation_ai_settings` and `ai_usage_records` with zero numbering collision. Confirmed no duplication with existing `organisation_module_entitlements` or `audit_logs`.
  - **Concurrency & Quota Enforcement:** Paired monthly PostgreSQL quota aggregation with an in-memory sliding-window concurrency limiter in `aiQuotaService.js`.
- **Verdict:** **READY WITH DOCUMENTED SAFEGUARDS**. Awaiting explicit user approval before beginning Phase 01.

---

## Phase E (Meetings Improvement Plan): Analytics Date Semantics, Metric Labels & Final Regression

- **Correct Analytics Date Semantics (`meetingService.js`, `meetings_phase4.integration.test.js`):**
  - **Meeting Occurrence & Lifecycle Metrics:** Filtered `meetings` using canonical `meetings.start_at` (`m.start_at >= NOW() - INTERVAL '30 days'` or `'90 days'`). Replaced previous indiscriminate `created_at` filters that incorrectly captured scheduling timestamps instead of meeting occurrence dates.
  - **Child-Table Occurrence Scoping:** Scoped `meeting_attendees`, `meeting_discussion_points`, and `meeting_decisions` to the parent meeting occurrence window via `JOIN meetings m ON m.id = child.meeting_id AND m.organisation_id = child.organisation_id` with `m.start_at` filters.
  - **Duplication & Cartesian Prevention:** Ensured child-table queries produce exact counts without row multiplication or double-counting, adhering to strict composite foreign key relationships.
  - **Creation Velocity & Task Semantics:** Preserved `created_at` semantics on `meeting_action_items` to measure actual task creation velocity within the timeframe, alongside overdue checks against `due_date < CURRENT_DATE`.
- **RSVP Metric Labeling & Safe Semantics (`MeetingsPage.tsx`, `MeetingsPage.test.tsx`):**
  - **Label Clarification:** Renamed the metric from `"Attendance Rate"` to **`"RSVP Acceptance Rate"`** on Metric Card 3 and Detailed Card B (`"RSVP Status & Responses"` and `"RSVP Acceptance Rate"` row).
  - **Check-in Disambiguation:** Accurately reflects that ManageX derives this metric from accepted RSVPs divided by total invited attendees, without falsely implying physical or virtual check-in attendance.
  - **Zero-Denominator Safety:** Maintained safe `0%` evaluations when invited attendee counts are zero, completely avoiding `NaN%` or `Infinity%` runtime errors.
- **Final Verification & Full Regression Results:**
  - **Backend Integration Tests:** **100 tests passed** across all 6 meetings suites in `backend/src/platform/meetings/` (added Phase E Tests 14, 15, and 16 in `meetings_phase4.integration.test.js` verifying occurrence date scoping, Cartesian prevention, and zero-denominator safety).
  - **Broader Backend Suite:** **461 tests passed** across all 32 suites in `npm --prefix backend test`.
  - **Frontend Component Tests:** **177 tests passed** across all 18 test files (added Phase E Tests 19 and 20 in `MeetingsPage.test.tsx`).
  - **Frontend Typecheck:** `npm run typecheck:frontend` (`tsc --noEmit`) passed with **0 errors**.
  - **Frontend Production Build:** `npm run build:frontend` (`tsc && vite build`) succeeded cleanly in 15.81s.
- **Phase A–E Final Status:**
  - All Phase A, B, C, D, and E requirements under `docs/meetings-improvement-implementation-plan.md` are **100% implemented, verified, documented, and regression-free**.

---

## Phase D (Meetings Improvement Plan): MoM Detail-Page Polish, Export Verification & Action-Item Completion Metrics

- **MoM Detail-Page Polish (`MeetingDetailPage.tsx`, `MeetingDetailPage.test.tsx`):**
  - **MoM Sections & Empty States:** Inspected and verified Discussion Points, Decisions, Notes, and Action Items UI. Preserved loading, empty, error, and permission-denied states across all MoM views.
  - **Confidentiality & Edit Lockout:** Preserved meeting-note confidentiality and edit lockouts on completed/cancelled/missed meetings.
  - **Action Items Tab Summary:** Added actionable completion summary strip (`meeting-action-summary`) showing:
    - Actionable completion percentage (`Math.round(actionableRate)%`)
    - Sub-label with completed vs actionable breakdown (`{doneCount} of {actionableCount} actionable completed · {cancelledCount} cancelled`)
    - All-cancelled empty state notice (`All {totalCount} items cancelled · No actionable items`) preventing false 100% or `NaN%` displays.
  - **Minutes Tab Section 3 Summary:** Added actionable summary badge (`mom-action-summary`) next to the action item count badge (`{doneCount}/{actionableCount} actionable completed`).
- **Markdown & PDF Export Attendee Formatting (`markdownGenerator.js`, `pdfGenerator.js`, `meetings_phase4.integration.test.js`):**
  - **Attendee Name & Email Hierarchy:** Updated attendee line formatting in both generators to resolve:
    1. Canonical `fullName` and `email` (`Full Name (email@domain.com)`)
    2. Legacy `userName` and `userEmail` (`User Name (email@domain.com)`)
    3. External guest attendees (`email@domain.com (External)`)
  - **Confidential Notes Redaction & Sanitization:** Verified confidential notes are strictly excluded/redacted for unauthorized viewers with notice in both Markdown and PDF formats. Empty MoM sections and long notes are handled cleanly without layout errors or crashes.
- **Action-Item Completion Rate Metric Definitions (`meetingService.js`, `MeetingsPage.tsx`, `MeetingDetailPage.tsx`, `types/meetings.ts`):**
  - **Backend Analytics Derivation:**
    - `total`: all action items
    - `done`: action items with status `done`
    - `cancelled`: action items with status `cancelled`
    - `actionableTotal = Math.max(0, total - cancelled)`
    - `actionableCompletionRate = actionableTotal > 0 ? Number(((done / actionableTotal) * 100).toFixed(1)) : 0`
    - `grossCompletionRate = total > 0 ? Number(((done / total) * 100).toFixed(1)) : 0`
    - **Backward Compatibility:** Preserved `completionRate: grossCompletionRate` for API backward compatibility.
  - **Frontend Metrics Presentation:**
    - Primary card metric on `MeetingsPage.tsx` displays `actionableCompletionRate`.
    - Sub-label explicitly explains actionable items and cancelled count (`{done} of {actionableTotal} actionable items completed · {cancelled} cancelled`).
    - Handled zero denominator cleanly (`0%` when `actionableTotal === 0`, and when all items are cancelled displays `"All {cancelled} items cancelled · 0 actionable"`).
    - Card C (Action Items Lifecycle) displays actionable total and dedicated `Actionable Completion Rate` row alongside Gross Completion Rate.
- **Verification & Testing:**
  - **Backend integration tests:** 97 tests passing across 6 suites (added 3 Phase D tests in `meetings_phase4.integration.test.js`: Test 11 verifies analytics derivation, Test 12 verifies zero-division protection on all-cancelled items, Test 13 verifies Markdown & PDF export attendee formatting with canonical, legacy, and external guest representations).
  - **Frontend component tests:** 175 tests passing across 18 test files (added 2 Phase D tests in `MeetingsPage.test.tsx` and 3 Phase D tests in `MeetingDetailPage.test.tsx`).
  - **Frontend typecheck:** `npm run typecheck:frontend` (`tsc --noEmit`) passed with 0 errors.
  - **Frontend production build:** `npm run build:frontend` (`tsc && vite build`) passed with 0 errors.

---

## Phase C (Meetings Improvement Plan): Manual Meeting Links & Terminal-State Join CTA

- **Terminal-State Join CTA Lockdown (`MeetingDetailPage.tsx`):**
  - **Non-terminal meetings (`scheduled`, `in_progress`):** Actionable Join CTA (`data-testid="join-meeting-cta"`) remains fully active and clickable (`Join Virtual Meeting` with external link icon).
  - **Authoritative status invariant:** Passing `end_at` alone does NOT treat the meeting as terminal or deactivate the CTA while status remains `scheduled` or `in_progress`.
  - **Terminal meetings (`completed`, `cancelled`, `missed`):** Actionable Join CTA is deactivated/hidden consistently.
  - **Inactive notice (`data-testid="inactive-join-notice"`):**
    - `completed` meetings display: `Meeting ended · Link inactive`.
    - `cancelled` meetings display: `Meeting cancelled · Link inactive`.
    - `missed` meetings display: `Meeting missed · Link inactive`.
  - **Historical meeting link visibility (`data-testid="historical-meeting-url"`):**
    - Separate from actionable CTA: rendered as read-only monospace metadata (`Historical link: {meeting.virtualUrl}`).
    - Restricted to authorized organisers/managers (`isOrganiserOrManager`); hidden from standard participants and non-managers to preserve privacy.
  - **Physical/in-person meetings:** In-person meetings (`locationType: 'in_person'`) with null `virtualUrl` render physical location and cleanly omit both Join CTA and inactive notice.
- **Preserve Organiser-Provided Meeting Links & Privacy (`meetingService.js`, `ScheduleMeetingDialog.tsx`, `EditMeetingDialog.tsx`):**
  - Continued 100% support for manually provided meeting URLs (Google Meet, Zoom, etc.) via existing meeting form and data models.
  - Zero external OAuth, third-party sync, or webhook dependencies introduced.
  - Server-side validation via Zod http/https URL scheme enforcement remains intact.
  - Private meetings (`visibility: 'attendees_only'`) enforce strict backend authorization (403 `MEETING_ACCESS_DENIED`), preventing uninvited members from accessing meeting details or virtual URLs.
  - Terminal meetings enforce strict edit lockout (`409 MEETING_TERMINAL_STATE`), preventing post-completion mutation of virtual links.
- **Verification & Testing:**
  - **Backend integration tests:** 94 tests passing across 6 suites (added test `8f` in `meetings.integration.test.js` verifying that Google Meet/Zoom URLs are preserved, private links are denied to unauthorised members, and terminal meetings reject edits to virtualUrl).
  - **Frontend component tests:** 170 tests passing across 18 test files (added 6 Phase C tests in `MeetingDetailPage.test.tsx` and 1 Phase C test in `MeetingsPage.test.tsx`).
  - **Frontend typecheck:** `npm run typecheck:frontend` (`tsc --noEmit`) passed with 0 errors.
  - **Frontend production build:** `npm run build:frontend` (`tsc && vite build`) passed with 0 errors.

---

## Phase B (Meetings Improvement Plan): Overdue Warning, Dynamic Recalculation & MoM Completion Advisory

- **Overdue State Calculation & Dynamic Recalculation (`types/meetings.ts`, `MeetingsPage.tsx`, `MeetingDetailPage.tsx`):**
  - Implemented canonical `isMeetingOverdue(status, endAt, nowMs)` helper function:
    - Flags meeting as overdue if and only if status is non-terminal (`scheduled` or `in_progress`) AND `new Date(endAt).getTime() < nowMs`.
    - Terminal states (`completed`, `cancelled`, `missed`) are strictly never overdue.
    - Future meetings (`endAt > nowMs`) are strictly never overdue.
  - Dynamic UI recalculation without polling:
    - Implemented single-shot timer effect in both `MeetingsPage.tsx` and `MeetingDetailPage.tsx` targeting the exact moment the next upcoming scheduled or in-progress meeting reaches its `endAt`.
    - Zero continuous intervals (`setInterval`), zero memory leaks, and cleanly cleared timeouts (`clearTimeout`) on unmount and dependency changes.
  - Overdue Presentation & Non-Mutating Lifecycle:
    - Added amber `Overdue` badge to meeting cards on `MeetingsPage.tsx`.
    - Added amber `Overdue` status badge and high-visibility warning banner (`data-testid="overdue-banner"`) on `MeetingDetailPage.tsx`.
    - Verified that passing scheduled end time does NOT automatically mutate persisted database status.
    - Preserved explicit organiser lifecycle workflows: organiser can explicitly transition to `completed` or `missed` according to canonical lifecycle rules.
- **Minutes of Meeting (MoM) Completion Advisory (`MeetingDetailPage.tsx`):**
  - Added intelligent advisory message in the completion confirmation dialog via `getCompletionConfirmMessage(hasEmptyMom)`:
    - When discussion points, decisions, and notes are all empty, dialog informs: `"Are you sure you want to complete this meeting? Note: No discussion points, decisions, or notes have been recorded for this meeting. Once completed, minutes cannot be edited."`
    - When minutes content exists, displays standard completion advisory: `"Are you sure you want to complete this meeting? It cannot be edited after completion."`
  - Completely non-blocking: organiser can confirm and complete meetings with or without MoM content.
  - No duplicate dialogs, preserves existing state machine, tenant isolation, and audit logging.
- **Verification & Testing:**
  - Backend integration tests: 93 tests passing across 6 suites (added test `8e` verifying that past scheduled end time does NOT auto-mutate database status, and explicit transition to `completed` with empty MoM succeeds).
  - Frontend component tests: 163 tests passing across 18 test files (including new unit & component tests in `MeetingsPage.test.tsx` and `MeetingDetailPage.test.tsx` verifying overdue badge for in_progress/scheduled, suppression on terminal/future, banner rendering, non-blocking modal, and `isMeetingOverdue` edge cases).
  - Frontend typecheck: `npm run typecheck:frontend` (`tsc --noEmit`) passed with 0 errors.
  - Production build: `npm run build:frontend` (`tsc && vite build`) passed with 0 errors.

---

## Phase A (Meetings Improvement Plan): Attendee Names, API Compatibility & RSVP Header

- **API Contract Compatibility & Attendee Serialization (`meetingService.js`):**
  - Updated `listMeetingAttendees` and `addMeetingAttendee` to return canonical `fullName` and `email` alongside backward-compatible aliases `userName` and `userEmail`.
  - Maintained complete compatibility with external guest attendees (`user_id IS NULL`, `isExternal: true`, `external_email`).
  - Aligned MoM export data mapping in `exportMeetingMinutesData` and generators (`markdownGenerator.js`, `pdfGenerator.js`) to resolve `att.fullName || att.userName || att.userEmail || att.externalEmail || 'Unknown'`.
- **Frontend Contract & Attendee Summary (`MeetingDetailPage.tsx`, `types/meetings.ts`):**
  - Updated `MeetingAttendee` interface in `frontend/src/types/meetings.ts` to include optional `userName`, `userEmail`, `createdAt`, and `isExternal`.
  - Replaced informal attendee header with canonical `X invited · Y confirmed` header (where confirmed strictly counts `rsvpStatus === 'accepted'`).
  - Gracefully handles 0 attendees: renders `0 invited · 0 confirmed` and empty table state row.
  - Resolved display names with robust fallback order: `fullName` -> `userName` -> `externalEmail` -> `'Member'`.
  - Resolved emails consistently: `email` -> `userEmail` -> `externalEmail`.
  - Marked external attendees with `(External)` badge.
- **Verification & Testing:**
  - Backend integration tests: 92 tests passing across 6 suites (including new test `14b` verifying canonical and backward-compatible fields for both members and external guests).
  - Frontend component tests: 155 tests passing across 18 test files (including 3 new Phase A tests in `MeetingDetailPage.test.tsx` verifying summary counts, 0 attendees state, and fallback hierarchy).
  - Frontend typecheck: `tsc --noEmit` passed with 0 errors.
  - Production build: `vite build` completed successfully with 0 errors.

---

## Phase 4 (Roadmap): Analytics, Export & Polish

- **Backend Architecture & MOM Export Services (`markdownGenerator.js`, `pdfGenerator.js`, `meetingService.js`):**
  - **Meeting Minutes Markdown Export (`markdownGenerator.js`):**
    - Pure ES module formatting meeting metadata (Title, Start/End, Timezone, Status, Location/URL, Organiser, Overview).
    - Section 1: Attendees & Attendance table (Name/Email, Role, RSVP Status).
    - Section 2: Ordered Agenda items with duration and descriptions.
    - Section 3: Ordered Discussion Points with full text notes or draft state notices.
    - Section 4: Key Decisions with detailed justifications.
    - Section 5: Action Items table (Title, Assignee, Priority, Due Date, Status, Linked Decision, In Project Task).
    - Section 6: Additional Notes / Confidential Minutes with strict permission filtering:
      - Holders of `isOrganiser || meeting.notes.read || meeting.notes.manage` receive full confidential notes.
      - Ordinary members or viewers receive a confidentiality notice: `[Confidential notes omitted — restricted to authorised meeting organisers and roles]`.
    - Strict markdown entity sanitation (`sanitizeMarkdown`) escaping pipe delimiters, angle brackets, and markdown controls to prevent layout injection.
  - **Standard Binary PDF 1.4 Export (`pdfGenerator.js`):**
    - Pure ES module standard PDF 1.4 buffer generator with Helvetica and Helvetica-Bold fonts.
    - Features clean typography, running header banner, divider bars, word-wrapping, multi-page break pagination, and proper xref / trailer tables.
    - Zero external native or heavy dependencies.
  - **Meeting Export Service & Endpoint (`GET /organisations/:orgId/meetings/:meetingId/export?format=markdown|pdf`):**
    - Validates format via Zod (`'markdown' | 'pdf'`, 422 for unsupported formats).
    - Validates tenant isolation and caller membership (404 for cross-organisation access).
    - Returns proper Content-Type (`text/markdown; charset=utf-8` or `application/pdf`) and `Content-Disposition` header with descriptive filename (`meeting-<id>-minutes.<ext>`).
    - Records append-only audit event `meeting.exported` with minimal safe metadata (`meetingId`, `format`, `includeNotes`).

- **Backend Meeting Analytics Service & API (`meetingService.js` & `meetings.js`):**
  - **API Endpoint:** `GET /api/v1/organisations/:orgId/meetings/analytics?timeframe=all|30d|90d`.
  - **Real Aggregates via SQL Filters:**
    - Summary: Total meetings, status counts (scheduled, in_progress, completed, cancelled, missed), completion rate (%), overdue scheduled count.
    - Attendance: Total invitations, breakdown by RSVP (accepted, declined, tentative, pending), acceptance rate (%).
    - Action Items: Total action items, status breakdown (open, in_progress, done, cancelled), overdue count, completion rate (%).
    - MOM Artifacts: Total discussion points, total decisions recorded.
  - **Zero-Division and Edge Case Safety:**
    - Any rate calculation (`meetingCompletionRate`, `acceptanceRate`, `completionRate`) strictly returns `0` when denominators are zero, preventing `NaN` or `Infinity`.
    - Cancelled and missed meetings are explicitly excluded from completed metrics.
    - Strict tenant isolation: Tenant B queries return 0 counts for Tenant A records.

- **Frontend UI & User Experience Enhancements (`MeetingDetailPage.tsx`, `MeetingsPage.tsx`, `types/meetings.ts`):**
  - **Export Controls in `MeetingDetailPage.tsx`:**
    - Added dedicated Export action buttons in the meeting header: `Export .MD` and `Export PDF`.
    - Blob download integration with filename extraction from `Content-Disposition`.
    - Retains export accessibility for all meeting outcomes including completed, cancelled, and missed meetings.
    - Integrated loading states (`isExporting`) and toast notifications.
  - **Analytics Sub-Tab in `MeetingsPage.tsx`:**
    - Added third top-level sub-tab: `[Meetings] | [My Action Items] | [Analytics]`.
    - Timeframe toggle pills: `All Time`, `Past 30 Days`, `Past 90 Days`.
    - Metric Cards: 4 executive KPI cards (Total Meetings, Meeting Completion Rate, Attendance Acceptance Rate, Actions Completed Rate).
    - Detailed breakdown cards: Meeting Status Breakdown, Attendance & RSVPs, Action Items Lifecycle, and Structured MOM Artifacts.
    - Clean enterprise empty state when no meetings exist for the period.

- **Verification & Test Coverage:**
  - Backend integration tests: 82/82 passing across 6 suites:
    - `meetings_phase4.integration.test.js`: 10/10 passing (markdown export with notes, markdown export without notes, PDF buffer validity, 404 cross-tenant isolation, 422 format validation, `meeting.exported` audit logging, analytics calculation accuracy, cancelled/missed exclusion, empty org zero-denominator safety, tenant isolation).
    - `meetings_phase3.integration.test.js`: 9/9 passing.
    - `meetings_mom.integration.test.js`: 7/7 passing.
    - `meetings_rls_sec009.integration.test.js`: 8/8 passing.
    - `meetings_regression.integration.test.js`: 19/19 passing.
    - `meetings.integration.test.js`: 30/30 passing.
  - Frontend test suites: 152/152 passing across 18 test files (`vitest run`).
    - Added Phase 4 export tests in `MeetingDetailPage.test.tsx` (26/26 passing).
    - Added Phase 4 analytics tests in `MeetingsPage.test.tsx` (12/12 passing).
  - Frontend TypeScript verification: 0 errors (`tsc --noEmit`).
  - Frontend production build: 0 errors (`vite build` completed in 14.81s).

---

## Phase 3 (Roadmap): Security, Audit & Concurrent Editing

- **Database Architecture & Forward-Only Migration 040:**
  - Added migration `database/migrations/20261017000040_meetings_root_rls_sec009.sql`.
  - Hardened PostgreSQL Row-Level Security on the root `meetings` table, eliminating the legacy `app.current_is_platform_admin = 'true'` operational bypass from all four policies: SELECT, INSERT, UPDATE, DELETE.
  - Re-created policies for runtime role `managex_app` strictly using trusted transaction-local tenant context: `organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid`.
  - Verified and applied cleanly on both local databases: `managex` (dev) and `managex_test` (test). Neon/production was untouched.

- **Backend API & Service Layer Enhancements (`/api/v1/organisations/:orgId/meetings`):**
  - **Meeting Notes Optimistic Locking (Option A):**
    - Extended `PUT /:meetingId/notes` and `upsertMeetingNotes` to accept optional `expectedUpdatedAt`.
    - Implemented concurrency-safe database row lock (`SELECT ... FOR UPDATE`) inside the tenant transaction.
    - Stale write detection: If `expectedUpdatedAt` is provided and does not match the persisted `updated_at`, throws `ConflictError` (HTTP 409 `CONCURRENT_MODIFICATION`) with `currentUpdatedAt` details without overwriting newer notes.
    - Preserved backward compatibility: When `expectedUpdatedAt` is omitted, notes update continues working cleanly.
    - Competing concurrent saves serialize safely on the row lock; one completes and the other detects the timestamp change and conflicts cleanly.
  - **Security Audit Logging for Confidential Notes Denials:**
    - Updated `assertMeetingNotesAccess` to record a security audit event `meeting.notes_access_denied` when unauthorized read (`FORBIDDEN_NOTES_ACCESS`) or edit (`FORBIDDEN_NOTES_MANAGE`) is attempted.
    - Executed via isolated tenant transaction so the audit record commits independently even when the calling transaction aborts with 403.
    - Strict privacy invariant: Zero confidential text bodies, titles, decisions, or secrets are leaked to audit metadata (metadata contains only `meetingId` and `requestedAction`).
  - **Action-Item Lifecycle & Terminal State Enforcement:**
    - Verified assignee field update lock: Assignees without manager permissions can only update status; updating manager fields throws 403 `FORBIDDEN_ACTION_FIELD_UPDATE`.
    - Enforced terminal state immutability: Reopening or transitioning action items in `done` or `cancelled` status throws 409 `ACTION_ITEM_TERMINAL_STATE`.
    - Protected deletion: Deleting action items strictly requires organiser, `meeting.action.manage`, or org admin/owner.

- **Frontend UI & User Experience Enhancements:**
  - **`MeetingDetailPage.tsx`:**
    - Tracks persisted `notes.updatedAt` and passes `expectedUpdatedAt` in `handleSaveNotes`.
    - Concurrency conflict handling: On HTTP 409 `CONCURRENT_MODIFICATION`, preserves the user's typed draft in the text area without discarding, and displays an informative alert explaining that another user changed the notes so the user can merge changes.
  - **`MeetingsPage.tsx`:**
    - Corrected quick-status toggle button: Disabled for terminal states (`done`, `cancelled`), preventing illegal transitions and optimistic state desynchronization.
    - Button styling and titles clearly distinguish completed/cancelled items from pending items.

- **Verification & Test Coverage:**
  - Backend integration tests: 62/62 passing across 4 dedicated test suites:
    - `meetings.integration.test.js`: 38/38 passing.
    - `meetings_mom.integration.test.js`: 7/7 passing.
    - `meetings_phase3.integration.test.js`: 9/9 passing (fresh save, stale rejection 409, backward compatibility, concurrent row-lock race, read/manage denial audit events, action item field/terminal boundaries).
    - `meetings_rls_sec009.integration.test.js`: 8/8 passing (asserting migration 040, root `meetings` CRUD isolation, platform-admin bypass prevention, RLS WITH CHECK foreign tenant insertion/update rejections, fails closed on empty context).
  - Frontend test suite: 148/148 passing across 18 test files (`vitest run`).
  - Frontend TypeScript verification: 0 errors (`tsc --noEmit`).
  - Frontend production build: 0 errors (`vite build`).

---

## Phase 2 (Roadmap): MOM Enhancement — Decision Linking, Action Items v2 & My Action Items

- **Database Architecture & Forward-Only Migration 039:**
  - Added migration `database/migrations/20261017000039_meeting_action_items_decision_project_task.sql` adding `decision_id` and `project_task_id` to `meeting_action_items`.
  - Enforced referential integrity via composite foreign keys:
    - `fk_meeting_action_items_decision`: `(organisation_id, meeting_id, decision_id)` -> `meeting_decisions (organisation_id, meeting_id, id)` with `ON DELETE SET NULL`.
    - `fk_meeting_action_items_project_task`: `(organisation_id, project_task_id)` -> `tasks (organisation_id, id)` with `ON DELETE SET NULL`.
  - Added performance indexes `idx_meeting_action_items_decision` and `idx_meeting_action_items_project_task`.
  - Verified and applied cleanly on both local databases: `managex` (dev) and `managex_test` (test). Neon/production was untouched.

- **Backend API & Service Layer Enhancements (`/api/v1/organisations/:orgId/meetings`):**
  - **Cross-Meeting Action Items Query (`GET /action-items`):**
    - Mounted before parameterised routes to avoid route collisions.
    - Role-aware scoping: Ordinary members see only their assigned action items; users with `meeting.action.manage`, `meeting.edit`, or org admin/owner can view organisation-wide action items or filter by assignee.
    - Comprehensive filtering: `timeframe` (`all`, `overdue`, `due_soon`, `completed`), `status`, `priority`, `meetingId`.
    - Returns paginated action items enriched with meeting title, assignee info, linked decision title, and project task title.
  - **Decision-to-Action Item Linking:**
    - Extended action item schemas (`createActionItemSchema`, `updateActionItemSchema`) with optional `decisionId`.
    - Verified same-meeting and same-tenant integrity: Creating or updating an action item with a decision from another meeting or tenant is rejected with `422 Unprocessable Entity`.
    - Deleting a source decision preserves action items with `decision_id` gracefully set to `NULL` (`ON DELETE SET NULL`), retaining full task history.
  - **Projects & Tasks Integration (`POST /:meetingId/action-items/:actionItemId/promote-to-task`):**
    - Entitlement verification: Checks `projects` module enablement using `checkModuleEntitlement({ organisationId, moduleSlug: 'projects' })`. Disabled module returns `403 MODULE_DISABLED`.
    - Target project validation: Target project must exist in the active organisation and not be deleted or completed.
    - Status mapping: Automatically maps meeting action item status (`open` -> `todo`, `in_progress` -> `in_progress`, `done` -> `completed`, `cancelled` -> `cancelled`) to the canonical project task status.
    - Idempotency & Conflict Prevention: Repeated promotion to the same project returns the existing task with `alreadyPromoted: true`. Attempting to promote an item already attached to a different project returns `409 Conflict`.
    - Emits `meeting.action_item_promoted` audit log event.

- **Frontend UI & User Experience Enhancements:**
  - **`MeetingDetailPage.tsx`:**
    - Decision cards display a count of linked action items (`X action items`) and a "+ Action Item" shortcut button.
    - Prefilling and locking: Clicking "+ Action Item" on a decision opens the Add Action Item modal with the source decision pre-selected and locked to prevent accidental detachment.
    - Standalone selector: Opening Add Action Item directly displays a selector to optionally link any decision recorded in the meeting.
    - Action item cards (both in Minutes tab MOM Section 3 and Dedicated Actions tab) render badges for Overdue, Priority, Status, Linked Decision, and In Project task.
    - "Promote to Task" button: Opens accessible modal with project selection, promotion policy explanation, and confirmation flow. Once promoted, displays an "In Project: [Task Title]" badge.
  - **`MeetingsPage.tsx`:**
    - Top-level sub-tabs switcher: `[Meetings] | [My Action Items]` beneath the header.
    - Dedicated My Action Items view with interactive search and multi-dimensional filters: Timeframe (`All`, `Overdue`, `Due Soon`, `Completed`), Status (`Open`, `In Progress`, `Done`, `Cancelled`), and Priority (`Urgent`, `High`, `Medium`, `Low`).
    - Quick status toggle: Checkbox/circle button toggles status between open and done with optimistic UI updates.
    - Direct cross-navigation: Each action item card links back to its parent meeting details view (`/app/organisations/:orgId/meetings/:meetingId`).
    - Clean empty states when no action items match the active filters.

- **Verification & Test Coverage:**
  - Backend integration tests:
    - `meetings.integration.test.js`: 38/38 passing (added Phase 2 tests for decision linking, cross-meeting rejection, cascade SET NULL, task promotion & idempotency, and organization action items scoping).
    - `meetings_mom.integration.test.js`: 7/7 passing.
    - `meetings_regression.integration.test.js`: 19/19 passing.
    - `meetings_rls_sec009.integration.test.js`: 8/8 passing.
    - Total backend meetings test suite: **72/72 tests passing (100%)**.
  - Frontend test suites:
    - `MeetingDetailPage.test.tsx`: 24/24 passing (added Tests 23-24 for decision action count, + Action Item CTA, overdue/decision/project badges, and task promotion).
    - `MeetingsPage.test.tsx`: 10/10 passing (added Tests 8-10 for sub-tab navigation, My Action Items list with overdue/decision badges and meeting links, and empty state).
    - Full frontend Vitest suite: **18 test files, 148/148 tests passing (100%)**.
  - TypeScript compilation & production build:
    - `npm --prefix frontend run build` completed cleanly with 0 type errors.

---

## Phase 1 (Roadmap): Meeting Lifecycle State Machine & UI Polish

- **Meeting Lifecycle State Machine & Forward-Only Migration:**
  - Added forward-only migration `database/migrations/20261017000038_meetings_missed_status.sql` updating `meetings(status)` check constraint to include `'missed'`. Applied cleanly to both `managex` and `managex_test`.
  - Updated backend lifecycle state machine (`meetingLifecycle.js`):
    - `scheduled` allows transitions to: `['in_progress', 'cancelled', 'missed']`.
    - `in_progress` allows transitions to: `['completed', 'cancelled']`.
    - Terminal states: `completed`, `cancelled`, and `missed` (no outgoing transitions).
    - Direct transition from `scheduled` to `completed` is strictly forbidden (rejected with 409 Conflict).
  - Validation rules for `missed`:
    - Only allowed when current meeting status is `scheduled` and meeting `end_at < NOW()`. Transitions before `end_at` are rejected with 422 Unprocessable Entity.
    - Locked terminal state in `updateMeeting`: once a meeting is in `missed` status, core meeting details cannot be mutated.
  - Audit Events:
    - Emits immutable `meeting.status_changed` and `meeting.missed` audit events with tenant context and zero sensitive payload leakage.
- **Timezone Canonicalization & Display:**
  - Implemented `canonicalizeTimeZone` in `meetingLifecycle.js` to normalize deprecated aliases such as `Asia/Calcutta` to canonical IANA `Asia/Kolkata`.
  - Added friendly timezone labels and common timezone selections in frontend types (`types/meetings.ts`), rendering formatted strings such as `IST (Asia/Kolkata, UTC+05:30)`.
- **Frontend Remediation & UI Polish:**
  - **Overdue Indicator**: Derived dynamically in both `MeetingsPage` and `MeetingDetailPage` when a meeting is `scheduled` and its `endAt` timestamp is in the past. Renders amber `Overdue` badge without requiring automated background cron jobs.
  - **Mark as Missed Action**: Added "Mark as Missed" button to `MeetingDetailPage` for overdue meetings with confirmation dialog, transitioning status cleanly to `missed`.
  - **Start & Complete Controls**: Organisers and managers see "Start Meeting" when scheduled, and "Complete" only when the meeting is currently `in_progress`.
  - **RSVP Usability**:
    - Organiser attendee is excluded from RSVP response card (`meeting.organiserId !== user?.id && currentAttendee.role !== 'organiser'`).
    - Currently selected RSVP response button is disabled (`disabled={isRsvping || currentAttendee.rsvpStatus === ...}`) to prevent duplicate redundant submissions.
  - **Toast Notifications**:
    - Created accessible `Toast` and `ToastContainer` components (`Toast.tsx`) with auto-dismiss (3.5s) and `role="status"` / `aria-live="polite"`.
    - Integrated toasts into notes and MOM update actions, replacing intrusive alert banners.
  - **DOM & UX Cleanups**:
    - Eliminated duplicate breadcrumbs across meetings detail and workspace header.
    - Reorder controls (Up/Down) for Discussion Points and Decisions are cleanly suppressed when a single item exists.
    - Empty state for Action Items contains a single primary CTA (`Add First Action Item`).
- **Verification Evidence:**
  - Backend integration tests: Added 4 lifecycle & timezone tests to `backend/src/platform/meetings/meetings.integration.test.js` (34/34 tests passed).
  - Backend MOM suite: `meetings_mom.integration.test.js` (7/7 tests passed).
  - Backend RLS suite: `meetings_rls_sec009.integration.test.js` (8/8 tests passed).
  - Total backend tests executed and passing: 49/49.
  - Frontend unit tests: Added tests 17–22 to `MeetingDetailPage.test.tsx` (22/22 passed), added Phase 1 tests to `MeetingsPage.test.tsx` (7/7 passed), created `Toast.test.tsx` (3/3 passed). Total frontend tests passing: 144/144 across 19 test files.
  - Frontend typecheck: `tsc --noEmit` passed with 0 errors.
  - Frontend production build: `npm --prefix frontend run build` succeeded cleanly.

---

## Phase 7-MOM: Structured Minutes of Meeting (MOM) Enhancement

- **Enterprise Structured MOM Data Model & Forward-Only Migration:**
  - Added forward-only migration `database/migrations/20261017000037_meeting_mom_structured.sql`.
  - Created `meeting_discussion_points`: UUID primary key, composite foreign key to `meetings(id, organisation_id) ON DELETE CASCADE`, `title` (VARCHAR 255), optional `body` (TEXT up to 50k chars for draft support), deterministic `order_index`, `created_by_id`, `updated_by_id`.
  - Created `meeting_decisions`: UUID primary key, composite foreign key to `meetings(id, organisation_id) ON DELETE CASCADE`, `title` (VARCHAR 255), optional `details` (TEXT up to 50k chars), deterministic `order_index`, `created_by_id`, `updated_by_id`.
  - Enabled and forced PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`) with 8 strict tenant isolation policies (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) restricted to runtime database role `managex_app` without platform-admin bypass.
  - Fully backward-compatible: Preserved `meeting_notes` table for historical minutes and free-form additional notes without data migration, destructive conversion, or truncation.
- **Backend Services & API Contracts (`meetingService.js` & `meetings.js`):**
  - Added CRUD and atomic reordering services for Discussion Points and Decisions (`listMeetingDiscussionPoints`, `createMeetingDiscussionPoint`, `updateMeetingDiscussionPoint`, `deleteMeetingDiscussionPoint`, `reorderMeetingDiscussionPoints`, `listMeetingDecisions`, `createMeetingDecision`, `updateMeetingDecision`, `deleteMeetingDecision`, `reorderMeetingDecisions`).
  - Strict notes authorization helper `assertMeetingNotesAccess` enforcing access for meeting organisers and explicit `meeting.notes.read` / `meeting.notes.edit` / `meeting.notes.manage` holders; non-permitted attendees receive 403 `FORBIDDEN_NOTES_ACCESS` fail-closed.
  - Cancelled meetings enforce terminal state locking (409 `MEETING_CANCELLED`).
  - Comprehensive append-only audit logging for all MOM actions (`meeting.discussion_point_*`, `meeting.decision_*`) with zero text bodies/details in metadata.
  - Enhanced aggregate `GET /api/v1/organisations/:orgId/meetings/:meetingId/notes` to return `{ notes, discussionPoints, decisions }`.
- **Frontend MOM Interface Overhaul (`MeetingDetailPage.tsx`):**
  - Integrated 4-section MOM workspace into Meeting Detail Page (Tab 3) under clear heading "Meeting Minutes (MOM)":
    1. **MOM Header Card**: Title, subtitle, and dynamic "Edit Mode" vs "View Only" badge with last updated timestamp.
    2. **Section 1: Discussion Points**: Add point dialog, ordered cards (#1, #2), draft-state indicator, atomic Up/Down reordering, inline edit dialog, delete confirmation dialog, empty state.
    3. **Section 2: Key Decisions**: Add decision dialog, ordered badges, details display, atomic Up/Down reordering, edit dialog, delete confirmation dialog, empty state.
    4. **Section 3: Action Items**: Integrated view of meeting action items with title, priority badge, status toggle, assignee, and due date.
    5. **Section 4: Additional Notes & Historical Minutes**: Preserves legacy notes in full editable textarea with character counter and confidentiality disclaimer.
- **Verification Evidence:**
  - Added dedicated integration test suite `backend/src/platform/meetings/meetings_mom.integration.test.js` targeting isolated `managex_test` database (7/7 tests passed: discussion points CRUD & draft, decisions CRUD, legacy notes preservation, authorization gates, audit log privacy, terminal state locking, and direct PostgreSQL RLS tenant isolation).
  - Meeting integration regression suites: `meetings.integration.test.js` (30/30 passed), `meetings_regression.integration.test.js` (19/19 passed), `meetings_rls_sec009.integration.test.js` (8/8 passed). Total 64/64 backend tests passing.
  - Added frontend unit tests in `MeetingDetailPage.test.tsx` (tests 13-16: MOM header & 4 sections rendering, discussion points and decisions display, organiser Edit Mode controls vs viewer View Only omission, and cancelled meeting warning with action suppression). Total frontend tests passing: 132/132 across 17 test files.
  - Frontend production build: `npm --prefix frontend run build` succeeded with 0 TypeScript/Vite errors.

---

## Phase 7-SEC: Meetings Attendees & Agenda RLS Security Remediation (SEC-009)

- **Vulnerability Remediated:**
  - Removed the legacy `app.current_is_platform_admin = true` bypass from all PostgreSQL Row-Level Security policies on `meeting_attendees` and `meeting_agenda_items` (originating in migration `20261017000013_meetings_core.sql`).
  - Closed the potential security risk where platform-admin session flags could bypass tenant isolation or grant cross-tenant attendee/agenda access (PRD §6.5, PLAT-004, SEC-009).
- **Forward-Only Migration:**
  - Created and applied `database/migrations/20261017000036_meetings_attendees_agenda_rls_sec009.sql`.
  - Replaced all 8 policies across `meeting_attendees` and `meeting_agenda_items` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) with strict tenant isolation bound strictly to runtime role `managex_app`:
    - `USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)`
    - `WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)`
  - Preserved runtime database role `managex_app` with `NOBYPASSRLS` and table ownership under `postgres`.
- **Integration Test Verification:**
  - Created dedicated RLS integration test suite: `backend/src/platform/meetings/meetings_rls_sec009.integration.test.js` targeting isolated database `managex_test`.
  - Verified 8 security properties:
    1. Runtime role is `managex_app` with `NOBYPASSRLS = false`.
    2. Tenant A transaction can SELECT, INSERT, UPDATE, and DELETE its own meeting attendees and agenda items.
    3. Tenant B transaction cannot read, update, or delete Tenant A meeting attendees or agenda items.
    4. Missing or empty tenant context fails closed (0 rows visible to `managex_app`).
    5. RLS `WITH CHECK` rejects inserting rows under a foreign organisation (code 42501).
    6. RLS `WITH CHECK` rejects updating `organisation_id` to a foreign organisation (code 42501).
    7. Platform-admin context alone (`isPlatformAdmin: true`, missing `organisationId`) fails closed and does NOT bypass attendee or agenda RLS.
    8. Same-tenant meeting workflows (attendees, RSVPs, agendas, reordering) continue working cleanly without regression.
  - Test results: 8/8 tests passed in `meetings_rls_sec009.integration.test.js`; 49/49 tests passed in existing regression suites (`meetings.integration.test.js` and `meetings_regression.integration.test.js`). Total 57/57 tests passing.

---

## Phase 7C-FE: Meetings Frontend Remediation & API Contract Alignment

- **API Contract Alignment (`MeetingDetailPage.tsx`):**
  - Aligned meeting status transitions to `POST /api/v1/organisations/:orgId/meetings/:meetingId/status` with `{ status }` (previously used `PATCH`).
  - Aligned RSVP submissions to `POST /api/v1/organisations/:orgId/meetings/:meetingId/rsvp` with `{ rsvpStatus }` (previously used `PATCH`).
  - Fixed agenda deserialization to read `res.data?.agendaItems || res.data?.agenda || []` (backend returns `{ agendaItems: [...] }`, resolving the bug where 0 items rendered).
  - Fixed agenda reordering response handling: `PUT /agenda/reorder` returns `{ success: true }`; local reordered state is preserved instead of wiping out the agenda list.
  - Replaced raw browser `alert()` calls in agenda reordering and action items toggle with ManageX in-app `Alert` component and action error banner.
- **Implemented Edit Meeting UI (`EditMeetingDialog.tsx` & `MeetingDetailPage.tsx`):**
  - Created accessible `EditMeetingDialog` component pre-populating title, description, start/end datetimes, timezone, location type, location, virtual URL, and visibility.
  - Implemented client-side input validation (title min 2 characters, end time strictly after start time, location and virtual URL required based on location type, valid URL format).
  - Added "Edit Meeting" button to meeting detail header when `canEditMeeting && !isTerminal`.
  - Dispatches `PATCH /api/v1/organisations/:orgId/meetings/:meetingId` with validated payload, handles error alerts, and refreshes parent state without page reload.
  - Terminal states (`completed`, `cancelled`) cleanly suppress editing controls.
- **Frontend Regression Test Coverage:**
  - Added `frontend/src/pages/workspace/meetings/MeetingsPage.test.tsx` (5/5 tests passing: loading skeleton, empty state, meeting cards rendering, permission-based schedule button gating).
  - Added `frontend/src/pages/workspace/meetings/MeetingDetailPage.test.tsx` (12/12 tests passing: detail rendering, agendaItems deserialization, POST status transition contract, POST RSVP contract, agenda reorder preservation, Edit Meeting dialog pre-population, form validation, PATCH update contract, permission gates, terminal state button suppression, and confidential notes 403 fail-closed handling).
  - Full frontend suite: 17/17 test files, 128/128 tests passed.
  - Frontend production build: `tsc && vite build` succeeded with 0 errors.

---

## Evaluation & Judging Page UX: Section Navigation & Modular Views

- Replaced vertical monolithic layout on the Evaluation & Judging organiser page (`/app/organisations/:orgId/events/:eventId/rounds/:roundId/evaluation`, `EvaluationPage.tsx`) with a tabbed navigation architecture matching the ManageX Clean Enterprise light design system.
- Partitioned evaluation operations into 4 focused tabs:
  - **Round evaluation configuration** (`tab=config`): Displays evaluation mode, session duration & buffer, coverage metrics, panel/session statistics, schedule window, configuration edit trigger, and 3 quick-navigation metric cards with direct jumps to panels, schedule, and invitations.
  - **Evaluation panels** (`tab=panels`): Panel management, panel meeting links, active organization member judge assignments, member removal, and panel creation/deletion.
  - **Session schedule** (`tab=schedule`): Schedule generation controls, starts-at input, session status filters, panel filters, session replacement toggle, schedule table with status updates, rescheduling, and cancellation.
  - **Invitations and completion** (`tab=invitations`): External judge invitation management, invitation expiration & revocation, schedule publication/unpublication actions, and terminal session verification / complete evaluation trigger.
- Added URL query parameter synchronization via `?tab=config|panels|schedule|invitations` to support bookmarking and browser history navigation.
- Preserved all dialogs, action handlers, server-side permission checks (`event.evaluation.*`), and API endpoints without regressions.
- Added comprehensive unit tests in `EvaluationPage.test.tsx` (8/8 tests passed; 111/111 full frontend test suite passed).
- Built production frontend bundle successfully with zero TypeScript compilation warnings or errors.

---

## Event Detail UX: Tabbed Navigation & Event Status Stepper

- Replaced vertical monolithic layout on `EventDetailPage.tsx` with a focused, tabbed navigation architecture matching ManageX Clean Enterprise light design.
- Implemented 5-stage horizontal lifecycle stepper banner (`Draft` → `Published` → `Registration Closed` → `In Progress` → `Completed`) with allowed transitions and quick action triggers.
- Partitioned event features into dedicated tabs:
  - **Overview**: 3 high-level metric cards (`Registration window`, `Capacity` with real-time progress bar, `Hackathon / Event details`), participant instructions, schedule & timezone, venue & location.
  - **Registrations**: Participant roster with search and status filtering, capacity badges, withdrawal actions, and attendee participation status.
  - **Teams** (hackathons): Team formation, current team members list, team invitations, and registered teams list.
  - **Submissions** (hackathons): Round stages selector, project repository & demo links, edit submission actions.
  - **Judging** (hackathons): Multi-feature sub-navigation pills (`Competition Rounds`, `Scoring Criteria & Judges`, `Judge Evaluation Work`) so each judging tool is viewed and managed individually without vertical stacking. Inside **Scoring Criteria & Judges**, secondary sub-navigation cleanly isolates **Scoring Criteria** from **Judge Assignments**.
  - **Results** (hackathons): Leaderboard rankings with tie handling (ADR-009) and results publication controls.
  - **Settings**: Administrative lifecycle state transitions, event configuration summary, edit event modal trigger, and danger zone.
- Added URL synchronization via query parameter `?tab=<tab_id>&subtab=<subtab_id>&criteriatab=<criteria|judges>`.
- Preserved all 15 existing modal dialogs, business logic, authorization rules, and endpoints without regressions.
- Added 5 focused tests to `EventDetailPage.test.tsx` (110/110 frontend tests passed).

---

## Evaluation Hardening — Phase 1

Phase 1 implementation is complete in the working tree for backend authorization and immediate defects:

- Fixed evaluation caller judge detection so panel/configuration reads no longer reference an undefined variable.
- Added dedicated evaluation view, configuration, judge-management, schedule-management, and schedule-publication permissions.
- Added strict tenant-scoped route guards that do not allow platform-admin bypass for evaluation data.
- Preserved external assigned-judge and participant service/RLS scope handling.
- Added the forward-only `no_show` status constraint update; migration 032 is applied and verified in both `managex_test` and the protected development database `managex`.
- Added unit coverage for explicit permission grants, denial of generic `event.edit`/platform bypass, and external assignment-scoped requests.
- Verification remediation now limits organiser projection to management permissions and filters panel reads to assigned judges; participants, unrelated users, and revoked judges receive no panel records.

- Database-backed evaluation integration tests passed against the isolated `managex_test` database.

## Judge Scheduling & Evaluation — Phase 2

Phase 2 backend scheduling hardening is implemented in the existing evaluation service:

- Serializes team and judge scheduling resources with transaction-scoped advisory locks.
- Applies the shared conflict validator to generated schedules as well as individual reservations.
- Validates explicit generated teams belong to the selected event.
- Preserves round scope for rescheduling, cancellation, and status updates.
- Preserves cancellation reasons in audit metadata while keeping historical sessions.
- Stabilizes session listing order for deterministic schedule projections.

Focused verification passed against `managex_test`: 27 tests passed, 0 failed, including unit projection, scheduling, conflict detection, rescheduling, cancellation auditability, meeting-link privacy, judge synchronization, scoring compatibility, and tenant isolation.

## Judge Scheduling & Evaluation — Phase 3

Phase 3 backend work is implemented in the existing evaluation services:

- Added scoped judge invitations with hashed single-use tokens, expiry, resend invalidation, verified-email acceptance, audit events, and no organisation-membership side effect.
- Added session-to-submission linkage and event/round/team validation while preserving existing scoring and assignment synchronization.
- Added explicit evaluation completion validation without automatic publication or round advancement.
- Added generated-schedule submission association and schedule-window capacity rejection before session insertion.
- Applied migration `20261017000033_evaluation_phase3.sql` only to `managex_test`; it has not been applied to `managex`.

Phase 3 focused verification is complete against `managex_test`:

- Judge invitation, expiry, resend, verified-email, assignment activation, revocation, audit-redaction, protected HTTP score denial, invitation-route authentication, completion success/idempotency and preconditions, and schedule-capacity tests passed: **37/37**.
- Evaluation foundation regression tests passed: **15/15**.
- A forward-only submission foreign-key correction was applied only to `managex_test` through migrations `20261017000034` and `20261017000035`; the final constraint detaches only `submission_id` on submission deletion while preserving the session tenant key.
- A deterministic new schedule-concurrency test was not added because the current test infrastructure has no reliable barrier/synchronization hook; existing advisory-lock and conflict regression coverage remains in place.

## Participant Evaluation Schedule — Phase 4D

Phase 4D participant evaluation schedule experience is implemented and verified:

- Created reusable `ParticipantEvaluationSchedule` component adhering to the Clean Enterprise design system (`frontend/src/components/events/ParticipantEvaluationSchedule.tsx`).
- Integrated published evaluation appointment cards into `StudentDashboardPage` under round deliverables for registered hackathon participants with teams.
- Integrated evaluation schedule section into `PublicEventDetailPage` for registered hackathon participants with teams, fetching public rounds (`/events/:eventId/rounds`).
- Strictly adheres to the 10-minute meeting release policy: hides join action and displays informative unlock time notice prior to release window; activates "Join Evaluation Meeting" button when released or session is live (`in_progress`).
- Enforces strict RBAC and data minimization boundaries: judge identities, emails, scoring sheets, and internal notes are never rendered or exposed to participants.
- Added comprehensive unit tests in `ParticipantEvaluationSchedule.test.tsx` (8 tests), `StudentDashboardPage.test.tsx` (5 tests), and `PublicEventDetailPage.test.tsx` (13 tests) verifying appointment metadata, slot numbering, release window enforcement, cancelled session notices, and absence of information leakage.
- Verified all 15 frontend test files (97 tests passed), TypeScript compilation (`tsc --noEmit`), and production bundle build (`npm run build`).

## End-to-End Evaluation Workflow Verification — Phase 4E

Phase 4E verified the full evaluation and judging lifecycle across backend services, routing boundaries, and frontend portal interfaces:

- **End-to-End Lifecycle Verification:** Verified the complete pipeline: Organiser Setup → Round & Criteria Configuration → Judge Assignment / Token Invitation → Slot Scheduling & Concurrency Locks → Schedule Publication → External & Internal Scoring → Participant Schedule Projection with 10-Minute Unlock → Completion & Idempotency → Results Publication / Unpublication → Multi-Round Advancement (Top-N, Threshold, Manual).
- **Route & Boundary Remediations:**
  - Mounted missing round submission endpoints (`POST/GET /organisations/:orgId/events/:eventId/rounds/:roundId/submissions`, `/my-submission`).
  - Mounted round advancement and round results publication endpoints (`POST .../advance`, `GET .../advancements`, `POST .../publish-results`, `POST .../unpublish-results`).
  - Mounted public round results (`GET /api/v1/events/:eventId/rounds/:roundId/results`).
  - Mounted participant dashboard (`GET /api/v1/events/participant/dashboard`) in `publicEventsRouter` and current participant team endpoint (`GET /api/v1/organisations/:orgId/events/:eventId/my-team`) in `eventsRouter`.
  - Added optional `roundId` to `createCriterionSchema` and `assignJudgeSchema` to prevent criterion collisions and enable round-scoped judging assignments.
- **Test Isolation & Zero-Destruction Safety:** Refactored integration test fixtures in `advancement.integration.test.js` and `hardening.integration.test.js` to eliminate destructive `DELETE` cleanup against pre-existing records, enforcing run-unique prefixes and asserting target database `managex_test` at migration `20261017000035`.
- **Backend Verification Suites (managex_test):**
  - `evaluation_foundation.integration.test.js`: **15/15 passed**
  - `evaluation_services.integration.test.js`: **44/44 passed**
  - `evaluation_service.unit.test.js`: **1/1 passed**
  - `judging_results.integration.test.js`: **20/20 passed**
  - `advancement.integration.test.js`: **15/15 passed**
  - `hardening.integration.test.js`: **12/12 passed**
  - `events_boundaries.integration.test.js`: **24/24 passed** (6 suites)
  - `participant_dashboard.integration.test.js`: **4/4 passed**
- **Frontend Verification:**
  - Vitest test suites: **15/15 passed (97/97 tests)**
  - TypeScript type check (`tsc`): **0 errors**
  - Production build (`vite build`): **Succeeded in 16.16s**

## Judge Workspace Scoring UI — Phase 4F

Phase 4F implemented the interactive judge scoring experience inside the existing `JudgeWorkspacePage`:

- **Interactive Scoring Dialog (`JudgeScoringDialog.tsx`):**
  - Integrated into `JudgeWorkspacePage.tsx` with dedicated "Score submission" / "Review scores" actions per assigned session.
  - Fetches permitted evaluation work using existing session-scoped backend API (`GET .../evaluation/sessions/:sessionId/work`).
  - Displays permitted team name, submission title, description, repository link, and live demo link.
  - Dynamically renders all round/event scoring criteria with individual max score limits derived from backend responses.
  - Provides numeric score input (0 to `maxScore`) and private notes / feedback textarea per criterion.
  - Calculates real-time total running score versus maximum possible points.
  - Prepopulates previously submitted scores and notes if already evaluated by this judge.
  - Validates missing, non-numeric, negative, or out-of-range scores prior to network dispatch.
  - Displays loading skeleton, submitting spinner, validation error badges, API error alerts, and success confirmations.
  - Prevents accidental duplicate submissions while requests are in flight.
  - Preserves entered score and feedback state upon recoverable API or network failures so judges never lose typed work.
  - Dispatches scores via existing session-scoped API (`POST .../evaluation/sessions/:sessionId/scores`).
  - Refreshes session workspace listings post-submission without page reloads or data duplication.
- **Security & Authorization Invariants:**
  - Strictly relies on server-authoritative evaluation session checks (403 `EVALUATION_SESSION_FORBIDDEN` handled gracefully).
  - Only projects the caller judge's own scores and feedback; zero exposure of other evaluators' scores, identities, or private notes.
  - External judges receive zero organisation-level permissions or membership side effects.
  - Submitting scores does not prematurely complete rounds, publish results, or advance participants.
- **Verification & Testing:**
  - Focused suite in `JudgeWorkspacePage.test.tsx`: **11/11 tests passed**.
  - Full frontend suite: **15/15 test files passed, 105/105 tests passed**.
  - TypeScript compilation (`tsc --noEmit`): **0 errors**.
  - Vite production bundle build (`npm run build`): **Succeeded in 27.05s**.

## Current Status: Phase 9 Accepted | Phase 10 Preflight Complete

| Phase | Description | Status | Requirements Completed | Gate / Blocker |
|---|---|---|---|---|
| **Phase 0** | Requirements, Repository & Security Design Audit | **COMPLETED** | API-008, OPS-006 (Architecture, Data Dictionary, Security Model, Traceability Matrix, Implementation Plan, Testing Strategy, Deployment Specs, Runbooks, ADRs) | Approved |
| **Phase 1** | Foundation, Application Shell & Design System | **COMPLETED** | UI-001, UI-002, UI-003, UI-004, UI-005, API-006, API-007, OPS-001, OPS-002, OPS-004 (Canonical layout, 20 UI primitives, error states, API client & cold-start handling, health/ready probes, env validation, logger redaction) | Approved |
| **Phase 2** | PostgreSQL Migrations & RLS Baseline | **COMPLETED** | OPS-003, OPS-005, SEC-002, SEC-003, SEC-004, SEC-009, SEC-010 (Migration runner, core schema, restricted `managex_app` role with NOBYPASSRLS, FORCE RLS, transaction helper, live RLS test suite, DB readiness in `/ready`) | Approved |
| **Phase 3** | Authentication & Session Lifecycle | **COMPLETED** | AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008 (User registration, bcrypt hashing, single-use verification tokens, generic auth errors, server-managed sessions with 30m idle / 7d absolute lifetime, CSRF protection, rate limiting, and email abstraction) | Approved |
| **Phase 4** | Organisation Lifecycle & Memberships | **ACCEPTED** | ORG-001, ORG-002, ORG-003, ORG-004, ORG-005, ORG-006, ORG-007, ORG-008, ORG-009, ORG-010 (Atomic org creation with owner role, multi-org membership, workspace switching with client cache reset, 7-day single-use invitations, safe email-matched onboarding, member management, final-owner protection, step-up transfer with password reauth, approved settings updates, leave org guard, and secret-redacted audit logs) | Formally accepted after acceptance review |
| **Phase 5** | Scoped RBAC, Module Catalogue & Audit | **ACCEPTED** | RBAC-001, RBAC-002, RBAC-003, RBAC-004, RBAC-005, RBAC-006, RBAC-007, MOD-001, MOD-002, MOD-003, MOD-004, MOD-005, AUD-004, API-004 (Machine-readable permission catalogue, baseline seeded roles, anti-escalation role assignment, sole-owner protection, multi-role aggregation, 3 core MVP modules with independent activation & platform availability check, fail-closed route guards, non-destructive deactivation, bounded audit log querying, Clean Enterprise frontend module/audit/role management) | Formally accepted after acceptance review |
| **Phase 6A** | Events Core & Lifecycle | **ACCEPTED** | EVT-001, EVT-002, EVT-003 (Core event model, UTC instants & IANA timezones, canonical 7-status lifecycle transition engine, draft/published visibility rules, management UI) | Formally accepted after acceptance check |
| **Phase 6B** | Event Registration & External Participants | **ACCEPTED** | EVT-004, EVT-005 (Event registration, capacity limits with transactional concurrency locking, duplicate prevention, cancellation/withdrawal & reactivated re-registration, external participant boundary without org membership, own-registration status, staff participant roster) | Formally accepted after acceptance check |
| **Phase 6C** | Hackathon Teams & URL Submissions | **ACCEPTED** | EVT-006, EVT-007 (Hackathon team model, min/max team sizing 1..100, team invites with 7-day single-use tokens, URL submissions with SSRF protection & submission window guard, serialized concurrent joins & ownership protection) | Formally accepted after acceptance check |
| **Phase 6D** | Judge Scoring & Results Publication | **ACCEPTED** | EVT-008, EVT-009 (Judge assignments, criteria 1..100, private scoring, straight-sum result calculation, shared ranks, results publication) | Formally accepted after acceptance check |
| **Phase 7A** | Meetings Core, Attendees & Agendas | **ACCEPTED** | MTG-001, MTG-002, MTG-003, MTG-004 (Meetings data model, UTC & IANA timezones, canonical 4-status lifecycle, organisation vs attendees_only visibility, internal & external attendees, RSVP management, ordered agendas & atomic reordering) | Formally accepted after acceptance review |
| **Phase 7B** | Confidential Minutes & Action Items | **ACCEPTED** | MTG-005, MTG-006, MTG-007 (Confidential meeting minutes with strict permission gates, action item tracking with assignee status transitions and member validation, invitation/cancellation/reschedule email dispatch without body leaks) | Formally accepted after acceptance review |
| **Phase 7C** | Meetings Full E2E & Access Regression | **ACCEPTED** | MTG-001, MTG-002, MTG-003, MTG-004, MTG-005, MTG-006, MTG-007 (Complete 10 meetings user journeys, multi-tenant ID tampering regression, RLS isolation & context cleanup under managex_app, composite FK enforcement, dynamic permission/module revocation, zero confidential body leak in audit/emails) | Formally accepted |
| **Phase 8A** | Projects Core & Membership | **ACCEPTED** | PRJ-001, PRJ-002 (Project model, start & target dates, priorities, canonical 5-status lifecycle, resource-scoped project memberships, owner invariant, clean enterprise UI) | Formally accepted |
| **Phase 8B** | Tasks Model, List & Kanban Views | **ACCEPTED** | PRJ-003, PRJ-004, PRJ-005, PRJ-006 (Task data model, composite FK tenant isolation, canonical 5-status state machine, assignee validation, member removal guards, Kanban & List views, server-side filtering & due-date calculations) | Formally accepted after acceptance review |
| **Phase 8C** | Comments/Activity & Projects E2E | **ACCEPTED** | PRJ-007, PRJ-008 (Plain-text task comments with bounds & moderation, soft deletion preserving author/timestamp, archived project lockout, chronological activity timeline, no comment bodies in audit logs, tenant isolation under managex_app) | Formally accepted after acceptance review |
| **Phase 9** | Platform Administration Console | **ACCEPTED** | PLAT-001, PLAT-002, PLAT-003, PLAT-004, PLAT-005, PLAT-006, PLAT-007, SEC-009 (Platform console namespace & layout segregation, global account listing & suspension without secret exposure, customer workspace operational inspection & non-destructive suspension, fixed 3-module availability management, least-privilege Support Agent role, zero support ticketing scope, immutable platform audit trail, NOBYPASSRLS runtime isolation) | Formally accepted after acceptance review |
| **Phase 10** | Hardening, Performance & Security Audit | **COMPLETED** | SEC-001, SEC-002, SEC-005, SEC-006, SEC-007, SEC-008, OPS-005, UI-005 (Bcrypt factor 12 & login timing attack mitigation, 6-tier pipeline, SQLi/XSS/SSRF fuzzing, production security headers & restrictive CORS, 100KB payload limit, rate limiting, zero secret leaks, exhaustive cross-tenant RLS CRUD matrix under managex_app, connection pool resilience, p95 read < 200ms, p95 write < 500ms, 1000-row pagination < 2.0s with index scan, WCAG 2.2 AA accessibility verification) | Ready for Phase 10 Acceptance Review |
| **Phase 11** | Staging/Production Deployment Readiness | PENDING | None | Blocked on Phase 10 Acceptance |

---

## Phase 0 Deliverables Summary
- All 99 requirement IDs from `docs/PRD.md` mapped to phase, UI, API, DB, and test criteria in [`requirements-traceability.md`](file:///d:/manageX/docs/requirements-traceability.md).
- Architectural specifications completed in [`architecture.md`](file:///d:/manageX/docs/architecture.md).
- Data model and RLS design completed in [`database.md`](file:///d:/manageX/docs/database.md).
- Threat model and 6-tier authorization pipeline documented in [`security.md`](file:///d:/manageX/docs/security.md).
- Standard JSON envelopes and complete endpoint inventory documented in [`api-contracts.md`](file:///d:/manageX/docs/api-contracts.md).
- Step-by-step phased roadmap documented in [`implementation-plan.md`](file:///d:/manageX/docs/implementation-plan.md).
- Test strategy and high-risk security suites documented in [`testing.md`](file:///d:/manageX/docs/testing.md).
- Hosting topology, env var inventory, and free-tier disclosure in [`deployment.md`](file:///d:/manageX/docs/deployment.md).
- Operational procedures, backup, and recovery in [`runbook.md`](file:///d:/manageX/docs/runbook.md).
- 18 architectural decisions logged in [`decisions/decision-log.md`](file:///d:/manageX/docs/decisions/decision-log.md).
- 18 out-of-scope future suggestions cataloged in [`future-suggestions.md`](file:///d:/manageX/docs/future-suggestions.md).

---

## Phase 1 Deliverables Summary
- Canonical monorepo structure created: `frontend/`, `backend/`, `database/`, `tests/`, `docs/`.
- Frontend workspace: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router v6+.
- Clean Enterprise design system implemented: 20 accessible shared UI primitives in `frontend/src/components/ui/`.
- Public, Workspace, and Platform layout shells and navigational hierarchy implemented.
- Central typed frontend API client with safe Render free-tier cold-start handling (bounded polling, waking banner, mutation auto-replay prevention).
- Backend workspace: Node.js 20+, Express.js, native JavaScript ES Modules (`.js` only).
- Standard JSON envelope handlers (`responses.js`, `errors.js`).
- Structured middleware: `requestId.js` (`X-Request-Id`), deep secret-redacting `logger.js` (`OPS-004`), `cors.js`, `notFoundHandler.js`, `errorHandler.js`.
- Startup environment validation with secret redaction in `env.js` (`OPS-002`).
- Health and readiness endpoints: `GET /api/v1/health` and `GET /api/v1/ready` (`OPS-001`).
  - *Readiness Scope Clarification:* The current `/api/v1/ready` endpoint verifies configured runtime secrets and process-level readiness. It does not verify PostgreSQL connectivity because Phase 1 has no database connection pool. Database readiness verification remains pending and must be implemented during Phase 2, when the database connection pool is established. The database-readiness portion of `OPS-001` is strictly not marked as verified.
  - *Tenant Context Invariant:* Approved canonical organisation context setting remains `app.current_organisation_id`.
- Test suites: Backend tests (`node:test`) and frontend tests (`vitest`) passing 100%. Frontend typecheck (`tsc`) and production build passing with 0 errors.

---

## Phase 2 Deliverables Summary
- **PostgreSQL Migration Workflow (`database/migrate.js`):** Transactional migration runner with checksum verification, deterministic ordering, and failure rollback.
- **Versioned Core Schema Migrations:**
  - `20261017000001_setup_roles.sql`: Creates restricted runtime role `managex_app` with `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`.
  - `20261017000002_core_schema.sql`: Foundational tables (`users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`, `organisations`, `organisation_memberships`, `invitations`, `permissions`, `roles`, `role_permissions`, `membership_roles`, `modules`, `organisation_module_entitlements`, `audit_logs`) with tenant-aware composite foreign keys (`fk_membership_roles_member_tenant`).
  - `20261017000003_rls_policies.sql`: Enables and enforces `FORCE ROW LEVEL SECURITY` across all 7 tenant tables. Grants least-privilege DML (`SELECT, INSERT, UPDATE, DELETE`) to `managex_app` and revokes `UPDATE, DELETE, TRUNCATE` on `audit_logs` (ADR-012 immutability).
  - `20261017000004_seed_reference.sql`: Seeds reference catalogue for modules (`events`, `meetings`, `projects`), scoped permissions (`platform.*`, `org.*`, `event.*`, `meeting.*`, `project.*`), and built-in system roles (`organisation_owner`, `organisation_admin`, `organisation_member`). Zero fake credentials or test tenants.
- **Connection Pool & Bounded Readiness (`backend/src/platform/database/pool.js` & `ready.js`):** Connection pool with graceful shutdown; `/api/v1/ready` now performs bounded active database probe (`SELECT 1` within 3s), returning HTTP 200 with `{ status: 'ready', database: 'connected' }` or HTTP 503 `DATABASE_UNAVAILABLE` without leaking credentials.
- **Transaction-Scoped Tenant Context Helper (`backend/src/platform/database/transaction.js`):** Implements `withTenantTransaction` setting canonical `app.current_user_id`, `app.current_organisation_id`, and `app.current_is_platform_admin` with `is_local = true` on a pinned checked-out client.
- **Automated PostgreSQL Integration Test Suite (`backend/src/platform/database/rls.integration.test.js`):** 11 comprehensive tests executed live against PostgreSQL under `managex_app` runtime role:
  1. Role permissions: verified `rolsuper: false`, `rolbypassrls: false`.
  2. Fail closed on missing context: verified 0 rows returned on unauthenticated queries.
  3. Cross-tenant read isolation: verified Tenant A context cannot see Tenant B rows.
  4. Cross-tenant write isolation: verified inserting Tenant B row in Tenant A context throws RLS `42501`.
  5. Composite foreign key integrity: verified referencing foreign membership throws `23503`.
  6. Connection pool context leak prevention: verified context resets cleanly between transactions.
  7. Audit log immutability: verified `UPDATE` and `DELETE` on `audit_logs` throw `42501`.
  8. Transaction rollback: verified failed operations discard all partial writes.
  9. Migration tracking immutability: verified `SELECT` works but `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` on `schema_migrations` throw `42501`.
  10. System reference data immutability: verified `SELECT` works but DML mutations on `modules`, `permissions`, and `role_permissions` throw `42501`.
  11. Legitimate runtime operations: verified tenant-scoped CRUD operations (`INSERT`, `SELECT`, `UPDATE`, `DELETE`) on application tables function smoothly.
- **Security Hardening Migration (`20261017000005_tighten_runtime_privileges.sql`):**
  - Revoked `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` from `managex_app` on `schema_migrations`, `modules`, `permissions`, and `role_permissions`.
  - Granted `SELECT` on these catalogue and audit tables.
  - Maintained default privileges on future tenant application tables and sequences.

---

## Phase 3 Deliverables Summary
- **Registration with Normalized Email & Bcrypt Hashing (`AUTH-001`):** Server-authoritative Zod validation, email lower-case normalization, and password hashing via bcrypt (work factor 12) per ADR-017.
- **Expiring Single-Use Email Verification Tokens (`AUTH-002`):** Cryptographic 32-byte hex tokens, stored as SHA-256 hashes with 24-hour expiration. Single-use enforcement verified: verified email transitions account status to `active` and prevents token reuse.
- **Secure Login & Logout with Anti-Enumeration Protection (`AUTH-003`):** Constant-time credential checks prevent email existence disclosure; unverified and suspended accounts fail closed (HTTP 403); logout invalidates the session server-side.
- **Password Recovery & Immediate Multi-Session Revocation (`AUTH-004`):** Single-use 60-minute reset tokens stored as SHA-256 hashes; completing reset updates password and immediately revokes all active sessions for that user across all devices.
- **Server-Managed Session Lifecycle (`AUTH-005`):** 30-minute sliding idle window and 7-day absolute lifetime cap, stored in `sessions` table as SHA-256 hashes. Verified via HttpOnly SameSite=Lax session cookies.
- **Rate Limiting (`AUTH-006`):** In-memory sliding window rate-limiting middleware protecting registration, login, and password recovery endpoints.
- **Cookie & CSRF Security (`AUTH-007`):** HttpOnly, SameSite=Lax session cookies; double-submit CSRF token protection with `X-CSRF-Token` header verification on state-changing mutation requests.
- **Email Abstraction (`AUTH-008`):** Shared email service with SMTP support via `nodemailer` and in-memory mailbox fallback for local development/test environments.
- **Automated Test Evidence:** 34 passing backend tests (including 13 comprehensive auth integration tests against PostgreSQL 17) and 8 passing frontend tests.

---

## Phase 4 Deliverables Summary
- **Atomic Organisation Creation & Initial Owner (`ORG-001`):** `POST /api/v1/organisations` creates organisation record, initial active membership, and assigns `organisation_owner` role atomically in a single PostgreSQL transaction with RLS context (`withSystemTransaction`).
- **Multiple Organisation Listing & Scoped Access (`ORG-002`):** `GET /api/v1/organisations` returns only organisations where caller possesses active membership, fully isolated across tenants.
- **Organisation Context & Dynamic Switcher (`ORG-003`):** `OrgContext.tsx` and `WorkspaceLayout.tsx` manage active organisation state, provide seamless switching, and invalidate cached data on switch or logout.
- **Membership Lifecycle & Roster (`ORG-004`, `ORG-007`):** `GET /api/v1/organisations/:orgId/members` displays active roster and pending invites. Statuses (`invited`, `active`, `suspended`, `removed`) guarded with anti-escalation preventing non-owners from modifying owners or granting owner privileges.
- **Expiring Single-Use Email Invitations (`ORG-005`):** `POST /api/v1/organisations/:orgId/invitations` generates 32-byte cryptographically secure tokens, hashes them via SHA-256, enforces 7-day expiration, and dispatches email via `emailService`. `POST .../revoke` revokes pending invitations.
- **Safe Invitation Onboarding & Acceptance (`ORG-006`):** Public inspection endpoint `GET /api/v1/invitations/:token` and atomic acceptance endpoint `POST /api/v1/invitations/:token/accept`. Enforces strict email identity matching (`EMAIL_MISMATCH` 403 on mismatched session) and idempotent membership activation.
- **Step-Up Ownership Transfer (`ORG-008`):** `POST /api/v1/organisations/:orgId/transfer-owner` requires current owner's password reauthentication via bcrypt, swaps target member to `organisation_owner`, and demotes initiator to `organisation_admin` atomically.
- **Approved Settings Management (`ORG-009`):** `PATCH /api/v1/organisations/:orgId` enforces Zod schema validation allowing only approved fields (`name`), protected by `org.edit` permission.
- **Final-Owner Protection & Leave Guard (`ORG-010`):** `POST /api/v1/organisations/:orgId/leave` and membership status updates prevent sole active owner from demoting, suspending, removing, or leaving the organisation (`FINAL_OWNER_PROTECTION` 409).
- **Append-Only Audit Logging (`AUD-001` - `AUD-005`):** Immutable audit trail recorded for all organisation and membership events with automatic redaction of sensitive credentials.
- **Database Migrations Added:** Migration `20261017000006_membership_roles_user_policy.sql` and `20261017000007_refine_membership_roles_user_select.sql` applied. Enforces strict organisation-scoped isolation for all DML and provides a dedicated `FOR SELECT` policy (`membership_roles_user_select`) that safely exposes only the active user's own roles when organisation context is unset.
- **Concurrency & Failure Hardening:** Row-level locks on `organisations` serialize concurrent owner demotions/leaves, preventing 0-owner states. Concurrent invitation acceptances utilize `ON CONFLICT` to eliminate race conditions. Email delivery failures throw `ServiceUnavailableError` (HTTP 503) and rollback un-emailed invitations.
- **Automated Test Evidence:** 58 passing backend tests (including 24 comprehensive organisation lifecycle, concurrency, RLS policy boundary, and email failure integration tests) and 8 passing frontend tests. TypeScript build (`tsc && vite build`) and ESLint pass with 0 errors.

---

## Phase 5 Deliverables Summary
- **RBAC Roles & Central Permission Catalogue (`RBAC-001`, `RBAC-002`, `RBAC-003`):**
  - Seeded 60 permissions across three independent scopes: `platform` (5), `organisation` (14), and `module` (41) via migration `20261017000008_seed_rbac_roles_permissions.sql`.
  - Machine-readable endpoint `GET /api/v1/organisations/:orgId/permissions` returning full catalogue categorized by scope and actions.
  - Seeded 18 baseline system roles with 231 role-permission mappings (including Platform Super Admin, Organisation Owner, Organisation Admin, Organisation Member, plus PRD-defined baseline roles for Events, Meetings, and Projects).
  - Enforced role scope isolation: platform-scoped roles cannot be assigned to organisation members (`INVALID_ROLE_SCOPE` 403).
- **Anti-Escalation & Role Assignment Safety (`RBAC-004`, `RBAC-005`, `RBAC-006`):**
  - Implemented `POST /api/v1/organisations/:orgId/members/:userId/roles` and `DELETE /api/v1/organisations/:orgId/members/:userId/roles/:roleSlug` with least privilege and anti-escalation validation: callers cannot grant roles possessing permissions beyond their own permission set (`INSUFFICIENT_PERMISSIONS` 403).
  - Sole-owner protection enforced on role revocation: removing `organisation_owner` role from the sole active owner is rejected with `FINAL_OWNER_PROTECTION` (409).
  - Module role scoping: module roles granted in Org A remain strictly isolated to Org A.
- **Multi-Role Aggregation (`RBAC-004`):**
  - Updated `requireOrgMembership` middleware to aggregate all assigned roles from `membership_roles` for each member (`req.membership.roles` and `req.membership.permissions`), mapping canonical permission aliases.
  - `listOrganisationMembers` returns deduplicated members with aggregated role references and individual role badges.
- **Module Catalogue & Entitlements (`MOD-001`, `MOD-002`, `MOD-003`, `MOD-004`, `MOD-005`):**
  - Added `is_platform_available BOOLEAN NOT NULL DEFAULT true` to `modules` table.
  - `GET /api/v1/organisations/:orgId/modules` lists all platform modules with independent platform-availability and organisation activation state.
  - `PATCH /api/v1/organisations/:orgId/modules/:moduleKey` allows Organisation Owners/Admins (`org.modules.manage`) to toggle module activation.
  - Deactivation is non-destructive (ADR-016): tables and data remain preserved.
  - Fail-closed route guard middleware `requireModuleEntitlement(moduleSlug)` rejects requests to disabled modules with HTTP 403 (`MODULE_DISABLED` or `MODULE_UNAVAILABLE`).
  - Independent activation with zero billing, credit card, or payment dependencies in MVP (`MOD-005`).
- **Organisation-Scoped Audit Log Querying (`AUD-004`, `API-004`):**
  - Implemented `GET /api/v1/organisations/:orgId/audit-logs` supporting bounded pagination (`page`, `limit` default 20, max 100), total record metadata, and optional filtering by action.
  - Only accessible to Organisation Owners and Admins (`org.audit.view`); non-privileged members fail closed with HTTP 403.
- **Frontend Management Interfaces & Design System Alignment:**
  - `OrgModulesPage.tsx`: Clean Enterprise module management interface with status badges, activation toggles, platform availability warnings, and non-destructive data notices.
  - `OrgAuditLogsPage.tsx`: Append-only audit trail viewer with action badges, actor info, client IP, action filtering, and accessible pagination.
  - `MembersPage.tsx` enhanced: Multi-role badges and "Manage Roles" dialog with real-time assignment, revocation, anti-escalation, and final-owner protection.
  - `WorkspaceLayout.tsx`: Updated sidebar with "Modules & Entitlements" and "Security & Audit Log" navigation links, and dynamic module status indicators.
  - `ModulePlaceholderPage.tsx`: Real-time server-side entitlement check displaying deactivated state and quick link to module settings.
- **Automated Verification & Evidence:**
  - Backend: 71/71 tests passing across 7 suites in `npm test` (including 13 comprehensive Phase 5 tests in `rbac_modules.integration.test.js`).
  - Backend lint: `npm run lint` passes with 0 errors.
  - Frontend: 8/8 tests passing in `vitest`.
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes in 13.29s with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.

---

## Phase 6A Deliverables Summary (ACCEPTED)
- **Core Event Data Model (`EVT-001`):**
  - Migration `20261017000009_events_core.sql` applied. Created `events` table with composite foreign key referencing `organisations(id)`.
  - Stored timestamps in standard UTC ISO 8601 with explicit IANA timezone column (`timezone VARCHAR(64) NOT NULL`).
  - Check constraints for date ordering (`start_at < end_at`), registration window ordering (`registration_opens_at < registration_closes_at`), and valid event types (`general_event`, `hackathon`), visibilities (`public`, `private`), and location types (`in_person`, `virtual`, `hybrid`).
  - Terminal state edit locking: `completed` and `archived` events cannot be updated via API.
- **Canonical 7-Status Lifecycle State Machine (`EVT-002`):**
  - PRD §7.2 canonical statuses: `draft`, `published`, `registration_closed`, `in_progress`, `completed`, `cancelled`, `archived`.
  - Concurrency-safe transition validation with `SELECT ... FOR UPDATE` row-level locks on `events`.
  - Valid transition matrix strictly enforced: illegal jumps (e.g. `draft` -> `completed`) fail closed with HTTP 409 Conflict.
- **Visibility and Draft Filtering (`EVT-003`):**
  - `GET /api/v1/organisations/:orgId/events`: draft and private events strictly hidden from non-organisers without `event.read_draft` permission.
  - `GET /api/v1/events` and `GET /api/v1/events/public`: unauthenticated public endpoint strictly filters for `status = 'published'` and `visibility = 'public'`.
- **Frontend Management UI:**
  - `EventsListPage.tsx`: Clean Enterprise event listing with status filters, badges, and creation modal.
  - `EventDetailPage.tsx`: Lifecycle state machine action buttons, timezone & venue cards, and event overview.
- **Verification Evidence:**
  - Suite `backend/src/platform/events/events.integration.test.js`: 13/13 passing tests verifying date ordering, timezone validation, 7-state transitions, invalid transition rejection, edit lockout on terminal states, draft hiding, and public listing filtering.

---

## Phase 6B Deliverables Summary (COMPLETED)
- **Event Registration Data Model (`EVT-004`, `EVT-005`):**
  - Migration `20261017000010_event_registrations.sql` created and applied.
  - Created `event_registrations` table with composite foreign key `(organisation_id, event_id) REFERENCES events(organisation_id, id) ON DELETE RESTRICT`.
  - Unique constraint `uq_event_registrations_event_user` (`event_id, user_id`), status constraint `chk_event_registrations_status` (`registered`, `withdrawn`), and timestamps (`registered_at`, `withdrawn_at`, `reactivated_at`).
  - Enabled and forced PostgreSQL Row-Level Security with policies for SELECT, INSERT, UPDATE, DELETE, granting DML to `managex_app`.
- **Registration Workflow & Window Rules (`EVT-004`, `EVT-005`, ADR-008):**
  - Implemented `getEffectiveRegistrationWindow(event)`: `registration_opens_at` defaults to event creation/publication; `registration_closes_at` defaults to event `start_at`.
  - Status check: only `published` events accept registrations; `draft`, `registration_closed`, `in_progress`, etc., reject registration with HTTP 409 Conflict.
  - Window check: registration before opening or after closing is rejected with HTTP 409 Conflict.
- **Transactional Capacity & Concurrency Locking (`EVT-005`):**
  - `SELECT ... FOR UPDATE` row-level lock on `events` inside `withOrgTransaction`.
  - Active registrations counted (`WHERE status = 'registered'`). If `activeCount >= capacity`, registration is rejected with HTTP 409 Conflict (`EVENT_FULL`).
  - Concurrent registration attempts are serialized under row locks.
- **Duplicate Prevention & Reactivation (`EVT-004`):**
  - If user is already actively registered, returns HTTP 409 Conflict (`ALREADY_REGISTERED`).
  - If user previously withdrew, reactivates registration: status updated to `registered`, `reactivated_at = NOW()`, preserving initial `registered_at` timestamp.
- **Withdrawal & Cancellation (`EVT-005`):**
  - `POST /api/v1/organisations/:orgId/events/:eventId/withdraw`: transitions status to `withdrawn` while registration window is open, recording `withdrawn_at`.
  - Once registration window closes, withdrawals are blocked.
- **External Participant Isolation Boundary (`EVT-004`, ADR-003):**
  - Middleware `resolveOrgContext` resolves organisation context and verifies organisation is active without requiring organisation membership.
  - External participants register and view their own registration using verified user session.
  - Strict tenant isolation: external participants receive NO organisation membership and are rejected with HTTP 403 Forbidden from accessing general organisation endpoints (`/organisations/:orgId`).
- **Staff Participant Roster (`EVT-004`, `EVT-005`):**
  - `GET /api/v1/organisations/:orgId/events/:eventId/participants`: requires organisation membership with `event.view`.
  - Supports bounded pagination (`page`, `limit`), search by user name/email, and status filtering (`registered`, `withdrawn`). Returns active registration count and capacity summary.
- **Frontend Registration & Roster Experience:**
  - `EventDetailPage.tsx` updated with:
    - Real-time registration card displaying effective window (opens/closes) and status badge.
    - "Register for Event" button for verified users.
    - "Withdraw Registration" button with confirmation dialog.
    - "Re-register" button for withdrawn users.
    - Capacity and slot indicator (e.g., active registrations vs capacity).
    - Event Staff "Participants Roster" with search, filter tabs (All, Active, Withdrawn), registrant table with avatar and timestamps, and accessible pagination.
  - `PublicEventDetailPage.tsx` updated with:
    - Confidential participant instructions delivered solely via authenticated `my-registration` response for `status === 'registered'`.
    - Dynamic action states: unauthenticated CTA redirect, registered badge + instructions + withdrawal prompt, withdrawn notice + re-registration button.
    - Public serializer (`formatPublicEventRow`) categorically omits `participant_instructions` from public payloads.
- **Participant Area & My Registrations Dashboard (`/events/dashboard`, `EVT-004`, `EVT-005`):**
  - Enhanced `StudentDashboardPage.tsx` with:
    - Quick stats summary counters: Active Registrations, Withdrawn, Past Events, and Total Enrolled.
    - Category filter tabs: All Events, Active, Withdrawn, and Past Events with dynamic counts and tailored empty states.
    - Enriched registration metadata: Displays `registered_at`, `reactivated_at`, `withdrawn_at`, and event lifecycle state.
    - Re-registration CTA for withdrawn participants linking directly to event registration.
    - Confidential participant instructions delivered solely to active confirmed registrants.
  - Route precedence: Static `/events/dashboard` declared before dynamic `/events/:eventId` in `App.tsx`.
  - Authentication guard: Protected by `<RequireAuth />` redirecting unauthenticated users to `/auth/login` with safe return path.
- **Automated Verification & Evidence:**
  - Frontend vitest: 63/63 tests passing across 11 suites (including 4 new tests in `StudentDashboardPage.test.tsx` and route precedence test in `App.test.tsx`).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes cleanly in 13.70s.
  - Backend integration tests: **NOT VERIFIED** due to local environment port mismatch (`backend/.env` configured with port 5433 while host PostgreSQL is on port 5432, resulting in `ECONNREFUSED`). Both `/api/v1/events/participant/dashboard` and `/api/v1/events/my-registrations` routes are wired to `getParticipantDashboard(req.user.id)`.

---

## Phase 6C Deliverables Summary (ACCEPTED)

- **Database Migration 011 (`20261017000011_hackathon_teams_submissions.sql`):**
  - Extended `events` table with `team_size_min` (default 1), `team_size_max` (default 10, max constraint 100), `submission_opens_at`, `submission_closes_at`.
  - Created `event_teams`: `(id, organisation_id, event_id, name, slug, description, created_by_id, created_at, updated_at)` with `UNIQUE(event_id, slug)`.
  - Created `event_team_members`: `(id, organisation_id, event_id, team_id, user_id, is_owner, joined_at)` with `UNIQUE(event_id, user_id)` enforcing that a participant can belong to at most one team per event.
  - Created `event_team_invitations`: `(id, organisation_id, event_id, team_id, invited_email, token_hash, status, expires_at)` with 7-day single-use invitation lifecycle.
  - Created `event_submissions`: `(id, organisation_id, event_id, team_id, submitter_user_id, title, description, repository_url, demo_url, custom_fields, status)`.
  - Enabled and forced PostgreSQL RLS across all new tables with DML grants to `managex_app`.
- **Hackathon Team Lifecycle (`EVT-006`, ADR-007):**
  - Team creation restricted to `hackathon` event type and active registered participants.
  - Team creator automatically becomes the team owner (`is_owner = true`).
  - Single team membership constraint enforced at database and application level (`UNIQUE(event_id, user_id)`).
  - Single-use 7-day invitation tokens generated with SHA-256 hash storage; invitee must be a registered participant.
  - Capacity limits: teams strictly cannot exceed `team_size_max`.
  - Leaving/removing team members with ownership safeguards.
- **URL-Based Submissions & SSRF Protection (`EVT-007`):**
  - Strictly URL-based submissions (`repository_url`, `demo_url`) without file blobs.
  - URL scheme validated strictly for `http:` and `https:`.
  - SSRF invariant: backend never fetches, proxies, or pings submitted URLs; stored purely as textual links.
  - Submission window enforcement: submissions accepted only between `submission_opens_at` and `submission_closes_at`.
  - Team-owned submission: any active team member can create or edit the team's submission during the open window.
- **Frontend Experience (`EventDetailPage.tsx`):**
  - Dynamic "Hackathon Teams" card for `eventType === 'hackathon'`.
  - "Create Team" dialog with name, slug, and description inputs.
  - "Invite Team Member" dialog with invitation link generator.
  - "Leave Team" button with confirmation modal.
  - "Project Submissions" card showing current active team submission, submission window status, repository link, demo URL, and timestamp.
  - "Submit Project" / "Edit Submission" modal with client-side URL validation.
- **Automated Verification & Evidence:**
  - Backend: 115/115 tests passing across 10 test suites in `npm test` (including 18 comprehensive Phase 6C integration tests in `teams_submissions.integration.test.js`).
  - Frontend: 8/8 tests passing in `vitest`.
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors.

---

## Phase 6D Deliverables Summary (ACCEPTED)

- **Database Migration 012 (`20261017000012_judge_scoring_results.sql`):**
  - Extended `events` table with `results_published_at TIMESTAMPTZ` and `results_published_by_id UUID`.
  - Added composite foreign key constraint `uq_event_submissions_id_org` to `event_submissions` for tenant-safe composite foreign keys.
  - Created `event_scoring_criteria`: `(id, organisation_id, event_id, name, description, order_index, max_score, created_at, updated_at)` with `max_score > 0 AND max_score <= 100`, `UNIQUE(event_id, name)`.
  - Created `event_judge_assignments`: `(id, organisation_id, event_id, judge_user_id, submission_id, assigned_by_id, created_at)` with `UNIQUE NULLS NOT DISTINCT (event_id, judge_user_id, submission_id)`.
  - Created `event_scores`: `(id, organisation_id, event_id, submission_id, criterion_id, judge_user_id, score, feedback, created_at, updated_at)` with `score >= 0 AND score <= 100`, `UNIQUE (event_id, submission_id, criterion_id, judge_user_id)`.
  - Enabled and forced PostgreSQL RLS across all new tables with DML grants to `managex_app`.
- **Criteria & Judge Assignments (`EVT-008`):**
  - Configurable scoring criteria with individual max scores (1..100) managed by event managers/admins (`event.edit`).
  - Edit lockout safeguard: criteria cannot be added or deleted once scoring has started (`SCORING_ALREADY_STARTED` 409).
  - Flexible judge assignment supporting both global event-wide evaluation and submission-specific assignment (`event.participant.manage`).
- **Private Scoring & Judge Assigned Work (`EVT-008`):**
  - Judges list and view ONLY their assigned submissions and scoring fields (`GET /api/v1/organisations/:orgId/events/:eventId/judge-work`).
  - Unassigned judges or external non-members cannot query judge work or submit scores.
  - Score validation: each criterion score strictly bounded between 0 and configured `maxScore` with optional feedback.
  - Confidentiality invariant: unpublished scores and judge feedback remain strictly private and hidden from participants and public visitors.
- **Controlled Result Calculation & Publication (`EVT-009`, ADR-009):**
  - Straight sum of criterion scores across assigned judges; score weights avoided for MVP simplicity.
  - Standard competition ranking with shared ranks for tied scores; no arbitrary or hidden tie-breakers.
  - Completeness validation: publication is strictly blocked with HTTP 409 (`INCOMPLETE_EVALUATION`) until all assigned judges submit scores for all required criteria on all submissions.
  - Publication controls: authorised event managers (`event.result.publish`) can review calculated results, publish official rankings, and unpublish if needed.
  - Public visibility: once published, official rankings, team names, project titles, and total scores become accessible via public endpoints (`/api/v1/events/:eventId/results`).
  - Immutable audit trail recorded for all criteria mutations, judge assignments, score submissions, and result publication/unpublication.
- **Frontend Experience (`EventDetailPage.tsx`):**
  - Leaderboard & Results card: Displays official published rankings with rank badges, team names, project links, total score, and Publish/Unpublish controls with confirmation dialogs.
  - Judge Evaluation Work card: Displays assigned submissions to judges, completion status, and "Score Submission" modal with real-time numeric inputs and feedback textareas.
  - Criteria & Judge Assignments management card: Displays configured criteria and assigned judges with "Add Criterion" dialog and "Assign Judge" dialog.
- **Automated Verification & Evidence:**
  - Backend: 135/135 tests passing across 11 test suites in `npm test` (including 20 comprehensive Phase 6D integration tests in `judging_results.integration.test.js`).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors in 13.28s.

---

---

## Phase 7A Deliverables Summary (ACCEPTED)
- **Database Migration (`20261017000013_meetings_core.sql`):**
  - Created `meetings`: `(id, organisation_id, title, description, start_at, end_at, timezone, location_type, location, virtual_url, visibility, status, organiser_id, created_by_id, created_at, updated_at)` with `CHECK (start_at < end_at)`, canonical statuses `('scheduled', 'in_progress', 'completed', 'cancelled')`, visibility `('organisation', 'attendees_only')`, and composite unique key `(id, organisation_id)`.
  - Created `meeting_attendees`: `(id, organisation_id, meeting_id, user_id, external_email, role, rsvp_status, invited_at, responded_at, created_at, updated_at)` with FK cascade to `meetings`, roles `('organiser', 'participant', 'guest')`, RSVP statuses `('pending', 'accepted', 'declined', 'tentative')`, and partial unique indexes `uq_meeting_attendees_internal` on `(meeting_id, user_id) WHERE user_id IS NOT NULL` and `uq_meeting_attendees_external` on `(meeting_id, external_email) WHERE external_email IS NOT NULL`.
  - Created `meeting_agenda_items`: `(id, organisation_id, meeting_id, title, description, duration_minutes, order_index, created_by_id, created_at, updated_at)` with FK cascade to `meetings`.
  - Enabled and forced PostgreSQL RLS across all 3 tables with DML granted to restricted role `managex_app`.
- **Backend Services & Lifecycle Engine (`MTG-001`, `MTG-002`, PRD §8.1):**
  - Canonical 4-status lifecycle: `scheduled` -> `['in_progress', 'completed', 'cancelled']`, `in_progress` -> `['completed', 'cancelled']`. Terminal state enforcement prevents transitions or edits on `completed` and `cancelled` meetings.
  - Explicit IANA timezone validation (`Intl.DateTimeFormat`) and UTC timestamp storage with date ordering (`start_at < end_at`).
  - Automatic attendee registration: Organiser is automatically added as an accepted attendee upon creation.
- **Attendance & Visibility Access Control (`MTG-003`, PRD §8.3):**
  - `organisation` meetings are visible to all active members of the tenant.
  - `attendees_only` meetings are restricted: ordinary non-attendee members receive 403 on detail queries and have records excluded from list queries.
  - Internal members and external guests can be invited as attendees with duplicate prevention.
  - RSVP management: Attendees can update their status (`accepted`, `declined`, `tentative`).
  - Sole organiser protection: Removing the meeting's sole organiser is rejected with 409 `CANNOT_REMOVE_ORGANISER`.
- **Structured Agendas (`MTG-004`, PRD §8.2):**
  - Ordered agenda items with title, duration in minutes, and description.
  - Atomic reordering via `PUT /api/v1/organisations/:orgId/meetings/:meetingId/agenda/reorder`.
- **Frontend Experience (`MeetingsPage.tsx`, `MeetingDetailPage.tsx`, `ScheduleMeetingDialog.tsx`):**
  - Meetings list with filter tabs (Upcoming, Past, All), status filter, title search, and meeting cards with badges, formatted date/time in timezone, location link, attendee count, and agenda count.
  - Schedule meeting modal with IANA timezone selector, date range validation, location options, and visibility controls.
  - Detail page with lifecycle transition actions (Start, Complete, Cancel), RSVP response actions, attendees roster with invite dialog, and ordered agenda with up/down reordering.
- **Automated Verification & Evidence:**
  - Backend: 156/156 tests passing across 12 test suites in `npm test` (including 21 comprehensive Phase 7A integration tests in `meetings.integration.test.js`).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors in 23.67s.

---

## Phase 7B Deliverables Summary (COMPLETED)
- **Database Migration (`20261017000014_meeting_notes_actions.sql`):**
  - Created `meeting_notes`: `(id, organisation_id, meeting_id, content, created_by_id, updated_by_id, created_at, updated_at)` with `UNIQUE(meeting_id)`, FK cascade to `meetings(id, organisation_id)`, RLS enabled & forced, DML granted to restricted role `managex_app`.
  - Created `meeting_action_items`: `(id, organisation_id, meeting_id, title, description, assignee_id, due_date, priority, status, agenda_item_id, created_by_id, created_at, updated_at)` with FK cascade to `meetings(id, organisation_id)`, `priority IN ('low', 'medium', 'high', 'urgent')`, `status IN ('open', 'in_progress', 'done', 'cancelled')`, RLS enabled & forced, DML granted to restricted role `managex_app`.
- **Confidential Minutes Access Control (`MTG-005`, PRD §8.2, ADR-014):**
  - Invariant enforced: Attendee status alone does NOT grant access to confidential minutes. Non-permitted attendees attempting `GET /notes` receive 403 `FORBIDDEN_NOTES_ACCESS` and attempting `PUT /notes` receive 403 `FORBIDDEN_NOTES_MANAGE`.
  - Only meeting organiser and users with `meeting.notes.read` / `meeting.notes.manage` / `org.admin` / `org.owner` can read or author notes.
  - Auditing privacy invariant: Note bodies are strictly excluded from audit log metadata (`metadata: { meetingId, length }`).
  - Cancelled meetings cannot author or edit minutes (409 `MEETING_CANCELLED`).
  - Content length validation: bounded from 1 to 50,000 characters.
- **Action Items & Canonical Transitions (`MTG-006`, PRD §8.2):**
  - Assignee validation: Assignee must be an active member of the host organisation (rejected with 422 `VALIDATION_ERROR` if not an active member).
  - Source agenda validation: If specified, agenda item must belong to the same meeting and organisation (422 `VALIDATION_ERROR`).
  - Canonical lifecycle: `open` -> `['in_progress', 'done', 'cancelled']`, `in_progress` -> `['open', 'done', 'cancelled']`.
  - Terminal states: `done` and `cancelled` action items cannot be transitioned (locked with 409 `ACTION_ITEM_TERMINAL_STATE`).
  - Assignee restricted mutations: Assignees without manager permissions can ONLY update the `status` of their assigned action item; mutating management fields (`title`, `assigneeId`, `priority`, etc.) is rejected with 403 `FORBIDDEN_ACTION_FIELD_UPDATE`.
  - Manager/Organiser capabilities: Update full metadata, reassign active members, or delete action items with audit logging.
- **Email Notifications & Invitations (`MTG-007`, PRD §8.3, ADR-010):**
  - Reused existing email abstraction (`sendEmail` in `backend/src/platform/email/emailService.js`).
  - `POST /api/v1/organisations/:orgId/meetings/:meetingId/send-invites`: Dispatches structured meeting invitation emails with dates, timezone, location, and organiser details to pending attendees.
  - Safe failure handling: Delivery errors are logged safely without aborting database transactions, returning delivery logs with `sentCount` and `failedCount`.
  - Automatic status notifications:
    - Rescheduling (`startAt` or `endAt` updated): Dispatches `Updated: <Meeting Title>` email notices to all active attendees.
    - Cancellation (meeting status transitioned to `cancelled`): Dispatches `Cancelled: <Meeting Title>` email notices to all active attendees.
- **Frontend Experience (`MeetingDetailPage.tsx`, `types/meetings.ts`):**
  - Added "Send Invitations" button in the meeting header for scheduled meetings with delivery feedback banner.
  - Implemented Tab 3 ("Minutes & Notes"):
    - Displays confidentiality shield card when viewer lacks permission (`FORBIDDEN_NOTES_ACCESS`).
    - Confidential Markdown/text editor with character counter (up to 50,000 chars), author and last-updated metadata, save button, and cancellation archive state.
  - Implemented Tab 4 ("Action Items"):
    - Action item count badge in tab navigation.
    - Action items roster displaying priority badges, interactive status updater buttons, assignee info, due dates, and linked agenda topics.
    - Terminal state badges when done or cancelled.
    - Delete button for organisers/managers.
    - "Add Action Item" modal with member dropdown, priority selector, due date picker, source agenda topic selector, and description.
- **Automated Verification & Evidence:**
  - Backend: 165/165 tests passing across 12 test suites in `npm test` (including 30 comprehensive Phase 7 integration tests in `meetings.integration.test.js`).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors in 23.66s.

---

## Phase 8A Deliverables Summary (COMPLETED)
- **Database Migration (`20261017000015_projects_core.sql`):**
  - Created `projects`: `(id, organisation_id, name, description, status, priority, owner_id, start_date, target_date, created_by_id, created_at, updated_at)` with `CHECK (start_date IS NULL OR target_date IS NULL OR start_date <= target_date)`, canonical statuses `('planning', 'active', 'on_hold', 'completed', 'archived')`, priorities `('low', 'medium', 'high', 'urgent')`, and composite unique keys `(id, organisation_id)` & `(organisation_id, id)`.
  - Created `project_members`: `(id, organisation_id, project_id, user_id, role, joined_at, created_at, updated_at)` with FK cascade to `projects(id, organisation_id)` and `organisation_memberships(organisation_id, user_id)`, roles `('manager', 'contributor', 'viewer')`, and unique constraint `(project_id, user_id)`.
  - Enabled and forced PostgreSQL RLS across both tables with full DML permissions granted to restricted runtime role `managex_app`.
- **Backend Services & Lifecycle Engine (`PRJ-001`, `PRJ-002`, PRD §9.1):**
  - Canonical 5-status lifecycle:
    - `planning` -> `['active', 'on_hold', 'archived']`
    - `active` -> `['on_hold', 'completed', 'archived']`
    - `on_hold` -> `['active', 'completed', 'archived']`
    - `completed` -> `['archived']`
    - `archived` -> `[]` (Terminal immutable state; edits and transitions blocked).
  - Explicit priority validation (`low`, `medium`, `high`, `urgent`) with default `medium`.
  - Automatic owner membership: Project creator/owner is automatically enrolled as `manager` in `project_members`.
  - Owner invariants enforced:
    - Owner must be an active member of the organisation.
    - Owner cannot be removed from project members without atomic transfer of ownership.
    - Owner cannot be demoted to non-manager role while remaining owner.
    - Changing project owner automatically adds new owner as `manager` if not already present, or promotes them to `manager`.
  - Resource-scoped project access: Non-members of a project without `project.view_all` / `org.admin` / `org.owner` receive `403 PROJECT_ACCESS_DENIED`.
  - Tenant transaction consistency: `fetchFullProject` reuses transactional client preventing `READ COMMITTED` race or visibility mismatches.
- **Project Members & Access Management (`PRJ-001`, PRD §9.1):**
  - Endpoints implemented:
    - `GET /api/v1/organisations/:orgId/projects` (with `status`, `priority`, `page`, `limit` filtering)
    - `POST /api/v1/organisations/:orgId/projects`
    - `GET /api/v1/organisations/:orgId/projects/:projectId`
    - `PATCH /api/v1/organisations/:orgId/projects/:projectId`
    - `PATCH /api/v1/organisations/:orgId/projects/:projectId/status`
    - `GET /api/v1/organisations/:orgId/projects/:projectId/members`
    - `POST /api/v1/organisations/:orgId/projects/:projectId/members`
    - `PATCH /api/v1/organisations/:orgId/projects/:projectId/members/:userId`
    - `DELETE /api/v1/organisations/:orgId/projects/:projectId/members/:userId`
  - Cross-tenant validation: Assigning owners or members outside the organisation is rejected (`422 INVALID_OWNER` / `422 INVALID_MEMBER`).
- **Frontend Experience (`ProjectsPage.tsx`, `ProjectDetailPage.tsx`, `CreateProjectDialog.tsx`):**
  - Projects list with status and priority filter tabs, text search, project cards with status/priority badges, owner info, date ranges, and member count.
  - Create project modal with name, description, priority selector, target dates, and owner picker from active org members.
  - Detail page with lifecycle transition actions (Start, Put On Hold, Mark Completed, Archive), project overview card, and Members roster tab.
  - In-place member role management (promote/demote between manager, contributor, viewer) and member removal with owner guard.
  - "Add Member" modal allowing selection of any active organisation member with assigned role.
  - Phase 8B Tasks tab placeholder cleanly prepared for Phase 8B.
  - Live navigation link in Workspace sidebar with real-time module entitlement awareness.
- **Automated Verification & Evidence:**
  - Integration suite `projects.integration.test.js`: 18/18 passing tests covering creation, validation, lifecycle transitions, terminal states, member management, owner invariants, tenant isolation, and RLS policies.
  - Full backend test suite: 202/202 passing tests across 14 test suites in `npm test` (0 failures).
  - Frontend typecheck: `tsc --noEmit` passes with 0 errors.
  - Frontend lint: `eslint` passes with 0 errors.
  - Frontend build: `tsc && vite build` completes with 0 errors in 6.53s.

---

## Phase 8B Deliverables Summary (Tasks, Statuses, Kanban & Filtering)
- **Database Schema & Migrations (`database/migrations/20261017000016_tasks_core.sql`, `20261017000017_tasks_rls_refinement.sql`):**
  - Created `tasks` table with columns: `id`, `organisation_id`, `project_id`, `title`, `description`, `status`, `priority`, `assignee_id`, `start_date`, `due_date`, `created_by_id`, `created_at`, `updated_at`, `deleted_at`, `deleted_by_id`.
  - Check constraints: canonical statuses `('backlog', 'todo', 'in_progress', 'blocked', 'done')` (no cancelled status), priorities `('low', 'medium', 'high', 'urgent')`, and date ordering `CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)`.
  - Composite foreign keys: `(project_id, organisation_id) REFERENCES projects(id, organisation_id) ON DELETE CASCADE`.
  - Foreign key to assignee: `FOREIGN KEY (organisation_id, assignee_id) REFERENCES organisation_memberships(organisation_id, user_id) ON DELETE SET NULL`.
  - Enabled and forced PostgreSQL RLS with permissive tenant policies (`tenant_isolation_tasks`) granting `ALL` DML to `managex_app`.
- **Backend Task Service & Business Logic (`backend/src/platform/projects/projectService.js`, `projectLifecycle.js`):**
  - Canonical 5-status task lifecycle state machine:
    - `backlog` -> `['todo']`
    - `todo` -> `['backlog', 'in_progress']`
    - `in_progress` -> `['blocked', 'done']`
    - `blocked` -> `['in_progress']`
    - `done` -> `['in_progress']` (strictly requires manager/admin role or `project.edit` permission).
  - Assignee validation: Assignee must be an active member of both organisation and project.
  - Active assignment removal guards (ADR-006):
    - Member cannot be removed from project if they have active tasks assigned (`status != 'done' AND deleted_at IS NULL`), returning `409 MEMBER_HAS_ACTIVE_TASKS`.
    - Organisation member cannot be suspended or removed if they have active tasks assigned in any project, returning `409 MEMBER_HAS_ACTIVE_TASKS`.
  - Archived project invariant: Task creation, updates, and deletion in an `archived` project are strictly blocked with `409 PROJECT_ARCHIVED`.
  - Soft deletion: Soft-deleted tasks record `deleted_at` and `deleted_by_id` and are filtered out of all normal queries.
  - Server-side filtering: `status`, `priority`, `assigneeId`, `assigned_to_me`, `due_soon` ($\le 7\text{ days}$ in future), `overdue` ($< \text{now}$ UTC and status $\ne$ 'done'), text search across title and description, and deterministic cursor/offset pagination.
  - Cross-project task query: `GET /api/v1/organisations/:orgId/tasks/my` returning caller's active assignments across all projects in the organisation.
- **REST API Routes (`backend/src/routes/projects.js`, `organisations.js`):**
  - `GET /api/v1/organisations/:orgId/projects/:projectId/tasks` (List tasks with filters)
  - `POST /api/v1/organisations/:orgId/projects/:projectId/tasks` (Create task)
  - `GET /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId` (Get task by ID)
  - `PATCH /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId` (Update task or status)
  - `DELETE /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId` (Soft-delete task)
  - `GET /api/v1/organisations/:orgId/tasks/my` (List tasks assigned to current user across org)
- **Frontend Task Management (`TaskListView.tsx`, `TaskKanbanView.tsx`, `CreateTaskDialog.tsx`, `TaskDetailDialog.tsx`, `ProjectDetailPage.tsx`):**
  - Dual-mode Task View: Toggle seamlessly between 5-column Kanban board and comprehensive tabular List view over the same live data model.
  - Kanban board: 5 columns (`backlog`, `todo`, `in_progress`, `blocked`, `done`) with column task counts, priority badges, assignee tags, quick navigation buttons between valid adjacent statuses, and column "Add Task" quick triggers.
  - List view: Dense enterprise table with status badges, priority badges, assignee name/email, overdue and due-soon warning chips, and direct forward-status progression buttons.
  - Quick filter bar: Instant preset buttons (All Tasks, Assigned to Me, Due Soon, Overdue), full-text search input, and status, priority, and assignee dropdowns.
  - Create Task Modal: Validates title, description, priority, initial status, assignee (from eligible project members), and start/due dates.
  - Task Detail Modal: In-place editable fields, status transition controls with server validation error handling, audit metadata (creator and timestamps), and confirmed soft deletion.
- **Automated Verification & Evidence:**
  - Tasks integration test suite (`tasks.integration.test.js`): 18/18 passing tests covering CRUD, 5-status lifecycle, invalid transition rejection, reopen authorization, assignee project membership validation, project member removal guard (409), org member suspension guard (409), archived project guard (409), soft deletion, server-side filters (`assigned_to_me`, `due_soon`, `overdue`, search), and `managex_app` composite FK / RLS isolation.
  - Projects integration test suite (`projects.integration.test.js`): 18/18 passing tests with 0 regressions.
  - Full backend test suite: 220/220 passing tests across 15 test suites in `npm test` (0 failures).
  - Frontend test suite: 8/8 passing tests in `vitest run`.
  - Frontend typecheck and production build: `tsc && vite build` completed cleanly with 0 errors in 13.07s.

---

## Phase 8C Deliverables Summary (Comments, Activity Timeline & Projects Full E2E)
- **Database Schema & Migrations (`database/migrations/20261017000018_task_comments_activity.sql`):**
  - Created `task_comments` table with columns: `id`, `organisation_id`, `project_id`, `task_id`, `author_id`, `content`, `created_at`, `updated_at`, `deleted_at`, `deleted_by_id`.
  - Created `project_activity` table with columns: `id`, `organisation_id`, `project_id`, `entity_type`, `entity_id`, `action`, `actor_id`, `metadata`, `created_at`.
  - Composite foreign keys:
    - `task_comments (task_id, project_id, organisation_id) REFERENCES tasks(id, project_id, organisation_id) ON DELETE CASCADE`.
    - `task_comments (organisation_id, author_id) REFERENCES organisation_memberships(organisation_id, user_id) ON DELETE CASCADE`.
    - `project_activity (project_id, organisation_id) REFERENCES projects(id, organisation_id) ON DELETE CASCADE`.
    - `project_activity (organisation_id, actor_id) REFERENCES organisation_memberships(organisation_id, user_id) ON DELETE SET NULL`.
  - Seeded permissions: `project.comment.moderate` and `task.comment.create` granted to `organisation_owner` and `organisation_admin`.
  - PostgreSQL Row-Level Security: `FORCE ROW LEVEL SECURITY` enabled on both tables, granting `SELECT, INSERT, UPDATE, DELETE` to `managex_app` with isolated tenant policies (`tenant_isolation_task_comments`, `tenant_isolation_project_activity`).
- **Backend Services & Routes (`backend/src/platform/projects/projectService.js`, `backend/src/routes/projects.js`):**
  - Task Comments CRUD:
    - `POST /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments`: Validates plain-text content (1..2000 chars), verifies caller is an active project member, records activity event `comment_added`.
    - `GET /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments`: Bounded list with active author profile and soft-deleted placeholder `[This comment has been deleted]`.
    - `PATCH /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments/:commentId`: Author-only edit while project is not archived, updating `content` and recording `comment_edited`.
    - `DELETE /api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments/:commentId`: Soft deletion by author or moderator/manager (`project.comment.moderate`), setting `deleted_at` and `deleted_by_id` and recording `comment_deleted`.
    - Archived project guard: Comment creation, updates, and deletion in an `archived` project are strictly rejected with `409 PROJECT_ARCHIVED`.
    - Audit security invariant: Compliance audit logs record comment ID only — comment body or diffs are NEVER included in audit metadata (`SEC-008`, `ADR-013`).
  - Project Activity Timeline:
    - Concise activity logging helper `recordProjectActivity` integrated across all material events: `project_created`, `project_status_changed`, `member_added`, `member_role_changed`, `member_removed`, `task_created`, `task_status_changed`, `task_assigned`, `task_deleted`, `comment_added`, `comment_edited`, `comment_deleted`.
    - `GET /api/v1/organisations/:orgId/projects/:projectId/activity`: Chronological timeline query ordered by `created_at DESC` with pagination, actor metadata, and clean summary messages.
    - Zero secrets or token leakage in activity metadata; distinct and decoupled from compliance audit logs.
- **Frontend Workspace Experience (`TaskDetailDialog.tsx`, `ProjectDetailPage.tsx`, `types/projects.ts`):**
  - Interactive Task Comments Thread:
    - Real-time comment input with character counter (0/2000), submit button, and keyboard shortcut support.
    - Author in-place inline editing with Cancel / Save controls.
    - Soft-deletion confirmation with instant UI update to `[This comment has been deleted]`.
    - Moderation delete button visible only to users with manager/admin privileges.
    - Read-only banner and disabled inputs when the parent project is in `archived` status.
  - Project Activity Timeline Tab:
    - Added dedicated "Activity" tab to `ProjectDetailPage` with chronological vertical timeline.
    - Event-specific badges and human-readable event summaries (e.g., status changes, assignee changes, member updates).
    - Actor avatar, user name, email, relative/absolute timestamp chips, and contextual metadata.
- **Automated Verification & Evidence:**
  - Dedicated Phase 8C integration test suite (`comments_activity.integration.test.js`): 18/18 passing tests covering comment validation, bounds, script safety, author edit, non-author edit lockout (403), author soft-delete, non-author delete without moderation lockout (403), manager moderation delete, archived project lockout (409), project non-member lockout (403), cross-tenant isolation, activity timeline generation, activity secrets omission, archived history preservation, direct RLS under `managex_app`, composite FK rejection (23503), dynamic module revocation (403 MODULE_DISABLED).
  - Full backend test suite: 238/238 passing tests across 16 test suites in `npm test` (0 failures).
  - Frontend test suite: 8/8 passing tests in `vitest run`.
  - Frontend typecheck and production build: `tsc && vite build` completed cleanly with 0 errors in 6.92s.

---

## Phase 9 Deliverables Summary (Platform Administration Console & Controls)
- **Database Schema & Migrations (`database/migrations/20261017000019_platform_admin_controls.sql`):**
  - Added `platform_role` column to `users` with CHECK constraint (`platform_super_admin`, `platform_support_agent`).
  - Seeded platform permissions `platform.account.read` and `platform.account.manage`.
  - Mapped permissions to `platform_super_admin` and `platform_support_agent` roles.
  - Granted least-privilege `UPDATE (is_platform_available) ON modules` to restricted runtime role `managex_app`.
  - All 19 migrations verified and applied deterministically (`19/19 applied, 0 pending`).
- **Backend Services & Authorization Middleware:**
  - Distinct `/api/v1/platform` route namespace segregated from customer tenant endpoints.
  - Platform session and authorization middleware (`requirePlatformSession`, `requirePlatformPermission`) enforcing server-authoritative role and permission checks.
  - Operational overview service (`getPlatformOverview`): aggregate metrics for accounts, workspaces, and catalogue modules without cross-tenant leakage.
  - Global accounts management (`listAccounts`, `updateAccountStatus`): paginated operational listing returning only allowlisted fields; zero password hashes or tokens; instant session revocation on account suspension; login fail-closed (`403 ACCOUNT_DISABLED`); self-suspension guard (`409 CANNOT_SUSPEND_SELF`).
  - Customer workspace operational inspection (`listOrganisations`, `getOrganisationDetails`, `updateOrganisationStatus`): tenant overview with member and active module counts; non-destructive workspace suspension returning `403 ORG_INACTIVE` while preserving all tenant data.
  - Module catalogue management (`listPlatformModules`, `updatePlatformModuleAvailability`): fixed 3 MVP modules (`events`, `meetings`, `projects`); platform availability toggle cascading to org endpoints (`403 MODULE_PLATFORM_UNAVAILABLE`) without deleting underlying data; arbitrary module rejection (`404 MODULE_NOT_FOUND`).
  - Platform audit logging (`listPlatformAuditLogs`): append-only audit trail with `organisation_id IS NULL` for all high-impact actions.
- **Frontend Platform Console (`/platform`):**
  - Distinct visual identity and navigation layout (`PlatformLayout.tsx`) with dark slate header and direct "Return to Workspace" link.
  - Real-time Operational Overview (`PlatformOverviewPage.tsx`): live tenant metrics and catalogue status cards.
  - User Accounts Directory (`PlatformAccountsPage.tsx`): paginated table, search, status filter, and confirmation modal for account suspension/reactivation with operational reason logging.
  - Workspaces Inspection (`PlatformOrganisationsPage.tsx`): paginated organisations list, metadata modal detailing active module entitlements, and workspace suspension/reactivation modal.
  - Module Catalogue Controls (`PlatformModulesPage.tsx`): visual cards for `events`, `meetings`, and `projects` with global enable/disable modals and data preservation guarantees.
  - Platform Audit Logs Viewer (`PlatformAuditLogsPage.tsx`): UTC timestamped event ledger with sanitized JSON metadata modal.
- **Automated Verification & Evidence:**
  - Dedicated Phase 9 integration test suite (`platform.integration.test.js`): 20/20 passing tests covering PLAT-001 through PLAT-007 and SEC-009.
  - Full backend test suite: 258/258 passing tests across 17 test suites in `npm test` (0 failures).
  - Frontend test suite: 8/8 passing tests in `vitest run`.
  - Frontend typecheck and production build: `tsc && vite build` completed cleanly with 0 errors in 16.76s.

---

## Phase 10 Deliverables Summary (Cross-Cutting Hardening, Performance & Security Audit)
- **Security Hardening & Headers (`SEC-001`, `SEC-005`):**
  - Added dedicated security headers middleware (`securityHeaders.js`) enforcing `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Content-Security-Policy`, and production `Strict-Transport-Security`.
  - Verified bcrypt work factor 12 and login timing enumeration defense (dummy 12-round bcrypt hash comparison for non-existent users).
  - Enforced CSRF double-submit token checking on all state-changing mutations (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Input Fuzzing & Abuse Protection (`SEC-002`, `SEC-006`):**
  - Parameterized queries verified against SQL injection fuzz vectors across search parameters and request bodies.
  - XSS payloads neutralized as plain text without execution.
  - Request body parser constrained to 100KB with standard 413 `PAYLOAD_TOO_LARGE` error envelope.
  - Invalid Unicode null bytes (`\u0000`) trapped and returned with 400 `INVALID_ENCODING` instead of 500.
  - Rate limiting verified on sensitive public and auth endpoints (`auth_login`, `auth_reg`).
- **Secret Redaction & Audit Integrity (`SEC-007`, `SEC-008`):**
  - Automated check asserting zero password hashes, session secrets, or tokens in logs, audit records, or API error bodies.
- **Cross-Tenant RLS Matrix (`SEC-008`):**
  - Exhaustive RLS CRUD matrix verified under restricted role `managex_app`: zero cross-tenant reads or writes across `events`, `meetings`, `notes`, `projects`, `tasks`, and `comments`.
  - Composite foreign keys enforce tenant isolation (`fk_tasks_project_tenant`), rejecting foreign references with PostgreSQL error `23503`.
- **Database Resilience & Latency SLAs (`OPS-005`):**
  - Connection pool exhaustion and recovery verified; queued queries succeed once pooled clients are released without deadlock.
  - Measured p95 read latency: 32ms (well under < 200ms target).
  - Measured p95 write latency: 58ms (well under < 500ms target).
  - 1,000-row dataset paginated query verified in 181ms (well under < 2.0s target).
  - PostgreSQL `EXPLAIN ANALYZE` confirms execution uses `idx_tasks_project_status` index scan with zero unindexed table scans.
- **Frontend Accessibility (`UI-005`, WCAG 2.2 AA):**
  - Verified color contrast >= 4.5:1 for normal text and >= 3:1 for UI components across light theme palette.
  - Primitives refined with accessible semantics: `Button` (`aria-busy`, `aria-disabled`), `Input` (`aria-invalid`), `Dialog` (`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`), `TableHead` (`scope="col"`).
  - Automated test suite (`Accessibility.test.tsx`): 6/6 tests passing via native DOM server rendering.
- **Automated Verification & Evidence:**
  - Dedicated Phase 10 security audit suite (`security_audit.integration.test.js`): 13/13 passing tests.
  - Dedicated Phase 10 database performance suite (`performance.integration.test.js`): 4/4 passing tests.
  - Full backend test suite: 275/275 passing tests across 19 suites in `npm test` (0 failures).
  - Frontend test suite: 14/14 passing tests across 2 suites in `vitest run` (0 failures).
  - Frontend typecheck and production build: `tsc && vite build` completed cleanly with 0 errors in 8.54s.

---

## Post-Phase-10 Role-Based UX & Navigation Refinements Deliverables Summary
- **Login Redirection (`AUTH-003`, Persona-Aware UX):**
  - Updated `AuthContext.tsx` to return verified `User` on `refreshUser()`.
  - Updated `LoginPage.tsx`: routes Platform Super Admins and Support Agents (`user.isPlatformAdmin === true`) directly to `/platform`, while routing regular organisation users to `/app`. Preserves authorized deep links.
- **Frontend Route Guards (`SEC-009`, `PLAT-001`, `AUTH-005`):**
  - Added `RequireAuth` in `RouteGuards.tsx` protecting `/app/*` with loading indicators during session hydration and redirection of unauthenticated requests to `/auth/login`.
  - Added `RequirePlatformAdmin` in `RouteGuards.tsx` protecting `/platform/*` with loading indicators, redirecting unauthenticated users to `/auth/login` and non-platform users away to `/app`.
- **Permission-Based Workspace Navigation (`RBAC-001`, `RBAC-003`, `RBAC-004`):**
  - Updated `WorkspaceLayout.tsx` to dynamically evaluate effective permissions (`activeDetails?.membership?.permissions`) and roles.
  - Granularly filters `Members & Roles`, `Modules & Entitlements`, `Security & Audit Log`, and `Organisation Settings`.
  - Completely hides the `Organisation Admin` sidebar section in both desktop and mobile drawer when an ordinary member holds no administrative permissions.
- **Operator Console Workspace Shortcut:**
  - Added a prominent `Operator Console` button in the `WorkspaceLayout` header for verified platform administrators, enabling 1-click transit between tenant workspaces and the platform console.
- **Context-Aware Zero-Organisation Empty State:**
  - Updated `WorkspaceOverviewPage.tsx` and `WorkspaceLayout.tsx` banner: truthful, helpful messaging distinguishing between Platform Admins with no tenant workspaces (offering both Operator Console and Create Organisation) and regular members (offering Create Organisation and invitation guidance without assuming student persona or claiming unverified event registrations).
- **Automated Verification & Evidence:**
  - `RouteGuards.test.tsx`: 7/7 tests passing (verifies loading, unauthenticated redirects, non-platform admin redirects, and authenticated outlets).
  - `WorkspaceLayout.test.tsx`: 4/4 tests passing (verifies permission-based sidebar filtering and header operator shortcut rendering).
  - `WorkspaceOverviewPage.test.tsx`: 7/7 tests passing (verifies dynamic metadata, truthful zero-org regular state, and platform admin zero-org state).
  - `LoginPage.test.tsx`: verified form rendering and login helpers.
  - Frontend test suite: 33/33 tests passing across 6 test suites in `npm test --prefix frontend` (0 failures).
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) completed with 0 errors.
  - Frontend build: `npm run build --prefix frontend` (`tsc && vite build`) completed with 0 errors in 15.92s.
  - Frontend lint: `npm run lint --prefix frontend` completed with 0 errors.
  - Backend test suite: 275/275 tests passing across 19 suites in `npm test --prefix backend` (0 failures).

---

## Phase 01 Implementation: Navigation Fix + Public Events + External Registration Deliverables Summary
- **Workspace Navigation Active-State Fix (`UI-001`, `UI-003`):**
  - Updated `WorkspaceLayout.tsx` `isLinkActive` function and module mapping logic.
  - Corrected active link evaluation so module links (`Events & Hackathons`, `Meetings`, `Projects & Tasks`) are never marked active on `/app/organisations` when `activeOrg === null`.
  - Preserved active state for `All Organisations` in `adminNav` when active.
  - Added test 5 in `WorkspaceLayout.test.tsx` verifying no false module active states when on `/app/organisations` with null active organization.
- **Backend Public Event Details (`EVT-003`, `API-001`):**
  - Added `getPublicEventById(eventId)` in `backend/src/platform/events/eventService.js`, with UUID and slug resolution.
  - Enforced strict publication status (`status = 'published'`) and public visibility (`visibility = 'public'`).
  - Returns standard 404 `NotFoundError` for non-existent, draft, or private events, preventing metadata leaks.
  - Exposed safe public payload including hosting organisation summary (`id`, `name`, `slug`), schedule, location, capacity, and hackathon team sizes, while completely omitting internal audit history, private participant rosters, judge assignments, and internal notes.
  - Mounted `GET /api/v1/events/:eventId` on `publicEventsRouter` in `backend/src/routes/events.js`.
  - Added test 14 to `backend/src/platform/events/events.integration.test.js` verifying 200 on public published, 404 on draft, 404 on private, and 404 on non-existent UUIDs.
- **Public Events Directory (`EVT-003`, `UI-001`):**
  - Created `frontend/src/pages/public/EventsDirectoryPage.tsx` at `/events`.
  - Implemented real-time search, event type filtering (`All Events`, `Hackathons`, `General Events`), responsive card grid, host organization badge, schedule, location/virtual indicators, empty state, and loading skeletons.
  - Created `frontend/src/pages/public/EventsDirectoryPage.test.tsx` with passing tests.
- **Public Event Detail & External Registration Flow (`EVT-003`, `EVT-004`, `EVT-005`):**
  - Created `frontend/src/pages/public/PublicEventDetailPage.tsx` at `/events/:eventId`.
  - Displays full schedule, timezone, location, guidelines, and hackathon team size constraints.
  - Unauthenticated visitors are presented with a clear call-to-action to sign in or create an account, directing to `/auth/login` with `state.from` preserved for post-login return.
  - Authenticated verified users have their registration status loaded via `GET /api/v1/organisations/:orgId/events/:eventId/my-registration`.
  - Provides one-click event registration via `POST /api/v1/organisations/:orgId/events/:eventId/register` and withdrawal via `POST /api/v1/organisations/:orgId/events/:eventId/withdraw` with confirmation check.
  - Created `frontend/src/pages/public/PublicEventDetailPage.test.tsx` with passing tests.
- **Navigation & Routing Updates:**
  - Added `Events` link to header and footer in `frontend/src/layouts/PublicLayout.tsx`.
  - Registered `/events` and `/events/:eventId` routes under `PublicLayout` in `frontend/src/App.tsx`.
- **Automated Verification & Evidence:**
  - Full backend test suite: 276/276 passing tests across 19 suites in `npm test --prefix backend` (0 failures).
  - Frontend test suite: 38/38 passing tests across 8 suites in `npm test --prefix frontend` (0 failures).
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) completed with 0 errors.
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) completed with 0 errors.

---

## Phase 02B: Multi-Round Hackathon Core Engine Implementation Summary
- **Database Schema Migration (`20261017000025_multi_round_hackathons.sql`):**
  - Created `event_rounds` table with composite tenant foreign keys `(organisation_id, event_id)` referencing `events(organisation_id, id)`.
  - Enforced round number ordering constraints (`uq_event_rounds_order`), positive numbers, valid submission windows (`submission_closes_at > submission_opens_at`), and advancement rule validations (`manual`, `score_threshold`, `top_n`).
  - Created `event_round_advancements` table with foreign keys and unique constraints tracking team or participant progression per round.
  - Extended `event_submissions`, `event_scoring_criteria`, `event_judge_assignments`, and `event_scores` with nullable `round_id UUID REFERENCES event_rounds(id) ON DELETE SET NULL` and composite tenant indexes.
  - Enabled and FORCED Row-Level Security (RLS) on `event_rounds` and `event_round_advancements` with `managex_app` runtime DML grants.
- **Backward-Compatible Initialization & Backfill:**
  - Automatically backfilled default "Round 1" for all existing events from existing event submission windows and publication metadata.
  - Safely backfilled `round_id` for existing submissions, scoring criteria, judge assignments, and scores without breaking any single-round legacy constraints or tests.
- **Round Management API (`roundService.js` & `routes/events.js`):**
  - Implemented `GET /api/v1/organisations/:orgId/events/:eventId/rounds` with submission, criteria, and advancement counts.
  - Implemented `GET /api/v1/organisations/:orgId/events/:eventId/rounds/:roundId` returning detailed round metadata.
  - Implemented `POST /api/v1/organisations/:orgId/events/:eventId/rounds` creating new rounds with server-enforced Zod validation and audit logging (`event.round.created`).
  - Implemented `PATCH /api/v1/organisations/:orgId/events/:eventId/rounds/:roundId` updating round configuration, deadlines, and advancement rules with audit logging (`event.round.updated`).
  - Implemented `DELETE /api/v1/organisations/:orgId/events/:eventId/rounds/:roundId` with safety checks blocking deletion of rounds with existing submissions or evaluations (409 ConflictError) and audit logging (`event.round.deleted`).
  - Implemented public rounds endpoint `GET /api/v1/events/:eventId/rounds` for published public events.
- **Frontend Organiser Workspace UI (`EventDetailPage.tsx`):**
  - Added "Competition Rounds" management card for hackathons in `EventDetailPage.tsx`.
  - Displays list of configured rounds with badges for round number, status, advancement rule, submission counts, and windows.
  - Provided "Add Round" and "Edit Round" modal dialogs supporting round name, number, rule selection (`manual`, `score_threshold`, `top_n`), threshold/top-N configuration, and date-time inputs.
  - Provided delete confirmation dialog with dependency protection feedback.
  - Updated types in `frontend/src/types/events.ts`.
- **Automated Verification & Evidence:**
  - Round integration test suite: 16/16 passing tests in `rounds.integration.test.js` (0 failures).
  - Full backend events test suite: 81/81 passing tests across all 5 test files in `backend/src/platform/events/*.test.js` (0 failures).
  - Frontend test suite: 46/46 passing tests across 9 test files in `npm test --prefix frontend` (0 failures).
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) passed with 0 errors.

---

## Phase 02C Deliverables Summary (Multi-Round Submissions, Advancement & Scoring)
- **Database Migration (`20261017000026_round_scoped_submissions_evaluations.sql`):**
  - Replaced single-round unique submission constraint with round-scoped partial unique indexes (`uq_event_submissions_round_team` and `uq_event_submissions_round_user`).
  - Added composite foreign keys linking `(event_id, round_id)` on `event_submissions`, `event_scoring_criteria`, `event_scores`, and `event_round_advancements` ensuring relational integrity across rounds and events.
  - Replaced `NULLS NOT DISTINCT` on `event_round_advancements` with partial unique indexes allowing multiple teams or solo participants per round.
- **Round-Scoped Submissions Service (`submissionService.js`):**
  - Implemented `createOrUpdateRoundSubmission`: enforces server-side round eligibility (Round 1 open to registered participants; Round $N$ requires explicit qualification in Round $N-1$).
  - Implemented `getMyRoundSubmission` and `listRoundSubmissions`.
  - Maintained 100% backward compatibility for single-round legacy submission workflows.
- **Round Advancement Engine (`advancementService.js`):**
  - Implemented `advanceRound` supporting `top_n`, `score_threshold`, and `manual` rules.
  - Invariant verified: Top-N advancement automatically qualifies all participants or teams tied at the cutoff threshold score.
  - Persists qualification ranks and scores into `event_round_advancements`.
  - Automatically transitions next stage from `pending` to `open`.
- **Round Scoring, Leaderboard & Privacy (`judgingService.js`):**
  - Round-scoped scoring criteria and judge assignments.
  - Round scores persist `round_id` matching evaluated submission.
  - `getRoundResults` calculates leaderboard with straight sum and competition shared ranks for tied scores.
  - Unpublished score privacy strictly enforced (participants receive 403 `RESULTS_NOT_PUBLISHED` until explicitly published).
  - `publishRoundResults` and `unpublishRoundResults` management endpoints.
- **Frontend Workspace & Participant UI (`EventDetailPage.tsx`):**
  - Added "Results" and "Advance" actions directly on round cards in `EventDetailPage.tsx`.
  - Added `AdvanceRoundDialog` for configuring rules and executing advancement.
  - Added `RoundResultsDialog` for inspecting leaderboard rankings and publishing round results.
  - Added Round Stage selector tabs in the Project Submission card for participants.
- **Automated Verification & Evidence:**
  - Multi-Round advancement integration test suite: 15/15 passing tests in `advancement.integration.test.js` (0 failures).
  - Full backend events test suite: 96/96 passing tests across all 6 test files in `backend/src/platform/events/*.test.js` (0 failures).
  - Frontend test suite: 47/47 passing tests across 9 test files in `npm test --prefix frontend` (0 failures).
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) passed with 0 errors.

- **Decoupled Global Event Directory (`UI-001`, `PRD §1`):**
  - Removed `Events` navigation link from `PublicLayout.tsx` header.
  - Replaced standalone `/events` directory route with a clean `<Navigate to="/" replace />` in `App.tsx`.
  - Removed `EventsDirectoryPage.tsx` and its test, confirming no other component or route imports it.
  - Updated `PublicEventDetailPage.tsx` back navigation to link to `/` ("ManageX Home"), eliminating circular directory dependencies.
- **Direct Event Page & Shareable URL Preservation (`EVT-003`, `EVT-004`):**
  - Preserved `/events/:eventId` direct route under `PublicLayout`.
  - Preserved backend `GET /api/v1/events/:eventId` supporting UUID and slug lookups.
  - Preserved strict publication filtering (`status = 'published'` and `visibility = 'public'`) returning 404 for draft/private events.
  - Preserved participant authentication, verification, and registration boundaries without organisation membership.
- **Organiser Workspace Shareable Link Action (`EVT-001`, `UI-001`):**
  - Added "Copy Shareable Link" button to the organiser workspace `EventDetailPage.tsx` header.
  - Gated strictly by `event.status === 'published' && event.visibility === 'public'` (hidden for draft, private, or terminal events).
  - Copies canonical URL `${window.location.origin}/events/${event.id}` using `navigator.clipboard.writeText`.
  - Provides clear success feedback ("Link Copied!" state for 3s and success alert) and handles clipboard unavailability/failure safely without false success.
- **Automated Verification & Evidence:**
  - Frontend test suite: 44/44 passing tests across 9 suites in `npm test --prefix frontend` (0 failures).
  - Route tests: `App.test.tsx` verifies `/events` redirects to `/` and `/events/:eventId` routes to `PublicEventDetailPage`.
  - Organiser workspace tests: `EventDetailPage.test.tsx` verifies share link button presence on published public events, absence on draft/private, and URL generation.
  - Direct detail tests: `PublicEventDetailPage.test.tsx` verifies home navigation links.
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) passed with 0 errors in 14.69s.
  - Backend events test suite: 14/14 passing tests in `events.integration.test.js` (0 failures).




---

## Phase 02D Deliverables Summary (Multi-Round Hackathon Finalization & Integrity Hardening)
- **Database Migration (`20261017000027_multi_round_hardening_integrity.sql`):**
  - Added `is_manual BOOLEAN NOT NULL DEFAULT FALSE` to `event_round_advancements` to protect manual advancement decisions from automated overwrites.
  - Replaced `uq_judge_assignments_event_judge_sub` with `uq_judge_assignments_event_round_judge_sub` (`event_id, round_id, judge_user_id, submission_id`) supporting round-scoped judge assignments.
  - Added composite foreign key `(event_id, round_id)` on `event_judge_assignments` referencing `event_rounds(event_id, id)` with `ON DELETE RESTRICT`.
  - Added index `idx_advancements_round_manual` for fast lookup of manual advancement decisions.
- **Advancement Engine Consistency & Invariants (`advancementService.js`):**
  - Incomplete judging guard: Advancing via `top_n` or `score_threshold` when scoring criteria exist and judges are assigned requires 100% completed evaluations across all assigned judges and criteria; blocked with `409 INCOMPLETE_EVALUATION` otherwise.
  - Manual decision preservation: Pre-existing manual qualifications (`is_manual = true`) are strictly protected from being downgraded to `eliminated` during automated `top_n` or `score_threshold` recalculations.
  - Target participant validation: Targets in `manualAdvancements` are validated against actual round submissions; invalid targets rejected with `ValidationError` (`TARGET_NOT_IN_ROUND`).
  - Idempotency: Repeated advancement requests succeed idempotently under serialized row-level locking (`SELECT ... FOR UPDATE`).
- **Round-Scoped Judging & Score Lockout (`judgingService.js`):**
  - Round-scoped judge assignment via `POST /:eventId/judges` with `roundId`.
  - Judges assigned specifically to a round cannot score submissions in another round (`403 JUDGE_NOT_ASSIGNED`).
  - Score edit lockout: Attempting to submit or modify scores on a completed/advanced round is blocked with `409 ROUND_ADVANCEMENT_LOCKED`.
  - Public visibility filter: Public results and details strictly verify `visibility = 'public'` and non-draft status, returning 404 for private/draft events.
- **Safe Round Deletion Guards (`roundService.js`):**
  - Deletion blocked if criteria exist (`409 ROUND_HAS_CRITERIA`).
  - Deletion blocked if judge assignments exist (`409 ROUND_HAS_JUDGE_ASSIGNMENTS`).
  - Deletion blocked if submissions exist (`409 ROUND_HAS_SUBMISSIONS`).
  - Deletion blocked if advancements exist (`409 ROUND_HAS_ADVANCEMENTS`).
- **Automated Verification & Evidence:**
  - Dedicated hardening regression suite: 12/12 passing tests in `hardening.integration.test.js` (0 failures).
  - Full backend events integration suite: 108/108 passing tests across all 7 test suites in `backend/src/platform/events/*.test.js` (0 failures).
  - Frontend test suite: 47/47 passing tests across 9 test files in `npm test --prefix frontend` (0 failures).
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.

---

## Event Portal Navigation & Student Experience Fix Deliverables Summary
- **Database Migration (`20261017000028_participant_dashboard_rls.sql`):**
  - Updated PostgreSQL Row-Level Security policies on `events` and `event_rounds` to permit registered participants (`EXISTS (SELECT 1 FROM event_registrations ... WHERE user_id = app.current_user_id)`) to query their enrolled events and rounds even after an event transitions to `registration_closed`, `in_progress`, or `completed`.
- **Backend Participant Dashboard API:**
  - Created `getParticipantDashboard(userId)` in `backend/src/platform/events/eventService.js`.
  - Added authenticated endpoint `GET /api/v1/events/participant/dashboard` in `backend/src/routes/events.js` (mounted before `/:eventId` to prevent route shadowing), protected with `requireAuth` and `requireVerifiedUser`.
  - Returns complete student event portfolio: registered event metadata, registration details, hackathon team roster & leadership status, multi-round deliverables & deadlines, submission URLs & timestamps, round qualification status, and published results.
  - Strict privacy & RLS isolation: unauthenticated requests return 401; users can only view their own registrations/teams/submissions; unpublished judge scores and criteria evaluations are never exposed.
- **Frontend Event Portal Navigation (`EventPortalLayout.tsx`):**
  - Created dedicated portal layout for `/events`, `/events/:eventId`, and `/events/dashboard`.
  - Brand header with "ManageX Events" logo linking directly to the portal homepage (`/events`).
  - Clear navigation links: "Browse Events" (`/events`), "My Dashboard" (`/events/dashboard`), and "Platform Home" (`/`).
  - Contextual authentication area:
    - Unauthenticated: displays "Sign In" with return destination in state (`state={{ from: { pathname: location.pathname } }}`) and "Get Started".
    - Authenticated: displays user name & avatar, direct link to "My Dashboard", and working "Log Out" action that invokes `logout('/events')` returning the user to the Event portal.
- **Frontend Event Portal Public Homepage (`EventsPortalHomePage.tsx`):**
  - Created dedicated Events & Hackathons homepage at `/events`.
  - Hero banner with real-time search input and event type filter tabs ("All Events", "Hackathons", "General Events").
  - Card-based event directory rendering dates, timezones, virtual/in-person badges, host organisation names, and "View Details & Register" linking to `/events/:eventId`.
  - Skeleton loading states, empty search results states, and error handling.
- **Frontend Student Dashboard (`StudentDashboardPage.tsx`):**
  - Created student/participant hub at `/events/dashboard` protected by `<RequireAuth />`.
  - Renders registered events, hackathon team composition with team leader indicators, round-by-round deliverable statuses, demo/repository links, advancement badges (qualified, eliminated, pending), and final published results leaderboards.
  - Clean empty state with "Browse Upcoming Events" CTA when user has zero active registrations.
- **Public & Authentication Routing Alignment:**
  - Updated `frontend/src/layouts/PublicLayout.tsx` to include "Events & Hackathons" (`/events`) and display authenticated user states with working logout.
  - Updated `frontend/src/pages/public/PublicEventDetailPage.tsx` back links to return to `/events` ("All Events" / "Back to Events").
  - Updated `frontend/src/pages/auth/LoginPage.tsx` so that users without organisation memberships automatically default to `/events/dashboard` instead of empty organisation workspaces, and deep links via `location.state.from` are preserved.
- **Automated Verification & Evidence:**
  - New backend integration test suite: 4/4 passing tests in `participant_dashboard.integration.test.js` (0 failures).
  - Backend test suite: 323/323 passing tests across 23 test suites (0 failures).
  - New frontend test suite: `EventsPortal.test.tsx` (4 tests).
  - Frontend test suite: 52/52 passing tests across 10 test files (0 failures).
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) built cleanly with 0 errors.

---

## Dedicated Module Workspaces & Role-Based Separation Deliverables Summary
- **Module-Wise Homepage & Workspace Separation (`WorkspaceLayout.tsx`):**
  - Implemented context-aware module detection in `WorkspaceLayout` for all 3 functional modules:
    - Events & Hackathons (`/app/organisations/:orgId/events`) -> `ManageX Events` (Organiser Workspace).
    - Meetings (`/app/organisations/:orgId/meetings`) -> `ManageX Meetings` (Meetings Workspace).
    - Projects & Tasks (`/app/organisations/:orgId/projects`) -> `ManageX Projects` (Projects Workspace).
  - When within any module workspace:
    - Sidebar brand logo links directly to that module's functional overview/homepage (not generic `/app`).
    - Prominent `← ManageX Dashboard` button and platform return link in both desktop and mobile sidebars.
    - Module-specific navigation items rendered in sidebar (e.g. Events Overview + link to Public Events Portal with external icon).
    - Workspace header displays module breadcrumbs (`ManageX / {OrgName} / {Module}`) and explicit `ManageX Dashboard` return button.
  - Navigation between pages within the selected module stays in the same tab by default.
- **Module Selection & Browser Tab Orchestration (`WorkspaceOverviewPage.tsx` & `WorkspaceLayout.tsx`):**
  - When an authorised user selects an enabled module from the ManageX dashboard:
    - Module cards and quick action shortcuts open the module workspace in a new browser tab (`target="_blank" rel="noopener noreferrer"`) with `ExternalLink` icon indicators.
    - Original ManageX dashboard remains open in the initial tab.
    - Inside the opened module tab, all module interactions and intra-module links stay in the same tab.
- **External Participant & Role Separation Guard:**
  - For external participants/students with no organisation membership:
    - `WorkspaceOverviewPage` renders dedicated CTAs to "Participant Dashboard" (`/events/dashboard`) and "Browse Public Events" (`/events`) alongside organization creation.
    - `WorkspaceLayout` top notification banner provides a direct link to the Participant Dashboard.
    - Organisation-level administration and management navigation are strictly hidden from users without administrative membership.
- **Automated Verification & Evidence:**
  - Frontend test suite: 55/55 passing tests across 10 test files in `npm test --prefix frontend` (0 failures), including 3 new test cases verifying dedicated module branding, return navigation, and new-tab module opening.
  - Backend test suite: 323/323 passing tests across 23 test suites in `npm test --prefix backend` (0 failures).
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) built cleanly in 6.32s with 0 errors.

---

## Events UI Blueprint & Screen Reconciliation (Documentation Only)
- **UI Specification Baseline (`docs/ui/events-screens.md`):**
  - Synthesized comprehensive UI blueprint for Events & Hackathons module, strictly reconciling S1–S8 management screens, P1–P2 public screens, and P3 student dashboard against the canonical PRD (`docs/PRD.md`).
  - Screen Coverage: S1 (Events List), S2 (Create/Edit Modal), S3 (Lifecycle Hub), S4 (Participant Roster), S5 (Teams & Invites), S6 (Rounds Engine), S7 (Judging & Evaluation), S8 (Scoring & Results Publication), P1 (Public Directory), P2 (Public Event Detail & Registration), P3 (Student Dashboard).
  - Route Compatibility & Collision Analysis: Reconciled `/events/dashboard` priority over dynamic parametric paths, established single-segment UUID vs orgSlug dynamic resolution, and defined reserved path slugs.
  - Security & RLS Invariants: Codified external participant boundary (no org membership), transactional capacity locking, straight-sum judging with shared tied ranks, and public response allowlist with strict redaction of drafts, internal notes, PII, and unpublished scores.
- **Decision Log Updates (`docs/decisions/decision-log.md`):**
  - Logged **ADR-019**: Events Route Inventory, Namespace Collision Resolution & Route Precedence.
  - Logged **ADR-020**: Public Events Discovery Boundary & Data Allowlist.
- **Constraints Maintained:**
  - Strictly documentation-only task; zero application code, migrations, or tests were executed. All Clean Enterprise design tokens and WCAG 2.2 AA standards preserved.

---

## Phase 6A — Core Events & Lifecycle Implementation Summary
- **S1 — Events List (`/app/organisations/:orgId/events`):**
  - Confirmed organisation isolation with `organisation_id` scoping in backend transactions and PostgreSQL RLS.
  - Supports canonical 7 lifecycle statuses (`draft`, `published`, `registration_closed`, `in_progress`, `completed`, `cancelled`, `archived`) with text search and status filter dropdown.
  - Displays event type badges, start/end dates formatted in configured IANA timezone, venue/virtual tags, and capacity indicator.
  - Gated Create Event action by `event.create` permission (or organisation owner/admin).
- **S2 — Create and Edit Event Dialogs:**
  - `CreateEventDialog.tsx`: Modal form with server validation for title, slug, type (`general_event` vs `hackathon`), visibility (`private` vs `public`), start/end UTC timestamps, IANA timezone, location/virtual URL, registration open/close boundaries, capacity, and participant instructions.
  - `EditEventDialog.tsx`: Dedicated editing dialog launched from `EventDetailPage` allowing authorized users (`event.edit`, `organisation_owner`, `organisation_admin`, `event_admin`) to update event properties before terminal status (`completed`, `archived`).
  - Strict client and server validation: `startAt < endAt`, `registrationClosesAt <= startAt`, `registrationClosesAt > registrationOpensAt`, `capacity > 0`.
- **S3 — Event Management & Lifecycle Hub (`/app/organisations/:orgId/events/:eventId`):**
  - Full details view with status badge, type, visibility, IANA timezone, and date schedule.
  - `Edit Event` button conditionally displayed for permitted users on non-terminal events.
  - Shareable link button generates `${origin}/events/${event.id}` with clipboard copy confirmation.
  - Deterministic 7-status lifecycle transition panel enforcing PRD §7.1 (`EVT-002`) state machine with audit logging on every change (`AUD-001`).
- **Backend Endpoints Verified:**
  - `GET /api/v1/organisations/:orgId/events` (scoped to org, draft filter)
  - `POST /api/v1/organisations/:orgId/events` (`event.create`, Zod validation, RLS insert)
  - `GET /api/v1/organisations/:orgId/events/:eventId` (scoped to org)
  - `PATCH /api/v1/organisations/:orgId/events/:eventId` (`event.edit`, partial Zod validation)
  - `PATCH /api/v1/organisations/:orgId/events/:eventId/status` (`event.status.manage`, deterministic transitions)
  - `GET /api/v1/events` & `GET /api/v1/events/:eventId` (public read, only published + public events)
- **Verification Evidence:**
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.
  - Frontend test suite: `npm test --prefix frontend` (55/55 passing tests across 10 test files, 0 failures).
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) built cleanly in 15.74s with 0 errors.

---

## Phase 6C-1 — Teams & Event-Scoped Membership Summary
- **Backend Service Implementation (`teamService.js`):**
  - Added `getMyEventTeam(organisationId, eventId, userId)`: Resolves current user's team membership in a hackathon event, returning formatted team details, member count, and complete member list with user metadata and owner flags.
  - Added `joinEventTeam(organisationId, eventId, teamId, userId, { ipAddress, userAgent })`: Direct join for open hackathon teams. Verifies event is active `hackathon`, verifies caller has active registration (`status = 'registered'`), verifies caller does not already belong to an active team in the event (`uq_event_team_members_event_user`), locks target team row `FOR UPDATE` to serialize concurrent joins, enforces `team_size_max`, creates membership record, and emits immutable audit log `event.team.member_joined`.
- **API Routing (`events.js`):**
  - Mounted `GET /api/v1/organisations/:orgId/events/:eventId/my-team` with `requireAuth`, `requireVerifiedUser`, `resolveOrgContext`, `requireModuleEntitlement('events')`.
  - Mounted `POST /api/v1/organisations/:orgId/events/:eventId/teams/:teamId/join` with `requireAuth`, `requireVerifiedUser`, `resolveOrgContext`, `requireModuleEntitlement('events')`.
  - Reused pre-existing `POST /teams`, `GET /teams`, `GET /teams/:teamId`, `POST /teams/:teamId/leave`, and `DELETE /teams/:teamId/members/:userId` endpoints.
- **Frontend Public Event Detail Integration (`PublicEventDetailPage.tsx`):**
  - Integrated hackathon teams management section directly into the public event detail page (P2).
  - Conditionally rendered for `eventType === 'hackathon'`.
  - Displays "Your Team" banner with team name, description, owner badge, member roster with joined dates, and "Leave Team" button with confirmation modal (`ConfirmDialog`).
  - Displays "Create Team" dialog form with name and optional description when participant is registered but not in a team.
  - Displays "Event Teams" roster with real-time member counts vs `teamSizeMax`, full-capacity warnings, and "Join Team" button with loading indicators.
  - Displays clear "Registration Required for Teams" advisory when visitor is unauthenticated or unregistered.
- **Automated Verification & Evidence:**
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.
  - Frontend test suite: `npm test --prefix frontend` — all 66 tests passed across 11 test files (0 failures), including 3 new test cases in `PublicEventDetailPage.test.tsx` verifying team creation CTA, available teams roster, active team card, owner badge, member roster, and registration requirement gates.
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) built cleanly in 13.26s with 0 errors.
  - Backend integration test suite: `teams_submissions.integration.test.js` remains **NOT VERIFIED** due to host port limitation (PostgreSQL listens on 5432 while `.env` is configured for 5433). Zero environment credentials modified in compliance with safety policy.

---

## Phase 6C & Events Module Final Closure Summary
- **Complete Team Invitations Workflow (`teamService.js` & `events.js`):**
  - Implemented `listTeamInvitations(organisationId, eventId, teamId, actorUserId)`: Redacts raw cryptographic hashes, computes dynamic `is_expired` status based on UTC 7-day cutoff.
  - Implemented `revokeTeamInvitation(organisationId, eventId, teamId, invitationId, actorUserId, metadata)`: Enforces team owner permissions, serializes via `SELECT ... FOR UPDATE`, transitions unexpired invitation to `revoked`, and logs `event.team.invitation_revoked`.
  - Implemented `rejectTeamInvitation(organisationId, eventId, token, userId, metadata)`: Cryptographically verifies SHA-256 token hash, checks intended recipient email, verifies invitation is pending and unexpired, updates status to `rejected`, and emits `event.team.invitation_rejected`.
  - Implemented `getMyTeamInvitations(organisationId, eventId, userId)`: Surfaces pending, valid team invitations matching the authenticated user's email address.
  - Mounted API routes:
    - `GET /organisations/:orgId/events/:eventId/teams/:teamId/invites`
    - `DELETE /organisations/:orgId/events/:eventId/teams/:teamId/invites/:invitationId`
    - `POST /organisations/:orgId/events/:eventId/team-invites/:token/reject`
    - `GET /organisations/:orgId/events/:eventId/my-team-invitations`
- **Submissions and Deliverables Implementation (`EVT-007`):**
  - Verified backend URL validation (strict http/https URI scheme, SSRF prevention, no local/internal hostnames).
  - Verified submission window guard (`submission_deadline` enforcement, reject on closed/ineligible event status).
  - Verified ownership and team boundary (submitter must be registered or belong to submitting team; single submission per team/participant).
  - Public Event Detail (P2) integration: Integrated Project Submission card displaying submission status, title, description, external repository link, live demo link, deadline enforcement, and interactive submission dialog modal (`SubmissionDialog`).
- **Judging, Scoring & Official Results Publication (`EVT-008`, `EVT-009`):**
  - Straight-sum score computation verified (`straight_sum = sum(scores)`).
  - Tied ranks shared (dense/standard rank alignment per ADR-009).
  - Complete criteria check enforced before publication (cannot publish unsubmitted scores or partial judge evaluations).
  - Unpublish / publish state machine verified with audit logging.
  - Public Event Detail (P2) integration: Rendered official Leaderboard & Results card with rank badges (#1 Gold, #2 Silver, #3 Bronze), submitter/team names, project titles, demo links, and aggregate straight-sum points when results are published.
- **Automated Verification & Evidence:**
  - Frontend typecheck: `npm run typecheck --prefix frontend` (`tsc --noEmit`) passed with 0 errors.
  - Frontend test suite: `npm test --prefix frontend` (`vitest run`) passed with 69/69 passing tests across 11 test suites (0 failures), including 3 new test cases verifying team invitations, project submissions, and official leaderboard rendering.
  - Frontend production build: `npm run build --prefix frontend` (`tsc && vite build`) passed with 0 errors, bundling in 6.52s.
  - Backend integration test suites (`teams_submissions.integration.test.js`, `judging_results.integration.test.js`): Configured for port 5433 while host PostgreSQL listens on 5432; strictly reported as **NOT VERIFIED** in adherence to non-destructive credential policies.

---

## ManageX — Student/Participant vs Organisation Identity Leakage Resolution & RBAC Boundary Enforcement Summary
- **Root Cause Analysis:**
  - **Global Storage Key Contamination:** `OrgContext.tsx` previously saved `activeOrgId` under the un-namespaced key `managex_active_org_id`. When User A (Organisation Owner) logged out and User B (Participant / Student) logged in on the same browser, User B inherited User A's active organisation ID before `/api/v1/organisations` returned.
  - **Session & Logout Cleanup Gap:** `AuthContext.tsx` `logout()` invalidated backend session cookies but did not scrub `managex_active_org_id*` from `localStorage` or clear session storage, causing persona leakage across account switches.
  - **Missing Route Guard on Organisation Workspace:** In `App.tsx`, `/app` and `/app/organisations/:orgId/*` were wrapped solely in `<RequireAuth />`. No guard verified that the authenticated user was an active member of `:orgId`, permitting participants to land on internal organisation pages.
  - **Persona Fabrication in Workspace Layout:** `WorkspaceLayout.tsx` previously evaluated `{activeOrg?.role?.name || (user?.isPlatformAdmin ? 'Platform Admin' : 'Member')}`, which displayed a fabricated "Member" role for users with 0 organisations. Furthermore, it activated module workspace detection (`isModuleWorkspace`) without checking `activeOrg`.
  - **Public Shell CTA Misalignment:** `PublicLayout.tsx` displayed a prominent "Workspace" button pointing to `/app` for all authenticated users, including participants with 0 organisation memberships.
- **Implementation & Security Hardening:**
  - **User-Scoped Active Organisation Storage (`OrgContext.tsx`):**
    - Active organisation key is now user-scoped: `managex_active_org_id_${user.id}`.
    - If user has 0 organisations, `activeOrgId` and `activeDetails` are immediately set to `null`, and any stale stored keys are wiped.
    - `useOrg()` provides a fail-safe fallback when invoked outside `OrgProvider`, eliminating crashes in isolated views or tests.
  - **Complete Logout Storage Sanitization (`AuthContext.tsx`):**
    - `logout()` now systematically iterates and removes all `managex_active_org_id*` keys from `localStorage` and executes `sessionStorage.clear()`.
  - **Fail-Closed Organisation Route Guard (`RequireOrgAccess` in `RouteGuards.tsx` & `App.tsx`):**
    - Implemented `RequireOrgAccess`: inspects `:orgId` parameter and verifies active membership via `organisations.some(o => o.id === orgId && o.status === 'active')`.
    - If user has 0 organisations (Participant persona): renders an accessible fail-closed Access Restricted card with prominent CTAs to "Participant Dashboard", "Browse Public Events", and "Create Organisation".
    - If user belongs to other organisations: renders Access Restricted card with CTA to return to their verified workspace.
    - Wrapped all `/app/organisations/:orgId/*` child routes in `<Route element={<RequireOrgAccess />}>`.
  - **Strict Persona Resolution & Navigation Isolation (`WorkspaceLayout.tsx`):**
    - Avatar role badge resolves dynamically: `{activeOrg?.role?.name || (user?.isPlatformAdmin ? 'Platform Admin' : (organisations.length > 0 ? 'Member' : 'Participant'))}` — never displays "Member" for participant accounts.
    - When `organisations.length === 0`: sidebar hides internal organisation modules (Events, Meetings, Projects) and displays "Participant Links" ("Participant Dashboard", "Browse Public Events", "Create Organisation").
    - `isModuleWorkspace` strictly requires `Boolean(activeOrg)`, preventing organizer workspace headers from rendering without an active organisation context.
  - **Public and Portal Shell Persona Alignment (`PublicLayout.tsx` & `EventPortalLayout.tsx`):**
    - `PublicLayout.tsx` conditionally renders "Workspace" (`/app`) for users with active organisations (`organisations.length > 0`) and "Dashboard" (`/events/dashboard`) for participant accounts (`organisations.length === 0`).
    - `EventPortalLayout.tsx` provides an "Organisation Workspace" shortcut exclusively for dual-purpose accounts (`organisations.length > 0`).
  - **Fail-Closed Top-Level Backend Router Defense (`meetings.js` & `projects.js`):**
    - Configured top-level router middleware: `meetingsRouter.use(requireOrgMembership)` and `meetingsRouter.use(requireModuleEntitlement('meetings'))`.
    - Matches pre-existing top-level protection in `projectsRouter.js`, ensuring fail-closed defense-in-depth on internal organisation modules.
    - Note on `events.js`: As established in ADR-022, `eventsRouter` uses granular per-route middleware to support external participants without organisation membership.
  - **Graceful Error States on Module Pages (`MeetingsPage.tsx`, `ProjectsPage.tsx`, `EventsPage.tsx`):**
    - When 403 `MEMBERSHIP_REQUIRED` or `MODULE_DISABLED` is returned by the API, pages render a dedicated Access Restricted card rather than displaying interactive search bars, filters, and creation dialogs.
- **Verification Evidence:**
  - **Backend Live Test Suite (`npm test --prefix backend`):** 323/323 tests passed across 23 test suites (0 failures), verifying complete multi-tenant isolation, NOBYPASSRLS enforcement, and RBAC defense.
  - **Frontend Typecheck (`npm run typecheck --prefix frontend`):** `tsc --noEmit` exited with code 0 (zero errors).
  - **Frontend Test Suite (`npm test --prefix frontend`):** 75/75 tests passed across 11 test suites (0 failures), including dedicated test cases in `RouteGuards.test.tsx` and `WorkspaceLayout.test.tsx` verifying participant persona isolation, role labeling, and access denial.
  - **Frontend Production Build (`npm run build --prefix frontend`):** `tsc && vite build` built cleanly in 15.54s with 0 errors.

---

## ManageX — Post-Fix Security Regression Verification Report

### 1. Events Router Scope Audit & Middleware Correction
- **Finding:** A previous commit had placed top-level `eventsRouter.use(requireOrgMembership)` and `eventsRouter.use(requireModuleEntitlement('events'))` at the root of `backend/src/routes/events.js`. Because `eventsRouter` also hosts participant-facing endpoints (e.g. `POST /:eventId/register`, `POST /:eventId/withdraw`, `GET /:eventId/my-registration`, `POST /:eventId/teams`, `POST /:eventId/submissions`, `GET /:eventId/my-team`), non-member participants with verified accounts were blocked with 403 `MEMBERSHIP_REQUIRED`.
- **Resolution (ADR-022):**
  - Removed root-level `eventsRouter.use(requireOrgMembership)` and `eventsRouter.use(requireModuleEntitlement('events'))`.
  - Re-audited and confirmed all 27 organiser-only management routes in `eventsRouter` explicitly enforce `requireOrgMembership`, `requireModuleEntitlement('events')`, and scoped RBAC permissions (`event.create`, `event.edit`, `event.status.manage`, `event.participant.manage`, `event.judge.assign`, `event.score`, `event.results.publish`).
  - Participant routes use `requireAuth`, `requireVerifiedUser`, `resolveOrgContext`, and `requireModuleEntitlement('events')`, along with domain checks (registration eligibility, team membership, submission ownership).
  - Public discovery endpoints remain unauthenticated and allowlist-filtered.

### 2. Meetings and Projects Route Coverage Verification
- Audited `backend/src/routes/meetings.js` and `backend/src/routes/projects.js`.
- Confirmed that because Meetings and Projects are purely internal organisation modules with zero external participant or public endpoints, both routers safely maintain top-level `requireOrgMembership` and `requireModuleEntitlement`.
- Verified that confidential meeting minutes (`meeting.notes.read`) and private project/task resources cannot be accessed across tenant boundaries or by unprivileged members.

### 3. Dedicated Boundary Regression Test Suite (`events_boundaries.integration.test.js`)
Created and executed 24 comprehensive automated integration tests against live PostgreSQL on port 5433 verifying:
1. **Anonymous Public Access:** Anonymous visitors can list published public events and view public details; draft and private events are hidden (404).
2. **Authenticated Participant Operations (0 Org Memberships):** Participants can register, query own status, view active participant dashboard, and withdraw/reactivate registrations without organisation membership.
3. **Team & Submission Boundaries:** Registered participants can create teams and submit project URLs; unregistered users are rejected with 403 `REGISTRATION_REQUIRED`; non-team members are rejected with 403; non-http or dangerous URLs are rejected with 422.
4. **Organiser Lockout for Non-Members:** Participants (0 org memberships) cannot list internal events, create events, edit events, change event status, or inspect staff participant rosters (all fail closed with 403 `MEMBERSHIP_REQUIRED`).
5. **Scoped Permission Enforcement:** Regular members lacking `event.create` or `event.status.manage` are blocked with 403 `FORBIDDEN`; privileged owners/admins perform organiser tasks normally.
6. **Cross-Organisation Isolation:** Users belonging to Organisation B cannot read, mutate, or inspect rosters in Organisation A (403 `MEMBERSHIP_REQUIRED`).

### 4. Consolidated Test & Build Verification
- **Backend Full Test Suite (`npm test --prefix backend`):** **347/347 tests passed (100%)** across 30 suites with 0 failures.
- **Frontend Test Suite (`npm test --prefix frontend`):** **75/75 tests passed (100%)** across 11 suites with 0 failures.
- **Frontend Typecheck (`npm run typecheck --prefix frontend`):** `tsc --noEmit` exited with code 0 (clean).
- **Frontend Production Build (`npm run build --prefix frontend`):** `tsc && vite build` bundled successfully in 15.74s.

---

## ManageX — UX Improvement Batch 1 Implementation Report

### 1. Requirements Implemented
- **Replaced Raw UUID Inputs with Searchable Member Pickers:**
  - `MeetingDetailPage.tsx`: Meeting attendee modal now fetches active organisation members (`/organisations/:orgId/members`) and renders a member select picker filtering out members who are already attendees. Action items modal provides grouped selection (`Meeting Attendees` and `Other Organisation Members`) eliminating manual UUID inputs.
  - `EventDetailPage.tsx`: Hackathon judge assignment modal now fetches active organisation members and event submissions, providing dropdown pickers for both judge selection and submission target scope without raw UUID inputs.
- **Kept Users in Same Browser Tab (Internal Navigation):**
  - `WorkspaceLayout.tsx`: Removed `target="_blank"`, `rel="noopener noreferrer"`, and external link icons from desktop and mobile sidebar module links.
  - `WorkspaceOverviewPage.tsx`: Removed `target="_blank"`, `rel="noopener noreferrer"`, and external link icons from quick action shortcut buttons and module overview workspace action buttons.
  - Renamed `Modules & Entitlements` to `Modules & Features` in navigation.
- **Public Header Avatar Link:**
  - `PublicLayout.tsx`: Avatar and user name in header now dynamically link to `/app` (organisation workspace) for users with active organisations (`organisations.length > 0`), and to `/events/dashboard` for participant-only accounts (0 organisations).
  - Renamed navbar item `Security & Tenancy` to `Security & Privacy`.
  - Replaced footer status copy with factual non-absolute wording `All Systems Operational • Organisation-level access controls`.
  - Dual-purpose users retain direct header access to both their organisation workspace and their participant dashboard.
- **Accessible Confirmation Dialogs (`<ConfirmDialog />`):**
  - Completely replaced all 8 native browser `window.confirm()` and `alert()` popups across `MeetingDetailPage.tsx`, `MembersPage.tsx`, and `ProjectDetailPage.tsx` with accessible, non-blocking modal `<ConfirmDialog />` instances with cancel actions and destructive styling.
- **Event Lifecycle Panel Plain-Language UI:**
  - `EventDetailPage.tsx`: Replaced developer jargon (`Lifecycle State Machine`, `PRD §7.2`, `valid canonical transitions`) with clean `Event Status & Actions`, current status badge, and user-friendly action buttons (`Publish Event`, `Start Event`, `Close Registration`, `Mark as Completed`, `Cancel Event`, `Archive Event`, `Revert to Draft`).
- **Copy & Jargon Polish:**
  - `LoginPage.tsx` & `RegisterPage.tsx`: Updated auth descriptions to welcome both workspace members and event participants.
  - `ErrorPages.tsx`: Updated 403 Forbidden description to plain English.
  - `CreateEventDialog.tsx` & `EditEventDialog.tsx`: Changed label from `Timezone (IANA) *` to `Event Timezone *`.
  - `PlatformOrganisationsPage.tsx` & `PlatformAuditLogsPage.tsx`: Removed PRD clause citations (`PLAT-003`, `PLAT-007`, `PRD SEC-007/AUD-003`, `PRD SEC-009`) and clarified privacy boundaries (protected by organisation-level access controls and Row-Level Security).
- **Central Audit Action Formatter:**
  - `OrgAuditLogsPage.tsx` & `PlatformAuditLogsPage.tsx`: Exported and applied `formatAuditAction()` converting internal dot-notation keys (`org.ownership_transferred`, `member.role_assigned`, etc.) to human-readable labels (`Ownership Transferred`, `Role Assigned`, etc.).
- **Participant Terminology Standardisation:**
  - Standardised on `Participant Dashboard` across `EventPortalLayout.tsx`, `StudentDashboardPage.tsx`, and related navigation.

### 2. Verification & Test Results
- **Backend Full Test Suite (`npm test --prefix backend`):** **347/347 tests passed (100%)** across 30 suites with 0 failures.
- **Frontend Typecheck (`npm run typecheck --prefix frontend`):** `tsc --noEmit` exited with code 0 (clean).
- **Frontend Test Suite (`npm test --prefix frontend`):** **75/75 tests passed (100%)** across 11 test suites with 0 failures.
- **Frontend Production Build (`npm run build --prefix frontend`):** `tsc && vite build` built production bundle in 16.40s with exit code 0.

---

## ManageX — Phase 2A: Judge Scheduling & Evaluation Database Foundation Report

### 1. Requirements Implemented
- **Forward Database Migration for Optional Round Evaluations:**
  - Implemented migration `database/migrations/20261017000029_evaluation_database_foundation.sql`.
  - Added composite unique constraint `uq_event_teams_id_event UNIQUE (event_id, id)` on existing `event_teams` table to support foreign key referential integrity without cross-event leakage.
  - Created 4 core tables:
    1. `round_evaluations`: 1:0..1 optional relationship with `event_rounds` via `UNIQUE (round_id)`. Holds evaluation configuration (`evaluation_mode`, `status`, `session_duration_minutes`, `buffer_minutes`, `judges_per_panel`, `evaluations_per_team`, `schedule_starts_at`, `schedule_ends_at`, `default_meeting_url`).
    2. `evaluation_panels`: Panels attached to `round_evaluations`, scoped by `(organisation_id, event_id)` and `(round_evaluation_id, panel_number)`.
    3. `evaluation_panel_judges`: Assigned judges per panel, with composite unique constraint `uq_pjudges_eval_judge (round_evaluation_id, judge_user_id)` strictly preventing concurrent panel assignments across the same round evaluation.
    4. `evaluation_sessions`: Time-slotted live sessions with composite foreign keys enforcing event/round/team matching `(event_id, team_id) REFERENCES event_teams(event_id, id)` and `(event_id, round_evaluation_id) REFERENCES round_evaluations(event_id, id)`.
- **Database-Level Row-Level Security (RLS) & Non-Member Judge Access:**
  - `FORCE ROW LEVEL SECURITY` enabled on all 4 new tables.
  - Non-recursive RLS policy definitions prevent PostgreSQL `42P17` infinite recursion.
  - Organization isolation strictly enforced across all operations.
  - Assigned non-member judges are authorized for `SELECT` on their assigned panel, assignment rows, and sessions without granting them organisation membership.
  - Participants granted `SELECT` only on published evaluation sessions and panels when registered for the event.
  - Mutations (`INSERT`, `UPDATE`, `DELETE`) restricted to active organisation members and platform admin (fail-closed for judges/participants).
- **Zero Schema Drift & Backward Compatibility:**
  - Un-evaluated rounds operate normally without `round_evaluations` rows.
  - All existing judge assignment, scoring, and advancement services remain untouched and 100% backward compatible.

### 2. Files Created
- `database/migrations/20261017000029_evaluation_database_foundation.sql`: Forward DDL and RLS migration.
- `backend/src/platform/events/evaluation_foundation.integration.test.js`: Comprehensive 10-test suite verifying referential integrity, cross-event rejection, check constraints, RLS tenant isolation, assigned judge queries, unauthorized mutation rejection, and un-evaluated round backward compatibility.

### 3. Database Migration Applied
- Migration identifier: `20261017000029_evaluation_database_foundation.sql` (checksum tracked in `schema_migrations`). Total applied migrations: 29.

### 4. Commands Executed & Test Results
- `node database/migrate.js`: Exit code 0 (`Applied: 1, Total: 29`).
- `node --test backend/src/platform/events/evaluation_foundation.integration.test.js`: **10/10 tests passed (100%)** (exit code 0).
- `node --test backend/src/platform/events/rounds.integration.test.js`: **16/16 tests passed (100%)** (exit code 0).
- `node --test backend/src/platform/events/judging_results.integration.test.js`: **20/20 tests passed (100%)** (exit code 0).

### 5. Pass/Fail Results & Unresolved Failures
- Pass rate: **100%** (46/46 tests passing across all three verified suites).
- Unresolved failures: **None**.

### 6. Security Implications & Deferred Work
- **Security Invariants Preserved:**
  - No organization membership granted to external judges or participants.
  - Runtime database role (`managex_app`) retains `NOBYPASSRLS`.
  - Transaction-local settings (`app.current_organisation_id`, `app.current_user_id`, `app.current_is_platform_admin`) govern all queries.
  - Cross-event team linking strictly blocked at the database level by foreign key `fk_sessions_team (event_id, team_id) REFERENCES event_teams(event_id, id)`.
- **Deferred to Phase 2B+:**
  - Backend service implementation (`evaluationService.js`).
  - Scheduling algorithms and slot generation.
  - Assignment projection / synchronization to `event_judge_assignments`.
  - Organiser and judge UI routes and components.
  - Real-time/external meeting provider link distribution.

### 7. Acceptance Criteria Verification
- [x] Forward migration 029 applies cleanly and records in `schema_migrations`.
- [x] Composite foreign keys prevent cross-event team/session tampering.
- [x] Check constraints enforce duration, buffer, and positive bounds.
- [x] Unique constraints enforce 1:0..1 round evaluation and single-panel assignment per judge per round.
- [x] FORCE ROW LEVEL SECURITY enabled on all 4 tables with non-recursive policies.
- [x] Automated integration suite verifies schema integrity and backward compatibility.
- [x] Zero changes to existing authentication, organisation middleware, or PRD business logic.

### 8. Exact Next Phase
- **Phase 2A.1:** Evaluation RLS Security Hardening & Least-Privilege Enforcement.

---

## ManageX — Phase 2A.1: Evaluation RLS Security Hardening Report

### 1. Requirements Implemented
- **Removed Platform Support Mutation Bypass:**
  - Implemented forward migration `database/migrations/20261017000030_evaluation_rls_security_hardening.sql`.
  - Replaced all 12 mutation policies (`INSERT`, `UPDATE`, `DELETE`) across `round_evaluations`, `evaluation_panels`, `evaluation_panel_judges`, and `evaluation_sessions`.
  - Completely removed `COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true` from all mutation policies.
  - Required strict active organisation membership (`organisation_memberships m WHERE m.status = 'active'`) and matching `organisation_id` context. Platform support agents attempting to insert, update, or delete customer operational evaluation data fail closed.
- **Protected Meeting URLs & Private Evaluation Data:**
  - Replaced all 4 `SELECT` policies across the evaluation tables to remove the automated `app.current_is_platform_admin` read bypass.
  - Platform support without active tenant membership receives 0 rows when attempting to query `round_evaluations`, `evaluation_panels`, `evaluation_panel_judges`, or `evaluation_sessions`. Full meeting URLs (`default_meeting_url`, `meeting_url`) and judge user IDs are protected from support exposure at the database RLS layer.
- **Tenant Isolation & Participant Session Scoping:**
  - Missing tenant context (`app.current_organisation_id` is null or empty) strictly fails closed across all queries and mutations.
  - Participants can only view their own team's session (`tm.team_id = evaluation_sessions.team_id`) when published; cannot view other teams' sessions or private meeting links.
  - Organisers retain full administrative access to their organisation's evaluations, panels, judges, and sessions.

### 2. Files Created or Changed
- `database/migrations/20261017000030_evaluation_rls_security_hardening.sql`: Forward migration replacing 16 RLS policies with hardened least-privilege definitions.
- `backend/src/platform/events/evaluation_foundation.integration.test.js`: Expanded from 10 to 15 tests, verifying platform support mutation lockout, zero data exposure to platform support, missing tenant context failure, participant own-team isolation, and organiser management.
- `docs/security.md`: Documented Section 4.D Evaluation & Judge Scheduling Boundary.

### 3. Verification & Test Results
- `node database/migrate.js`: Exit code 0 (`Applied: 1, Total: 30`).
- `node --test backend/src/platform/events/evaluation_foundation.integration.test.js`: **15/15 tests passed (100%)**.
- `node --test backend/src/platform/events/rounds.integration.test.js`: **16/16 tests passed (100%)**.
- `node --test backend/src/platform/events/judging_results.integration.test.js`: **20/20 tests passed (100%)**.

### 4. Exact Next Phase
- **Phase 2B:** Evaluation Service, Scheduling Algorithms, and Sync Projection.


---

## ManageX AI — Phase 02B: Confidential Meeting Notes Summarizer Completion Report

### 1. Requirements Implemented
- **OpenRouter Privacy Routing Controls (§5.1, §6):**
  - Configured openrouterClient.js default provider controls: provider: { data_collection: 'deny', zdr: true }.
  - Ensures compliance with OpenRouter provider-level Zero Data Retention and data collection restrictions.
  - Fail-closed behavior on primary route and model fallbacks.
- **Access Authorization & Confidentiality Enforcement (MTG-005, SEC-009, §2.4):**
  - Exported and reused assertMeetingNotesAccess(client, orgId, meetingId, actorId, 'read') in meetingsAiService.js.
  - Allowed roles: Organiser, Organisation Owner, Organisation Admin, or holders of explicit meeting.notes.read / meeting.notes.edit / meeting.notes.manage permissions.
  - Attendees lacking notes read permission are rejected with HTTP 403 FORBIDDEN_NOTES_ACCESS and audited via meeting.notes_access_denied.
- **Source Minimization & Security Hardening:**
  - Excluded attendee emails, external links, and internal database IDs from AI context.
  - Wrapped notes in strict <confidential_meeting_notes> delimiters with closing-tag breakout sanitization.
  - Pre-inference guards: HTTP 422 EMPTY_SOURCE_NOTES before quota check or external API invocation; 50,000 char source notes length cap.
  - Terminal state validation: Cancelled meetings rejected with HTTP 409 MEETING_CANCELLED.
- **Canonical API Endpoint (§9.2):**
  - Mounted POST /api/v1/organisations/:orgId/meetings/:meetingId/ai/summarize in backend/src/routes/meetings.js.
  - Enforced middleware pipeline: authenticateToken, requireOrgMembership, requireModuleEntitlement('meetings').
  - Output is strictly ephemeral: database meeting_notes is NOT mutated upon generation.
- **Frontend MOM Integration & Human-in-the-Loop Review UI:**
  - Created frontend/src/pages/workspace/meetings/AiNotesSummaryModal.tsx and connected it in MeetingDetailPage.tsx.
  - "Summarize Notes with AI" button in Tab 3 MOM header card and Section 4 header.
  - Review modal supports focus areas, additional instructions, live draft editing, markdown clipboard copy, safe append, and confirmed replacement.
  - Optimistic concurrency control: passes currentNotesUpdatedAt as expectedUpdatedAt; handles HTTP 409 CONCURRENT_MODIFICATION conflicts cleanly by alerting user while preserving unsaved draft in memory.

### 2. Files Created or Changed
- backend/src/platform/ai/openrouterClient.js
- backend/src/platform/ai/openrouterClient.test.js
- backend/src/platform/meetings/meetingService.js
- backend/src/platform/ai/schemas/meetingsAiSchemas.js
- backend/src/platform/ai/meetingsAiService.js
- backend/src/routes/meetings.js
- backend/src/platform/ai/meetingsAi.test.js
- backend/src/platform/ai/meetings_summary_ai.integration.test.js
- frontend/src/pages/workspace/meetings/AiNotesSummaryModal.tsx
- frontend/src/pages/workspace/meetings/AiNotesSummaryModal.test.tsx
- frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx
- docs/managex-ai-implementation-plan.md
- docs/requirements-traceability.md
- docs/progress.md

### 3. Verification & Test Results
- Backend unit tests (meetingsAi.test.js, openrouterClient.test.js): 18/18 passed (100%).
- Backend integration tests (meetings_summary_ai.integration.test.js, meetings_agenda_ai.integration.test.js): 12/12 passed (100%).
- Frontend modal tests (AiNotesSummaryModal.test.tsx, AiAgendaDraftModal.test.tsx): 13/13 passed (100%).
- Frontend meeting detail tests (MeetingDetailPage.test.tsx): 47/47 passed (100%).
- Frontend TypeScript & production build: 0 errors, build successful.

### 4. Database Migrations Added
- Zero migrations: Used existing schema (meeting_notes, meeting_discussion_points, meeting_decisions, organisation_ai_settings, ai_usage_records). No new migration created or needed.

### 5. Next Phase
- Phase 02C: Action Items Extraction with Candidate Assignee Matching (upon explicit authorization).

---

## Phase 02C Completion Report — Action Items Extraction with Candidate Assignee Matching

### 1. Requirements Implemented
- **Action Items Extraction Schema & Service (`AI-REQ-06`, PRD §8.2 MTG-005/MTG-006, Plan §4.1, §9.3):**
  - Added and exported `extractActionItemsInputSchema`, `extractedCandidateActionItemSchema`, and `extractActionItemsOutputSchema` in `backend/src/platform/ai/schemas/meetingsAiSchemas.js`.
  - Implemented `ACTION_ITEMS_EXTRACTOR_SYSTEM_PROMPT` instructing the model to extract concrete action items with priority and due date, along with extracted `candidateAssigneeName`.
  - Implemented `buildActionItemsExtractorPrompt(...)` with `<confidential_meeting_notes>` and `<organisation_roster>` delimiters, plus closing-tag breakout sanitization (`replace(/<\/confidential_meeting_notes>/gi, '[closing tag removed]')`).
  - Implemented `extractMeetingActionItems(...)` in `backend/src/platform/ai/meetingsAiService.js` with:
    - Pre-inference empty source guard: HTTP 422 `EMPTY_SOURCE_NOTES` if meeting has zero notes, zero discussion points, and zero decisions.
    - Pre-inference note size limit: HTTP 422 `SOURCE_NOTES_TOO_LARGE` if source notes exceed 50,000 characters.
    - Lifecycle status check: HTTP 409 `MEETING_CANCELLED` if meeting status is cancelled.
    - Mandatory read authorization check: `assertMeetingNotesAccess(client, orgId, meetingId, actorUserId, actorPermissions, 'read')` — unauthorized attendees receive HTTP 403 `FORBIDDEN_NOTES_ACCESS` and the event is logged to `audit_logs` as `meeting.notes_access_denied`.
    - Action item permission check: Requires meeting organiser status or `meeting.action.manage`, `meeting.edit`, `org.admin`, or `org.owner` (HTTP 403 `FORBIDDEN`).
    - OpenRouter provider routing controls `{ provider: { data_collection: 'deny', zdr: true } }` with fail-closed enforcement.
    - Ephemeral draft response (`isDraft: true`): Zero automatic database writes on extraction.
- **Deterministic Server-Side Candidate Assignee Matching:**
  - Queries active organisation members (`organisation_memberships.status = 'active'`) within the tenant transaction.
  - Implemented `matchAssigneeCandidate(candidateName, activeMembers)`:
    - Case-insensitive exact full name match (`fullName.toLowerCase() === candidateName.toLowerCase()`).
    - Exact email match.
    - Unique first-name match if exactly one active member possesses that first name.
    - Multiple active members sharing the same first name or identical full names return unresolved with `suggestedAssignee: null, isAmbiguousAssignee: true`.
    - Inactive members, cross-tenant users, or non-members return unresolved with `suggestedAssignee: null, isAmbiguousAssignee: false`.
- **API Endpoint Mounting (`routes/meetings.js`):**
  - Mounted canonical endpoint `POST /api/v1/organisations/:orgId/meetings/:meetingId/ai/action-items`.
  - Protected with `authenticateToken`, `requireOrgMembership`, `requireModuleEntitlement('meetings')`, and `requireOrgPermission('meeting.view')`.
- **Frontend Integration & Finding-01 Safe Retry Modal (`AiActionItemsModal.tsx` & `MeetingDetailPage.tsx`):**
  - Created `frontend/src/pages/workspace/meetings/AiActionItemsModal.tsx` following ManageX Clean Enterprise light theme.
  - Wired trigger buttons in `MeetingDetailPage.tsx`:
    - Tab 4 Header: "Extract with AI" button next to "Add Action Item".
    - Tab 4 Empty State: "Extract with AI" button next to "Add Action Item".
    - Tab 3 Section 3 (Integrated MOM View): "Extract with AI" button.
  - Features of `AiActionItemsModal`:
    - Optional Focus Areas and Additional Instructions.
    - Candidate list with selection checkboxes, title input, description input, priority selector, due date picker, and active member assignee selector.
    - Status badges for matched assignees (`Matched: {name}`), ambiguous matches (`Ambiguous: multiple matches`), and unresolved candidates (`Candidate not in organisation`).
    - Add item manually and remove item controls.
    - Validation on save: requires non-empty title and valid active assignee for all selected items.
    - Sequential save via standard endpoint `POST /organisations/:orgId/meetings/:meetingId/action-items` with Finding-01 retry protection (confirmed successful items are immediately removed from draft state; if a subsequent item fails, only uncommitted items remain for user review and safe retry without duplicate submissions).

### 2. Files Created or Changed
- `backend/src/platform/ai/schemas/meetingsAiSchemas.js` (Added action item schemas)
- `backend/src/platform/ai/meetingsAiService.js` (Implemented extraction and candidate matching)
- `backend/src/routes/meetings.js` (Mounted POST `/:meetingId/ai/action-items`)
- `backend/src/platform/ai/meetingsAi.test.js` (Added 12 unit tests for schema, prompt, and candidate matching)
- `backend/src/platform/ai/meetings_actions_ai.integration.test.js` (Created 10 comprehensive integration tests)
- `frontend/src/pages/workspace/meetings/AiActionItemsModal.tsx` (Created review modal with safe retry)
- `frontend/src/pages/workspace/meetings/AiActionItemsModal.test.tsx` (Created 5 frontend unit/SSR tests)
- `frontend/src/pages/workspace/meetings/MeetingDetailPage.tsx` (Wired modal and triggers)
- `docs/managex-ai-implementation-plan.md` (Updated §4.1 and §9.3)
- `docs/requirements-traceability.md` (Updated `AI-REQ-06` to VERIFIED)
- `docs/progress.md` (Appended Phase 02C report)

### 3. Verification & Test Results
- **AI Unit Tests (`meetingsAi.test.js`, `openrouterClient.test.js`):** 30/30 passed (100%).
- **AI Integration Tests Suite (`meetings_actions_ai`, `meetings_agenda_ai`, `meetings_summary_ai`):** 22/22 passed (100%) against `managex_test`.
- **Frontend Meetings AI Tests (`AiActionItemsModal.test.tsx`, `AiNotesSummaryModal.test.tsx`, `AiAgendaDraftModal.test.tsx`):** 18/18 passed (100%).
- **Frontend Meeting Detail Page Tests (`MeetingDetailPage.test.tsx`):** 47/47 passed (100%).
- **Frontend Production Build (`tsc && vite build`):** 0 errors, build successful.

### 4. Database Migrations Added
- Zero migrations: Used existing schema (`meetings`, `meeting_notes`, `meeting_discussion_points`, `meeting_decisions`, `meeting_action_items`, `organisation_memberships`, `organisation_ai_settings`, `ai_usage_records`). No new migration created or needed.

### 5. Next Phase
- Phase 02C Targeted Audit Remediation (Findings 01, 02, 03).

---

## Phase 02C Remediation Report — Targeted Audit Remediation (Findings 01, 02, 03)

### 1. Requirements Remediated
- **Finding 01 Remediation (Contract Alignment between Backend and Frontend Modal):**
  - Aligned frontend `AiActionItemsModal.tsx` directly with canonical backend response schema:
    - Root response property `candidateActionItems` (replaces previous client expectation of `actionItems`).
    - Extracted due date property `suggestedDueDate` mapped to `dueDate` (replaces `dueDate`).
    - Extracted raw candidate name `rawAssigneeName` mapped to `candidateAssigneeName`.
    - Suggested assignee object `suggestedAssignee` includes `{ userId, fullName, name, email }`. Badge display renders `Matched: {item.suggestedAssignee.fullName}`.
  - Aligned `backend/src/platform/ai/meetingsAiService.js` `matchAssigneeCandidate`:
    - Now returns `suggestedAssignee: { userId: m.user_id, fullName: m.full_name, name: m.full_name, email: m.email }` preserving backward compatibility while strictly supplying `fullName`.
  - Added dedicated contract compatibility tests in `AiActionItemsModal.test.tsx` verifying:
    - Canonical `candidateActionItems` shape parsing.
    - Multiple candidate items with all priorities.
    - Missing optional due dates safely defaulting to empty string.
    - Unresolved candidates when assignee is not in active member roster.
    - Empty candidate list handling.
- **Finding 02 Remediation (Permission Symmetry for Action Item Management):**
  - Identified permission asymmetric discrepancy: `extractMeetingActionItems` permitted `meeting.edit`, whereas the underlying persistence endpoint `createMeetingActionItem` strictly requires `meeting.action.manage`, `org.admin`, `org.owner`, or being the meeting organiser.
  - Removed `meeting.edit` from `canManageActions` in `backend/src/platform/ai/meetingsAiService.js`:
    ```javascript
    const canManageActions =
      isOrganiser ||
      hasPermission(userPermissions, 'meeting.action.manage') ||
      hasPermission(userPermissions, 'org.admin') ||
      hasPermission(userPermissions, 'org.owner');
    ```
  - Added integration test `Test 5b` in `meetings_actions_ai.integration.test.js` asserting that a user holding `meeting.notes.read` AND `meeting.edit` (but lacking `meeting.action.manage`) receives HTTP 403 `FORBIDDEN`.
  - Aligned documentation in `docs/managex-ai-implementation-plan.md` (§4.1, §9.3) to exclude `meeting.edit`.
- **Finding 03 Assessment & Architectural Specification (Server-Side Idempotency):**
  - Confirmed current client-side retry handling in `AiActionItemsModal.tsx` implements Finding-01 safe retry (removing confirmed saved items from draft state).
  - Evaluated requirements for true server-side idempotency:
    - In-memory maps violate horizontal scalability and multi-process safety.
    - Redis is not part of the current technology stack or approved architecture.
    - Reliable server-side idempotency requires database schema persistence (`idempotency_keys` table or `client_request_id` column on `meeting_action_items`).
    - Per user explicit instructions: zero unapproved database migrations, schema alterations, or database mutations may be applied.
    - Fully specified the proposed database schema addition, uniqueness scope, concurrency locking behavior, and verification path for future stakeholder review and approval.

### 2. Files Created or Changed
- `backend/src/platform/ai/meetingsAiService.js` (Added `fullName` to match result; removed `meeting.edit` from `canManageActions`)
- `frontend/src/pages/workspace/meetings/AiActionItemsModal.tsx` (Mapped canonical `candidateActionItems`, `suggestedDueDate`, `rawAssigneeName`, `fullName`)
- `backend/src/platform/ai/meetingsAi.test.js` (Updated unit test for `suggestedAssignee.fullName`)
- `backend/src/platform/ai/meetings_actions_ai.integration.test.js` (Added Test 5b for `meeting.edit` denial; verified `suggestedAssignee.fullName`)
- `frontend/src/pages/workspace/meetings/AiActionItemsModal.test.tsx` (Added 5 contract compatibility tests)
- `docs/managex-ai-implementation-plan.md` (Updated §4.1 and §9.3)
- `docs/progress.md` (Appended Phase 02C Remediation section)

### 3. Verification & Test Results
- **AI Unit Tests (`meetingsAi.test.js`, `openrouterClient.test.js`):** 30/30 passed (100%).
- **AI Integration Tests Suite (`meetings_actions_ai`, `meetings_agenda_ai`, `meetings_summary_ai`):** 23/23 passed (100%) against `managex_test` (including new permission symmetry Test 5b).
- **Frontend Meetings AI Tests (`AiActionItemsModal.test.tsx`, `AiNotesSummaryModal.test.tsx`, `AiAgendaDraftModal.test.tsx`):** 20/20 passed (100%).
- **Frontend Meeting Detail Page Tests (`MeetingDetailPage.test.tsx`):** 47/47 passed (100%).
- **Frontend Production Build (`tsc && vite build`):** 0 errors, build successful.

### 4. Database Migrations Added
- Zero migrations added: All remediations executed within existing database objects. Server-side idempotency schema addition documented and held for explicit migration approval.

### 5. Next Phase
- Phase 03: Events & Hackathons AI — Task 3.1 completed; Task 3.2 pending authorization.

---

## Phase 03 Task 3.1 Completion Report — Events AI Backend Schemas & Service Foundation

### 1. Requirements Implemented
- **Events AI Schemas (`backend/src/platform/ai/schemas/eventsAiSchemas.js`):**
  - `generateEventContentInputSchema`: Validates optional theme (max 200), target audience (max 200), focus areas (max 5 items, max 200 each), and additional instructions (max 1000).
  - `eventFaqItemSchema` & `generateEventContentOutputSchema`: Validates structured event title suggestion, overview (1-1000 chars), description (1-5000 chars), eligibility criteria, submission guidelines, rules array (max 20), and FAQ items array (max 15).
  - `generateJudgingRubricInputSchema`: Validates competition tracks (max 5), criteria count (2-10, default 4), focus areas, and additional instructions.
  - `judgingCriterionSchema` & `generateJudgingRubricOutputSchema`: Validates criteria names (2-120 chars), descriptions, scoring guidance, order index, and enforces PRD §20.14 Decision 9 / database schema constraints for `maxScore` (integer > 0 and <= 100).
- **Events AI Service Foundation (`backend/src/platform/ai/eventsAiService.js`):**
  - `moduleSlug: 'events'`.
  - System prompts `EVENT_CONTENT_SYSTEM_PROMPT` and `JUDGING_RUBRIC_SYSTEM_PROMPT` with delimiter isolation.
  - `sanitizeText` sanitizer neutralizing closing XML delimiters (`</event_context>`, `</event_tracks>`, etc.) to prevent prompt-injection breakouts.
  - `generateEventContent`: Retrieves event metadata inside `withTenantTransaction`, enforces `event.edit` / creator / admin authorization, rejects terminal events (`completed`, `cancelled`, `archived`) with HTTP 409 `EVENT_TERMINAL`, executes `executeAiCompletion` outside DB transaction with OpenRouter ZDR routing controls (`{ provider: { data_collection: 'deny', zdr: true } }`), and returns strictly ephemeral draft (`isDraft: true`).
  - `generateJudgingRubric`: Retrieves event context, enforces `event.edit` / creator / admin authorization, enforces strict scoring commencement guard (PRD EVT-008: queries `event_scores` and rejects with HTTP 409 `SCORING_ALREADY_STARTED` if scoring has commenced), executes `executeAiCompletion`, normalizes criteria scores/order, and returns ephemeral draft (`isDraft: true`).
  - Strict data minimization: Submissions, confidential judge notes, private scores, and unreleased participant data are strictly excluded from AI context. Zero automated database persistence.

### 2. Files Created or Changed
- `backend/src/platform/ai/schemas/eventsAiSchemas.js` (Created Zod schemas for content and rubrics)
- `backend/src/platform/ai/eventsAiService.js` (Created service with prompt builders, injection defenses, and lifecycle guards)
- `backend/src/platform/ai/eventsAi.test.js` (Created 12 unit tests for schema validation, score bounds, and prompt injection sanitization)
- `backend/src/platform/ai/events_ai.integration.test.js` (Created 7 database integration tests against `managex_test`)
- `docs/progress.md` (Appended Task 3.1 completion report)

### 3. Verification & Test Results
- **Events AI Unit Tests (`eventsAi.test.js`):** 12/12 passed (100%).
- **Events AI Integration Suite (`events_ai.integration.test.js`):** 7/7 passed (100%) against `managex_test`.
- **All AI Unit Tests Suite (`eventsAi.test.js`, `meetingsAi.test.js`, `openrouterClient.test.js`):** 42/42 passed (100%).
- **Database Migrations Added:** 0 (zero migrations; used existing `events`, `event_scoring_criteria`, `organisation_ai_settings`, `ai_usage_records`).

### 4. Next Task
- Phase 03 Task 3.2: API Route Mounting & Integration Tests (`POST .../events/:id/ai/content`, `POST .../events/:id/ai/rubrics`) — COMPLETED.

---

## Phase 03 Task 3.2 Completion Report — API Route Mounting & Integration

### 1. Requirements Implemented
- **Route Endpoint Mounting (`backend/src/routes/events.js`):**
  - Mounted `POST /api/v1/organisations/:orgId/events/:eventId/ai/content`:
    - Middleware pipeline: `requireOrgMembership`, `requireModuleEntitlement('events')`, `requireOrgPermission('event.edit')`.
    - Payload validation: parsed with `generateEventContentInputSchema`. Throws `ValidationError` (HTTP 422 `VALIDATION_ERROR`) on invalid payloads.
    - Handled via `generateEventContent({ organisationId, eventId, userId, userPermissions, input })`.
    - Responds with `sendSuccess(res, 200, draftResult)` containing `{ isDraft: true, eventId, content, usage }`.
  - Mounted `POST /api/v1/organisations/:orgId/events/:eventId/ai/rubrics`:
    - Middleware pipeline: `requireOrgMembership`, `requireModuleEntitlement('events')`, `requireOrgPermission('event.edit')`.
    - Payload validation: parsed with `generateJudgingRubricInputSchema`. Throws `ValidationError` (HTTP 422 `VALIDATION_ERROR`) on invalid payloads.
    - Handled via `generateJudgingRubric({ organisationId, eventId, roundId, userId, userPermissions, input })`.
    - Responds with `sendSuccess(res, 200, draftResult)` containing `{ isDraft: true, eventId, roundId, rubrics, usage }`.
- **Authorization & Security Guards:**
  - Enforced authentication: 401 when unauthenticated.
  - Enforced organization membership: 403 when user is not a member of `:orgId`.
  - Enforced module entitlement: 403 `MODULE_DISABLED` when the `events` module is disabled for `:orgId`.
  - Enforced permission: 403 `FORBIDDEN` when caller lacks `event.edit` and is not event creator / admin.
  - Enforced terminal event guard: 409 `EVENT_TERMINAL` when event status is `completed`, `cancelled`, or `archived`.
  - Enforced scoring commenced guard (EVT-008): 409 `SCORING_ALREADY_STARTED` when submissions have begun evaluation/scoring.
  - Enforced PostgreSQL tenant isolation & RLS: 404 `EVENT_NOT_FOUND` when attempting to access cross-tenant events.
  - Ephemeral AI generation: zero database writes performed on `events` or `event_scoring_criteria` tables.

### 2. Files Created or Changed
- `backend/src/routes/events.js` (Mounted `POST /:eventId/ai/content` and `POST /:eventId/ai/rubrics` with validation and access control)
- `backend/src/platform/ai/aiService.js` (Resolved `apiKey` dynamically from `env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY`)
- `backend/src/platform/ai/openrouterClient.js` (Resolved `apiKey` dynamically from `env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY`)
- `backend/src/platform/ai/events_routes_ai.integration.test.js` (Created comprehensive 11-test suite for route lifecycle, authorization, validation, scoring guards, and ephemerality)
- `backend/src/platform/ai/events_ai.integration.test.js` (Updated teardown to close DB pool cleanly)
- `docs/requirements-traceability.md` (Updated `AI-REQ-07` and `AI-REQ-08` backend status to verified)
- `docs/progress.md` (Appended Task 3.2 completion report)

### 3. Verification & Test Results
- **Events AI Route Integration Tests (`events_routes_ai.integration.test.js`):** 11/11 passed (100%) against `managex_test`:
  - `POST /api/v1/organisations/:orgId/events/:eventId/ai/content`:
    1. Event creator can generate ephemeral content draft via API endpoint (200 OK, `isDraft: true`, zero DB mutation)
    2. Rejects request with missing authentication (401 UNAUTHORIZED)
    3. Rejects user without organisation membership (403 FORBIDDEN)
    4. Rejects user lacking `event.edit` permission (403 FORBIDDEN)
    5. Rejects request when Events module is not entitled (403 MODULE_DISABLED)
    6. Rejects malformed payload exceeding input constraints (422 VALIDATION_ERROR)
    7. Rejects generation for completed terminal events (409 EVENT_TERMINAL)
    8. Cross-tenant event access fails closed (404 EVENT_NOT_FOUND)
  - `POST /api/v1/organisations/:orgId/events/:eventId/ai/rubrics`:
    1. Event editor can generate ephemeral judging rubric via API endpoint (200 OK, `isDraft: true`, integer maxScores, zero DB mutation)
    2. Rejects rubric generation once scoring has commenced (EVT-008, 409 SCORING_ALREADY_STARTED)
    3. Rejects invalid rubric request body (`criteriaCount < 2`, 422 VALIDATION_ERROR)
- **Events AI Foundation Integration Suite (`events_ai.integration.test.js`):** 7/7 passed (100%) against `managex_test`.
- **All AI Unit Tests Suite (`eventsAi.test.js`, `meetingsAi.test.js`, `openrouterClient.test.js`):** 42/42 passed (100%).
- **Database Migrations Added:** 0 (zero migrations added or executed).

### 4. Next Task
- Phase 03 Task 3.3: Frontend AI Modals & Event Integration (`AiEventContentModal`, `AiJudgingRubricModal`, and Event Detail / Judging setup wiring) — COMPLETED.

---

## Phase 03 Task 3.3 Completion Report — Frontend AI Modals & Event Integration

### 1. Requirements Implemented
- **AI Event Content Modal (`frontend/src/pages/workspace/events/AiEventContentModal.tsx`):**
  - Integrated into `EventDetailPage.tsx` action bar next to "Edit Event", guarded by `canEditEvent` and disabled when event is in terminal state.
  - Collects only valid inputs supported by `generateEventContentInputSchema`: Theme (max 200), Target Audience (max 200), Focus Areas (tags, max 5), and Additional Instructions (max 1000).
  - Calls `POST /api/v1/organisations/:orgId/events/:eventId/ai/content` with the existing authenticated `apiClient`.
  - Renders the returned structured draft as an explicitly labelled AI draft (`AI Draft` badge) with independent field-level selection:
    - Update Event Title (checkbox + editable input)
    - Apply Event Overview & Description (checkbox + editable textarea)
    - Apply Participant Instructions (checkbox + editable textarea formatted from guidelines, rules, and FAQs via `composeParticipantInstructions`)
  - Provides quick copy-to-clipboard buttons for Title, Description, Instructions, and raw FAQs.
  - Explicit confirmation & overwrite safeguards:
    - Does NOT automatically persist on generation or modal opening.
    - Pre-flight refetches current event state from server (`GET /organisations/:orgId/events/:eventId`).
    - If relevant fields have changed in the database since the modal was opened, halts and displays the `Concurrent Modification Detected` conflict review step showing side-by-side values ("Current in Database" vs "Your Proposed Draft").
    - Requires explicit confirmation to overwrite.
    - Preserves existing database values for unselected fields.
    - Persists via standard `PATCH /organisations/:orgId/events/:eventId` update workflow.
- **AI Judging Rubric Modal (`frontend/src/pages/workspace/events/AiJudgingRubricModal.tsx`):**
  - Integrated into `EventDetailPage.tsx` under Judging -> Criteria subtab next to "Add Criterion", guarded by `canEditEvent` and disabled for terminal events.
  - Collects Competition Tracks (max 5 tags), Criteria Count (2–10, default 4), Focus Areas (max 5 tags), and Additional Instructions (max 1000).
  - Calls `POST /api/v1/organisations/:orgId/events/:eventId/ai/rubrics${roundId ? `?roundId=${roundId}` : ''}`.
  - Strictly consumes `response.data.criteria` (NOT `rubrics`).
  - Merges generated `scoringGuidance` into criterion description using a clearly labelled `Scoring Guidance:` section via `mergeScoringGuidance`, allowing full user review and editing.
  - Validates `maxScore` as an integer between 1 and 100 per PRD §20.14 Decision 9.
  - Allows editing criterion name, max score, description, deleting individual criteria, adding custom criteria, and reordering.
  - Sequential save with Finding-01 retry protection:
    - Sequential creation via standard `POST /api/v1/organisations/:orgId/events/:eventId/criteria`.
    - Successfully saved criteria are removed from the unsaved draft list in real-time.
    - If a criterion fails (e.g. duplicate name 409 conflict or scoring started 409):
      - Saves halt immediately; unsaved criteria remain in the modal list.
      - Displays actionable Partial Save Notice detailing saved count, failed criterion name, and server error message.
      - Prevents duplicate submissions of already-saved criteria upon retry.
    - Re-fetches judging criteria via `fetchJudgingData()` upon completion.

### 2. Files Created or Changed
- `frontend/src/pages/workspace/events/AiEventContentModal.tsx` (Created AI event content modal with field selection, copy tools, and concurrency conflict detection)
- `frontend/src/pages/workspace/events/AiJudgingRubricModal.tsx` (Created AI judging rubric modal with score bounds, scoring guidance consolidation, and sequential save retry protection)
- `frontend/src/pages/workspace/events/EventDetailPage.tsx` (Wired action buttons and dialog components guarded by `canEditEvent` and active event lifecycle)
- `frontend/src/pages/workspace/events/AiEventContentModal.test.tsx` (Created 7 unit and concurrency tests)
- `frontend/src/pages/workspace/events/AiJudgingRubricModal.test.tsx` (Created 7 unit, score bound, and Finding-01 sequential save retry tests)
- `docs/requirements-traceability.md` (Updated `AI-REQ-07` and `AI-REQ-08` status to `VERIFIED`)
- `docs/progress.md` (Recorded Task 3.3 completion report)

### 3. Verification & Test Results
- **Frontend Event AI Tests (`AiEventContentModal.test.tsx`, `AiJudgingRubricModal.test.tsx`, `EventDetailPage.test.tsx`):** **26/26 passed (100%)**.
- **All AI Frontend Modal Suites (`events/`, `meetings/Ai*`):** **45/45 passed (100%)**.
- **Frontend Production Build & Typecheck (`tsc && vite build`):** **0 errors, build successful**.
- **Backend AI Unit Suites (`eventsAi.test.js`, `meetingsAi.test.js`, `openrouterClient.test.js`):** **42/42 passed (100%)**.
- **Backend AI Integration Suites (`events_ai.integration.test.js`, `events_routes_ai.integration.test.js`):** **18/18 passed (100%)** against `managex_test`.
- **Database Migrations Added:** 0 (zero migrations added or executed).

### 4. Next Phase
- Phase 04: Projects & Tasks AI (Task Breakdown & Status Reports).
