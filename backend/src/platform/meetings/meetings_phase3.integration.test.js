/**
 * ManageX Integration Test Suite: Phase 3 Security, Audit & Concurrent Editing
 *
 * Strictly tests:
 * 1. Meeting notes optimistic locking (stale write rejection, CONCURRENT_MODIFICATION 409, backward compatibility).
 * 2. Concurrency-safe locking preventing lost updates during simultaneous saves.
 * 3. Confidential notes access denial audit logging (meeting.notes_access_denied, zero body leakage).
 * 4. Action-item lifecycle enforcement (assignee field restrictions, terminal states 'done' and 'cancelled').
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import {
  upsertMeetingNotes,
  getMeetingNotes,
  createMeetingActionItem,
  updateMeetingActionItem,
  deleteMeetingActionItem,
} from './meetingService.js';
import { ConflictError, AuthorizationError } from '../common/errors.js';

describe('Phase 3 — Security, Audit & Concurrent Editing Suite (managex_test)', () => {
  const runTag = `p3_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let organiserId;
  let attendeeId;
  let orgId;
  let meetingId;

  before(async () => {
    // 1. Verify safe isolated test database
    await withSystemTransaction(async (client) => {
      const dbRes = await client.query('SELECT current_database() AS name');
      if (dbRes.rows[0].name !== 'managex_test') {
        throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbRes.rows[0].name}`);
      }

      const migRes = await client.query(
        "SELECT version FROM schema_migrations WHERE version = '20261017000040'"
      );
      if (migRes.rowCount !== 1) {
        throw new Error('Test requires managex_test at migration 20261017000040.');
      }
    });

    // 2. Create users and organisation
    const passwordHash = await hashPassword('SecurePass123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
         VALUES 
           ('P3 Organiser', 'p3_org_${runTag}@managex.local', $1, 'active', NOW()),
           ('P3 Attendee', 'p3_att_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [passwordHash]
      );
      return res.rows;
    });

    organiserId = users.find((u) => u.email.startsWith('p3_org_')).id;
    attendeeId = users.find((u) => u.email.startsWith('p3_att_')).id;

    const orgRes = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Org P3 ${runTag}`, `org-p3-${runTag}`]
      );
      return res.rows[0];
    });
    orgId = orgRes.id;

    // Add memberships
    await withSystemTransaction(async (client) => {
      await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active'), ($1, $3, 'active')`,
        [orgId, organiserId, attendeeId]
      );
    });

    // Create Meeting in Org under tenant transaction
    await withTenantTransaction({ organisationId: orgId, userId: organiserId }, async (client) => {
      const meetRes = await client.query(
        `INSERT INTO meetings (
           organisation_id, title, start_at, end_at, timezone, location_type, visibility, status, organiser_id, created_by_id
         ) VALUES (
           $1, 'P3 Governance Meeting', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', 'UTC', 'virtual', 'organisation', 'scheduled', $2, $2
         ) RETURNING id`,
        [orgId, organiserId]
      );
      meetingId = meetRes.rows[0].id;

      // Add attendee record
      await client.query(
        `INSERT INTO meeting_attendees (organisation_id, meeting_id, user_id, role, rsvp_status)
         VALUES ($1, $2, $3, 'participant', 'accepted')`,
        [orgId, meetingId, attendeeId]
      );
    });
  });

  after(async () => {
    if (orgId) {
      await withTenantTransaction({ organisationId: orgId, userId: organiserId }, async (client) => {
        await client.query('DELETE FROM meeting_action_items WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM meeting_notes WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM meeting_attendees WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM meetings WHERE organisation_id = $1', [orgId]);
      });
      await withSystemTransaction(async (client) => {
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgId]);
        await client.query('DELETE FROM organisations WHERE id = $1', [orgId]);
        if (organiserId) await client.query('DELETE FROM users WHERE id = $1', [organiserId]);
        if (attendeeId) await client.query('DELETE FROM users WHERE id = $1', [attendeeId]);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Optimistic Locking Tests
  // ---------------------------------------------------------------------------

  it('1. Initial notes creation succeeds without expectedUpdatedAt and returns persisted updatedAt', async () => {
    const saved = await upsertMeetingNotes(
      orgId,
      meetingId,
      'Initial meeting notes v1',
      organiserId,
      ['meeting.notes.manage']
    );

    assert.ok(saved.id, 'Notes should have an ID');
    assert.equal(saved.content, 'Initial meeting notes v1');
    assert.ok(saved.updatedAt, 'Saved notes must return persisted updatedAt');
  });

  it('2. Fresh update with valid matching expectedUpdatedAt succeeds and updates timestamp', async () => {
    const initial = await getMeetingNotes(orgId, meetingId, organiserId, ['meeting.notes.read']);
    assert.ok(initial.notes);
    const initialUpdatedAt = initial.notes.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 20));

    const updated = await upsertMeetingNotes(
      orgId,
      meetingId,
      'Updated meeting notes v2',
      organiserId,
      ['meeting.notes.manage'],
      { expectedUpdatedAt: initialUpdatedAt }
    );

    assert.equal(updated.content, 'Updated meeting notes v2');
    assert.notEqual(updated.updatedAt, initialUpdatedAt, 'updatedAt must advance after modification');
  });

  it('3. Stale update with outdated expectedUpdatedAt is rejected with 409 CONCURRENT_MODIFICATION', async () => {
    const current = await getMeetingNotes(orgId, meetingId, organiserId, ['meeting.notes.read']);
    const staleTimestamp = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

    let conflictThrown = false;
    try {
      await upsertMeetingNotes(
        orgId,
        meetingId,
        'Malicious or stale overwrite attempt',
        organiserId,
        ['meeting.notes.manage'],
        { expectedUpdatedAt: staleTimestamp }
      );
    } catch (err) {
      conflictThrown = true;
      assert.ok(err instanceof ConflictError, 'Error must be an instance of ConflictError');
      assert.equal(err.code, 'CONCURRENT_MODIFICATION');
      assert.equal(err.statusCode, 409);
      assert.ok(err.details?.currentUpdatedAt, 'Details must include currentUpdatedAt');
    }

    assert.ok(conflictThrown, 'Stale write must throw ConflictError with CONCURRENT_MODIFICATION');

    // Verify notes content was NOT overwritten
    const checkNotes = await getMeetingNotes(orgId, meetingId, organiserId, ['meeting.notes.read']);
    assert.equal(checkNotes.notes.content, current.notes.content, 'Persisted content must remain intact');
  });

  it('4. Backward compatibility: update without expectedUpdatedAt succeeds', async () => {
    const updated = await upsertMeetingNotes(
      orgId,
      meetingId,
      'Compatible update without expectedUpdatedAt',
      organiserId,
      ['meeting.notes.manage']
    );

    assert.equal(updated.content, 'Compatible update without expectedUpdatedAt');
  });

  it('5. Concurrent saves: row-level lock safely serializes concurrent updates with optimistic preconditions', async () => {
    const base = await getMeetingNotes(orgId, meetingId, organiserId, ['meeting.notes.read']);
    const baseUpdatedAt = base.notes.updatedAt;

    // Simulate two concurrent clients (User A and User B) both holding baseUpdatedAt
    const saveA = upsertMeetingNotes(
      orgId,
      meetingId,
      'Concurrent update from User A',
      organiserId,
      ['meeting.notes.manage'],
      { expectedUpdatedAt: baseUpdatedAt }
    );

    const saveB = upsertMeetingNotes(
      orgId,
      meetingId,
      'Concurrent update from User B',
      organiserId,
      ['meeting.notes.manage'],
      { expectedUpdatedAt: baseUpdatedAt }
    );

    const results = await Promise.allSettled([saveA, saveB]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed and the other must be rejected with 409 CONCURRENT_MODIFICATION
    assert.equal(fulfilled.length, 1, 'Exactly one concurrent save must succeed');
    assert.equal(rejected.length, 1, 'The competing concurrent save must be rejected');

    const rejectionErr = rejected[0].reason;
    assert.equal(rejectionErr.code, 'CONCURRENT_MODIFICATION');
    assert.equal(rejectionErr.statusCode, 409);
  });

  // ---------------------------------------------------------------------------
  // 2. Audit Confidential Notes Access Denials
  // ---------------------------------------------------------------------------

  it('6. Confidential notes read denial generates meeting.notes_access_denied audit event without leaking content', async () => {
    // Attendee without explicit notes read permission
    let readDenied = false;
    try {
      await getMeetingNotes(orgId, meetingId, attendeeId, []);
    } catch (err) {
      readDenied = true;
      assert.ok(err instanceof AuthorizationError);
      assert.equal(err.code, 'FORBIDDEN_NOTES_ACCESS');
      assert.equal(err.statusCode, 403);
    }
    assert.ok(readDenied, 'Read attempt without permission must fail with 403');

    // Verify audit log entry was recorded
    await withTenantTransaction({ organisationId: orgId, userId: organiserId }, async (client) => {
      const auditRes = await client.query(
        `SELECT * FROM audit_logs 
         WHERE organisation_id = $1 AND action = 'meeting.notes_access_denied' AND actor_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [orgId, attendeeId]
      );
      assert.equal(auditRes.rows.length, 1, 'Audit log entry must exist for read denial');
      const log = auditRes.rows[0];
      assert.equal(log.entity_id, meetingId);
      assert.equal(log.metadata.requestedAction, 'read');
      // Crucial: ensure zero confidential content or leaked keys
      assert.equal(log.metadata.content, undefined);
      assert.equal(log.metadata.notes, undefined);
    });
  });

  it('7. Confidential notes manage denial generates meeting.notes_access_denied audit event', async () => {
    let manageDenied = false;
    try {
      await upsertMeetingNotes(orgId, meetingId, 'Unauthorized write text', attendeeId, []);
    } catch (err) {
      manageDenied = true;
      assert.ok(err instanceof AuthorizationError);
      assert.equal(err.code, 'FORBIDDEN_NOTES_MANAGE');
      assert.equal(err.statusCode, 403);
    }
    assert.ok(manageDenied, 'Manage attempt without permission must fail with 403');

    // Verify audit log entry was recorded
    await withTenantTransaction({ organisationId: orgId, userId: organiserId }, async (client) => {
      const auditRes = await client.query(
        `SELECT * FROM audit_logs 
         WHERE organisation_id = $1 AND action = 'meeting.notes_access_denied' AND actor_id = $2
           AND metadata->>'requestedAction' = 'manage'
         ORDER BY created_at DESC LIMIT 1`,
        [orgId, attendeeId]
      );
      assert.equal(auditRes.rows.length, 1, 'Audit log entry must exist for manage denial');
      const log = auditRes.rows[0];
      assert.equal(log.metadata.requestedAction, 'manage');
      assert.equal(log.metadata.content, undefined, 'Metadata must never leak submitted content');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Action Items Permissions & Terminal State Enforcement
  // ---------------------------------------------------------------------------

  it('8. Action Items: Assignee can update status but is blocked from manager-only fields', async () => {
    // Organiser creates action item assigned to attendee
    const actionItem = await createMeetingActionItem(
      orgId,
      meetingId,
      {
        title: 'Review specifications',
        assigneeId: attendeeId,
        priority: 'high',
      },
      organiserId,
      ['meeting.action.manage']
    );

    // Assignee updates status to in_progress -> should succeed
    const inProgress = await updateMeetingActionItem(
      orgId,
      meetingId,
      actionItem.id,
      { status: 'in_progress' },
      attendeeId,
      []
    );
    assert.equal(inProgress.status, 'in_progress');

    // Assignee attempts to modify title -> blocked with 403 FORBIDDEN_ACTION_FIELD_UPDATE
    let titleUpdateBlocked = false;
    try {
      await updateMeetingActionItem(
        orgId,
        meetingId,
        actionItem.id,
        { title: 'Assignee modified title' },
        attendeeId,
        []
      );
    } catch (err) {
      titleUpdateBlocked = true;
      assert.ok(err instanceof AuthorizationError);
      assert.equal(err.code, 'FORBIDDEN_ACTION_FIELD_UPDATE');
      assert.equal(err.statusCode, 403);
    }
    assert.ok(titleUpdateBlocked, 'Assignee must not update manager-only fields');

    // Assignee marks item done -> should succeed
    const doneItem = await updateMeetingActionItem(
      orgId,
      meetingId,
      actionItem.id,
      { status: 'done' },
      attendeeId,
      []
    );
    assert.equal(doneItem.status, 'done');

    // Reopening done item must fail with 409 ACTION_ITEM_TERMINAL_STATE
    let reopenBlocked = false;
    try {
      await updateMeetingActionItem(
        orgId,
        meetingId,
        actionItem.id,
        { status: 'open' },
        organiserId,
        ['meeting.action.manage']
      );
    } catch (err) {
      reopenBlocked = true;
      assert.ok(err instanceof ConflictError);
      assert.equal(err.code, 'ACTION_ITEM_TERMINAL_STATE');
      assert.equal(err.statusCode, 409);
    }
    assert.ok(reopenBlocked, 'Terminal done action item cannot be reopened');
  });

  it('9. Action Items: Non-manager cannot delete action items', async () => {
    const actionItem = await createMeetingActionItem(
      orgId,
      meetingId,
      {
        title: 'Action to test delete permissions',
        assigneeId: attendeeId,
      },
      organiserId,
      ['meeting.action.manage']
    );

    let deleteBlocked = false;
    try {
      await deleteMeetingActionItem(orgId, meetingId, actionItem.id, attendeeId, []);
    } catch (err) {
      deleteBlocked = true;
      assert.ok(err instanceof AuthorizationError);
      assert.equal(err.code, 'FORBIDDEN');
    }
    assert.ok(deleteBlocked, 'Non-manager must not be able to delete action items');

    // Organiser deletes -> succeeds
    const delRes = await deleteMeetingActionItem(
      orgId,
      meetingId,
      actionItem.id,
      organiserId,
      ['meeting.action.manage']
    );
    assert.equal(delRes.success, true);
  });
});
