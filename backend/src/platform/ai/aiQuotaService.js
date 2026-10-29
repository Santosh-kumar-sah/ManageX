/**
 * ManageX AI Quota & Usage Accounting Service (Phase 01)
 * Strictly adheres to docs/managex-ai-implementation-plan.md (Sections 5.1, 8.2),
 * PRD Section 11, and docs/security.md.
 *
 * Invariants:
 * - Atomic monthly token quota balance checks inside tenant context.
 * - Append-only immutable usage records with duration and token counts.
 * - Zero raw prompt or response text stored in database or logged.
 * - Tenant isolation enforced via withTenantTransaction and RLS.
 */

import { withTenantTransaction } from '../database/transaction.js';
import { env } from '../../config/env.js';
import {
  AIQuotaExceededError,
  AIServiceDisabledError,
} from './openrouterClient.js';
import { logger } from '../middleware/logger.js';

/**
 * Retrieves or lazily initializes organisation AI settings under tenant context.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} organisationId
 * @returns {Promise<{
 *   organisationId: string,
 *   isAiEnabled: boolean,
 *   monthlyTokenQuota: number,
 *   maxRequestsPerMinute: number,
 *   allowedModels: string[]
 * }>}
 */
export async function getOrCreateOrganisationAiSettings(client, organisationId) {
  const selectRes = await client.query(
    `SELECT organisation_id, is_ai_enabled, monthly_token_quota, max_requests_per_minute, allowed_models
     FROM organisation_ai_settings
     WHERE organisation_id = $1`,
    [organisationId]
  );

  if (selectRes.rows.length > 0) {
    const row = selectRes.rows[0];
    return {
      organisationId: row.organisation_id,
      isAiEnabled: row.is_ai_enabled,
      monthlyTokenQuota: Number(row.monthly_token_quota),
      maxRequestsPerMinute: Number(row.max_requests_per_minute),
      allowedModels: row.allowed_models,
    };
  }

  // Insert default settings
  const defaultQuota = env.AI_DEFAULT_MONTHLY_TOKEN_QUOTA || 500000;
  const insertRes = await client.query(
    `INSERT INTO organisation_ai_settings (
       organisation_id, is_ai_enabled, monthly_token_quota, max_requests_per_minute, allowed_models
     ) VALUES ($1, true, $2, 20, ARRAY['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001'])
     ON CONFLICT (organisation_id) DO UPDATE SET updated_at = NOW()
     RETURNING organisation_id, is_ai_enabled, monthly_token_quota, max_requests_per_minute, allowed_models`,
    [organisationId, defaultQuota]
  );

  const row = insertRes.rows[0];
  return {
    organisationId: row.organisation_id,
    isAiEnabled: row.is_ai_enabled,
    monthlyTokenQuota: Number(row.monthly_token_quota),
    maxRequestsPerMinute: Number(row.max_requests_per_minute),
    allowedModels: row.allowed_models,
  };
}

/**
 * Checks whether the organisation has sufficient monthly token quota remaining.
 * Must be executed before initiating external LLM network I/O.
 *
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.userId
 * @returns {Promise<{
 *   isAllowed: boolean,
 *   monthlyQuota: number,
 *   tokensUsed: number,
 *   remainingTokens: number,
 *   allowedModels: string[]
 * }>}
 */
export async function checkOrganisationAiQuota({ organisationId, userId }) {
  if (!env.AI_ENABLED) {
    throw new AIServiceDisabledError('ManageX AI is globally disabled on this environment');
  }

  return withTenantTransaction({ organisationId, userId }, async (client) => {
    const settings = await getOrCreateOrganisationAiSettings(client, organisationId);

    if (!settings.isAiEnabled) {
      throw new AIServiceDisabledError('AI features are disabled for this organisation');
    }

    // Aggregate tokens used this current calendar month
    const usageRes = await client.query(
      `SELECT COALESCE(SUM(total_tokens), 0)::bigint AS tokens_used
       FROM ai_usage_records
       WHERE organisation_id = $1
         AND status = 'success'
         AND created_at >= date_trunc('month', NOW())`,
      [organisationId]
    );

    const tokensUsed = Number(usageRes.rows[0]?.tokens_used || 0);
    const remainingTokens = Math.max(0, settings.monthlyTokenQuota - tokensUsed);

    if (tokensUsed >= settings.monthlyTokenQuota) {
      throw new AIQuotaExceededError(
        `Monthly AI token quota exceeded for organisation. Used: ${tokensUsed}, Quota: ${settings.monthlyTokenQuota}.`
      );
    }

    return {
      isAllowed: true,
      monthlyQuota: settings.monthlyTokenQuota,
      tokensUsed,
      remainingTokens,
      allowedModels: settings.allowedModels,
    };
  });
}

/**
 * Appends an immutable AI usage record into ai_usage_records under tenant context.
 * Runs in a short, dedicated transaction strictly AFTER provider response has completed.
 *
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} [params.userId]
 * @param {string} params.moduleSlug
 * @param {string} params.feature
 * @param {string} [params.provider='openrouter']
 * @param {string} params.model
 * @param {number} params.promptTokens
 * @param {number} params.completionTokens
 * @param {number} params.totalTokens
 * @param {number} params.estimatedCostUsd
 * @param {string} [params.status='success']
 * @param {number} params.durationMs
 * @returns {Promise<object>}
 */
export async function recordAiUsage({
  organisationId,
  userId = null,
  moduleSlug,
  feature,
  provider = 'openrouter',
  model,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  estimatedCostUsd = 0,
  status = 'success',
  durationMs = 0,
  client = null,
}) {
  const executeInsert = async (db) => {
    const insertRes = await db.query(
      `INSERT INTO ai_usage_records (
         organisation_id, user_id, module_slug, feature, provider, model,
         prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
         status, duration_ms
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, organisation_id, user_id, module_slug, feature, model,
                 total_tokens, estimated_cost_usd, status, duration_ms, created_at`,
      [
        organisationId,
        userId,
        moduleSlug,
        feature,
        provider,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd,
        status,
        durationMs,
      ]
    );

    return insertRes.rows[0];
  };

  if (client) {
    return executeInsert(client);
  }

  return withTenantTransaction({ organisationId, userId }, executeInsert);
}

/**
 * Returns a high-level usage summary for the organisation settings tab.
 *
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.userId
 * @returns {Promise<object>}
 */
export async function getOrganisationAiUsageSummary({ organisationId, userId }) {
  return withTenantTransaction({ organisationId, userId }, async (client) => {
    const settings = await getOrCreateOrganisationAiSettings(client, organisationId);

    const totalRes = await client.query(
      `SELECT 
         COALESCE(SUM(total_tokens), 0)::bigint AS tokens_used,
         COALESCE(SUM(estimated_cost_usd), 0)::numeric(10, 4) AS estimated_cost_usd
       FROM ai_usage_records
       WHERE organisation_id = $1
         AND status = 'success'
         AND created_at >= date_trunc('month', NOW())`,
      [organisationId]
    );

    const byModuleRes = await client.query(
      `SELECT module_slug, COALESCE(SUM(total_tokens), 0)::bigint AS module_tokens
       FROM ai_usage_records
       WHERE organisation_id = $1
         AND status = 'success'
         AND created_at >= date_trunc('month', NOW())
       GROUP BY module_slug`,
      [organisationId]
    );

    const tokensUsed = Number(totalRes.rows[0]?.tokens_used || 0);
    const estimatedCostUsd = Number(totalRes.rows[0]?.estimated_cost_usd || 0);
    const remainingTokens = Math.max(0, settings.monthlyTokenQuota - tokensUsed);
    const percentUsed = settings.monthlyTokenQuota > 0
      ? Number(((tokensUsed / settings.monthlyTokenQuota) * 100).toFixed(1))
      : 0;

    const usageByModule = {};
    for (const row of byModuleRes.rows) {
      usageByModule[row.module_slug] = Number(row.module_tokens);
    }

    return {
      isAiEnabled: settings.isAiEnabled,
      monthlyTokenQuota: settings.monthlyTokenQuota,
      tokensUsed,
      remainingTokens,
      percentUsed,
      estimatedMonthlyCostUsd: estimatedCostUsd,
      usageByModule,
    };
  });
}
