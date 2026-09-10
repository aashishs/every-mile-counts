CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users & RBAC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  timezone TEXT DEFAULT 'UTC',
  date_of_birth DATE,
  age INTEGER,
  maf_heart_rate INTEGER,
  maf_offset SMALLINT NOT NULL DEFAULT 0,
  max_heart_rate INTEGER,
  resting_heart_rate INTEGER,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  notification_prefs JSONB NOT NULL DEFAULT '{
    "push": true,
    "inApp": true,
    "sync": true,
    "reviews": true,
    "events": true,
    "membership": true,
    "goals": true,
    "announcements": true
  }'::jsonb,
  last_login_at TIMESTAMPTZ,
  default_activity_type TEXT NOT NULL DEFAULT 'Run',
  sync_activity_types JSONB NOT NULL DEFAULT '["Run","Ride","Swim","Walk","Hike","Workout","WeightTraining","Yoga","HIIT"]'::jsonb,
  sync_activity_types_confirmed_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  week_starts_on SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('athlete', 'coach', 'club_admin', 'app_admin', 'super_admin', 'admin', 'support_admin')),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- ---------------------------------------------------------------------------
-- Membership plans & invitation codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'athlete'
    CHECK (audience IN ('athlete', 'club', 'coach', 'universal')),
  duration_months INTEGER,
  is_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
  max_club_members INTEGER,
  max_club_coaches INTEGER,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('athlete', 'club', 'coach', 'universal')),
  plan_id UUID REFERENCES membership_plans(id),
  max_activations INTEGER NOT NULL DEFAULT 1,
  activations_used INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invitation_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES invitation_codes(id),
  user_id UUID REFERENCES users(id),
  club_id UUID,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID,
  plan_id UUID REFERENCES membership_plans(id),
  invitation_code_id UUID REFERENCES invitation_codes(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expiring_soon', 'expired', 'suspended', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR club_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_club ON memberships (club_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships (status);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes (code);

-- ---------------------------------------------------------------------------
-- Clubs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  location TEXT,
  website TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending_coach'
    CHECK (status IN ('pending_coach', 'active', 'read_only', 'suspended')),
  created_by UUID REFERENCES users(id),
  head_coach_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invitation_redemptions
  DROP CONSTRAINT IF EXISTS invitation_redemptions_club_id_fkey;
ALTER TABLE invitation_redemptions
  ADD CONSTRAINT invitation_redemptions_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL;

ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_club_id_fkey;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE invitation_codes ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_invitation_codes_club ON invitation_codes (club_id);

CREATE TABLE IF NOT EXISTS club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'coach', 'club_admin')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'rejected', 'left')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  head_coach_choice TEXT CHECK (head_coach_choice IN ('yes', 'no')),
  UNIQUE (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS club_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_members_club ON club_members (club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members (user_id);
CREATE INDEX IF NOT EXISTS idx_clubs_slug ON clubs (slug);

-- ---------------------------------------------------------------------------
-- Coach assignments (max 3 coaches and max 3 clubs per athlete, enforced in application)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (athlete_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_assignments_athlete ON coach_assignments (athlete_id);
CREATE INDEX IF NOT EXISTS idx_coach_assignments_coach ON coach_assignments (coach_id);

CREATE TABLE IF NOT EXISTS coach_assignment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_coach_assignment_requests_club ON coach_assignment_requests (club_id, status);

-- ---------------------------------------------------------------------------
-- OAuth / device connections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('strava', 'garmin')),
  provider_user_id TEXT,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_secret_enc TEXT,
  expires_at TIMESTAMPTZ,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  granted_scope TEXT,
  pending_coach_share BOOLEAN NOT NULL DEFAULT FALSE,
  coach_share_consented_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

-- ---------------------------------------------------------------------------
-- Events (athlete or club)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('athlete', 'club')),
  owner_id UUID NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  distance NUMERIC,
  category TEXT NOT NULL DEFAULT 'run'
    CHECK (category IN ('run', 'bike', 'swim', 'triathlon', 'walk', 'other')),
  goal_time INTEGER,
  goal_pace NUMERIC,
  notes TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_owner ON events (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events (event_date);

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('strava', 'garmin', 'manual')),
  source_activity_id TEXT,
  name TEXT,
  type TEXT NOT NULL,
  sport_type TEXT,
  distance NUMERIC,
  moving_time INTEGER,
  elapsed_time INTEGER,
  elevation_gain NUMERIC,
  start_date TIMESTAMPTZ,
  start_date_local TIMESTAMPTZ,
  avg_speed NUMERIC,
  max_speed NUMERIC,
  avg_heartrate NUMERIC,
  max_heartrate NUMERIC,
  avg_cadence NUMERIC,
  avg_power NUMERIC,
  calories NUMERIC,
  description TEXT,
  polyline TEXT,
  gps_points JSONB,
  splits JSONB,
  weather JSONB,
  training_load NUMERIC,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_activity_id)
);

CREATE INDEX IF NOT EXISTS idx_activities_athlete_date ON activities (athlete_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities (athlete_id, type);
CREATE INDEX IF NOT EXISTS idx_activities_event ON activities (event_id);

CREATE TABLE IF NOT EXISTS event_activities (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, activity_id)
);

-- ---------------------------------------------------------------------------
-- Coaching reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES review_requests(id) ON DELETE SET NULL,
  initiated_by TEXT NOT NULL DEFAULT 'athlete' CHECK (initiated_by IN ('athlete', 'coach')),
  performance_summary TEXT,
  strengths TEXT,
  improvements TEXT,
  technique TEXT,
  recommendations TEXT,
  recovery_advice TEXT,
  comments TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  coach_insights JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_athlete ON activity_reviews (athlete_id);
CREATE INDEX IF NOT EXISTS idx_reviews_coach ON activity_reviews (coach_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_coach ON review_requests (coach_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_requests_pending
  ON review_requests (activity_id, coach_id)
  WHERE status = 'pending';

ALTER TABLE activity_reviews ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_club ON activity_reviews (club_id, athlete_id);

-- ---------------------------------------------------------------------------
-- Training programs (coach-led plans scoped to a club + athlete)
-- ---------------------------------------------------------------------------
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
  is_template BOOLEAN NOT NULL DEFAULT FALSE,
  source_program_id UUID REFERENCES training_programs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_programs_coach ON training_programs (coach_id, status);
CREATE INDEX IF NOT EXISTS idx_training_programs_athlete ON training_programs (athlete_id, status);
CREATE INDEX IF NOT EXISTS idx_training_programs_club ON training_programs (club_id);
CREATE INDEX IF NOT EXISTS idx_training_programs_templates ON training_programs (coach_id) WHERE is_template = TRUE;

CREATE TABLE IF NOT EXISTS training_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_phases_program ON training_phases (program_id, sort_order);

CREATE TABLE IF NOT EXISTS training_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES training_phases(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL DEFAULT 1,
  start_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_weeks_phase ON training_weeks (phase_id, week_number);

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
);

CREATE INDEX IF NOT EXISTS idx_planned_workouts_athlete_date ON planned_workouts (athlete_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_program ON planned_workouts (program_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_status ON planned_workouts (athlete_id, completion_status, scheduled_date);

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
);
CREATE INDEX IF NOT EXISTS idx_training_day_notes_athlete_date ON training_day_notes (athlete_id, note_date);

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
);
CREATE INDEX IF NOT EXISTS idx_training_day_unavailability_athlete ON training_day_unavailability (athlete_id, unavailable_date);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_matches_activity_live
  ON workout_activity_matches (activity_id)
  WHERE status IN ('auto', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_workout_matches_workout ON workout_activity_matches (planned_workout_id, status);

ALTER TABLE activity_reviews ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES training_programs(id) ON DELETE SET NULL;
ALTER TABLE activity_reviews ADD COLUMN IF NOT EXISTS planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('race', 'distance', 'weekly_mileage', 'time', 'challenge', 'other')),
  target_value NUMERIC,
  target_unit TEXT,
  target_time INTEGER,
  activity_type TEXT NOT NULL DEFAULT 'Run',
  target_date DATE,
  current_value NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned')),
  notes TEXT,
  matched_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  coach_visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_athlete ON goals (athlete_id, status);

-- ---------------------------------------------------------------------------
-- Notifications & push
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Audit, settings, support
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages (ticket_id, created_at);

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
);

CREATE INDEX IF NOT EXISTS idx_coach_role_requests_status ON coach_role_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS oauth_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  request_token TEXT,
  request_token_secret_enc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS default_activity_type TEXT NOT NULL DEFAULT 'Run';
ALTER TABLE users ADD COLUMN IF NOT EXISTS sync_activity_types JSONB NOT NULL DEFAULT '["Run","Ride","Swim","Walk","Hike","Workout","WeightTraining","Yoga","HIIT"]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sync_activity_types_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS week_starts_on SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TIME;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS login_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_otps_user ON login_otps (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Club group sessions (RSVP)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  session_date DATE NOT NULL,
  session_time TIME NOT NULL,
  sport TEXT NOT NULL DEFAULT 'run'
    CHECK (sport IN ('run', 'ride', 'swim', 'walk', 'other')),
  meetup_point TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_sessions_club_date ON group_sessions (club_id, session_date, session_time);

CREATE TABLE IF NOT EXISTS group_session_rsvps (
  session_id UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_session_rsvps_user ON group_session_rsvps (user_id);
