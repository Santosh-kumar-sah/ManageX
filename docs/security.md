# ManageX Security Architecture & Threat Model

## 1. Threat Model & Trust Boundaries

ManageX operates in a multi-tenant B2B SaaS environment where multiple competing organisations share a single database and application instance.

```text
[ Browser / Public Internet ]
          │  (Untrusted boundary)
          ▼
[ Vercel CDN & Reverse Proxy ]
          │  (Forwarded requests, same-origin cookie semantics)
          ▼
[ Express.js Application Boundary ]
  ├── 1. Request Rate Limiting & Input Validation (Zod)
  ├── 2. Identity Verification (Server-Side Session Store)
  ├── 3. Tenant Context & Membership Authorization
  ├── 4. Module Entitlement & Scoped Permission Evaluator
  └── 5. Resource Scope & Ownership Policies
          │  (Database Connection with Runtime Role 'managex_app')
          ▼
[ PostgreSQL Database Boundary ]
  ├── Transaction-Local Settings (`app.current_organisation_id`)
  ├── Row-Level Security (`FORCE ROW LEVEL SECURITY`)
  └── Composite Foreign Keys & Tenant Integrity Constraints
```

### Untrusted Inputs
- Client-supplied `organisationId`, `userId`, `role`, or permissions are **never trusted**.
- Client-supplied route parameters, IDs, query strings, and request bodies must be parsed and strictly validated by backend Zod schemas.

---

## 2. Six-Tier Defense-in-Depth Authorization Pipeline

Authorization is strictly evaluated in six sequential layers. Passing an earlier layer never implies clearance at a later layer.

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Identity & Session Layer                                 │
│    - Verifies session validity, idle timeout & absolute age │
│    - Asserts account is active and email is verified        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Organisation Context & Membership Layer                  │
│    - Verifies user has active membership in target org      │
│    - Suspended or removed memberships fail closed (403)     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Module Entitlement Layer                                 │
│    - Verifies module is platform-available                  │
│    - Verifies module is activated by target organisation    │
│    - Deactivated module fails closed (403)                  │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Scoped Action Permission Layer                           │
│    - Verifies user's role grants required permission key    │
│      (e.g., 'event.create', 'meeting.notes.read')           │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Resource Scope & Participation Policy                    │
│    - Verifies user is assigned to this specific entity      │
│      (e.g., assigned judge for submission X)                │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. PostgreSQL Row-Level Security (RLS) Layer                │
│    - Transaction-local tenant context enforces DB filtering │
│    - FORCE RLS on runtime non-superuser role                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. PostgreSQL RLS & Database Role Privileges

### Separate Roles Strategy
1. **Migration Role (`managex_migration`):**
   - Owns the database schema, tables, types, and indexes.
   - Executes DDL during deployment.
   - Not accessible to the runtime application web service.
2. **Runtime Application Role (`managex_app`):**
   - Used by the Node.js connection pool.
   - Privileges: `SELECT, INSERT, UPDATE, DELETE` on application tables; `USAGE` on sequences.
   - **Explicitly lacks:** `SUPERUSER`, `CREATEDB`, `CREATEROLE`, and `BYPASSRLS`.
   - `FORCE ROW LEVEL SECURITY` is enabled on every tenant-owned table so that even table owners would be subject to policies.

### Fail-Closed RLS Policy Pattern
```sql
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;

CREATE POLICY events_tenant_isolation ON events
  AS RESTRICTIVE
  FOR ALL
  TO managex_app
  USING (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR (
      -- Narrow public published event viewing exemption
      status = 'published' AND is_public = true AND current_setting('app.is_public_read', true) = 'true'
    )
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );
```

### Composite Tenant-Aware Foreign Keys
To prevent a record in Organisation A from referencing a parent in Organisation B:
```sql
-- Enforce tenant-aware composite foreign key
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_project_tenant 
  FOREIGN KEY (organisation_id, project_id) 
  REFERENCES projects(organisation_id, id) ON DELETE RESTRICT;
```

---

## 4. Special Access Boundaries & Segregation

### A. External Event Participant Boundary
- **Context:** An external user registers for a public event/hackathon.
- **Rule:** Registering for an event **does not create an organisation membership** (`organisation_memberships` row is NOT created).
- **Scope:** The participant identity receives an `event_participants` record. They can access **only**:
  1. Their own registration record.
  2. Their own team and submission (for hackathons).
  3. Published public event information.
- They cannot query organisation members, access meetings, access projects, or view other participants' personal info.

### B. Platform Administration & Support Boundary
- Platform Super Admin and Platform Support Agent routes live under `/platform/*`.
- **Platform Support Agent:** Can view operational health and basic organisation metadata (name, slug, creation date, status).
- **Strict Prohibition:** Support agents **cannot** browse private tenant event submissions, meeting notes, project tasks, comments, evaluation configurations, or meeting links.
- **No Impersonation:** No "login-as-user" or unlogged tenant browsing mechanism exists in ManageX.

### C. Owner Invariants & Transfer Protocol
- An organisation must have at least one active `owner`.
- The final owner cannot be deleted, suspended, or demoted.
- **Transfer Requirements:**
  1. Transferring ownership requires explicit step-up reauthentication (password check executed within the previous 10 minutes).
  2. The target user must be an active member of the organisation.
  3. The transfer is executed inside a single database transaction with row-level locks on the organisation and membership records.

### D. Evaluation & Judge Scheduling Boundary (Phase 2A / 2A.1)
- **External Judge Access:** Judges receive assigned access to specific panels and evaluations without organisation membership. RLS restricts non-member judges strictly to `SELECT` on assigned panels, sessions, and judge assignment rows; all mutation operations (`INSERT`, `UPDATE`, `DELETE`) fail closed.
- **Platform Support Least-Privilege:** Platform administrators and support agents have **no** mutation or raw `SELECT` bypass on `round_evaluations`, `evaluation_panels`, `evaluation_panel_judges`, or `evaluation_sessions`. Private judge assignments and meeting URLs (`default_meeting_url`, `meeting_url`) are protected from platform support exposure at the database RLS layer.
- **Participant Schedule Isolation:** Participants can read only their own team's published session via `evaluation_sessions`. They cannot access another team's session, private meeting link, or draft schedule information.

---

## 5. Session Security, Cookies, and CSRF Architecture

### Session Properties
- **Idle Timeout:** 30 minutes of inactivity.
- **Absolute Lifetime:** 7 days maximum session duration.
- **Session Revocation:** On logout or password reset, all server-side session tokens for the user are immediately revoked in the database.
- **Session Rotation:** The session identifier is regenerated upon login and privilege escalation.

### Cookie Configuration
| Attribute | Development | Production | Rationale |
|---|---|---|---|
| `HttpOnly` | `true` | `true` | Prevents XSS token exfiltration |
| `Secure` | `false` (HTTP) | `true` (HTTPS) | Enforces transport encryption in production |
| `SameSite` | `Lax` | `Lax` | Protects top-level navigation while maintaining proxy compatibility |
| `Path` | `/` | `/` | Scoped to the application root |
| `Domain` | Unset (host-only) | Unset (host-only) | Restricts cookies strictly to the application origin |

### CSRF Defense Strategy
Because browser requests are routed through a same-origin `/api/*` reverse proxy:
1. State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a custom header: `X-CSRF-Token`.
2. The CSRF token is issued in a cryptographically random, per-session cookie or initial auth handshake.
3. Express middleware validates `Origin` / `Referer` headers against the approved frontend origin AND matches the `X-CSRF-Token` header.

---

## 6. Audit Logging Policy

ManageX maintains an immutable, append-only `audit_logs` table.

### Monitored Events
- **Authentication & Security:** Login failure (rate limited), password reset, step-up reauthentication.
- **Organisation & Membership:** Org creation, member invite, role change, member suspension/removal, ownership transfer.
- **Module Entitlements:** Module activation and deactivation.
- **Events:** Event creation, publish, cancellation, archive, judge assignment, result publication.
- **Meetings:** Meeting creation, cancellation, confidential note edits, action item reassignment.
- **Projects:** Project creation, archive, task soft deletion, assignment reassignments.

### Strict Redaction Invariants
The audit logger **never** logs:
- Passwords or password hashes.
- Session tokens, reset tokens, or invitation tokens.
- Private encryption keys or API secrets.
- Full request bodies or confidential meeting minutes/notes.
