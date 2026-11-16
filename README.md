# ManageX

ManageX is a production-ready, multi-tenant modular operations platform designed for universities, tech communities, and growing teams. It delivers enterprise-grade workspace isolation, competitive hackathon orchestration, timezone-aware meeting management with native Google Meet sync, and agile project delivery.

[![Netlify Status](https://api.netlify.com/api/v1/badges/1a2b3c4d/deploy-status)](https://elaborate-tanuki-c70edd.netlify.app)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B%20with%20RLS-blue.svg)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Core Modules

### 1. 🏆 Events & Hackathons
- **Multi-Round Lifecycle**: Configure multi-stage competitions (e.g. *Round 1: Screening* → *Round 2: Semi-Finals* → *Grand Finals*).
- **Automated Cutoff Progression**: Supports `top_n`, `score_threshold`, and manual qualification rules with tie-breaking logic.
- **Automated Google Meet Scheduling**: 1-click generation of dedicated Google Meet breakout rooms for each evaluation panel using Google Calendar API.
- **Participant Team Formation**: Student team creation, roster management, and 7-day cryptographically hashed invitation tokens.
- **Blind Rubric Scoring**: Multi-criterion scoring (1–100) with confidential judge notes; prevents evaluator bias by hiding scores until official publication.

### 2. 📅 Meetings & Minutes
- **Structured Agendas & Minutes**: Order agenda items, record confidential meeting notes, and distribute action items.
- **Timezone-Aware RSVP**: Manage attendee responses with automated timezone conversions.
- **Native Google Meet Integration**: Direct OAuth 2.0 integration with automatic calendar provisioning and room URL dispatch over HTTPS.

### 3. 📋 Projects & Tasks
- **Interactive Kanban & List Views**: Drag-and-drop task workflow boards with real-time column transitions.
- **Delivery Tracking**: Priority tags (`Urgent`, `High`, `Medium`, `Low`), deadlines, assignees, and audit history.
- **Task Comments & Activity Logs**: Immutable activity trails for cross-functional collaboration.

---

## 🛡️ Enterprise Security Invariants

ManageX is architected under strict zero-trust security standards:

- **Database-Level Tenant Isolation**: Every tenant-owned table is locked with PostgreSQL `FORCE ROW LEVEL SECURITY`.
- **Transaction-Local Context**: Database connections run in transaction-local tenant context (`managex.current_org_id`, `managex.current_user_id`) to prevent cross-tenant data leakage across connection pools.
- **Independent Authorization Layers**: Platform, Organisation, Module, and Resource permissions are verified independently server-side.
- **Zero Client Trust**: Frontend route guards or types are never treated as security boundaries.
- **Safe Outbound Transports**: Secure transactional email via Brevo REST API (HTTPS port 443) and AES-256-GCM token encryption for OAuth credentials.

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Lucide Icons |
| **Backend** | Node.js 20+, Express.js (ES Modules), Zod runtime validation, `pg` (node-postgres) |
| **Database** | PostgreSQL 16+ on Neon Serverless, Versioned SQL Migrations, Row-Level Security (RLS) |
| **Integrations** | Google Calendar & Meet API (OAuth 2.0), Brevo HTTPS Email API, OpenRouter AI Gateway |
| **Live Deployments** | Frontend on Netlify (`https://elaborate-tanuki-c70edd.netlify.app`), Backend on Render, Database on Neon |

---

## 📁 Repository Layout

```text
manageX/
|-- backend/                 Express API and domain services (ES Modules)
|   |-- src/
|   |   |-- platform/        Events, meetings, projects, auth, email, and integrations
|   |   |-- routes/          HTTP controllers with Zod schema validation
|   |   `-- config/          Environment schema and database pool configuration
|-- frontend/                React 18 + Vite TypeScript application
|   |-- src/
|   |   |-- pages/           Workspace, evaluation, and public portal views
|   |   |-- components/      Accessible shared UI primitives (Tailwind CSS)
|   |   `-- api/             Authenticated API client and context providers
|-- database/
|   |-- migrations/          Version-controlled idempotent SQL migrations
|   |-- migrate.js           Transactional database migration runner
|   `-- seed-demo-users.js   Local demo seed data
|-- docker-compose.yml       Local PostgreSQL and environment service runner
|-- netlify.toml             Production reverse-proxy and deployment configuration
`-- AGENTS.md                Permanent architecture guidelines and security rules
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js**: `>=20.0.0`
- **npm**: `>=10.0.0`
- **Docker Desktop** (or a local PostgreSQL 16+ instance)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Santosh-kumar-sah/ManageX.git
cd ManageX

# Install root, backend, and frontend packages
npm install
npm --prefix backend install
npm --prefix frontend install
```

### 2. Configure Environment

Copy the example configuration:

```bash
# On Windows (PowerShell):
copy .env.example .env

# On macOS/Linux:
cp .env.example .env
```

### 3. Run Database Migrations & Seed Data

Start the local PostgreSQL container, execute migrations, and seed initial demo accounts:

```bash
docker compose up -d postgres
npm run migrate
npm run seed
```

### 4. Start Development Servers

Run backend and frontend simultaneously with hot reload:

```bash
# Terminal 1: Backend API (port 4000)
npm run dev:backend

# Terminal 2: Frontend Client (port 5173)
npm run dev:frontend
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🛠️ Verification & Testing Commands

Run from the repository root:

| Command | Description |
| :--- | :--- |
| `npm run dev:backend` | Start backend with Node watch mode (`http://localhost:4000`) |
| `npm run dev:frontend` | Start Vite dev server (`http://localhost:5173`) |
| `npm run migrate` | Apply all versioned SQL migrations |
| `npm run seed` | Seed local demo users and workspaces |
| `npm run typecheck:frontend`| Run TypeScript type checking on the frontend |
| `npm run build:frontend` | Build the production frontend distribution |
| `npm run test:backend` | Run backend domain integration tests with `node:test` |
| `npm run lint` | Run ESLint across backend and frontend workspaces |
| `npm test` | Run complete test suite |

---

## 🌐 Production Architecture

```text
[ Browser Client ]
        │
        ▼ (HTTPS)
[ Netlify Reverse Proxy ] ── /api/v1/* ──► [ Render Backend API (Node.js/Express) ]
        │                                                     │
        │ (Static SPA)                                        ▼ (Pooled TLS connection)
[ React 18 / Vite Build ]                          [ Neon PostgreSQL with RLS ]
                                                              │
                                            ┌─────────────────┴─────────────────┐
                                            ▼                                   ▼
                                [ Google Calendar & Meet ]              [ Brevo Email HTTPS ]
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
