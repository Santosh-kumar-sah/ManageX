# ManageX Future Suggestions (Out of MVP Scope)

This document captures valid feature suggestions and technical enhancements noted during the Phase 0 audit that are **explicitly out of scope** for the ManageX MVP as per `docs/PRD.md` Section 4.2.

**Rule:** None of these items shall be implemented during Phase 1–11 without formal product owner sign-off and a PRD version increment.

---

## 1. Billing & Commercial
- **Stripe / LemonSqueezy Integration:** Subscription billing, seat management, invoices, and checkout flows.
- **Usage-based Metering:** Per-organisation limits on participant registrations, active projects, or total file/URL items.

## 2. Events & Hackathons Enhancements
- **Direct File/Asset Uploads:** Direct submission of zip archives, PDFs, or slides with anti-virus scanning and AWS S3/Cloudflare R2 storage.
- **Waitlists:** Automated waitlisting when event capacity reaches 100%.
- **Ticketing & Paid Registrations:** Paid ticket tiers, discount codes, and QR-code-based check-in scanners.
- **Live Streaming & Virtual Stage:** Embedded video streams (Twitch/YouTube) and live chat during hackathon kickoffs.
- **Automated Tie-Breaking & Criteria Weighting:** Custom weight multipliers per judging criterion and tournament-style bracket evaluation.
- **Digital Certificates:** Automated certificate generation and LinkedIn badges for hackathon finishers.

## 3. Meetings Enhancements
- **Built-in Audio/Video Conferencing:** Integrated WebRTC, Zoom, or Google Meet API automatic provisioning.
- **Live Meeting Transcripts & AI Summaries:** Audio transcription and automated action item generation via LLM.
- **Bi-directional Calendar Sync:** CalDAV / Google Calendar / Microsoft Outlook bi-directional synchronization.
- **Recurring Meetings Engine:** RFC 5545 recurrence rules (daily, weekly, monthly series).
- **Automated Task Conversion:** 1-click conversion from meeting action item directly into a Projects & Tasks backlog task.

## 4. Projects & Tasks Enhancements
- **Gantt Charts & Dependencies:** Finish-to-start task dependencies, critical path analysis, and timeline views.
- **Agile Sprint Planning & Burndown Charts:** Sprints, story points, velocity metrics, and epic management.
- **Time Tracking:** Start/stop timers, billable hours tracking, and timesheet approvals.
- **Subtasks & Checklists:** Hierarchical multi-level task decomposition.
- **Custom Workflow Automations:** "When status changes to Done, notify manager and archive".

## 5. Platform & Identity Enhancements
- **SAML / SSO & SCIM Directory Sync:** Enterprise Okta, Google Workspace, and Azure AD single sign-on.
- **Multi-Factor Authentication (MFA/TOTP):** Authenticator app TOTP verification for organization owners and platform admins.
- **Full Support Ticketing Portal:** Customer-facing support ticket submission, SLA timers, and agent assignment queues.
- **Audit Log Export / SIEM Integration:** Streaming audit logs to Datadog, Splunk, or AWS S3.
