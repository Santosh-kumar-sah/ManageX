import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  generateStructuredCompletion,
  estimateTokenCost,
  AIProviderError,
} from './openrouterClient.js';
import { ValidationError } from '../common/errors.js';

describe('ManageX OpenRouter API Client Suite (Phase 01)', () => {
  const dummyApiKey = 'sk-or-v1-dummy-test-key-managex';
  const dummyBaseUrl = 'https://openrouter.ai/api/v1';

  it('estimateTokenCost calculates correct USD estimate', () => {
    // google/gemini-2.0-flash-001: prompt $0.10/M, completion $0.40/M
    const cost = estimateTokenCost('google/gemini-2.0-flash-001', 1000, 2000);
    // (1000/1M * 0.10) + (2000/1M * 0.40) = 0.0001 + 0.0008 = 0.0009
    assert.equal(cost, 0.0009);
  });

  it('throws AIProviderError when API key is missing', async () => {
    await assert.rejects(
      async () => {
        await generateStructuredCompletion({
          messages: [{ role: 'user', content: 'hello' }],
          apiKey: '',
        });
      },
      (err) => {
        assert.ok(err instanceof AIProviderError);
        assert.equal(err.code, 'AI_PROVIDER_UNCONFIGURED');
        assert.equal(err.statusCode, 503);
        return true;
      }
    );
  });

  it('throws ValidationError when messages array is empty', async () => {
    await assert.rejects(
      async () => {
        await generateStructuredCompletion({
          messages: [],
          apiKey: dummyApiKey,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        return true;
      }
    );
  });

  it('successfully returns completion and parses structured JSON with Zod outputSchema', async () => {
    const testSchema = z.object({
      summary: z.string(),
      items: z.array(z.string()),
    });

    const mockResponsePayload = {
      id: 'gen-12345',
      model: 'google/gemini-2.0-flash-001',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              summary: 'Meeting completed successfully',
              items: ['Item 1', 'Item 2'],
            }),
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 150,
        completion_tokens: 50,
        total_tokens: 200,
      },
    };

    let requestedEndpoint = '';
    let requestedHeaders = {};
    let requestedBody = null;

    const mockFetch = async (url, options) => {
      requestedEndpoint = url;
      requestedHeaders = options.headers;
      requestedBody = JSON.parse(options.body);

      return {
        ok: true,
        status: 200,
        json: async () => mockResponsePayload,
      };
    };

    const result = await generateStructuredCompletion({
      messages: [{ role: 'user', content: 'Summarize meeting' }],
      outputSchema: testSchema,
      apiKey: dummyApiKey,
      baseUrl: dummyBaseUrl,
      fetchFn: mockFetch,
    });

    assert.equal(requestedEndpoint, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(requestedHeaders.Authorization, `Bearer ${dummyApiKey}`);
    assert.equal(requestedHeaders['X-Title'], 'ManageX');
    assert.deepEqual(requestedBody.response_format, { type: 'json_object' });
    assert.deepEqual(requestedBody.provider, { data_collection: 'deny', zdr: true });

    assert.equal(result.model, 'google/gemini-2.0-flash-001');
    assert.equal(result.usage.totalTokens, 200);
    assert.equal(result.content.summary, 'Meeting completed successfully');
    assert.equal(result.content.items.length, 2);
  });

  it('throws ValidationError if structured output fails Zod schema', async () => {
    const testSchema = z.object({
      requiredKey: z.string(),
      numericVal: z.number(),
    });

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ requiredKey: 'hello', numericVal: 'not_a_number' }),
            },
          },
        ],
      }),
    });

    await assert.rejects(
      async () => {
        await generateStructuredCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          outputSchema: testSchema,
          apiKey: dummyApiKey,
          fetchFn: mockFetch,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /AI output failed schema validation/);
        return true;
      }
    );
  });

  it('does NOT retry on ordinary 4xx client errors (e.g. HTTP 400)', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount += 1;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Bad request model does not exist' } }),
      };
    };

    await assert.rejects(
      async () => {
        await generateStructuredCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          apiKey: dummyApiKey,
          fetchFn: mockFetch,
        });
      },
      (err) => {
        assert.ok(err instanceof AIProviderError);
        assert.equal(err.code, 'AI_PROVIDER_ERROR');
        return true;
      }
    );

    assert.equal(callCount, 1, 'Ordinary 400 errors must not be retried');
  });

  it('retries on HTTP 429 and succeeds on subsequent attempt', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Rate limit exceeded' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Hello after retry' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      };
    };

    const result = await generateStructuredCompletion({
      messages: [{ role: 'user', content: 'Test retry' }],
      apiKey: dummyApiKey,
      fetchFn: mockFetch,
    });

    assert.equal(callCount, 2);
    assert.equal(result.content, 'Hello after retry');
  });

  it('handles request timeout via AbortController cleanly', async () => {
    const mockFetch = async (url, options) => {
      // Simulate slow response that triggers abort
      return new Promise((resolve, reject) => {
        const checkSignal = () => {
          if (options.signal.aborted) {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          }
        };
        options.signal.addEventListener('abort', checkSignal);
        setTimeout(checkSignal, 50);
      });
    };

    await assert.rejects(
      async () => {
        await generateStructuredCompletion({
          messages: [{ role: 'user', content: 'Test timeout' }],
          apiKey: dummyApiKey,
          timeoutMs: 20,
          fetchFn: mockFetch,
        });
      },
      (err) => {
        assert.ok(err instanceof AIProviderError);
        assert.equal(err.code, 'AI_TIMEOUT');
        assert.equal(err.statusCode, 504);
        return true;
      }
    );
  });
});
