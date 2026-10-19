/**
 * ManageX Cryptographic Password Utility
 * Strictly adheres to ADR-017, PRD Section 6.1 (AUTH-001), and security invariants.
 * 
 * Uses bcrypt with a cost factor of 12 for strong brute-force resistance.
 * Plaintext passwords are never logged, stored, or exposed.
 */

import bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password securely.
 * @param {string} password - Raw plaintext password
 * @returns {Promise<string>} - Password hash
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a stored bcrypt hash in constant time.
 * @param {string} candidatePassword - Plaintext candidate password
 * @param {string} hashedPassword - Stored password hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(candidatePassword, hashedPassword) {
  if (!candidatePassword || !hashedPassword) {
    return false;
  }
  return bcrypt.compare(candidatePassword, hashedPassword);
}
