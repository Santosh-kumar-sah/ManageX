# Sea-glass UI preview

ManageX now has a review branch, `redesign/sea-glass-preview`. The original frontend is recorded at tag `ui-before-redesign`, commit `5f0469de7de44890cf345e3596fed646f19c2cd9`. The public Netlify site served the same JavaScript and CSS asset names as the local original build at the start of the review.

## Delivered for review

- The homepage uses responsive WebP renders, locally served Instrument Sans, three linked product chapters, and motion that respects the visitor’s preference. All calls to action open existing destinations.
- The public header, product pages, account screens and event portal use the new design. Customers can find event registration and clear explanations of who can access their work.
- Workspace and administration use mineral surfaces, teal accents and the shared wordmark. The workspace overview displays the organisation’s tool catalogue. Meeting dates, times, locations and status are grouped for scanning. Renewed copy covers meeting minutes, participant pages and organisation settings.
- Shared controls and keyboard focus support the redesigned screens. Larger tools load on demand when their route opens.

## Verification

Frontend type checking, lint, the Vitest suite and a production build ran locally. Browser checks in installed Chrome exercised the homepage, chapter links, FAQ, product anchors, account registration entry, public event search controls, event details and a signed-out protected route at 320, 390, 768 and 1440 CSS pixels. Member workspace and meeting dialog checks ran at 390 and 1440 pixels, including keyboard focus and tabs. Browser data came from isolated responses. Browser checks did not write to a production account. ESLint still reports warnings, primarily for existing uses of `any`.

Backend endpoints, database migrations, authentication rules and deployment settings are outside this visual change. Customer acceptance and a production release remain pending. A known pre-existing UI/PRD discrepancy concerns the default close time shown when an event has no explicit registration close time. The existing public event detail uses event end and the archived PRD specifies event start. This preview preserves the existing registration behaviour for separate product review.
