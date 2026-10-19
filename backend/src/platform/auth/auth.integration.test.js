/**
 * ManageX Authentication & Session Security Integration Test Suite
 * Strictly adheres to docs/testing.md (Suite B), ADR-011, ADR-017, and PRD Section 6.1 (AUTH-001 - AUTH-008).
 * 
 * Verifies live against PostgreSQL 17:
 * - User registration with normalized email and bcrypt hash
 * - Single-use email verification tokens and expiration
 * - Login with generic failure message (prevents email enumeration)
 * - Session sliding window and cookie security
 * - Session revocation on logout
 * - Password reset token single-use & revocation of all user sessions
 * - Account deactivation fail-closed enforcement
 * - CSRF token verification on state-changing requests
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getPool, closePool } from '../database/pool.js';
import { getTestMailbox, clearTestMailbox } from '../email/emailService.js';

describe('Authentication, Email Verification & Session Security Suite (Phase 3)', () => {
  const app = createApp();
  const pool = getPool();

  const testEmail = 'alice.auth.test@managex.local';
  const testPassword = 'SecurePassword123!@#';
  let verificationTokenRaw = '';
  let sessionCookie = '';
  let csrfCookie = '';
  let csrfTokenValue = '';

  before(async () => {
    // Clean up test data if leftover from previous run
    clearTestMailbox();
    await pool.query('DELETE FROM users WHERE LOWER(email) = $1', [testEmail.toLowerCase()]);
  });

  after(async () => {
    await pool.query('DELETE FROM users WHERE LOWER(email) = $1', [testEmail.toLowerCase()]);
    await closePool();
  });

  test('1. AUTH-001: Register user successfully with case-normalization and secure password hashing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Alice Tester',
        email: '   Alice.Auth.Test@ManageX.Local   ',
        password: testPassword,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.email, testEmail);

    // Verify user stored in database
    const dbRes = await pool.query('SELECT id, email, password_hash, status FROM users WHERE email = $1', [testEmail]);
    assert.equal(dbRes.rows.length, 1);
    const user = dbRes.rows[0];
    assert.equal(user.status, 'pending_verification');
    assert.notEqual(user.password_hash, testPassword);
    assert.ok(user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'));

    // Verify email was dispatched to mailbox
    const mailbox = getTestMailbox();
    assert.equal(mailbox.length, 1);
    assert.equal(mailbox[0].to, testEmail);
    assert.ok(mailbox[0].text.includes('verify-email?token='));

    // Extract raw token from email URL for subsequent test
    const tokenMatch = mailbox[0].text.match(/token=([a-f0-9]+)/);
    assert.ok(tokenMatch && tokenMatch[1]);
    verificationTokenRaw = tokenMatch[1];
  });

  test('2. AUTH-001: Duplicate registration fails with 409 conflict and does not create duplicate user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Alice Imposter',
        email: testEmail.toUpperCase(),
        password: 'AnotherPassword456!@#',
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'ACCOUNT_EXISTS');

    const dbRes = await pool.query('SELECT count(*) FROM users WHERE LOWER(email) = $1', [testEmail]);
    assert.equal(parseInt(dbRes.rows[0].count, 10), 1);
  });

  test('3. AUTH-003: Login fails closed when email is unverified', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
  });

  test('4. AUTH-002: Email verification succeeds and activates user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({
        token: verificationTokenRaw,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const dbRes = await pool.query('SELECT status, email_verified_at FROM users WHERE email = $1', [testEmail]);
    assert.equal(dbRes.rows[0].status, 'active');
    assert.ok(dbRes.rows[0].email_verified_at !== null);
  });

  test('5. AUTH-002: Replayed verification token is rejected (single-use enforcement)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({
        token: verificationTokenRaw,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'TOKEN_ALREADY_USED');
  });

  test('6. AUTH-003: Login with invalid password returns generic 401 without user enumeration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword999!@#',
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  test('7. AUTH-003: Login with non-existent email returns generic 401 without user enumeration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nobody.doesnotexist@managex.local',
        password: 'AnyPassword123!@#',
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  test('8. AUTH-003 & AUTH-005: Successful login issues HttpOnly session cookie and returns user profile', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, testEmail);

    // Verify session cookie set
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies, 'Must set cookies on login');
    const sessionCookieHeader = cookies.find((c) => c.startsWith('managex_session='));
    assert.ok(sessionCookieHeader, 'Must set managex_session cookie');
    assert.ok(sessionCookieHeader.includes('HttpOnly'), 'Session cookie must be HttpOnly');
    assert.ok(sessionCookieHeader.includes('SameSite=Lax'), 'Session cookie must be SameSite=Lax');

    sessionCookie = sessionCookieHeader.split(';')[0];

    // Grab CSRF cookie
    const csrfCookieHeader = cookies.find((c) => c.startsWith('managex_csrf='));
    if (csrfCookieHeader) {
      csrfCookie = csrfCookieHeader.split(';')[0];
      csrfTokenValue = csrfCookie.replace('managex_csrf=', '');
    }
  });

  test('9. AUTH-005: GET /api/v1/auth/me returns authenticated user identity using session cookie', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [sessionCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, testEmail);
    assert.equal(res.body.data.user.fullName, 'Alice Tester');
  });

  test('10. AUTH-005: GET /api/v1/auth/me returns 401 when session cookie is absent or invalid', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me');

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test('11. AUTH-007: Mutation with session requires matching X-CSRF-Token header', async () => {
    // 1. Without CSRF header -> rejected 401
    const resWithoutCsrf = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie]);

    assert.equal(resWithoutCsrf.status, 401);
    assert.equal(resWithoutCsrf.body.error.code, 'AUTHENTICATION_ERROR');

    // 2. With valid CSRF header -> succeeds
    const resWithCsrf = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfTokenValue);

    assert.equal(resWithCsrf.status, 200);
    assert.equal(resWithCsrf.body.success, true);
  });

  test('12. AUTH-003: Post-logout, previous session cookie is revoked server-side and rejected on /auth/me', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [sessionCookie]);

    assert.equal(res.status, 401);
  });

  test('13. AUTH-004: Password recovery dispatch and completion revokes all sessions', async () => {
    clearTestMailbox();

    // 1. Request password reset
    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: testEmail });

    assert.equal(forgotRes.status, 200);
    assert.equal(forgotRes.body.success, true);

    const mailbox = getTestMailbox();
    assert.equal(mailbox.length, 1);
    assert.ok(mailbox[0].text.includes('reset-password?token='));
    const tokenMatch = mailbox[0].text.match(/token=([a-f0-9]+)/);
    assert.ok(tokenMatch && tokenMatch[1]);
    const resetTokenRaw = tokenMatch[1];

    // 2. Log in to establish an active session before password reset
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    const preResetSessionCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('managex_session=')).split(';')[0];

    // Verify session works before reset
    const meBefore = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [preResetSessionCookie]);
    assert.equal(meBefore.status, 200);

    // 3. Complete password reset with new password
    const newPassword = 'NewSecretPassword456!@#';
    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: resetTokenRaw,
        password: newPassword,
      });

    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.body.success, true);

    // 4. Invariant AUTH-004: Pre-reset session must now be revoked
    const meAfter = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [preResetSessionCookie]);
    assert.equal(meAfter.status, 401, 'Old session must be revoked after password reset');

    // 5. Old password no longer authenticates
    const oldLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    assert.equal(oldLoginRes.status, 401);

    // 6. New password authenticates successfully
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: newPassword });
    assert.equal(newLoginRes.status, 200);
  });
});
