# ManageX Operational Runbook & Incident Response

## 1. Migration Execution & Rollback Procedures

### Pre-Deployment Migration Verification
1. Ensure `MIGRATION_DATABASE_URL` is set to the Neon branch or target database with DDL privileges (`managex_migration`).
2. Run migration dry-run / pending check:
   ```bash
   node database/migrate.js --status
   ```
3. Apply pending migrations:
   ```bash
   node database/migrate.js --up
   ```

### Rollback Strategy
- **Forward-Fix First:** For non-breaking additions (e.g. new nullable column or new table), prefer applying a forward-fix migration.
- **Transactional Rollback:** All ManageX migrations execute inside explicit `BEGIN ... COMMIT` blocks. If a migration fails mid-execution, PostgreSQL automatically rolls back the entire transaction.
- **Database Branch Restores (Neon):** Neon supports instant branch creation and point-in-time recovery (PITR). Before applying high-impact migrations in production, create a named branch snapshot:
  ```bash
  # Using Neon CLI or Web Console
  neon branches create --name pre-migration-backup
  ```

---

## 2. Health & Readiness Verification

### Endpoints
- **Liveness Probe:** `GET /api/v1/health`
  - Responds `200 OK` with `{ status: "ok" }`.
  - Proves the Node.js event loop and Express HTTP server are responsive.
- **Readiness Probe:** `GET /api/v1/ready`
  - Responds `200 OK` with `{ status: "ready", database: "connected" }`.
  - Executes `SELECT 1` on the pooled PostgreSQL connection.
  - Returns `503 Service Unavailable` if database connectivity fails.

---

## 3. Incident Triage & Common Failure Scenarios

### Scenario 1: Cross-Tenant 403 Forbidden Errors
- **Symptom:** User reports `403 Forbidden` ("Insufficient tenant permissions") when navigating between organisations.
- **Investigation:**
  1. Inspect `audit_logs` for `TENANT_ACCESS_DENIED` events matching the user's `userId`.
  2. Verify that the user has an active row in `organisation_memberships` for the target `organisation_id` (`status = 'active'`).
  3. Verify client browser has cleared legacy local caches and updated the active organisation context.

### Scenario 2: Render Free-Tier Cold-Start & Gateway Timeouts (502 / 504)
- **Symptom:** First request after 15 minutes of inactivity returns HTTP 502 Bad Gateway or 504 Gateway Timeout from the Vercel proxy.
- **Root Cause:** Render free web service spins down after 15 minutes of inactivity. Initial container start takes 40–60 seconds, which exceeds Vercel's edge rewrite timeout.
- **Mitigation & Operational Protocol:**
  1. **Frontend Non-Intrusive Waking Banner:** The client UI displays a clear, non-intrusive status banner: *"ManageX service is waking up, please wait a moment..."*.
  2. **Bounded Health Probes:** The client initiates bounded polling against `GET /api/v1/health` every 5 seconds, up to a maximum limit of 60 seconds.
  3. **Idempotent Reads:** Once `GET /api/v1/health` responds with `200 OK`, safe idempotent `GET` requests may be automatically replayed.
  4. **Strict Mutation Protection:** The client **never automatically replays state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`)** merely because a 502/504 or timeout occurred. An interrupted mutation may have already been received and committed by the backend. A successful health probe does NOT guarantee whether the mutation succeeded or failed.
  5. **Mutation Reconciliation:** When a mutation request times out or receives 502/504, the UI surfaces an informative message allowing the user to refresh the view or reconcile status before re-attempting, avoiding duplicate creation or unintended side effects.
  6. **Failure State:** If health probes fail to connect after 60 seconds, the UI transitions to a distinct failure state: *"Service did not respond in time. Please check your network or try again."* with a manual retry button.

### Scenario 3: Email Delivery Failure
- **Symptom:** User does not receive email verification or password reset link.
- **Investigation:**
  1. Inspect server logs for `EMAIL_DELIVERY_FAILURE`.
  2. In production, check if SMTP environment variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) are configured.
  3. If unconfigured, the API returns `{ code: "EMAIL_PROVIDER_UNAVAILABLE" }` without claiming delivery.
  4. In development mode, check the server stdout console where verification links are safely printed.

---

## 4. Disaster Recovery & Backup Plan

1. **Automated Neon Backups:**
   - Neon provides continuous write-ahead log (WAL) backups and point-in-time recovery (PITR) up to the retention window.
2. **Logical Dump Backup (Weekly / Pre-Release):**
   ```bash
   pg_dump --no-owner --no-acl -d "$MIGRATION_DATABASE_URL" -F c -f backup_$(date +%Y%m%d).dump
   ```
3. **Restore Verification:**
   - To verify a backup, restore the dump into an isolated test branch or local Docker Postgres container:
   ```bash
   pg_restore -d "postgresql://localhost:5432/test_restore" backup_*.dump
   ```
