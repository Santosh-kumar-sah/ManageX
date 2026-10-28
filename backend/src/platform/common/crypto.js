import crypto from 'node:crypto';
import { AppError } from './errors.js';
import { env } from '../../config/env.js';

/**
 * ManageX Cryptographic Token Security Utility (AES-256-GCM)
 *
 * Implements authenticated symmetric encryption and decryption for sensitive third-party tokens
 * (such as Google OAuth refresh tokens). Enforces key versioning and key rotation through an
 * explicit KeyRing contract.
 *
 * Authenticated Envelope Schema (Version 1):
 * {
 *   version: 1,             // Integer envelope format version
 *   keyVersion: '1',        // Identifier of the encryption key in the keyring
 *   iv: '<24 hex chars>',   // 12-byte cryptographically secure initialization vector (nonce)
 *   tag: '<32 hex chars>',  // 16-byte GCM authentication tag
 *   ciphertext: '<hex>'     // Encrypted ciphertext in hex
 * }
 */

export class CryptographicError extends AppError {
  constructor(message = 'Cryptographic operation failed', code = 'CRYPTOGRAPHIC_ERROR', details = undefined) {
    super(message, 500, code, details);
  }
}

export const ALGORITHM = 'aes-256-gcm';
export const IV_LENGTH_BYTES = 12; // 96-bit nonce as recommended by NIST SP 800-38D for GCM
export const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag
export const KEY_LENGTH_BYTES = 32; // 256-bit key for AES-256
export const CURRENT_ENVELOPE_VERSION = 1;

const HEX_REGEX = /^[0-9a-fA-F]+$/;

/**
 * Validates and converts an encryption key representation (64-character hex string or 32-byte Buffer)
 * into a verified 32-byte Buffer.
 *
 * @param {string|Buffer} key
 * @returns {Buffer}
 */
export function validateKeyFormat(key) {
  if (!key) {
    throw new CryptographicError('Encryption key must not be empty', 'INVALID_KEY');
  }

  if (Buffer.isBuffer(key)) {
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new CryptographicError(
        `Invalid encryption key length: expected ${KEY_LENGTH_BYTES} bytes, got ${key.length}`,
        'INVALID_KEY'
      );
    }
    return key;
  }

  if (typeof key === 'string') {
    const trimmed = key.trim();
    if (trimmed.length !== KEY_LENGTH_BYTES * 2 || !HEX_REGEX.test(trimmed)) {
      throw new CryptographicError(
        `Invalid encryption key: must be a 64-character hexadecimal string (${KEY_LENGTH_BYTES} bytes)`,
        'INVALID_KEY'
      );
    }
    return Buffer.from(trimmed, 'hex');
  }

  throw new CryptographicError('Invalid encryption key: must be a hex string or Buffer', 'INVALID_KEY');
}

/**
 * Builds Additional Authenticated Data (AAD) binding the envelope format version
 * and key version into the GCM authentication tag.
 *
 * @param {number} envelopeVersion
 * @param {string} keyVersion
 * @returns {Buffer}
 */
function buildAad(envelopeVersion, keyVersion) {
  return Buffer.from(`managex:v${envelopeVersion}:k${keyVersion}`, 'utf8');
}

/**
 * Resolves the active encryption key and active key version.
 *
 * @param {Object} [options]
 * @param {string|Buffer} [options.key] Optional explicit key override
 * @param {string} [options.keyVersion] Optional explicit key version override
 * @returns {{ keyBuffer: Buffer, keyVersion: string }}
 */
export function resolveActiveEncryptionKey(options = {}) {
  const keyRaw = options.key ?? env.TOKEN_ENCRYPTION_KEY;
  const versionRaw = options.keyVersion ?? env.TOKEN_ENCRYPTION_KEY_VERSION ?? '1';

  if (!keyRaw) {
    throw new CryptographicError(
      'No active encryption key configured (TOKEN_ENCRYPTION_KEY is unset)',
      'MISSING_ENCRYPTION_KEY'
    );
  }

  const keyVersion = String(versionRaw).trim();
  if (!keyVersion) {
    throw new CryptographicError('Active key version must be a non-empty string', 'INVALID_KEY_VERSION');
  }

  const keyBuffer = validateKeyFormat(keyRaw);
  return { keyBuffer, keyVersion };
}

/**
 * Resolves the decryption key matching a specific key version identifier according to the KeyRing contract.
 *
 * Contract:
 * 1. Checks if the requested keyVersion matches the active key.
 * 2. If not, checks TOKEN_ENCRYPTION_KEYRING (a JSON object mapping key versions to 64-character hex keys).
 * 3. Fails closed with safe error codes if the version is missing, key is invalid, or keyring is malformed.
 *
 * @param {string} keyVersion Key version identifier from ciphertext envelope
 * @param {Object} [options]
 * @param {string|Buffer} [options.key] Optional explicit key override
 * @param {string|Buffer} [options.activeKey] Optional active key override
 * @param {string} [options.activeKeyVersion] Optional active key version override
 * @param {string|Object} [options.keyring] Optional keyring JSON or object override
 * @returns {Buffer}
 */
export function resolveDecryptionKey(keyVersion, options = {}) {
  if (keyVersion === undefined || keyVersion === null || String(keyVersion).trim() === '') {
    throw new CryptographicError('Key version identifier must be a non-empty string', 'INVALID_KEY_VERSION');
  }
  const requestedVersion = String(keyVersion).trim();

  // If an explicit key override is passed in options
  if (options.key) {
    if (options.keyVersion && String(options.keyVersion).trim() !== requestedVersion) {
      throw new CryptographicError(
        `Supplied key version '${options.keyVersion}' does not match requested envelope key version '${requestedVersion}'`,
        'KEY_VERSION_MISMATCH'
      );
    }
    return validateKeyFormat(options.key);
  }

  // 1. Check active key
  const activeKeyRaw = options.activeKey ?? env.TOKEN_ENCRYPTION_KEY;
  const activeVersionRaw = options.activeKeyVersion ?? env.TOKEN_ENCRYPTION_KEY_VERSION ?? '1';
  const activeVersion = String(activeVersionRaw).trim();

  if (requestedVersion === activeVersion && activeKeyRaw) {
    return validateKeyFormat(activeKeyRaw);
  }

  // 2. Check historical keyring
  const keyringRaw = options.keyring ?? env.TOKEN_ENCRYPTION_KEYRING;
  if (keyringRaw) {
    let parsedKeyring;
    if (typeof keyringRaw === 'string') {
      try {
        parsedKeyring = JSON.parse(keyringRaw);
      } catch {
        throw new CryptographicError('Malformed keyring configuration: invalid JSON', 'INVALID_KEYRING');
      }
    } else if (typeof keyringRaw === 'object' && keyringRaw !== null && !Array.isArray(keyringRaw)) {
      parsedKeyring = keyringRaw;
    } else {
      throw new CryptographicError('Invalid keyring configuration: expected object', 'INVALID_KEYRING');
    }

    if (typeof parsedKeyring !== 'object' || parsedKeyring === null || Array.isArray(parsedKeyring)) {
      throw new CryptographicError('Invalid keyring configuration: expected object', 'INVALID_KEYRING');
    }

    const historicalKey = parsedKeyring[requestedVersion];
    if (historicalKey) {
      return validateKeyFormat(historicalKey);
    }
  }

  // Fails closed if unknown version or key unavailable
  throw new CryptographicError(
    `No encryption key configured for key version: ${requestedVersion}`,
    'KEY_NOT_FOUND'
  );
}

/**
 * Validates and parses an encrypted envelope object or JSON string.
 *
 * @param {Object|string} payload
 * @returns {{ version: number, keyVersion: string, iv: string, tag: string, ciphertext: string }}
 */
export function parseEnvelope(payload) {
  if (payload === undefined || payload === null) {
    throw new CryptographicError('Invalid ciphertext envelope: payload is required', 'INVALID_PAYLOAD');
  }

  let envelope = payload;
  if (typeof payload === 'string') {
    try {
      envelope = JSON.parse(payload);
    } catch {
      throw new CryptographicError('Malformed ciphertext envelope: invalid JSON', 'MALFORMED_ENVELOPE');
    }
  }

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new CryptographicError('Invalid ciphertext envelope: expected object', 'INVALID_ENVELOPE');
  }

  const { version, keyVersion, iv, tag, ciphertext } = envelope;

  if (version === undefined || version === null || typeof version !== 'number' || !Number.isInteger(version)) {
    throw new CryptographicError('Invalid envelope: missing or invalid version', 'INVALID_ENVELOPE');
  }

  if (version !== CURRENT_ENVELOPE_VERSION) {
    throw new CryptographicError(
      `Unsupported envelope version: ${version} (expected ${CURRENT_ENVELOPE_VERSION})`,
      'UNSUPPORTED_ENVELOPE_VERSION'
    );
  }

  if (!keyVersion || (typeof keyVersion !== 'string' && typeof keyVersion !== 'number') || String(keyVersion).trim() === '') {
    throw new CryptographicError('Invalid envelope: missing keyVersion', 'INVALID_ENVELOPE');
  }

  if (typeof iv !== 'string' || iv.length !== IV_LENGTH_BYTES * 2 || !HEX_REGEX.test(iv)) {
    throw new CryptographicError('Invalid envelope: IV must be a 24-character hex string', 'INVALID_IV');
  }

  if (typeof tag !== 'string' || tag.length !== AUTH_TAG_LENGTH_BYTES * 2 || !HEX_REGEX.test(tag)) {
    throw new CryptographicError('Invalid envelope: tag must be a 32-character hex string', 'INVALID_TAG');
  }

  if (typeof ciphertext !== 'string' || ciphertext.length === 0 || !HEX_REGEX.test(ciphertext)) {
    throw new CryptographicError('Invalid envelope: ciphertext must be a non-empty hex string', 'INVALID_CIPHERTEXT');
  }

  return {
    version,
    keyVersion: String(keyVersion).trim(),
    iv,
    tag,
    ciphertext,
  };
}

/**
 * Encrypts a plaintext string using AES-256-GCM authenticated encryption.
 * Automatically generates a cryptographically secure 12-byte IV and binds envelope metadata via AAD.
 *
 * @param {string} plaintext Plaintext string to encrypt (e.g. refresh token)
 * @param {Object} [options]
 * @param {string|Buffer} [options.key] Optional active key override
 * @param {string} [options.keyVersion] Optional key version override
 * @returns {Readonly<{ version: number, keyVersion: string, iv: string, tag: string, ciphertext: string }>}
 */
export function encrypt(plaintext, options = {}) {
  if (plaintext === undefined || plaintext === null || typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new CryptographicError('Plaintext must be a non-empty string', 'INVALID_PLAINTEXT');
  }

  const { keyBuffer, keyVersion } = resolveActiveEncryptionKey(options);
  const ivBuffer = crypto.randomBytes(IV_LENGTH_BYTES);
  const aadBuffer = buildAad(CURRENT_ENVELOPE_VERSION, keyVersion);

  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, ivBuffer);
  cipher.setAAD(aadBuffer);

  const ciphertextBuffer = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tagBuffer = cipher.getAuthTag();

  const envelope = {
    version: CURRENT_ENVELOPE_VERSION,
    keyVersion,
    iv: ivBuffer.toString('hex'),
    tag: tagBuffer.toString('hex'),
    ciphertext: ciphertextBuffer.toString('hex'),
  };

  return Object.freeze(envelope);
}

/**
 * Decrypts an authenticated envelope using AES-256-GCM.
 * Resolves the matching key by envelope `keyVersion`, verifies the authentication tag and AAD.
 *
 * SECURITY INVARIANTS:
 * - Never returns partially decrypted or unauthenticated plaintext.
 * - Never falls back to another key version if authentication fails.
 * - Never logs or reveals plaintext or secret keys in errors.
 *
 * @param {Object|string} payload Envelope object or JSON serialized string
 * @param {Object} [options]
 * @param {string|Buffer} [options.key] Optional explicit key override
 * @param {string|Buffer} [options.activeKey] Optional active key override
 * @param {string} [options.activeKeyVersion] Optional active key version override
 * @param {string|Object} [options.keyring] Optional keyring JSON or object override
 * @returns {string} Decrypted plaintext string
 */
export function decrypt(payload, options = {}) {
  const envelope = parseEnvelope(payload);
  const keyBuffer = resolveDecryptionKey(envelope.keyVersion, options);
  const ivBuffer = Buffer.from(envelope.iv, 'hex');
  const tagBuffer = Buffer.from(envelope.tag, 'hex');
  const ciphertextBuffer = Buffer.from(envelope.ciphertext, 'hex');
  const aadBuffer = buildAad(envelope.version, envelope.keyVersion);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);
  decipher.setAAD(aadBuffer);
  decipher.setAuthTag(tagBuffer);

  try {
    const decryptedBuffer = Buffer.concat([
      decipher.update(ciphertextBuffer),
      decipher.final(),
    ]);
    return decryptedBuffer.toString('utf8');
  } catch {
    // Fail closed: reject any modified ciphertext, IV, tag, or AAD metadata
    throw new CryptographicError(
      'Decryption failed: authentication tag verification failed or ciphertext was corrupted',
      'AUTHENTICATION_FAILED'
    );
  }
}

/**
 * Serializes an envelope object to a JSON string.
 *
 * @param {Object} envelope
 * @returns {string}
 */
export function serializeEnvelope(envelope) {
  const parsed = parseEnvelope(envelope);
  return JSON.stringify(parsed);
}

/**
 * Deserializes an envelope JSON string into a validated envelope object.
 *
 * @param {string} serialized
 * @returns {{ version: number, keyVersion: string, iv: string, tag: string, ciphertext: string }}
 */
export function deserializeEnvelope(serialized) {
  return parseEnvelope(serialized);
}
