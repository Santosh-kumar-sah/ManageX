/**
 * ManageX Demo User Seeder
 * Creates demo users for local development and testing.
 * Run: node database/seed-demo-users.js
 *
 * Users created (all with password: Password123!):
 *   - admin@managex.dev      — Platform Super Admin
 *   - organiser@managex.dev  — Organisation Owner (ManageX Demo Org)
 *   - member@managex.dev     — Organisation Member
 *   - student@managex.dev    — External participant (no org membership)
 */

import pg from 'pg';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

const DATABASE_URL =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres_dev_password@localhost:5433/managex';

const DEMO_PASSWORD = 'Password123!';

async function seed() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Set platform admin context for RLS
    await client.query("SELECT set_config('app.current_is_platform_admin', 'true', true)");

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // 1. Create demo users (upsert by email)
    const users = [
      {
        email: 'admin@managex.dev',
        fullName: 'Platform Admin',
        isPlatformAdmin: true,
        platformRole: 'platform_super_admin',
      },
      {
        email: 'organiser@managex.dev',
        fullName: 'Demo Organiser',
        isPlatformAdmin: false,
        platformRole: null,
      },
      {
        email: 'member@managex.dev',
        fullName: 'Demo Member',
        isPlatformAdmin: false,
        platformRole: null,
      },
      {
        email: 'student@managex.dev',
        fullName: 'Demo Student',
        isPlatformAdmin: false,
        platformRole: null,
      },
    ];

    const userIds = {};
    for (const u of users) {
      const res = await client.query(
        `INSERT INTO users (email, full_name, password_hash, status, is_platform_admin, platform_role, email_verified_at)
         VALUES ($1, $2, $3, 'active', $4, $5, NOW())
         ON CONFLICT (LOWER(email)) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               status = 'active',
               is_platform_admin = EXCLUDED.is_platform_admin,
               platform_role = EXCLUDED.platform_role,
               email_verified_at = COALESCE(users.email_verified_at, NOW())
         RETURNING id`,
        [u.email, u.fullName, passwordHash, u.isPlatformAdmin, u.platformRole]
      );
      userIds[u.email] = res.rows[0].id;
      console.log(`  ✓ User: ${u.email} (${u.fullName}) → ${res.rows[0].id}`);
    }

    // 2. Create demo organisation
    const orgRes = await client.query(
      `INSERT INTO organisations (name, slug)
       VALUES ('ManageX Demo Org', 'managex-demo-org')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const orgId = orgRes.rows[0].id;
    console.log(`  ✓ Organisation: ManageX Demo Org → ${orgId}`);

    // Set org context for RLS
    await client.query("SELECT set_config('app.current_organisation_id', $1::text, true)", [orgId]);

    // 3. Enable all modules for the org
    const modules = await client.query(`SELECT id, slug FROM modules`);
    for (const mod of modules.rows) {
      await client.query(
        `INSERT INTO organisation_module_entitlements (organisation_id, module_id, is_enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (organisation_id, module_id) DO UPDATE SET is_enabled = true`,
        [orgId, mod.id]
      );
      console.log(`  ✓ Module enabled: ${mod.slug}`);
    }

    // 4. Create memberships with roles
    const roleSlugs = {
      'organiser@managex.dev': 'organisation_owner',
      'member@managex.dev': 'organisation_member',
    };

    for (const [email, roleSlug] of Object.entries(roleSlugs)) {
      // Create membership
      const memRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (organisation_id, user_id) DO UPDATE SET status = 'active'
         RETURNING id`,
        [orgId, userIds[email]]
      );
      const membershipId = memRes.rows[0].id;

      // Assign role
      const roleRes = await client.query(
        `SELECT id FROM roles WHERE slug = $1 AND (organisation_id IS NULL OR organisation_id = $2)`,
        [roleSlug, orgId]
      );
      if (roleRes.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (membership_id, role_id, organisation_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [membershipId, roleRes.rows[0].id, orgId]
        );
      }
      console.log(`  ✓ Membership: ${email} → ${roleSlug}`);
    }

    // 5. Admin gets platform admin membership too (optional — for org-level access)
    await client.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (organisation_id, user_id) DO UPDATE SET status = 'active'`,
      [orgId, userIds['admin@managex.dev']]
    );

    // Assign admin role to platform admin within the org
    const adminRoleRes = await client.query(
      `SELECT id FROM roles WHERE slug = 'organisation_admin' AND organisation_id IS NULL`
    );
    if (adminRoleRes.rows.length > 0) {
      const adminMemRes = await client.query(
        `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2`,
        [orgId, userIds['admin@managex.dev']]
      );
      if (adminMemRes.rows.length > 0) {
        await client.query(
          `INSERT INTO membership_roles (membership_id, role_id, organisation_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [adminMemRes.rows[0].id, adminRoleRes.rows[0].id, orgId]
        );
      }
    }
    console.log(`  ✓ Membership: admin@managex.dev → organisation_admin`);

    await client.query('COMMIT');

    console.log('\n✅ Demo users seeded successfully!\n');
    console.log('┌─────────────────────────────┬───────────────────┬──────────────────────────┐');
    console.log('│ Email                       │ Password          │ Role                     │');
    console.log('├─────────────────────────────┼───────────────────┼──────────────────────────┤');
    console.log('│ admin@managex.dev           │ Password123!      │ Platform Super Admin     │');
    console.log('│ organiser@managex.dev       │ Password123!      │ Organisation Owner       │');
    console.log('│ member@managex.dev          │ Password123!      │ Organisation Member      │');
    console.log('│ student@managex.dev         │ Password123!      │ Participant (no org)     │');
    console.log('└─────────────────────────────┴───────────────────┴──────────────────────────┘');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
