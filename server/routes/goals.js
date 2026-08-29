import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, rejectAppAdmin } from '../middleware/auth.js';
import { familySqlClause } from '../utils/activityTypes.js';
import { assertAssignedCoach, httpError } from '../utils/coachingAccess.js';
import { asyncHandler } from '../middleware/error.js';
import { createNotification } from '../services/notificationService.js';
import { addDaysYmd, countWeeklyStreak, currentWeekRange, normalizeWeekStartsOn, weekSpanLabel, weekWindowsFrom, ymdInZone } from '../utils/week.js';

const router = express.Router();
router.use(protect, requireMembership, rejectAppAdmin);

const GOAL_TYPES = ['race', 'distance', 'weekly_mileage', 'time', 'challenge', 'other'];
const GOAL_ACTIVITY_TYPES = ['Run', 'Ride', 'Swim', 'Walk'];
const DISTANCE_TYPES = ['distance', 'weekly_mileage', 'race'];
const GOAL_COLS = `g.id, g.athlete_id, g.title, g.type, g.activity_type, g.target_value, g.target_unit, g.target_time,
       to_char(g.target_date, 'YYYY-MM-DD') AS target_date,
       g.current_value, g.status, g.notes, g.created_at, g.updated_at, g.matched_activity_id, g.coach_visible,
       a.name AS matched_name, a.distance AS matched_distance, a.moving_time AS matched_moving_time,
       COALESCE(a.start_date_local, a.start_date) AS matched_start_date, a.type AS matched_type`;
const GOAL_FROM = `goals g LEFT JOIN activities a ON a.id = g.matched_activity_id`;

async function ensureGoalColumns() {
  await query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_time INTEGER`);
  await query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'Run'`);
  await query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS matched_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS coach_visible BOOLEAN NOT NULL DEFAULT FALSE`);
}

function asBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function dateOrNull(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function parseDuration(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && value.includes(':')) {
    const [h = 0, m = 0, s = 0] = value.split(':').map(Number);
    const total = (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
    return total > 0 ? total : null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDistanceMeters(body) {
  const km = Number(body.km);
  if (km > 0) return km * 1000;
  const n = Number(body.targetValue);
  if (!(n > 0)) return null;
  const unit = String(body.targetUnit || '').toLowerCase();
  if (unit === 'km' || unit === 'kilometers') return n * 1000;
  return n;
}

function parseGoalPayload(body) {
  const title = String(body.title || '').trim();
  if (!title) return { error: 'Title is required' };
  const type = body.type || 'other';
  if (!GOAL_TYPES.includes(type)) return { error: 'Choose a valid goal type' };
  const sport = GOAL_ACTIVITY_TYPES.includes(body.activityType) ? body.activityType : null;
  if (!sport) return { error: 'Goals are for Run, Ride, Swim, or Walk' };
  const distance = parseDistanceMeters(body);
  const goalTime = parseDuration(type === 'time' ? body.targetTime || body.targetValue : body.targetTime);
  const day = dateOrNull(body.targetDate);
  if (DISTANCE_TYPES.includes(type) && !(distance > 0)) {
    return { error: type === 'weekly_mileage' ? 'Enter km per week' : 'Enter a target distance in km' };
  }
  if ((type === 'time' || type === 'race') && !(goalTime > 0)) {
    return { error: 'Enter a goal time' };
  }
  if (type === 'race' && !day) return { error: 'Race date is required' };
  return {
    fields: [
      title,
      type,
      sport,
      DISTANCE_TYPES.includes(type) || type === 'time' ? (type === 'time' ? goalTime : distance) : null,
      type === 'time' ? 'seconds' : DISTANCE_TYPES.includes(type) ? 'meters' : body.targetUnit || null,
      type === 'race' ? Math.round(goalTime) : null,
      day,
      body.notes ? String(body.notes).trim() : null,
      asBool(body.coachVisible),
    ],
  };
}

function presentGoal(goal, weekPrefs) {
  if (!goal) return goal;
  const targetValue = goal.targetValue == null ? null : Number(goal.targetValue);
  const currentValue = Number(goal.currentValue || 0);
  const completed = goal.status === 'completed';
  const matchedActivity = goal.matchedActivityId
    ? {
        id: goal.matchedActivityId,
        name: goal.matchedName || 'Activity',
        distance: goal.matchedDistance == null ? null : Number(goal.matchedDistance),
        movingTime: goal.matchedMovingTime == null ? null : Number(goal.matchedMovingTime),
        startDate: goal.matchedStartDate || null,
        type: goal.matchedType || null,
      }
    : null;
  const {
    matchedName: _n,
    matchedDistance: _d,
    matchedMovingTime: _t,
    matchedStartDate: _s,
    matchedType: _ty,
    ...rest
  } = goal;
  const presented = {
    ...rest,
    targetValue,
    currentValue,
    targetTime: goal.targetTime == null ? null : Number(goal.targetTime),
    targetDate: dateOrNull(goal.targetDate),
    coachVisible: Boolean(goal.coachVisible),
    matchedActivity,
    completionPct: completed
      ? 100
      : targetValue
        ? Math.min(100, Math.round((currentValue / targetValue) * 100))
        : 0,
  };
  if (goal.type === 'weekly_mileage') {
    const range = currentWeekRange(weekPrefs || { weekStartsOn: 1, timezone: 'UTC' });
    presented.weekStartsOn = range.weekStartsOn;
    presented.weekStartDate = range.start;
    presented.weekEndDate = range.endInclusive;
    presented.weekLabel = weekSpanLabel(range.weekStartsOn);
    presented.weekHistory = Array.isArray(goal.weekHistory) ? goal.weekHistory : [];
    presented.weekStreak = Number(goal.weekStreak || 0);
  }
  return presented;
}

async function notifyGoalCompleted(goal) {
  try {
    await createNotification({
      userId: goal.athleteId,
      type: 'goal',
      title: 'Goal completed',
      body: `You reached your goal: ${goal.title}`,
      data: { goalId: goal.id },
    });
  } catch (err) {
    console.error('goal notification', goal.id, err);
  }
}

function progressStartAt(goal) {
  const day = dateOrNull(goal.targetDate);
  if (!day) return goal.createdAt || '1970-01-01';
  const targetStart = new Date(`${day}T00:00:00.000Z`);
  const created = goal.createdAt ? new Date(goal.createdAt) : targetStart;
  const start = Number.isNaN(created.getTime()) || created > targetStart ? targetStart : created;
  return start.toISOString();
}

function reachedTarget(current, target) {
  const need = Number(target);
  if (!(need > 0)) return false;
  return Number(current) >= need * 0.98;
}

async function findMatchingActivity(goal) {
  if (!['distance', 'race', 'time'].includes(goal.type)) return null;
  const need = Number(goal.targetValue || 0);
  if (!(need > 0)) return null;
  const byTime = goal.type === 'time';
  const metric = byTime ? 'COALESCE(a.moving_time, a.elapsed_time, 0)' : 'COALESCE(a.distance, 0)';
  const typeClause = GOAL_ACTIVITY_TYPES.includes(goal.activityType) ? familySqlClause([goal.activityType]) : null;
  const start = progressStartAt(goal);
  const day = dateOrNull(goal.targetDate);

  const search = async (restrictToDay) => {
    const params = [goal.athleteId, start, need];
    let sql = `SELECT a.id FROM activities a
      WHERE a.athlete_id = $1
        AND COALESCE(a.start_date_local, a.start_date) >= $2::timestamptz
        AND ${metric} >= $3 * 0.98`;
    if (typeClause) sql += ` AND ${typeClause}`;
    if (restrictToDay) {
      if (!day) return null;
      params.push(day);
      sql += ` AND COALESCE(a.start_date_local, a.start_date)::date = $4::date`;
    }
    sql += ` ORDER BY ABS(${metric} - $3) ASC, COALESCE(a.start_date_local, a.start_date) DESC LIMIT 1`;
    return one(sql, params);
  };

  const hit = (await search(true)) || (await search(false));
  return hit?.id || null;
}

async function loadGoal(id, athleteId) {
  return camel(await one(`SELECT ${GOAL_COLS} FROM ${GOAL_FROM} WHERE g.id = $1 AND g.athlete_id = $2`, [id, athleteId]));
}

async function loadAthleteWeek(athleteId) {
  try {
    const row = camel(await one(`SELECT week_starts_on, timezone FROM users WHERE id = $1`, [athleteId]));
    return {
      weekStartsOn: normalizeWeekStartsOn(row?.weekStartsOn),
      timezone: row?.timezone || 'UTC',
    };
  } catch (err) {
    if (err.code === '42703') {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS week_starts_on SMALLINT NOT NULL DEFAULT 1`);
      const row = camel(await one(`SELECT week_starts_on, timezone FROM users WHERE id = $1`, [athleteId]));
      return {
        weekStartsOn: normalizeWeekStartsOn(row?.weekStartsOn),
        timezone: row?.timezone || 'UTC',
      };
    }
    return { weekStartsOn: 1, timezone: 'UTC' };
  }
}

async function loadWeeklyStats(goal, prefs) {
  const range = currentWeekRange(prefs);
  const createdDay = goal.createdAt ? ymdInZone(new Date(goal.createdAt), prefs.timezone) : range.start;
  const windows = weekWindowsFrom(range.start, 6).filter((w) => w.endExclusive > createdDay);
  if (!windows.length) {
    return { current: 0, history: [], streak: 0 };
  }
  const oldest = windows[0].start;
  let sql = `SELECT to_char(COALESCE(a.start_date_local, a.start_date)::date, 'YYYY-MM-DD') AS day,
                    COALESCE(SUM(a.distance), 0) AS meters
             FROM activities a
             WHERE a.athlete_id = $1
               AND COALESCE(a.start_date_local, a.start_date)::date >= $2::date
               AND COALESCE(a.start_date_local, a.start_date)::date < $3::date`;
  if (GOAL_ACTIVITY_TYPES.includes(goal.activityType)) {
    const typeClause = familySqlClause([goal.activityType]);
    if (typeClause) sql += ` AND ${typeClause}`;
  }
  sql += ` GROUP BY 1`;
  const rows = await many(sql, [goal.athleteId, oldest, range.endExclusive]);
  const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), Number(r.meters || 0)]));
  const history = windows.map((w) => {
    let meters = 0;
    for (let day = w.start; day < w.endExclusive; day = addDaysYmd(day, 1)) {
      meters += byDay.get(day) || 0;
    }
    return {
      start: w.start,
      end: w.endInclusive,
      isCurrent: w.isCurrent,
      meters,
      hit: reachedTarget(meters, goal.targetValue),
    };
  });
  const current = history.find((w) => w.isCurrent)?.meters || 0;
  return { current, history, streak: countWeeklyStreak(history) };
}

async function hydrateGoal(goal) {
  if (!goal) return goal;
  const weekPrefs = await loadAthleteWeek(goal.athleteId);
  return presentGoal(await refreshGoalProgress(goal, weekPrefs), weekPrefs);
}

async function refreshGoalProgress(goal, weekPrefs) {
  if (goal.type === 'weekly_mileage') {
    try {
      const prefs = weekPrefs || (await loadAthleteWeek(goal.athleteId));
      const stats = await loadWeeklyStats(goal, prefs);
      if (goal.status !== 'completed') {
        await query(
          `UPDATE goals SET current_value = $1, matched_activity_id = NULL, updated_at = NOW()
           WHERE id = $2 AND status <> 'completed'`,
          [stats.current, goal.id]
        );
      }
      const row = (await loadGoal(goal.id, goal.athleteId)) || goal;
      return {
        ...row,
        currentValue: goal.status === 'completed' ? Number(row.currentValue || 0) : stats.current,
        weekHistory: stats.history,
        weekStreak: stats.streak,
      };
    } catch (err) {
      if (err.code === '42703') await ensureGoalColumns();
      console.error('goal progress', goal.id, err);
      return goal;
    }
  }
  const byDistance = goal.type === 'distance' || goal.type === 'race';
  const byTime = goal.type === 'time';
  if (!byDistance && !byTime) {
    return (await loadGoal(goal.id, goal.athleteId)) || goal;
  }
  try {
    const metric = byTime ? 'COALESCE(moving_time, elapsed_time, 0)' : 'distance';
    let sql = `SELECT COALESCE(SUM(${metric}),0) AS total FROM activities a
       WHERE a.athlete_id = $1
         AND COALESCE(a.start_date_local, a.start_date) >= $2::timestamptz`;
    if (GOAL_ACTIVITY_TYPES.includes(goal.activityType)) {
      const typeClause = familySqlClause([goal.activityType]);
      if (typeClause) sql += ` AND ${typeClause}`;
    }
    const row = await one(sql, [goal.athleteId, progressStartAt(goal)]);
    const current = Number(row?.total || 0);
    const status = reachedTarget(current, goal.targetValue) ? 'completed' : goal.status;
    const matchedId = await findMatchingActivity({ ...goal, targetValue: goal.targetValue });
    await query(
      `UPDATE goals SET current_value = $1, status = $2, matched_activity_id = $3, updated_at = NOW() WHERE id = $4`,
      [current, status, matchedId, goal.id]
    );
    if (status === 'completed' && goal.status !== 'completed') {
      await notifyGoalCompleted(goal);
    }
    return (await loadGoal(goal.id, goal.athleteId)) || { ...goal, currentValue: current, status, matchedActivityId: matchedId };
  } catch (err) {
    if (err.code === '42703') {
      await ensureGoalColumns();
    }
    console.error('goal progress', goal.id, err);
    return goal;
  }
}

async function insertGoal(values) {
  const sql = `INSERT INTO goals (athlete_id, title, type, activity_type, target_value, target_unit, target_time, target_date, notes, coach_visible)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, athlete_id`;
  try {
    return await one(sql, values);
  } catch (err) {
    if (err.code === '42703') {
      await ensureGoalColumns();
      return one(sql, values);
    }
    if (err.code === '23514') {
      const error = new Error('Choose a valid goal type');
      error.status = 400;
      throw error;
    }
    throw err;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function athleteIdForRequest(req) {
  const requested = req.query.athleteId ? String(req.query.athleteId) : req.user.id;
  if (!UUID_RE.test(requested)) throw httpError(404, 'Athlete not found');
  if (requested !== req.user.id) {
    await assertAssignedCoach(req.user.id, requested);
  }
  return requested;
}

async function listGoals(athleteId, { sharedOnly = false } = {}) {
  const where = sharedOnly
    ? `WHERE g.athlete_id = $1 AND g.coach_visible = TRUE`
    : `WHERE g.athlete_id = $1`;
  const sql = `SELECT ${GOAL_COLS} FROM ${GOAL_FROM} ${where} ORDER BY g.created_at DESC`;
  try {
    return camelMany(await many(sql, [athleteId]));
  } catch (err) {
    if (err.code !== '42703') throw err;
    await ensureGoalColumns();
    return camelMany(await many(sql, [athleteId]));
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const athleteId = await athleteIdForRequest(req);
    const coachView = athleteId !== req.user.id;
    const goals = await listGoals(athleteId, { sharedOnly: coachView });
    const weekPrefs = await loadAthleteWeek(athleteId);
    const updated = await Promise.all(goals.map((g) => refreshGoalProgress(g, weekPrefs)));
    res.json({ goals: updated.map((g) => presentGoal(g, weekPrefs)) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = parseGoalPayload(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const created = camel(await insertGoal([req.user.id, ...parsed.fields]));
    const row = await loadGoal(created.id, req.user.id);
    const hydrated = await hydrateGoal(row);
    res.status(201).json({ goal: hydrated });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const current = camel(
      await one(`SELECT id, status FROM goals WHERE id = $1 AND athlete_id = $2`, [req.params.id, req.user.id])
    );
    if (!current) return res.status(404).json({ message: 'Goal not found' });
    if (current.status === 'completed') return res.status(400).json({ message: 'Completed goals cannot be edited' });
    const parsed = parseGoalPayload(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const values = [...parsed.fields, req.params.id, req.user.id];
    const sql = `UPDATE goals SET
         title = $1,
         type = $2,
         activity_type = $3,
         target_value = $4,
         target_unit = $5,
         target_time = $6,
         target_date = $7,
         notes = $8,
         coach_visible = $9,
         updated_at = NOW()
       WHERE id = $10 AND athlete_id = $11 AND status <> 'completed'
       RETURNING id`;
    let updated;
    try {
      updated = await one(sql, values);
    } catch (err) {
      if (err.code !== '42703') throw err;
      await ensureGoalColumns();
      updated = await one(sql, values);
    }
    if (!updated) return res.status(400).json({ message: 'Completed goals cannot be edited' });
    const row = await loadGoal(req.params.id, req.user.id);
    res.json({ goal: await hydrateGoal(row) });
  })
);

router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const current = await loadGoal(req.params.id, req.user.id);
    if (!current) return res.status(404).json({ message: 'Goal not found' });
    if (current.status === 'completed') return res.json({ goal: await hydrateGoal(current) });
    const matchId = await findMatchingActivity(current);
    const updated = await one(
      `UPDATE goals SET
         status = 'completed',
         matched_activity_id = COALESCE($3, matched_activity_id),
         current_value = CASE
           WHEN target_value IS NOT NULL AND COALESCE(current_value, 0) < target_value THEN target_value
           ELSE current_value
         END,
         updated_at = NOW()
       WHERE id = $1 AND athlete_id = $2 AND status <> 'completed'
       RETURNING id`,
      [req.params.id, req.user.id, matchId]
    );
    if (updated) await notifyGoalCompleted(current);
    res.json({ goal: await hydrateGoal((await loadGoal(req.params.id, req.user.id)) || current) });
  })
);

router.post(
  '/:id/share',
  asyncHandler(async (req, res) => {
    const visible = asBool(req.body.coachVisible);
    let updated;
    try {
      updated = await one(
        `UPDATE goals SET coach_visible = $1, updated_at = NOW() WHERE id = $2 AND athlete_id = $3 RETURNING id`,
        [visible, req.params.id, req.user.id]
      );
    } catch (err) {
      if (err.code !== '42703') throw err;
      await ensureGoalColumns();
      updated = await one(
        `UPDATE goals SET coach_visible = $1, updated_at = NOW() WHERE id = $2 AND athlete_id = $3 RETURNING id`,
        [visible, req.params.id, req.user.id]
      );
    }
    if (!updated) return res.status(404).json({ message: 'Goal not found' });
    res.json({ goal: await hydrateGoal(await loadGoal(req.params.id, req.user.id)) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const goal = await one(`DELETE FROM goals WHERE id = $1 AND athlete_id = $2 RETURNING id`, [
      req.params.id,
      req.user.id,
    ]);
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    res.json({ message: 'Goal deleted' });
  })
);

export default router;
