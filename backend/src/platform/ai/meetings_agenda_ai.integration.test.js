/**
 * ManageX Meetings AI Agenda Integration Suite (managex_test)
 * Strictly verifies Phase 02A Meeting Agenda Generator:
 * - Authorization (Organiser / meeting.edit)
 * - Terminal state rejection
 * - Ephemeral draft return without persistence
 * - Explicit saving through existing agenda endpoint
 * - Cross-tenant isolation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { generateMeetingAgendaDraft } from './meetingsAiService.js';
import { createMeetingAgendaItem, listMeetingAgenda } from '../meetings/meetingService.js';
import { AuthorizationError, ConflictError } from '../common/errors.js';

const TEST_DB_URL = 'postgresql://postgres:postgres_dev_password@localhost:5433/managex_test';

describe('ManageX Meetings AI Agenda Integration Suite (managex_test)', () => {
  let adminClient;
  let orgAId;
  let orgBId;
  let userOrganiserId;
  let userAttendeeId;
  let userCrossTenantId;
  let meetingId;
  let terminalMeetingId;

  before(async () => {
    adminClient = new pg.Client({ connectionString: TEST_DB_URL });
    await adminClient.connect();

    // Verify database safety invariant
    const dbRes = await adminClient.query('SELECT current_database() as name');
    if (dbRes.rows[0].name !== 'managex_test') {
      throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbRes.rows[0].name}`);
    }

    // Create test organisations
    const orgARes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('Meeting AI Org A', 'meeting-ai-org-a-' || gen_random_uuid()) RETURNING id"
    );
    orgAId = orgARes.rows[0].id;

    const orgBRes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('Meeting AI Org B', 'meeting-ai-org-b-' || gen_random_uuid()) RETURNING id"
    );
    orgBId = orgBRes.rows[0].id;

    // Create test users
    const u1Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('organiser-' || gen_random_uuid() || '@managex.local', 'hash', 'Meeting Organiser') RETURNING id"
    );
    userOrganiserId = u1Res.rows[0].id;

    const u2Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('attendee-' || gen_random_uuid() || '@managex.local', 'hash', 'Meeting Attendee') RETURNING id"
    );
    userAttendeeId = u2Res.rows[0].id;

    const u3Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('crosstenant-' || gen_random_uuid() || '@managex.local', 'hash', 'Cross Tenant') RETURNING id"
    );
    userCrossTenantId = u3Res.rows[0].id;

    // Add memberships
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userOrganiserId]
    );
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userAttendeeId]
    );
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgBId, userCrossTenantId]
    );

    // Create active meeting
    const meetRes = await adminClient.query(
      `INSERT INTO meetings (
        organisation_id, title, description, start_at, end_at, timezone,
        location_type, visibility, status, organiser_id, created_by_id
      ) VALUES (
        $1, 'Q4 Product Roadmap Sync', 'Discussion on Q4 strategic releases',
        NOW() + interval '2 days', NOW() + interval '2 days 1 hour', 'UTC',
        'virtual', 'organisation', 'scheduled', $2, $2
      ) RETURNING id`,
      [orgAId, userOrganiserId]
    );
    meetingId = meetRes.rows[0].id;

    // Create terminal (completed) meeting
    const termRes = await adminClient.query(
      `INSERT INTO meetings (
        organisation_id, title, description, start_at, end_at, timezone,
        location_type, visibility, status, organiser_id, created_by_id
      ) VALUES (
        $1, 'Past Completed Retro', 'Sprint retro completed yesterday',
        NOW() - interval '1 day 1 hour', NOW() - interval '1 day', 'UTC',
        'virtual', 'organisation', 'completed', $2, $2
      ) RETURNING id`,
      [orgAId, userOrganiserId]
    );
    terminalMeetingId = termRes.rows[0].id;
  });

  after(async () => {
    if (adminClient) {
      if (orgAId) {
        await adminClient.query('DELETE FROM meeting_agenda_items WHERE meeting_id IN ($1, $2)', [meetingId, terminalMeetingId]);
        await adminClient.query('DELETE FROM meetings WHERE id IN ($1, $2)', [meetingId, terminalMeetingId]);
        await adminClient.query('DELETE FROM organisation_memberships WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM organisation_ai_settings WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM ai_usage_records WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM organisations WHERE id IN ($1, $2)', [orgAId, orgBId]);
      }
      if (userOrganiserId) {
        await adminClient.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [userOrganiserId, userAttendeeId, userCrossTenantId]);
      }
      await adminClient.end();
    }
  });

  it('1. Organiser can generate an ephemeral AI agenda draft with sensible durations', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                suggestedAgendaItems: [
                  { title: 'Welcome & Align', description: 'Kick-off', durationMinutes: 10, orderIndex: 0 },
                  { title: 'Roadmap Proposals', description: 'Review tech specs', durationMinutes: 35, orderIndex: 1 },
                  { title: 'Wrap-up & Next Steps', description: 'Action item assignments', durationMinutes: 15, orderIndex: 2 },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 250, completion_tokens: 150, total_tokens: 400 },
      }),
    });

    const result = await generateMeetingAgendaDraft({
      organisationId: orgAId,
      meetingId,
      userId: userOrganiserId,
      userPermissions: [],
      input: {
        focusTopics: ['Roadmap Proposals'],
        targetDurationMinutes: 60,
      },
      apiKey: 'sk-or-v1-mock-test-key',
      fetchFn: mockFetch,
    });

    assert.equal(result.isDraft, true);
    assert.equal(result.meetingId, meetingId);
    assert.equal(result.suggestedAgendaItems.length, 3);
    assert.equal(result.suggestedAgendaItems[0].title, 'Welcome & Align');

    // CRITICAL: Verify that the draft was NOT written to the database automatically
    const existingAgenda = await listMeetingAgenda(orgAId, meetingId, userOrganiserId);
    assert.equal(existingAgenda.length, 0, 'AI draft must remain non-persistent until explicit user commit');
  });

  it('2. Denies draft generation to attendees without meeting.edit permission', async () => {
    await assert.rejects(
      async () => {
        await generateMeetingAgendaDraft({
          organisationId: orgAId,
          meetingId,
          userId: userAttendeeId,
          userPermissions: ['meeting.view'],
          input: {},
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.match(err.message, /Only the meeting organiser or members with meeting.edit/);
        return true;
      }
    );
  });

  it('3. Denies cross-tenant draft generation under RLS', async () => {
    await assert.rejects(
      async () => {
        await generateMeetingAgendaDraft({
          organisationId: orgBId,
          meetingId,
          userId: userCrossTenantId,
          userPermissions: ['meeting.edit'],
          input: {},
        });
      },
      (err) => {
        // Meeting is not in Org B, should throw 404 under tenant isolation
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });

  it('4. Rejects draft generation for completed terminal meetings', async () => {
    await assert.rejects(
      async () => {
        await generateMeetingAgendaDraft({
          organisationId: orgAId,
          meetingId: terminalMeetingId,
          userId: userOrganiserId,
          userPermissions: [],
          input: {},
        });
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, 'MEETING_TERMINAL_STATE');
        return true;
      }
    );
  });

  it('5. Allows explicit review and save through existing agenda creation endpoint', async () => {
    // Organiser reviews draft item and commits it via standard endpoint
    const savedItem = await createMeetingAgendaItem(
      orgAId,
      meetingId,
      {
        title: 'Welcome & Align',
        description: 'Kick-off reviewed by organiser',
        durationMinutes: 10,
        orderIndex: 0,
      },
      userOrganiserId
    );

    assert.ok(savedItem.id);
    assert.equal(savedItem.title, 'Welcome & Align');

    const agendaList = await listMeetingAgenda(orgAId, meetingId, userOrganiserId);
    assert.equal(agendaList.length, 1);
    assert.equal(agendaList[0].title, 'Welcome & Align');
  });
});
