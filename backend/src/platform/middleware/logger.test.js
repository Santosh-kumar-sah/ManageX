import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from './logger.js';

describe('Logger Secret Redaction', () => {
  test('redacts sensitive fields like passwords, tokens, secrets, cookies', () => {
    const rawPayload = {
      username: 'testuser@example.com',
      password: 'supersecretpassword123',
      sessionToken: 'token_abc123456789',
      csrf_secret: 'secret_value_should_be_hidden',
      cookie: 'connect.sid=s%3A12345',
      nested: {
        apiKey: 'sk_live_123456',
        regularField: 'safe data',
      },
      list: [
        { passwordHash: '$argon2id$...', item: 'note' },
      ],
    };

    const redacted = redactSecrets(rawPayload);

    assert.equal(redacted.username, 'testuser@example.com');
    assert.equal(redacted.password, '[REDACTED]');
    assert.equal(redacted.sessionToken, '[REDACTED]');
    assert.equal(redacted.csrf_secret, '[REDACTED]');
    assert.equal(redacted.cookie, '[REDACTED]');
    assert.equal(redacted.nested.apiKey, '[REDACTED]');
    assert.equal(redacted.nested.regularField, 'safe data');
    assert.equal(redacted.list[0].passwordHash, '[REDACTED]');
    assert.equal(redacted.list[0].item, 'note');
  });

  test('preserves primitive and safe values without modification', () => {
    assert.equal(redactSecrets('safe text'), 'safe text');
    assert.equal(redactSecrets(12345), 12345);
    assert.equal(redactSecrets(null), null);
    assert.equal(redactSecrets(undefined), undefined);
  });
});
