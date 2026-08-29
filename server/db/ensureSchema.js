import { pool } from '../config/db.js';

export async function ensureSchemaPatches() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_activity_type TEXT NOT NULL DEFAULT 'Run'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sync_activity_types JSONB NOT NULL DEFAULT '["Run","Ride","Swim","Walk","Hike","Workout","WeightTraining","Yoga","HIIT"]'::jsonb`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sync_activity_types_confirmed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS maf_offset SMALLINT NOT NULL DEFAULT 0`);
  await pool.query(`
    UPDATE users
    SET maf_offset = GREATEST(0, LEAST(5, COALESCE(maf_heart_rate, 0) - (180 - age)))
    WHERE age IS NOT NULL AND age > 0 AND maf_heart_rate IS NOT NULL
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS week_starts_on SMALLINT NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TIME`);
  await pool.query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_time INTEGER`);
  await pool.query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'Run'`);
  await pool.query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS matched_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS coach_visible BOOLEAN NOT NULL DEFAULT FALSE`);
  const goalTypeCheck = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'goals'::regclass AND conname = 'goals_type_check'`
  );
  if (!/weekly_mileage/.test(goalTypeCheck.rows[0]?.def || '')) {
    await pool.query(`ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_type_check`);
    await pool.query(`
      ALTER TABLE goals ADD CONSTRAINT goals_type_check
      CHECK (type IN ('race', 'distance', 'weekly_mileage', 'time', 'challenge', 'other'))
    `);
  }

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
  await pool.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS head_coach_user_id UUID REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE club_members ADD COLUMN IF NOT EXISTS head_coach_choice TEXT`);
  await pool.query(`ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS granted_scope TEXT`);
  await pool.query(`ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS pending_coach_share BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS coach_share_consented_at TIMESTAMPTZ`);

  await pool.query(`
    INSERT INTO user_roles (user_id, role)
    SELECT ur.user_id, 'athlete'
    FROM user_roles ur
    WHERE ur.role = 'coach'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ca
        WHERE ca.user_id = ur.user_id AND ca.role IN ('club_admin', 'app_admin', 'super_admin', 'admin', 'support_admin')
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
        WHERE aa.user_id = cm.user_id AND aa.role IN ('app_admin', 'super_admin', 'admin', 'support_admin')
      )
    ON CONFLICT DO NOTHING
  `);

  await pool.query(`
    DELETE FROM user_roles ur
    WHERE ur.role = 'athlete'
      AND EXISTS (
        SELECT 1 FROM user_roles ca
        WHERE ca.user_id = ur.user_id AND ca.role = 'club_admin'
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_roles aa
        WHERE aa.user_id = ur.user_id AND aa.role IN ('app_admin', 'super_admin', 'admin', 'support_admin')
      )
  `);

  await pool.query(`
    DELETE FROM user_roles ur
    WHERE ur.role = 'coach'
      AND EXISTS (
        SELECT 1 FROM user_roles ca
        WHERE ca.user_id = ur.user_id AND ca.role = 'club_admin'
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_roles aa
        WHERE aa.user_id = ur.user_id AND aa.role IN ('app_admin', 'super_admin', 'admin', 'support_admin')
      )
      AND NOT EXISTS (
        SELECT 1 FROM clubs c WHERE c.head_coach_user_id = ur.user_id
      )
  `);

  await pool.query(`
    UPDATE coach_assignments ca
    SET status = 'inactive'
    WHERE ca.status = 'active'
      AND (
        (
          EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = ca.athlete_id AND ur.role = 'club_admin')
          AND NOT EXISTS (SELECT 1 FROM user_roles aa WHERE aa.user_id = ca.athlete_id AND aa.role IN ('app_admin', 'super_admin', 'admin', 'support_admin'))
        )
        OR (
          EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = ca.coach_id AND ur.role = 'club_admin')
          AND NOT EXISTS (SELECT 1 FROM user_roles aa WHERE aa.user_id = ca.coach_id AND aa.role IN ('app_admin', 'super_admin', 'admin', 'support_admin'))
          AND NOT EXISTS (
            SELECT 1 FROM clubs c
            WHERE c.head_coach_user_id = ca.coach_id AND (ca.club_id IS NULL OR ca.club_id = c.id)
          )
        )
      )
  `);

  await pool.query(`
    UPDATE clubs c
    SET status = 'pending_coach', updated_at = NOW()
    WHERE c.status = 'active'
      AND c.head_coach_user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = c.id AND cm.status = 'active' AND cm.role = 'coach'
      )
  `);

  await pool.query(`
    INSERT INTO user_roles (user_id, role)
    SELECT DISTINCT c.head_coach_user_id, 'coach'
    FROM clubs c
    WHERE c.head_coach_user_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);

  await pool.query(`
    INSERT INTO coach_assignments (athlete_id, coach_id, club_id, assigned_by, status)
    SELECT cm.user_id, c.head_coach_user_id, c.id, c.head_coach_user_id, 'active'
    FROM clubs c
    JOIN club_members cm ON cm.club_id = c.id AND cm.status = 'active' AND cm.role = 'member'
    WHERE c.head_coach_user_id IS NOT NULL
      AND cm.user_id <> c.head_coach_user_id
      AND NOT EXISTS (
        SELECT 1 FROM coach_assignments ca
        WHERE ca.athlete_id = cm.user_id AND ca.coach_id = c.head_coach_user_id
      )
      AND (
        SELECT COUNT(*) FROM coach_assignments ca
        WHERE ca.athlete_id = cm.user_id AND ca.status = 'active'
      ) < 3
    ON CONFLICT (athlete_id, coach_id) DO NOTHING
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

  await pool.query(`ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check`);
  await pool.query(`
    ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('athlete', 'coach', 'club_admin', 'app_admin', 'super_admin', 'admin', 'support_admin'))
  `);
  await pool.query(`
    INSERT INTO user_roles (user_id, role)
    SELECT user_id, 'super_admin' FROM user_roles WHERE role = 'app_admin'
    ON CONFLICT DO NOTHING
  `);
  await pool.query(`DELETE FROM user_roles WHERE role = 'app_admin'`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
     ON support_ticket_messages (ticket_id, created_at)`
  );
  await pool.query(`
    INSERT INTO support_ticket_messages (ticket_id, user_id, body, created_at)
    SELECT t.id, t.user_id, t.body, t.created_at
    FROM support_tickets t
    WHERE NOT EXISTS (
      SELECT 1 FROM support_ticket_messages m WHERE m.ticket_id = t.id
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_role_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (club_id, athlete_id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_coach_role_requests_status
     ON coach_role_requests (status, created_at DESC)`
  );

  await pool.query(
    `ALTER TABLE invitation_codes ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_invitation_codes_club ON invitation_codes (club_id)`);

  await ensureTrainingPlanSchema();
}

async function ensureTrainingPlanSchema() {
  await pool.query(`ALTER TABLE activity_reviews ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_club ON activity_reviews (club_id, athlete_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      athlete_id UUID REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      sport TEXT NOT NULL DEFAULT 'Run',
      start_date DATE,
      end_date DATE,
      target_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
      target_event_name TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'halted', 'completed', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_training_programs_coach ON training_programs (coach_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_training_programs_athlete ON training_programs (athlete_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_training_programs_club ON training_programs (club_id)`);
  await pool.query(`DROP INDEX IF EXISTS idx_training_programs_one_live`);
  await pool.query(`ALTER TABLE training_programs DROP CONSTRAINT IF EXISTS training_programs_status_check`);
  await pool.query(`
    ALTER TABLE training_programs ADD CONSTRAINT training_programs_status_check
    CHECK (status IN ('draft', 'active', 'paused', 'halted', 'completed', 'archived'))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_phases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      objective TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_training_phases_program ON training_phases (program_id, sort_order)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_weeks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
      phase_id UUID NOT NULL REFERENCES training_phases(id) ON DELETE CASCADE,
      week_number INTEGER NOT NULL DEFAULT 1,
      start_date DATE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_training_weeks_phase ON training_weeks (phase_id, week_number)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS planned_workouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
      phase_id UUID REFERENCES training_phases(id) ON DELETE SET NULL,
      week_id UUID REFERENCES training_weeks(id) ON DELETE SET NULL,
      athlete_id UUID REFERENCES users(id) ON DELETE CASCADE,
      coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      scheduled_date DATE NOT NULL,
      name TEXT,
      sport TEXT NOT NULL DEFAULT 'Run',
      workout_type TEXT NOT NULL DEFAULT 'Easy',
      distance NUMERIC,
      duration INTEGER,
      target_pace NUMERIC,
      target_hr_zone INTEGER CHECK (target_hr_zone IS NULL OR target_hr_zone BETWEEN 1 AND 5),
      target_hr NUMERIC,
      target_power NUMERIC,
      rpe INTEGER CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
      warmup TEXT,
      main_set TEXT,
      cooldown TEXT,
      instructions TEXT,
      coach_notes TEXT,
      completion_status TEXT NOT NULL DEFAULT 'planned'
        CHECK (completion_status IN ('planned', 'completed', 'partial', 'missed', 'skipped', 'pending_match')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_planned_workouts_athlete_date ON planned_workouts (athlete_id, scheduled_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_planned_workouts_program ON planned_workouts (program_id, scheduled_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_planned_workouts_status ON planned_workouts (athlete_id, completion_status, scheduled_date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_activity_matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      planned_workout_id UUID NOT NULL REFERENCES planned_workouts(id) ON DELETE CASCADE,
      activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
      score NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'suggested'
        CHECK (status IN ('auto', 'suggested', 'confirmed', 'rejected')),
      comparison JSONB NOT NULL DEFAULT '{}'::jsonb,
      matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_by UUID REFERENCES users(id),
      UNIQUE (planned_workout_id, activity_id)
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_matches_activity_live
    ON workout_activity_matches (activity_id)
    WHERE status IN ('auto', 'confirmed')
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_workout_matches_workout ON workout_activity_matches (planned_workout_id, status)`);

  await pool.query(`ALTER TABLE planned_workouts ALTER COLUMN program_id DROP NOT NULL`);
  await pool.query(`ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS group_id UUID`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_groups_coach ON coach_groups (coach_id, club_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_group_members (
      group_id UUID NOT NULL REFERENCES coach_groups(id) ON DELETE CASCADE,
      athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (group_id, athlete_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_group_members_athlete ON coach_group_members (athlete_id)`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE planned_workouts
        ADD CONSTRAINT planned_workouts_group_id_fkey
        FOREIGN KEY (group_id) REFERENCES coach_groups(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`ALTER TABLE activity_reviews ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES training_programs(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE activity_reviews ADD COLUMN IF NOT EXISTS planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL`);

  await pool.query(`
    UPDATE activity_reviews r
    SET club_id = ca.club_id
    FROM coach_assignments ca
    WHERE r.club_id IS NULL
      AND ca.athlete_id = r.athlete_id
      AND ca.coach_id = r.coach_id
      AND ca.club_id IS NOT NULL
  `);
  await pool.query(`
    UPDATE review_requests rr
    SET club_id = ca.club_id
    FROM coach_assignments ca
    WHERE rr.club_id IS NULL
      AND ca.athlete_id = rr.athlete_id
      AND ca.coach_id = rr.coach_id
      AND ca.club_id IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_day_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
      note_date DATE NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (athlete_id, coach_id, note_date)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_training_day_notes_athlete_date ON training_day_notes (athlete_id, note_date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_day_unavailability (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      unavailable_date DATE NOT NULL,
      reason TEXT NOT NULL DEFAULT 'rest'
        CHECK (reason IN ('injury', 'travel', 'rest', 'other')),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (athlete_id, unavailable_date)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_training_day_unavailability_athlete ON training_day_unavailability (athlete_id, unavailable_date)`);

  // Strava/FIT store run cadence as one foot; UI and analysis use total steps/min.
  await pool.query(`
    UPDATE activities
    SET avg_cadence = avg_cadence * 2
    WHERE avg_cadence IS NOT NULL
      AND avg_cadence > 0
      AND avg_cadence < 130
      AND COALESCE(source, '') <> 'garmin'
      AND (
        type ~* '(run|walk|hike|trail)'
        OR COALESCE(sport_type, '') ~* '(run|walk|hike|trail)'
      )
  `);
}
