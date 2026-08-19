import { pool } from '../config/db.js';

export async function ensureSchemaPatches() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_activity_type TEXT NOT NULL DEFAULT 'Run'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TIME`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens (expires_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_otps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_otps_user ON login_otps (user_id, created_at DESC)`);

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('signup_otp_paused', 'true'::jsonb)
     ON CONFLICT (key) DO NOTHING`
  );
}
