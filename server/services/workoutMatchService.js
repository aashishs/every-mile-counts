import { camel, camelMany, many, one, query } from '../config/db.js';
import { createNotification } from './notificationService.js';
import {
  chooseAutoMatch,
  completionFromComparison,
  plannedVsActual,
  scoreWorkoutMatch,
} from '../utils/workoutMatchScore.js';
import { isRestType } from '../utils/workoutTypes.js';

async function loadActivity(activityId) {
  return camel(
    await one(
      `SELECT a.*, u.max_heart_rate
       FROM activities a
       JOIN users u ON u.id = a.athlete_id
       WHERE a.id = $1`,
      [activityId]
    )
  );
}

async function liveMatchForActivity(activityId) {
  return camel(
    await one(
      `SELECT * FROM workout_activity_matches
       WHERE activity_id = $1 AND status IN ('auto', 'confirmed')
       LIMIT 1`,
      [activityId]
    )
  );
}

export async function comparisonForWorkout(workout, activity) {
  if (!activity) return plannedVsActual(workout, null);
  return plannedVsActual(workout, activity, { athleteMaxHr: activity.maxHeartRate || activity.max_heart_rate });
}

async function applyAcceptedMatch({ workout, activity, score, confidence, status, confirmedBy = null }) {
  const comparison = plannedVsActual(workout, activity, { athleteMaxHr: activity.maxHeartRate });
  const completion = completionFromComparison(workout, activity);
  const match = camel(
    await one(
      `INSERT INTO workout_activity_matches (
         planned_workout_id, activity_id, confidence, score, status, comparison, confirmed_by
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (planned_workout_id, activity_id) DO UPDATE SET
         confidence = EXCLUDED.confidence,
         score = EXCLUDED.score,
         status = EXCLUDED.status,
         comparison = EXCLUDED.comparison,
         confirmed_by = EXCLUDED.confirmed_by,
         matched_at = NOW()
       RETURNING *`,
      [workout.id, activity.id, confidence, score, status, JSON.stringify(comparison), confirmedBy]
    )
  );
  await query(
    `UPDATE planned_workouts
     SET completion_status = $2, updated_at = NOW()
     WHERE id = $1`,
    [workout.id, completion]
  );
  return { match, completion, comparison };
}

export async function matchActivityToWorkout(activityId) {
  const activity = await loadActivity(activityId);
  if (!activity) return null;

  const existing = await liveMatchForActivity(activityId);
  if (existing) return { skipped: 'already-matched', match: existing };

  const actDate = String(activity.startDateLocal || activity.startDate || '').slice(0, 10);
  if (!actDate) return { skipped: 'no-date' };

  const candidates = camelMany(
    await many(
      `SELECT w.*
       FROM planned_workouts w
       JOIN training_programs p ON p.id = w.program_id
       WHERE w.athlete_id = $1
         AND p.status = 'active'
         AND w.scheduled_date BETWEEN ($2::date - INTERVAL '1 day') AND ($2::date + INTERVAL '1 day')
         AND w.completion_status IN ('planned', 'pending_match', 'partial')
         AND LOWER(w.workout_type) <> 'rest'
         AND NOT EXISTS (
           SELECT 1 FROM workout_activity_matches m
           WHERE m.planned_workout_id = w.id AND m.status IN ('auto', 'confirmed')
         )
       ORDER BY w.scheduled_date`,
      [activity.athleteId, actDate]
    )
  );

  const ranked = candidates
    .map((workout) => ({
      workout,
      ...scoreWorkoutMatch(workout, activity, { athleteMaxHr: activity.maxHeartRate }),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const decision = chooseAutoMatch(ranked);
  if (decision.action === 'none') return { skipped: 'low-confidence', ranked };

  const { workout, score, confidence } = decision.candidate;
  if (decision.action === 'auto') {
    const result = await applyAcceptedMatch({
      workout,
      activity,
      score,
      confidence: 'high',
      status: 'auto',
    });
    await createNotification({
      userId: workout.coachId,
      type: 'training',
      title: 'Workout completed',
      body: `${activity.name || 'An activity'} matched ${workout.name || workout.workoutType}.`,
      data: { workoutId: workout.id, activityId: activity.id, programId: workout.programId, url: `/coaches/workouts/${workout.id}` },
    });
    await createNotification({
      userId: workout.athleteId,
      type: 'training',
      title: 'Workout matched',
      body: `${activity.name || 'Your activity'} was matched to ${workout.name || 'today’s workout'}.`,
      data: { workoutId: workout.id, activityId: activity.id, url: `/training/workouts/${workout.id}` },
    });
    return { action: 'auto', ...result };
  }

  const comparison = plannedVsActual(workout, activity, { athleteMaxHr: activity.maxHeartRate });
  const match = camel(
    await one(
      `INSERT INTO workout_activity_matches (
         planned_workout_id, activity_id, confidence, score, status, comparison
       ) VALUES ($1,$2,'medium',$3,'suggested',$4::jsonb)
       ON CONFLICT (planned_workout_id, activity_id) DO UPDATE SET
         score = EXCLUDED.score,
         comparison = EXCLUDED.comparison,
         matched_at = NOW()
       WHERE workout_activity_matches.status = 'suggested'
       RETURNING *`,
      [workout.id, activity.id, score, JSON.stringify(comparison)]
    )
  );
  await query(
    `UPDATE planned_workouts SET completion_status = 'pending_match', updated_at = NOW()
     WHERE id = $1 AND completion_status IN ('planned', 'pending_match')`,
    [workout.id]
  );
  await createNotification({
    userId: workout.athleteId,
    type: 'training',
    title: 'Confirm workout match',
    body: `We think ${activity.name || 'an activity'} belongs to ${workout.name || 'a planned workout'}.`,
    data: { workoutId: workout.id, activityId: activity.id, matchId: match?.id, url: `/training/workouts/${workout.id}` },
  });
  return { action: 'suggest', match, comparison, score, confidence };
}

export async function confirmMatch(matchId, userId) {
  const match = camel(await one('SELECT * FROM workout_activity_matches WHERE id = $1', [matchId]));
  if (!match) return null;
  if (match.status === 'rejected') return match;
  const workout = camel(await one('SELECT * FROM planned_workouts WHERE id = $1', [match.plannedWorkoutId]));
  const activity = await loadActivity(match.activityId);
  if (!workout || !activity) return null;
  const scored = scoreWorkoutMatch(workout, activity, { athleteMaxHr: activity.maxHeartRate });
  return applyAcceptedMatch({
    workout,
    activity,
    score: scored.score,
    confidence: scored.confidence === 'low' ? 'medium' : scored.confidence,
    status: 'confirmed',
    confirmedBy: userId,
  });
}

export async function rejectMatch(matchId) {
  const match = camel(
    await one(
      `UPDATE workout_activity_matches SET status = 'rejected'
       WHERE id = $1 AND status = 'suggested'
       RETURNING *`,
      [matchId]
    )
  );
  if (!match) return null;
  const remaining = await one(
    `SELECT 1 FROM workout_activity_matches
     WHERE planned_workout_id = $1 AND status IN ('auto', 'confirmed', 'suggested')
     LIMIT 1`,
    [match.plannedWorkoutId]
  );
  if (!remaining) {
    await query(
      `UPDATE planned_workouts SET completion_status = 'planned', updated_at = NOW()
       WHERE id = $1 AND completion_status = 'pending_match'`,
      [match.plannedWorkoutId]
    );
  }
  return match;
}

export async function linkActivityManually(workout, activityId, userId) {
  const activity = await loadActivity(activityId);
  if (!activity) {
    const err = new Error('Activity not found');
    err.status = 404;
    throw err;
  }
  if (activity.athleteId !== workout.athleteId) {
    const err = new Error('Activity does not belong to this athlete');
    err.status = 403;
    throw err;
  }
  const existing = await liveMatchForActivity(activityId);
  if (existing && existing.plannedWorkoutId !== workout.id) {
    const err = new Error('That activity is already matched to another workout');
    err.status = 400;
    throw err;
  }
  const scored = scoreWorkoutMatch(workout, activity, { athleteMaxHr: activity.maxHeartRate });
  return applyAcceptedMatch({
    workout,
    activity,
    score: Math.max(scored.score, 50),
    confidence: scored.confidence === 'high' ? 'high' : 'medium',
    status: 'confirmed',
    confirmedBy: userId,
  });
}

export async function markMissedWorkouts() {
  const rows = camelMany(
    await many(
      `UPDATE planned_workouts w
       SET completion_status = 'missed', updated_at = NOW()
       FROM training_programs p
       WHERE w.program_id = p.id
         AND p.status = 'active'
         AND w.completion_status IN ('planned', 'pending_match')
         AND LOWER(w.workout_type) <> 'rest'
         AND w.scheduled_date < CURRENT_DATE
         AND w.athlete_id IS NOT NULL
       RETURNING w.id, w.athlete_id, w.coach_id, w.name, w.workout_type, w.program_id, w.scheduled_date`
    )
  );
  await query(
    `UPDATE planned_workouts w
     SET completion_status = 'completed', updated_at = NOW()
     FROM training_programs p
     WHERE w.program_id = p.id
       AND p.status = 'active'
       AND w.completion_status = 'planned'
       AND LOWER(w.workout_type) = 'rest'
       AND w.scheduled_date < CURRENT_DATE`
  );

  const byAthlete = new Map();
  for (const row of rows) {
    if (!byAthlete.has(row.athleteId)) byAthlete.set(row.athleteId, []);
    byAthlete.get(row.athleteId).push(row);
    await createNotification({
      userId: row.athleteId,
      type: 'training',
      title: 'Missed workout',
      body: `${row.name || row.workoutType} on ${String(row.scheduledDate).slice(0, 10)} was marked missed.`,
      data: { workoutId: row.id, programId: row.programId, url: `/training/workouts/${row.id}` },
    });
    await createNotification({
      userId: row.coachId,
      type: 'training',
      title: 'Athlete missed a workout',
      body: `${row.name || row.workoutType} was missed.`,
      data: { workoutId: row.id, athleteId: row.athleteId, programId: row.programId, url: `/coaches/workouts/${row.id}` },
    });
  }

  for (const [athleteId, missed] of byAthlete) {
    if (missed.length < 3) continue;
    await createNotification({
      userId: missed[0].coachId,
      type: 'training',
      title: 'Adherence falling',
      body: `An athlete has ${missed.length} newly missed workouts.`,
      data: { athleteId, url: `/coaches/athletes/${athleteId}/training` },
    });
  }
  return { missed: rows.length };
}

export { isRestType };
