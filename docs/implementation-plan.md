# UI review and release

1. **Baseline recorded.** The original version is tagged `ui-before-redesign`. The review branch started from the same verified GitHub main commit.
2. **Visual implementation and local checks.** Compare the new homepage on desktop and mobile, scroll through Events, Meetings and Projects, and follow the existing registration and sign-in links. In a review workspace, check the organisation switcher, meeting filters, dialog focus, and project navigation.
3. **User acceptance.** Compare the preview to the existing Netlify site. Record adjustments on the review branch. Approval to create this branch covers the sea-glass design for evaluation. Production adoption requires a separate decision.
4. **Release after approval.** Recheck the frontend against then-current main, run the checks below and verify the preview host’s session configuration. A squash merge makes the design one revertible change. Treat a merge into an auto-deployed branch as a release.
5. **Keep the prior design or roll back.** Before release, main continues to carry the prior design. Following a release, revert the merge or squash commit in a new reviewed change, retest and redeploy the frontend. Preserve unrelated work added since the baseline.

## Repeatable local checks

For signed-in review, use a disposable database populated by the repository migrations and demo seeder. Sign in as the organiser, create a task, move it on the board and reopen it from the list. Add a meeting agenda item and download both minutes formats. Register as a participant and check the event dashboard. Open an assigned round as a judge. As a platform administrator, review the overview, accounts, organisations, tools and audit log at mobile width. Use dedicated review provider accounts for live Google, email and AI checks before release.

From the repository root, run `npm --prefix frontend ci`, `npm run typecheck:frontend`, `npm run lint:frontend`, `npm run test:frontend` and `npm run build:frontend`. Run `npm run dev:frontend` for interactive review. Local API-backed actions use the configured API or the existing Vite proxy to the backend on port 4000. Use an authorised review account for write flows.
