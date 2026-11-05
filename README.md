# ManageX

ManageX is a multi-tenant modular workspace for organisations. The current product areas are:

- **Events & Hackathons**: multi-round events, teams, submissions, judging, rubrics, and results.
- **Meetings**: scheduling, attendees, agendas, minutes, action items, and Google Meet integration.
- **Projects & Tasks**: boards, lists, statuses, priorities, assignments, comments, and activity history.

The application is a modular monolith with a React frontend, an Express API, and PostgreSQL tenant isolation enforced with Row-Level Security (RLS).

## Stack

| Area | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS, Lucide |
| Backend | Node.js 20+, Express, native JavaScript ES modules, Zod, `pg` |
| Database | PostgreSQL 16+, versioned SQL migrations, `FORCE ROW LEVEL SECURITY` |
| Local development | Docker Compose, separate npm packages |
| Deployment targets | Vercel (frontend), Render (backend), Neon (database) |

## Repository Layout

```text
manageX/
|-- backend/                 Express API and backend tests
|-- frontend/                React application and frontend tests
|-- database/
|   |-- migrations/          Versioned PostgreSQL schema and RLS changes
|   |-- migrate.js           Transactional migration runner
|   `-- seed-demo-users.js   Local demo data seeder
|-- tests/
|   |-- integration/         Cross-domain API test documentation and suites
|   |-- rls/                 Database isolation test documentation and suites
|   `-- e2e/                 Browser acceptance test documentation and suites
|-- docker-compose.yml       Local PostgreSQL, backend, and frontend services
|-- .env.example             Local environment variable template
`-- AGENTS.md                Repository rules and security invariants
```

## Quick Start

### Prerequisites

- Node.js `>=20`
- npm `>=10`
- Docker Desktop with Compose, or a reachable PostgreSQL 16+ instance

### Docker database with native development servers

This is the most useful setup for day-to-day development. Compose starts PostgreSQL; the backend and frontend run with hot reload from the host.

```bash
git clone https://github.com/Santosh-kumar-sah/ManageX.git
cd ManageX

copy .env.example .env       # PowerShell
# cp .env.example .env       # macOS/Linux

npm install
npm --prefix backend install
npm --prefix frontend install

docker compose up -d postgres
npm run migrate
npm run seed
```

Start the application in two terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

The local services are available at:

- Frontend: <http://localhost:5173>
- API health check: <http://localhost:4000/api/v1/health>
- PostgreSQL: `localhost:5432`

### Full Docker Compose stack

To run all three services in containers:

```bash
docker compose up --build
```

The Compose backend uses its own container-to-container database URL. Run migrations and seed data from the host only when the database is reachable through the host configuration in `.env`.

## Environment Configuration

Start with `.env.example`. The backend validates configuration at startup. The minimum local settings are:

```env
NODE_ENV=development
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://managex_app:placeholder_password@localhost:5432/managex
SESSION_SECRET=replace_with_a_long_local_secret
CSRF_SECRET=replace_with_a_long_local_secret
```

Optional integrations are configured in the same file:

- SMTP for email delivery
- Google OAuth for Calendar and Meet
- AES-256-GCM token encryption
- OpenRouter-backed AI features

Never commit `.env` or real credentials. Use long, random secrets outside local development and keep production credentials in the deployment platform's secret store.

## Useful Commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev:backend` | Start the API with Node watch mode |
| `npm run dev:frontend` | Start the Vite development server |
| `npm run migrate` | Apply pending database migrations |
| `npm run seed` | Create local demo users and workspace data |
| `npm run lint` | Lint backend and frontend |
| `npm run typecheck:frontend` | Run the frontend TypeScript check |
| `npm run build:frontend` | Create a production frontend build |
| `npm run test:backend` | Run backend tests with `node:test` |
| `npm run test:frontend` | Run frontend tests with Vitest |
| `npm test` | Run backend and frontend tests |

For focused work, the package-level commands are also available:

```bash
npm --prefix backend run lint
npm --prefix backend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
```

## Security Model

ManageX treats tenant isolation as a database responsibility as well as an API responsibility:

- Requests resolve the authenticated user and organisation on the server.
- Tenant-owned data is protected by PostgreSQL RLS and transaction-local organisation context.
- The runtime database role is least-privileged and must not bypass RLS.
- Platform, organisation, module, and resource permissions are checked independently.
- Backend input is validated with Zod; frontend guards are not treated as authorization.
- Authentication, administrative actions, and security-sensitive changes are audited.

When changing schema, permissions, or tenant-scoped queries, add or update the relevant migration and test the denied path as well as the successful path. See [AGENTS.md](AGENTS.md) for the repository's full engineering and security rules.

## Contributing

1. Create a focused branch for your change.
2. Keep backend code in JavaScript and frontend code in TypeScript.
3. Update migrations and tests with behavior changes.
4. Run the relevant checks before opening a pull request:

   ```bash
   npm run lint
   npm run typecheck:frontend
   npm test
   npm run build:frontend
   ```

5. Describe security, migration, and configuration impacts in the pull request.

## Project Status

ManageX is under active development. Local development, migration, seeding, and automated checks are supported; production deployment still depends on configuring the external services and secrets required by the selected integrations.