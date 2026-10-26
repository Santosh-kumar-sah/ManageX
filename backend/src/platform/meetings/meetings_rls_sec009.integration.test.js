/**
 * ManageX Integration Test Suite: SEC-009 Meetings RLS Enforcement
 *
 * Strictly tests:
 * 1. PostgreSQL Row-Level Security on `meeting_attendees` and `meeting_agenda_items` under `managex_app`.
 * 2. Elimination of legacy `app.current_is_platform_admin` bypass.
 * 3. Strict tenant isolation across SELECT, INSERT, UPDATE, DELETE.
 * 4. RLS `WITH CHECK` rejection of cross-tenant row assignment.
 * 5. Preservation of same-tenant meeting workflows (attendees, RSVPs, agendas, reordering).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { getPool } from '../database/pool.js';
import { hashPassword } from '../auth/passwords.js';

describe('SEC-009 — Meetings Attendees & Agenda RLS Security Suite (managex_test)', () => {
  const runTag = `rls_sec009_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let userAId;
  let userBId;
  let orgAId;
  let orgBId;
  let meetingAId;
  let meetingBId;
  let attendeeAId;
  let agendaItemAId;

  before(async () => {
    // 1. Verify safe isolated test database at migration 040
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

    // 2. Create run-unique users and organisations without destructive deletions
    const passwordHash = await hashPassword('SecurePass123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
         VALUES 
           ('RLS User A', 'rls_user_a_${runTag}@managex.local', $1, 'active', NOW()),
           ('RLS User B', 'rls_user_b_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [passwordHash]
      );
      return res.rows;
    });

    userAId = users.find((u) => u.email.startsWith('rls_user_a_')).id;
    userBId = users.find((u) => u.email.startsWith('rls_user_b_')).id;

    // Create Org A and Org B
    const orgs = await withSystemTransaction(async (client) => {
      const resA = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Org A ${runTag}`, `org-a-${runTag}`]
      );
      const resB = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Org B ${runTag}`, `org-b-${runTag}`]
      );
      return { orgAId: resA.rows[0].id, orgBId: resB.rows[0].id };
    });

    orgAId = orgs.orgAId;
    orgBId = orgs.orgBId;

    // Add memberships
    await withSystemTransaction(async (client) => {
      await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active'), ($3, $4, 'active')`,
        [orgAId, userAId, orgBId, userBId]
      );
    });

    // Create Meeting in Org A under Org A tenant context
    await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
      const meetARes = await client.query(
        `INSERT INTO meetings (
           organisation_id, title, start_at, end_at, timezone, location_type, visibility, status, organiser_id, created_by_id
         ) VALUES (
           $1, 'Meeting Org A', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', 'UTC', 'virtual', 'organisation', 'scheduled', $2, $2
         ) RETURNING id`,
        [orgAId, userAId]
      );
      meetingAId = meetARes.rows[0].id;
    });

    // Create Meeting in Org B under Org B tenant context
    await withTenantTransaction({ organisationId: orgBId, userId: userBId }, async (client) => {
      const meetBRes = await client.query(
        `INSERT INTO meetings (
           organisation_id, title, start_at, end_at, timezone, location_type, visibility, status, organiser_id, created_by_id
         ) VALUES (
           $1, 'Meeting Org B', NOW() + INTERVAL '2 day', NOW() + INTERVAL '2 day 1 hour', 'UTC', 'virtual', 'organisation', 'scheduled', $2, $2
         ) RETURNING id`,
        [orgBId, userBId]
      );
      meetingBId = meetBRes.rows[0].id;
    });

    // Insert Initial Attendee and Agenda Item in Org A under Org A tenant context
    await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
      const attARes = await client.query(
        `INSERT INTO meeting_attendees (organisation_id, meeting_id, user_id, role, rsvp_status)
         VALUES ($1, $2, $3, 'organiser', 'accepted')
         RETURNING id`,
        [orgAId, meetingAId, userAId]
      );
      attendeeAId = attARes.rows[0].id;

      const agendaARes = await client.query(
        `INSERT INTO meeting_agenda_items (organisation_id, meeting_id, title, duration_minutes, order_index, created_by_id)
         VALUES ($1, $2, 'Agenda Item 1', 20, 1, $3)
         RETURNING id`,
        [orgAId, meetingAId, userAId]
      );
      agendaItemAId = agendaARes.rows[0].id;
    });
  });

  after(async () => {
    // Clean up only run-unique records created by this test run
    if (orgAId) {
      await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
        await client.query('DELETE FROM meeting_agenda_items WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM meeting_attendees WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM meetings WHERE organisation_id = $1', [orgAId]);
      });
    }
    if (orgBId) {
      await withTenantTransaction({ organisationId: orgBId, userId: userBId }, async (client) => {
        await client.query('DELETE FROM meeting_agenda_items WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM meeting_attendees WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM meetings WHERE organisation_id = $1', [orgBId]);
      });
    }
    await withSystemTransaction(async (client) => {
      if (orgAId) await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgAId]);
      if (orgBId) await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgBId]);
      if (orgAId) await client.query('DELETE FROM organisations WHERE id = $1', [orgAId]);
      if (orgBId) await client.query('DELETE FROM organisations WHERE id = $1', [orgBId]);
      if (userAId) await client.query('DELETE FROM users WHERE id = $1', [userAId]);
      if (userBId) await client.query('DELETE FROM users WHERE id = $1', [userBId]);
    });
  });

  it('1. Database runtime role is managex_app with NOBYPASSRLS', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
      const userRes = await client.query('SELECT current_user');
      assert.equal(userRes.rows[0].current_user, 'managex_app');

      const roleRes = await client.query(
        "SELECT rolbypassrls FROM pg_roles WHERE rolname = 'managex_app'"
      );
      assert.equal(roleRes.rows[0].rolbypassrls, false, 'managex_app must strictly have NOBYPASSRLS');
    });
  });

  it('2. Tenant A transaction can SELECT, INSERT, UPDATE, and DELETE its own meetings, attendees, and agenda items', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
      // 0. SELECT and UPDATE own root meeting
      const selMeeting = await client.query('SELECT * FROM meetings WHERE id = $1', [meetingAId]);
      assert.equal(selMeeting.rows.length, 1);
      assert.equal(selMeeting.rows[0].organisation_id, orgAId);

      const updMeeting = await client.query(
        'UPDATE meetings SET description = $1 WHERE id = $2 RETURNING id, description',
        ['Updated in tenant A', meetingAId]
      );
      assert.equal(updMeeting.rows.length, 1);
      assert.equal(updMeeting.rows[0].description, 'Updated in tenant A');

      // 1. SELECT own attendee
      const selAtt = await client.query(
        'SELECT * FROM meeting_attendees WHERE id = $1',
        [attendeeAId]
      );
      assert.equal(selAtt.rows.length, 1);
      assert.equal(selAtt.rows[0].organisation_id, orgAId);

      // 2. INSERT second attendee in Org A
      const insAtt = await client.query(
        `INSERT INTO meeting_attendees (organisation_id, meeting_id, external_email, role, rsvp_status)
         VALUES ($1, $2, 'external_${runTag}@example.com', 'participant', 'pending')
         RETURNING id`,
        [orgAId, meetingAId]
      );
      assert.equal(insAtt.rows.length, 1);
      const newAttId = insAtt.rows[0].id;

      // 3. UPDATE second attendee in Org A
      const updAtt = await client.query(
        `UPDATE meeting_attendees SET rsvp_status = 'accepted' WHERE id = $1 RETURNING id, rsvp_status`,
        [newAttId]
      );
      assert.equal(updAtt.rows.length, 1);
      assert.equal(updAtt.rows[0].rsvp_status, 'accepted');

      // 4. DELETE second attendee in Org A
      const delAtt = await client.query(
        'DELETE FROM meeting_attendees WHERE id = $1 RETURNING id',
        [newAttId]
      );
      assert.equal(delAtt.rows.length, 1);

      // 5. SELECT own agenda item
      const selAgenda = await client.query(
        'SELECT * FROM meeting_agenda_items WHERE id = $1',
        [agendaItemAId]
      );
      assert.equal(selAgenda.rows.length, 1);
      assert.equal(selAgenda.rows[0].organisation_id, orgAId);

      // 6. INSERT second agenda item in Org A
      const insAgenda = await client.query(
        `INSERT INTO meeting_agenda_items (organisation_id, meeting_id, title, duration_minutes, order_index, created_by_id)
         VALUES ($1, $2, 'Topic 2', 15, 2, $3)
         RETURNING id`,
        [orgAId, meetingAId, userAId]
      );
      assert.equal(insAgenda.rows.length, 1);
      const newAgendaId = insAgenda.rows[0].id;

      // 7. UPDATE second agenda item in Org A
      const updAgenda = await client.query(
        'UPDATE meeting_agenda_items SET duration_minutes = 30 WHERE id = $1 RETURNING id, duration_minutes',
        [newAgendaId]
      );
      assert.equal(updAgenda.rows.length, 1);
      assert.equal(updAgenda.rows[0].duration_minutes, 30);

      // 8. DELETE second agenda item in Org A
      const delAgenda = await client.query(
        'DELETE FROM meeting_agenda_items WHERE id = $1 RETURNING id',
        [newAgendaId]
      );
      assert.equal(delAgenda.rows.length, 1);
    });
  });

  it('3. Tenant B transaction cannot read, update, or delete Tenant A meetings, attendees, or agenda items', async () => {
    await withTenantTransaction({ organisationId: orgBId, userId: userBId }, async (client) => {
      // 0. Attempt SELECT Org A root meeting from Org B context -> 0 rows
      const meetRes = await client.query('SELECT * FROM meetings WHERE id = $1', [meetingAId]);
      assert.equal(meetRes.rows.length, 0, 'RLS must return 0 rows for foreign tenant root meeting');

      // Attempt UPDATE Org A root meeting from Org B context -> 0 rows
      const updMeet = await client.query(
        "UPDATE meetings SET title = 'Hacked Root' WHERE id = $1 RETURNING id",
        [meetingAId]
      );
      assert.equal(updMeet.rows.length, 0, 'RLS must not update foreign tenant root meeting');

      // Attempt DELETE Org A root meeting from Org B context -> 0 rows
      const delMeet = await client.query('DELETE FROM meetings WHERE id = $1 RETURNING id', [meetingAId]);
      assert.equal(delMeet.rows.length, 0, 'RLS must not delete foreign tenant root meeting');

      // 1. Attempt SELECT Org A attendee from Org B context -> 0 rows
      const attRes = await client.query(
        'SELECT * FROM meeting_attendees WHERE id = $1',
        [attendeeAId]
      );
      assert.equal(attRes.rows.length, 0, 'RLS must return 0 rows for foreign tenant attendee');

      // 2. Attempt UPDATE Org A attendee from Org B context -> 0 rows updated
      const updAtt = await client.query(
        "UPDATE meeting_attendees SET rsvp_status = 'declined' WHERE id = $1 RETURNING id",
        [attendeeAId]
      );
      assert.equal(updAtt.rows.length, 0, 'RLS must not update foreign tenant attendee');

      // 3. Attempt DELETE Org A attendee from Org B context -> 0 rows deleted
      const delAtt = await client.query(
        'DELETE FROM meeting_attendees WHERE id = $1 RETURNING id',
        [attendeeAId]
      );
      assert.equal(delAtt.rows.length, 0, 'RLS must not delete foreign tenant attendee');

      // 4. Attempt SELECT Org A agenda item from Org B context -> 0 rows
      const agendaRes = await client.query(
        'SELECT * FROM meeting_agenda_items WHERE id = $1',
        [agendaItemAId]
      );
      assert.equal(agendaRes.rows.length, 0, 'RLS must return 0 rows for foreign tenant agenda item');

      // 5. Attempt UPDATE Org A agenda item from Org B context -> 0 rows updated
      const updAgenda = await client.query(
        "UPDATE meeting_agenda_items SET title = 'Hacked' WHERE id = $1 RETURNING id",
        [agendaItemAId]
      );
      assert.equal(updAgenda.rows.length, 0, 'RLS must not update foreign tenant agenda item');

      // 6. Attempt DELETE Org A agenda item from Org B context -> 0 rows deleted
      const delAgenda = await client.query(
        'DELETE FROM meeting_agenda_items WHERE id = $1 RETURNING id',
        [agendaItemAId]
      );
      assert.equal(delAgenda.rows.length, 0, 'RLS must not delete foreign tenant agenda item');
    });
  });

  it('4. Missing or empty tenant context fails closed (0 rows visible to managex_app)', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Intentionally do NOT set app.current_organisation_id
      await client.query("SELECT set_config('app.current_organisation_id', '', true)");

      const meetRes = await client.query('SELECT * FROM meetings WHERE id = $1', [meetingAId]);
      assert.equal(meetRes.rows.length, 0, 'Missing tenant context must yield 0 root meeting rows');

      const attRes = await client.query('SELECT * FROM meeting_attendees WHERE id = $1', [attendeeAId]);
      assert.equal(attRes.rows.length, 0, 'Missing tenant context must yield 0 attendee rows');

      const agendaRes = await client.query('SELECT * FROM meeting_agenda_items WHERE id = $1', [agendaItemAId]);
      assert.equal(agendaRes.rows.length, 0, 'Missing tenant context must yield 0 agenda rows');

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('5. RLS WITH CHECK rejects inserting rows under another organisation', async () => {
    // Attempt to insert a root meeting with organisation_id = orgBId while transaction context is orgAId
    let meetingCheckFailed = false;
    try {
      await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
        await client.query(
          `INSERT INTO meetings (
             organisation_id, title, start_at, end_at, timezone, location_type, visibility, status, organiser_id, created_by_id
           ) VALUES (
             $1, 'Cross-Org Meeting', NOW(), NOW() + INTERVAL '1 hour', 'UTC', 'virtual', 'organisation', 'scheduled', $2, $2
           )`,
          [orgBId, userAId]
        );
      });
    } catch (err) {
      meetingCheckFailed = true;
      assert.equal(err.code, '42501', 'Expected RLS WITH CHECK violation (code 42501)');
    }
    assert.ok(meetingCheckFailed, 'RLS WITH CHECK must reject root meeting insert under foreign organisation_id');

    // Attempt to insert an attendee with organisation_id = orgBId while transaction context is orgAId
    let attCheckFailed = false;
    try {
      await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
        await client.query(
          `INSERT INTO meeting_attendees (organisation_id, meeting_id, external_email, role, rsvp_status)
           VALUES ($1, $2, 'cross_org_${runTag}@example.com', 'participant', 'pending')`,
          [orgBId, meetingBId]
        );
      });
    } catch (err) {
      attCheckFailed = true;
      // PostgreSQL error code 42501 = insufficient_privilege (raised by RLS WITH CHECK violations)
      assert.equal(err.code, '42501', 'Expected RLS WITH CHECK violation (code 42501)');
    }
    assert.ok(attCheckFailed, 'RLS WITH CHECK must reject attendee insert under foreign organisation_id');

    // Attempt to insert an agenda item with organisation_id = orgBId while transaction context is orgAId
    let agendaCheckFailed = false;
    try {
      await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
        await client.query(
          `INSERT INTO meeting_agenda_items (organisation_id, meeting_id, title, duration_minutes, order_index, created_by_id)
           VALUES ($1, $2, 'Cross-Org Topic', 10, 1, $3)`,
          [orgBId, meetingBId, userAId]
        );
      });
    } catch (err) {
      agendaCheckFailed = true;
      assert.equal(err.code, '42501', 'Expected RLS WITH CHECK violation (code 42501)');
    }
    assert.ok(agendaCheckFailed, 'RLS WITH CHECK must reject agenda insert under foreign organisation_id');
  });

  it('6. RLS WITH CHECK rejects updating organisation_id to another organisation', async () => {
    // Attempt to update meetingAId organisation_id from orgAId to orgBId
    let meetingUpdateFailed = false;
    try {
      await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
        await client.query(
          'UPDATE meetings SET organisation_id = $1 WHERE id = $2',
          [orgBId, meetingAId]
        );
      });
    } catch (err) {
      meetingUpdateFailed = true;
      assert.equal(err.code, '42501', 'Expected RLS WITH CHECK violation (code 42501)');
    }
    assert.ok(meetingUpdateFailed, 'RLS WITH CHECK must reject updating root meeting to foreign organisation_id');

    // Attempt to update attendeeAId organisation_id from orgAId to orgBId
    let attUpdateFailed = false;
    try {
      await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
        await client.query(
          'UPDATE meeting_attendees SET organisation_id = $1 WHERE id = $2',
          [orgBId, attendeeAId]
        );
      });
    } catch (err) {
      attUpdateFailed = true;
      // PostgreSQL error code 42501 = insufficient_privilege (raised by RLS WITH CHECK violations)
      assert.equal(err.code, '42501', 'Expected RLS WITH CHECK violation (code 42501)');
    }
    assert.ok(attUpdateFailed, 'RLS WITH CHECK must reject updating attendee to foreign organisation_id');

    // Attempt to update agendaItemAId organisation_id from orgAId to orgBId
    let agendaUpdateFailed = false;
    try {
      await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
        await client.query(
          'UPDATE meeting_agenda_items SET organisation_id = $1 WHERE id = $2',
          [orgBId, agendaItemAId]
        );
      });
    } catch (err) {
      agendaUpdateFailed = true;
      assert.equal(err.code, '42501', 'Expected RLS WITH CHECK violation (code 42501)');
    }
    assert.ok(agendaUpdateFailed, 'RLS WITH CHECK must reject updating agenda item to foreign organisation_id');
  });

  it('7. SEC-009: Platform-admin context alone does NOT bypass tenant isolation for meetings, attendees, or agenda items', async () => {
    // 1. Setting isPlatformAdmin: true without organisationId
    await withTenantTransaction({ organisationId: null, isPlatformAdmin: true }, async (client) => {
      const meetRes = await client.query('SELECT * FROM meetings WHERE id = $1', [meetingAId]);
      assert.equal(
        meetRes.rows.length,
        0,
        'Platform admin context without organisationId must NOT bypass root meeting RLS'
      );

      const attRes = await client.query('SELECT * FROM meeting_attendees WHERE id = $1', [attendeeAId]);
      assert.equal(
        attRes.rows.length,
        0,
        'Platform admin context without organisationId must NOT bypass attendee RLS'
      );

      const agendaRes = await client.query('SELECT * FROM meeting_agenda_items WHERE id = $1', [agendaItemAId]);
      assert.equal(
        agendaRes.rows.length,
        0,
        'Platform admin context without organisationId must NOT bypass agenda RLS'
      );
    });

    // 2. Setting isPlatformAdmin: true with Org B context cannot see or mutate Org A records
    await withTenantTransaction({ organisationId: orgBId, isPlatformAdmin: true }, async (client) => {
      const meetRes = await client.query('SELECT * FROM meetings WHERE id = $1', [meetingAId]);
      assert.equal(
        meetRes.rows.length,
        0,
        'Platform admin in Org B context must NOT see Org A root meeting'
      );

      const updMeet = await client.query(
        "UPDATE meetings SET title = 'Admin Root Tamper' WHERE id = $1 RETURNING id",
        [meetingAId]
      );
      assert.equal(updMeet.rows.length, 0, 'Platform admin in Org B context must NOT update Org A root meeting');

      const attRes = await client.query('SELECT * FROM meeting_attendees WHERE id = $1', [attendeeAId]);
      assert.equal(
        attRes.rows.length,
        0,
        'Platform admin in Org B context must NOT see Org A attendee'
      );

      const updAtt = await client.query(
        "UPDATE meeting_attendees SET rsvp_status = 'declined' WHERE id = $1 RETURNING id",
        [attendeeAId]
      );
      assert.equal(updAtt.rows.length, 0, 'Platform admin in Org B context must NOT update Org A attendee');

      const agendaRes = await client.query('SELECT * FROM meeting_agenda_items WHERE id = $1', [agendaItemAId]);
      assert.equal(
        agendaRes.rows.length,
        0,
        'Platform admin in Org B context must NOT see Org A agenda item'
      );

      const updAgenda = await client.query(
        "UPDATE meeting_agenda_items SET title = 'Admin Tamper' WHERE id = $1 RETURNING id",
        [agendaItemAId]
      );
      assert.equal(updAgenda.rows.length, 0, 'Platform admin in Org B context must NOT update Org A agenda item');
    });
  });

  it('8. Same-tenant meeting workflows (attendees, RSVPs, agendas, reordering) continue working cleanly', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: userAId }, async (client) => {
      // Add new agenda item
      const item2Res = await client.query(
        `INSERT INTO meeting_agenda_items (organisation_id, meeting_id, title, duration_minutes, order_index, created_by_id)
         VALUES ($1, $2, 'Topic 2 Ordered', 10, 2, $3)
         RETURNING id, order_index`,
        [orgAId, meetingAId, userAId]
      );
      assert.equal(item2Res.rows[0].order_index, 2);
      const item2Id = item2Res.rows[0].id;

      // Reorder items: item2 -> order 1, agendaItemAId -> order 2
      await client.query(
        'UPDATE meeting_agenda_items SET order_index = 1 WHERE id = $1 AND organisation_id = $2',
        [item2Id, orgAId]
      );
      await client.query(
        'UPDATE meeting_agenda_items SET order_index = 2 WHERE id = $1 AND organisation_id = $2',
        [agendaItemAId, orgAId]
      );

      const reordered = await client.query(
        'SELECT id, order_index FROM meeting_agenda_items WHERE meeting_id = $1 ORDER BY order_index ASC',
        [meetingAId]
      );
      assert.equal(reordered.rows.length, 2);
      assert.equal(reordered.rows[0].id, item2Id);
      assert.equal(reordered.rows[0].order_index, 1);
      assert.equal(reordered.rows[1].id, agendaItemAId);
      assert.equal(reordered.rows[1].order_index, 2);
    });
  });
});
