/**
 * ManageX Events AI Routes Integration Suite (managex_test)
 * Strictly verifies Phase 03 Task 3.2:
 * - Route endpoints POST /organisations/:orgId/events/:eventId/ai/content
 *   and POST /organisations/:orgId/events/:eventId/ai/rubrics
 * - Authentication & organisation membership enforcement
 * - Events module entitlement enforcement
 * - Permission enforcement (event.edit / org.admin)
 * - Input validation & rejection of malformed payloads
 * - Terminal state & scoring commencement guards
 * - Ephemeral behavior: zero database mutations
 * - Cross-tenant isolation under RLS
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import { app } from '../../app.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import { closePool } from '../database/pool.js';

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres_dev_password@localhost:5433/managex_test';

describe('ManageX Events AI Routes Integration Suite (managex_test)', () => {
  let adminClient;
  let orgAId;
  let orgBId;
  let userCreatorId, userEditorId, userViewerId, userCrossTenantId;
  let creatorCookie, editorCookie, viewerCookie, crossTenantCookie;
  let csrfCookie = '';
  let csrfToken = '';
  let eventActiveId;
  let eventTerminalId;
  let eventWithScoresId;
  let originalApiKey;

  before(async () => {
    originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'mock-test-key-for-routes';

    adminClient = new pg.Client({ connectionString: TEST_DB_URL });
    await adminClient.connect();

    const dbRes = await adminClient.query('SELECT current_database() as name');
    if (dbRes.rows[0].name !== 'managex_test') {
      throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbRes.rows[0].name}`);
    }

    // 1. Create test organisations
    const orgARes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('Events AI Route Org A', 'events-route-org-a-' || gen_random_uuid()) RETURNING id"
    );
    orgAId = orgARes.rows[0].id;

    const orgBRes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('Events AI Route Org B', 'events-route-org-b-' || gen_random_uuid()) RETURNING id"
    );
    orgBId = orgBRes.rows[0].id;

    // 2. Module Entitlements: Enable events module for both orgA and orgB
    await adminClient.query(
      `INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled)
       SELECT $1, id, true FROM modules WHERE slug = 'events'
       ON CONFLICT DO NOTHING`,
      [orgAId]
    );

    await adminClient.query(
      `INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled)
       SELECT $1, id, true FROM modules WHERE slug = 'events'
       ON CONFLICT DO NOTHING`,
      [orgBId]
    );

    // 3. Create test users
    const uCreatorRes = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name, status, email_verified_at) VALUES ('route-creator-' || gen_random_uuid() || '@managex.local', 'hash', 'Route Creator', 'active', NOW()) RETURNING id"
    );
    userCreatorId = uCreatorRes.rows[0].id;

    const uEditorRes = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name, status, email_verified_at) VALUES ('route-editor-' || gen_random_uuid() || '@managex.local', 'hash', 'Route Editor', 'active', NOW()) RETURNING id"
    );
    userEditorId = uEditorRes.rows[0].id;

    const uViewerRes = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name, status, email_verified_at) VALUES ('route-viewer-' || gen_random_uuid() || '@managex.local', 'hash', 'Route Viewer', 'active', NOW()) RETURNING id"
    );
    userViewerId = uViewerRes.rows[0].id;

    const uCrossRes = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name, status, email_verified_at) VALUES ('route-cross-' || gen_random_uuid() || '@managex.local', 'hash', 'Route Cross', 'active', NOW()) RETURNING id"
    );
    userCrossTenantId = uCrossRes.rows[0].id;

    // 4. Create Memberships in Org A
    const memCreatorRes = await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id",
      [orgAId, userCreatorId]
    );
    const memberCreatorId = memCreatorRes.rows[0].id;

    const memEditorRes = await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id",
      [orgAId, userEditorId]
    );
    const memberEditorId = memEditorRes.rows[0].id;

    // Assign event_admin role to creator and editor in Org A
    const roleRes = await adminClient.query(
      "SELECT id FROM roles WHERE slug = 'event_admin' AND scope = 'module' LIMIT 1"
    );
    if (roleRes.rows.length > 0) {
      const eventAdminRoleId = roleRes.rows[0].id;
      await adminClient.query(
        "INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3), ($1, $4, $3) ON CONFLICT DO NOTHING",
        [orgAId, memberCreatorId, eventAdminRoleId, memberEditorId]
      );
    }

    // Viewer: Regular member without event.edit
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userViewerId]
    );

    // Cross-tenant user in Org B with event_admin in Org B
    const memCrossRes = await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id",
      [orgBId, userCrossTenantId]
    );
    if (roleRes.rows.length > 0) {
      await adminClient.query(
        "INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [orgBId, memCrossRes.rows[0].id, roleRes.rows[0].id]
      );
    }

    // 5. Create Sessions
    const s1 = await createSession({ userId: userCreatorId });
    creatorCookie = `${SESSION_COOKIE_NAME}=${s1.rawToken}`;

    const s2 = await createSession({ userId: userEditorId });
    editorCookie = `${SESSION_COOKIE_NAME}=${s2.rawToken}`;

    const s3 = await createSession({ userId: userViewerId });
    viewerCookie = `${SESSION_COOKIE_NAME}=${s3.rawToken}`;

    const s4 = await createSession({ userId: userCrossTenantId });
    crossTenantCookie = `${SESSION_COOKIE_NAME}=${s4.rawToken}`;

    // 6. Obtain CSRF cookie and token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const c = cookies.find((item) => item.startsWith('managex_csrf='));
      if (c) {
        csrfCookie = c.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }

    // 7. Seed Events in Org A
    const evtActiveRes = await adminClient.query(`
      INSERT INTO events (
        organisation_id, title, slug, event_type, status, visibility,
        start_at, end_at, timezone, location_type, location, created_by_id
      )
      VALUES (
        $1, 'Agentic Innovation Hackathon', 'route-agentic-hack-' || gen_random_uuid(), 'hackathon', 'published', 'public',
        NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC', 'hybrid', 'San Francisco', $2
      )
      RETURNING id
    `, [orgAId, userCreatorId]);
    eventActiveId = evtActiveRes.rows[0].id;

    const evtTermRes = await adminClient.query(`
      INSERT INTO events (
        organisation_id, title, slug, event_type, status, visibility,
        start_at, end_at, timezone, location_type, created_by_id
      )
      VALUES (
        $1, 'Terminal Hackathon', 'route-term-hack-' || gen_random_uuid(), 'hackathon', 'completed', 'public',
        NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days', 'UTC', 'virtual', $2
      )
      RETURNING id
    `, [orgAId, userCreatorId]);
    eventTerminalId = evtTermRes.rows[0].id;

    const evtScoresRes = await adminClient.query(`
      INSERT INTO events (
        organisation_id, title, slug, event_type, status, visibility,
        start_at, end_at, timezone, location_type, created_by_id
      )
      VALUES (
        $1, 'Scored Hackathon', 'route-scored-hack-' || gen_random_uuid(), 'hackathon', 'in_progress', 'public',
        NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 'UTC', 'in_person', $2
      )
      RETURNING id
    `, [orgAId, userCreatorId]);
    eventWithScoresId = evtScoresRes.rows[0].id;

    // Add criterion, team, submission, and score
    const critRes = await adminClient.query(`
      INSERT INTO event_scoring_criteria (organisation_id, event_id, name, description, max_score, order_index)
      VALUES ($1, $2, 'Execution', 'Code quality and stability', 100, 0)
      RETURNING id
    `, [orgAId, eventWithScoresId]);

    const teamRes = await adminClient.query(`
      INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
      VALUES ($1, $2, 'Team Beta', 'team-beta-' || gen_random_uuid(), $3)
      RETURNING id
    `, [orgAId, eventWithScoresId, userCreatorId]);

    const subRes = await adminClient.query(`
      INSERT INTO event_submissions (organisation_id, event_id, team_id, title, repository_url, submitter_user_id)
      VALUES ($1, $2, $3, 'Beta Project', 'https://github.com/managex/beta', $4)
      RETURNING id
    `, [orgAId, eventWithScoresId, teamRes.rows[0].id, userCreatorId]);

    await adminClient.query(`
      INSERT INTO event_scores (organisation_id, event_id, submission_id, criterion_id, judge_user_id, score, feedback)
      VALUES ($1, $2, $3, $4, $5, 88.0, 'Good execution')
    `, [orgAId, eventWithScoresId, subRes.rows[0].id, critRes.rows[0].id, userCreatorId]);
  });

  after(async () => {
    process.env.OPENROUTER_API_KEY = originalApiKey;

    if (adminClient) {
      if (orgAId) {
        await adminClient.query('DELETE FROM event_scores WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM event_submissions WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM event_teams WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM event_scoring_criteria WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM events WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM organisations WHERE id = $1', [orgAId]);
      }
      if (orgBId) {
        await adminClient.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgBId]);
        await adminClient.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgBId]);
        await adminClient.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgBId]);
        await adminClient.query('DELETE FROM organisations WHERE id = $1', [orgBId]);
      }
      if (userCreatorId) {
        await adminClient.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4)', [
          userCreatorId,
          userEditorId,
          userViewerId,
          userCrossTenantId,
        ]);
      }
      await adminClient.end();
    }
    await closePool();
  });

  describe('Route: POST /api/v1/organisations/:orgId/events/:eventId/ai/content', () => {
    it('1. Event creator can generate ephemeral content draft via API endpoint', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  titleSuggestion: 'Autonomous Agents Hackathon 2026',
                  overview: 'Build high-impact autonomous agent workflows in 48 hours.',
                  description: 'Join developers worldwide to build production-grade agentic tools.',
                  eligibilityCriteria: 'Open to all developers and students.',
                  submissionGuidelines: 'Submit open-source repository link and video demo.',
                  rules: ['All code written during event', 'Respect code of conduct'],
                  faqs: [
                    { question: 'Is it virtual?', answer: 'Yes, participation is hybrid.' },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 300, completion_tokens: 100, total_tokens: 400 },
        }),
      });

      try {
        const res = await request(app)
          .post(`/api/v1/organisations/${orgAId}/events/${eventActiveId}/ai/content`)
          .set('Cookie', [creatorCookie, csrfCookie])
          .set('X-CSRF-Token', csrfToken)
          .send({
            theme: 'Edge Intelligence',
            targetAudience: 'Systems Engineers',
            focusAreas: ['Embedded AI', 'Security'],
          });

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.isDraft, true);
        assert.equal(res.body.data.eventId, eventActiveId);
        assert.equal(res.body.data.content.titleSuggestion, 'Autonomous Agents Hackathon 2026');
        assert.equal(res.body.data.content.rules.length, 2);
        assert.equal(res.body.data.content.faqs.length, 1);

        // Verify zero database mutation
        const dbEventRes = await adminClient.query(
          'SELECT description FROM events WHERE id = $1',
          [eventActiveId]
        );
        assert.equal(dbEventRes.rows[0].description, null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('2. Rejects request with missing authentication (HTTP 401)', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventActiveId}/ai/content`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      assert.equal(res.status, 401);
    });

    it('3. Rejects user without organisation membership (HTTP 403)', async () => {
      // Create session for user without any org membership
      const uNoOrg = await adminClient.query(
        "INSERT INTO users (email, password_hash, full_name, status, email_verified_at) VALUES ('no-org-' || gen_random_uuid() || '@managex.local', 'hash', 'No Org User', 'active', NOW()) RETURNING id"
      );
      const sNoOrg = await createSession({ userId: uNoOrg.rows[0].id });
      const noOrgCookie = `${SESSION_COOKIE_NAME}=${sNoOrg.rawToken}`;

      try {
        const res = await request(app)
          .post(`/api/v1/organisations/${orgAId}/events/${eventActiveId}/ai/content`)
          .set('Cookie', [noOrgCookie, csrfCookie])
          .set('X-CSRF-Token', csrfToken)
          .send({});

        assert.equal(res.status, 403);
      } finally {
        await adminClient.query('DELETE FROM users WHERE id = $1', [uNoOrg.rows[0].id]);
      }
    });

    it('4. Rejects user lacking event.edit permission (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventActiveId}/ai/content`)
        .set('Cookie', [viewerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({});

      assert.equal(res.status, 403);
    });

    it('5. Rejects request when Events module is not entitled (HTTP 403 MODULE_DISABLED)', async () => {
      await adminClient.query(
        `UPDATE organisation_module_entitlements SET is_enabled = false
         WHERE organisation_id = $1 AND module_id IN (SELECT id FROM modules WHERE slug = 'events')`,
        [orgAId]
      );

      try {
        const res = await request(app)
          .post(`/api/v1/organisations/${orgAId}/events/${eventActiveId}/ai/content`)
          .set('Cookie', [editorCookie, csrfCookie])
          .set('X-CSRF-Token', csrfToken)
          .send({});

        assert.equal(res.status, 403);
        assert.equal(res.body.error?.code, 'MODULE_DISABLED');
      } finally {
        await adminClient.query(
          `UPDATE organisation_module_entitlements SET is_enabled = true
           WHERE organisation_id = $1 AND module_id IN (SELECT id FROM modules WHERE slug = 'events')`,
          [orgAId]
        );
      }
    });

    it('6. Rejects malformed payload exceeding input constraints (HTTP 422 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventActiveId}/ai/content`)
        .set('Cookie', [editorCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          focusAreas: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], // >5 items exceeds limit
        });

      assert.equal(res.status, 422);
      assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
    });

    it('7. Rejects generation for completed terminal events (HTTP 409 EVENT_TERMINAL)', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventTerminalId}/ai/content`)
        .set('Cookie', [editorCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({});

      assert.equal(res.status, 409);
      assert.equal(res.body.error?.code, 'EVENT_TERMINAL');
    });

    it('8. Cross-tenant event access fails closed (HTTP 404 EVENT_NOT_FOUND)', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgBId}/events/${eventActiveId}/ai/content`)
        .set('Cookie', [crossTenantCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({});

      assert.equal(res.status, 404);
      assert.equal(res.body.error?.code, 'EVENT_NOT_FOUND');
    });
  });

  describe('Route: POST /api/v1/organisations/:orgId/events/:eventId/ai/rubrics', () => {
    it('1. Event editor can generate ephemeral judging rubric via API endpoint', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  rubricTitle: 'Agentic Hackathon Evaluation Rubric',
                  criteria: [
                    {
                      name: 'Architecture & Scalability',
                      description: 'System design, modularity, and error resiliency.',
                      maxScore: 100,
                      orderIndex: 0,
                      scoringGuidance: '1-25 Flawed, 26-50 Working, 51-75 Scalable, 76-100 Outstanding',
                    },
                    {
                      name: 'Business Impact',
                      description: 'Measurable value delivery and real-world viability.',
                      maxScore: 100,
                      orderIndex: 1,
                      scoringGuidance: '1-25 Low, 26-50 Moderate, 51-75 High, 76-100 Transformative',
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 310, completion_tokens: 95, total_tokens: 405 },
        }),
      });

      try {
        const res = await request(app)
          .post(`/api/v1/organisations/${orgAId}/events/${eventActiveId}/ai/rubrics`)
          .set('Cookie', [editorCookie, csrfCookie])
          .set('X-CSRF-Token', csrfToken)
          .send({
            tracks: ['FinTech', 'DevTools'],
            criteriaCount: 2,
          });

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.isDraft, true);
        assert.equal(res.body.data.eventId, eventActiveId);
        assert.equal(res.body.data.criteria.length, 2);
        assert.equal(res.body.data.criteria[0].maxScore, 100);

        // Verify zero database insertions into event_scoring_criteria
        const critDb = await adminClient.query(
          'SELECT COUNT(*)::int as count FROM event_scoring_criteria WHERE event_id = $1',
          [eventActiveId]
        );
        assert.equal(critDb.rows[0].count, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('2. Rejects rubric generation once scoring has commenced (EVT-008, HTTP 409 SCORING_ALREADY_STARTED)', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventWithScoresId}/ai/rubrics`)
        .set('Cookie', [editorCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({});

      assert.equal(res.status, 409);
      assert.equal(res.body.error?.code, 'SCORING_ALREADY_STARTED');
    });

    it('3. Rejects invalid rubric request body (criteriaCount < 2) (HTTP 422 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post(`/api/v1/organisations/${orgAId}/events/${eventActiveId}/ai/rubrics`)
        .set('Cookie', [editorCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          criteriaCount: 1, // Minimum allowed is 2
        });

      assert.equal(res.status, 422);
      assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
    });
  });
});
