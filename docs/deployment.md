# ManageX Deployment Architecture & Environment Configuration

## 1. Hosting Topology & Responsibilities

ManageX is architected to run cost-effectively on modern cloud platforms with zero paid prerequisites:

```text
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│     Vercel (Edge)      │      │     Render (Web API)   │      │    Neon (PostgreSQL)   │
│                        │      │                        │      │                        │
│ • React SPA static CDN │─────▶│ • Node.js Express.js   │─────▶│ • Serverless Postgres  │
│ • /api/* rewrite proxy │      │ • Session & Auth Logic │      │ • Transaction Pooler   │
│ • Edge SSL termination │      │ • RLS Context Setter   │      │ • Versioned SQL Schema │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

---

## 2. Environment Variable Inventory

> **SECURITY INVARIANT:** Never commit actual secrets, keys, or passwords. Store secrets only in platform secret managers (Render Environment, Vercel Project Settings, Neon Console).

### Backend Runtime Variables (Render)
| Variable Name | Required | Example Format | Purpose |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` / `development` / `test` | Runtime environment mode |
| `PORT` | Yes | `10000` | HTTP listen port (injected by Render) |
| `DATABASE_URL` | Yes | `postgresql://managex_app:***@ep-***.neon.tech/managex` | Runtime pooled database connection string |
| `SESSION_SECRET` | Yes | 64-char hex string | HMAC signing for session cookies |
| `CSRF_SECRET` | Yes | 64-char hex string | Secret for generating/validating CSRF tokens |
| `FRONTEND_ORIGIN` | Yes | `https://managex.vercel.app` | Allowed CORS origin and CSRF referer check |
| `SMTP_HOST` | No | `smtp.resend.com` | Email provider SMTP host |
| `SMTP_PORT` | No | `587` | Email provider SMTP port |
| `SMTP_USER` | No | `resend` | Email provider SMTP username |
| `SMTP_PASS` | No | `re_***` | Email provider SMTP password |
| `EMAIL_FROM` | No | `ManageX <notifications@managex.app>` | Sender address |

### Backend Migration Variables (Controlled Deployments Only)
| Variable Name | Required | Example Format | Purpose |
|---|---|---|---|
| `MIGRATION_DATABASE_URL` | Yes | `postgresql://managex_migration:***@ep-***.neon.tech/managex` | Database connection with schema DDL ownership |

### Frontend Build Variables (Vercel)
| Variable Name | Required | Example Format | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | `/api/v1` (relative) | Base URL for API client (defaults to `/api/v1`) |
| `VITE_APP_ENV` | Yes | `production` | Environment indicator |

---

## 3. Reverse Proxy & Vercel Rewrite Configuration

To ensure seamless cookie handling without third-party cookie restrictions, `vercel.json` configures a reverse proxy:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://managex-backend.onrender.com/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Express Trust Proxy Setting
Because requests arrive through Vercel's edge proxy:
```javascript
// backend/src/app.js
app.set('trust proxy', 1);
```
This ensures Express reads the true client IP from `X-Forwarded-For` for rate limiting, and detects HTTPS from `X-Forwarded-Proto` for cookie security.

---

## 4. Free-Tier Characteristics & Operational Constraints

1. **Render Free Web Service (Cold-Start Handling & Gateway Timeouts):**
   - **Spin-Down Behaviour:** The web service automatically spins down after 15 minutes of inbound inactivity. A subsequent inbound request triggers a cold-start boot taking ~40–60 seconds.
   - **Gateway Timeout Reality:** Because Vercel proxy rewrites may terminate upstream connections with HTTP 502 Bad Gateway or 504 Gateway Timeout after 15–30 seconds, a client-side timeout alone cannot ensure request completion.
   - **Client Waking-Up Feedback:** When an initial request encounters a network timeout, 502, or 504, the frontend displays a clear, non-intrusive "ManageX service is waking up, please wait a moment..." indicator.
   - **Bounded Health Probes:** The client initiates bounded polling against `GET /api/v1/health` (e.g. every 5 seconds up to an overall time limit of 60 seconds). If the health probe fails to respond within the bound, the UI transitions to a clear failure state offering a manual refresh option.
   - **Safe Idempotent Retries:** Once `GET /api/v1/health` confirms server availability, the client may automatically retry safe, idempotent `GET` read requests only.
   - **Strict Mutation Protection:** The client **must never automatically replay a state-changing mutation (`POST`, `PUT`, `PATCH`, `DELETE`)** merely because a 502/504 or gateway timeout occurred, because the original request may have already reached the server and committed. Mutation retries require an explicitly designed and tested idempotency mechanism (e.g. idempotency keys) or an explicit status-reconciliation check by the user. A successful health probe does NOT guarantee whether the interrupted mutation succeeded or failed.
   - **Zero Paid Dependencies:** This pattern maintains complete reliability and safety on free-tier hosting without introducing paid services or altering the approved stack.
2. **Neon Serverless PostgreSQL:**
   - Free tier includes 0.5 GiB storage and compute autosuspension.
   - Connections must use the Neon pooled connection endpoint (`-pooler` hostname) to avoid exhausting connection limits.
3. **Email Delivery:**
   - If no SMTP credentials are provided, system logs verification and reset links safely to local stdout (in development mode only). In production, APIs return a recoverable `EMAIL_PROVIDER_UNAVAILABLE` error and do NOT claim delivery.
