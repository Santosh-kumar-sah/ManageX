/**
 * ManageX OpenRouter API Client Gateway (Phase 01)
 * Strictly adheres to docs/managex-ai-implementation-plan.md (Sections 5.1, 7.3),
 * AGENTS.md, and docs/security.md.
 *
 * Invariants:
 * - Server-side HTTPS requests only (never exposed to client).
 * - AbortController timeout handling (default 30,000ms).
 * - Maximum 2 retries, strictly for HTTP 429 and 503, using bounded exponential backoff.
 * - Zero retries for ordinary client errors (4xx) or invalid credentials (401/403).
 * - Zod schema validation of provider HTTP response and structured JSON payload.
 * - HTTP-Referer and X-Title: ManageX headers included.
 * - Zero logging or exposure of API keys, confidential notes, or prompts.
 */

import { env } from '../../config/env.js';
import { AppError, ValidationError } from '../common/errors.js';
import { logger } from '../middleware/logger.js';
import { aiChatResponseSchema } from './schemas/commonAiSchemas.js';

export class AIProviderError extends AppError {
  constructor(message, statusCode = 502, code = 'AI_PROVIDER_ERROR', details = undefined) {
    super(message, statusCode, code, details);
  }
}

export class AIQuotaExceededError extends AppError {
  constructor(message = 'Organisation AI monthly token quota exceeded', details = undefined) {
    super(message, 429, 'AI_QUOTA_EXCEEDED', details);
  }
}

export class AIServiceDisabledError extends AppError {
  constructor(message = 'AI capability is disabled for this organisation or environment', details = undefined) {
    super(message, 403, 'AI_DISABLED', details);
  }
}

const MODEL_PRICING_PER_MILLION = {
  'google/gemini-2.0-flash-001': { prompt: 0.10, completion: 0.40 },
  'openai/gpt-4o-mini': { prompt: 0.15, completion: 0.60 },
  default: { prompt: 0.20, completion: 0.80 },
};

/**
 * Calculates estimated cost in USD based on model token rates.
 */
export function estimateTokenCost(model, promptTokens, completionTokens) {
  const rates = MODEL_PRICING_PER_MILLION[model] || MODEL_PRICING_PER_MILLION.default;
  const promptCost = (promptTokens / 1_000_000) * rates.prompt;
  const completionCost = (completionTokens / 1_000_000) * rates.completion;
  return Number((promptCost + completionCost).toFixed(6));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a structured chat completion request against OpenRouter.
 *
 * @param {object} params
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {import('zod').ZodSchema} [params.outputSchema] - Optional schema to parse JSON content
 * @param {string} [params.model] - Target model (defaults to OPENROUTER_DEFAULT_MODEL)
 * @param {number} [params.temperature=0.2]
 * @param {number} [params.timeoutMs]
 * @param {string} [params.apiKey]
 * @param {string} [params.baseUrl]
 * @param {typeof fetch} [params.fetchFn=fetch] - Injected fetch for unit testing
 * @returns {Promise<{
 *   content: any,
 *   rawContent: string,
 *   model: string,
 *   usage: { promptTokens: number, completionTokens: number, totalTokens: number, estimatedCostUsd: number },
 *   durationMs: number
 * }>}
 */
export async function generateStructuredCompletion({
  messages,
  outputSchema = null,
  model = env.OPENROUTER_DEFAULT_MODEL,
  temperature = 0.2,
  timeoutMs = env.OPENROUTER_TIMEOUT_MS,
  apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
  baseUrl = env.OPENROUTER_BASE_URL,
  provider = { data_collection: 'deny', zdr: true },
  fetchFn = fetch,
}) {
  if (!apiKey) {
    throw new AIProviderError(
      'OpenRouter API key is not configured on this server.',
      503,
      'AI_PROVIDER_UNCONFIGURED'
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('Messages array must not be empty');
  }

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const requestBody = {
    model,
    messages,
    temperature,
    response_format: outputSchema ? { type: 'json_object' } : undefined,
    provider: {
      data_collection: provider?.data_collection || 'deny',
      zdr: provider?.zdr !== undefined ? provider.zdr : true,
    },
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://managex.local',
    'X-Title': 'ManageX',
  };

  const maxRetries = 2;
  let attempt = 0;
  const startTime = Date.now();

  while (attempt <= maxRetries) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Status 429 (rate limit) or 503 (service overloaded) trigger exponential backoff retry
      if ((response.status === 429 || response.status === 503) && attempt <= maxRetries) {
        const backoffMs = Math.min(500 * Math.pow(2, attempt - 1), 3000);
        logger.warn(
          { status: response.status, attempt, backoffMs },
          'OpenRouter transient error, retrying...'
        );
        await wait(backoffMs);
        continue;
      }

      const rawJson = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          rawJson?.error?.message ||
          rawJson?.message ||
          response.statusText ||
          `HTTP ${response.status}`;

        logger.error(
          { status: response.status, code: rawJson?.error?.code },
          'OpenRouter request failed'
        );

        if (response.status === 401 || response.status === 403) {
          throw new AIProviderError(
            'OpenRouter authentication failed: invalid or unauthorized API key',
            502,
            'AI_AUTH_FAILED'
          );
        }

        if (response.status === 429) {
          throw new AIProviderError(
            'OpenRouter rate limit exceeded',
            429,
            'AI_RATE_LIMIT_EXCEEDED'
          );
        }

        throw new AIProviderError(
          `OpenRouter API error: ${errorMsg}`,
          502,
          'AI_PROVIDER_ERROR'
        );
      }

      // Parse response container with Zod
      const parsedContainer = aiChatResponseSchema.safeParse(rawJson);
      if (!parsedContainer.success) {
        logger.error(
          { issues: parsedContainer.error.issues },
          'Invalid response envelope received from OpenRouter'
        );
        throw new AIProviderError(
          'Invalid response format received from AI provider',
          502,
          'AI_INVALID_PROVIDER_RESPONSE'
        );
      }

      const choice = parsedContainer.data.choices[0];
      const rawContent = choice.message.content;
      const actualModel = parsedContainer.data.model || model;

      const promptTokens = parsedContainer.data.usage?.prompt_tokens ?? 0;
      const completionTokens = parsedContainer.data.usage?.completion_tokens ?? 0;
      const totalTokens = parsedContainer.data.usage?.total_tokens ?? (promptTokens + completionTokens);

      let parsedContent = rawContent;
      if (outputSchema) {
        try {
          const jsonParsed = JSON.parse(rawContent);
          const validated = outputSchema.safeParse(jsonParsed);
          if (!validated.success) {
            logger.error(
              { issues: validated.error.issues },
              'AI structured output failed schema validation'
            );
            throw new ValidationError(
              'AI output failed schema validation',
              validated.error.issues
            );
          }
          parsedContent = validated.data;
        } catch (err) {
          if (err instanceof ValidationError) throw err;
          throw new ValidationError('AI response was not valid JSON: ' + err.message);
        }
      }

      const durationMs = Date.now() - startTime;
      const estimatedCostUsd = estimateTokenCost(actualModel, promptTokens, completionTokens);

      return {
        content: parsedContent,
        rawContent,
        model: actualModel,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCostUsd,
        },
        durationMs,
      };
    } catch (err) {
      clearTimeout(timer);

      if (err.name === 'AbortError') {
        throw new AIProviderError(
          `OpenRouter request timed out after ${timeoutMs}ms`,
          504,
          'AI_TIMEOUT'
        );
      }

      // If it's already an AppError (e.g. ValidationError, AIProviderError), propagate directly
      if (err instanceof AppError) {
        throw err;
      }

      // Network level fetch failures
      if (attempt <= maxRetries) {
        const backoffMs = Math.min(500 * Math.pow(2, attempt - 1), 3000);
        logger.warn({ err: err.message, attempt, backoffMs }, 'Network error contacting OpenRouter, retrying...');
        await wait(backoffMs);
        continue;
      }

      throw new AIProviderError(
        `Failed to communicate with OpenRouter: ${err.message}`,
        502,
        'AI_NETWORK_ERROR'
      );
    }
  }

  throw new AIProviderError('OpenRouter request failed after maximum retries', 502, 'AI_MAX_RETRIES_EXCEEDED');
}
