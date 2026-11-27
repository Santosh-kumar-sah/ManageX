# Visual preview traceability

The baseline checkout omits `docs/PRD.md`. The reference for this branch is the last version before the documentation deletion, available with `git show 48cefe0^:docs/PRD.md`. Its indigo design direction conflicts with the user’s approved sea-glass preview. The proposed visual exception applies to this review branch. The project’s product and security requirements still apply.

| Requirement | Preview implementation | Verification |
| --- | --- | --- |
| UI-001 and UI-002, visual language and shared controls | Graphite, mineral white and teal tokens, locally hosted typography, shared brand and button styles, production WebP artwork | Frontend build, component tests and browser review |
| UI-003, responsive navigation | Organisation switcher, role-aware workspace destinations, separate platform administration, and mobile navigation | Workspace layout tests, public layout tests and browser review |
| UI-004 and UI-005, requests and isolation | Existing API and session infrastructure. Tool catalogue results are scoped to the active organisation | API client, route guard and workspace overview tests |
| UI-006 and UI-007, accessible interaction | Real links, labelled controls, native chapter anchors, FAQ expansion, reduced motion and keyboard dialog focus | Accessibility and homepage tests, plus browser navigation and keyboard checks |
| UI-008, responsiveness | Optimised desktop and mobile images, compact navigation, event discovery and date-led meeting layouts | Chrome at 320, 390, 768 and 1440 pixels |
| UI-009, honest content | Real-data workspace catalogue, explicit loading/empty states, removal of static activity and service-health claims | Workspace overview and portal tests |

Production adoption, authenticated verification on the chosen preview host, and resolution of the pre-existing registration close-time discrepancy are separate from visual acceptance. No migrations were added.

The workspace follow-up covers event management and judging (EVT), meeting detail and minutes (MTG), project task views (PRJ-005), and organisation activity (AUD-004). Board and list share the permitted status choices and keep the existing task update endpoint. The audit screen uses the actor and item returned by the server. Its action filter explicitly covers the displayed page because the endpoint paginates without filtering by action. The original and redesigned routers contain the same 43 route declarations, including layouts and guards.
