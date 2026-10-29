/**
 * ManageX Email Delivery Abstraction
 * Strictly adheres to ADR-010 and PRD Section 6.1 (AUTH-008).
 * 
 * Rules:
 * - Shared email service abstraction.
 * - In production without SMTP credentials: fails with clear recoverable error; never claims sent.
 * - In development/testing: falls back to in-memory mailbox and structured logger without leaking secrets.
 */

import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../middleware/logger.js';
import { ServiceUnavailableError } from '../common/errors.js';

let transporterInstance = null;
const inMemoryTestMailbox = [];

/**
 * Returns the nodemailer transporter instance, or null if unconfigured in production.
 */
function getTransporter() {
  if (transporterInstance) {
    return transporterInstance;
  }

  if (env.SMTP_HOST) {
    transporterInstance = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      } : undefined,
    });
    return transporterInstance;
  }

  return null;
}

/**
 * Sends an email or records it to the dev/test mailbox.
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.text - Plaintext body
 * @param {string} [params.html] - HTML body
 * @returns {Promise<{ delivered: boolean, previewUrl?: string, inMemory?: boolean }>}
 */
export async function sendEmail({ to, subject, text, html }) {
  // 1. HTTPS-based Brevo API (bypasses cloud SMTP port blocks on port 443)
  if (env.BREVO_API_KEY) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'ManageX',
            email: env.BREVO_SENDER_EMAIL || 'sureshsirf886@gmail.com',
          },
          to: [{ email: to }],
          subject,
          htmlContent: html || text,
          textContent: text,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Brevo API returned status ${res.status}`);
      }

      const data = await res.json();
      logger.info({ to, subject, messageId: data.messageId }, 'Email delivered successfully via Brevo HTTPS API');
      return { delivered: true, messageId: data.messageId };
    } catch (err) {
      logger.error({ err: err.message, to, subject }, 'Failed to deliver email via Brevo');
      throw new ServiceUnavailableError(`Email delivery failed: ${err.message}`, 'EMAIL_DELIVERY_FAILED');
    }
  }

  const transporter = getTransporter();

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: env.EMAIL_FROM,
        to,
        subject,
        text,
        html: html || text,
      });

      logger.info({ to, subject, messageId: info.messageId }, 'Email delivered successfully via SMTP');
      return { delivered: true, messageId: info.messageId };
    } catch (err) {
      logger.error({ err: err.message, to, subject }, 'Failed to deliver email via SMTP');
      throw new ServiceUnavailableError(`Email delivery failed: ${err.message}`, 'EMAIL_DELIVERY_FAILED');
    }
  }

  // Development / Test Fallback
  if (env.NODE_ENV !== 'production') {
    const emailRecord = {
      to,
      subject,
      text,
      html: html || text,
      sentAt: new Date().toISOString(),
    };
    inMemoryTestMailbox.push(emailRecord);

    logger.info({ to, subject }, 'Development mode: email recorded in in-memory test mailbox');
    return { delivered: true, inMemory: true };
  }

  // Production without SMTP credentials must fail loudly
  logger.error({ to, subject }, 'Production email delivery impossible: SMTP_HOST is not configured');
  throw new ServiceUnavailableError('Email service unavailable: SMTP provider configuration is missing', 'EMAIL_PROVIDER_UNCONFIGURED');
}

/**
 * Helper for test assertions.
 * @returns {Array<object>}
 */
export function getTestMailbox() {
  return inMemoryTestMailbox;
}

/**
 * Clears in-memory test mailbox.
 */
export function clearTestMailbox() {
  inMemoryTestMailbox.length = 0;
}

/**
 * Injects a mock transporter for testing delivery failures.
 * @param {object|null} mockTransporter
 */
export function setTransporterForTesting(mockTransporter) {
  transporterInstance = mockTransporter;
}
