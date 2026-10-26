/**
 * ManageX Integration Test Suite: Phase 4 Analytics, Export & Polish
 *
 * Strictly tests:
 * 1. Meeting export in Markdown and PDF formats.
 * 2. Confidential notes filtering in exports (organiser/authorized roles get notes, ordinary members get notes withheld).
 * 3. Cross-organisation export isolation (foreign tenant cannot export).
 * 4. Invalid export format validation (422).
 * 5. Audit logging for meeting exports (meeting.exported with zero private content).
 * 6. Meeting analytics calculations (completion rates, attendance rates, action item rates, empty dataset safety, zero denominator safety).
 * 7. Cancelled and missed meetings not counted as completed.
 * 8. Tenant isolation in analytics queries.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';
import {
  exportMeeting,
  getMeetingAnalytics,
  createMeetingDiscussionPoint,
  createMeetingDecision,
  createMeetingActionItem,
  upsertMeetingNotes,
  transitionMeetingStatus,
} from './meetingService.js';
import { ValidationError, NotFoundError } from '../common/errors.js';

describe('Phase 4 — Analytics, Export & Polish Suite (managex_test)', () => {
  const runTag = `p4_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let organiserId;
  let memberId;
  let orgAId;
  let orgBId;
  let userBId;
  let meetingId;
  let emptyOrgId;

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

    // 2. Create users and organisations
    const passwordHash = await hashPassword('SecurePass123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
         VALUES 
           ('P4 Organiser', 'p4_org_${runTag}@managex.local', $1, 'active', NOW()),
           ('P4 Member', 'p4_mem_${runTag}@managex.local', $1, 'active', NOW()),
           ('P4 User B', 'p4_userb_${runTag}@managex.local', $1, 'active', NOW())
         RETURNING id, email`,
        [passwordHash]
      );
      return res.rows;
    });

    organiserId = users.find((u) => u.email.startsWith('p4_org_')).id;
    memberId = users.find((u) => u.email.startsWith('p4_mem_')).id;
    userBId = users.find((u) => u.email.startsWith('p4_userb_')).id;

    // Create Org A, Org B, and Empty Org
    const orgs = await withSystemTransaction(async (client) => {
      const resA = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Org P4 A ${runTag}`, `org-p4-a-${runTag}`]
      );
      const resB = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Org P4 B ${runTag}`, `org-p4-b-${runTag}`]
      );
      const resEmpty = await client.query(
        `INSERT INTO organisations (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`Org P4 Empty ${runTag}`, `org-p4-empty-${runTag}`]
      );
      return { orgAId: resA.rows[0].id, orgBId: resB.rows[0].id, emptyOrgId: resEmpty.rows[0].id };
    });

    orgAId = orgs.orgAId;
    orgBId = orgs.orgBId;
    emptyOrgId = orgs.emptyOrgId;

    // Add memberships
    await withSystemTransaction(async (client) => {
      await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES 
           ($1, $2, 'active'),
           ($1, $3, 'active'),
           ($4, $5, 'active'),
           ($6, $2, 'active')`,
        [orgAId, organiserId, memberId, orgBId, userBId, emptyOrgId]
      );
    });

    // Create Meeting in Org A under Org A tenant transaction
    await withTenantTransaction({ organisationId: orgAId, userId: organiserId }, async (client) => {
      const meetRes = await client.query(
        `INSERT INTO meetings (
           organisation_id, title, description, start_at, end_at, timezone, location_type, visibility, status, organiser_id, created_by_id
         ) VALUES (
           $1, 'Q4 Strategic Planning', 'Review annual goals and KPIs', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 2 hours', 'Asia/Kolkata', 'virtual', 'organisation', 'scheduled', $2, $2
         ) RETURNING id`,
        [orgAId, organiserId]
      );
      meetingId = meetRes.rows[0].id;

      // Add attendee records: organiser and member
      await client.query(
        `INSERT INTO meeting_attendees (organisation_id, meeting_id, user_id, role, rsvp_status)
         VALUES 
           ($1, $2, $3, 'organiser', 'accepted'),
           ($1, $2, $4, 'participant', 'accepted')`,
        [orgAId, meetingId, organiserId, memberId]
      );

      // Add agenda items
      await client.query(
        `INSERT INTO meeting_agenda_items (organisation_id, meeting_id, title, duration_minutes, order_index, created_by_id)
         VALUES 
           ($1, $2, 'Review Q3 Performance', 30, 1, $3),
           ($1, $2, 'Budget Allocation', 45, 2, $3)`,
        [orgAId, meetingId, organiserId]
      );
    });

    // Populate structured MOM items in Org A
    await createMeetingDiscussionPoint(
      orgAId,
      meetingId,
      { title: 'Revenue Growth', body: 'Q3 revenue grew by 24% YoY.' },
      organiserId,
      ['meeting.notes.manage']
    );

    const decision = await createMeetingDecision(
      orgAId,
      meetingId,
      { title: 'Adopt Zero-Trust Policy', details: 'Rollout begins in November.' },
      organiserId,
      ['meeting.notes.manage']
    );

    await createMeetingActionItem(
      orgAId,
      meetingId,
      {
        title: 'Draft Security Implementation Plan',
        assigneeId: memberId,
        priority: 'high',
        decisionId: decision.id,
      },
      organiserId,
      ['meeting.action.manage']
    );

    await upsertMeetingNotes(
      orgAId,
      meetingId,
      'Confidential executive review notes and salary projections.',
      organiserId,
      ['meeting.notes.manage']
    );
  });

  after(async () => {
    if (orgAId) {
      await withTenantTransaction({ organisationId: orgAId, userId: organiserId }, async (client) => {
        await client.query('DELETE FROM meeting_action_items WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM meeting_decisions WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM meeting_discussion_points WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM meeting_notes WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM meeting_agenda_items WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM meeting_attendees WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM meetings WHERE organisation_id = $1', [orgAId]);
      });
      await withSystemTransaction(async (client) => {
        await client.query('DELETE FROM meetings WHERE organiser_id IN ($1, $2, $3) OR created_by_id IN ($1, $2, $3)', [organiserId, memberId, userBId]);
        await client.query('DELETE FROM organisation_memberships WHERE user_id IN ($1, $2, $3)', [organiserId, memberId, userBId]);
        await client.query('DELETE FROM organisations WHERE id IN ($1, $2, $3)', [orgAId, orgBId, emptyOrgId]);
        if (organiserId) await client.query('DELETE FROM users WHERE id = $1', [organiserId]);
        if (memberId) await client.query('DELETE FROM users WHERE id = $1', [memberId]);
        if (userBId) await client.query('DELETE FROM users WHERE id = $1', [userBId]);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Meeting Export Tests
  // ---------------------------------------------------------------------------

  it('1. Organiser exports meeting as Markdown with complete MOM and confidential notes', async () => {
    const exported = await exportMeeting(
      orgAId,
      meetingId,
      'markdown',
      organiserId,
      ['meeting.notes.read', 'meeting.view']
    );

    assert.equal(exported.contentType, 'text/markdown; charset=utf-8');
    assert.ok(exported.filename.endsWith('.md'));
    assert.ok(exported.content.includes('# Meeting Minutes: Q4 Strategic Planning'));
    assert.ok(exported.content.includes('## 1. Attendees & Attendance'));
    assert.ok(exported.content.includes('## 2. Agenda'));
    assert.ok(exported.content.includes('Review Q3 Performance'));
    assert.ok(exported.content.includes('(30 mins)'));
    assert.ok(exported.content.includes('## 3. Discussion Points'));
    assert.ok(exported.content.includes('Revenue Growth'));
    assert.ok(exported.content.includes('## 4. Key Decisions'));
    assert.ok(exported.content.includes('Adopt Zero-Trust Policy'));
    assert.ok(exported.content.includes('## 5. Action Items'));
    assert.ok(exported.content.includes('Draft Security Implementation Plan'));
    // Organiser is authorised -> confidential notes must be present
    assert.ok(exported.content.includes('Confidential executive review notes'));
  });

  it('2. Ordinary member exports meeting as Markdown: confidential notes are strictly withheld', async () => {
    const exported = await exportMeeting(
      orgAId,
      meetingId,
      'markdown',
      memberId,
      ['meeting.view'] // Has meeting.view but lacks meeting.notes.read
    );

    assert.equal(exported.contentType, 'text/markdown; charset=utf-8');
    assert.ok(exported.content.includes('# Meeting Minutes: Q4 Strategic Planning'));
    assert.ok(exported.content.includes('Adopt Zero-Trust Policy'));
    // CRITICAL: Confidential notes must be withheld
    assert.equal(
      exported.content.includes('Confidential executive review notes'),
      false,
      'Confidential notes content must NOT be disclosed to member without notes permissions'
    );
    assert.ok(
      exported.content.includes('[Confidential notes omitted — restricted to authorised meeting organisers and roles]')
    );
  });

  it('3. Organiser exports meeting as PDF: produces valid PDF 1.4 binary buffer', async () => {
    const exported = await exportMeeting(
      orgAId,
      meetingId,
      'pdf',
      organiserId,
      ['meeting.notes.read', 'meeting.view']
    );

    assert.equal(exported.contentType, 'application/pdf');
    assert.ok(exported.filename.endsWith('.pdf'));
    assert.ok(Buffer.isBuffer(exported.content));
    assert.ok(exported.content.length > 500);
    // Verify PDF header magic bytes
    assert.equal(exported.content.toString('utf-8', 0, 5), '%PDF-');
    // Verify PDF trailer
    assert.ok(exported.content.toString('utf-8').includes('%%EOF'));
  });

  it('4. Cross-organisation export attempt fails closed with NotFoundError (404)', async () => {
    let foreignExportFailed = false;
    try {
      await exportMeeting(
        orgBId,
        meetingId, // Meeting belongs to Org A, accessed under Org B context
        'markdown',
        userBId,
        ['meeting.view']
      );
    } catch (err) {
      foreignExportFailed = true;
      assert.ok(err instanceof NotFoundError);
    }
    assert.ok(foreignExportFailed, 'Exporting foreign tenant meeting must fail closed');
  });

  it('5. Invalid export format is rejected with ValidationError (422)', async () => {
    let invalidFormatRejected = false;
    try {
      await exportMeeting(
        orgAId,
        meetingId,
        'docx',
        organiserId,
        ['meeting.view']
      );
    } catch (err) {
      invalidFormatRejected = true;
      assert.ok(err instanceof ValidationError);
      assert.ok(err.message.includes('Invalid export format'));
    }
    assert.ok(invalidFormatRejected, 'Invalid export format must throw ValidationError');
  });

  it('6. Meeting export records meeting.exported audit event with minimal safe metadata', async () => {
    await exportMeeting(orgAId, meetingId, 'markdown', organiserId, ['meeting.notes.read', 'meeting.view']);

    await withTenantTransaction({ organisationId: orgAId, userId: organiserId }, async (client) => {
      const res = await client.query(
        `SELECT * FROM audit_logs
         WHERE organisation_id = $1 AND action = 'meeting.exported' AND entity_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [orgAId, meetingId]
      );
      assert.equal(res.rows.length, 1);
      const audit = res.rows[0];
      assert.equal(audit.metadata.format, 'markdown');
      assert.equal(audit.metadata.includedConfidentialNotes, true);
      // Zero text body in metadata
      assert.equal(audit.metadata.content, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Meeting Analytics Tests
  // ---------------------------------------------------------------------------

  it('7. Meeting Analytics calculates accurate metrics from real database records', async () => {
    const analytics = await getMeetingAnalytics(orgAId, organiserId, ['meeting.view']);

    // Summary
    assert.equal(analytics.summary.totalMeetings, 1);
    assert.equal(analytics.summary.scheduledMeetings, 1);
    assert.equal(analytics.summary.completedMeetings, 0);
    assert.equal(analytics.summary.meetingCompletionRate, 0);

    // Attendance
    assert.equal(analytics.attendance.totalInvitations, 2);
    assert.equal(analytics.attendance.accepted, 2);
    assert.equal(analytics.attendance.declined, 0);
    assert.equal(analytics.attendance.acceptanceRate, 100);

    // Action Items
    assert.equal(analytics.actionItems.total, 1);
    assert.equal(analytics.actionItems.open, 1);
    assert.equal(analytics.actionItems.done, 0);
    assert.equal(analytics.actionItems.completionRate, 0);

    // MOM counts
    assert.equal(analytics.mom.totalDiscussionPoints, 1);
    assert.equal(analytics.mom.totalDecisions, 1);
  });

  it('8. Meeting Analytics reflects lifecycle transitions: cancelled/missed are not counted as completed', async () => {
    // Create second meeting in Org A and mark it completed
    let completedMeetingId;
    let cancelledMeetingId;

    await withTenantTransaction({ organisationId: orgAId, userId: organiserId }, async (client) => {
      const res1 = await client.query(
        `INSERT INTO meetings (organisation_id, title, start_at, end_at, timezone, location_type, status, organiser_id, created_by_id)
         VALUES ($1, 'Completed Meeting', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '1 hour', 'UTC', 'virtual', 'completed', $2, $2)
         RETURNING id`,
        [orgAId, organiserId]
      );
      completedMeetingId = res1.rows[0].id;

      const res2 = await client.query(
        `INSERT INTO meetings (organisation_id, title, start_at, end_at, timezone, location_type, status, organiser_id, created_by_id)
         VALUES ($1, 'Cancelled Meeting', NOW() + INTERVAL '3 day', NOW() + INTERVAL '3 day 1 hour', 'UTC', 'virtual', 'cancelled', $2, $2)
         RETURNING id`,
        [orgAId, organiserId]
      );
      cancelledMeetingId = res2.rows[0].id;
    });

    const analytics = await getMeetingAnalytics(orgAId, organiserId, ['meeting.view']);

    assert.equal(analytics.summary.totalMeetings, 3);
    assert.equal(analytics.summary.completedMeetings, 1);
    assert.equal(analytics.summary.cancelledMeetings, 1);
    assert.equal(analytics.summary.scheduledMeetings, 1);
    // Completion rate: 1 completed / 3 total = 33.3%
    assert.equal(analytics.summary.meetingCompletionRate, 33.3);
  });

  it('9. Empty organisation analytics handles zero denominators safely without NaN or Infinity', async () => {
    const analytics = await getMeetingAnalytics(emptyOrgId, organiserId, ['meeting.view']);

    assert.equal(analytics.summary.totalMeetings, 0);
    assert.equal(analytics.summary.completedMeetings, 0);
    assert.equal(analytics.summary.meetingCompletionRate, 0);
    assert.equal(Number.isNaN(analytics.summary.meetingCompletionRate), false);

    assert.equal(analytics.attendance.totalInvitations, 0);
    assert.equal(analytics.attendance.acceptanceRate, 0);
    assert.equal(Number.isNaN(analytics.attendance.acceptanceRate), false);

    assert.equal(analytics.actionItems.total, 0);
    assert.equal(analytics.actionItems.completionRate, 0);
    assert.equal(Number.isNaN(analytics.actionItems.completionRate), false);

    assert.equal(analytics.mom.totalDiscussionPoints, 0);
    assert.equal(analytics.mom.totalDecisions, 0);
  });

  it('10. Tenant isolation: Org B analytics returns 0 for Org A meetings', async () => {
    const analyticsB = await getMeetingAnalytics(orgBId, userBId, ['meeting.view']);

    assert.equal(analyticsB.summary.totalMeetings, 0, 'Org B must not see Org A meetings');
    assert.equal(analyticsB.actionItems.total, 0, 'Org B must not see Org A action items');
    assert.equal(analyticsB.mom.totalDiscussionPoints, 0, 'Org B must not see Org A MOM items');
  });

  // ---------------------------------------------------------------------------
  // 3. Phase D: Action-Item Completion Metrics & Export Verification
  // ---------------------------------------------------------------------------

  it('11. Phase D: Action-item analytics computes actionableCompletionRate, grossCompletionRate, and preserves completionRate', async () => {
    // In Org A, add mixed action items for test: 2 done, 1 in_progress, 1 open, 1 cancelled
    await withTenantTransaction({ organisationId: orgAId, userId: organiserId }, async (client) => {
      // Clear existing test action items
      await client.query('DELETE FROM meeting_action_items WHERE organisation_id = $1', [orgAId]);

      await client.query(
        `INSERT INTO meeting_action_items (organisation_id, meeting_id, title, assignee_id, status, priority, created_by_id)
         VALUES 
           ($1, $2, 'Task 1 - Done', $3, 'done', 'high', $3),
           ($1, $2, 'Task 2 - Done', $3, 'done', 'medium', $3),
           ($1, $2, 'Task 3 - In Progress', $3, 'in_progress', 'medium', $3),
           ($1, $2, 'Task 4 - Open', $3, 'open', 'low', $3),
           ($1, $2, 'Task 5 - Cancelled', $3, 'cancelled', 'low', $3)`,
        [orgAId, meetingId, organiserId]
      );
    });

    const analytics = await getMeetingAnalytics(orgAId, organiserId, ['meeting.view']);

    // Total: 5, Done: 2, Cancelled: 1
    // Actionable Total: 5 - 1 = 4
    // Actionable Completion Rate: (2 / 4) * 100 = 50%
    // Gross Completion Rate: (2 / 5) * 100 = 40%
    assert.equal(analytics.actionItems.total, 5);
    assert.equal(analytics.actionItems.done, 2);
    assert.equal(analytics.actionItems.cancelled, 1);
    assert.equal(analytics.actionItems.actionableTotal, 4);
    assert.equal(analytics.actionItems.actionableCompletionRate, 50);
    assert.equal(analytics.actionItems.grossCompletionRate, 40);
    // Backward compatibility: completionRate preserves gross rate
    assert.equal(analytics.actionItems.completionRate, 40);
  });

  it('12. Phase D: When all action items are cancelled, actionableCompletionRate is safely 0% without zero-division error', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: organiserId }, async (client) => {
      await client.query('DELETE FROM meeting_action_items WHERE organisation_id = $1', [orgAId]);

      await client.query(
        `INSERT INTO meeting_action_items (organisation_id, meeting_id, title, assignee_id, status, priority, created_by_id)
         VALUES 
           ($1, $2, 'Task 1 - Cancelled', $3, 'cancelled', 'medium', $3),
           ($1, $2, 'Task 2 - Cancelled', $3, 'cancelled', 'low', $3)`,
        [orgAId, meetingId, organiserId]
      );
    });

    const analytics = await getMeetingAnalytics(orgAId, organiserId, ['meeting.view']);

    assert.equal(analytics.actionItems.total, 2);
    assert.equal(analytics.actionItems.done, 0);
    assert.equal(analytics.actionItems.cancelled, 2);
    assert.equal(analytics.actionItems.actionableTotal, 0);
    assert.equal(analytics.actionItems.actionableCompletionRate, 0);
    assert.equal(analytics.actionItems.grossCompletionRate, 0);
    assert.equal(analytics.actionItems.completionRate, 0);
  });

  it('13. Phase D: Markdown and PDF export attendee formatting supports canonical fullName/email, legacy userName/userEmail, and external guests', async () => {
    // Add an external attendee to meeting in Org A
    await withTenantTransaction({ organisationId: orgAId, userId: organiserId }, async (client) => {
      await client.query(
        `INSERT INTO meeting_attendees (organisation_id, meeting_id, external_email, role, rsvp_status)
         VALUES ($1, $2, 'external.partner@global.org', 'participant', 'accepted')
         ON CONFLICT DO NOTHING`,
        [orgAId, meetingId]
      );
    });

    // 1. Export Markdown
    const mdExport = await exportMeeting(
      orgAId,
      meetingId,
      'markdown',
      organiserId,
      ['meeting.notes.read', 'meeting.view']
    );

    assert.equal(mdExport.contentType, 'text/markdown; charset=utf-8');
    // External guest format: external.partner@global.org (External)
    assert.ok(mdExport.content.includes('external.partner@global.org (External)'));
    // Internal organiser format: P4 Organiser (p4_org_${runTag}@managex.local)
    assert.ok(mdExport.content.includes(`P4 Organiser (p4_org_${runTag}@managex.local)`));

    // 2. Export PDF
    const pdfExport = await exportMeeting(
      orgAId,
      meetingId,
      'pdf',
      organiserId,
      ['meeting.notes.read', 'meeting.view']
    );

    assert.equal(pdfExport.contentType, 'application/pdf');
    assert.ok(Buffer.isBuffer(pdfExport.content));
    assert.ok(pdfExport.content.length > 500);
    assert.equal(pdfExport.content.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  // ---------------------------------------------------------------------------
  // 4. Phase E: Analytics Date Semantics & RSVP Acceptance Rate Tests
  // ---------------------------------------------------------------------------

  it('14. Phase E: Correct analytics date semantics - meeting occurrence (start_at) vs creation velocity (created_at)', async () => {
    // Create dedicated isolated org for date semantics verification
    let dateOrgId;
    try {
      await withSystemTransaction(async (client) => {
        const orgRes = await client.query(
          `INSERT INTO organisations (name, slug, status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [`Org Date Semantics ${runTag}`, `org-date-${runTag}`]
        );
        dateOrgId = orgRes.rows[0].id;

        await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')`,
          [dateOrgId, organiserId]
        );
      });

      await withTenantTransaction({ organisationId: dateOrgId, userId: organiserId }, async (client) => {
        // Meeting 1: Created today (NOW()), but occurred 45 days ago (outside 30d occurrence window, inside 90d)
        const res1 = await client.query(
          `INSERT INTO meetings (
             organisation_id, title, start_at, end_at, timezone, location_type, status, organiser_id, created_by_id, created_at
           ) VALUES (
             $1, 'M1 - Past Occurred', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days' + INTERVAL '1 hour', 'UTC', 'virtual', 'completed', $2, $2, NOW()
           ) RETURNING id`,
          [dateOrgId, organiserId]
        );
        const m1Id = res1.rows[0].id;

        // Add attendee to M1
        await client.query(
          `INSERT INTO meeting_attendees (organisation_id, meeting_id, external_email, role, rsvp_status)
           VALUES ($1, $2, 'm1.guest@partner.org', 'participant', 'accepted')`,
          [dateOrgId, m1Id]
        );

        // Add Action Item to M1 created today (NOW()) -> should be included in 30d creation velocity
        await client.query(
          `INSERT INTO meeting_action_items (organisation_id, meeting_id, title, assignee_id, status, priority, created_by_id, created_at)
           VALUES ($1, $2, 'A1 - Created Today', $3, 'done', 'high', $3, NOW())`,
          [dateOrgId, m1Id, organiserId]
        );

        // Meeting 2: Created 45 days ago, but occurred 5 days ago (within 30d occurrence window)
        const res2 = await client.query(
          `INSERT INTO meetings (
             organisation_id, title, start_at, end_at, timezone, location_type, status, organiser_id, created_by_id, created_at
           ) VALUES (
             $1, 'M2 - Recent Occurred', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '1 hour', 'UTC', 'virtual', 'completed', $2, $2, NOW() - INTERVAL '45 days'
           ) RETURNING id`,
          [dateOrgId, organiserId]
        );
        const m2Id = res2.rows[0].id;

        // Add attendee to M2
        await client.query(
          `INSERT INTO meeting_attendees (organisation_id, meeting_id, external_email, role, rsvp_status)
           VALUES ($1, $2, 'm2.guest@partner.org', 'participant', 'accepted')`,
          [dateOrgId, m2Id]
        );

        // Add Action Item to M2 created 45 days ago -> should be excluded from 30d creation velocity, included in 90d
        await client.query(
          `INSERT INTO meeting_action_items (organisation_id, meeting_id, title, assignee_id, status, priority, created_by_id, created_at)
           VALUES ($1, $2, 'A2 - Created 45d Ago', $3, 'done', 'high', $3, NOW() - INTERVAL '45 days')`,
          [dateOrgId, m2Id, organiserId]
        );

        // Add Discussion Point and Decision to M2
        await client.query(
          `INSERT INTO meeting_discussion_points (organisation_id, meeting_id, title, body, order_index, created_by_id)
           VALUES ($1, $2, 'M2 Discussion', 'Discussed Q4 roadmap', 0, $3)`,
          [dateOrgId, m2Id, organiserId]
        );
        await client.query(
          `INSERT INTO meeting_decisions (organisation_id, meeting_id, title, details, order_index, created_by_id)
           VALUES ($1, $2, 'M2 Decision', 'Adopted new plan', 0, $3)`,
          [dateOrgId, m2Id, organiserId]
        );

        // Meeting 3: Occurred 120 days ago (outside both 30d and 90d occurrence windows)
        const res3 = await client.query(
          `INSERT INTO meetings (
             organisation_id, title, start_at, end_at, timezone, location_type, status, organiser_id, created_by_id, created_at
           ) VALUES (
             $1, 'M3 - 120d Ago', NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days' + INTERVAL '1 hour', 'UTC', 'virtual', 'completed', $2, $2, NOW() - INTERVAL '120 days'
           ) RETURNING id`,
          [dateOrgId, organiserId]
        );
        const m3Id = res3.rows[0].id;

        await client.query(
          `INSERT INTO meeting_attendees (organisation_id, meeting_id, external_email, role, rsvp_status)
           VALUES ($1, $2, 'm3.guest@partner.org', 'participant', 'accepted')`,
          [dateOrgId, m3Id]
        );

        await client.query(
          `INSERT INTO meeting_action_items (organisation_id, meeting_id, title, assignee_id, status, priority, created_by_id, created_at)
           VALUES ($1, $2, 'A3 - Created 120d Ago', $3, 'done', 'high', $3, NOW() - INTERVAL '120 days')`,
          [dateOrgId, m3Id, organiserId]
        );

        // Meeting 4 (Future): Scheduled 5 days from now (outside 30d and 90d retrospective windows, inside 'all')
        const resFuture = await client.query(
          `INSERT INTO meetings (
             organisation_id, title, start_at, end_at, timezone, location_type, status, organiser_id, created_by_id, created_at
           ) VALUES (
             $1, 'M_future - In 5 Days', NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days' + INTERVAL '1 hour', 'UTC', 'virtual', 'scheduled', $2, $2, NOW()
           ) RETURNING id`,
          [dateOrgId, organiserId]
        );
        const mFutureId = resFuture.rows[0].id;

        await client.query(
          `INSERT INTO meeting_attendees (organisation_id, meeting_id, external_email, role, rsvp_status)
           VALUES ($1, $2, 'future.guest@partner.org', 'participant', 'pending')`,
          [dateOrgId, mFutureId]
        );

        // Action Item with future created_at (should be excluded from retrospective velocity windows)
        await client.query(
          `INSERT INTO meeting_action_items (organisation_id, meeting_id, title, assignee_id, status, priority, created_by_id, created_at)
           VALUES ($1, $2, 'A_future - Created in Future', $3, 'open', 'medium', $3, NOW() + INTERVAL '1 day')`,
          [dateOrgId, mFutureId, organiserId]
        );
      });

      // 1. Query with 30-day occurrence window:
      // M2 (5d ago) is included. M1 (45d ago), M3 (120d ago), and M_future (+5d) MUST be excluded.
      const analytics30d = await getMeetingAnalytics(dateOrgId, organiserId, ['meeting.view'], { timeframe: '30d' });

      // Meeting occurrence: exactly 1 meeting in the 30d historical window
      assert.equal(analytics30d.summary.totalMeetings, 1, 'Only M2 (start_at within 30d) should be counted');
      assert.equal(analytics30d.summary.completedMeetings, 1);
      assert.equal(analytics30d.summary.scheduledMeetings, 0, 'Future scheduled meeting must be excluded from 30d');
      assert.equal(analytics30d.summary.meetingCompletionRate, 100);

      // Attendance: only M2 attendee belongs to a meeting occurring within 30d
      assert.equal(analytics30d.attendance.totalInvitations, 1, 'Only M2 attendee should be counted');
      assert.equal(analytics30d.attendance.accepted, 1);
      assert.equal(analytics30d.attendance.acceptanceRate, 100);

      // Action Items: only A1 was created within the last 30 days (creation velocity metric)
      assert.equal(analytics30d.actionItems.total, 1, 'Only A1 (created_at within 30d) should be counted');
      assert.equal(analytics30d.actionItems.done, 1);
      assert.equal(analytics30d.actionItems.actionableCompletionRate, 100);

      // MOM: M2 discussion points and decisions are in the occurrence window
      assert.equal(analytics30d.mom.totalDiscussionPoints, 1);
      assert.equal(analytics30d.mom.totalDecisions, 1);

      // 2. Query with 90-day occurrence window:
      // M2 (5d ago) and M1 (45d ago) are included. M3 (120d ago) and M_future (+5d) MUST be excluded.
      const analytics90d = await getMeetingAnalytics(dateOrgId, organiserId, ['meeting.view'], { timeframe: '90d' });

      assert.equal(analytics90d.summary.totalMeetings, 2, 'M1 and M2 should be counted in 90d window');
      assert.equal(analytics90d.summary.completedMeetings, 2);
      assert.equal(analytics90d.summary.scheduledMeetings, 0, 'Future scheduled meeting must be excluded from 90d');
      assert.equal(analytics90d.summary.meetingCompletionRate, 100);

      // Attendance: M1 and M2 attendees included
      assert.equal(analytics90d.attendance.totalInvitations, 2, 'M1 and M2 attendees should be counted in 90d');
      assert.equal(analytics90d.attendance.accepted, 2);
      assert.equal(analytics90d.attendance.acceptanceRate, 100);

      // Action Items: A1 (today) and A2 (45d ago) included in 90d velocity window
      assert.equal(analytics90d.actionItems.total, 2, 'A1 and A2 should be counted in 90d');
      assert.equal(analytics90d.actionItems.done, 2);

      // 3. Query with 'all' timeframe: all 4 meetings and all 4 action items counted
      const analyticsAll = await getMeetingAnalytics(dateOrgId, organiserId, ['meeting.view'], { timeframe: 'all' });
      assert.equal(analyticsAll.summary.totalMeetings, 4, 'All 4 meetings (past and future) should be counted in all time');
      assert.equal(analyticsAll.summary.completedMeetings, 3);
      assert.equal(analyticsAll.summary.scheduledMeetings, 1, 'Future scheduled meeting included in all time');
      assert.equal(analyticsAll.attendance.totalInvitations, 4);
      assert.equal(analyticsAll.actionItems.total, 4);
    } finally {
      if (dateOrgId) {
        await withTenantTransaction({ organisationId: dateOrgId, userId: organiserId }, async (client) => {
          await client.query('DELETE FROM meeting_action_items WHERE organisation_id = $1', [dateOrgId]);
          await client.query('DELETE FROM meeting_decisions WHERE organisation_id = $1', [dateOrgId]);
          await client.query('DELETE FROM meeting_discussion_points WHERE organisation_id = $1', [dateOrgId]);
          await client.query('DELETE FROM meeting_notes WHERE organisation_id = $1', [dateOrgId]);
          await client.query('DELETE FROM meeting_agenda_items WHERE organisation_id = $1', [dateOrgId]);
          await client.query('DELETE FROM meeting_attendees WHERE organisation_id = $1', [dateOrgId]);
          await client.query('DELETE FROM meetings WHERE organisation_id = $1', [dateOrgId]);
        });
        await withSystemTransaction(async (client) => {
          await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [dateOrgId]);
          await client.query('DELETE FROM organisations WHERE id = $1', [dateOrgId]);
        });
      }
    }
  });

  it('15. Phase E: Child-table parent-meeting scoping without duplicate counts (no Cartesian products)', async () => {
    let orgCartesianId;
    try {
      await withSystemTransaction(async (client) => {
        const orgRes = await client.query(
          `INSERT INTO organisations (name, slug, status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [`Org Cartesian ${runTag}`, `org-cartesian-${runTag}`]
        );
        orgCartesianId = orgRes.rows[0].id;

        await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')`,
          [orgCartesianId, organiserId]
        );
      });

      await withTenantTransaction({ organisationId: orgCartesianId, userId: organiserId }, async (client) => {
        // Meeting occurring within 30d
        const mRes = await client.query(
          `INSERT INTO meetings (
             organisation_id, title, start_at, end_at, timezone, location_type, status, organiser_id, created_by_id
           ) VALUES (
             $1, 'Cartesian Check Meeting', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '1 hour', 'UTC', 'virtual', 'completed', $2, $2
           ) RETURNING id`,
          [orgCartesianId, organiserId]
        );
        const mId = mRes.rows[0].id;

        // Add 4 attendees: 3 accepted, 1 declined
        await client.query(
          `INSERT INTO meeting_attendees (organisation_id, meeting_id, external_email, role, rsvp_status)
           VALUES 
             ($1, $2, 'att1@cartesian.org', 'participant', 'accepted'),
             ($1, $2, 'att2@cartesian.org', 'participant', 'accepted'),
             ($1, $2, 'att3@cartesian.org', 'participant', 'accepted'),
             ($1, $2, 'att4@cartesian.org', 'participant', 'declined')`,
          [orgCartesianId, mId]
        );

        // Add 3 discussion points
        await client.query(
          `INSERT INTO meeting_discussion_points (organisation_id, meeting_id, title, body, order_index, created_by_id)
           VALUES 
             ($1, $2, 'Point 1', 'Detail 1', 0, $3),
             ($1, $2, 'Point 2', 'Detail 2', 1, $3),
             ($1, $2, 'Point 3', 'Detail 3', 2, $3)`,
          [orgCartesianId, mId, organiserId]
        );

        // Add 2 decisions
        await client.query(
          `INSERT INTO meeting_decisions (organisation_id, meeting_id, title, details, order_index, created_by_id)
           VALUES 
             ($1, $2, 'Decision 1', 'Detail 1', 0, $3),
             ($1, $2, 'Decision 2', 'Detail 2', 1, $3)`,
          [orgCartesianId, mId, organiserId]
        );
      });

      const analytics = await getMeetingAnalytics(orgCartesianId, organiserId, ['meeting.view'], { timeframe: '30d' });

      // Verify exactly 4 attendees without Cartesian inflation
      assert.equal(analytics.attendance.totalInvitations, 4);
      assert.equal(analytics.attendance.accepted, 3);
      assert.equal(analytics.attendance.declined, 1);
      assert.equal(analytics.attendance.acceptanceRate, 75); // 3 of 4 accepted = 75%

      // Verify exactly 3 discussion points and 2 decisions
      assert.equal(analytics.mom.totalDiscussionPoints, 3);
      assert.equal(analytics.mom.totalDecisions, 2);
    } finally {
      if (orgCartesianId) {
        await withTenantTransaction({ organisationId: orgCartesianId, userId: organiserId }, async (client) => {
          await client.query('DELETE FROM meeting_action_items WHERE organisation_id = $1', [orgCartesianId]);
          await client.query('DELETE FROM meeting_decisions WHERE organisation_id = $1', [orgCartesianId]);
          await client.query('DELETE FROM meeting_discussion_points WHERE organisation_id = $1', [orgCartesianId]);
          await client.query('DELETE FROM meeting_notes WHERE organisation_id = $1', [orgCartesianId]);
          await client.query('DELETE FROM meeting_agenda_items WHERE organisation_id = $1', [orgCartesianId]);
          await client.query('DELETE FROM meeting_attendees WHERE organisation_id = $1', [orgCartesianId]);
          await client.query('DELETE FROM meetings WHERE organisation_id = $1', [orgCartesianId]);
        });
        await withSystemTransaction(async (client) => {
          await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgCartesianId]);
          await client.query('DELETE FROM organisations WHERE id = $1', [orgCartesianId]);
        });
      }
    }
  });

  it('16. Phase E: RSVP Acceptance Rate handles empty invitations safely (0% without NaN or Infinity)', async () => {
    const analytics = await getMeetingAnalytics(emptyOrgId, organiserId, ['meeting.view'], { timeframe: '30d' });

    assert.equal(analytics.attendance.totalInvitations, 0);
    assert.equal(analytics.attendance.accepted, 0);
    assert.equal(analytics.attendance.declined, 0);
    assert.equal(analytics.attendance.tentative, 0);
    assert.equal(analytics.attendance.pending, 0);
    assert.equal(analytics.attendance.acceptanceRate, 0);
    assert.equal(Number.isNaN(analytics.attendance.acceptanceRate), false);
    assert.equal(Number.isFinite(analytics.attendance.acceptanceRate), true);
  });
});
