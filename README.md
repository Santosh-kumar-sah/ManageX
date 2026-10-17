# ManageX

ManageX is a modular, multi-tenant organisation management B2B SaaS web platform. It enables organisations to independently activate and manage modular domains (Events & Hackathons, Meetings, and Projects & Tasks) while enforcing strict database-level isolation through PostgreSQL Row-Level Security (RLS).

---

## 1. Architecture & Technology Stack

- **Frontend:** React 18+, TypeScript, Vite, Tailwind CSS, React Router v6+, TanStack Query.
- **Backend:** Node.js 20+, Express.js, native JavaScript ES Modules (`.js` files only, no backend TypeScript).
- **Database:** PostgreSQL (Neon compatible) with versioned pure SQL migrations and Row-Level Security (`FORCE RLS`).
- **Validation:** Zod for runtime schema validation on all API inputs.
- **Deployment Target:** Vercel (Frontend), Render (Backend), Neon (Database). Free-tier conscious; same-origin reverse proxy routing via Vercel `/api/*` rewrites.

---

## 2. Repository Structure

```text
manageX/
├── AGENTS.md                  # Permanent AI agent operating guidelines & invariants
├── README.md                  # Project overview & local run instructions
├── .gitignore                 # Standard repository ignore rules
├── .env.example               # Template with environment variable names only
├── package.json               # Coordinated root scripts
├── docs/                      # Architectural specifications, PRD, and runbooks
│   ├── PRD.md                 # Authoritative Product Requirements Document
│   ├── implementation-plan.md # Dependency-ordered phase breakdown (Phases 0–11)
│   ├── architecture.md        # Modular monolith topology & request lifecycle
│   ├── database.md            # Logical ER model, RLS policies & constraints
│   ├── security.md            # Threat model & 6-tier authorization pipeline
│   ├── api-contracts.md       # Standard JSON envelopes & endpoint inventory
│   ├── requirements-traceability.md # 99/99 requirement mapping matrix
│   ├── testing.md             # Testing methodology & security test suites
│   ├── deployment.md          # Hosting topology, variables & cold-start handling
│   ├── runbook.md             # Operational triage & disaster recovery
│   ├── progress.md            # Real-time phase tracking dashboard
│   ├── future-suggestions.md  # Backlog of out-of-scope enhancements
│   └── decisions/             # Architecture Decision Records (ADR-001 to ADR-018)
├── frontend/                  # React + TypeScript + Vite workspace
│   ├── src/
│   │   ├── api/               # Central API client & safe cold-start interceptor
│   │   ├── components/ui/     # Clean Enterprise accessible design system primitives
│   │   ├── layouts/           # Public, Workspace, and Platform shell layouts
│   │   └── pages/             # Route views (Home, Modules, Security, Auth, Workspace, Platform)
├── backend/                   # Node.js + Express.js ES Modules workspace
│   ├── src/
│   │   ├── config/            # Environment variable validation (Zod)
│   │   ├── platform/          # Shared platform middlewares (correlation, logging, errors, CORS)
│   │   └── routes/            # Health & readiness probe routes (/api/v1/health, /api/v1/ready)
├── database/                  # Versioned SQL migrations & safe non-production seeds
└── tests/                     # Cross-cutting integration, RLS, and E2E suites
```

---

## 3. Local Development Setup

### Prerequisites
- **Node.js:** `>= 20.0.0`
- **npm:** `>= 10.0.0`

### Quick Start
1. Clone the repository and copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies for all workspaces:
   ```bash
   npm --prefix backend install
   npm --prefix frontend install
   ```
3. Start the backend API server (runs on `http://localhost:4000`):
   ```bash
   npm run dev:backend
   ```
4. Start the frontend Vite development server (runs on `http://localhost:5173`):
   ```bash
   npm run dev:frontend
   ```
   *Note:* The Vite dev server proxies all relative `/api/*` requests directly to `http://localhost:4000`, matching production Vercel edge rewrite behavior.

---

## 4. Verification Commands

Run workspace-wide linting, typechecking, and tests:

| Action | Command | Purpose |
|---|---|---|
| **Lint All** | `npm run lint` | Runs ESLint across backend (`.js`) and frontend (`.ts`, `.tsx`) |
| **Typecheck** | `npm run typecheck:frontend` | Runs strict `tsc --noEmit` on the frontend codebase |
| **Build Frontend** | `npm run build:frontend` | Creates optimized production build in `frontend/dist/` |
| **Test All** | `npm test` | Runs Node.js test runner for backend and Vitest for frontend |

---

## 5. Current Implementation Status & Boundaries (Phase 1 Baseline)

- **Completed in Phase 1:**
  - Canonical workspace layout and strict toolchains established.
  - Backend Express bootstrap with request correlation (`X-Request-Id`), structured logger with automatic secret redaction, CORS policy, central 404, central error handling, and probe routes (`/api/v1/health`, `/api/v1/ready`).
  - Frontend Clean Enterprise light-theme design system tokens and 20 accessible UI primitives.
  - Central API client with Render free-tier cold-start handling (bounded polling up to 60s, automatic retry of idempotent `GET` reads only, strict prohibition against auto-replaying mutations).
  - Public layout, Workspace shell, Platform operator console, and responsive route navigation.
- **Scheduled for Later Phases (Currently Shells / Placeholders):**
  - Database schema migrations and RLS enforcement: **Phase 2**
  - Real user authentication, session cookies, and password hashing: **Phase 3**
  - Organisation creation, memberships, invitations, and owner protection: **Phase 4**
  - Scoped RBAC, permission catalogue, and audit logging: **Phase 5**
  - Events & Hackathons module: **Phase 6**
  - Meetings module: **Phase 7**
  - Projects & Tasks module: **Phase 8**
  - Platform administration console backend: **Phase 9**