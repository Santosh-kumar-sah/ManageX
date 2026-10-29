/**
 * ManageX Meetings AI Action Items Extraction Integration Suite (managex_test)
 * Strictly verifies Phase 02C Action Items Extraction with Candidate Assignee Matching:
 * - Authorization (Organiser vs attendee without meeting.notes.read / meeting.action.manage)
 * - Server-side candidate assignee matching against active organisation members
 * - Handling of unique, ambiguous, and unmatched assignee names
 * - Audit logging of access denial (meeting.notes_access_denied)
 * - Empty source data guard (HTTP 422 before quota or external call)
 * - Cancelled meeting rejection (HTTP 409)
 * - Ephemeral draft return without automatic persistence to meeting_action_items
 * - Cross-tenant isolation (HTTP 404)
 * - OpenRouter ZDR and data collection denial routing controls
 * - Persistence through standard action items creation endpoint
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { extractMeetingActionItems } from './meetingsAiService.js';
import { createMeetingActionItem } from '../meetings/meetingService.js';
import { closePool } from '../database/pool.js';
import { AuthorizationError, ConflictError, ValidationError, NotFoundError } from '../common/errors.js';

const TEST_DB_URL = 'postgresql://postgres:postgres_dev_password@localhost:5433/managex_test';

describe('ManageX Meetings AI Action Items Extraction Integration Suite (managex_test)', () => {
  let adminClient;
  let orgAId;
  let orgBId;
  let userOrganiserId;
  let userAttendeeNoNotesId;
  let userPermittedActionsId;
  let userReadOnlyNotesId;
  let userSarahConnorId;
  let userInactiveMemberId;
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
      "INSERT INTO organisations (name, slug) VALUES ('Actions AI Org A', 'actions-ai-org-a-' || gen_random_uuid()) RETURNING id"
    );
    orgAId = orgARes.rows[0].id;

    const orgBRes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('Actions AI Org B', 'actions-ai-org-b-' || gen_random_uuid()) RETURNING id"
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
      "INSERT INTO users (email, password_hash, full_name) VALUES ('actions-org-' || gen_random_uuid() || '@managex.local', 'hash', 'Actions Organiser') RETURNING id"
    );
    userOrganiserId = u1Res.rows[0].id;

    const u2Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('attendee-no-notes-' || gen_random_uuid() || '@managex.local', 'hash', 'Ordinary Attendee') RETURNING id"
    );
    userAttendeeNoNotesId = u2Res.rows[0].id;

    const u3Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('permitted-actions-' || gen_random_uuid() || '@managex.local', 'hash', 'Permitted Actions User') RETURNING id"
    );
    userPermittedActionsId = u3Res.rows[0].id;

    const u4Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('read-only-notes-' || gen_random_uuid() || '@managex.local', 'hash', 'Read Only Notes User') RETURNING id"
    );
    userReadOnlyNotesId = u4Res.rows[0].id;

    const u5Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('sarah-' || gen_random_uuid() || '@managex.local', 'hash', 'Sarah Connor') RETURNING id"
    );
    userSarahConnorId = u5Res.rows[0].id;

    const u6Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('inactive-' || gen_random_uuid() || '@managex.local', 'hash', 'Inactive Member') RETURNING id"
    );
    userInactiveMemberId = u6Res.rows[0].id;

    const u7Res = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('cross-tenant-' || gen_random_uuid() || '@managex.local', 'hash', 'Cross Tenant Member') RETURNING id"
    );
    userCrossTenantId = u7Res.rows[0].id;

    // 3. Create memberships
    // Active members in Org A
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
      [orgAId, userPermittedActionsId]
    );
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userReadOnlyNotesId]
    );
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userSarahConnorId]
    );
    // Suspended/Inactive member in Org A
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'suspended')",
      [orgAId, userInactiveMemberId]
    );
    // Member only in Org B
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgBId, userCrossTenantId]
    );

    // 4. Create meeting with notes, discussion points, and decisions
    const m1Res = await adminClient.query(
      `INSERT INTO meetings (
         organisation_id, title, description, start_at, end_at, timezone, status, organiser_id, created_by_id
       ) VALUES (
         $1, 'Q4 Architecture Sync', 'Planning migration deliverables',
         NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', 'UTC', 'scheduled', $2, $2
       ) RETURNING id`,
      [orgAId, userOrganiserId]
    );
    meetingWithNotesId = m1Res.rows[0].id;

    // Attendees for meetingWithNotes
    await adminClient.query(
      "INSERT INTO meeting_attendees (meeting_id, organisation_id, user_id, role, rsvp_status) VALUES ($1, $2, $3, 'organiser', 'accepted')",
      [meetingWithNotesId, orgAId, userOrganiserId]
    );
    await adminClient.query(
      "INSERT INTO meeting_attendees (meeting_id, organisation_id, user_id, role, rsvp_status) VALUES ($1, $2, $3, 'participant', 'accepted')",
      [meetingWithNotesId, orgAId, userAttendeeNoNotesId]
    );

    // Confidential notes
    await adminClient.query(
      `INSERT INTO meeting_notes (organisation_id, meeting_id, content, created_by_id, updated_by_id)
       VALUES ($1, $2, 'Sarah Connor agreed to deploy migration 41 to staging by Friday. Inactive Member volunteered but is suspended.', $3, $3)`,
      [orgAId, meetingWithNotesId, userOrganiserId]
    );

    // Discussion points
    await adminClient.query(
      `INSERT INTO meeting_discussion_points (organisation_id, meeting_id, title, body, order_index, created_by_id)
       VALUES ($1, $2, 'Migration 41 Rollout', 'Sarah to handle database migration scripts.', 0, $3)`,
      [orgAId, meetingWithNotesId, userOrganiserId]
    );

    // Decisions
    await adminClient.query(
      `INSERT INTO meeting_decisions (organisation_id, meeting_id, title, details, order_index, created_by_id)
       VALUES ($1, $2, 'Target Staging Environment', 'Staging first before production deployment.', 0, $3)`,
      [orgAId, meetingWithNotesId, userOrganiserId]
    );

    // 5. Create empty meeting
    const m2Res = await adminClient.query(
      `INSERT INTO meetings (
         organisation_id, title, description, start_at, end_at, timezone, status, organiser_id, created_by_id
       ) VALUES (
         $1, 'Empty Sync', 'No notes taken',
         NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 1 hour', 'UTC', 'scheduled', $2, $2
       ) RETURNING id`,
      [orgAId, userOrganiserId]
    );
    meetingEmptyNotesId = m2Res.rows[0].id;

    // 6. Create cancelled meeting with notes
    const m3Res = await adminClient.query(
      `INSERT INTO meetings (
         organisation_id, title, description, start_at, end_at, timezone, status, organiser_id, created_by_id
       ) VALUES (
         $1, 'Cancelled Meeting', 'Archived meeting',
         NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '1 hour', 'UTC', 'cancelled', $2, $2
       ) RETURNING id`,
      [orgAId, userOrganiserId]
    );
    cancelledMeetingId = m3Res.rows[0].id;

    await adminClient.query(
      `INSERT INTO meeting_notes (organisation_id, meeting_id, content, created_by_id, updated_by_id)
       VALUES ($1, $2, 'Archived discussion notes.', $3, $3)`,
      [orgAId, cancelledMeetingId, userOrganiserId]
    );
  });

  after(async () => {
    if (adminClient) {
      if (meetingWithNotesId) {
        await adminClient.query('DELETE FROM meeting_action_items WHERE meeting_id = $1', [meetingWithNotesId]);
        await adminClient.query('DELETE FROM meeting_notes WHERE meeting_id = $1', [meetingWithNotesId]);
        await adminClient.query('DELETE FROM meeting_discussion_points WHERE meeting_id = $1', [meetingWithNotesId]);
        await adminClient.query('DELETE FROM meeting_decisions WHERE meeting_id = $1', [meetingWithNotesId]);
        await adminClient.query('DELETE FROM meeting_attendees WHERE meeting_id = $1', [meetingWithNotesId]);
        await adminClient.query('DELETE FROM meetings WHERE id = $1', [meetingWithNotesId]);
      }
      if (meetingEmptyNotesId) {
        await adminClient.query('DELETE FROM meetings WHERE id = $1', [meetingEmptyNotesId]);
      }
      if (cancelledMeetingId) {
        await adminClient.query('DELETE FROM meeting_notes WHERE meeting_id = $1', [cancelledMeetingId]);
        await adminClient.query('DELETE FROM meetings WHERE id = $1', [cancelledMeetingId]);
      }
      if (orgAId) {
        await adminClient.query('DELETE FROM ai_usage_records WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM organisation_ai_settings WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgAId]);
        await adminClient.query('DELETE FROM organisations WHERE id = $1', [orgAId]);
      }
      if (orgBId) {
        await adminClient.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgBId]);
        await adminClient.query('DELETE FROM organisations WHERE id = $1', [orgBId]);
      }
      const allUserIds = [
        userOrganiserId,
        userAttendeeNoNotesId,
        userPermittedActionsId,
        userReadOnlyNotesId,
        userSarahConnorId,
        userInactiveMemberId,
        userCrossTenantId,
      ].filter(Boolean);
      if (allUserIds.length > 0) {
        await adminClient.query('DELETE FROM users WHERE id = ANY($1)', [allUserIds]);
      }
      await adminClient.end();
    }
    await closePool();
  });

  it('1. Organiser can extract ephemeral AI action items draft with ZDR privacy controls', async () => {
    let capturedBody = null;
    const mockFetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  candidateActionItems: [
                    {
                      title: 'Deploy database migration 41 to staging',
                      description: 'Execute forward migration scripts on staging database.',
                      priority: 'high',
                      suggestedDueDate: '2026-10-30',
                      suggestedAssigneeName: 'Sarah Connor',
                      rationale: 'Discussed during rollout planning.',
                    },
                  ],
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 300,
            completion_tokens: 80,
            total_tokens: 380,
          },
        }),
      };
    };

    const res = await extractMeetingActionItems({
      organisationId: orgAId,
      meetingId: meetingWithNotesId,
      userId: userOrganiserId,
      userPermissions: [],
      apiKey: 'test-key',
      fetchFn: mockFetch,
    });

    // Verify ZDR routing controls
    assert.deepEqual(capturedBody.provider, { data_collection: 'deny', zdr: true });

    // Verify draft structure
    assert.equal(res.isDraft, true);
    assert.equal(res.meetingId, meetingWithNotesId);
    assert.equal(res.candidateActionItems.length, 1);

    const item = res.candidateActionItems[0];
    assert.equal(item.title, 'Deploy database migration 41 to staging');
    assert.equal(item.priority, 'high');
    assert.equal(item.suggestedDueDate, '2026-10-30');
    assert.equal(item.rawAssigneeName, 'Sarah Connor');

    // Deterministic match against active Sarah Connor member
    assert.ok(item.suggestedAssignee);
    assert.equal(item.suggestedAssignee.userId, userSarahConnorId);
    assert.equal(item.suggestedAssignee.fullName, 'Sarah Connor');
    assert.equal(item.suggestedAssignee.name, 'Sarah Connor');
    assert.equal(item.isAmbiguousAssignee, false);
  });

  it('2. Output is ephemeral: database meeting_action_items is NOT mutated automatically', async () => {
    const checkRes = await adminClient.query(
      'SELECT count(*)::int as count FROM meeting_action_items WHERE meeting_id = $1',
      [meetingWithNotesId]
    );
    assert.equal(checkRes.rows[0].count, 0);
  });

  it('3. User holding meeting.notes.read AND meeting.action.manage can extract action items', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                candidateActionItems: [
                  {
                    title: 'Review test coverage',
                    description: '',
                    priority: 'medium',
                    suggestedDueDate: null,
                    suggestedAssigneeName: null,
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      }),
    });

    const res = await extractMeetingActionItems({
      organisationId: orgAId,
      meetingId: meetingWithNotesId,
      userId: userPermittedActionsId,
      userPermissions: ['meeting.notes.read', 'meeting.action.manage'],
      apiKey: 'test-key',
      fetchFn: mockFetch,
    });

    assert.equal(res.isDraft, true);
    assert.equal(res.candidateActionItems.length, 1);
  });

  it('4. Attendee lacking meeting.notes.read is strictly denied (HTTP 403) and audited', async () => {
    await assert.rejects(
      async () => {
        await extractMeetingActionItems({
          organisationId: orgAId,
          meetingId: meetingWithNotesId,
          userId: userAttendeeNoNotesId,
          userPermissions: ['meeting.action.manage'], // has action manage, but NOT notes.read
          apiKey: 'test-key',
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.equal(err.code, 'FORBIDDEN_NOTES_ACCESS');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Verify access denial audit event
    const auditRes = await adminClient.query(
      `SELECT action, metadata FROM audit_logs
       WHERE organisation_id = $1 AND actor_id = $2 AND action = 'meeting.notes_access_denied'
       ORDER BY created_at DESC LIMIT 1`,
      [orgAId, userAttendeeNoNotesId]
    );
    assert.equal(auditRes.rows.length, 1);
  });

  it('5. User with notes.read but lacking action.manage permission is denied (HTTP 403)', async () => {
    await assert.rejects(
      async () => {
        await extractMeetingActionItems({
          organisationId: orgAId,
          meetingId: meetingWithNotesId,
          userId: userReadOnlyNotesId,
          userPermissions: ['meeting.notes.read'], // lacks meeting.action.manage
          apiKey: 'test-key',
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.equal(err.code, 'FORBIDDEN');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  it('5b. User with notes.read AND meeting.edit (lacking meeting.action.manage) is strictly denied (HTTP 403)', async () => {
    await assert.rejects(
      async () => {
        await extractMeetingActionItems({
          organisationId: orgAId,
          meetingId: meetingWithNotesId,
          userId: userReadOnlyNotesId,
          userPermissions: ['meeting.notes.read', 'meeting.edit'], // lacks meeting.action.manage
          apiKey: 'test-key',
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.equal(err.code, 'FORBIDDEN');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  it('6. Rejects meeting with no notes, discussion points, or decisions (HTTP 422 EMPTY_SOURCE_NOTES)', async () => {
    await assert.rejects(
      async () => {
        await extractMeetingActionItems({
          organisationId: orgAId,
          meetingId: meetingEmptyNotesId,
          userId: userOrganiserId,
          userPermissions: [],
          apiKey: 'test-key',
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.equal(err.statusCode, 422);
        assert.ok(err.message.includes('no notes, discussion points, or decisions'));
        return true;
      }
    );
  });

  it('7. Rejects cancelled meeting with HTTP 409 MEETING_CANCELLED', async () => {
    await assert.rejects(
      async () => {
        await extractMeetingActionItems({
          organisationId: orgAId,
          meetingId: cancelledMeetingId,
          userId: userOrganiserId,
          userPermissions: [],
          apiKey: 'test-key',
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

  it('8. Cross-tenant request fails with HTTP 404 MEETING_NOT_FOUND (zero leakage)', async () => {
    await assert.rejects(
      async () => {
        // userCrossTenantId belongs to orgB, attempting to summarize orgA meeting
        await extractMeetingActionItems({
          organisationId: orgBId,
          meetingId: meetingWithNotesId,
          userId: userCrossTenantId,
          userPermissions: [],
          apiKey: 'test-key',
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

  it('9. Candidate assignee matching leaves inactive or cross-tenant members unresolved', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                candidateActionItems: [
                  {
                    title: 'Suspended member task',
                    description: '',
                    priority: 'medium',
                    suggestedDueDate: null,
                    suggestedAssigneeName: 'Inactive Member', // suspended member in orgA
                  },
                  {
                    title: 'Cross tenant task',
                    description: '',
                    priority: 'medium',
                    suggestedDueDate: null,
                    suggestedAssigneeName: 'Cross Tenant Member', // member only in orgB
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      }),
    });

    const res = await extractMeetingActionItems({
      organisationId: orgAId,
      meetingId: meetingWithNotesId,
      userId: userOrganiserId,
      userPermissions: [],
      apiKey: 'test-key',
      fetchFn: mockFetch,
    });

    assert.equal(res.candidateActionItems.length, 2);

    // Both should be unresolved (suggestedAssignee: null) because neither is active in orgA
    assert.equal(res.candidateActionItems[0].suggestedAssignee, null);
    assert.equal(res.candidateActionItems[1].suggestedAssignee, null);
  });

  it('10. Persistence via standard createMeetingActionItem saves item and rejects inactive assignee', async () => {
    // 10a. Valid save with active member Sarah Connor
    const saved = await createMeetingActionItem(
      orgAId,
      meetingWithNotesId,
      {
        title: 'Deploy database migration 41 to staging',
        description: 'Verified active assignee save',
        assigneeId: userSarahConnorId,
        priority: 'high',
        dueDate: '2026-10-30',
      },
      userOrganiserId,
      []
    );

    assert.ok(saved);
    assert.equal(saved.title, 'Deploy database migration 41 to staging');
    assert.equal(saved.assigneeId, userSarahConnorId);
    assert.equal(saved.priority, 'high');

    // 10b. Rejection when attempting to assign inactive member
    await assert.rejects(
      async () => {
        await createMeetingActionItem(
          orgAId,
          meetingWithNotesId,
          {
            title: 'Attempt inactive assignment',
            assigneeId: userInactiveMemberId,
            priority: 'medium',
          },
          userOrganiserId,
          []
        );
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.details, 'INVALID_ASSIGNEE');
        return true;
      }
    );

    // 10c. Rejection when attempting to assign cross-tenant user
    await assert.rejects(
      async () => {
        await createMeetingActionItem(
          orgAId,
          meetingWithNotesId,
          {
            title: 'Attempt cross-tenant assignment',
            assigneeId: userCrossTenantId,
            priority: 'medium',
          },
          userOrganiserId,
          []
        );
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.details, 'INVALID_ASSIGNEE');
        return true;
      }
    );
  });
});
