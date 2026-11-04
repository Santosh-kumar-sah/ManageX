<div align="center">

# ManageX

**Enterprise-Grade Multi-Tenant Modular B2B SaaS Platform**

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

*ManageX empowers organisations to activate and operate modular workspaces—Events & Hackathons, Meetings, and Projects & Tasks—under strict database-level isolation guaranteed by PostgreSQL Row-Level Security (RLS).*

[Architecture](#-architecture--system-topology) •
[Features](#-feature-matrix) •
[Quick Start](#-quick-start) •
[Local Development](#-local-development-setup) •
[Testing & Quality](#-testing--code-quality) •
[Documentation](#-documentation-index)

---

</div>

## 📌 Table of Contents

- [Overview](#-overview)
- [Architecture & System Topology](#-architecture--system-topology)
- [Feature Matrix](#-feature-matrix)
- [Technology Stack](#-technology-stack)
- [Repository Structure](#-repository-structure)
- [Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Option A: Docker Compose (Recommended)](#option-a-docker-compose-recommended)
  - [Option B: Manual Local Setup](#option-b-manual-local-setup)
- [Environment Configuration](#-environment-configuration)
- [Testing & Code Quality](#-testing--code-quality)
- [Security Invariants & RLS](#-security-invariants--rls)
- [Deployment Architecture](#-deployment-architecture)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 Overview

**ManageX** is a modular, multi-tenant B2B SaaS web application designed for institutions, enterprises, and tech communities. Organizations can independently enable and manage domain-specific modules while maintaining uncompromising security, multi-tenant isolation, and data governance.

### Core Architectural Pillars
- **Zero Tenant Data Leakage:** Every database query is guarded by transactional PostgreSQL **Row-Level Security (`FORCE RLS`)** executed under a least-privileged runtime role (`managex_app`) with `NOBYPASSRLS`.
- **Modular Monolith Topology:** A unified backend domain model avoiding microservice overhead while strictly isolating module boundaries (Events, Meetings, Projects).
- **Clean Enterprise Design System:** High-performance, fully accessible, responsive light-mode UI primitives built with Tailwind CSS, Lucide icons, and TanStack Query.
- **Fail-Safe External Integrations:** Decoupled external API gateways (Google Meet OAuth2, OpenRouter AI foundation) utilizing atomic leases, token encryption (AES-256-GCM), and compensating transactions.

---

## 🏛 Architecture & System Topology

ManageX is architected as a modular monolith with decoupled frontend and backend workspaces. All HTTP traffic flows through a unified reverse proxy model matching production serverless edge behavior.

```
                    ┌──────────────────────────────────────────────┐
                    │               Client Browser                 │
                    │   React 18 + TypeScript + TanStack Query     │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           │  HTTPS / Cookie Auth
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │          Vite Proxy / Edge Rewrites          │
                    │         (Route: /api/v1/* -> Backend)        │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           │  Reverse Proxied Requests
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Backend Service (Node 20+)                           │
│                          Express.js (Native ES Modules)                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Pipeline: Request Correlation (X-Request-Id) → Audit Logger → CORS & Security   │
│            → Cookie Sessions & CSRF → Tenant Context Resolution (RLS Setup)      │
├───────────────────┬───────────────────┬────────────────────┬─────────────────────┤
│   Auth & Orgs     │  Events & Hack.   │     Meetings       │  Projects & Tasks   │
│  - User Auth      - Multi-Round       - Scheduling         - Kanban / List       │
│  - RBAC Engine    - Rubrics & Judges  - Google Meet Sync   - Workflows & Status  │
│  - Invitations    - Submissions       - Structured MoM     - Action Item Links   │
└───────────────────┴─────────┬─────────┴──────────┬─────────┴─────────────────────┘
                              │                    │
                   Encrypted  │                    │ Two-Stage Decoupled
                   Tokens     ▼                    ▼ Sync Engine
                 ┌──────────────────┐    ┌──────────────────────┐
                 │ OpenRouter AI    │    │ Google Calendar API  │
                 │ Gateway (Models) │    │ & Google Meet OAuth  │
                 └──────────────────┘    └──────────────────────┘
                              │                    │
                              └─────────┬──────────┘
                                        │
                                        ▼ Transaction-Local Tenant Context
                                          set_config('app.current_organisation_id')
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            PostgreSQL 16 Database                                │
│                  Managed via 42+ Versioned Pure SQL Migrations                   │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Enforced Row-Level Security (FORCE RLS) • Restricted Runtime Role (managex_app) │
│  Tenant Isolation Policies • Composite Foreign Keys • Immutable Tamper-Proof Audit│
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Feature Matrix

| Domain | Key Capabilities |
|---|---|
| **Multi-Tenant Foundation** | Custom organisation branding, slug routing, invitation lifecycles with secure token expiry, role assignment, and ownership transfer protection. |
| **Authentication & RBAC** | Argon2/bcrypt password hashing, HTTP-only secure session cookies, CSRF protection, rate limiting, and 6-tier permission resolution (Platform vs Org scopes). |
| **Events & Hackathons** | Multi-round hackathon staging, track management, team formation and join codes, round-scoped submissions, rubric-based weighted scoring, blinded judging, and automatic leaderboard generation. |
| **Meetings & Conferencing** | Meeting scheduling with timezone normalization, RSVP tracking, structured Minutes of Meeting (MoM), live agenda tracking, and action items convertable to tasks. |
| **Google Meet Integration** | Google Calendar v3 OAuth2 synchronization, AES-256-GCM token encryption, Two-Stage Decoupled sync with atomic claim leases, in-flight cancellation compensation, and authenticated Join Gateway (`GET .../join`). |
| **Projects & Tasks** | Kanban boards, list views, custom task statuses, priorities, assignee workloads, due date tracking, comment threads, activity history, and seamless linkage to meeting action items. |
| **Platform Administration** | Super-admin control panel, tenant directory inspection, organisation suspension, system-wide audit logs, and global module entitlement flags. |
| **Shared AI Foundation** | Pluggable OpenRouter AI gateway supporting multiple models (Gemini 2.0 Flash, GPT-4o-mini), per-tenant token quotas, and resilient timeout fallbacks. |

---

## 🛠 Technology Stack

### Frontend Application
- **Framework:** [React 18](https://react.dev/) with [TypeScript 5.5](https://www.typescriptlang.org/)
- **Bundler & Tooling:** [Vite 5.4](https://vitejs.dev/) with fast Hot Module Replacement (HMR)
- **Routing:** [React Router v6](https://reactrouter.com/)
- **State Management & Caching:** [TanStack Query v5](https://tanstack.com/query/latest)
- **Styling:** [Tailwind CSS 3.4](https://tailwindcss.com/) & [Lucide React](https://lucide.dev/) icons
- **Testing:** [Vitest](https://vitest.dev/) with React Testing Library

### Backend Application
- **Runtime:** [Node.js 20+](https://nodejs.org/) (Strictly native JavaScript ES Modules `.js`)
- **Web Framework:** [Express.js 4](https://expressjs.com/)
- **Input Validation:** [Zod](https://zod.dev/) for strict runtime request schema validation
- **Database Driver:** [`pg` (node-postgres)](https://node-postgres.com/) with native connection pooling
- **Security:** `cookie-parser`, `bcryptjs`, and native Node crypto (AES-256-GCM)
- **Testing:** Built-in Node.js Test Runner (`node:test`) & `supertest`

### Database & Infrastructure
- **Database:** PostgreSQL 16+ (100% Neon serverless compatible)
- **Isolation:** Version-controlled pure SQL migrations with PostgreSQL `FORCE ROW LEVEL SECURITY`
- **Orchestration:** Docker & Docker Compose
- **Target Deployments:** Frontend on **Vercel**, Backend on **Render**, Database on **Neon**

---

---

## 🚦 Quick Start

### Prerequisites
- **Node.js:** `>= 20.0.0`
- **npm:** `>= 10.0.0`
- **Docker & Docker Compose:** *(Recommended for zero-dependency local PostgreSQL setup)*

---

### Option A: Docker Compose (Recommended)

Spin up the local stack (PostgreSQL, Express backend, and Vite frontend) with Docker:

```bash
# 1. Clone and enter the repository
git clone https://github.com/Santosh-kumar-sah/ManageX.git
cd ManageX

# 2. Copy the environment template
cp .env.example .env

# 3. Start the database first
docker compose up -d postgres

# 4. Install dependencies and apply migrations from the host
npm install
npm --prefix backend install
npm --prefix frontend install
npm run migrate
npm run seed

# 5. Start the application containers
docker compose up -d
```

Once running:
- **Frontend Application:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)
- **PostgreSQL:** `localhost:5432` (`managex_app` / `managex_dev_password`)

After PostgreSQL is healthy and migrations have completed, seed the local demo accounts:
```bash
npm run seed
```

The host-side commands use the connection strings in `.env`. The Compose database is
published on `localhost:5432`; update `.env` if it still points at another local port.

---

### Option B: Manual Local Setup

If you prefer running the Node services natively on your machine:

#### 1. Setup Environment
```bash
cp .env.example .env
```
Ensure your `DATABASE_URL` in `.env` points to a reachable PostgreSQL 16+ instance:
```env
DATABASE_URL=postgresql://managex_app:managex_dev_password@localhost:5432/managex
```

#### 2. Install Workspace Dependencies
```bash
# Root & database tools
npm install

# Backend dependencies
npm --prefix backend install

# Frontend dependencies
npm --prefix frontend install
```

#### 3. Run Database Migrations & Seed Data
```bash
# Executes versioned SQL migrations with SHA-256 verification
npm run migrate

# Creates the demo organisation, modules, memberships, and test users
npm run seed
```

#### 4. Launch Development Servers
Open two terminal windows:

```bash
# Terminal 1: Backend API Server (runs on http://localhost:4000)
npm run dev:backend

# Terminal 2: Frontend Vite Server (runs on http://localhost:5173)
npm run dev:frontend
```

> [!NOTE]
> The Vite development server automatically proxies all relative `/api/*` network requests to `http://localhost:4000`, matching production reverse-proxy routing without CORS overhead.

---



---

## ⚙ Environment Configuration

Key configuration parameters declared in `.env` (validated at runtime via Zod):

```env
# ------------------------------------------------------------------------------
# Runtime & Server
# ------------------------------------------------------------------------------
NODE_ENV=development
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173

# ------------------------------------------------------------------------------
# PostgreSQL Database (Neon compatible)
# ------------------------------------------------------------------------------
DATABASE_URL=postgresql://managex_app:managex_dev_password@localhost:5432/managex
MIGRATION_DATABASE_URL=postgresql://postgres:postgres_password@localhost:5432/managex

# ------------------------------------------------------------------------------
# Session Security & Encryption (64+ hex characters in production)
# ------------------------------------------------------------------------------
SESSION_SECRET=development_session_secret_change_me_to_a_long_random_string_in_production
CSRF_SECRET=development_csrf_secret_change_me_to_a_long_random_string_in_production
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
TOKEN_ENCRYPTION_KEY_VERSION=1

# ------------------------------------------------------------------------------
# Google OAuth 2.0 (Google Meet & Calendar Integration)
# ------------------------------------------------------------------------------
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/v1/integrations/google/callback

# ------------------------------------------------------------------------------
# OpenRouter AI Foundation (Optional)
# ------------------------------------------------------------------------------
AI_ENABLED=true
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_DEFAULT_MODEL=google/gemini-2.0-flash-001
OPENROUTER_FALLBACK_MODEL=openai/gpt-4o-mini
```

---

## 🧪 Testing & Code Quality

ManageX enforces strict quality gates across linting, type-safety, unit tests, integration tests, and RLS security validation.

### Verification Commands

| Command | Target | Scope |
|---|---|---|
| `npm run lint` | Full Monorepo | ESLint checks across backend (`.js`) and frontend (`.ts`, `.tsx`) |
| `npm run typecheck:frontend` | Frontend | Strict TypeScript compiler validation (`tsc --noEmit`) |
| `npm run build:frontend` | Frontend | Production asset bundle verification |
| `npm run test:backend` | Backend | Integration & unit tests via Node.js native test runner |
| `npm run test:frontend` | Frontend | Component, hook, and state tests via Vitest |
| `npm test` | All Suites | Executes both backend and frontend test runners |

---

## 🤝 Contributing

We welcome contributions from the community! To maintain code quality:

1. Fork the repository and create your branch: `git checkout -b feature/amazing-feature`.
2. Ensure all changes adhere to project invariants in [AGENTS.md](AGENTS.md).
3. Verify that all tests, linting, and typechecks pass:
   ```bash
   npm run lint
   npm run typecheck:frontend
   npm test
   ```
4. Commit your changes using conventional commit messages: `git commit -m 'feat(meetings): add calendar sync retry banner'`.
5. Push to your branch and open a Pull Request.

---


