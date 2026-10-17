/**
 * ManageX Transactional SQL Migration Runner
 * Adheres strictly to docs/database.md, docs/runbook.md, and PRD Section 6.8 (OPS-003)
 */

import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load environment variables if available
dotenv.config();

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function computeChecksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Runs all pending migrations sequentially inside isolated transaction blocks.
 * @param {string} [customDatabaseUrl] - Optional connection URL for testing or target selection
 * @returns {Promise<{ applied: string[], total: number }>}
 */
export async function runMigrations(customDatabaseUrl) {
  const databaseUrl = customDatabaseUrl || process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or MIGRATION_DATABASE_URL must be provided to run migrations.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const applied = [];

  try {
    // 1. Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum VARCHAR(64) NOT NULL
      );
    `);

    // 2. Query previously applied migrations
    const res = await client.query('SELECT version, checksum FROM schema_migrations ORDER BY version ASC');
    const appliedMap = new Map(res.rows.map((row) => [row.version, row.checksum]));

    // 3. Read migration files from database/migrations/
    const migrationsDir = resolve(__dirname, 'migrations');
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    console.log(`[Migrations] Found ${files.length} migration file(s) in ${migrationsDir}`);

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        console.warn(`[Migrations] Skipping file without valid version prefix: ${file}`);
        continue;
      }

      const version = match[1];
      const name = match[2];
      const filePath = join(migrationsDir, file);
      const sqlContent = await readFile(filePath, 'utf-8');
      const checksum = computeChecksum(sqlContent);

      if (appliedMap.has(version)) {
        const previousChecksum = appliedMap.get(version);
        if (previousChecksum !== checksum) {
          throw new Error(
            `Migration integrity error: Checksum mismatch for migration "${file}". ` +
            `Expected ${previousChecksum}, but found ${checksum}. Modified migrations must not be rerun.`
          );
        }
        continue;
      }

      console.log(`[Migrations] Applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [version, name, checksum]
        );
        await client.query('COMMIT');
        applied.push(file);
        console.log(`[Migrations] Successfully applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrations] Failed to apply ${file}. Transaction rolled back.`);
        throw err;
      }
    }

    console.log(`[Migrations] Migration run complete. ${applied.length} new migration(s) applied.`);
    return { applied, total: files.length };
  } finally {
    await client.end();
  }
}

// CLI execution check
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runMigrations()
    .then((result) => {
      console.log(`[Migrations] Done. Applied: ${result.applied.length}, Total: ${result.total}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migrations] Unhandled error during migration execution:', err);
      process.exit(1);
    });
}
