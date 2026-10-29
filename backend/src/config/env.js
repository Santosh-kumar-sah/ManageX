import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env if present
dotenv.config();

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().optional().default('postgresql://managex_app:placeholder@localhost:5432/managex'),
    SESSION_SECRET: z.string().min(16).default('development_secret_minimum_16_chars_length'),
    CSRF_SECRET: z.string().min(16).default('development_csrf_minimum_16_chars_length'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),
    BREVO_SENDER_EMAIL: z.string().optional(),
    EMAIL_FROM: z.string().default('ManageX <notifications@managex.local>'),

    // Google OAuth 2.0 Integration (Phase 1B — Optional during development)
    GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID must not be empty if provided').optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET must not be empty if provided').optional(),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url('GOOGLE_OAUTH_REDIRECT_URI must be a valid URL if provided').optional(),

    // Token Encryption (Phase 1B.1 — AES-256-GCM)
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .regex(HEX_64_REGEX, 'TOKEN_ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes)')
      .optional(),
    TOKEN_ENCRYPTION_KEY_VERSION: z.string().min(1, 'TOKEN_ENCRYPTION_KEY_VERSION must not be empty').default('1'),
    TOKEN_ENCRYPTION_KEYRING: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          try {
            const parsed = JSON.parse(val);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              return false;
            }
            for (const [version, key] of Object.entries(parsed)) {
              if (typeof version !== 'string' || version.trim().length === 0) return false;
              if (typeof key !== 'string' || !HEX_64_REGEX.test(key)) return false;
            }
            return true;
          } catch {
            return false;
          }
        },
        {
          message:
            'TOKEN_ENCRYPTION_KEYRING must be a valid JSON object mapping non-empty string version IDs to 64-character hex keys',
        }
      ),

    // AI & OpenRouter Integration (Phase 01)
    AI_ENABLED: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === 'true')
      .default(true),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
    OPENROUTER_DEFAULT_MODEL: z.string().default('openai/gpt-4o-mini'),
    OPENROUTER_FALLBACK_MODEL: z.string().default('openai/gpt-4o-mini'),
    OPENROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    AI_DEFAULT_MONTHLY_TOKEN_QUOTA: z.coerce.number().int().positive().default(500000),
  })
  .superRefine((data, ctx) => {
    const googleFields = [
      { key: 'GOOGLE_CLIENT_ID', val: data.GOOGLE_CLIENT_ID },
      { key: 'GOOGLE_CLIENT_SECRET', val: data.GOOGLE_CLIENT_SECRET },
      { key: 'GOOGLE_OAUTH_REDIRECT_URI', val: data.GOOGLE_OAUTH_REDIRECT_URI },
    ];
    const providedGoogle = googleFields.filter((f) => f.val !== undefined && f.val !== '');

    // Partial Google OAuth credentials supplied: require all three
    if (providedGoogle.length > 0 && providedGoogle.length < 3) {
      const missing = googleFields.filter((f) => !f.val || f.val === '').map((f) => f.key);
      for (const m of missing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [m],
          message: `${m} is required when configuring Google OAuth integration.`,
        });
      }
    }

    // If Google OAuth is configured, TOKEN_ENCRYPTION_KEY must also be configured to encrypt tokens
    if (providedGoogle.length === 3 && (!data.TOKEN_ENCRYPTION_KEY || data.TOKEN_ENCRYPTION_KEY === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TOKEN_ENCRYPTION_KEY'],
        message: 'TOKEN_ENCRYPTION_KEY is required when Google OAuth integration is configured.',
      });
    }
  });

export function loadConfig(envSource = process.env, { exitOnError = true } = {}) {
  const parsed = envSchema.safeParse(envSource);

  if (!parsed.success) {
    // SECURITY INVARIANT: Print missing or invalid variable names ONLY.
    // Never print secret values or complete environment dumps.
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    if (exitOnError) {
      console.error('CRITICAL: Environment configuration validation failed:');
      issues.forEach((msg) => console.error(`  - ${msg}`));
      process.exit(1);
    }
    const err = new Error('Environment configuration validation failed');
    err.issues = issues;
    err.zodError = parsed.error;
    throw err;
  }

  return Object.freeze(parsed.data);
}

export const env = loadConfig();

