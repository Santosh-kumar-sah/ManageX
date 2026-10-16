MANAGEX
Product Requirements Document (PRD)
Multi-Tenant Modular Organisation Management SaaS Platform
Document version: 1.0
Product name: ManageX
Document status: Initial implementation specification
Product type: Multi-tenant B2B SaaS web application
Primary UI direction: Clean Enterprise
Primary theme: Light
Initial modules: Events & Hackathons, Meetings, Projects & Tasks
Target implementation: End-to-end production-oriented application
Primary backend: Node.js + Express.js
Primary database: PostgreSQL
Frontend: React + TypeScript
Architecture: Modular monolith with shared-database multi-tenancy, configurable RBAC, and PostgreSQL Row-Level Security (RLS)
________________________________________
1. Purpose of This Document
This PRD is the single product-level source of truth for building ManageX.
An AI coding assistant or development team must use this document to understand:
•	What ManageX is and what problem it solves.
•	Who will use the product.
•	How platform, organisation and module-level access control works.
•	How the user interface and user experience should look and behave.
•	How the initial three modules work.
•	How organisations, memberships, roles, permissions, modules and subscriptions relate to one another.
•	How multi-tenancy and database isolation must be enforced.
•	How APIs, validation, database migrations, testing and deployment are organised.
•	Which features belong to the MVP and which must wait until later.
•	How to implement the product through controlled, testable phases.
The implementation must follow this document instead of independently inventing product behaviour, access rules, UI conventions or database structures.
If a requirement is ambiguous, the coding assistant must document the ambiguity, inspect the existing implementation and choose the safest option consistent with this PRD. It must not silently weaken security or introduce major architectural changes.
If a change to the architecture becomes necessary, it must be documented with its reason, consequences and migration plan before implementation.
2. Product Overview
2.1 What Is ManageX?
ManageX is a modular, multi-tenant organisation management platform.
It enables different organisations to use a common application while keeping their users, data, resources, settings and permissions isolated from one another.
An organisation can activate the modules it needs and manage them through a unified workspace.
The initial product contains:
1.	Events & Hackathons Management
2.	Meetings Management
3.	Projects & Tasks Management
Additional modules, such as Employee Management and Recruitment Management, may be added after the initial version without redesigning the entire platform.
2.2 Core Product Concept
ManageX separates the product into three access-control levels:
Level 1 — Platform: Controls the SaaS platform itself.
Level 2 — Organisation: Controls a customer's organisation, its members, settings and module subscriptions or entitlements.
Level 3 — Module: Controls what a user can do inside a particular module and, when applicable, a particular resource.
These are distinct permission scopes. Having a role at one level must not automatically grant unrestricted access at another level.
2.3 Example
Suppose ManageX has these organisations:
•	Alpha Technologies
•	Beta Innovations
•	Gamma Foundation
Each organisation uses the same ManageX application.
Alpha Technologies activates Events and Projects. Beta Innovations activates Meetings and Projects. Gamma Foundation activates all three modules.
Alpha's administrators must not access Beta's meetings, projects or member data simply by modifying a URL or supplying another organisation's ID.
A user may belong to multiple organisations. The interface must make the currently selected organisation clear, and all protected operations must use a verified organisation context.
3. Product Vision
Make organisation management simpler by providing one secure, flexible workspace in which teams can activate only the modules they need and manage their work without using unrelated, disconnected tools.
3.1 Product Principles
1.	Security first: Tenant isolation and server-side authorization are mandatory.
2.	Simple UX: Users should understand where they are and what they can do.
3.	Consistent design: All modules must follow the same design system.
4.	Modular architecture: Modules must be independent enough to develop and evolve separately.
5.	Least privilege: Users receive only the access necessary for their work.
6.	Explicit configuration: Roles, permissions and module activation must be managed through defined records and policies.
7.	Auditability: Important administrative and security-sensitive operations must be traceable.
8.	Maintainability: Prefer understandable code and a modular monolith over unnecessary microservices.
9.	Progressive development: Build, test and verify one implementation phase at a time.
10.	No fake functionality: Controls must work as described, or be clearly marked unavailable.
4. Goals and Non-Goals
4.1 MVP Goals
The first release must provide:
•	A professional marketing website.
•	Secure registration, login, logout, email verification and password recovery.
•	Organisation creation and switching.
•	Invitations and organisation membership management.
•	The three-level access model.
•	Module catalogue and module activation.
•	Configurable role-based access control.
•	Events and hackathon workflows.
•	Meeting scheduling and action-item tracking.
•	Project, task, status and assignment management.
•	Organisation-scoped PostgreSQL data access with RLS.
•	Platform administration.
•	Audit logs for sensitive actions.
•	A responsive Clean Enterprise interface.
•	Automated tests, environment configuration and deployment documentation.
4.2 Non-Goals for MVP
Do not implement the following unless explicitly approved in a later version:
•	Microservices.
•	Kubernetes-based infrastructure.
•	Native Android or iOS apps.
•	Integrated live video conferencing.
•	A complete HR/payroll platform.
•	Full recruitment and applicant-tracking workflows.
•	AI agents or AI-generated work summaries.
•	Complex workflow builders.
•	A public extension marketplace.
•	Customer-defined arbitrary SQL or executable code.
•	Full payment-provider integration.
•	Enterprise single sign-on or SCIM provisioning.
•	Real-time collaborative editing of documents.
•	Complex cross-organisation sharing of private resources.
The architecture should make future development possible without implementing every future feature now.
5. Target Users and Personas
5.1 Platform Super Admin
Manages ManageX itself.
Typical responsibilities:
•	View and manage organisations.
•	Configure the module catalogue.
•	Manage platform-level settings.
•	Manage platform support access.
•	Review security and audit activity.
•	Disable organisations or modules when authorised.
A Super Admin must not receive an unlogged, unrestricted ability to browse private tenant data.
5.2 Platform Support Agent
Helps users resolve account and configuration problems.
Typical responsibilities:
•	Review support requests.
•	Inspect appropriate platform and operational metadata.
•	Guide users through account recovery.
•	Escalate incidents to authorised administrators.
Support access must follow least-privilege principles. Private tenant content is not accessible by default. Any later support-access mechanism must be explicit, time-limited, reason-bound and audited.
5.3 Organisation Owner
Owns the organisation's ManageX workspace.
Typical responsibilities:
•	Configure organisation ownership.
•	Manage organisation-wide settings.
•	Assign or delegate administration.
•	Control membership and module administration.
•	Transfer ownership.
•	Request organisation closure.
Ownership transfer and closure are high-impact actions and require explicit confirmation and appropriate reauthentication.
5.4 Organisation Admin
Manages day-to-day organisation administration.
Typical responsibilities:
•	Invite and remove members.
•	Assign organisation and module roles within permitted limits.
•	Activate or deactivate available modules.
•	Manage organisation settings.
•	Review appropriate organisation audit activity.
An Organisation Admin cannot automatically access the platform administration console.
5.5 Organisation Member
Uses the workspace and activated modules according to assigned permissions.
Examples include event organisers, meeting participants, project managers and team members.
5.6 External Event Participant
A registered participant may take part in an eligible public event without automatically becoming a full member of the organisation hosting that event.
External participants must have access only to the public event information and their specifically authorised event resources.
This is a restricted event-scoped access path. It must never grant unrestricted organisation membership or organisation-wide data access.
6. Scope of the Three Initial Modules
6.1 Module 1: Events & Hackathons Management
Module key: events
The module must support organising events and hackathons through a consistent workflow.
Functional requirements
EVT-001: Event creation
An authorised user can create an event with:
•	Title.
•	Description.
•	Event type: general event or hackathon.
•	Start and end date/time.
•	Time zone.
•	Venue or online event URL, where applicable.
•	Registration opening and closing times.
•	Maximum participant count, when applicable.
•	Event status.
•	Organising team or responsible users.
•	Configurable participant instructions.
EVT-002: Event lifecycle
Support these statuses:
•	Draft
•	Published
•	Registration Closed
•	In Progress
•	Completed
•	Cancelled
•	Archived
State transitions must be validated on the server. A status cannot be changed simply by submitting an arbitrary string.
EVT-003: Event publishing
Only an authorised organiser can publish an event.
A published public event may expose explicitly designated public fields. Drafts and private events must not appear to unauthorised users.
EVT-004: Registration
For eligible events, authenticated users can register during the permitted registration period.
The system must validate:
•	Event publication and registration status.
•	Registration opening and closing times.
•	Capacity limits.
•	Duplicate registrations.
•	Participant eligibility rules when configured.
•	Required fields and their validation.
Registration limits must be enforced transactionally to reduce overbooking under concurrent requests.
EVT-005: Participants
Authorised event staff can view, search and manage participants within their permitted event scope.
Participants must be able to view their own registration and permitted event information.
EVT-006: Teams
For hackathons that enable teams:
•	Participants can create a team if permitted.
•	Team owners can invite or add eligible participants.
•	Team size limits are configurable.
•	Duplicate membership must be prevented.
•	Team membership changes must be validated.
•	A participant must not join teams contrary to the event's rules.
EVT-007: Submissions
Eligible participants or teams can submit:
•	Submission title.
•	Description.
•	Repository URL.
•	Demo URL.
•	Relevant metadata.
For MVP, URL-based submissions are sufficient. Arbitrary file uploads are deferred until secure storage, scanning, access control and retention policies are implemented.
The submission window must be enforced on the server.
EVT-008: Judges and evaluation
Event managers can assign judges to eligible events or submissions.
Judges can access only the events and submissions they are authorised to evaluate.
When scoring is enabled, the system supports:
•	A configurable set of judging criteria.
•	Scores within defined ranges.
•	Comments or feedback.
•	Submission and score timestamps.
•	A controlled submission/editing period.
EVT-009: Results
Authorised event administrators can review evaluation results and publish results where appropriate.
Unpublished scores must not be exposed to participants or unrelated users.
EVT-010: Views and filters
Provide:
•	Event list.
•	Event detail.
•	Calendar or date-based view where practical.
•	Registration list.
•	Team list.
•	Submission list.
•	Judge assignment view.
•	Evaluation/results view.
EVT-011: Event audit
Log security-sensitive actions such as publication, cancellation, registration administration, judge assignment and result publication.
Event module permissions
Examples of permission keys:
•	event.view
•	event.create
•	event.update
•	event.publish
•	event.cancel
•	event.archive
•	event.manage_registrations
•	team.manage
•	submission.create
•	submission.update_own
•	submission.view_assigned
•	judging.assign
•	score.submit
•	results.publish
The actual permission catalogue must be seeded centrally and referenced by role-permission assignments.
6.2 Module 2: Meetings Management
Module key: meetings
The module supports planning and documenting meetings.
Functional requirements
MTG-001: Meeting creation
An authorised user can create a meeting containing:
•	Title.
•	Description or objective.
•	Start and end date/time.
•	Time zone.
•	Location or meeting URL.
•	Organiser.
•	Attendees.
•	Agenda.
•	Visibility.
•	Meeting status.
MTG-002: Meeting lifecycle
Support:
•	Scheduled
•	In Progress
•	Completed
•	Cancelled
Expired meetings must not silently change in a way that contradicts their actual state. Any automatic transition rules must be defined and tested.
MTG-003: Attendees
The organiser can add or invite eligible attendees. Attendee lists must be visible only to authorised users.
Attendees can view the meetings they are entitled to access and their own participation information.
MTG-004: Agenda
Meeting organisers can define an ordered agenda with optional item descriptions and time allocations.
MTG-005: Notes and minutes
Authorised users can save meeting notes and minutes.
Confidential notes must not be returned to ordinary participants unless their permissions permit it.
MTG-006: Action items
Meetings can produce action items with:
•	Title and description.
•	Assigned user.
•	Due date.
•	Priority.
•	Status.
•	Optional source agenda item.
An action item must remain scoped to its organisation and meeting.
MTG-007: Search and calendar
Provide:
•	Upcoming meetings.
•	Past meetings.
•	Meeting detail.
•	Agenda.
•	Attendee list.
•	Action-item list.
•	Filters by date, status and organiser.
•	Calendar-style presentation.
MTG-008: Notifications
Where email notifications are enabled, send meeting invitations and relevant meeting updates through a configured email provider.
The product must not report an email as sent unless the configured provider confirms acceptance of the send request. Provider acceptance does not guarantee final delivery.
MTG-009: Auditing
Log meeting creation, cancellation, attendee changes, and changes to protected notes when relevant.
Meeting module permissions
Examples:
•	meeting.view
•	meeting.create
•	meeting.update
•	meeting.cancel
•	meeting.manage_attendees
•	meeting.manage_agenda
•	meeting.notes.view
•	meeting.notes.create
•	meeting.notes.update
•	meeting.action_items.manage
6.3 Module 3: Projects & Tasks Management
Module key: projects
The module provides lightweight project and task coordination.
Functional requirements
PRJ-001: Project creation
An authorised user can create a project with:
•	Name.
•	Description.
•	Project owner.
•	Start and target completion dates.
•	Status.
•	Priority.
•	Project members.
•	Optional labels.
PRJ-002: Project lifecycle
Support:
•	Planning
•	Active
•	On Hold
•	Completed
•	Archived
Server-side validation must prevent invalid transitions.
PRJ-003: Task management
A task contains:
•	Title.
•	Description.
•	Project.
•	Assignee.
•	Creator.
•	Status.
•	Priority.
•	Start date, where relevant.
•	Due date.
•	Creation and update timestamps.
•	Optional labels.
PRJ-004: Task statuses
The initial workflow is:
•	Backlog
•	To Do
•	In Progress
•	Blocked
•	Done
Statuses are controlled by the backend domain rules. The UI may present a Kanban board, but moving a card must invoke an authorised API operation.
PRJ-005: Assignment
Project managers can assign tasks to eligible project members.
A user must not be assigned a task in a project to which they are not authorised to contribute, unless the product explicitly supports and validates that arrangement.
PRJ-006: Task views
Provide:
•	List view.
•	Kanban view.
•	Assigned-to-me view.
•	Due-soon view.
•	Overdue view.
•	Project detail and member list.
PRJ-007: Comments and activity
If task comments are implemented in MVP, each comment must record its author and timestamps and follow the task's tenant and resource permissions.
An activity feed may record selected changes, such as assignment, status changes and due-date changes. Do not expose internal security metadata in a general activity feed.
PRJ-008: Search and filters
Support filtering tasks and projects by:
•	Status.
•	Assignee.
•	Priority.
•	Due date.
•	Project.
•	Labels where implemented.
Pagination must be server-side.
PRJ-009: Auditing
Log changes to project membership, project permissions and other high-impact project operations.
Project module permissions
Examples:
•	project.view
•	project.create
•	project.update
•	project.archive
•	project.manage_members
•	task.view
•	task.create
•	task.update
•	task.assign
•	task.delete
•	task.comment
Future modules
HR, Recruitment and other future modules must use the same shared conventions for:
•	Tenant context.
•	Authentication.
•	Organisation membership.
•	Module activation.
•	RBAC.
•	Audit logging.
•	Validation.
•	API responses.
•	Database migrations.
•	UI components.
A future module must not require a separate login system or a new tenant-isolation design.
7. Three-Level Access-Control Architecture
7.1 Level 1: Platform
Platform permissions govern the SaaS platform itself.
Platform Super Admin
Can:
•	Manage the module catalogue.
•	Manage organisations.
•	Configure platform settings.
•	Manage platform roles, within safeguards.
•	Disable an organisation or module when authorised.
•	Review platform-wide operational and security logs.
•	Manage support access policies.
Cannot:
•	Use unrestricted tenant-data access as an implicit consequence of the role.
•	Read private tenant content without an explicit authorised workflow.
•	Modify or erase audit records through ordinary administrative screens.
Platform Support Agent
Can:
•	View support requests.
•	Access permitted account and operational metadata.
•	Assist with configuration and login issues.
•	Escalate incidents.
Cannot by default:
•	Access private organisation content.
•	Assign themselves tenant permissions.
•	Make billing, platform-security or Super Admin changes without a separately granted permission.
Future platform roles
Billing Admin and Platform Auditor may be added later. They are not required to deliver the MVP.
7.2 Level 2: Organisation
Organisation Owner
Can:
•	Manage organisation-wide settings.
•	Manage organisation membership and administrative delegation.
•	Transfer ownership.
•	Initiate organisation closure.
•	Manage module access within permitted plan and platform restrictions.
Critical actions must have explicit confirmation, authorisation and audit events.
Organisation Admin
Can:
•	Invite, suspend or remove members, subject to ownership protections.
•	Manage organisation settings.
•	Activate available modules.
•	Assign approved module roles.
•	Review permitted organisation administration information.
Cannot:
•	Change platform-level configuration.
•	Transfer ownership unless the explicit ownership-transfer workflow allows it.
•	Access another organisation's data.
•	Grant themselves platform privileges.
Organisation Member
Has basic organisation membership and receives access to modules through explicit role assignments or approved default assignments.
Membership alone does not automatically grant permission to see every record in every module.
7.3 Level 3: Module
Each module defines its own roles and permission catalogue.
Initial example roles:
Module	Role	Primary access
Events	Event Admin	Manage permitted event-module configuration and resources
Events	Event Manager	Manage assigned events and their workflows
Events	Judge	Evaluate assigned submissions
Events	Participant	Access own registration, team and submission scope
Events	Event Viewer	Read explicitly permitted event information
Meetings	Meeting Admin	Manage permitted meeting-module resources
Meetings	Meeting Organiser	Create and manage authorised meetings
Meetings	Meeting Participant	Access meetings in which the user participates
Meetings	Meeting Viewer	Read explicitly permitted meeting information
Projects	Project Admin	Manage permitted project-module resources
Projects	Project Manager	Manage assigned projects, members and tasks
Projects	Team Member	Work on authorised projects and tasks
Projects	Project Viewer	Read explicitly permitted project information
Role names are meaningful defaults, not fixed authorisation logic. The actual rights must derive from the permissions assigned to each role and the resource scope of the current operation.
7.4 Independent scopes
The following are different concepts:
1.	Authentication: Who is the current user?
2.	Organisation membership: Does this user belong to the selected organisation?
3.	Module entitlement: Is the module available to that organisation?
4.	Permission: Is this user allowed to perform the action?
5.	Resource scope: May this user act on this particular event, meeting, project, task or submission?
6.	Tenant isolation: Is every relevant data operation restricted to the authorised tenant or explicitly allowed guest scope?
All applicable checks must pass.
7.5 Authorisation evaluation order
For protected organisation operations:
1.	Validate the user's authenticated session.
2.	Resolve the selected organisation from a trusted route or request context.
3.	Validate current organisation membership and membership status.
4.	Confirm that the target module is active and available to the organisation.
5.	Resolve the user's permissions for the requested action.
6.	Verify resource ownership, assignment, participation or other resource-level restrictions.
7.	Execute the operation within an appropriate tenant-scoped database transaction.
8.	Write audit records when required.
External event participants use a separate, restricted event-scoped authorisation path. They must not be treated as ordinary organisation members simply because they registered for an event.
7.6 Configurable RBAC
Do not implement logic such as:
if (user.role === "admin")
as the general authorisation mechanism.
Instead, use explicit permissions, such as task.assign or event.publish, and evaluate them through shared authorisation utilities or policies.
Suggested relationship:
User → Organisation Membership → Role Assignment → Role → Permission
For module roles, role assignments must identify the relevant organisation membership and module or resource scope.
Any custom-role feature must restrict assignment to approved permissions and prevent a user from granting permissions they are not authorised to delegate.
8. Product Information Architecture and URL Structure
Use clear, predictable URL conventions.
Suggested public routes:
•	/
•	/product
•	/modules
•	/security
•	/pricing
•	/login
•	/register
•	/verify-email
•	/forgot-password
•	/reset-password
Suggested authenticated routes:
•	/app
•	/app/organisations
•	/app/organisations/:organisationId
•	/app/organisations/:organisationId/dashboard
•	/app/organisations/:organisationId/modules
•	/app/organisations/:organisationId/members
•	/app/organisations/:organisationId/roles
•	/app/organisations/:organisationId/settings
•	/app/organisations/:organisationId/audit-logs
Events:
•	/app/organisations/:organisationId/events
•	/app/organisations/:organisationId/events/new
•	/app/organisations/:organisationId/events/:eventId
•	/app/organisations/:organisationId/events/:eventId/participants
•	/app/organisations/:organisationId/events/:eventId/teams
•	/app/organisations/:organisationId/events/:eventId/submissions
•	/app/organisations/:organisationId/events/:eventId/judging
Meetings:
•	/app/organisations/:organisationId/meetings
•	/app/organisations/:organisationId/meetings/new
•	/app/organisations/:organisationId/meetings/:meetingId
Projects and tasks:
•	/app/organisations/:organisationId/projects
•	/app/organisations/:organisationId/projects/:projectId
•	/app/organisations/:organisationId/tasks
•	/app/organisations/:organisationId/my-tasks
Platform administration:
•	/platform
•	/platform/organisations
•	/platform/modules
•	/platform/users
•	/platform/audit-logs
•	/platform/settings
The frontend must not assume that a user can access a route just because a navigation link is visible. Every protected API request must independently enforce authorisation.
Use a consistent naming convention in the actual implementation. Do not mix /org, /organisation and /workspace without a deliberate decision.
9. UI/UX Requirements — Clean Enterprise
9.1 Design Direction
ManageX must use a Clean Enterprise interface.
Visual characteristics:
•	White surfaces.
•	Very light neutral page background.
•	Restrained blue/indigo primary accents.
•	Clear typography.
•	Thin, subtle borders.
•	Moderate corner radii.
•	Consistent spacing.
•	Compact but readable tables.
•	Restrained shadows.
•	Professional status indicators.
•	Minimal decorative effects.
The product should feel trustworthy, mature, efficient and suitable for real organisations.
Avoid:
•	Excessive gradients.
•	Neon colours.
•	Heavy glassmorphism.
•	Large decorative illustrations inside work screens.
•	Too many dashboard cards.
•	Unnecessary animation.
•	Different visual languages across modules.
•	Emoji used as the primary icon system.
•	UI elements that imitate functionality but do not work.
9.2 Initial design tokens
Use these as starting tokens. Keep them centralised so the design can be adjusted without editing individual components.
Token	Initial value	Purpose
Primary	#4F46E5	Primary actions and selected states
Primary hover	#4338CA	Hover or stronger primary state
Page background	#F8FAFC	Main application canvas
Surface	#FFFFFF	Cards, panels and dialogs
Main text	#0F172A	Headings and body text
Secondary text	#64748B	Supporting information
Border	#E2E8F0	Dividers and component outlines
Success	#15803D	Success status
Warning	#B45309	Warning status
Error	#B91C1C	Error status
Info	#1D4ED8	Informational status
Do not communicate status through colour alone. Use text labels, icons or other accessible indicators where needed.
9.3 Typography
Use a consistent, readable type system.
Preferred font: Inter or a comparable professional sans-serif with a reliable system-font fallback.
Suggested hierarchy:
•	Page title: 26–32 px.
•	Section heading: 18–22 px.
•	Card heading: 15–17 px.
•	Standard body text: 14–16 px.
•	Supporting labels: 12–14 px.
•	Table text: approximately 13–14 px.
Do not use tiny text to fit more data on screen. Prefer pagination, filters and well-designed detail views.
9.4 Layout
Desktop application:
•	Left sidebar approximately 240–260 px, collapsible.
•	Top header approximately 60–68 px.
•	Main content with adequate padding.
•	Content width and table width adapted to screen size.
•	Consistent page title, description and action placement.
Suggested desktop structure:
Sidebar | Top header + Workspace switcher + User menu | Main content
The header must provide:
•	Current organisation/workspace selector.
•	Page or contextual navigation where appropriate.
•	Notification entry point when implemented.
•	Profile menu.
•	Account settings and logout.
The selected organisation must remain visually obvious.
9.5 Sidebar structure
Within an organisation workspace:
•	Overview
•	Modules
o	Events & Hackathons
o	Meetings
o	Projects & Tasks
•	Organisation
o	Members
o	Roles & Permissions
o	Module Access
o	Audit Logs, when authorised
o	Settings
Only show relevant navigation entries. However, hiding a navigation entry is a UX convenience, not the authorisation mechanism.
Module activation and permissions must determine which screens are available.
For platform administrators, use a separate platform administration navigation structure.
For regular users, use a reduced navigation structure reflecting the active organisation, module availability and permissions.
9.6 Reusable components
Create a central design system for:
•	Buttons.
•	Text inputs.
•	Textareas.
•	Selects and comboboxes.
•	Checkboxes and switches.
•	Radio groups.
•	Date and time inputs.
•	Cards.
•	Tables.
•	Badges.
•	Dropdown menus.
•	Tabs.
•	Breadcrumbs.
•	Modals and confirmation dialogs.
•	Tooltips.
•	Pagination.
•	Search and filter bars.
•	Empty states.
•	Skeleton loaders.
•	Toast notifications.
•	Alert banners.
•	Avatar and profile menus.
•	Form validation messages.
•	Permission-denied and not-found states.
All modules must use these shared components.
9.7 Interaction requirements
Every interactive component must have:
•	A clear label.
•	Defined loading behaviour.
•	A visible success state where applicable.
•	A visible failure state.
•	Keyboard accessibility.
•	Disabled state where an action is temporarily unavailable.
•	Confirmation for destructive or high-impact operations.
•	Prevention of accidental duplicate submissions.
No button may silently do nothing.
No form may display a success message before a successful response is received.
9.8 Responsive behaviour
Desktop:
•	Full workspace navigation.
•	Rich tables, side panels and multi-column layouts when useful.
Tablet:
•	Collapsible sidebar.
•	Reduced card columns.
•	Scrollable tables or deliberate alternative layouts.
Mobile:
•	Navigation drawer.
•	Single-column forms.
•	Stacked information panels.
•	Touch-friendly controls.
•	Horizontally scrollable tables only where a better mobile presentation is not practical.
•	Destructive actions protected against accidental taps.
The application must remain usable at narrow viewport widths without overlapping content or hiding essential controls.
9.9 Accessibility
Target WCAG 2.2 AA where applicable.
Requirements include:
•	Adequate colour contrast.
•	Keyboard navigation.
•	Visible focus states.
•	Correct form labels.
•	Meaningful page headings.
•	Appropriate accessible names for icon buttons.
•	Error summaries or clear field-level error messages.
•	Dialog focus handling.
•	Usable controls for assistive technologies.
Reference: https://www.w3.org/TR/WCAG22/
10. Required Screens and Their Behaviour
10.1 Public landing page
Sections:
•	Navigation with ManageX branding.
•	Hero headline and supporting description.
•	Primary CTA to register.
•	Secondary CTA to explore modules.
•	Overview of the three initial modules.
•	Benefits of a unified workspace.
•	Security and organisation-isolation explanation.
•	Simple how-it-works section.
•	Pricing or plan information only when supported by real configuration.
•	Footer with product, legal and contact links.
Avoid fabricated testimonials, customer logos, usage statistics or security certifications.
10.2 Registration and authentication
Registration:
•	Name.
•	Email address.
•	Password.
•	Password confirmation if used.
•	Acceptance of applicable terms and privacy notice.
Requirements:
•	Validate input on the server.
•	Normalise email addresses consistently.
•	Store only properly hashed passwords.
•	Verify email ownership before enabling sensitive account operations.
•	Do not reveal whether an arbitrary email address already has an account through password recovery responses.
•	Rate-limit login, registration, verification and reset operations.
•	Provide clear generic errors without exposing secrets.
Login, logout, verification and password reset must work end to end.
10.3 First-time onboarding
Suggested flow:
1.	User creates an account.
2.	User verifies their email.
3.	User signs in.
4.	User chooses to create an organisation or accept an invitation.
5.	If creating an organisation, user enters the organisation name and other required fields.
6.	The system creates the organisation and owner membership transactionally.
7.	The owner reviews available modules.
8.	The owner activates eligible modules.
9.	The owner invites initial members.
10.	ManageX opens the organisation dashboard.
A failed or interrupted onboarding operation must not leave duplicate organisations or orphaned owner assignments.
10.4 Organisation switcher
The user can switch between organisations to which they belong.
On switching:
•	Update the active organisation context.
•	Refresh organisation-specific navigation and dashboard data.
•	Revalidate access on the backend.
•	Prevent cached or stale data from the previous organisation appearing in the new context.
•	Reset or segregate client-side caches by organisation ID.
A previously selected organisation ID must never be treated as proof of membership.
10.5 Organisation dashboard
Include only useful, permission-appropriate information:
•	Welcome and organisation context.
•	Active module summary.
•	Upcoming meetings.
•	Assigned and overdue tasks.
•	Upcoming or active events.
•	Recent relevant activity.
•	Quick actions the current user can perform.
Dashboard widgets must not query data from inactive modules or expose content the current user cannot access.
Do not fill the dashboard with arbitrary charts just to make it look impressive.
10.6 Module catalogue
Show:
•	Module name.
•	Description.
•	Icon.
•	Availability.
•	Activation status.
•	Relevant features.
•	An activation or configuration action when authorised.
Separate these states:
•	Available to the platform.
•	Included or enabled for the organisation's plan, where plans are implemented.
•	Activated for the organisation.
•	Accessible to the current user.
These states are not interchangeable.
10.7 Member management
Provide:
•	Member list.
•	Search and filtering.
•	Pending invitations.
•	Member status.
•	Organisation role.
•	Assigned module roles.
•	Invite member.
•	Resend invitation.
•	Revoke pending invitation.
•	Suspend or remove membership, where authorised.
Membership removal must not accidentally delete historical audit records or content that belongs to the organisation.
10.8 Roles and permissions
Provide:
•	Role list filtered by organisation/module scope.
•	Role detail.
•	Assigned permissions.
•	Assigned members.
•	Permission assignment controls when authorised.
•	Clear descriptions of sensitive permissions.
The interface must make the scope obvious: platform role, organisation role or module role.
Do not allow an organisation administrator to assign platform permissions.
10.9 Module screens
Use a consistent screen pattern:
1.	Breadcrumb.
2.	Page title and concise description.
3.	Primary action.
4.	Search and filters.
5.	Main content area.
6.	Pagination or loading mechanism.
7.	Detail screen with clearly grouped information.
8.	Empty, error and access-denied states.
The three initial modules must share visual patterns without forcing every workflow into an identical layout.
11. Technical Architecture
11.1 Architectural style
Use a modular monolith.
The initial system must be one deployable application with clearly separated platform, identity, organisation, access-control and module domains.
Do not split the initial product into microservices.
The architecture must allow individual modules to be developed and tested independently while reusing shared infrastructure.
11.2 Recommended technology stack
Frontend
•	React
•	TypeScript
•	Vite
•	Tailwind CSS
•	Reusable and accessible UI components
•	React Router for navigation
•	TanStack Query or an equivalent library for server-state management, where appropriate
•	Zod or an equivalent validation library for client-side form validation
•	A consistent API client for communicating with the backend
Frontend rule: All new frontend components, pages, hooks, API integrations, and shared UI logic must use TypeScript (.ts and .tsx files). Avoid introducing JavaScript files for new application logic unless a tool configuration specifically requires them.
Backend
•	Node.js
•	Express.js
•	JavaScript only, using ES Modules (import and export)
•	PostgreSQL
•	pg (node-postgres) for database access and transaction management
•	Zod for runtime request and data validation
•	Centralised authentication and authorisation middleware
•	Centralised error handling and structured logging
•	Version-controlled SQL database migrations
Backend rule: All backend application logic must use JavaScript (.js files). Do not configure TypeScript compilation for the backend, and do not create backend .ts files. Use runtime validation, clear module boundaries, consistent naming and optional JSDoc annotations where they improve maintainability.
Database and Infrastructure
•	PostgreSQL with Row-Level Security (RLS)
•	SQL migrations stored in version control
•	Docker Compose for local development where appropriate
•	Environment-variable-based configuration
•	Git-based version control
•	Automated linting, tests and CI checks
The frontend and backend must remain separate application workspaces while following the same documented API contracts.
2. Updated Backend Project Structure
Use the following JavaScript-based structure as the starting point:
server/
  src/
    app.js
    server.js

    config/
      env.js

    db/
      pool.js
      transaction.js
      migrations/

    middleware/
      authenticate.js
      validate.js
      error-handler.js
      rate-limit.js

    domains/
      auth/
      users/
      organisations/
      memberships/
      invitations/
      platform/
      modules/
      entitlements/
      permissions/
      audit/

      events/
      meetings/
      projects/

    shared/
      errors/
      validation/
      security/
      logging/
      pagination/

  tests/
  package.json
  .env.example
Each domain may contain JavaScript route, controller, validation, database-query and business-logic files according to its actual complexity. Keep authentication and CRUD flows straightforward; avoid unnecessary abstraction layers.
Use a package.json configuration with "type": "module" so backend source files can consistently use ES Module syntax.
Example:
import express from "express";

const app = express();

app.use(express.json());

export default app;
The above is illustrative only. Production middleware, routes, configuration validation and error handling must be implemented in their designated phases.
3. Updated Frontend Project Structure
client/
  src/
    app/
    routes/
    layouts/
    components/
      ui/
      navigation/
      forms/
      tables/
      feedback/

    features/
      auth/
      organisations/
      members/
      modules/
      roles/
      platform/
      events/
      meetings/
      projects/

    api/
    hooks/
    lib/
    types/
    styles/

  package.json
Use .tsx for React components and .ts for TypeScript modules that do not contain JSX.
Frontend TypeScript types must describe API requests and responses, reusable data models and component props. These types improve compile-time safety but do not replace server-side validation or authorisation.
4. Updated Phase 0 — Repository and Requirements Audit
The AI coding assistant must:
•	Inspect the existing repository before changing files.
•	Confirm that the frontend uses React and TypeScript.
•	Confirm that the backend uses Node.js, Express.js and JavaScript ES Modules.
•	Verify that TypeScript compilation is configured for the frontend only.
•	Verify that backend source code uses .js files and does not depend on backend TypeScript compilation.
•	Document the frontend/backend workspace arrangement, development commands and API conventions.
5. Updated Phase 1 — Project Foundation and Design System
The AI coding assistant must:
•	Configure the React + TypeScript frontend.
•	Configure the Node.js + Express + JavaScript backend.
•	Set up the required package scripts, linting and code formatting for each workspace.
•	Establish environment configuration and startup validation.
•	Implement the ManageX Clean Enterprise design tokens and reusable UI components.
•	Establish the frontend API client and backend request/response conventions.
•	Implement the shared application shell, responsive layouts and initial routes.
•	Configure frontend type checking separately from backend JavaScript linting and testing.
•	Verify that both applications can be started independently during development.
Acceptance criteria:
•	The frontend builds and passes TypeScript type checking.
•	The backend starts without a TypeScript compilation step.
•	The frontend can communicate with the backend through the configured API.
•	Both applications have clear setup instructions.
•	No unnecessary backend TypeScript configuration or backend .ts files are introduced.
6. Updated API Contract and Validation Rule
Frontend and backend must share a clearly documented API contract.
•	Frontend TypeScript interfaces or types describe expected request and response shapes.
•	Backend Zod schemas validate incoming requests at runtime.
•	Backend controllers and database functions must never trust frontend types as proof that submitted data is valid.
•	Authentication, organisation membership, module entitlement, permissions, resource scope and PostgreSQL RLS must be enforced independently of TypeScript.
•	API response formats, error codes and pagination conventions remain the same as specified in the original PRD.
7. Updated AI Coding Assistant Instruction
The AI coding assistant must respect the selected language split throughout the entire project:
Frontend: TypeScript. Backend: JavaScript. Database: PostgreSQL and SQL migrations.
Do not convert the backend to TypeScript or mix backend .ts files into the JavaScript application. Use modern JavaScript ES Modules, runtime validation, modular domain boundaries, documented API contracts and automated tests.
All other ManageX requirements—including the three-level access-control architecture, multi-tenant isolation, RLS, the initial Events & Hackathons, Meetings, and Projects & Tasks modules, and the Clean Enterprise light UI—remain unchanged.
Shared API, form, error-handling and design-system code must not be duplicated separately across the three modules.
11.5 API convention
Base path:
/api/v1
Use plural resource names, consistent HTTP methods and explicit response schemas.
Examples:
•	GET /api/v1/organisations
•	POST /api/v1/organisations
•	GET /api/v1/organisations/:organisationId
•	GET /api/v1/organisations/:organisationId/members
•	POST /api/v1/organisations/:organisationId/invitations
•	GET /api/v1/organisations/:organisationId/modules
•	POST /api/v1/organisations/:organisationId/modules/:moduleKey/activate
•	GET /api/v1/organisations/:organisationId/events
•	POST /api/v1/organisations/:organisationId/events
•	GET /api/v1/organisations/:organisationId/meetings
•	POST /api/v1/organisations/:organisationId/meetings
•	GET /api/v1/organisations/:organisationId/projects
•	POST /api/v1/organisations/:organisationId/projects
Every protected endpoint must have an explicitly defined authentication and authorisation requirement.
Use 401 Unauthorized when authentication is absent or invalid and 403 Forbidden when an authenticated user lacks required access. For sensitive resources, a consistent 404 policy may be used to avoid leaking resource existence, but it must be deliberate and documented.
11.6 Standard API responses
Successful list response:
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
Error response:
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please review the submitted fields.",
    "details": []
  },
  "requestId": "example-request-id"
}
Do not expose stack traces, SQL errors, database credentials, raw tokens or other internal information in production API responses.
12. Multi-Tenancy and Database Security
12.1 Mandatory isolation model
ManageX uses a shared PostgreSQL database and shared schema for its initial deployment.
Each organisation-owned record must be associated with the correct tenant, usually through organisation_id.
All data access must apply tenant isolation.
Using organisation_id in the schema alone is not sufficient. Isolation must be enforced by backend authorization, SQL constraints and PostgreSQL RLS.
12.2 Tenant context
For a protected organisation request:
1.	Authenticate the user.
2.	Resolve the organisation ID from the request context.
3.	Verify the user's active membership.
4.	Verify access to the relevant module and resource.
5.	Begin a database transaction.
6.	Set the verified organisation and user context using transaction-local database settings.
7.	Perform authorised queries within that transaction.
8.	Commit or roll back.
9.	Ensure the next transaction cannot inherit the previous tenant context.
Illustrative pattern:
BEGIN;

SELECT set_config(
  'app.current_organisation_id',
  $1,
  true
);

SELECT set_config(
  'app.current_user_id',
  $2,
  true
);

-- Execute only authorised tenant-scoped operations.

COMMIT;
The third argument to set_config makes the value transaction-local.
This is an illustration, not the complete authorisation mechanism. Values must be parameterised; organisation membership must be checked before tenant context is established; and every tenant query must execute through the intended transaction.
Do not issue a context-setting statement and then execute unrelated queries using an arbitrary pooled connection.
12.3 RLS requirements
For tenant-owned tables:
•	Enable RLS.
•	Define policies for relevant operations.
•	Use restrictive USING and WITH CHECK expressions where appropriate.
•	Default to denying access when context or authorisation conditions are absent.
•	Enable FORCE ROW LEVEL SECURITY where appropriate and validate the effects for the intended table and access pattern.
•	Test SELECT, INSERT, UPDATE and DELETE isolation separately.
•	Never use a superuser or BYPASSRLS role for normal application requests.
•	Do not assume the table-owner role is protected automatically by RLS.
Example policy concept:
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

CREATE POLICY projects_tenant_isolation
ON projects
FOR ALL
USING (
  organisation_id =
  NULLIF(
    current_setting(
      'app.current_organisation_id',
      true
    ),
    ''
  )::uuid
)
WITH CHECK (
  organisation_id =
  NULLIF(
    current_setting(
      'app.current_organisation_id',
      true
    ),
    ''
  )::uuid
);
This policy demonstrates tenant filtering only. It does not replace membership, module-permission, project-membership or user-level checks.
A custom PostgreSQL setting is not cryptographic proof of identity. A database role that can freely set a tenant variable can potentially set another tenant's value if application control is bypassed. Parameterised queries, strict backend authorisation, RLS policies, least-privilege roles and tests are all necessary.
For external event participants, define separate narrowly scoped access policies or database functions for public event information and user-owned event records. Do not grant a guest unrestricted tenant context.
12.4 Database roles
Use separate roles for different operational responsibilities.
At minimum:
•	Migration/owner role, used only during controlled schema changes.
•	Runtime application role, with only required privileges and no BYPASSRLS.
•	Read-only monitoring role if operational reporting requires it.
The runtime application role must not be a PostgreSQL superuser.
Application users must not receive direct database credentials.
12.5 Cross-tenant references
Prevent cross-tenant relationships at the database level.
For example, if projects have a composite unique constraint on (organisation_id, id), task records should reference the project using the corresponding tenant-aware key.
Illustrative concept:
FOREIGN KEY (organisation_id, project_id)
REFERENCES projects (organisation_id, id)
Use the same principle for events, submissions, teams, meetings, action items and other tenant-owned parent-child relationships.
A valid record ID belonging to another tenant must not be sufficient to create a cross-tenant relationship.
12.6 Unique constraints
Determine the appropriate scope of each unique value.
Examples:
•	User email: globally unique after normalisation, where the chosen account model requires it.
•	Organisation slug: unique according to the defined platform-wide slug policy.
•	Module key: unique globally.
•	Organisation member: one active membership per user and organisation.
•	Event team membership: prevent duplicate participation where prohibited.
•	Registration: prevent duplicate registrations per user and event.
•	Role name: unique within its intended role scope, according to the schema design.
Do not use a global unique constraint where uniqueness should only exist within an organisation.
12.7 Security tests
The database and API tests must verify that:
•	An organisation member cannot query another organisation's projects.
•	An organisation administrator cannot change another tenant's organisation settings.
•	An event participant cannot inspect unrelated submissions.
•	A judge cannot evaluate an unassigned submission.
•	A user cannot assign themselves a role by directly changing a request payload.
•	An inactive module cannot be used through direct API calls.
•	RLS blocks queries without valid tenant context.
•	Tenant context does not leak through connection pooling.
•	Inserts and updates cannot write a different organisation_id.
•	A runtime application connection cannot bypass RLS.
PostgreSQL official documentation: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
13. Authentication and Session Security
13.1 Account lifecycle
Implement:
•	Registration.
•	Email verification.
•	Login.
•	Logout.
•	Forgot-password flow.
•	Reset-password flow.
•	Session expiration.
•	Revocation of existing sessions after appropriate security events.
•	Account status controls.
OAuth, SSO and passkeys may be added later without changing tenant ownership or RBAC.
13.2 Password storage
Use a suitable password-hashing algorithm such as Argon2id with parameters appropriate to the deployment environment.
Never store plaintext passwords or reversibly encrypted passwords.
Never log password values.
13.3 Session implementation
Choose and document one session strategy before implementation.
For a browser-based first release, prefer secure, HttpOnly cookies with server-controlled revocation and a well-defined session lifecycle.
If using short-lived access tokens with rotating refresh tokens, store refresh-session records server-side and only expose tokens through an explicitly reviewed secure cookie mechanism. Do not put long-lived authentication credentials in browser local storage.
Cookie-authenticated unsafe requests must be protected against CSRF using a suitable CSRF-token strategy and/or strict origin validation appropriate to the final deployment.
Cookie settings, CORS, cookie domain and SameSite behaviour must be tested under the actual frontend/API deployment configuration.
13.4 Authentication protections
•	Rate-limit login and password recovery.
•	Use generic errors for account-recovery responses.
•	Expire verification and password-reset tokens.
•	Store only a secure hash of high-entropy, single-use recovery tokens where appropriate.
•	Revoke or rotate sessions following password changes or other sensitive events.
•	Use HTTPS in production.
•	Prevent token leakage through logs, URLs and client-side error reports.
•	Avoid unnecessarily revealing account existence.
14. Database Entities and Relationships
The following is the required logical data model. Exact column definitions, nullability, indexes, constraints and migrations must be finalised before implementing module CRUD endpoints.
All primary entities need consistent ID and timestamp conventions. Tenant-owned resources must have organisation_id directly or through an explicitly reviewed secure relationship. Prefer explicit tenant keys in tenant-owned operational tables for clarity and enforcement.
14.1 Identity and platform
users
Core user accounts.
Important fields:
•	id
•	name
•	email_normalized
•	password_hash
•	email_verified_at
•	status
•	created_at
•	updated_at
user_sessions
Stores revocable session or refresh-session records according to the selected authentication strategy.
platform_role_assignments
Associates users with explicit platform roles.
platform_roles
Defines approved platform roles.
Platform permissions must be separate from organisation and module permissions.
14.2 Organisation and membership
organisations
Important fields:
•	id
•	name
•	slug
•	status
•	created_by
•	created_at
•	updated_at
•	deleted_at, if using soft deletion
organisation_memberships
Important fields:
•	id
•	organisation_id
•	user_id
•	status
•	joined_at
•	created_at
•	updated_at
Enforce membership uniqueness and ownership constraints.
organisation_invitations
Important fields:
•	id
•	organisation_id
•	email_normalized
•	invited_by
•	token_hash
•	status
•	expires_at
•	accepted_at
•	created_at
Invitation tokens must be high-entropy, single-use and time-limited.
organisation_settings
Stores validated organisation-specific configuration.
Do not use an unrestricted JSON field as a substitute for typed security-critical configuration.
14.3 Module catalogue and entitlements
modules
Global module catalogue.
Examples:
•	events
•	meetings
•	projects
Important fields:
•	id
•	key
•	name
•	description
•	status
•	sort_order
organisation_modules
Tracks module activation for each organisation.
Important fields:
•	organisation_id
•	module_id
•	status
•	activated_by
•	activated_at
•	deactivated_at
Use constraints that prevent duplicate entries for the same organisation and module.
plans and subscriptions
The schema may include plan and subscription foundations, but full automated payment processing is not required in MVP.
A module may be enabled only when allowed by platform configuration, entitlement and organisation activation rules.
The exact entitlement rules must be centralised rather than duplicated throughout controllers.
14.4 Roles and permissions
permissions
A centrally defined catalogue of permission keys and descriptions.
roles
Represents a role at an explicitly defined scope.
The model must distinguish platform roles, organisation roles and module roles.
role_permissions
Associates a role with permitted actions.
membership_role_assignments
Associates a role with an organisation membership and the applicable scope.
Resource assignments
Where required, resource-level relationships must identify permitted event, project, submission or other resources. A module role alone must not imply access to every resource if the role is restricted to assigned resources.
Do not place all authorisation rules in a single users.role column.
14.5 Audit and notifications
audit_logs
Important fields:
•	id
•	organisation_id, nullable for explicitly global platform operations
•	actor_user_id, nullable only for well-defined system events
•	action
•	resource_type
•	resource_id
•	result
•	request_id
•	metadata
•	created_at
Include only appropriate metadata. Never log passwords, access tokens, session secrets or complete confidential request bodies.
Audit logs require access control, integrity safeguards and retention rules.
notifications
Stores in-app notification records where needed.
email_delivery_events
Optional delivery tracking for messages when the selected email provider supports it.
14.6 Events module
Suggested tables:
•	events
•	event_registrations
•	event_teams
•	event_team_members
•	event_submissions
•	event_judge_assignments
•	event_scoring_criteria
•	event_scores
Important design requirements:
•	Event-owned records carry tenant scope.
•	Registrations enforce the appropriate event/user uniqueness rule.
•	Team membership constraints prevent duplicate membership.
•	Scores reference the relevant judge assignment, submission and criterion.
•	Submission visibility and evaluation access must be constrained by event scope and permissions.
•	Public event access must reveal only approved fields.
•	External participant access must be distinct from general organisation membership.
14.7 Meetings module
Suggested tables:
•	meetings
•	meeting_attendees
•	meeting_agenda_items
•	meeting_notes
•	meeting_action_items
Important design requirements:
•	Meeting records are tenant-scoped.
•	Attendee associations have appropriate uniqueness constraints.
•	Private notes are protected separately where the product supports different note visibility.
•	Action items remain correctly scoped to their organisation and source meeting.
•	User assignments must reference eligible users or explicitly supported external participants.
14.8 Projects module
Suggested tables:
•	projects
•	project_members
•	tasks
•	task_comments
•	task_labels
•	task_label_assignments
Important design requirements:
•	Every project and task is tenant-scoped.
•	Tasks reference projects through tenant-aware constraints.
•	Project membership and task visibility are checked server-side.
•	Task labels cannot be attached across organisations.
•	Comments inherit appropriate access restrictions from their task.
•	Status transitions and assignment changes are validated.
14.9 Database implementation rules
•	Use foreign keys wherever relationships must remain valid.
•	Use NOT NULL, CHECK, UNIQUE and other constraints as appropriate.
•	Use transactions for multi-table operations.
•	Add indexes for tenant-scoped filters, joins, sorting and unique lookups.
•	Avoid indexing every column without a query-based reason.
•	Use SQL migrations stored in version control.
•	Test the complete schema from an empty database.
•	Do not modify production schemas manually without recording the change in a migration.
•	Define deletion, archival and retention behaviour before enabling destructive operations.
•	Use UTC consistently for stored timestamps and preserve the relevant time zone when local scheduling semantics matter.
15. Module Activation and Feature Entitlements
Activating a module must be a controlled organisation-level operation.
15.1 Activation process
1.	Verify the current user.
2.	Verify that the user has permission to manage organisation modules.
3.	Resolve the organisation and verify access.
4.	Verify platform availability of the module.
5.	Verify plan or entitlement restrictions if enabled.
6.	Activate the module transactionally.
7.	Record the activating user and timestamp.
8.	Write the appropriate audit event.
9.	Refresh the relevant UI state and navigation.
15.2 Deactivation
Before deactivation:
•	Confirm the acting user's permission.
•	Warn about the effect on workflows and access.
•	Preserve historical records unless an explicit retention policy says otherwise.
•	Prevent ordinary module APIs from accepting new operations against an inactive module.
•	Keep authorised archival and administrative workflows available where required.
Deactivating a module must not silently delete its data.
15.3 Availability versus permission
The frontend and backend must separately evaluate:
•	Is the module registered in the platform catalogue?
•	Is the module allowed for the organisation?
•	Is the module active?
•	Is the current user authorised to perform this action?
•	Is the requested resource within the user's permitted scope?
A hidden navigation link is not a substitute for these checks.
16. Organisation Lifecycle and Administration
16.1 Organisation creation
An organisation creation transaction must create:
•	The organisation.
•	The initial Owner membership.
•	Required baseline organisation settings.
•	Any default role assignments.
•	Any initial module configuration records required by the design.
It must not leave the database with an organisation that has no recoverable owner.
16.2 Invitations
Invitation lifecycle:
•	Pending
•	Accepted
•	Expired
•	Revoked
Acceptance must validate the invitation token, expiry, intended account/email and relevant organisation status.
Inviting a person must not allow the inviter to grant permissions beyond their delegation authority.
16.3 Membership changes
Suspension or removal must:
•	Revoke the applicable membership-based access.
•	Invalidate or re-evaluate relevant cached authorisation.
•	Prevent subsequent protected requests from continuing to rely on stale membership state.
•	Preserve required audit history.
•	Apply defined rules to assigned tasks, ownership and historical content.
16.4 Owner transfer
Require:
•	Explicit confirmation.
•	Verification of the target member's eligibility.
•	Reauthentication or another appropriate security step.
•	A transaction that prevents duplicate or missing ownership.
•	An immutable or otherwise protected audit event.
16.5 Organisation deletion
The MVP may initially support organisation deactivation rather than irreversible deletion.
Before implementing permanent deletion, define:
•	Ownership verification.
•	Confirmation and possible delay.
•	Dependent data behaviour.
•	Backup and retention implications.
•	Audit retention.
•	Legal and privacy requirements.
•	Recovery or export policy.
Never delete tenant data merely because the last ordinary member leaves the organisation.
17. Audit, Privacy and Data Retention
17.1 Audit events
At minimum, consider recording:
•	Authentication security events.
•	Failed privileged operations.
•	Organisation creation and settings changes.
•	Membership invitations, acceptance and removal.
•	Role and permission changes.
•	Module activation/deactivation.
•	Resource publication or cancellation.
•	Meeting attendee changes and protected-note changes.
•	Event judge assignments and result publication.
•	Platform administrative actions.
•	Support-access attempts and approvals.
•	Security configuration changes.
Audit records must be created reliably for the important operation. Critical multi-step actions should use a transaction or a deliberate durable-event strategy so successful changes are not silently left unaudited.
17.2 Privacy principles
•	Collect only information required by the feature.
•	Restrict sensitive data by default.
•	Avoid logging confidential content.
•	Avoid cross-organisation analytics that expose identifiable tenant content without a defined and authorised purpose.
•	Define retention periods.
•	Provide suitable account and data-management workflows.
•	Use secure transport and managed secret storage.
•	Document third-party processors and their data access where applicable.
Privacy requirements must be reviewed against the laws and contractual obligations applicable to the actual markets in which ManageX operates. This PRD does not itself certify legal compliance.
18. Notifications and Email
Use an email-provider abstraction so a provider can be configured without embedding provider-specific code in business logic.
Potential messages:
•	Email verification.
•	Password-reset request.
•	Organisation invitation.
•	Invitation reminder, if enabled.
•	Meeting invitation or update.
•	Event registration confirmation.
•	Relevant project/task notification, when implemented.
Requirements:
•	Templates must use consistent ManageX branding.
•	Links must use the configured application origin.
•	Sensitive tokens must be single-use and short-lived where appropriate.
•	Provider credentials must be environment secrets.
•	Do not expose recipient lists inappropriately.
•	Record only the metadata needed to operate the messaging feature.
•	Support a development email-testing mechanism without sending real messages unexpectedly.
Retries and background queues may be introduced if reliable asynchronous delivery becomes necessary. They should not be added merely for architectural appearance.
19. Validation and Error Handling
All inputs must be validated server-side.
Validation must include:
•	Type.
•	Length.
•	Required fields.
•	Date/time consistency.
•	Allowed enum values.
•	Related-record ownership.
•	State transitions.
•	Role and permission requirements.
•	Business rules.
•	Pagination limits.
•	URL format and approved URL rules where applicable.
Use parameterised SQL queries for user-controlled values.
A client-side validation success must never be treated as proof that an API request is valid.
Provide a central error-handling mechanism with:
•	Consistent error codes.
•	Safe public messages.
•	Structured internal logs.
•	A request ID for investigation.
•	Appropriate HTTP status codes.
Avoid both extremes: leaking internal implementation details and returning meaningless generic errors for every situation.
20. Security Requirements
20.1 Application security
•	Enforce authentication on protected routes.
•	Enforce permissions on every protected operation.
•	Perform object-level authorisation for resource IDs supplied by the client.
•	Whitelist accepted update fields to prevent mass assignment.
•	Use parameterised database queries.
•	Validate external URLs and avoid unsafe server-side fetching.
•	Configure CORS for the intended origins.
•	Add appropriate security headers.
•	Rate-limit sensitive endpoints.
•	Set request-body size limits.
•	Use safe output rendering and prevent stored/reflected XSS.
•	Protect cookie-authenticated state-changing requests against CSRF.
•	Avoid exposing internal debug routes in production.
•	Keep dependencies maintained and scan them through CI.
•	Never commit secrets to source control.
20.2 Sensitive operations
Sensitive operations require stronger controls where appropriate:
•	Platform administrator changes.
•	Ownership transfer.
•	Role and permission changes.
•	Security configuration.
•	Organisation closure.
•	Module entitlement changes.
•	Access to protected operational information.
Consider reauthentication, explicit confirmation and audit logging based on the risk of each operation.
20.3 Security baseline references
Use the following as implementation and review references:
•	OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
•	OWASP API Security Top 10: https://owasp.org/www-project-api-security/
•	PostgreSQL Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
•	OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
•	WCAG 2.2: https://www.w3.org/TR/WCAG22/
These references provide guidance; following this PRD does not automatically constitute a security certification.
21. Performance and Reliability
The MVP should be designed to perform well for ordinary small and medium-sized organisations, while avoiding architectural decisions that prevent future scaling.
Requirements:
•	Use pagination for resource lists.
•	Index real query patterns.
•	Avoid N+1 database queries.
•	Avoid loading entire tenant datasets for dashboard summaries.
•	Use bounded request and query execution behaviour.
•	Avoid unbounded payloads.
•	Use transactions for concurrent business operations.
•	Apply connection-pool limits appropriate to the database capacity.
•	Handle database connection errors without exposing sensitive details.
•	Provide health and readiness checks.
•	Log application failures with request IDs.
•	Define a backup and restoration strategy before production use.
Do not set an arbitrary universal performance guarantee before measuring the actual deployment. Record baseline and target response times during testing and revise them based on expected usage.
22. Search, Tables and Pagination
List pages must support practical search and filtering.
Requirements:
•	Server-side pagination.
•	Maximum permitted page size.
•	Stable ordering.
•	Safe sort-field allowlists.
•	Tenant-scoped queries.
•	Filters validated against the resource and user permissions.
•	Useful empty states.
•	Appropriate loading states.
•	Preservation of search and filter state during navigation where useful.
Do not interpolate arbitrary client-supplied sort expressions into SQL.
23. Testing Strategy
Testing is part of implementation, not a final optional activity.
23.1 Unit tests
Test:
•	Validation schemas.
•	Business-rule functions.
•	Status transitions.
•	Permission evaluation.
•	Entitlement decisions.
•	Invitation token validation.
•	Role assignment constraints.
•	Date and time handling.
23.2 Integration tests
Use a real test PostgreSQL database and the actual migrations where practical.
Test:
•	Authentication lifecycle.
•	Organisation creation.
•	Invitation acceptance.
•	Module activation.
•	Role and permission changes.
•	Database constraints.
•	RLS policies.
•	Resource CRUD operations.
•	Cross-tenant access attempts.
•	Transaction rollback.
•	Concurrent registration capacity checks.
•	Concurrent operations that could create duplicate assignments.
Do not rely exclusively on mocks for database-security requirements.
23.3 API tests
Test allowed, denied, unauthenticated and invalid requests for each important endpoint.
At minimum verify:
•	Missing authentication returns the expected error.
•	Invalid role assignments fail.
•	Inactive-module access is denied.
•	Foreign organisation IDs do not reveal protected records.
•	Resource ownership and assignment are checked.
•	Invalid state transitions fail.
•	Invalid request bodies fail.
•	Pagination and filters are bounded.
23.4 Frontend tests
Test:
•	Login and onboarding flows.
•	Organisation switching.
•	Navigation and responsive layout.
•	Form validation.
•	Loading and error states.
•	Empty states.
•	Permission-aware actions.
•	Module activation UI.
•	Confirmation dialogs.
23.5 End-to-end tests
Exercise complete journeys such as:
1.	Register and verify a user.
2.	Create an organisation.
3.	Activate the Events module.
4.	Create and publish an event.
5.	Register a participant.
6.	Submit an eligible entry.
7.	Assign a judge.
8.	Record and publish results under the appropriate permissions.
Repeat equivalent end-to-end flows for meetings and projects.
23.6 Isolation acceptance suite
Create at least two distinct organisations with separate test users and data.
Attempt to read, modify, delete or associate data across the two organisations using:
•	Modified URL IDs.
•	Modified request-body IDs.
•	Modified query parameters.
•	Direct API calls without UI navigation.
•	Unexpected role assignments.
•	Missing or stale tenant context.
•	Pooled database connections reused between organisations.
Every prohibited operation must fail, and no protected record or sensitive metadata may be returned.
24. Development and Environment Management
24.1 Configuration
Keep environment-specific values in environment variables or an appropriate secret manager.
Typical variables:
•	NODE_ENV
•	PORT
•	DATABASE_URL
•	APP_ORIGIN
•	API_ORIGIN, if separately configured
•	SESSION_SECRET, where relevant to the chosen session implementation
•	Email-provider configuration
•	Logging configuration
•	Rate-limit configuration
Define a separate example environment file containing placeholders only.
Never commit real passwords, private keys, database URLs containing credentials or production API secrets.
Validate required environment variables at application startup and fail clearly if required configuration is missing.
24.2 Local development
Provide documented commands for:
•	Installing dependencies.
•	Starting PostgreSQL.
•	Applying migrations.
•	Seeding development data.
•	Starting the API.
•	Starting the frontend.
•	Running tests.
•	Running linting.
•	Running type checks.
Development seed data must be clearly separated from production data.
A development Super Admin must not be created in production using a known default password.
24.3 Database migrations
Migrations must:
•	Be ordered.
•	Be version-controlled.
•	Apply to a fresh database.
•	Be repeatable in the intended migration-tool sense.
•	Include required constraints and indexes.
•	Account for RLS policies and database privileges.
•	Avoid unsafe destructive changes without a reviewed migration plan.
Production deployments must use the intended migration process. Do not automatically drop or recreate production tables on application startup.
25. Deployment and Operations
25.1 Deployment environments
Maintain separate environments for:
•	Local development.
•	Automated testing.
•	Staging.
•	Production.
Use separate credentials and databases for different environments.
25.2 Production requirements
Before release:
•	Configure HTTPS.
•	Secure database access and credentials.
•	Apply reviewed migrations.
•	Configure email delivery.
•	Configure allowed application origins.
•	Verify cookie and CSRF behaviour.
•	Verify RLS and runtime database privileges.
•	Enable structured logging.
•	Configure error monitoring.
•	Set database backups and test restoration.
•	Remove development credentials and debug routes.
•	Verify health checks.
•	Run the isolation acceptance suite.
25.3 Release approach
Do not release all modules merely because their screens render.
A module is release-ready only when its UI, APIs, data model, permissions, RLS rules, tests, error states and operational requirements are implemented and verified.
26. Implementation Phases for the AI Coding Assistant
The assistant must implement ManageX in phases. It must not attempt to generate the entire production system in one unreviewed pass.
Phase 0 — Repository and Requirements Audit
Tasks:
•	Inspect the existing repository and tooling.
•	Identify existing code, dependencies and conventions.
•	Map this PRD to planned implementation areas.
•	List unresolved technical decisions.
•	Produce an implementation plan.
•	Identify high-risk security assumptions.
•	Do not delete existing working code without justification.
Deliverables:
•	docs/implementation-plan.md
•	docs/architecture.md
•	Initial risk and decision log.
Acceptance criteria:
•	The plan covers frontend, backend, database, testing and deployment.
•	Tenant isolation, authentication and RBAC are explicit design decisions.
•	No security-critical ambiguity is hidden.
Phase 1 — Project Foundation and Design System
Tasks:
•	Configure the TypeScript-based frontend and backend.
•	Configure linting, formatting and type checking.
•	Define environment configuration.
•	Establish the application shell.
•	Implement ManageX branding and Clean Enterprise design tokens.
•	Build reusable UI components.
•	Implement responsive layouts.
•	Create public pages and authenticated placeholder layouts.
•	Define API client and error-handling conventions.
Temporary mock data is acceptable for validating UI structure in this phase, provided it is clearly identified and cannot be mistaken for completed backend integration.
Deliverables:
•	Working project scaffold.
•	Design tokens and component conventions.
•	Public landing page.
•	Login and registration UI.
•	Organisation workspace shell.
•	Initial route map.
Acceptance criteria:
•	Responsive design works.
•	Forms and navigation have real interaction states.
•	No major page contains fabricated production data presented as real.
•	Linting and type checking pass.
Phase 2 — PostgreSQL Foundation
Tasks:
•	Define the logical ER model and data dictionary.
•	Finalise table columns, relationships, nullability and constraints.
•	Create migrations.
•	Create separate database roles.
•	Implement tenant-context transaction helpers.
•	Implement initial RLS policies.
•	Implement tenant-aware foreign keys and indexes.
•	Create isolated test database setup.
•	Add schema validation and migration tests.
Deliverables:
•	Database schema documentation.
•	Versioned migrations.
•	RLS policy definitions.
•	Database transaction utilities.
•	Database security tests.
Acceptance criteria:
•	The complete database can be built from an empty instance.
•	Tenant context is transaction-local.
•	Runtime connections cannot bypass RLS.
•	Cross-tenant references fail.
•	RLS behaviour is demonstrated by automated tests.
Phase 3 — Authentication and Identity
Tasks:
•	Registration.
•	Email verification.
•	Login and logout.
•	Password hashing.
•	Session management.
•	Password reset.
•	Rate limiting.
•	Security middleware.
•	Authentication tests.
Acceptance criteria:
•	The complete authentication lifecycle works.
•	Invalid or expired tokens are rejected.
•	Sensitive credentials are not exposed in the browser or logs.
•	Protected APIs require authentication.
Phase 4 — Organisations, Invitations and Memberships
Tasks:
•	Organisation creation.
•	Owner membership.
•	Organisation list and switching.
•	Invitations and invitation acceptance.
•	Membership status changes.
•	Ownership protections.
•	Organisation settings.
•	Audit integration.
Acceptance criteria:
•	User A can belong to multiple organisations.
•	One organisation's members cannot access another organisation's private data.
•	Membership removal affects subsequent authorised requests.
•	Invitations expire and cannot be used repeatedly.
•	Ownership constraints remain valid under concurrent operations.
Phase 5 — RBAC, Module Catalogue and Entitlements
Tasks:
•	Platform role definitions.
•	Organisation role definitions.
•	Module role definitions.
•	Permission catalogue and seed data.
•	Role-permission assignments.
•	Membership-role assignments.
•	Resource-scoped access.
•	Module catalogue.
•	Organisation module activation/deactivation.
•	Permission-aware UI.
•	Audit events for changes.
Acceptance criteria:
•	Platform, organisation and module roles remain distinct.
•	A user's permissions are resolved from explicit assignments and policies.
•	Inactive modules cannot be used through direct API calls.
•	Users cannot escalate their own privileges.
•	Resource-level restrictions are enforced.
Phase 6 — Events & Hackathons Module
Implement one vertical slice at a time:
1.	Event database entities and migrations.
2.	Event API and validation.
3.	Event permission policies.
4.	Event list and detail screens.
5.	Event creation and publishing.
6.	Registration.
7.	Teams.
8.	Submissions.
9.	Judge assignments.
10.	Evaluation and results.
11.	Audit events.
12.	Unit, integration, RLS and end-to-end tests.
Acceptance criteria:
•	Event lifecycle works.
•	Registration restrictions work.
•	Participants access only eligible event resources.
•	Judges access only assigned resources.
•	Cross-tenant attempts fail.
•	Results follow the intended visibility rules.
Phase 7 — Meetings Module
Implement:
1.	Meeting database entities.
2.	Meeting APIs and validation.
3.	Permissions and resource restrictions.
4.	Meeting list and detail.
5.	Create, edit and cancellation flows.
6.	Attendees and agenda.
7.	Notes and action items.
8.	Email notifications where configured.
9.	Audit integration.
10.	Tests.
Acceptance criteria:
•	Meeting lifecycle works.
•	Attendee and note visibility rules are enforced.
•	Action items remain correctly associated with the organisation and meeting.
•	All prohibited cross-tenant operations fail.
Phase 8 — Projects & Tasks Module
Implement:
1.	Project database entities.
2.	Project APIs and validation.
3.	Project membership rules.
4.	Task database entities.
5.	Task CRUD and assignment.
6.	List and Kanban views.
7.	Search, filtering and pagination.
8.	Comments/activity if included in the MVP implementation.
9.	Audit integration.
10.	Tests.
Acceptance criteria:
•	Project and task workflows work end to end.
•	Invalid task transitions are rejected.
•	Assignment and membership rules are enforced.
•	Tasks cannot reference projects from other organisations.
•	Every important operation has authorisation and automated tests.
Phase 9 — Platform Administration and Operational Controls
Tasks:
•	Platform overview.
•	Organisation administration.
•	Module catalogue administration.
•	Appropriate platform-level audit views.
•	Support workflows within approved permissions.
•	Operational health checks.
•	Error monitoring.
•	Backup and restore documentation.
Acceptance criteria:
•	Platform administration is separate from tenant administration.
•	Support users do not gain unrestricted tenant access.
•	Administrative actions are audited.
•	Production operational checks are documented and verified.
Phase 10 — Security, UX and Performance Hardening
Tasks:
•	Run full cross-tenant isolation tests.
•	Review API-level authorisation.
•	Test CSRF, session management and rate limits.
•	Test RLS under pooled connections.
•	Review permission delegation.
•	Test responsive layouts.
•	Test empty, loading, error and forbidden states.
•	Run dependency checks.
•	Measure important query and API paths.
•	Remove obsolete mock data and debug code.
Acceptance criteria:
•	Security-critical tests pass.
•	No known unresolved critical access-control defect remains.
•	All core workflows can be completed through the real interface.
•	Application behaviour and operational configuration are documented.
Phase 11 — Staging and Production Release
Tasks:
•	Configure staging and production environments.
•	Run migrations through the deployment process.
•	Validate secrets and runtime privileges.
•	Test email and origin/cookie configuration.
•	Run smoke tests.
•	Validate backups and restoration.
•	Execute the release checklist.
•	Document rollback steps.
Acceptance criteria:
•	A new environment can be set up from documented instructions.
•	Production does not depend on development credentials or seed secrets.
•	The core product has passed end-to-end and isolation verification.
27. How the AI Coding Assistant Must Work
These execution rules are mandatory.
1.	Read the entire PRD before making substantial changes.
2.	Inspect the existing repository before choosing commands or replacing files.
3.	Produce a short phase plan and identify dependencies.
4.	Implement only the current phase.
5.	Prefer small, understandable changes over large unreviewed rewrites.
6.	Do not invent undocumented business rules where a safer established rule already exists.
7.	Do not implement authorisation solely in the frontend.
8.	Do not skip database constraints or RLS because the API already checks permissions.
9.	Do not generate a giant schema or many CRUD endpoints before defining the relationships and security boundaries.
10.	Do not create placeholder endpoints that always return success.
11.	Do not show success notifications before the server confirms success.
12.	Do not seed production with default privileged credentials.
13.	Do not store secrets in source control.
14.	Add or update tests whenever behaviour changes.
15.	Run migrations, type checking, linting and relevant tests for the current phase.
16.	Fix failures before claiming completion.
17.	Update architecture and setup documentation when the implementation changes.
18.	Keep a record of completed work, remaining work and known limitations.
19.	Stop at phase boundaries for review rather than silently rewriting the roadmap.
20.	Never claim that security testing or a deployment succeeded unless the relevant checks actually ran and passed.
Every phase report must contain:
•	Implemented functionality.
•	Important files or areas changed.
•	Database changes.
•	API changes.
•	Security and permission decisions.
•	Tests executed and their actual results.
•	Any failing checks.
•	Remaining limitations.
•	The next recommended phase.
28. Functional Acceptance Checklist
ManageX MVP is functionally complete when the following are true:
Identity and organisation
•	 
Registration and login work.
•	 
Email verification and password recovery work.
•	 
An authenticated user can create an organisation.
•	 
A user can join multiple organisations through valid membership.
•	 
Organisation switching updates the active context correctly.
•	 
Invitations follow the configured lifecycle.
•	 
Membership removal revokes membership-based access.
Architecture and security
•	 
Platform, organisation and module roles are distinct.
•	 
Permissions are managed through explicit records and policies.
•	 
Inactive modules reject protected API operations.
•	 
Tenant-owned tables are protected with appropriate RLS policies.
•	 
Runtime credentials do not bypass RLS.
•	 
Cross-tenant access tests pass.
•	 
Cross-tenant references are prevented by constraints.
•	 
Resource-level authorization is verified on the server.
•	 
Sensitive administrative operations are audited.
Initial modules
•	 
Events can be created, published and managed.
•	 
Event registration restrictions work.
•	 
Eligible teams and submissions work.
•	 
Judges can access only assigned work.
•	 
Meetings can be scheduled and managed.
•	 
Meeting attendee and note access is enforced.
•	 
Meeting action items work.
•	 
Projects and tasks can be created and managed.
•	 
Assignments and task state transitions are validated.
•	 
Search, filters, pagination and empty states work.
UI/UX
•	 
The application consistently follows the Clean Enterprise design system.
•	 
The light theme uses the defined neutral surfaces and restrained indigo accents.
•	 
Sidebar and organisation switcher work.
•	 
Each module uses shared UI components.
•	 
Loading, error, empty and forbidden states exist.
•	 
Primary actions have real backend behaviour.
•	 
Responsive layouts work.
•	 
Accessibility checks are incorporated.
Operations
•	 
Database setup is documented.
•	 
Migrations run from an empty database.
•	 
Required environment variables are documented.
•	 
Tests are repeatable.
•	 
Staging and production configuration are documented.
•	 
Backups and restoration procedures are defined.
•	 
No known critical tenant-isolation vulnerability remains.
29. Future Roadmap
After the initial three modules are stable, possible additions include:
Employee Management
•	Employee profiles.
•	Departments and teams.
•	Reporting hierarchy.
•	Leave and attendance workflows, subject to an approved privacy and access model.
Recruitment Management
•	Job openings.
•	Candidates.
•	Applications.
•	Interview scheduling.
•	Interviewer assignments.
•	Hiring decisions.
Other possible modules
•	Document Management.
•	Asset Management.
•	Workflow Automation.
•	Customer Relationship Management.
•	Finance or billing-related workflows.
Every future module must reuse the same organisation, membership, entitlement, RBAC, RLS, audit and design-system foundations.
Future modules must not be built by copying all of another module's authentication and tenant infrastructure.
30. Final Product Definition
ManageX is a shared, multi-tenant, modular SaaS platform with three explicit access-control layers:
Platform → Organisation → Module
It begins with Events & Hackathons, Meetings, and Projects & Tasks.
It uses a Clean Enterprise light interface, a React and TypeScript frontend, a Node.js and Express backend, PostgreSQL, explicit RBAC, shared-schema multi-tenancy and PostgreSQL RLS.
Security, organisation isolation, maintainable modularity, consistent user experience, auditability and testability are core requirements—not optional improvements to add after implementation.
The application must be built in verified phases from repository setup through database security, authentication, organisation administration, module workflows, testing and production deployment.
The objective is not merely to create a dashboard that looks complete. The objective is to deliver a functional, secure, coherent and extensible product whose behaviour matches the requirements in this document.
________________________________________
End of PRD
Implementation instruction: Treat this document as the baseline specification. Before the first substantial code change, produce the implementation plan, confirm the logical ER model and RLS strategy, and map each requirement to a planned phase and test. Build incrementally and demonstrate completion with actual test results.

