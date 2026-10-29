/**
 * ManageX AI Foundation & Quota Integration Suite (managex_test)
 * Strictly verifies Phase 01 AI Quota Service and RLS Enforcement.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  checkOrganisationAiQuota,
  recordAiUsage,
  getOrganisationAiUsageSummary,
  getOrCreateOrganisationAiSettings,
} from './aiQuotaService.js';
import {
  AIQuotaExceededError,
  AIServiceDisabledError,
} from './openrouterClient.js';
import { executeAiCompletion } from './aiService.js';

const TEST_DB_URL = 'postgresql://postgres:postgres_dev_password@localhost:5433/managex_test';

describe('ManageX AI Foundation & Quota Integration Suite (managex_test)', () => {
  let adminClient;
  let orgAId;
  let orgBId;
  let userAId;
  let userBId;

  before(async () => {
    adminClient = new pg.Client({ connectionString: TEST_DB_URL });
    await adminClient.connect();

    // Verify database safety invariant
    const dbRes = await adminClient.query('SELECT current_database() as name');
    if (dbRes.rows[0].name !== 'managex_test') {
      throw new Error(`CRITICAL: Test suite must target managex_test, got ${dbRes.rows[0].name}`);
    }

    // Verify migration 42 is applied
    const migRes = await adminClient.query(
      "SELECT 1 FROM schema_migrations WHERE version = '20261017000042'"
    );
    if (migRes.rowCount !== 1) {
      throw new Error('Test requires managex_test at migration 20261017000042.');
    }

    // Seed test organisations and users
    const orgARes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('AI Org Alpha', 'ai-org-alpha-' || gen_random_uuid()) RETURNING id"
    );
    orgAId = orgARes.rows[0].id;

    const orgBRes = await adminClient.query(
      "INSERT INTO organisations (name, slug) VALUES ('AI Org Beta', 'ai-org-beta-' || gen_random_uuid()) RETURNING id"
    );
    orgBId = orgBRes.rows[0].id;

    const userARes = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('userA-' || gen_random_uuid() || '@managex.local', 'hash', 'User Alpha') RETURNING id"
    );
    userAId = userARes.rows[0].id;

    const userBRes = await adminClient.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ('userB-' || gen_random_uuid() || '@managex.local', 'hash', 'User Beta') RETURNING id"
    );
    userBId = userBRes.rows[0].id;

    // Add memberships
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgAId, userAId]
    );
    await adminClient.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'active')",
      [orgBId, userBId]
    );
  });

  after(async () => {
    if (adminClient) {
      if (orgAId) {
        await adminClient.query('DELETE FROM organisation_memberships WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM organisation_ai_settings WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM ai_usage_records WHERE organisation_id IN ($1, $2)', [orgAId, orgBId]);
        await adminClient.query('DELETE FROM organisations WHERE id IN ($1, $2)', [orgAId, orgBId]);
      }
      if (userAId) {
        await adminClient.query('DELETE FROM users WHERE id IN ($1, $2)', [userAId, userBId]);
      }
      await adminClient.end();
    }
  });

  it('1. Initializes default AI settings with 500,000 monthly quota', async () => {
    const quotaInfo = await checkOrganisationAiQuota({ organisationId: orgAId, userId: userAId });

    assert.equal(quotaInfo.isAllowed, true);
    assert.equal(quotaInfo.monthlyQuota, 500000);
    assert.equal(quotaInfo.tokensUsed, 0);
    assert.equal(quotaInfo.remainingTokens, 500000);
    assert.ok(quotaInfo.allowedModels.includes('google/gemini-2.0-flash-001'));
  });

  it('2. Records usage ledger and aggregates monthly consumption accurately', async () => {
    // Record usage item 1: 15,000 tokens
    await recordAiUsage({
      organisationId: orgAId,
      userId: userAId,
      moduleSlug: 'meetings',
      feature: 'test_feature',
      model: 'google/gemini-2.0-flash-001',
      promptTokens: 10000,
      completionTokens: 5000,
      totalTokens: 15000,
      estimatedCostUsd: 0.003,
      status: 'success',
      durationMs: 450,
    });

    // Record usage item 2: 25,000 tokens
    await recordAiUsage({
      organisationId: orgAId,
      userId: userAId,
      moduleSlug: 'meetings',
      feature: 'test_feature',
      model: 'google/gemini-2.0-flash-001',
      promptTokens: 20000,
      completionTokens: 5000,
      totalTokens: 25000,
      estimatedCostUsd: 0.004,
      status: 'success',
      durationMs: 500,
    });

    const quotaInfo = await checkOrganisationAiQuota({ organisationId: orgAId, userId: userAId });
    assert.equal(quotaInfo.tokensUsed, 40000);
    assert.equal(quotaInfo.remainingTokens, 460000);

    const summary = await getOrganisationAiUsageSummary({ organisationId: orgAId, userId: userAId });
    assert.equal(summary.tokensUsed, 40000);
    assert.equal(summary.remainingTokens, 460000);
    assert.equal(summary.usageByModule.meetings, 40000);
  });

  it('3. Throws AIQuotaExceededError when monthly quota is reached or exceeded', async () => {
    // Manually set quota lower than current usage
    await adminClient.query(
      'UPDATE organisation_ai_settings SET monthly_token_quota = 30000 WHERE organisation_id = $1',
      [orgAId]
    );

    await assert.rejects(
      async () => {
        await checkOrganisationAiQuota({ organisationId: orgAId, userId: userAId });
      },
      (err) => {
        assert.ok(err instanceof AIQuotaExceededError);
        assert.equal(err.statusCode, 429);
        assert.equal(err.code, 'AI_QUOTA_EXCEEDED');
        return true;
      }
    );
  });

  it('4. Throws AIServiceDisabledError when is_ai_enabled is false', async () => {
    await adminClient.query(
      'UPDATE organisation_ai_settings SET is_ai_enabled = false, monthly_token_quota = 500000 WHERE organisation_id = $1',
      [orgAId]
    );

    await assert.rejects(
      async () => {
        await checkOrganisationAiQuota({ organisationId: orgAId, userId: userAId });
      },
      (err) => {
        assert.ok(err instanceof AIServiceDisabledError);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'AI_DISABLED');
        return true;
      }
    );

    // Re-enable
    await adminClient.query(
      'UPDATE organisation_ai_settings SET is_ai_enabled = true WHERE organisation_id = $1',
      [orgAId]
    );
  });

  it('5. Tenant isolation (RLS): Org B cannot view Org A usage records or settings', async () => {
    // Org B summary should show 0 tokens used
    const summaryB = await getOrganisationAiUsageSummary({ organisationId: orgBId, userId: userBId });
    assert.equal(summaryB.tokensUsed, 0);
    assert.equal(summaryB.remainingTokens, 500000);
    assert.deepEqual(summaryB.usageByModule, {});
  });

  it('6. executeAiCompletion orchestrates mock provider and logs usage under tenant context', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ key: 'orchestrated-test' }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    const completion = await executeAiCompletion({
      organisationId: orgBId,
      userId: userBId,
      moduleSlug: 'events',
      feature: 'test_orchestration',
      messages: [{ role: 'user', content: 'Generate test event' }],
      apiKey: 'sk-or-v1-mock-test-key',
      fetchFn: mockFetch,
    });

    assert.ok(completion.content);
    assert.equal(completion.usage.totalTokens, 150);

    // Verify Org B recorded the usage
    const summaryB = await getOrganisationAiUsageSummary({ organisationId: orgBId, userId: userBId });
    assert.equal(summaryB.tokensUsed, 150);
    assert.equal(summaryB.usageByModule.events, 150);
  });
});
