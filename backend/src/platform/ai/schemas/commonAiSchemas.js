import { z } from 'zod';

export const aiProviderUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative().default(0),
  completion_tokens: z.number().int().nonnegative().default(0),
  total_tokens: z.number().int().nonnegative().default(0),
});

export const aiChatResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.string(),
        content: z.string(),
      }),
      finish_reason: z.string().nullable().optional(),
    })
  ).min(1, 'OpenRouter response must include at least one choice'),
  usage: aiProviderUsageSchema.optional(),
});

export const aiStructuredResultSchema = z.object({
  content: z.unknown(),
  rawContent: z.string(),
  model: z.string(),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
  }),
  durationMs: z.number().int().nonnegative(),
});

export const organisationAiSettingsSchema = z.object({
  organisationId: z.string().uuid(),
  isAiEnabled: z.boolean(),
  monthlyTokenQuota: z.coerce.number().int().positive(),
  maxRequestsPerMinute: z.coerce.number().int().positive(),
  allowedModels: z.array(z.string()),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const aiUsageRecordSchema = z.object({
  id: z.string().uuid().optional(),
  organisationId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  moduleSlug: z.string().min(1).max(50),
  feature: z.string().min(1).max(100),
  provider: z.string().default('openrouter'),
  model: z.string().min(1).max(100),
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  estimatedCostUsd: z.number().nonnegative().default(0),
  status: z.enum(['success', 'failed', 'timeout', 'quota_exceeded', 'rate_limited']),
  durationMs: z.number().int().nonnegative().default(0),
});
