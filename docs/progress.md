# Sea-glass UI preview

## Signed-in workspace review, 27 November 2026

All 226 frontend tests passed. The end-to-end browser run also passed from fresh accounts, including an assigned judge opening the team's submission, saving a score to the active event and seeing the confirmation. The run reported no uncaught browser exceptions.

The review branch now styles event management, evaluation schedules and judging, meeting details and exports, project boards and lists, and the remaining organisation and platform settings. Form errors and help text are associated with their fields. The mobile administration header stacks its title so the workspace link stays reachable at 320 pixels.

Chrome checks used the production frontend build, the existing Express API and an isolated PostgreSQL instance with the repository migrations and demo accounts. An organiser created and moved a task, reopened it from the list, added an agenda item and downloaded Markdown and PDF minutes. A participant registered for an event, saw it on their dashboard and received the expected restricted screen on a member-only route. A member received the restricted audit screen. All five platform administration pages fit at 320 and 1440 pixels, and workspace inspection opened successfully.

Local commands included `npm run build:frontend` (including TypeScript), `npm run lint:frontend`, and `npm --prefix frontend test -- --silent --maxWorkers=3 --minWorkers=1 --reporter=dot`. The suite includes regression tests for keyboard task moves, read-only tasks and reopening completed tasks. Frontend lint reported 147 warnings and zero errors. No migration, backend access rule or production setting changed. Live Google authorisation, outbound email and AI generation require a configured review environment. The next phase is owner comparison on the draft preview, followed by an explicit release decision.

ManageX now has a review branch, `redesign/sea-glass-preview`. The original frontend is recorded at tag `ui-before-redesign`, commit `5f0469de7de44890cf345e3596fed646f19c2cd9`. The public Netlify site served the same JavaScript and CSS asset names as the local original build at the start of the review.

## Delivered for review

- The homepage uses responsive WebP renders, locally served Instrument Sans, three linked product chapters, and motion that respects the visitor’s preference. All calls to action open existing destinations.
- The public header, product pages, account screens and event portal use the new design. Customers can find event registration and clear explanations of who can access their work.
- Workspace and administration use mineral surfaces, teal accents and the shared wordmark. The workspace overview displays the organisation’s tool catalogue. Meeting dates, times, locations and status are grouped for scanning. Renewed copy covers meeting minutes, participant pages and organisation settings.
- Shared controls and keyboard focus support the redesigned screens. Larger tools load on demand when their route opens.

## Verification

Frontend type checking, lint, the Vitest suite and a production build ran locally. Browser checks in installed Chrome exercised the homepage, chapter links, FAQ, product anchors, account registration entry, public event search controls, event details and a signed-out protected route at 320, 390, 768 and 1440 CSS pixels. Member workspace and meeting dialog checks ran at 390 and 1440 pixels, including keyboard focus and tabs. Browser data came from isolated responses. Browser checks did not write to a production account. ESLint still reports warnings, primarily for existing uses of `any`.

Backend endpoints, database migrations, authentication rules and deployment settings are outside this visual change. Customer acceptance and a production release remain pending. A known pre-existing UI/PRD discrepancy concerns the default close time shown when an event has no explicit registration close time. The existing public event detail uses event end and the archived PRD specifies event start. This preview preserves the existing registration behaviour for separate product review.
