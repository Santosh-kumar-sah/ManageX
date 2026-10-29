import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { executeAiCompletion } from './aiService.js';
import { ValidationError } from '../common/errors.js';

describe('ManageX Shared AI Service Suite (Phase 01)', () => {
  it('throws ValidationError when organisationId or userId is missing', async () => {
    await assert.rejects(
      async () => {
        await executeAiCompletion({ organisationId: '', userId: 'user-1' });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /organisationId is required/);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await executeAiCompletion({ organisationId: 'org-1', userId: '' });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /userId is required/);
        return true;
      }
    );
  });
});
