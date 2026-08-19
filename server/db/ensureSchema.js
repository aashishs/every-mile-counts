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
    `INSERT INTO app_settings (key, value) VALUES ('signup_otp_paused', 'false'::jsonb)
     ON CONFLICT (key) DO NOTHING`
  );
  await pool.query(
    `UPDATE app_settings SET value = 'false'::jsonb
     WHERE key = 'signup_otp_paused'
       AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'signup_otp_unpaused_v1')`
  );
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('signup_otp_unpaused_v1', 'true'::jsonb)
     ON CONFLICT (key) DO NOTHING`
  );

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider_user
     ON oauth_connections (provider, provider_user_id)`
  );

  await pool.query(
    `UPDATE invitation_codes
     SET is_disabled = TRUE
     WHERE UPPER(code) IN ('WELCOME-EMC', 'ATHLETE-BETA', 'COACH-BETA', 'CLUB-BETA')
       AND is_disabled = FALSE`
  );

  await pool.query(`
    INSERT INTO user_roles (user_id, role)
    SELECT ur.user_id, 'athlete'
    FROM user_roles ur
    WHERE ur.role = 'coach'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ca
        WHERE ca.user_id = ur.user_id AND ca.role IN ('club_admin', 'app_admin')
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_roles a
        WHERE a.user_id = ur.user_id AND a.role = 'athlete'
      )
    ON CONFLICT DO NOTHING
  `);

  await pool.query(`
    INSERT INTO user_roles (user_id, role)
    SELECT DISTINCT cm.user_id, 'club_admin'
    FROM club_members cm
    WHERE cm.role = 'club_admin' AND cm.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles aa
        WHERE aa.user_id = cm.user_id AND aa.role = 'app_admin'
      )
    ON CONFLICT DO NOTHING
  `);

  await pool.query(`
    DELETE FROM user_roles ur
    WHERE ur.role IN ('athlete', 'coach')
      AND EXISTS (
        SELECT 1 FROM user_roles ca
        WHERE ca.user_id = ur.user_id AND ca.role = 'club_admin'
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_roles aa
        WHERE aa.user_id = ur.user_id AND aa.role = 'app_admin'
      )
  `);

  await pool.query(`
    UPDATE coach_assignments ca
    SET status = 'inactive'
    WHERE ca.status = 'active'
      AND (
        (
          EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = ca.athlete_id AND ur.role = 'club_admin')
          AND NOT EXISTS (SELECT 1 FROM user_roles aa WHERE aa.user_id = ca.athlete_id AND aa.role = 'app_admin')
        )
        OR (
          EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = ca.coach_id AND ur.role = 'club_admin')
          AND NOT EXISTS (SELECT 1 FROM user_roles aa WHERE aa.user_id = ca.coach_id AND aa.role = 'app_admin')
        )
      )
  `);

  await pool.query(`
    UPDATE clubs c
    SET status = 'pending_coach', updated_at = NOW()
    WHERE c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = c.id AND cm.status = 'active' AND cm.role = 'coach'
      )
  `);

  await pool.query(`ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_requests_status_check`);
  await pool.query(
    `ALTER TABLE review_requests ADD CONSTRAINT review_requests_status_check
     CHECK (status IN ('pending', 'completed', 'cancelled'))`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_assignment_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (club_id, athlete_id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_coach_assignment_requests_club
     ON coach_assignment_requests (club_id, status)`
  );
  await pool.query(`
    DELETE FROM review_requests a
    USING review_requests b
    WHERE a.ctid < b.ctid
      AND a.activity_id = b.activity_id
      AND a.coach_id = b.coach_id
      AND a.status = 'pending'
      AND b.status = 'pending'
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_review_requests_pending
     ON review_requests (activity_id, coach_id)
     WHERE status = 'pending'`
  );
}
