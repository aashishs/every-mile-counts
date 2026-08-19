import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { pool, one } from '../config/db.js';
import { ensureSchemaPatches } from './ensureSchema.js';

dotenv.config();

const PLANS = [
  { name: '1 Month', months: 1, audience: 'universal' },
  { name: '3 Months', months: 3, audience: 'universal' },
  { name: '6 Months', months: 6, audience: 'universal' },
  { name: '12 Months', months: 12, audience: 'universal' },
  { name: '18 Months', months: 18, audience: 'universal' },
  { name: '24 Months', months: 24, audience: 'universal' },
  { name: 'Lifetime', months: null, audience: 'universal', lifetime: true },
  { name: 'Club 12 Months', months: 12, audience: 'club', members: 200, coaches: 20 },
  { name: 'Club Lifetime', months: null, audience: 'club', lifetime: true, members: 500, coaches: 50 },
];

async function seed() {
  await ensureSchemaPatches();
  const email = (process.env.ADMIN_EMAIL || 'admin@everymilecounts.app').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';

  let admin = await one('SELECT * FROM users WHERE email = $1', [email]);
  if (!admin) {
    const hash = await bcrypt.hash(password, 12);
    admin = await one(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified_at)
       VALUES ($1, $2, 'Platform', 'Admin', NOW()) RETURNING *`,
      [email, hash]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'app_admin')
       ON CONFLICT DO NOTHING`,
      [admin.id]
    );
    await pool.query(
      `INSERT INTO memberships (user_id, status, starts_at, expires_at)
       VALUES ($1, 'active', NOW(), NULL)`,
      [admin.id]
    );
    console.log(`Created admin user ${email}`);
  }

  await pool.query(
    `DELETE FROM user_roles ur
     USING user_roles admin_role
     WHERE admin_role.user_id = ur.user_id
       AND admin_role.role = 'app_admin'
       AND ur.role <> 'app_admin'`
  );

  for (const plan of PLANS) {
    const existing = await one('SELECT id FROM membership_plans WHERE name = $1', [plan.name]);
    if (!existing) {
      await pool.query(
        `INSERT INTO membership_plans
          (name, audience, duration_months, is_lifetime, max_club_members, max_club_coaches)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          plan.name,
          plan.audience,
          plan.months,
          Boolean(plan.lifetime),
          plan.members || null,
          plan.coaches || null,
        ]
      );
    }
  }

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES
      ('membership_expiry_windows', '[30,15,7]'::jsonb),
      ('app_name', '"Every Mile Counts"'::jsonb),
      ('free_beta', 'true'::jsonb),
      ('signup_otp_paused', 'false'::jsonb)
     ON CONFLICT (key) DO NOTHING`
  );

  console.log('Seed complete');
  console.log(`Admin login: ${email} / ${password}`);
  console.log('Create invitation codes in Admin → Invite codes. Public beta codes are disabled.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
