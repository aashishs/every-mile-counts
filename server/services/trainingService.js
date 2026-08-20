import { camel, camelMany, many, one } from '../config/db.js';
import { isRestType } from '../utils/workoutTypes.js';

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function ymd(value) {
  return value ? String(value).slice(0, 10) : null;
}

export function todayYmd() {
  return ymd(new Date().toISOString());
}

export async function programTree(programId) {
  const phases = camelMany(
    await many(
      `SELECT * FROM training_phases WHERE program_id = $1 ORDER BY sort_order, created_at`,
      [programId]
    )
  );
  const weeks = camelMany(
    await many(
      `SELECT * FROM training_weeks WHERE program_id = $1 ORDER BY week_number, created_at`,
      [programId]
    )
  );
  const workouts = camelMany(
    await many(
      `SELECT w.*,
              (SELECT m.activity_id FROM workout_activity_matches m
               WHERE m.planned_workout_id = w.id AND m.status IN ('auto', 'confirmed')
               LIMIT 1) AS matched_activity_id
       FROM planned_workouts w
       WHERE w.program_id = $1
       ORDER BY w.scheduled_date, w.created_at`,
      [programId]
    )
  );
  const weeksByPhase = new Map();
  for (const week of weeks) {
    if (!weeksByPhase.has(week.phaseId)) weeksByPhase.set(week.phaseId, []);
    weeksByPhase.get(week.phaseId).push(week);
  }
  const workoutsByWeek = new Map();
  for (const workout of workouts) {
    const key = workout.weekId || 'none';
    if (!workoutsByWeek.has(key)) workoutsByWeek.set(key, []);
    workoutsByWeek.get(key).push(workout);
  }
  return {
    phases: phases.map((phase) => ({
      ...phase,
      weeks: (weeksByPhase.get(phase.id) || []).map((week) => ({
        ...week,
        workouts: workoutsByWeek.get(week.id) || [],
      })),
    })),
    workouts,
  };
}

export function currentPhaseAndWeek(program, tree, date = todayYmd()) {
  const allWeeks = tree.phases.flatMap((phase) =>
    (phase.weeks || []).map((week) => ({ ...week, phase }))
  );
  const dated = allWeeks.filter((week) => week.startDate);
  let current = null;
  if (dated.length) {
    current =
      dated.find((week) => {
        const start = ymd(week.startDate);
        const next = dated
          .map((w) => ymd(w.startDate))
          .filter((d) => d > start)
          .sort()[0];
        return start <= date && (!next || date < next);
      }) || dated[dated.length - 1];
  } else if (allWeeks.length) {
    current = allWeeks[0];
  }
  const todayWorkout = (tree.workouts || []).find((w) => ymd(w.scheduledDate) === date) || null;
  return {
    currentPhase: current?.phase || tree.phases[0] || null,
    currentWeek: current || null,
    todayWorkout,
  };
}

export async function programProgress(programId) {
  const workouts = camelMany(
    await many('SELECT * FROM planned_workouts WHERE program_id = $1', [programId])
  );
  const countable = workouts.filter((w) => !isRestType(w.workoutType));
  const completed = countable.filter((w) => w.completionStatus === 'completed').length;
  const partial = countable.filter((w) => w.completionStatus === 'partial').length;
  const missed = countable.filter((w) => w.completionStatus === 'missed').length;
  const skipped = countable.filter((w) => w.completionStatus === 'skipped').length;
  const pending = countable.filter((w) => ['planned', 'pending_match'].includes(w.completionStatus)).length;
  const due = countable.filter((w) => ['completed', 'partial', 'missed', 'skipped'].includes(w.completionStatus));
  const adherenceDenom = due.filter((w) => w.completionStatus !== 'skipped').length;
  const adherenceNum = due.filter((w) => w.completionStatus === 'completed').length + partial * 0.5;

  const matches = camelMany(
    await many(
      `SELECT w.distance AS planned_distance, w.duration AS planned_duration,
              a.distance AS actual_distance, a.moving_time AS actual_duration,
              a.avg_speed, a.avg_heartrate, a.start_date, w.workout_type, w.sport
       FROM workout_activity_matches m
       JOIN planned_workouts w ON w.id = m.planned_workout_id
       JOIN activities a ON a.id = m.activity_id
       WHERE w.program_id = $1 AND m.status IN ('auto', 'confirmed')`,
      [programId]
    )
  );

  const plannedDistance = countable.reduce((sum, w) => sum + Number(w.distance || 0), 0);
  const plannedDuration = countable.reduce((sum, w) => sum + Number(w.duration || 0), 0);
  const actualDistance = matches.reduce((sum, m) => sum + Number(m.actualDistance || 0), 0);
  const actualDuration = matches.reduce((sum, m) => sum + Number(m.actualDuration || 0), 0);

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(now.getDate() - 30);
  const inRange = (row, from) => row.startDate && new Date(row.startDate) >= from;
  const weeklyVolume = matches.filter((m) => inRange(m, weekAgo)).reduce((s, m) => s + Number(m.actualDistance || 0), 0);
  const monthlyVolume = matches.filter((m) => inRange(m, monthAgo)).reduce((s, m) => s + Number(m.actualDistance || 0), 0);

  const paceSeries = matches
    .filter((m) => Number(m.avgSpeed) > 0)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .map((m) => ({ date: m.startDate, pace: 1000 / Number(m.avgSpeed) }));
  const hrSeries = matches
    .filter((m) => Number(m.avgHeartrate) > 0)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .map((m) => ({ date: m.startDate, hr: Number(m.avgHeartrate) }));
  const longRuns = matches
    .filter((m) => String(m.workoutType).toLowerCase() === 'long' || Number(m.actualDistance) >= 15000)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .map((m) => ({ date: m.startDate, distance: Number(m.actualDistance || 0) }));

  const completionPct = pct(completed + partial * 0.5, countable.length);
  const adherencePct = pct(adherenceNum, adherenceDenom);

  return {
    totalWorkouts: countable.length,
    completedWorkouts: completed,
    partialWorkouts: partial,
    missedWorkouts: missed,
    skippedWorkouts: skipped,
    pendingWorkouts: pending,
    restDays: workouts.filter((w) => isRestType(w.workoutType)).length,
    completionPct,
    adherencePct,
    plannedDistance,
    actualDistance,
    plannedDuration,
    actualDuration,
    weeklyVolume,
    monthlyVolume,
    paceProgression: paceSeries.slice(-12),
    hrTrends: hrSeries.slice(-12),
    longRunProgression: longRuns.slice(-8),
    consistencyPct: pct(
      due.filter((w) => w.completionStatus === 'completed' || w.completionStatus === 'partial').length,
      due.length
    ),
  };
}

export async function recentActivitiesForAthlete(athleteId, limit = 5) {
  return camelMany(
    await many(
      `SELECT id, name, type, sport_type, distance, moving_time, start_date, avg_heartrate, avg_speed
       FROM activities
       WHERE athlete_id = $1
       ORDER BY start_date DESC NULLS LAST
       LIMIT $2`,
      [athleteId, limit]
    )
  );
}

export async function clubReviewsForAthlete(viewerId, athleteId, clubId, { limit = 8 } = {}) {
  if (viewerId === athleteId) {
    return camelMany(
      await many(
        `SELECT r.*, u.first_name AS coach_first_name, u.last_name AS coach_last_name, c.name AS club_name
         FROM activity_reviews r
         JOIN users u ON u.id = r.coach_id
         LEFT JOIN clubs c ON c.id = r.club_id
         WHERE r.athlete_id = $1 AND r.status = 'published'
         ORDER BY r.published_at DESC NULLS LAST
         LIMIT $2`,
        [athleteId, limit]
      )
    );
  }
  if (!clubId) return [];
  return camelMany(
    await many(
      `SELECT r.*, u.first_name AS coach_first_name, u.last_name AS coach_last_name, c.name AS club_name
       FROM activity_reviews r
       JOIN users u ON u.id = r.coach_id
       LEFT JOIN clubs c ON c.id = r.club_id
       WHERE r.athlete_id = $1 AND r.status = 'published' AND r.club_id = $2
       ORDER BY r.published_at DESC NULLS LAST
       LIMIT $3`,
      [athleteId, clubId, limit]
    )
  );
}

export async function loadWorkoutDetail(workoutId) {
  const workout = camel(
    await one(
      `SELECT w.*, COALESCE(p.name, 'Assigned activity') AS program_name, COALESCE(p.status, 'active') AS program_status, p.athlete_id AS program_athlete_id,
              ph.name AS phase_name, tw.week_number,
              c.name AS club_name
       FROM planned_workouts w
       LEFT JOIN training_programs p ON p.id = w.program_id
       LEFT JOIN training_phases ph ON ph.id = w.phase_id
       LEFT JOIN training_weeks tw ON tw.id = w.week_id
       LEFT JOIN clubs c ON c.id = w.club_id
       WHERE w.id = $1`,
      [workoutId]
    )
  );
  if (!workout) return null;
  const matches = camelMany(
    await many(
      `SELECT m.*, a.name AS activity_name, a.type, a.sport_type, a.distance, a.moving_time,
              a.avg_speed, a.avg_heartrate, a.avg_power, a.start_date, a.source
       FROM workout_activity_matches m
       JOIN activities a ON a.id = m.activity_id
       WHERE m.planned_workout_id = $1
       ORDER BY m.matched_at DESC`,
      [workoutId]
    )
  );
  const accepted = matches.find((m) => m.status === 'auto' || m.status === 'confirmed') || null;
  const suggested = matches.filter((m) => m.status === 'suggested');
  return { workout, matches, accepted, suggested };
}
