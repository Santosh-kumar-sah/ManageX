import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env if present
dotenv.config();

const envSchema = z.object({
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
  EMAIL_FROM: z.string().default('ManageX <notifications@managex.local>'),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // SECURITY INVARIANT: Print missing or invalid variable names ONLY.
    // Never print secret values or complete environment dumps.
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    console.error('CRITICAL: Environment configuration validation failed:');
    issues.forEach((msg) => console.error(`  - ${msg}`));
    process.exit(1);
  }

  return Object.freeze(parsed.data);
}

export const env = loadConfig();
