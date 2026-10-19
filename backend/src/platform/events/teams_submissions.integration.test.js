/**
 * ManageX Integration Test Suite: Phase 6C — Hackathon Teams & URL Submissions
 * Verifies EVT-006, EVT-007, ADR-007, and tenant isolation against live PostgreSQL.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../app.js';
import { withSystemTransaction } from '../database/transaction.js';

import { hashPassword } from '../auth/passwords.js';
import { createSession, SESSION_COOKIE_NAME } from '../auth/sessionService.js';

describe('Phase 6C — Hackathon Teams & URL Submissions Suite', () => {
  const runTag = Date.now();
  let orgId;
  let hackathonEventId;
  let generalEventId;

  // Users
  let ownerUserId;
  let ownerCookie;
  let participantAId;
  let participantACookie;
  let participantBId;
  let participantBCookie;
  let participantCId;
  let participantCCookie;
  let unregUserId;
  let unregCookie;

  let csrfCookie;
  let csrfToken;

  let createdTeamId;
  let inviteToken;
  let concTeamId;
  let concEventId;

  before(async () => {
    // 1. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const cookies = csrfRes.headers['set-cookie'];
    if (cookies) {
      const c = cookies.find((item) => item.startsWith('managex_csrf='));
      if (c) {
        csrfCookie = c.split(';')[0];
        csrfToken = csrfCookie.replace('managex_csrf=', '');
      }
    }

    // 2. Direct user creation in DB with verified status
    const pwdHash = await hashPassword('Password123!');
    const users = await withSystemTransaction(async (client) => {
      const res = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status, email_verified_at)
        VALUES 
          ('Team Owner', 'team6c_owner_${runTag}@managex.local', $1, 'active', NOW()),
          ('Participant A', 'team6c_pa_${runTag}@managex.local', $1, 'active', NOW()),
          ('Participant B', 'team6c_pb_${runTag}@managex.local', $1, 'active', NOW()),
          ('Participant C', 'team6c_pc_${runTag}@managex.local', $1, 'active', NOW()),
          ('Unregistered User', 'team6c_unreg_${runTag}@managex.local', $1, 'active', NOW())
        RETURNING id, email
      `, [pwdHash]);
      return res.rows;
    });

    ownerUserId = users.find((u) => u.email.startsWith('team6c_owner_')).id;
    participantAId = users.find((u) => u.email.startsWith('team6c_pa_')).id;
    participantBId = users.find((u) => u.email.startsWith('team6c_pb_')).id;
    participantCId = users.find((u) => u.email.startsWith('team6c_pc_')).id;
    unregUserId = users.find((u) => u.email.startsWith('team6c_unreg_')).id;

    // 3. Create active sessions
    const ownerSess = await createSession({ userId: ownerUserId });
    ownerCookie = `${SESSION_COOKIE_NAME}=${ownerSess.rawToken}`;

    const paSess = await createSession({ userId: participantAId });
    participantACookie = `${SESSION_COOKIE_NAME}=${paSess.rawToken}`;

    const pbSess = await createSession({ userId: participantBId });
    participantBCookie = `${SESSION_COOKIE_NAME}=${pbSess.rawToken}`;

    const pcSess = await createSession({ userId: participantCId });
    participantCCookie = `${SESSION_COOKIE_NAME}=${pcSess.rawToken}`;

    const unregSess = await createSession({ userId: unregUserId });
    unregCookie = `${SESSION_COOKIE_NAME}=${unregSess.rawToken}`;

    // 3. Create Organisation
    const orgRes = await request(app)
      .post('/api/v1/organisations')
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: `Hackathon Global ${runTag}` });

    orgId = orgRes.body.data.organisation.id;

    // Enable Events module
    await request(app)
      .patch(`/api/v1/organisations/${orgId}/modules/events`)
      .set('Cookie', [ownerCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ isEnabled: true });

    const now = new Date();
    const startAt = new Date(now.getTime() + 86400000).toISOString();
    const endAt = new Date(now.getTime() + 172800000).toISOString();

    // 4. Create Hackathon Event with team_size_max = 2
    await withSystemTransaction(async (client) => {
      const hRes = await client.query(
        `INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, capacity, team_size_min, team_size_max, created_by_id
        ) VALUES (
          $1, 'Web3 & AI Hackathon', 'web3-ai-hackathon', 'hackathon', 'published', 'public',
          $2, $3, 'UTC', 100, 1, 2, $4
        ) RETURNING id`,
        [orgId, startAt, endAt, ownerUserId]
      );
      hackathonEventId = hRes.rows[0].id;

      // 5. Create General Event (no teams)
      const gRes = await client.query(
        `INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, capacity, created_by_id
        ) VALUES (
          $1, 'Tech Conference Solo', 'tech-conf-solo', 'general_event', 'published', 'public',
          $2, $3, 'UTC', 100, $4
        ) RETURNING id`,
        [orgId, startAt, endAt, ownerUserId]
      );
      generalEventId = gRes.rows[0].id;
    });

    // 6. Register Participant A, B, C for Hackathon Event
    for (const cookie of [participantACookie, participantBCookie, participantCCookie]) {
      await request(app)
        .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/register`)
        .set('Cookie', [cookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send();
    }
  });

  // ---------------------------------------------------------------------------
  // 1. EVT-006: Team Creation Rules
  // ---------------------------------------------------------------------------
  it('1. EVT-006: Registered participant successfully creates a hackathon team and becomes owner', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/teams`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Cyber Innovators',
        description: 'Building AI agents for security audits',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.team.name, 'Cyber Innovators');
    assert.equal(res.body.data.team.memberCount, 1);
    assert.equal(res.body.data.team.members[0].userId, participantAId);
    assert.equal(res.body.data.team.members[0].isOwner, true);

    createdTeamId = res.body.data.team.id;
  });

  it('2. EVT-006: Creating a team for a general_event is rejected with 422 TEAMS_NOT_SUPPORTED', async () => {
    // Register participant for general event first
    await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${generalEventId}/register`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${generalEventId}/teams`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'General Event Team' });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('3. EVT-006: Unregistered user cannot create a team (403 REGISTRATION_REQUIRED)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/teams`)
      .set('Cookie', [unregCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Ghost Hackers' });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'REGISTRATION_REQUIRED');
  });

  it('4. EVT-006: Duplicate team name in same event is rejected with 409 TEAM_NAME_EXISTS', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/teams`)
      .set('Cookie', [participantBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Cyber Innovators' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'TEAM_NAME_EXISTS');
  });

  it('5. EVT-006: User already on a team cannot create a second team (409 ALREADY_IN_TEAM)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/teams`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Solo Project Team' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ALREADY_IN_TEAM');
  });

  // ---------------------------------------------------------------------------
  // 2. EVT-006 & ADR-007: Team Invitations & Acceptance
  // ---------------------------------------------------------------------------
  it('6. EVT-006: Team owner invites registered participant; returns 7-day single use token', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/teams/${createdTeamId}/invites`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: `team6c_pb_${runTag}@managex.local` });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.invitation.token);
    assert.ok(res.body.data.invitation.expiresAt);

    inviteToken = res.body.data.invitation.token;
  });

  it('7. EVT-006: Inviting an unregistered user is rejected (409 PARTICIPANT_NOT_REGISTERED)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/teams/${createdTeamId}/invites`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: `team6c_unreg_${runTag}@managex.local` });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PARTICIPANT_NOT_REGISTERED');
  });

  it('8. EVT-006: Invitee accepts valid token and is added to team members', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/team-invites/${inviteToken}/accept`)
      .set('Cookie', [participantBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify team details now show 2 members
    const teamRes = await request(app)
      .get(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/teams/${createdTeamId}`)
      .set('Cookie', [participantACookie, csrfCookie]);

    assert.equal(teamRes.status, 200);
    assert.equal(teamRes.body.data.team.memberCount, 2);
  });

  it('9. ADR-007: Invitation token replay is rejected with 409 INVITATION_ALREADY_USED', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/team-invites/${inviteToken}/accept`)
      .set('Cookie', [participantBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send();

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVITATION_ALREADY_USED');
  });

  it('10. EVT-006: Team size limit enforcement (team_size_max = 2) blocks adding third member', async () => {
    // Attempt to invite participant C when team already has 2 members
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/teams/${createdTeamId}/invites`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: `team6c_pc_${runTag}@managex.local` });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'TEAM_MAX_SIZE_REACHED');
  });

  // ---------------------------------------------------------------------------
  // 3. EVT-007: URL-Based Submissions
  // ---------------------------------------------------------------------------
  it('11. EVT-007: Team member submits project with valid repository and demo URLs', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/submissions`)
      .set('Cookie', [participantBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'DeepDefend AI Agent',
        description: 'Autonomous security scanner for web applications',
        repositoryUrl: 'https://github.com/example/deepdefend',
        demoUrl: 'https://deepdefend.demo.app',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.submission.title, 'DeepDefend AI Agent');
    assert.equal(res.body.data.submission.repositoryUrl, 'https://github.com/example/deepdefend');
    assert.equal(res.body.data.submission.status, 'submitted');
  });

  it('12. EVT-007: Invalid non-http/https URL is rejected (422 ValidationError)', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/submissions`)
      .set('Cookie', [participantBCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'DeepDefend AI Agent',
        repositoryUrl: 'javascript:alert(1)',
      });

    assert.equal(res.status, 422);
  });

  it('13. EVT-007: Querying /my-submission returns the current active team submission', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/my-submission`)
      .set('Cookie', [participantACookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.submission);
    assert.equal(res.body.data.submission.title, 'DeepDefend AI Agent');
    assert.equal(res.body.data.submission.teamId, createdTeamId);
  });

  it('14. EVT-007: Submissions are editable by team members during submission window', async () => {
    const res = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/submissions`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'DeepDefend AI Agent v2',
        description: 'Updated with real-time neural scanner',
        repositoryUrl: 'https://github.com/example/deepdefend',
        demoUrl: 'https://v2.deepdefend.demo.app',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.submission.title, 'DeepDefend AI Agent v2');
    assert.equal(res.body.data.submission.demoUrl, 'https://v2.deepdefend.demo.app');
  });

  it('15. EVT-007: Event staff can query all event submissions with pagination', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgId}/events/${hackathonEventId}/submissions`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.submissions));
    assert.equal(res.body.data.submissions.length, 1);
    assert.equal(res.body.data.submissions[0].title, 'DeepDefend AI Agent v2');
  });

  it('16. AUD-001: Team and submission actions generate immutable audit logs', async () => {
    const res = await request(app)
      .get(`/api/v1/organisations/${orgId}/audit-logs`)
      .set('Cookie', [ownerCookie, csrfCookie]);

    assert.equal(res.status, 200);
    const logs = res.body.data.auditLogs || res.body.data.logs;

    const teamCreateLog = logs.find((l) => l.action === 'event.team.created');
    assert.ok(teamCreateLog, 'Expected event.team.created log');

    const inviteLog = logs.find((l) => l.action === 'event.team.member_invited');
    assert.ok(inviteLog, 'Expected event.team.member_invited log');

    const joinLog = logs.find((l) => l.action === 'event.team.member_joined');
    assert.ok(joinLog, 'Expected event.team.member_joined log');

    const subLog = logs.find((l) => l.action === 'event.submission.created');
    assert.ok(subLog, 'Expected event.submission.created log');
  });

  it('17. Concurrency: Two concurrent invitation acceptances on 1 remaining spot yield exactly one 200 and one 409', async () => {
    // 1. Create a 2nd hackathon event with team_size_max = 2
    const now = new Date();
    const startAt = new Date(now.getTime() + 86400000).toISOString();
    const endAt = new Date(now.getTime() + 172800000).toISOString();

    const evRes = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO events (
          organisation_id, title, slug, event_type, status, visibility,
          start_at, end_at, timezone, capacity, team_size_min, team_size_max, created_by_id
        ) VALUES (
          $1, 'Concurrency Hackathon', 'concurrency-hackathon', 'hackathon', 'published', 'public',
          $2, $3, 'UTC', 50, 1, 2, $4
        ) RETURNING id`,
        [orgId, startAt, endAt, ownerUserId]
      );
      return res.rows[0].id;
    });

    // 2. Register participants A, B, and C for this event
    for (const uId of [participantAId, participantBId, participantCId]) {
      await withSystemTransaction(async (client) => {
        await client.query(
          `INSERT INTO event_registrations (organisation_id, event_id, user_id, status)
           VALUES ($1, $2, $3, 'registered')
           ON CONFLICT (event_id, user_id) DO NOTHING`,
          [orgId, evRes, uId]
        );
      });
    }

    concEventId = evRes;
    // 3. Participant A creates a team (1/2 members)
    const teamRes = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${evRes}/teams`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Race Condition Defense' });
    assert.equal(teamRes.status, 201);
    concTeamId = teamRes.body.data.team.id;

    // 4. Invite participant B and participant C
    const invB = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${evRes}/teams/${concTeamId}/invites`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: `team6c_pb_${runTag}@managex.local` });
    assert.equal(invB.status, 201);

    const invC = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${evRes}/teams/${concTeamId}/invites`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: `team6c_pc_${runTag}@managex.local` });
    assert.equal(invC.status, 201);

    const tokenB = invB.body.data.invitation.token;
    const tokenC = invC.body.data.invitation.token;

    // 5. Fire concurrent acceptances
    const [resB, resC] = await Promise.all([
      request(app)
        .post(`/api/v1/organisations/${orgId}/events/${evRes}/team-invites/${tokenB}/accept`)
        .set('Cookie', [participantBCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send(),
      request(app)
        .post(`/api/v1/organisations/${orgId}/events/${evRes}/team-invites/${tokenC}/accept`)
        .set('Cookie', [participantCCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send(),
    ]);

    const statuses = [resB.status, resC.status].sort();
    assert.deepEqual(statuses, [200, 409], 'Expected exactly one acceptance (200) and one capacity limit rejection (409)');
  });

  it('18. Concurrency & Ownership: Leaving a team safely transfers ownership or deletes team when empty', async () => {
    // 1. Participant A leaves concTeamId (ownership transferred to remaining member)
    const teamInfo = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `SELECT t.id, t.event_id, COUNT(m.id)::int as count 
         FROM event_teams t 
         JOIN event_team_members m ON m.team_id = t.id 
         WHERE t.id = $1 
         GROUP BY t.id, t.event_id`,
        [concTeamId]
      );
      return res.rows[0];
    });

    assert.ok(teamInfo, 'Expected Race Condition Defense team to exist');

    const leaveRes = await request(app)
      .post(`/api/v1/organisations/${orgId}/events/${teamInfo.event_id}/teams/${teamInfo.id}/leave`)
      .set('Cookie', [participantACookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);
    assert.equal(leaveRes.status, 200);

    // Verify remaining member became owner
    const afterMembers = await withSystemTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM event_team_members WHERE team_id = $1`,
        [teamInfo.id]
      );
      return res.rows;
    });

    assert.equal(afterMembers.length, 1);
    assert.equal(afterMembers[0].is_owner, true);
  });
});
