/**
 * ManageX Cryptographic Token Utility
 * Strictly adheres to PRD Section 6.1 (AUTH-002, AUTH-004, AUTH-005) and security invariants.
 * 
 * Generates unguessable cryptographically secure random tokens and derives deterministic
 * SHA-256 hashes for database lookup without storing plaintext tokens.
 */

import { randomBytes, createHash } from 'node:crypto';

/**
 * Generates a high-entropy cryptographically secure random hex string.
 * @param {number} [bytes=32] - Number of random bytes (default 32 = 256 bits of entropy)
 * @returns {string} - Random hex string
 */
export function generateSecureToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

/**
 * Derives a SHA-256 hex digest of a token for secure database storage and lookup.
 * @param {string} token - Raw token string
 * @returns {string} - SHA-256 hex hash
 */
export function hashToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }
  return createHash('sha256').update(token).digest('hex');
}
