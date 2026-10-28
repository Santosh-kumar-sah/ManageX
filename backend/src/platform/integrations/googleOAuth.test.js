/**
 * ManageX Google OAuth 2.0 Integration Test Suite (Phase 1B.3)
 * Strictly adheres to docs/google-meet-integration-plan.md (Sections 4, 8.2, 9, 10.1, 11.2, 12).
 *
 * Verifies:
 * - Adapter functions rowToCryptoEnvelope & cryptoEnvelopeToRow (Section 8.2)
 * - State token generation & hashing (Section 4.1)
 * - Anti-CSRF double-submit cookie nonce verification
 * - Single-use state consumption & replay prevention (Section 4.1, 4.2)
 * - Two-phase RLS context transition without platform-admin bypass
 * - Single-use state burn on permission failure
 * - External HTTP token exchange and user info retrieval
 * - Credential persistence with AES-256-GCM encryption
 * - Re-authorization refresh token preservation
 * - Status query with zero secrets leaked
 * - Safe disconnect with upstream revocation and local credential erasure to NULL
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
// Deterministic test key (64 hex characters = 32 bytes)
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Configure test environment variables before module evaluation
process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
process.env.TOKEN_ENCRYPTION_KEY_VERSION = '1';
process.env.GOOGLE_CLIENT_ID = 'test_client_id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:4000/api/v1/integrations/google/callback';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://managex_app:managex_app_password@localhost:5433/managex_test';

const tokenCrypto = await import('../common/crypto.js');
const {
  rowToCryptoEnvelope,
  cryptoEnvelopeToRow,
  generateOAuthState,
  buildAuthorizationUrl,
  consumeOAuthStateAndVerifyPermission,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  saveGoogleCredentials,
  getGoogleIntegrationStatus,
  disconnectGoogleIntegration,
  refreshAccessToken,
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
  GOOGLE_REVOKE_ENDPOINT,
  GOOGLE_OAUTH_SCOPES,
} = await import('./googleOAuthService.js');
const { withSystemTransaction, withTenantTransaction } = await import('../database/transaction.js');
const { closePool } = await import('../database/pool.js');
const { createApp } = await import('../../app.js');
const { createSession, SESSION_COOKIE_NAME } = await import('../auth/sessionService.js');

describe('ManageX Google OAuth 2.0 Integration Suite (Phase 1B.3)', () => {
  let sharedOrgId;
  let sharedAdminUserId;
  let sharedMemberUserId;

  // ===========================================================================
  // 1. Adapter Contract Tests (Section 8.2)
  // ===========================================================================
  describe('1. Crypto Envelope <-> Database Row Adapter (Section 8.2)', () => {
    test('cryptoEnvelopeToRow maps camelCase envelope to snake_case DB columns', () => {
      const envelope = {
        version: 1,
        keyVersion: '1',
        iv: '0123456789abcdef01234567',
        tag: 'abcdef0123456789abcdef0123456789',
        ciphertext: 'deadbeefcafe',
      };

      const row = cryptoEnvelopeToRow(envelope);
      assert.deepEqual(row, {
        envelope_version: 1,
        key_version: '1',
        token_iv: '0123456789abcdef01234567',
        token_auth_tag: 'abcdef0123456789abcdef0123456789',
        encrypted_refresh_token: 'deadbeefcafe',
      });
    });

    test('rowToCryptoEnvelope maps snake_case DB columns to camelCase envelope', () => {
      const dbRow = {
        envelope_version: 1,
        key_version: '2',
        token_iv: '0123456789abcdef01234567',
        token_auth_tag: 'abcdef0123456789abcdef0123456789',
        encrypted_refresh_token: 'deadbeefcafe',
      };

      const envelope = rowToCryptoEnvelope(dbRow);
      assert.deepEqual(envelope, {
        version: 1,
        keyVersion: '2',
        iv: '0123456789abcdef01234567',
        tag: 'abcdef0123456789abcdef0123456789',
        ciphertext: 'deadbeefcafe',
      });
    });

    test('adapters return null for null or incomplete inputs', () => {
      assert.equal(cryptoEnvelopeToRow(null), null);
      assert.equal(rowToCryptoEnvelope(null), null);
      assert.equal(rowToCryptoEnvelope({ envelope_version: 1 }), null);
    });

    test('crypto.encrypt output maps to DB row and back, preserving round-trip decryption', () => {
      const secretToken = '1//04test_google_refresh_token_xyz_123';
      const envelope = tokenCrypto.encrypt(secretToken, { key: TEST_KEY, keyVersion: '1' });

      // Map to DB row representation
      const dbRow = cryptoEnvelopeToRow(envelope);
      assert.ok(dbRow.encrypted_refresh_token);
      assert.ok(dbRow.token_iv);
      assert.ok(dbRow.token_auth_tag);
      assert.equal(dbRow.envelope_version, 1);
      assert.equal(dbRow.key_version, '1');

      // Map back to envelope
      const restoredEnvelope = rowToCryptoEnvelope(dbRow);
      const decrypted = tokenCrypto.decrypt(restoredEnvelope, { key: TEST_KEY });
      assert.equal(decrypted, secretToken);
    });
  });

  // ===========================================================================
  // 2. Authorization URL Builder Tests
  // ===========================================================================
  describe('2. Authorization URL Builder', () => {
    test('builds valid Google OAuth URL with prompt=consent, access_type=offline and required scopes', () => {
      const rawState = 'state_test_nonce_1234567890abcdef';
      const urlString = buildAuthorizationUrl({ rawStateToken: rawState });
      const parsed = new URL(urlString);

      assert.equal(parsed.origin + parsed.pathname, GOOGLE_AUTH_ENDPOINT);
      assert.equal(parsed.searchParams.get('response_type'), 'code');
      assert.equal(parsed.searchParams.get('access_type'), 'offline');
      assert.equal(parsed.searchParams.get('prompt'), 'consent');
      assert.equal(parsed.searchParams.get('state'), rawState);
      assert.ok(parsed.searchParams.get('scope').includes('calendar.events'));
      assert.ok(parsed.searchParams.get('scope').includes('userinfo.email'));
    });
  });

  // ===========================================================================
  // 3. HTTP Gateway & Mocked API Tests (Token Exchange & Revocation)
  // ===========================================================================
  describe('3. External HTTP Gateway (Token Exchange & Revocation)', () => {
    const originalFetch = globalThis.fetch;

    after(() => {
      globalThis.fetch = originalFetch;
    });

    test('exchangeCodeForTokens parses successful token response', async () => {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, GOOGLE_TOKEN_ENDPOINT);
        assert.equal(options.method, 'POST');
        return new Response(
          JSON.stringify({
            access_token: 'mock_access_token_123',
            refresh_token: 'mock_refresh_token_456',
            scope: GOOGLE_OAUTH_SCOPES.join(' '),
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await exchangeCodeForTokens({ code: 'valid_mock_code' });
      assert.equal(result.accessToken, 'mock_access_token_123');
      assert.equal(result.refreshToken, 'mock_refresh_token_456');
      assert.equal(result.expiresIn, 3600);
      assert.deepEqual(result.scopes, GOOGLE_OAUTH_SCOPES);
    });

    test('exchangeCodeForTokens throws GOOGLE_TOKEN_EXCHANGE_FAILED on upstream 400 error', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Code has expired' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        () => exchangeCodeForTokens({ code: 'expired_code' }),
        (err) => err.code === 'GOOGLE_TOKEN_EXCHANGE_FAILED' && err.statusCode === 502
      );
    });

    test('getGoogleUserInfo parses connected email address', async () => {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, GOOGLE_USERINFO_ENDPOINT);
        assert.equal(options.headers.Authorization, 'Bearer mock_token');
        return new Response(
          JSON.stringify({ email: 'admin@managex-domain.com', verified_email: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const info = await getGoogleUserInfo({ accessToken: 'mock_token' });
      assert.equal(info.email, 'admin@managex-domain.com');
      assert.equal(info.verifiedEmail, true);
    });

    test('getGoogleUserInfo throws GOOGLE_EMAIL_MISSING if response lacks email', async () => {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ id: '123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await assert.rejects(
        () => getGoogleUserInfo({ accessToken: 'token_without_email' }),
        (err) => err.code === 'GOOGLE_EMAIL_MISSING'
      );
    });
  });

  // ===========================================================================
  // 4. Database RLS & State Lifecycle Tests (managex_test)
  // ===========================================================================
  describe('4. Database RLS, State Lifecycle & Tenant Elevation (managex_test)', () => {
    const runId = randomUUID().slice(0, 8);
    const testEmailAdmin = `oauth_admin_${runId}@managex.local`;
    const testEmailMember = `oauth_member_${runId}@managex.local`;
    const testOrgSlug = `oauth-test-org-${runId}`;

    let orgId;
    let adminUserId;
    let memberUserId;
    let adminMembershipId;
    let memberMembershipId;
    let orgAdminRoleId;

    before(async () => {
      // Seed test environment in managex_test
      await withSystemTransaction(async (client) => {
        // Assert test database
        const dbCheck = await client.query('SELECT current_database() AS name');
        if (dbCheck.rows[0].name !== 'managex_test') {
          throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbCheck.rows[0].name}`);
        }

        // Fetch organisation_admin role ID
        const roleRes = await client.query("SELECT id FROM roles WHERE slug = 'organisation_admin' AND is_system = true");
        assert.ok(roleRes.rows.length > 0, 'organisation_admin role must exist');
        orgAdminRoleId = roleRes.rows[0].id;

        // Create Admin User & Member User
        const adminRes = await client.query(
          `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
           VALUES ($1, 'OAuth Admin', 'hash', 'active', NOW())
           RETURNING id`,
          [testEmailAdmin]
        );
        adminUserId = adminRes.rows[0].id;

        const memberRes = await client.query(
          `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
           VALUES ($1, 'OAuth Member', 'hash', 'active', NOW())
           RETURNING id`,
          [testEmailMember]
        );
        memberUserId = memberRes.rows[0].id;

        // Create Organisation
        const orgRes = await client.query(
          `INSERT INTO organisations (name, slug, status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [`OAuth Test Org ${runId}`, testOrgSlug]
        );
        orgId = orgRes.rows[0].id;

        // Create Admin Membership with organisation_admin role (has org.update)
        const adminMemRes = await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [orgId, adminUserId]
        );
        adminMembershipId = adminMemRes.rows[0].id;

        await client.query(
          `INSERT INTO membership_roles (membership_id, role_id, organisation_id)
           VALUES ($1, $2, $3)`,
          [adminMembershipId, orgAdminRoleId, orgId]
        );

        // Create Regular Member Membership (no org.update role)
        const memberMemRes = await client.query(
          `INSERT INTO organisation_memberships (organisation_id, user_id, status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [orgId, memberUserId]
        );
        memberMembershipId = memberMemRes.rows[0].id;

        sharedOrgId = orgId;
        sharedAdminUserId = adminUserId;
        sharedMemberUserId = memberUserId;
      });
    });

    after(async () => {
      // Clean up tenant records
      if (orgId && adminUserId) {
        await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
          await client.query('DELETE FROM organisation_integrations WHERE organisation_id = $1', [orgId]);
          await client.query('DELETE FROM oauth_states WHERE organisation_id = $1', [orgId]);
        });
      }
      if (orgId) {
        await withSystemTransaction(async (client) => {
          await client.query('DELETE FROM membership_roles WHERE organisation_id = $1', [orgId]);
          await client.query('DELETE FROM organisation_memberships WHERE organisation_id = $1', [orgId]);
          await client.query('DELETE FROM organisations WHERE id = $1', [orgId]);
          await client.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUserId, memberUserId]);
        });
      }
    });

    test('generateOAuthState generates and persists state token with user-isolated RLS', async () => {
      const { rawStateToken, expiresAt } = await generateOAuthState({
        organisationId: orgId,
        userId: adminUserId,
      });

      assert.ok(rawStateToken && rawStateToken.length === 64);
      assert.ok(expiresAt > new Date());

      // Assert state token is readable by admin user
      await withTenantTransaction({ userId: adminUserId, organisationId: '' }, async (client) => {
        const res = await client.query(
          'SELECT id, organisation_id, user_id, used_at FROM oauth_states WHERE user_id = $1',
          [adminUserId]
        );
        assert.ok(res.rows.length >= 1);
        assert.equal(res.rows[0].organisation_id, orgId);
        assert.equal(res.rows[0].used_at, null);
      });

      // Assert state token is NOT visible to member user (user isolation RLS)
      await withTenantTransaction({ userId: memberUserId, organisationId: '' }, async (client) => {
        const res = await client.query(
          'SELECT id FROM oauth_states WHERE user_id = $1',
          [adminUserId]
        );
        assert.equal(res.rows.length, 0); // RLS blocks reading admin's state
      });
    });

    test('consumeOAuthStateAndVerifyPermission rejects nonce cookie mismatch', async () => {
      const { rawStateToken } = await generateOAuthState({ organisationId: orgId, userId: adminUserId });

      await assert.rejects(
        () => consumeOAuthStateAndVerifyPermission({
          rawStateToken,
          cookieNonce: 'wrong_cookie_nonce',
          userId: adminUserId,
        }),
        (err) => err.code === 'OAUTH_STATE_MISMATCH' && err.statusCode === 403
      );
    });

    test('consumeOAuthStateAndVerifyPermission succeeds for Admin and atomically burns state token', async () => {
      const { rawStateToken } = await generateOAuthState({ organisationId: orgId, userId: adminUserId });

      // First consumption succeeds
      const result = await consumeOAuthStateAndVerifyPermission({
        rawStateToken,
        cookieNonce: rawStateToken,
        userId: adminUserId,
      });
      assert.equal(result.organisationId, orgId);

      // Replay attack assertion: second attempt with exact same state fails immediately
      await assert.rejects(
        () => consumeOAuthStateAndVerifyPermission({
          rawStateToken,
          cookieNonce: rawStateToken,
          userId: adminUserId,
        }),
        (err) => err.code === 'OAUTH_STATE_INVALID_OR_EXPIRED' && err.statusCode === 403
      );
    });

    test('consumeOAuthStateAndVerifyPermission burns state token on permission failure', async () => {
      // Member user initiates state
      const { rawStateToken } = await generateOAuthState({ organisationId: orgId, userId: memberUserId });

      // Member attempts callback consumption: burns state and fails with 403 FORBIDDEN
      await assert.rejects(
        () => consumeOAuthStateAndVerifyPermission({
          rawStateToken,
          cookieNonce: rawStateToken,
          userId: memberUserId,
        }),
        (err) => err.code === 'FORBIDDEN' && err.statusCode === 403
      );

      // Prove token was burned: subsequent attempt fails with OAUTH_STATE_INVALID_OR_EXPIRED
      await assert.rejects(
        () => consumeOAuthStateAndVerifyPermission({
          rawStateToken,
          cookieNonce: rawStateToken,
          userId: memberUserId,
        }),
        (err) => err.code === 'OAUTH_STATE_INVALID_OR_EXPIRED' && err.statusCode === 403
      );
    });

    test('saveGoogleCredentials encrypts token via AES-256-GCM and persists in organisation_integrations', async () => {
      const rawRefreshToken = '1//04test_refresh_token_super_secret_xyz';
      const connectedEmail = 'workspace-admin@testorg.local';

      const saved = await saveGoogleCredentials({
        organisationId: orgId,
        userId: adminUserId,
        refreshToken: rawRefreshToken,
        connectedEmail,
        scopes: GOOGLE_OAUTH_SCOPES,
      });

      assert.equal(saved.status, 'connected');
      assert.equal(saved.connectedEmail, connectedEmail);
      assert.deepEqual(saved.scopes, GOOGLE_OAUTH_SCOPES);

      // Verify database record has encrypted columns populated
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `SELECT envelope_version, key_version, token_iv, token_auth_tag, encrypted_refresh_token
           FROM organisation_integrations
           WHERE organisation_id = $1 AND provider = 'google'`,
          [orgId]
        );

        assert.equal(res.rows.length, 1);
        const row = res.rows[0];
        assert.ok(row.encrypted_refresh_token);
        assert.ok(row.token_iv);
        assert.ok(row.token_auth_tag);
        assert.notEqual(row.encrypted_refresh_token, rawRefreshToken); // Never stored in plaintext

        // Decrypt using crypto adapter
        const envelope = rowToCryptoEnvelope(row);
        const decrypted = tokenCrypto.decrypt(envelope);
        assert.equal(decrypted, rawRefreshToken);
      });
    });

    test('saveGoogleCredentials preserves existing refresh token when Google omits it on re-authorization', async () => {
      const newConnectedEmail = 'workspace-admin-updated@testorg.local';

      // Re-authorize with refreshToken = undefined / null
      const updated = await saveGoogleCredentials({
        organisationId: orgId,
        userId: adminUserId,
        refreshToken: null, // Google omitted refresh token
        connectedEmail: newConnectedEmail,
      });

      assert.equal(updated.connectedEmail, newConnectedEmail);
      assert.equal(updated.status, 'connected');

      // Verify the previous encrypted token was preserved
      await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
        const res = await client.query(
          `SELECT envelope_version, key_version, token_iv, token_auth_tag, encrypted_refresh_token
           FROM organisation_integrations WHERE organisation_id = $1`,
          [orgId]
        );
        assert.ok(res.rows[0].encrypted_refresh_token);
        const envelope = rowToCryptoEnvelope(res.rows[0]);
        // Still decrypts to original refresh token
        assert.equal(tokenCrypto.decrypt(envelope), '1//04test_refresh_token_super_secret_xyz');
      });
    });

    test('getGoogleIntegrationStatus returns status with ZERO secret columns exposed', async () => {
      const status = await getGoogleIntegrationStatus({ organisationId: orgId });
      assert.equal(status.isConnected, true);
      assert.equal(status.status, 'connected');
      assert.equal(status.provider, 'google');
      assert.ok(status.connectedEmail);

      // Security invariant: zero secret or cryptographic internals exposed in response
      assert.equal(status.encrypted_refresh_token, undefined);
      assert.equal(status.encryptedRefreshToken, undefined);
      assert.equal(status.token_iv, undefined);
      assert.equal(status.tokenIv, undefined);
      assert.equal(status.token_auth_tag, undefined);
      assert.equal(status.tokenAuthTag, undefined);
      assert.equal(status.key_version, undefined);
      assert.equal(status.envelope_version, undefined);
    });

    test('disconnectGoogleIntegration erases credentials to NULL and marks status revoked', async () => {
      const originalFetch = globalThis.fetch;
      let revokeCalled = false;

      globalThis.fetch = async (url) => {
        if (url === GOOGLE_REVOKE_ENDPOINT) {
          revokeCalled = true;
          return new Response('{}', { status: 200 });
        }
        return originalFetch(url);
      };

      try {
        const result = await disconnectGoogleIntegration({
          organisationId: orgId,
          userId: adminUserId,
        });

        assert.equal(result.success, true);
        assert.equal(revokeCalled, true);

        // Verify local credential erasure in PostgreSQL
        await withTenantTransaction({ userId: adminUserId, organisationId: orgId }, async (client) => {
          const res = await client.query(
            `SELECT status, encrypted_refresh_token, token_iv, token_auth_tag
             FROM organisation_integrations
             WHERE organisation_id = $1 AND provider = 'google'`,
            [orgId]
          );

          assert.equal(res.rows.length, 1);
          assert.equal(res.rows[0].status, 'revoked');
          assert.equal(res.rows[0].encrypted_refresh_token, null);
          assert.equal(res.rows[0].token_iv, null);
          assert.equal(res.rows[0].token_auth_tag, null);
        });

        // Verify status query reflects disconnected
        const statusAfter = await getGoogleIntegrationStatus({ organisationId: orgId });
        assert.equal(statusAfter.isConnected, false);
        assert.equal(statusAfter.status, 'revoked');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // ===========================================================================
    // 5. Express Integration Routes & Authorization Guards
    // ===========================================================================
    describe('5. Express Integration Routes & Authorization Guards', () => {
      const app = createApp();
      let adminCookie = '';
      let memberCookie = '';
      let csrfCookie = '';
      let csrfToken = '';

      async function getCsrf() {
        if (!csrfToken) {
          const healthRes = await request(app).get('/api/v1/health');
          const setCookies = healthRes.headers['set-cookie'] || [];
          const csrfRaw = setCookies.find((c) => c.startsWith('managex_csrf='));
          if (csrfRaw) {
            csrfCookie = csrfRaw.split(';')[0];
            csrfToken = csrfCookie.split('=')[1];
          }
        }
        return { csrfCookie, csrfToken };
      }

      async function getAdminCookie() {
        if (!adminCookie) {
          assert.ok(adminUserId, 'adminUserId must be initialized by suite setup');
          const adminSession = await createSession({ userId: adminUserId });
          adminCookie = `${SESSION_COOKIE_NAME}=${adminSession.rawToken}`;
        }
        return adminCookie;
      }

      async function getMemberCookie() {
        if (!memberCookie) {
          assert.ok(memberUserId, 'memberUserId must be initialized by suite setup');
          const memberSession = await createSession({ userId: memberUserId });
          memberCookie = `${SESSION_COOKIE_NAME}=${memberSession.rawToken}`;
        }
        return memberCookie;
      }

      test('GET /google/authorize rejects unauthenticated caller with 401', async () => {
        const res = await request(app).get(`/api/v1/organisations/${orgId}/integrations/google/authorize`);
        assert.equal(res.status, 401);
      });

      test('GET /google/authorize rejects member without org.update with 403', async () => {
        const cookie = await getMemberCookie();
        const res = await request(app)
          .get(`/api/v1/organisations/${orgId}/integrations/google/authorize`)
          .set('Cookie', [cookie]);
        assert.equal(res.status, 403);
      });

      test('GET /google/authorize returns 200 with URL and sets nonce cookie for Admin', async () => {
        const cookie = await getAdminCookie();
        const res = await request(app)
          .get(`/api/v1/organisations/${orgId}/integrations/google/authorize?format=json`)
          .set('Cookie', [cookie]);

        assert.equal(res.status, 200);
        assert.ok(res.body.success);
        assert.ok(res.body.data.url.includes('accounts.google.com'));

        const setCookies = res.headers['set-cookie'] || [];
        const nonceCookie = setCookies.find((c) => c.startsWith('managex_oauth_nonce='));
        assert.ok(nonceCookie, 'Must set managex_oauth_nonce cookie');
      });

      test('GET /google/status returns 200 for member and admin', async () => {
        const cookie = await getMemberCookie();
        const res = await request(app)
          .get(`/api/v1/organisations/${orgId}/integrations/google/status`)
          .set('Cookie', [cookie]);

        assert.equal(res.status, 200);
        assert.ok(res.body.success);
        assert.equal(res.body.data.provider, 'google');
        // Zero secrets exposed
        assert.equal(res.body.data.encrypted_refresh_token, undefined);
      });

      test('POST /google/disconnect rejects member without org.update with 403', async () => {
        const cookie = await getMemberCookie();
        const { csrfCookie: cCookie, csrfToken: cToken } = await getCsrf();
        const res = await request(app)
          .post(`/api/v1/organisations/${orgId}/integrations/google/disconnect`)
          .set('Cookie', [cookie, cCookie])
          .set('X-CSRF-Token', cToken);

        assert.equal(res.status, 403);
      });

      test('POST /google/disconnect succeeds for Admin with 200', async () => {
        const cookie = await getAdminCookie();
        const { csrfCookie: cCookie, csrfToken: cToken } = await getCsrf();
        const res = await request(app)
          .post(`/api/v1/organisations/${orgId}/integrations/google/disconnect`)
          .set('Cookie', [cookie, cCookie])
          .set('X-CSRF-Token', cToken);

        assert.equal(res.status, 200);
        assert.ok(res.body.success);
      });
    });
  });

  after(async () => {
    await closePool();
  });
});
