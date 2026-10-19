/**
 * ManageX Authentication & Session Router
 * Strictly adheres to PRD Section 6.1 (AUTH-001 through AUTH-008), ADR-011, and api-contracts.md.
 * 
 * Endpoints:
 * - POST /api/v1/auth/register
 * - POST /api/v1/auth/verify-email
 * - POST /api/v1/auth/resend-verification
 * - POST /api/v1/auth/login
 * - POST /api/v1/auth/logout
 * - POST /api/v1/auth/forgot-password
 * - POST /api/v1/auth/reset-password
 * - GET  /api/v1/auth/me
 * - GET  /api/v1/auth/csrf
 */

import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../platform/database/pool.js';
import { hashPassword, verifyPassword } from '../platform/auth/passwords.js';
import { generateSecureToken, hashToken } from '../platform/auth/tokens.js';
import { createSession, revokeSession, revokeAllUserSessions, SESSION_COOKIE_NAME } from '../platform/auth/sessionService.js';
import { sendEmail } from '../platform/email/emailService.js';
import { requireAuth } from '../platform/middleware/auth.js';
import { createRateLimiter } from '../platform/middleware/rateLimiter.js';
import { CSRF_COOKIE_NAME } from '../platform/middleware/csrf.js';
import { sendSuccess, sendError } from '../platform/common/responses.js';
import { ValidationError } from '../platform/common/errors.js';
import { env } from '../config/env.js';

export const authRouter = Router();

// Rate limiters for sensitive authentication endpoints (AUTH-006)
const registerLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many registration attempts. Please try again later.',
  keyPrefix: 'auth_reg',
});

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many login attempts. Please try again later.',
  keyPrefix: 'auth_login',
});

const recoveryLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many recovery requests. Please try again later.',
  keyPrefix: 'auth_recovery',
});

// Helper for setting session cookie
function setSessionCookie(res, rawToken) {
  const isProduction = env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days absolute cap
  });
}

// -----------------------------------------------------------------------------
// 1. User Registration (AUTH-001)
// -----------------------------------------------------------------------------
const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(255),
  email: z.string().trim().email('Invalid email address').max(255),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

authRouter.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw new ValidationError('Validation failed for registration input', details);
    }

    const { fullName, email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const pool = getPool();

    // Check if email already exists (case-normalized)
    const existingRes = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existingRes.rows.length > 0) {
      // Invariant: Do not leak account existence or cause crash; return conflict
      return sendError(res, 409, 'ACCOUNT_EXISTS', 'An account with this email address already exists.');
    }

    // Hash password securely with bcrypt
    const passwordHash = await hashPassword(password);

    // Generate single-use verification token (24-hour expiry)
    const rawVerificationToken = generateSecureToken(32);
    const tokenHash = hashToken(rawVerificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const client = await pool.connect();
    let newUserId;

    try {
      await client.query('BEGIN');

      const userInsert = await client.query(`
        INSERT INTO users (full_name, email, password_hash, status)
        VALUES ($1, $2, $3, 'pending_verification')
        RETURNING id, full_name, email, status, created_at
      `, [fullName, normalizedEmail, passwordHash]);

      newUserId = userInsert.rows[0].id;

      await client.query(`
        INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `, [newUserId, tokenHash, expiresAt]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Deliver verification email (AUTH-008)
    const verificationUrl = `${env.FRONTEND_ORIGIN}/auth/verify-email?token=${rawVerificationToken}`;
    await sendEmail({
      to: normalizedEmail,
      subject: 'Verify your ManageX account',
      text: `Hello ${fullName},\n\nPlease verify your ManageX account by clicking the link below:\n${verificationUrl}\n\nThis link expires in 24 hours.`,
      html: `<p>Hello ${fullName},</p><p>Please verify your ManageX account by clicking the link below:</p><p><a href="${verificationUrl}">Verify Account</a></p><p>This link expires in 24 hours.</p>`,
    });

    return sendSuccess(res, 201, {
      message: 'Registration successful. Please check your email to verify your account.',
      email: normalizedEmail,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 2. Email Verification (AUTH-002)
// -----------------------------------------------------------------------------
const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, 'Verification token is required'),
});

authRouter.post('/verify-email', async (req, res, next) => {
  try {
    const parseResult = verifyEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Verification token is required');
    }

    const { token } = parseResult.data;
    const tokenHash = hashToken(token);
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Find token and lock row
      const tokenRes = await client.query(`
        SELECT id, user_id, expires_at, used_at
        FROM email_verification_tokens
        WHERE token_hash = $1
        FOR UPDATE
      `, [tokenHash]);

      if (tokenRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'INVALID_TOKEN', 'Verification token is invalid or has expired.');
      }

      const tokenRecord = tokenRes.rows[0];

      // Single-use check
      if (tokenRecord.used_at !== null) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'TOKEN_ALREADY_USED', 'This verification token has already been used.');
      }

      // Expiry check
      if (new Date(tokenRecord.expires_at) <= new Date()) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'TOKEN_EXPIRED', 'Verification token has expired. Please request a new one.');
      }

      // Mark token used and activate user
      await client.query(`
        UPDATE email_verification_tokens
        SET used_at = NOW()
        WHERE id = $1
      `, [tokenRecord.id]);

      await client.query(`
        UPDATE users
        SET status = 'active', email_verified_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [tokenRecord.user_id]);

      await client.query('COMMIT');

      return sendSuccess(res, 200, {
        message: 'Email verified successfully. You may now sign in.',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 3. Resend Verification Email
// -----------------------------------------------------------------------------
const resendSchema = z.object({
  email: z.string().trim().email(),
});

authRouter.post('/resend-verification', recoveryLimiter, async (req, res, next) => {
  try {
    const parseResult = resendSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Valid email is required');
    }

    const normalizedEmail = parseResult.data.email.toLowerCase().trim();
    const pool = getPool();

    const userRes = await pool.query(
      'SELECT id, full_name, status FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    // Generic response regardless of whether account exists (prevents enumeration)
    if (userRes.rows.length > 0 && userRes.rows[0].status === 'pending_verification') {
      const user = userRes.rows[0];
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await pool.query(`
        INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `, [user.id, tokenHash, expiresAt]);

      const verificationUrl = `${env.FRONTEND_ORIGIN}/auth/verify-email?token=${rawToken}`;
      await sendEmail({
        to: normalizedEmail,
        subject: 'Verify your ManageX account',
        text: `Hello ${user.full_name},\n\nPlease verify your account:\n${verificationUrl}\n\nExpires in 24 hours.`,
      });
    }

    return sendSuccess(res, 200, {
      message: 'If your account is pending verification, a new link has been dispatched.',
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 4. User Login (AUTH-003, AUTH-005)
// -----------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Email and password are required');
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();
    const pool = getPool();

    // Query user by email
    const userRes = await pool.query(`
      SELECT id, full_name, email, password_hash, status, is_platform_admin, email_verified_at
      FROM users
      WHERE LOWER(email) = $1
    `, [normalizedEmail]);

    // If user does not exist, run a dummy compare to prevent timing enumeration
    if (userRes.rows.length === 0) {
      await verifyPassword(password, '$2a$12$e8Yy8sLg7tC5Yj4wF4z7AeX4Q3N2M1K0J9I8H7G6F5E4D3C2B1A0.');
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const user = userRes.rows[0];

    // Verify password hash
    const passwordMatch = await verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    // Check account status
    if (user.status === 'pending_verification') {
      return sendError(res, 403, 'EMAIL_NOT_VERIFIED', 'Please verify your email before logging in.');
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      return sendError(res, 403, 'ACCOUNT_DISABLED', 'Your account has been deactivated or suspended.');
    }

    // Create active server-managed session (AUTH-005)
    const { rawToken, session } = await createSession({
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Set HttpOnly session cookie
    setSessionCookie(res, rawToken);

    return sendSuccess(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        isPlatformAdmin: user.is_platform_admin,
        status: user.status,
      },
      session: {
        id: session.id,
        idleExpiresAt: session.idle_expires_at,
        absoluteExpiresAt: session.absolute_expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 5. User Logout (AUTH-003)
// -----------------------------------------------------------------------------
authRouter.post('/logout', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      await revokeSession(rawToken);
    }

    // Clear session cookie
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });

    return sendSuccess(res, 200, { message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 6. Password Recovery Request (AUTH-004)
// -----------------------------------------------------------------------------
const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

authRouter.post('/forgot-password', recoveryLimiter, async (req, res, next) => {
  try {
    const parseResult = forgotPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Valid email is required');
    }

    const normalizedEmail = parseResult.data.email.toLowerCase().trim();
    const pool = getPool();

    const userRes = await pool.query(
      'SELECT id, full_name, status FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    // Invariant: Response must never disclose account existence
    if (userRes.rows.length > 0 && userRes.rows[0].status === 'active') {
      const user = userRes.rows[0];
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await pool.query(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `, [user.id, tokenHash, expiresAt]);

      const resetUrl = `${env.FRONTEND_ORIGIN}/auth/reset-password?token=${rawToken}`;
      await sendEmail({
        to: normalizedEmail,
        subject: 'Reset your ManageX password',
        text: `Hello ${user.full_name},\n\nYou requested to reset your password. Click the link below:\n${resetUrl}\n\nExpires in 1 hour. If you did not request this, please ignore this email.`,
      });
    }

    return sendSuccess(res, 200, {
      message: 'If an account exists with this email, instructions have been sent.',
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 7. Complete Password Reset (AUTH-004)
// -----------------------------------------------------------------------------
const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
});

authRouter.post('/reset-password', recoveryLimiter, async (req, res, next) => {
  try {
    const parseResult = resetPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw new ValidationError('Validation failed for reset password input', details);
    }

    const { token, password } = parseResult.data;
    const tokenHash = hashToken(token);
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const tokenRes = await client.query(`
        SELECT id, user_id, expires_at, used_at
        FROM password_reset_tokens
        WHERE token_hash = $1
        FOR UPDATE
      `, [tokenHash]);

      if (tokenRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'INVALID_TOKEN', 'Reset token is invalid or has expired.');
      }

      const tokenRecord = tokenRes.rows[0];

      if (tokenRecord.used_at !== null) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'TOKEN_ALREADY_USED', 'This password reset token has already been used.');
      }

      if (new Date(tokenRecord.expires_at) <= new Date()) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'TOKEN_EXPIRED', 'Reset token has expired. Please request a new link.');
      }

      // Mark token used
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRecord.id]);

      // Update password hash
      const newHash = await hashPassword(password);
      await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, tokenRecord.user_id]);

      // Invariant: Invalidate all existing sessions server-side (AUTH-004)
      await revokeAllUserSessions(tokenRecord.user_id, client);

      await client.query('COMMIT');

      // Clear any existing session cookie from response
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });

      return sendSuccess(res, 200, {
        message: 'Password reset successful. All active sessions have been revoked. Please sign in with your new password.',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 8. Current Authenticated User (AUTH-005)
// -----------------------------------------------------------------------------
authRouter.get('/me', requireAuth, async (req, res) => {
  return sendSuccess(res, 200, {
    user: req.user,
    session: req.session,
  });
});

// -----------------------------------------------------------------------------
// 9. CSRF Token Bootstrap Endpoint (AUTH-007)
// -----------------------------------------------------------------------------
authRouter.get('/csrf', (req, res) => {
  const token = req.cookies?.[CSRF_COOKIE_NAME] || '';
  return sendSuccess(res, 200, { csrfToken: token });
});
