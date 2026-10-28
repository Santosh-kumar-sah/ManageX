import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  encrypt,
  decrypt,
  validateKeyFormat,
  resolveActiveEncryptionKey,
  resolveDecryptionKey,
  serializeEnvelope,
  deserializeEnvelope,
  CURRENT_ENVELOPE_VERSION,
  IV_LENGTH_BYTES,
  AUTH_TAG_LENGTH_BYTES,
} from './crypto.js';
import { envSchema, loadConfig } from '../../config/env.js';

// Deterministic, disposable test keys (64 hex characters = 32 bytes)
const TEST_KEY_V1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_KEY_V2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const TEST_KEY_V3 = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

describe('ManageX Token Cryptography (Phase 1B.1)', () => {
  describe('Key Format Validation', () => {
    test('accepts valid 64-character hexadecimal key string', () => {
      const keyBuffer = validateKeyFormat(TEST_KEY_V1);
      assert.ok(Buffer.isBuffer(keyBuffer));
      assert.equal(keyBuffer.length, 32);
      assert.equal(keyBuffer.toString('hex'), TEST_KEY_V1);
    });

    test('accepts valid 32-byte Buffer', () => {
      const buf = Buffer.from(TEST_KEY_V1, 'hex');
      const result = validateKeyFormat(buf);
      assert.equal(result, buf);
    });

    test('rejects empty or null key', () => {
      assert.throws(() => validateKeyFormat(''), {
        name: 'CryptographicError',
        code: 'INVALID_KEY',
      });
      assert.throws(() => validateKeyFormat(null), {
        name: 'CryptographicError',
        code: 'INVALID_KEY',
      });
      assert.throws(() => validateKeyFormat(undefined), {
        name: 'CryptographicError',
        code: 'INVALID_KEY',
      });
    });

    test('rejects keys with invalid length (too short or too long)', () => {
      assert.throws(() => validateKeyFormat(TEST_KEY_V1.slice(0, 62)), {
        name: 'CryptographicError',
        code: 'INVALID_KEY',
      });
      assert.throws(() => validateKeyFormat(TEST_KEY_V1 + 'ff'), {
        name: 'CryptographicError',
        code: 'INVALID_KEY',
      });
    });

    test('rejects non-hexadecimal characters', () => {
      const nonHex = TEST_KEY_V1.slice(0, 62) + 'zz';
      assert.throws(() => validateKeyFormat(nonHex), {
        name: 'CryptographicError',
        code: 'INVALID_KEY',
      });
    });

    test('rejects non-string non-buffer inputs', () => {
      assert.throws(() => validateKeyFormat(12345), {
        name: 'CryptographicError',
        code: 'INVALID_KEY',
      });
      assert.throws(() => validateKeyFormat({}), {
        name: 'CryptographicError',
        code: 'INVALID_KEY',
      });
    });
  });

  describe('Encryption and Decryption Baseline', () => {
    const sampleToken = '1//04test_sample_google_refresh_token_xyz987654321';

    test('encrypts plaintext and decrypts back to original value', () => {
      const envelope = encrypt(sampleToken, {
        key: TEST_KEY_V1,
        keyVersion: 'v1',
      });

      assert.equal(envelope.version, CURRENT_ENVELOPE_VERSION);
      assert.equal(envelope.keyVersion, 'v1');
      assert.equal(envelope.iv.length, IV_LENGTH_BYTES * 2);
      assert.equal(envelope.tag.length, AUTH_TAG_LENGTH_BYTES * 2);
      assert.ok(typeof envelope.ciphertext === 'string' && envelope.ciphertext.length > 0);

      const decrypted = decrypt(envelope, {
        key: TEST_KEY_V1,
      });

      assert.equal(decrypted, sampleToken);
    });

    test('encrypting same plaintext twice produces different IVs and different ciphertexts', () => {
      const enc1 = encrypt(sampleToken, { key: TEST_KEY_V1, keyVersion: 'v1' });
      const enc2 = encrypt(sampleToken, { key: TEST_KEY_V1, keyVersion: 'v1' });

      assert.notEqual(enc1.iv, enc2.iv);
      assert.notEqual(enc1.ciphertext, enc2.ciphertext);
      assert.notEqual(enc1.tag, enc2.tag);

      assert.equal(decrypt(enc1, { key: TEST_KEY_V1 }), sampleToken);
      assert.equal(decrypt(enc2, { key: TEST_KEY_V1 }), sampleToken);
    });

    test('envelope does not expose plaintext or encryption key in any field', () => {
      const envelope = encrypt(sampleToken, { key: TEST_KEY_V1, keyVersion: 'v1' });
      const serialized = JSON.stringify(envelope);

      assert.ok(!serialized.includes(sampleToken));
      assert.ok(!serialized.includes(TEST_KEY_V1));
    });

    test('decrypts serialized JSON envelope string cleanly', () => {
      const envelope = encrypt(sampleToken, { key: TEST_KEY_V1, keyVersion: 'v1' });
      const serialized = serializeEnvelope(envelope);

      assert.ok(typeof serialized === 'string');
      const decrypted = decrypt(serialized, { key: TEST_KEY_V1 });
      assert.equal(decrypted, sampleToken);
    });

    test('deserializeEnvelope correctly parses and validates envelope JSON', () => {
      const envelope = encrypt(sampleToken, { key: TEST_KEY_V1, keyVersion: 'v1' });
      const serialized = serializeEnvelope(envelope);
      const parsed = deserializeEnvelope(serialized);

      assert.deepEqual(parsed, envelope);
    });

    test('rejects empty, null, or non-string plaintext inputs', () => {
      assert.throws(() => encrypt('', { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'INVALID_PLAINTEXT',
      });
      assert.throws(() => encrypt(null, { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'INVALID_PLAINTEXT',
      });
      assert.throws(() => encrypt(undefined, { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'INVALID_PLAINTEXT',
      });
      assert.throws(() => encrypt(12345, { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'INVALID_PLAINTEXT',
      });
    });

    test('rejects malformed or empty decrypt payloads', () => {
      assert.throws(() => decrypt(null, { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'INVALID_PAYLOAD',
      });
      assert.throws(() => decrypt('', { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'MALFORMED_ENVELOPE',
      });
      assert.throws(() => decrypt('{ invalid json', { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'MALFORMED_ENVELOPE',
      });
      assert.throws(() => decrypt('not a json object', { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'MALFORMED_ENVELOPE',
      });
      assert.throws(() => decrypt([], { key: TEST_KEY_V1 }), {
        name: 'CryptographicError',
        code: 'INVALID_ENVELOPE',
      });
    });
  });

  describe('Authentication and Tampering Protection', () => {
    const plaintext = 'sensitive_oauth_refresh_token_to_tamper_test';

    test('rejects modified ciphertext byte (fail closed, never returns partial plaintext)', () => {
      const envelope = encrypt(plaintext, { key: TEST_KEY_V1, keyVersion: '1' });
      const tamperedCiphertext =
        envelope.ciphertext.slice(0, -2) + (envelope.ciphertext.endsWith('00') ? 'ff' : '00');

      assert.throws(
        () => decrypt({ ...envelope, ciphertext: tamperedCiphertext }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'AUTHENTICATION_FAILED',
        }
      );
    });

    test('rejects modified authentication tag byte', () => {
      const envelope = encrypt(plaintext, { key: TEST_KEY_V1, keyVersion: '1' });
      const tamperedTag =
        envelope.tag.slice(0, -2) + (envelope.tag.endsWith('aa') ? 'bb' : 'aa');

      assert.throws(
        () => decrypt({ ...envelope, tag: tamperedTag }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'AUTHENTICATION_FAILED',
        }
      );
    });

    test('rejects modified initialization vector (IV)', () => {
      const envelope = encrypt(plaintext, { key: TEST_KEY_V1, keyVersion: '1' });
      const tamperedIv =
        envelope.iv.slice(0, -2) + (envelope.iv.endsWith('11') ? '22' : '11');

      assert.throws(
        () => decrypt({ ...envelope, iv: tamperedIv }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'AUTHENTICATION_FAILED',
        }
      );
    });

    test('rejects modified envelope metadata (AAD tampering protection)', () => {
      const envelope = encrypt(plaintext, {
        key: TEST_KEY_V1,
        keyVersion: '1',
      });

      // Tampering with keyVersion in envelope must fail because keyVersion is bound into GCM AAD
      // Even if decrypted with the identical key material, GCM tag verification fails because AAD differs
      assert.throws(
        () =>
          decrypt(
            { ...envelope, keyVersion: '2' },
            {
              key: TEST_KEY_V1,
            }
          ),
        {
          name: 'CryptographicError',
          code: 'AUTHENTICATION_FAILED',
        }
      );

      // If options explicitly specify a keyVersion that contradicts the envelope, reject with KEY_VERSION_MISMATCH
      assert.throws(
        () =>
          decrypt(
            { ...envelope, keyVersion: '2' },
            {
              key: TEST_KEY_V1,
              keyVersion: '1',
            }
          ),
        {
          name: 'CryptographicError',
          code: 'KEY_VERSION_MISMATCH',
        }
      );
    });

    test('rejects unsupported envelope versions', () => {
      const envelope = encrypt(plaintext, { key: TEST_KEY_V1, keyVersion: '1' });

      assert.throws(
        () => decrypt({ ...envelope, version: 2 }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'UNSUPPORTED_ENVELOPE_VERSION',
        }
      );
      assert.throws(
        () => decrypt({ ...envelope, version: 0 }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'UNSUPPORTED_ENVELOPE_VERSION',
        }
      );
    });

    test('rejects envelope missing keyVersion or with empty keyVersion', () => {
      const envelope = encrypt(plaintext, { key: TEST_KEY_V1, keyVersion: '1' });

      assert.throws(
        () => decrypt({ ...envelope, keyVersion: '' }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'INVALID_ENVELOPE',
        }
      );
      assert.throws(
        () => decrypt({ ...envelope, keyVersion: null }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'INVALID_ENVELOPE',
        }
      );
    });

    test('rejects envelope with invalid IV or tag length', () => {
      const envelope = encrypt(plaintext, { key: TEST_KEY_V1, keyVersion: '1' });

      assert.throws(
        () => decrypt({ ...envelope, iv: 'abcd' }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'INVALID_IV',
        }
      );
      assert.throws(
        () => decrypt({ ...envelope, tag: '1234' }, { key: TEST_KEY_V1 }),
        {
          name: 'CryptographicError',
          code: 'INVALID_TAG',
        }
      );
    });
  });

  describe('Key Versioning and Rotation Contract', () => {
    const tokenV1 = 'token_encrypted_under_v1_key';
    const tokenV2 = 'token_encrypted_under_v2_key';

    test('encrypts using active key and records active version in envelope', () => {
      const envelope = encrypt(tokenV1, {
        key: TEST_KEY_V1,
        keyVersion: 'v1',
      });
      assert.equal(envelope.keyVersion, 'v1');
    });

    test('decrypts historical ciphertext using keyring when active key has rotated', () => {
      // Step 1: Encrypt token using V1 key when V1 was active
      const envelopeV1 = encrypt(tokenV1, {
        key: TEST_KEY_V1,
        keyVersion: 'v1',
      });

      // Step 2: Key rotation occurs. Active key becomes V2. V1 key is moved to keyring.
      const keyring = JSON.stringify({
        v1: TEST_KEY_V1,
      });

      // Step 3: Decrypt envelopeV1 using V2 as active key and V1 in keyring
      const decryptedV1 = decrypt(envelopeV1, {
        activeKey: TEST_KEY_V2,
        activeKeyVersion: 'v2',
        keyring,
      });

      assert.equal(decryptedV1, tokenV1);

      // Step 4: Newly encrypted token uses active key V2
      const envelopeV2 = encrypt(tokenV2, {
        key: TEST_KEY_V2,
        keyVersion: 'v2',
      });
      assert.equal(envelopeV2.keyVersion, 'v2');

      const decryptedV2 = decrypt(envelopeV2, {
        activeKey: TEST_KEY_V2,
        activeKeyVersion: 'v2',
        keyring,
      });
      assert.equal(decryptedV2, tokenV2);
    });

    test('fails closed when key version is missing from both active key and keyring', () => {
      const envelope = encrypt(tokenV1, {
        key: TEST_KEY_V1,
        keyVersion: 'v1',
      });

      // Decryption environment knows only v2 and v3
      const keyring = JSON.stringify({
        v3: TEST_KEY_V3,
      });

      assert.throws(
        () =>
          decrypt(envelope, {
            activeKey: TEST_KEY_V2,
            activeKeyVersion: 'v2',
            keyring,
          }),
        {
          name: 'CryptographicError',
          code: 'KEY_NOT_FOUND',
        }
      );
    });

    test('fails closed if keyring contains malformed JSON or invalid key format', () => {
      const envelope = encrypt(tokenV1, {
        key: TEST_KEY_V1,
        keyVersion: 'v1',
      });

      assert.throws(
        () =>
          decrypt(envelope, {
            activeKey: TEST_KEY_V2,
            activeKeyVersion: 'v2',
            keyring: 'not-valid-json',
          }),
        {
          name: 'CryptographicError',
          code: 'INVALID_KEYRING',
        }
      );

      assert.throws(
        () =>
          decrypt(envelope, {
            activeKey: TEST_KEY_V2,
            activeKeyVersion: 'v2',
            keyring: JSON.stringify({ v1: 'short-key' }),
          }),
        {
          name: 'CryptographicError',
          code: 'INVALID_KEY',
        }
      );
    });

    test('never falls back to another key version if authentication fails', () => {
      // V1 token encrypted with TEST_KEY_V1
      const envelopeV1 = encrypt(tokenV1, {
        key: TEST_KEY_V1,
        keyVersion: 'v1',
      });

      // Attempt to decrypt with wrong key for version v1
      assert.throws(
        () =>
          decrypt(envelopeV1, {
            activeKey: TEST_KEY_V2,
            activeKeyVersion: 'v2',
            keyring: JSON.stringify({ v1: TEST_KEY_V3 }), // wrong key for v1
          }),
        {
          name: 'CryptographicError',
          code: 'AUTHENTICATION_FAILED',
        }
      );
    });

    test('resolveDecryptionKey resolves correctly across active key and keyring', () => {
      const keyring = JSON.stringify({
        v1: TEST_KEY_V1,
        v3: TEST_KEY_V3,
      });

      // Active key match
      const keyBufV2 = resolveDecryptionKey('v2', {
        activeKey: TEST_KEY_V2,
        activeKeyVersion: 'v2',
        keyring,
      });
      assert.equal(keyBufV2.toString('hex'), TEST_KEY_V2);

      // Keyring match
      const keyBufV1 = resolveDecryptionKey('v1', {
        activeKey: TEST_KEY_V2,
        activeKeyVersion: 'v2',
        keyring,
      });
      assert.equal(keyBufV1.toString('hex'), TEST_KEY_V1);

      // Unknown key
      assert.throws(
        () =>
          resolveDecryptionKey('v999', {
            activeKey: TEST_KEY_V2,
            activeKeyVersion: 'v2',
            keyring,
          }),
        {
          name: 'CryptographicError',
          code: 'KEY_NOT_FOUND',
        }
      );
    });

    test('resolveActiveEncryptionKey fails closed if no key configured', () => {
      assert.throws(
        () => resolveActiveEncryptionKey({ key: null }),
        {
          name: 'CryptographicError',
          code: 'MISSING_ENCRYPTION_KEY',
        }
      );
    });
  });

  describe('Security and Information Leakage Prevention', () => {
    test('error messages never contain secret plaintext tokens', () => {
      const sensitiveToken = 'SECRET_TOKEN_VALUE_NEVER_LOG_123456';
      try {
        // Force authentication failure
        const envelope = encrypt(sensitiveToken, { key: TEST_KEY_V1, keyVersion: 'v1' });
        const tampered = { ...envelope, tag: '00'.repeat(16) };
        decrypt(tampered, { key: TEST_KEY_V1 });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(!err.message.includes(sensitiveToken));
        assert.ok(!JSON.stringify(err).includes(sensitiveToken));
      }
    });

    test('error messages never contain secret encryption keys', () => {
      const secretKey = TEST_KEY_V1;
      try {
        const envelope = encrypt('token', { key: secretKey, keyVersion: 'v1' });
        decrypt({ ...envelope, tag: '00'.repeat(16) }, { key: secretKey });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(!err.message.includes(secretKey));
        assert.ok(!JSON.stringify(err).includes(secretKey));
      }
    });
  });

  describe('Environment Configuration Validation (env.js)', () => {
    const baseEnv = {
      NODE_ENV: 'test',
      PORT: '4000',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: 'development_secret_minimum_16_chars_length',
      CSRF_SECRET: 'development_csrf_minimum_16_chars_length',
    };

    test('validates cleanly when Google integration and encryption keys are omitted (development default)', () => {
      const parsed = envSchema.safeParse(baseEnv);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.GOOGLE_CLIENT_ID, undefined);
      assert.equal(parsed.data.TOKEN_ENCRYPTION_KEY, undefined);
      assert.equal(parsed.data.TOKEN_ENCRYPTION_KEY_VERSION, '1');
    });

    test('rejects partial Google OAuth configuration (missing redirect URI or client secret)', () => {
      const partial1 = {
        ...baseEnv,
        GOOGLE_CLIENT_ID: 'google-client-id-xyz',
      };
      const res1 = envSchema.safeParse(partial1);
      assert.equal(res1.success, false);
      const issues1 = res1.error.issues.map((i) => i.path[0]);
      assert.ok(issues1.includes('GOOGLE_CLIENT_SECRET'));
      assert.ok(issues1.includes('GOOGLE_OAUTH_REDIRECT_URI'));

      const partial2 = {
        ...baseEnv,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'secret',
      };
      const res2 = envSchema.safeParse(partial2);
      assert.equal(res2.success, false);
      const issues2 = res2.error.issues.map((i) => i.path[0]);
      assert.ok(issues2.includes('GOOGLE_OAUTH_REDIRECT_URI'));
    });

    test('rejects invalid Google OAuth redirect URI (must be a valid URL)', () => {
      const invalidUri = {
        ...baseEnv,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'not-a-valid-url',
      };
      const res = envSchema.safeParse(invalidUri);
      assert.equal(res.success, false);
      assert.ok(res.error.issues.some((i) => i.path[0] === 'GOOGLE_OAUTH_REDIRECT_URI'));
    });

    test('requires TOKEN_ENCRYPTION_KEY when Google OAuth is fully configured', () => {
      const googleWithoutKey = {
        ...baseEnv,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'https://managex.example.com/api/v1/integrations/google/callback',
      };
      const res = envSchema.safeParse(googleWithoutKey);
      assert.equal(res.success, false);
      assert.ok(res.error.issues.some((i) => i.path[0] === 'TOKEN_ENCRYPTION_KEY'));
    });

    test('accepts full Google OAuth with valid 64-hex TOKEN_ENCRYPTION_KEY', () => {
      const fullValid = {
        ...baseEnv,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'https://managex.example.com/api/v1/integrations/google/callback',
        TOKEN_ENCRYPTION_KEY: TEST_KEY_V1,
        TOKEN_ENCRYPTION_KEY_VERSION: 'v1',
      };
      const res = envSchema.safeParse(fullValid);
      assert.equal(res.success, true);
      assert.equal(res.data.TOKEN_ENCRYPTION_KEY, TEST_KEY_V1);
      assert.equal(res.data.TOKEN_ENCRYPTION_KEY_VERSION, 'v1');
    });

    test('rejects invalid TOKEN_ENCRYPTION_KEY format (non-hex, wrong length)', () => {
      const shortKey = {
        ...baseEnv,
        TOKEN_ENCRYPTION_KEY: '0123456789abcdef',
      };
      const res1 = envSchema.safeParse(shortKey);
      assert.equal(res1.success, false);
      assert.ok(res1.error.issues.some((i) => i.path[0] === 'TOKEN_ENCRYPTION_KEY'));

      const nonHexKey = {
        ...baseEnv,
        TOKEN_ENCRYPTION_KEY: TEST_KEY_V1.slice(0, 62) + 'zz',
      };
      const res2 = envSchema.safeParse(nonHexKey);
      assert.equal(res2.success, false);
      assert.ok(res2.error.issues.some((i) => i.path[0] === 'TOKEN_ENCRYPTION_KEY'));
    });

    test('validates TOKEN_ENCRYPTION_KEYRING format strictly', () => {
      const validKeyring = {
        ...baseEnv,
        TOKEN_ENCRYPTION_KEY: TEST_KEY_V1,
        TOKEN_ENCRYPTION_KEYRING: JSON.stringify({
          v0: TEST_KEY_V2,
          v1: TEST_KEY_V1,
        }),
      };
      const res1 = envSchema.safeParse(validKeyring);
      assert.equal(res1.success, true);

      const invalidKeyringJson = {
        ...baseEnv,
        TOKEN_ENCRYPTION_KEY: TEST_KEY_V1,
        TOKEN_ENCRYPTION_KEYRING: '{ bad json',
      };
      const res2 = envSchema.safeParse(invalidKeyringJson);
      assert.equal(res2.success, false);

      const invalidKeyringKeyFormat = {
        ...baseEnv,
        TOKEN_ENCRYPTION_KEY: TEST_KEY_V1,
        TOKEN_ENCRYPTION_KEYRING: JSON.stringify({
          v0: 'short-key',
        }),
      };
      const res3 = envSchema.safeParse(invalidKeyringKeyFormat);
      assert.equal(res3.success, false);
    });

    test('loadConfig throws actionable error with exitOnError=false without exposing secrets', () => {
      const invalidEnv = {
        ...baseEnv,
        TOKEN_ENCRYPTION_KEY: 'invalid_short_key_val',
      };

      assert.throws(
        () => loadConfig(invalidEnv, { exitOnError: false }),
        (err) => {
          assert.equal(err.message, 'Environment configuration validation failed');
          assert.ok(Array.isArray(err.issues));
          assert.ok(err.issues.some((i) => i.includes('TOKEN_ENCRYPTION_KEY')));
          assert.ok(!JSON.stringify(err.issues).includes('invalid_short_key_val'));
          return true;
        }
      );
    });
  });
});
