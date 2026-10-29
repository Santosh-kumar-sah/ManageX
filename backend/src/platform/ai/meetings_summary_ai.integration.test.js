/**
 * ManageX Meetings AI Notes Summarizer Integration Suite (managex_test)
 * Strictly verifies Phase 02B Confidential Meeting Notes Summarizer:
 * - Authorization (Organiser vs attendee without meeting.notes.read)
 * - Audit logging of access denial (meeting.notes_access_denied)
 * - Empty source data guard (HTTP 422 before quota or external call)
 * - Cancelled meeting rejection (HTTP 409)
 * - Ephemeral draft return without automatic persistence
 * - Cross-tenant isolation (HTTP 404)
 * - OpenRouter ZDR and data collection denial routing controls
 * - Usage ledger recording and redacted audit logging
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { summarizeMeetingNotes } from './meetingsAiService.js';
import { closePool } from '../database/pool.js';
import { AuthorizationError, ConflictError, ValidationError, NotFoundError } from '../common/errors.js';

const TEST_DB_URL = 'postgresql://postgres:postgres_dev_password@localhost:5433/managex_test';

describe('ManageX Meetings AI Notes Summarizer Integration Suite (managex_test)', () => {
  let adminClient;
  let orgAId;
  let orgBId;
  let userOrganiserId;
  let userAttendeeNoNotesId;
  let userPermittedNotesId;
  let userCrossTenantId;
  let meetingWithNotesId;
  let meetingEmptyNotesId;
  let cancelledMeetingId;

  before(async () => {
    adminClient = new pg.Client({ connectionString: TEST_DB_URL });
    await adminClient.connect();

    const dbRes = await adminClient.query('SELECT current_database() as name');
    if (dbRes.rows[0].name !== 'managex_test') {
      throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbRes.rows[0].name}`);
    }

    // 1. Create organisations
    const orgARes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('Notes AI Org A', 'notes-ai-org-a-' || gen_random_uuid()) RETURNING id"
    );
    orgAId = orgARes.rows[0].id;

    const orgBRes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('Notes AI Org B', 'notes-ai-org-b-' || gen_random_uuid()) RETURNING id"
    );
    orgBId = orgBRes.rows[0].id;

    // Enable AI for org A
    await adminClient.query(
      `INSERT INTO organisation_ai_settings (organisation_id, is_ai_enabled, monthly_token_quota)
       VALUES ($1, true, 500000)
       ON CONFLICT (organisation_id) DO UPDATE SET is_ai_enabled = true, monthly_token_quota = 500000`,
      [orgAId]
    );

    // 2. Create users
    const u1Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('organiser-' || gen_random_uuid() || '@managex.local', 'hash', 'Meeting Organiser') RETURNING id"
    );
    userOrganiserId = u1Res.rows[0].id;

    const u2Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('attendee-nonotes-' || gen_random_uuid() || '@managex.local', 'hash', 'Attendee No Notes') RETURNING id"
    );
    userAttendeeNoNotesId = u2Res.rows[0].id;

    const u3Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('permitted-notes-' || gen_random_uuid() || '@managex.local', 'hash', 'Permitted Notes User') RETURNING id"
    );
    userPermittedNotesId = u3Res.rows[0].id;

    const u4Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('cross-tenant-' || gen_random_uuid() || '@managex.local', 'hash', 'Cross Tenant User') RETURNING id"
    );
    userCrossTenantId = u4Res.rows[0].id;

    // 3. Memberships
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userOrganiserId]
    );
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userAttendeeNoNotesId]
    );
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userPermittedNotesId]
    );
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgBId, userCrossTenantId]
    );

    // 4. Create active meeting with notes, discussion points, and decisions
    const meetRes = await adminClient.query(
      `INSERT INTO meetings (
        organisation_id, title, description, start_at, end_at, timezone,
        location_type, visibility, status, organiser_id, created_by_id
      ) VALUES (
        $1, 'Q4 Architecture Review', 'Confidential review of database schema and RLS',
        NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'UTC',
        'virtual', 'organisation', 'scheduled', $2, $2
      ) RETURNING id`,
      [orgAId, userOrganiserId]
    );
    meetingWithNotesId = meetRes.rows[0].id;

    // Insert confidential note
    await adminClient.query(
      `INSERT INTO meeting_notes (organisation_id, meeting_id, content, created_by_id, updated_by_id)
       VALUES ($1, $2, 'Confidential note: Team agreed to deploy migration 42 only after staging validation.', $3, $3)`,
      [orgAId, meetingWithNotesId, userOrganiserId]
    );

    // Insert discussion point
    await adminClient.query(
      `INSERT INTO meeting_discussion_points (organisation_id, meeting_id, title, body, order_index, created_by_id)
       VALUES ($1, $2, 'PostgreSQL Isolation', 'Discussion on tenant RLS fail-closed policies.', 0, $3)`,
      [orgAId, meetingWithNotesId, userOrganiserId]
    );

    // Insert decision
    await adminClient.query(
      `INSERT INTO meeting_decisions (organisation_id, meeting_id, title, details, order_index, created_by_id)
       VALUES ($1, $2, 'Approve Migration 42', 'Forward-only SQL migration approved for Friday release.', 0, $3)`,
      [orgAId, meetingWithNotesId, userOrganiserId]
    );

    // 5. Create active meeting with NO notes/points/decisions (for empty test)
    const meetEmptyRes = await adminClient.query(
      `INSERT INTO meetings (
        organisation_id, title, description, start_at, end_at, timezone,
        location_type, visibility, status, organiser_id, created_by_id
      ) VALUES (
        $1, 'Empty Kickoff', 'A fresh meeting with no minutes recorded yet',
        NOW() + interval '3 days', NOW() + interval '3 days 1 hour', 'UTC',
        'virtual', 'organisation', 'scheduled', $2, $2
      ) RETURNING id`,
      [orgAId, userOrganiserId]
    );
    meetingEmptyNotesId = meetEmptyRes.rows[0].id;

    // 6. Create cancelled meeting
    const meetCancelledRes = await adminClient.query(
      `INSERT INTO meetings (
        organisation_id, title, description, start_at, end_at, timezone,
        location_type, visibility, status, organiser_id, created_by_id
      ) VALUES (
        $1, 'Cancelled Sprint Planning', 'This meeting was cancelled by organiser',
        NOW() + interval '4 days', NOW() + interval '4 days 1 hour', 'UTC',
        'virtual', 'organisation', 'cancelled', $2, $2
      ) RETURNING id`,
      [orgAId, userOrganiserId]
    );
    cancelledMeetingId = meetCancelledRes.rows[0].id;
  });

  after(async () => {
    if (adminClient) {
      if (orgAId) {
        await adminClient.query('DELETE FROM meeting_decisions WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM meeting_discussion_points WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM meeting_notes WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM meetings WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM organisation_memberships WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM organisation_ai_settings WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM ai_usage_records WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM audit_logs WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM organisations WHERE id IN ($1, $2)', [orgAId, orgBId]);
      }
      if (userOrganiserId) {
        await adminClient.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4)', [
          userOrganiserId,
          userAttendeeNoNotesId,
          userPermittedNotesId,
          userCrossTenantId,
        ]);
      }
      await adminClient.end();
      await closePool();
    }
  });

  it('1. Organiser can generate an ephemeral AI notes summary with ZDR privacy controls', async () => {
    let capturedBody = null;

    const mockFetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'gen-summary-1',
          model: 'google/gemini-2.0-flash-001',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  executiveSummary: 'The team confirmed deployment plans for database migration 42 after validation on staging.',
                  keyDiscussionPoints: [
                    {
                      topic: 'PostgreSQL Isolation',
                      summary: 'Reviewed RLS policies to guarantee fail-closed tenant isolation.',
                    },
                  ],
                  decisions: [
                    {
                      decision: 'Approve Migration 42',
                      rationale: 'All forward-only SQL migrations verified on Neon test branch.',
                    },
                  ],
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 350,
            completion_tokens: 120,
            total_tokens: 470,
          },
        }),
      };
    };

    const result = await summarizeMeetingNotes({
      organisationId: orgAId,
      meetingId: meetingWithNotesId,
      userId: userOrganiserId,
      userPermissions: [],
      input: { focusAreas: ['Database migration'] },
      apiKey: 'sk-or-dummy-test-key',
      fetchFn: mockFetch,
    });

    assert.equal(result.isDraft, true);
    assert.equal(result.meetingId, meetingWithNotesId);
    assert.ok(result.summary.executiveSummary.includes('database migration 42'));
    assert.equal(result.summary.keyDiscussionPoints.length, 1);
    assert.equal(result.summary.decisions.length, 1);
    assert.equal(result.usage.totalTokens, 470);

    // CRITICAL SECURITY ASSERTION: OpenRouter request payload MUST include ZDR and data collection denial
    assert.ok(capturedBody);
    assert.deepEqual(capturedBody.provider, {
      data_collection: 'deny',
      zdr: true,
    });

    // Verify usage ledger recorded
    const ledgerRes = await adminClient.query(
      `SELECT * FROM ai_usage_records WHERE organisation_id = $1 AND feature = 'notes_summarization' ORDER BY created_at DESC LIMIT 1`,
      [orgAId]
    );
    assert.equal(ledgerRes.rows.length, 1);
    assert.equal(ledgerRes.rows[0].total_tokens, 470);
    assert.equal(ledgerRes.rows[0].status, 'success');
  });

  it('2. Output is ephemeral: database meeting_notes content is NOT mutated automatically', async () => {
    const notesRes = await adminClient.query(
      `SELECT content FROM meeting_notes WHERE meeting_id = $1`,
      [meetingWithNotesId]
    );
    // Original notes remain unchanged
    assert.equal(
      notesRes.rows[0].content,
      'Confidential note: Team agreed to deploy migration 42 only after staging validation.'
    );
  });

  it('3. User holding explicit meeting.notes.read permission can summarize notes', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                executiveSummary: 'Executive summary generated for permitted user.',
                keyDiscussionPoints: [],
                decisions: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      }),
    });

    const result = await summarizeMeetingNotes({
      organisationId: orgAId,
      meetingId: meetingWithNotesId,
      userId: userPermittedNotesId,
      userPermissions: ['meeting.view', 'meeting.notes.read'],
      apiKey: 'sk-or-dummy-test-key',
      fetchFn: mockFetch,
    });

    assert.equal(result.isDraft, true);
    assert.ok(result.summary.executiveSummary.includes('permitted user'));
  });

  it('4. Attendee lacking meeting.notes.read is strictly denied (HTTP 403) and audited', async () => {
    await assert.rejects(
      async () => {
        await summarizeMeetingNotes({
          organisationId: orgAId,
          meetingId: meetingWithNotesId,
          userId: userAttendeeNoNotesId,
          userPermissions: ['meeting.view'], // Only basic view, NO notes.read!
          apiKey: 'sk-or-dummy-test-key',
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.equal(err.code, 'FORBIDDEN_NOTES_ACCESS');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Verify audit event meeting.notes_access_denied was recorded
    const auditRes = await adminClient.query(
      `SELECT * FROM audit_logs WHERE organisation_id = $1 AND action = 'meeting.notes_access_denied' ORDER BY created_at DESC LIMIT 1`,
      [orgAId]
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].actor_id, userAttendeeNoNotesId);
  });

  it('5. Rejects meeting with no notes, discussion points, or decisions (HTTP 422 EMPTY_SOURCE_NOTES)', async () => {
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };

    await assert.rejects(
      async () => {
        await summarizeMeetingNotes({
          organisationId: orgAId,
          meetingId: meetingEmptyNotesId,
          userId: userOrganiserId,
          userPermissions: [],
          apiKey: 'sk-or-dummy-test-key',
          fetchFn: mockFetch,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('no notes, discussion points, or decisions'));
        assert.equal(err.statusCode, 422);
        return true;
      }
    );

    // CRITICAL: Must fail closed BEFORE external call or quota consumption
    assert.equal(fetchCalled, false);
  });

  it('6. Rejects cancelled meeting with HTTP 409 MEETING_CANCELLED', async () => {
    await assert.rejects(
      async () => {
        await summarizeMeetingNotes({
          organisationId: orgAId,
          meetingId: cancelledMeetingId,
          userId: userOrganiserId,
          userPermissions: [],
          apiKey: 'sk-or-dummy-test-key',
        });
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, 'MEETING_CANCELLED');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  it('7. Cross-tenant request fails with HTTP 404 MEETING_NOT_FOUND (zero leakage)', async () => {
    await assert.rejects(
      async () => {
        await summarizeMeetingNotes({
          organisationId: orgBId, // Supplying Org B context for Org A meeting
          meetingId: meetingWithNotesId,
          userId: userCrossTenantId,
          userPermissions: ['meeting.view', 'meeting.notes.read'],
          apiKey: 'sk-or-dummy-test-key',
        });
      },
      (err) => {
        assert.ok(err instanceof NotFoundError);
        assert.equal(err.code, 'MEETING_NOT_FOUND');
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });
});
