/**
-- ==============================================================================
-- ManageX Phase 2A: Evaluation Database Foundation Integration Tests
-- Tests referential integrity, composite foreign keys, RLS policies, check constraints,
-- and backward compatibility for the round evaluation scheduling foundation.
-- ==============================================================================
*/

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../database/pool.js';
import { withSystemTransaction, withTenantTransaction } from '../database/transaction.js';
import { hashPassword } from '../auth/passwords.js';

describe('Phase 2A — Evaluation Database Foundation Suite', () => {
  let pool;
  let ownerUserId, judgeUserId, studentUserId, student2UserId, crossTenantUserId, platformAdminUserId;
  let orgAId, orgBId;
  let eventAId, eventBId;
  let roundAId, roundBId;
  let teamAId, teamA2Id, teamBId;

  before(async () => {
    pool = getPool();
    const passwordHash = await hashPassword('SecurePassword123!');

    await withSystemTransaction(async (client) => {
      // 1. Clean up any previous test data
      const prevUsers = await client.query("SELECT id FROM users WHERE email LIKE 'eval2a_%@managex.local'");
      const prevUserIds = prevUsers.rows.map((r) => r.id);
      const prevOrgs = await client.query("SELECT id FROM organisations WHERE name LIKE 'Eval2A%'");
      for (const org of prevOrgs.rows) {
        await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [org.id]);
        await client.query('DELETE FROM evaluation_sessions WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM evaluation_panel_judges WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM evaluation_panels WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM round_evaluations WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_round_advancements WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_scores WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_scoring_criteria WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_judge_assignments WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_submissions WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_rounds WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_team_members WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_teams WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM event_registrations WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM events WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [org.id]);
        await client.query('DELETE FROM organisations WHERE id = $1', [org.id]);
      }
      if (prevUserIds.length > 0) {
        await client.query('DELETE FROM users WHERE id = ANY($1)', [prevUserIds]);
      }

      // 2. Create users
      const usersRes = await client.query(
        `
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ('Eval Owner', 'eval2a_owner@managex.local', $1, 'active', NOW()),
          ('Eval External Judge', 'eval2a_judge@managex.local', $1, 'active', NOW()),
          ('Eval Student Participant', 'eval2a_student@managex.local', $1, 'active', NOW()),
          ('Eval Student 2 Participant', 'eval2a_student2@managex.local', $1, 'active', NOW()),
          ('Eval Cross Tenant', 'eval2a_cross@managex.local', $1, 'active', NOW()),
          ('Eval Platform Support', 'eval2a_platform@managex.local', $1, 'active', NOW())
        RETURNING id, email
      `,
        [passwordHash]
      );

      const userMap = new Map(usersRes.rows.map((u) => [u.email, u.id]));
      ownerUserId = userMap.get('eval2a_owner@managex.local');
      judgeUserId = userMap.get('eval2a_judge@managex.local');
      studentUserId = userMap.get('eval2a_student@managex.local');
      student2UserId = userMap.get('eval2a_student2@managex.local');
      crossTenantUserId = userMap.get('eval2a_cross@managex.local');
      platformAdminUserId = userMap.get('eval2a_platform@managex.local');

      // 3. Create Org A and Org B
      const orgARes = await client.query(
        "INSERT INTO organisations (name, slug, status) VALUES ('Eval2A Org A', 'eval2a-org-a', 'active') RETURNING id"
      );
      orgAId = orgARes.rows[0].id;

      const orgBRes = await client.query(
        "INSERT INTO organisations (name, slug, status) VALUES ('Eval2A Org B', 'eval2a-org-b', 'active') RETURNING id"
      );
      orgBId = orgBRes.rows[0].id;

      // Add Org A membership for owner
      const memARes = await client.query(
        "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id",
        [orgAId, ownerUserId]
      );
      const ownerRoleId = (await client.query("SELECT id FROM roles WHERE slug = 'organisation_owner'")).rows[0].id;
      await client.query(
        "INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)",
        [orgAId, memARes.rows[0].id, ownerRoleId]
      );

      // Add Org B membership for crossTenantUser
      const memBRes = await client.query(
        "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id",
        [orgBId, crossTenantUserId]
      );
      await client.query(
        "INSERT INTO membership_roles (organisation_id, membership_id, role_id) VALUES ($1, $2, $3)",
        [orgBId, memBRes.rows[0].id, ownerRoleId]
      );

      // Entitle events module
      const eventsModuleId = (await client.query("SELECT id FROM modules WHERE slug = 'events'")).rows[0]?.id;
      if (eventsModuleId) {
        await client.query("INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled) VALUES ($1, $2, true) ON CONFLICT DO NOTHING", [orgAId, eventsModuleId]);
        await client.query("INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled) VALUES ($1, $2, true) ON CONFLICT DO NOTHING", [orgBId, eventsModuleId]);
      }

      // 4. Create Event A (Org A) and Event B (Org B)
      const eventARes = await client.query(
        `
        INSERT INTO events (
          organisation_id, created_by_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone
        ) VALUES ($1, $2, 'Eval Hackathon A', 'eval-hack-a', 'hackathon', 'published', 'public', NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC')
        RETURNING id
      `,
        [orgAId, ownerUserId]
      );
      eventAId = eventARes.rows[0].id;

      const eventBRes = await client.query(
        `
        INSERT INTO events (
          organisation_id, created_by_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone
        ) VALUES ($1, $2, 'Eval Hackathon B', 'eval-hack-b', 'hackathon', 'published', 'public', NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days', 'UTC')
        RETURNING id
      `,
        [orgBId, crossTenantUserId]
      );
      eventBId = eventBRes.rows[0].id;

      // 5. Create Round 1 in Event A and Event B
      const roundARes = await client.query(
        `
        INSERT INTO event_rounds (
          organisation_id, event_id, round_number, name, advancement_rule, status
        ) VALUES ($1, $2, 1, 'Preliminary Round', 'manual', 'open')
        RETURNING id
      `,
        [orgAId, eventAId]
      );
      roundAId = roundARes.rows[0].id;

      const roundBRes = await client.query(
        `
        INSERT INTO event_rounds (
          organisation_id, event_id, round_number, name, advancement_rule, status
        ) VALUES ($1, $2, 1, 'Preliminary Round B', 'manual', 'open')
        RETURNING id
      `,
        [orgBId, eventBId]
      );
      roundBId = roundBRes.rows[0].id;

      // 6. Create Team A in Event A and Team B in Event B
      await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgAId]);
      const teamARes = await client.query(
        `
        INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
        VALUES ($1, $2, 'Team Alpha', 'team-alpha', $3)
        RETURNING id
      `,
        [orgAId, eventAId, studentUserId]
      );
      teamAId = teamARes.rows[0].id;

      // Register student in Event A and attach to Team A
      await client.query(
        "INSERT INTO event_registrations (organisation_id, event_id, user_id, status) VALUES ($1, $2, $3, 'registered')",
        [orgAId, eventAId, studentUserId]
      );
      await client.query(
        "INSERT INTO event_team_members (organisation_id, event_id, team_id, user_id, is_owner) VALUES ($1, $2, $3, $4, true)",
        [orgAId, eventAId, teamAId, studentUserId]
      );

      // Create Team A2 in Event A for student 2
      const teamA2Res = await client.query(
        `
        INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
        VALUES ($1, $2, 'Team Alpha Two', 'team-alpha-two', $3)
        RETURNING id
      `,
        [orgAId, eventAId, student2UserId]
      );
      teamA2Id = teamA2Res.rows[0].id;

      await client.query(
        "INSERT INTO event_registrations (organisation_id, event_id, user_id, status) VALUES ($1, $2, $3, 'registered')",
        [orgAId, eventAId, student2UserId]
      );
      await client.query(
        "INSERT INTO event_team_members (organisation_id, event_id, team_id, user_id, is_owner) VALUES ($1, $2, $3, $4, true)",
        [orgAId, eventAId, teamA2Id, student2UserId]
      );

      await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgBId]);
      const teamBRes = await client.query(
        `
        INSERT INTO event_teams (organisation_id, event_id, name, slug, created_by_id)
        VALUES ($1, $2, 'Team Beta', 'team-beta', $3)
        RETURNING id
      `,
        [orgBId, eventBId, crossTenantUserId]
      );
      teamBId = teamBRes.rows[0].id;
    });
  });

  after(async () => {
    await withSystemTransaction(async (client) => {
      if (orgAId) {
        await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgAId]);
        await client.query('DELETE FROM evaluation_sessions WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM evaluation_panel_judges WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM evaluation_panels WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM round_evaluations WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM event_team_members WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM event_teams WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM event_registrations WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM event_rounds WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM events WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgAId]);
        await client.query('DELETE FROM organisations WHERE id = $1', [orgAId]);
      }
      if (orgBId) {
        await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgBId]);
        await client.query('DELETE FROM evaluation_sessions WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM evaluation_panel_judges WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM evaluation_panels WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM round_evaluations WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM event_team_members WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM event_teams WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM event_rounds WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM events WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM organisation_module_entitlements WHERE organisation_id = $1', [orgBId]);
        await client.query('DELETE FROM organisations WHERE id = $1', [orgBId]);
      }
      const usersToClean = [ownerUserId, judgeUserId, studentUserId, student2UserId, crossTenantUserId, platformAdminUserId].filter(Boolean);
      if (usersToClean.length > 0) {
        await client.query('DELETE FROM users WHERE id = ANY($1)', [usersToClean]);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Valid Creation & Structure
  // ---------------------------------------------------------------------------
  it('1. Successfully creates round_evaluations, evaluation_panels, evaluation_panel_judges, and evaluation_sessions', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      // Create round evaluation
      const evalRes = await client.query(
        `
        INSERT INTO round_evaluations (
          organisation_id, event_id, round_id, evaluation_mode, status,
          session_duration_minutes, buffer_minutes, judges_per_panel, evaluations_per_team
        ) VALUES ($1, $2, $3, 'live_showcase', 'draft', 15, 3, 2, 1)
        RETURNING id, evaluation_mode, status
      `,
        [orgAId, eventAId, roundAId]
      );

      assert.equal(evalRes.rows.length, 1);
      const evalId = evalRes.rows[0].id;
      assert.equal(evalRes.rows[0].evaluation_mode, 'live_showcase');
      assert.equal(evalRes.rows[0].status, 'draft');

      // Create panel
      const panelRes = await client.query(
        `
        INSERT INTO evaluation_panels (
          organisation_id, event_id, round_evaluation_id, name, meeting_url, order_index
        ) VALUES ($1, $2, $3, 'Panel 1 - Engineering', 'https://meet.google.com/abc-defg-hij', 0)
        RETURNING id, name
      `,
        [orgAId, eventAId, evalId]
      );

      assert.equal(panelRes.rows.length, 1);
      const panelId = panelRes.rows[0].id;
      assert.equal(panelRes.rows[0].name, 'Panel 1 - Engineering');

      // Assign non-member judge to panel
      const judgeRes = await client.query(
        `
        INSERT INTO evaluation_panel_judges (
          organisation_id, round_evaluation_id, panel_id, judge_user_id
        ) VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
        [orgAId, evalId, panelId, judgeUserId]
      );
      assert.equal(judgeRes.rows.length, 1);

      // Create evaluation session for Team A
      const sessionRes = await client.query(
        `
        INSERT INTO evaluation_sessions (
          organisation_id, event_id, round_evaluation_id, panel_id, team_id,
          slot_index, starts_at, ends_at, meeting_url, status
        ) VALUES (
          $1, $2, $3, $4, $5, 1,
          NOW() + INTERVAL '2 hours',
          NOW() + INTERVAL '2 hours 15 minutes',
          'https://meet.google.com/abc-defg-hij',
          'scheduled'
        )
        RETURNING id, status
      `,
        [orgAId, eventAId, evalId, panelId, teamAId]
      );
      assert.equal(sessionRes.rows.length, 1);
      assert.equal(sessionRes.rows[0].status, 'scheduled');

      // Create evaluation session for Team A2
      const session2Res = await client.query(
        `
        INSERT INTO evaluation_sessions (
          organisation_id, event_id, round_evaluation_id, panel_id, team_id,
          slot_index, starts_at, ends_at, meeting_url, status
        ) VALUES (
          $1, $2, $3, $4, $5, 2,
          NOW() + INTERVAL '2 hours 20 minutes',
          NOW() + INTERVAL '2 hours 35 minutes',
          'https://meet.google.com/team2-secret-link',
          'scheduled'
        )
        RETURNING id, status
      `,
        [orgAId, eventAId, evalId, panelId, teamA2Id]
      );
      assert.equal(session2Res.rows.length, 1);
      assert.equal(session2Res.rows[0].status, 'scheduled');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Cross-Event Referential Integrity Rejection
  // ---------------------------------------------------------------------------
  it('2. Rejects evaluation_sessions linking an evaluation to a team belonging to a different event', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      const evalRes = await client.query('SELECT id FROM round_evaluations WHERE round_id = $1', [roundAId]);
      const evalId = evalRes.rows[0].id;
      const panelRes = await client.query('SELECT id FROM evaluation_panels WHERE round_evaluation_id = $1 LIMIT 1', [evalId]);
      const panelId = panelRes.rows[0].id;

      // Attempt to schedule Team B (from Event B) into Event A's session
      await assert.rejects(
        async () => {
          await client.query(
            `
            INSERT INTO evaluation_sessions (
              organisation_id, event_id, round_evaluation_id, panel_id, team_id,
              slot_index, starts_at, ends_at, status
            ) VALUES (
              $1, $2, $3, $4, $5, 2,
              NOW() + INTERVAL '3 hours',
              NOW() + INTERVAL '3 hours 15 minutes',
              'scheduled'
            )
          `,
            [orgAId, eventAId, evalId, panelId, teamBId]
          );
        },
        (err) => {
          assert.equal(err.code, '23503', 'Expected foreign key violation error (23503)');
          assert.match(err.constraint, /fk_sessions_team_event/, 'Expected violation on fk_sessions_team_event');
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Mismatched Event/Round Integrity Rejection
  // ---------------------------------------------------------------------------
  it('3. Rejects round_evaluations when round_id does not belong to event_id', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      // Attempt to link Event A with Round B (from Event B)
      await assert.rejects(
        async () => {
          await client.query(
            `
            INSERT INTO round_evaluations (
              organisation_id, event_id, round_id, evaluation_mode
            ) VALUES ($1, $2, $3, 'submission_based')
          `,
            [orgAId, eventAId, roundBId]
          );
        },
        (err) => {
          assert.equal(err.code, '23503');
          assert.match(err.constraint, /fk_round_eval_round/);
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Unique Constraints & Invariant Enforcement
  // ---------------------------------------------------------------------------
  it('4. Rejects multiple evaluations for the same round (uq_round_eval_round)', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      await assert.rejects(
        async () => {
          await client.query(
            `
            INSERT INTO round_evaluations (
              organisation_id, event_id, round_id, evaluation_mode
            ) VALUES ($1, $2, $3, 'hybrid')
          `,
            [orgAId, eventAId, roundAId]
          );
        },
        (err) => {
          assert.equal(err.code, '23505', 'Expected unique constraint violation (23505)');
          assert.match(err.constraint, /uq_round_eval_round/);
          return true;
        }
      );
    });
  });

  it('5. Rejects assigning the same judge to multiple panels in the same evaluation (uq_pjudges_eval_judge)', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      const evalRes = await client.query('SELECT id FROM round_evaluations WHERE round_id = $1', [roundAId]);
      const evalId = evalRes.rows[0].id;

      // Create second panel
      const panel2Res = await client.query(
        `
        INSERT INTO evaluation_panels (
          organisation_id, event_id, round_evaluation_id, name, order_index
        ) VALUES ($1, $2, $3, 'Panel 2 - Design', 1)
        RETURNING id
      `,
        [orgAId, eventAId, evalId]
      );
      const panel2Id = panel2Res.rows[0].id;

      // Attempt to assign the same judgeUserId to Panel 2 in this evaluation
      await assert.rejects(
        async () => {
          await client.query(
            `
            INSERT INTO evaluation_panel_judges (
              organisation_id, round_evaluation_id, panel_id, judge_user_id
            ) VALUES ($1, $2, $3, $4)
          `,
            [orgAId, evalId, panel2Id, judgeUserId]
          );
        },
        (err) => {
          assert.equal(err.code, '23505');
          assert.match(err.constraint, /uq_pjudges_eval_judge/);
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Check Constraints Rejection
  // ---------------------------------------------------------------------------
  it('6. Rejects invalid session timestamps where ends_at <= starts_at', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      const evalRes = await client.query('SELECT id FROM round_evaluations WHERE round_id = $1', [roundAId]);
      const evalId = evalRes.rows[0].id;
      const panelRes = await client.query('SELECT id FROM evaluation_panels WHERE round_evaluation_id = $1 LIMIT 1', [evalId]);
      const panelId = panelRes.rows[0].id;

      await assert.rejects(
        async () => {
          await client.query(
            `
            INSERT INTO evaluation_sessions (
              organisation_id, event_id, round_evaluation_id, panel_id, team_id,
              starts_at, ends_at, status
            ) VALUES (
              $1, $2, $3, $4, $5,
              NOW() + INTERVAL '5 hours',
              NOW() + INTERVAL '4 hours',
              'scheduled'
            )
          `,
            [orgAId, eventAId, evalId, panelId, teamAId]
          );
        },
        (err) => {
          assert.equal(err.code, '23514', 'Expected check constraint violation (23514)');
          assert.match(err.constraint, /chk_sessions_interval/);
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. RLS & Tenant Isolation Verification
  // ---------------------------------------------------------------------------
  it('7. Tenant Isolation: User in Org B cannot SELECT Org A evaluation sessions or panels', async () => {
    await withTenantTransaction({ organisationId: orgBId, userId: crossTenantUserId }, async (client) => {
      // Query sessions and panels as Org B user
      const sessions = await client.query('SELECT * FROM evaluation_sessions WHERE organisation_id = $1', [orgAId]);
      assert.equal(sessions.rows.length, 0, 'Org B user must not see Org A sessions');

      const panels = await client.query('SELECT * FROM evaluation_panels WHERE organisation_id = $1', [orgAId]);
      assert.equal(panels.rows.length, 0, 'Org B user must not see Org A panels');
    });
  });

  it('8. RLS: Non-member assigned judge can SELECT their assigned panel and sessions', async () => {
    // Note: External judge does NOT belong to Org A memberships
    await withTenantTransaction({ organisationId: orgAId, userId: judgeUserId }, async (client) => {
      const sessionsRes = await client.query('SELECT * FROM evaluation_sessions');
      assert.ok(sessionsRes.rows.length >= 1, 'Assigned judge must be able to view their assigned sessions');

      const panelsRes = await client.query('SELECT * FROM evaluation_panels');
      assert.ok(panelsRes.rows.length >= 1, 'Assigned judge must be able to view their assigned panel');
    });
  });

  it('9. RLS: Non-member judge cannot INSERT or mutate panels or sessions (fails closed)', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: judgeUserId }, async (client) => {
      const evalRes = await client.query('SELECT id FROM round_evaluations WHERE round_id = $1', [roundAId]);
      const evalId = evalRes.rows[0].id;

      await assert.rejects(
        async () => {
          await client.query(
            `
            INSERT INTO evaluation_panels (
              organisation_id, event_id, round_evaluation_id, name, order_index
            ) VALUES ($1, $2, $3, 'Rogue Panel', 99)
          `,
            [orgAId, eventAId, evalId]
          );
        },
        (err) => {
          // RLS with-check violation or permission violation
          assert.ok(err.code === '42501' || err.code === '23502' || err.message.includes('policy'));
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Optional Evaluation & Existing Round Backward Compatibility
  // ---------------------------------------------------------------------------
  it('10. Backward Compatibility: Round without round_evaluations functions normally', async () => {
    await withTenantTransaction({ organisationId: orgBId, userId: crossTenantUserId }, async (client) => {
      // Round B in Event B has NO round_evaluations record
      const evalCount = await client.query('SELECT COUNT(*)::int AS count FROM round_evaluations WHERE round_id = $1', [roundBId]);
      assert.equal(evalCount.rows[0].count, 0, 'Round B must have zero evaluation records');

      // Round B details can still be queried normally
      const roundRes = await client.query('SELECT * FROM event_rounds WHERE id = $1', [roundBId]);
      assert.equal(roundRes.rows.length, 1);
      assert.equal(roundRes.rows[0].name, 'Preliminary Round B');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Phase 2A.1 Security Hardening & Least-Privilege Verification
  // ---------------------------------------------------------------------------
  it('11. Security Hardening: Platform support cannot INSERT, UPDATE, or DELETE evaluation records without active organisation membership', async () => {
    // Platform support user has isPlatformAdmin = true, but does NOT hold active membership in Org A
    // 1. Rejects INSERT by platform support
    await withTenantTransaction({ organisationId: orgAId, userId: platformAdminUserId, isPlatformAdmin: true }, async (client) => {
      const evalRes = await client.query('SELECT id FROM round_evaluations WHERE round_id = $1', [roundAId]);
      const evalId = evalRes.rows[0]?.id;

      await assert.rejects(
        async () => {
          await client.query(
            `
            INSERT INTO evaluation_panels (
              organisation_id, event_id, round_evaluation_id, name, order_index
            ) VALUES ($1, $2, $3, 'Support Injected Panel', 10)
          `,
            [orgAId, eventAId, evalId]
          );
        },
        (err) => {
          assert.ok(err.code === '42501' || err.message.includes('policy'), 'Expected RLS policy rejection');
          return true;
        }
      );
    });

    // 2. UPDATE by platform support fails closed (0 rows affected)
    await withTenantTransaction({ organisationId: orgAId, userId: platformAdminUserId, isPlatformAdmin: true }, async (client) => {
      const updateRes = await client.query(
        "UPDATE evaluation_sessions SET meeting_url = 'https://meet.google.com/tampered' WHERE organisation_id = $1",
        [orgAId]
      );
      assert.equal(updateRes.rowCount, 0, 'Platform support without membership must not update any sessions');
    });

    // 3. DELETE by platform support fails closed (0 rows affected)
    await withTenantTransaction({ organisationId: orgAId, userId: platformAdminUserId, isPlatformAdmin: true }, async (client) => {
      const deleteRes = await client.query(
        'DELETE FROM evaluation_sessions WHERE organisation_id = $1',
        [orgAId]
      );
      assert.equal(deleteRes.rowCount, 0, 'Platform support without membership must not delete any sessions');
    });
  });

  it('12. Security Hardening: Platform support cannot SELECT private evaluation data, judge assignments, or meeting URLs', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: platformAdminUserId, isPlatformAdmin: true }, async (client) => {
      // 1. Cannot select round evaluations
      const evals = await client.query('SELECT * FROM round_evaluations WHERE organisation_id = $1', [orgAId]);
      assert.equal(evals.rows.length, 0, 'Platform support must not see round_evaluations');

      // 2. Cannot select evaluation panels
      const panels = await client.query('SELECT * FROM evaluation_panels WHERE organisation_id = $1', [orgAId]);
      assert.equal(panels.rows.length, 0, 'Platform support must not see evaluation_panels');

      // 3. Cannot select evaluation panel judges (zero judge assignments exposed)
      const judges = await client.query('SELECT * FROM evaluation_panel_judges WHERE organisation_id = $1', [orgAId]);
      assert.equal(judges.rows.length, 0, 'Platform support must not see evaluation_panel_judges');

      // 4. Cannot select evaluation sessions (zero session meeting URLs exposed)
      const sessions = await client.query('SELECT * FROM evaluation_sessions WHERE organisation_id = $1', [orgAId]);
      assert.equal(sessions.rows.length, 0, 'Platform support must not see evaluation_sessions');
    });
  });

  it('13. Security Hardening: Missing tenant context fails closed on all queries and mutations', async () => {
    await withTenantTransaction({ organisationId: '', userId: ownerUserId }, async (client) => {
      // Missing organisation context -> organisation_id = NULLIF('', '') -> NULL
      // 1. SELECT returns 0 rows
      const sessions = await client.query('SELECT * FROM evaluation_sessions');
      assert.equal(sessions.rows.length, 0, 'Missing tenant context must return zero sessions');

      // 2. INSERT fails closed with RLS check violation
      await assert.rejects(
        async () => {
          await client.query(
            `
            INSERT INTO evaluation_panels (
              organisation_id, event_id, round_evaluation_id, name, order_index
            ) VALUES ($1, $2, (SELECT id FROM round_evaluations LIMIT 1), 'Orphan Panel', 1)
          `,
            [orgAId, eventAId]
          );
        },
        (err) => {
          assert.ok(err.code === '42501' || err.message.includes('policy'));
          return true;
        }
      );
    });
  });

  it('14. Security Hardening: Participant can read their own team\'s published session but cannot read another team\'s session', async () => {
    // 1. First, publish the evaluation as the organiser
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      await client.query("UPDATE round_evaluations SET status = 'published' WHERE round_id = $1", [roundAId]);
    });

    // 2. Student 1 queries sessions
    await withTenantTransaction({ organisationId: orgAId, userId: studentUserId }, async (client) => {
      const student1Sessions = await client.query('SELECT * FROM evaluation_sessions WHERE organisation_id = $1', [orgAId]);
      assert.equal(student1Sessions.rows.length, 1, 'Student 1 must see exactly their own team session');
      assert.equal(student1Sessions.rows[0].team_id, teamAId, 'Session must belong to Team Alpha');
      assert.equal(student1Sessions.rows[0].meeting_url, 'https://meet.google.com/abc-defg-hij');

      // Verify Student 1 cannot see Team Alpha Two session
      const seesTeam2 = student1Sessions.rows.some((s) => s.team_id === teamA2Id);
      assert.equal(seesTeam2, false, 'Student 1 must NOT see Team Alpha Two session');
    });

    // 3. Student 2 queries sessions
    await withTenantTransaction({ organisationId: orgAId, userId: student2UserId }, async (client) => {
      const student2Sessions = await client.query('SELECT * FROM evaluation_sessions WHERE organisation_id = $1', [orgAId]);
      assert.equal(student2Sessions.rows.length, 1, 'Student 2 must see exactly their own team session');
      assert.equal(student2Sessions.rows[0].team_id, teamA2Id, 'Session must belong to Team Alpha Two');
      assert.equal(student2Sessions.rows[0].meeting_url, 'https://meet.google.com/team2-secret-link');

      // Verify Student 2 cannot see Team Alpha session
      const seesTeam1 = student2Sessions.rows.some((s) => s.team_id === teamAId);
      assert.equal(seesTeam1, false, 'Student 2 must NOT see Team Alpha session');
    });
  });

  it('15. Security Hardening: Organiser retains full management access across round evaluations, panels, judges, and sessions', async () => {
    await withTenantTransaction({ organisationId: orgAId, userId: ownerUserId }, async (client) => {
      // 1. Organiser sees all sessions in their organisation
      const allSessions = await client.query('SELECT * FROM evaluation_sessions WHERE organisation_id = $1', [orgAId]);
      assert.equal(allSessions.rows.length, 2, 'Organiser must see all sessions (both Team 1 and Team 2)');

      // 2. Organiser can update session details
      const updateRes = await client.query(
        "UPDATE evaluation_sessions SET meeting_url = 'https://meet.google.com/organiser-verified' WHERE team_id = $1 RETURNING id",
        [teamAId]
      );
      assert.equal(updateRes.rowCount, 1, 'Organiser must be able to update sessions');

      // 3. Organiser can read panels and judges
      const panels = await client.query('SELECT * FROM evaluation_panels WHERE organisation_id = $1', [orgAId]);
      assert.ok(panels.rows.length >= 1, 'Organiser must see panels');

      const judges = await client.query('SELECT * FROM evaluation_panel_judges WHERE organisation_id = $1', [orgAId]);
      assert.ok(judges.rows.length >= 1, 'Organiser must see panel judges');
    });
  });
});
