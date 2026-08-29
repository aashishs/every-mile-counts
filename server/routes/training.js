import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole, rejectAppAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { ACTIVITY_TYPES } from '../utils/activityTypes.js';
import {
  assertAssignedCoach,
  assertAssignmentInClub,
  assertCanModifyProgram,
  assertCanViewProgram,
  assertCanViewWorkout,
  assertCoachInClub,
  canModifyProgram,
  canModifyWorkout,
  getAssignment,
  httpError,
  loadProgram,
  reviewVisibilitySql,
  workoutProgramView,
} from '../utils/coachingAccess.js';
import { PROGRAM_STATUSES, WORKOUT_TYPES, normalizeWorkoutType } from '../utils/workoutTypes.js';
import { createNotification, notifyMany } from '../services/notificationService.js';
import {
  clubReviewsForAthlete,
  currentPhaseAndWeek,
  loadWorkoutDetail,
  programProgress,
  programTree,
  recentActivitiesForAthlete,
  todayYmd,
} from '../services/trainingService.js';
import {
  comparisonForWorkout,
  confirmMatch,
  linkActivityManually,
  rejectMatch,
} from '../services/workoutMatchService.js';
import { canViewerSeeActivity } from '../utils/stravaShare.js';
import {
  assertGroupOwned,
  cloneProgramForAthlete,
  createGroup,
  deleteGroup,
  hydrateGroup,
  listCoachGroups,
  resolveTargets,
  updateGroup,
} from '../services/coachGroupService.js';

const router = express.Router();
router.use(protect, requireMembership, rejectAppAdmin);

function asDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function loadDayNotes(athleteId, from, to) {
  return camelMany(
    await many(
      `SELECT n.id, n.athlete_id, n.coach_id, n.club_id, n.note_date, n.body, n.updated_at,
              u.first_name AS coach_first_name, u.last_name AS coach_last_name
       FROM training_day_notes n
       JOIN users u ON u.id = n.coach_id
       WHERE n.athlete_id = $1 AND n.note_date BETWEEN $2 AND $3
       ORDER BY n.updated_at DESC`,
      [athleteId, from, to]
    )
  );
}

async function loadUnavailable(athleteId, from, to) {
  return camelMany(
    await many(
      `SELECT id, athlete_id, unavailable_date, reason, note, updated_at
       FROM training_day_unavailability
       WHERE athlete_id = $1 AND unavailable_date BETWEEN $2 AND $3
       ORDER BY unavailable_date`,
      [athleteId, from, to]
    )
  );
}

const UNAVAILABLE_REASONS = ['injury', 'travel', 'rest', 'other'];

async function skipWorkoutsForUnavailable(athleteId, date) {
  await query(
    `UPDATE planned_workouts
     SET completion_status = 'skipped', updated_at = NOW()
     WHERE athlete_id = $1 AND scheduled_date = $2
       AND completion_status IN ('planned', 'pending_match', 'missed')
       AND LOWER(workout_type) <> 'rest'`,
    [athleteId, date]
  );
}

async function restoreWorkoutsAfterUnavailable(athleteId, date) {
  await query(
    `UPDATE planned_workouts w
     SET completion_status = 'planned', updated_at = NOW()
     WHERE w.athlete_id = $1 AND w.scheduled_date = $2
       AND w.completion_status = 'skipped'
       AND LOWER(w.workout_type) <> 'rest'
       AND NOT EXISTS (
         SELECT 1 FROM workout_activity_matches m
         WHERE m.planned_workout_id = w.id AND m.status IN ('auto', 'confirmed')
       )`,
    [athleteId, date]
  );
}

function mondayOf(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function asNumber(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asInt(value) {
  const n = asNumber(value);
  return n == null ? null : Math.round(n);
}

function requireSport(value) {
  const sport = String(value || 'Run');
  if (!ACTIVITY_TYPES.includes(sport)) throw httpError(400, 'Unknown sport / activity type');
  return sport;
}

function kmToMeters(value) {
  const n = asNumber(value);
  if (n == null) return null;
  return n > 200 ? n : n * 1000;
}

function workoutPayload(body, fallback = {}) {
  const sport = body.sport ? requireSport(body.sport) : fallback.sport || 'Run';
  const take = (key, transform) => {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return fallback[key];
    if (body[key] === '' || body[key] === null) return null;
    return transform ? transform(body[key]) : body[key];
  };
  return {
    name: take('name', (v) => String(v).trim())
      || (body.workoutType != null ? normalizeWorkoutType(body.workoutType) : fallback.workoutType)
      || 'Easy',
    sport,
    workoutType: body.workoutType != null ? normalizeWorkoutType(body.workoutType) : fallback.workoutType || 'Easy',
    scheduledDate: asDate(body.scheduledDate) || fallback.scheduledDate,
    distance: take('distance', kmToMeters),
    duration: take('duration', asInt),
    targetPace: take('targetPace', asNumber),
    targetHrZone: take('targetHrZone', asInt),
    targetHr: take('targetHr', asNumber),
    targetPower: take('targetPower', asNumber),
    rpe: take('rpe', asInt),
    warmup: take('warmup'),
    mainSet: take('mainSet'),
    cooldown: take('cooldown'),
    instructions: take('instructions'),
    coachNotes: take('coachNotes'),
  };
}

async function syncWorkoutOwners(program) {
  await query(
    `UPDATE planned_workouts
     SET athlete_id = $2, coach_id = $3, club_id = $4, updated_at = NOW()
     WHERE program_id = $1`,
    [program.id, program.athleteId, program.coachId, program.clubId]
  );
}

async function hydrateProgram(program, viewerId) {
  const tree = await programTree(program.id);
  const progress = await programProgress(program.id, viewerId);
  const cursor = currentPhaseAndWeek(program, tree);
  const athlete = program.athleteId
    ? camel(await one('SELECT id, first_name, last_name, email, avatar_url FROM users WHERE id = $1', [program.athleteId]))
    : null;
  const club = camel(await one('SELECT id, name FROM clubs WHERE id = $1', [program.clubId]));
  const coach = camel(await one('SELECT id, first_name, last_name FROM users WHERE id = $1', [program.coachId]));
  return { ...program, ...cursor, ...tree, progress, athlete, club, coach };
}

async function loadWorkoutForUser(req, workoutId) {
  const detail = await loadWorkoutDetail(workoutId, req.user.id);
  if (!detail) throw httpError(404, 'Workout not found');
  const program = detail.workout.programId ? await loadProgram(detail.workout.programId) : null;
  await assertCanViewWorkout(req.user, detail.workout, program);
  return { ...detail, program };
}

function liveWorkoutSql(alias = 'p') {
  return `(w.program_id IS NULL OR ${alias}.status = 'active')`;
}

router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      sports: ACTIVITY_TYPES,
      workoutTypes: WORKOUT_TYPES,
      programStatuses: PROGRAM_STATUSES,
    });
  })
);

router.get(
  '/groups',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    res.json({ groups: await listCoachGroups(req.user.id) });
  })
);

router.post(
  '/groups',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const group = await createGroup(req.user, req.body || {});
    res.status(201).json({ group });
  })
);

router.get(
  '/groups/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const group = await assertGroupOwned(req.user, req.params.id);
    res.json({ group: await hydrateGroup(group) });
  })
);

router.patch(
  '/groups/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    res.json({ group: await updateGroup(req.user, req.params.id, req.body || {}) });
  })
);

router.delete(
  '/groups/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    await deleteGroup(req.user, req.params.id);
    res.json({ message: 'Group deleted' });
  })
);

router.post(
  '/groups/:id/notify',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const group = await assertGroupOwned(req.user, req.params.id);
    const hydrated = await hydrateGroup(group);
    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '').trim();
    if (!title) throw httpError(400, 'Message title is required');
    if (!hydrated.athletes.length) throw httpError(400, 'Add athletes to this group first');
    await notifyMany(
      hydrated.athletes.map((a) => a.athleteId),
      {
        type: 'training',
        title,
        body: body || `${req.user.firstName} sent a note to ${group.name}.`,
        data: { groupId: group.id, url: '/training' },
      }
    );
    res.json({ sent: hydrated.athletes.length });
  })
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const programs = camelMany(
      await many(
        `SELECT p.*, c.name AS club_name, u.first_name AS coach_first_name, u.last_name AS coach_last_name
         FROM training_programs p
         JOIN clubs c ON c.id = p.club_id
         JOIN users u ON u.id = p.coach_id
         WHERE p.athlete_id = $1 AND p.status IN ('active', 'paused', 'halted', 'completed')
         ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'halted' THEN 2 ELSE 3 END, p.start_date DESC NULLS LAST`,
        [req.user.id]
      )
    );
    const active = programs.find((p) => p.status === 'active') || programs[0] || null;
    let detail = null;
    if (active) {
      detail = await hydrateProgram(active, req.user.id);
      detail.reviews = await clubReviewsForAthlete(req.user.id, req.user.id, active.clubId);
    }
    const upcoming = camelMany(
      await many(
        `SELECT w.*, COALESCE(p.name, 'Assigned activity') AS program_name
         FROM planned_workouts w
         LEFT JOIN training_programs p ON p.id = w.program_id
         WHERE w.athlete_id = $1 AND ${liveWorkoutSql()}
           AND w.scheduled_date >= CURRENT_DATE
           AND w.completion_status IN ('planned', 'pending_match')
         ORDER BY w.scheduled_date
         LIMIT 20`,
        [req.user.id]
      )
    );
    const today = upcoming.filter((w) => asDate(w.scheduledDate) === todayYmd());
    if (!today.length && detail) {
      today.push(...(detail.workouts || []).filter((w) => asDate(w.scheduledDate) === todayYmd()));
    }
    res.json({ programs, current: detail, upcoming, today });
  })
);

router.get(
  '/coach-dashboard',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const athletes = camelMany(
      await many(
        `SELECT ca.athlete_id, ca.club_id, u.first_name, u.last_name, u.email, u.avatar_url, c.name AS club_name
         FROM coach_assignments ca
         JOIN users u ON u.id = ca.athlete_id
         LEFT JOIN clubs c ON c.id = ca.club_id
         WHERE ca.coach_id = $1 AND ca.status = 'active'
         ORDER BY u.last_name, u.first_name`,
        [req.user.id]
      )
    );

    const programs = camelMany(
      await many(
        `SELECT p.*, c.name AS club_name, u.first_name AS athlete_first_name, u.last_name AS athlete_last_name,
                (
                  SELECT COUNT(*)::int FROM planned_workouts w
                  WHERE w.program_id = p.id AND LOWER(w.workout_type) <> 'rest'
                ) AS workout_count,
                (
                  SELECT COUNT(*)::int FROM planned_workouts w
                  WHERE w.program_id = p.id AND w.completion_status IN ('completed', 'partial')
                ) AS completed_count,
                (
                  SELECT COUNT(*)::int FROM planned_workouts w
                  WHERE w.program_id = p.id
                    AND LOWER(w.workout_type) <> 'rest'
                    AND w.completion_status IN ('planned', 'pending_match')
                    AND w.scheduled_date >= CURRENT_DATE
                ) AS to_prepare_count
         FROM training_programs p
         JOIN clubs c ON c.id = p.club_id
         LEFT JOIN users u ON u.id = p.athlete_id
         WHERE p.coach_id = $1
         ORDER BY CASE p.status
           WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'halted' THEN 2 WHEN 'draft' THEN 3
           WHEN 'completed' THEN 4 ELSE 5 END, p.updated_at DESC`,
        [req.user.id]
      )
    );

    const toPrepare = camelMany(
      await many(
        `SELECT w.id, w.program_id, w.scheduled_date, w.name, w.sport, w.workout_type, w.distance, w.duration,
                w.completion_status, w.athlete_id, COALESCE(p.name, 'Assigned activity') AS program_name, COALESCE(p.status, 'active') AS program_status,
                u.first_name, u.last_name
         FROM planned_workouts w
         LEFT JOIN training_programs p ON p.id = w.program_id
         LEFT JOIN users u ON u.id = w.athlete_id
         WHERE w.coach_id = $1
           AND ${liveWorkoutSql()}
           AND w.scheduled_date >= CURRENT_DATE
           AND w.completion_status IN ('planned', 'pending_match')
           AND LOWER(w.workout_type) <> 'rest'
         ORDER BY w.scheduled_date, u.last_name
         LIMIT 60`,
        [req.user.id]
      )
    );

    const today = camelMany(
      await many(
        `SELECT w.*, u.first_name, u.last_name, COALESCE(p.name, 'Assigned activity') AS program_name
         FROM planned_workouts w
         LEFT JOIN training_programs p ON p.id = w.program_id
         LEFT JOIN users u ON u.id = w.athlete_id
         WHERE w.coach_id = $1 AND ${liveWorkoutSql()} AND w.scheduled_date = CURRENT_DATE
         ORDER BY u.last_name NULLS LAST`,
        [req.user.id]
      )
    );
    const missed = camelMany(
      await many(
        `SELECT w.*, u.first_name, u.last_name, COALESCE(p.name, 'Assigned activity') AS program_name
         FROM planned_workouts w
         LEFT JOIN training_programs p ON p.id = w.program_id
         LEFT JOIN users u ON u.id = w.athlete_id
         WHERE w.coach_id = $1 AND ${liveWorkoutSql()} AND w.completion_status = 'missed'
         ORDER BY w.scheduled_date DESC
         LIMIT 20`,
        [req.user.id]
      )
    );

    const counts = PROGRAM_STATUSES.reduce((acc, status) => {
      acc[status] = programs.filter((p) => p.status === status).length;
      return acc;
    }, {});
    const toPrepareByProgram = new Map();
    for (const workout of toPrepare) {
      if (!toPrepareByProgram.has(workout.programId)) toPrepareByProgram.set(workout.programId, []);
      const list = toPrepareByProgram.get(workout.programId);
      if (list.length < 4) list.push(workout);
    }
    const programsWithPrep = programs.map((p) => ({
      ...p,
      toPrepare: toPrepareByProgram.get(p.id) || [],
      completionPct: p.workoutCount ? Math.round((p.completedCount / p.workoutCount) * 100) : 0,
    }));

    const groups = await listCoachGroups(req.user.id);
    const summaries = athletes.map((row) => {
      const athletePrograms = programsWithPrep.filter((p) => p.athleteId === row.athleteId);
      const singles = toPrepare.filter((w) => w.athleteId === row.athleteId && !w.programId);
      return {
        ...row,
        programs: athletePrograms,
        activePlanCount: athletePrograms.filter((p) => p.status === 'active').length,
        toPrepareCount: athletePrograms.reduce((sum, p) => sum + (p.toPrepareCount || 0), 0) + singles.length,
        todayWorkouts: today.filter((w) => w.athleteId === row.athleteId),
      };
    });

    res.json({
      athletes: summaries,
      athleteCount: athletes.length,
      counts,
      programs: programsWithPrep,
      groups,
      toPrepare,
      today,
      upcoming: toPrepare.filter((w) => asDate(w.scheduledDate) !== todayYmd()),
      missed,
    });
  })
);

router.get(
  '/athletes/:athleteId',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const assignment = await assertAssignedCoach(req.user.id, req.params.athleteId);
    const programs = camelMany(
      await many(
        `SELECT p.*, c.name AS club_name, (p.coach_id = $1) AS owned
         FROM training_programs p
         JOIN clubs c ON c.id = p.club_id
         WHERE p.athlete_id = $2
           AND (p.coach_id = $1 OR (p.club_id IS NOT DISTINCT FROM $3))
         ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'halted' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END, p.updated_at DESC`,
        [req.user.id, req.params.athleteId, assignment.clubId]
      )
    );
    const ownActive = programs.find((p) => p.owned && p.status === 'active');
    const clubActive = programs.find((p) => p.status === 'active');
    const detail = ownActive
      ? await hydrateProgram(ownActive, req.user.id)
      : clubActive
        ? await hydrateProgram(clubActive, req.user.id)
        : (programs[0] ? await hydrateProgram(programs[0], req.user.id) : null);
    const toPrepare = camelMany(
      await many(
        `SELECT w.id, w.program_id, w.scheduled_date, w.name, w.sport, w.workout_type, w.distance, w.duration,
                w.completion_status, COALESCE(p.name, 'Assigned activity') AS program_name
         FROM planned_workouts w
         LEFT JOIN training_programs p ON p.id = w.program_id
         WHERE w.athlete_id = $2 AND ${liveWorkoutSql()}
           AND (p.coach_id = $1 OR w.coach_id = $1 OR (w.club_id IS NOT DISTINCT FROM $3) OR (p.club_id IS NOT DISTINCT FROM $3))
           AND w.scheduled_date >= CURRENT_DATE
           AND w.completion_status IN ('planned', 'pending_match')
           AND LOWER(w.workout_type) <> 'rest'
         ORDER BY w.scheduled_date
         LIMIT 20`,
        [req.user.id, req.params.athleteId, assignment.clubId]
      )
    );
    const reviews = await clubReviewsForAthlete(req.user.id, req.params.athleteId, assignment.clubId);
    const athlete = camel(await one('SELECT id, first_name, last_name, email, avatar_url, week_starts_on FROM users WHERE id = $1', [req.params.athleteId]));
    res.json({
      athlete,
      assignment,
      programs,
      current: detail,
      toPrepare,
      reviews,
      recentActivities: await recentActivitiesForAthlete(req.params.athleteId, 8),
    });
  })
);

router.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const from = asDate(req.query.from) || todayYmd();
    const to = asDate(req.query.to) || from;
    const athleteId = req.query.athleteId || req.user.id;
    if (athleteId !== req.user.id) {
      const roles = req.user.roles || [];
      if (!roles.includes('coach')) {
        const head = await one('SELECT 1 FROM clubs WHERE head_coach_user_id = $1 LIMIT 1', [req.user.id]);
        if (!head) throw httpError(403, 'Access denied');
      }
      const assignment = await assertAssignedCoach(req.user.id, athleteId);
      if (req.query.clubId && req.query.clubId !== assignment.clubId) {
        throw httpError(403, 'Access denied');
      }
    }
    const params = [athleteId, from, to];
    let clubSql = '';
    if (athleteId !== req.user.id) {
      const assignment = await getAssignment(req.user.id, athleteId);
      if (assignment?.clubId) {
        clubSql = 'AND w.club_id = $4';
        params.push(assignment.clubId);
      } else {
        clubSql = 'AND w.coach_id = $4';
        params.push(req.user.id);
      }
    }
    const workouts = camelMany(
      await many(
        `SELECT w.id, w.scheduled_date, w.name, w.sport, w.workout_type, w.completion_status,
                w.distance, w.duration, w.target_pace,
                COALESCE(p.name, 'Assigned activity') AS program_name,
                a.id AS activity_id, a.name AS activity_name,
                a.distance AS actual_distance, a.moving_time AS actual_duration
         FROM planned_workouts w
         LEFT JOIN training_programs p ON p.id = w.program_id
         LEFT JOIN LATERAL (
           SELECT m.activity_id
           FROM workout_activity_matches m
           WHERE m.planned_workout_id = w.id AND m.status IN ('auto', 'confirmed')
           ORDER BY m.matched_at DESC
           LIMIT 1
         ) match ON TRUE
         LEFT JOIN activities a ON a.id = match.activity_id
         WHERE w.athlete_id = $1
           AND w.scheduled_date BETWEEN $2 AND $3
           AND (w.program_id IS NULL OR p.status IN ('active', 'paused', 'completed'))
           ${clubSql}
         ORDER BY w.scheduled_date`,
        params
      )
    );
    const dayNotes = await loadDayNotes(athleteId, from, to);
    const unavailable = await loadUnavailable(athleteId, from, to);
    res.json({ workouts, dayNotes, unavailable });
  })
);

router.put(
  '/availability',
  asyncHandler(async (req, res) => {
    const noteDate = asDate(req.body.date);
    if (!noteDate) throw httpError(400, 'Pick a day');
    const athleteId = req.user.id;
    const clear = req.body.unavailable === false || req.body.unavailable === 'false';
    if (clear) {
      await query(
        `DELETE FROM training_day_unavailability WHERE athlete_id = $1 AND unavailable_date = $2`,
        [athleteId, noteDate]
      );
      await restoreWorkoutsAfterUnavailable(athleteId, noteDate);
      return res.json({ unavailable: null });
    }
    const reason = UNAVAILABLE_REASONS.includes(req.body.reason) ? req.body.reason : 'rest';
    const note = String(req.body.note || '').trim().slice(0, 280) || null;
    const existing = camel(
      await one(
        `SELECT id FROM training_day_unavailability WHERE athlete_id = $1 AND unavailable_date = $2`,
        [athleteId, noteDate]
      )
    );
    const row = camel(
      await one(
        `INSERT INTO training_day_unavailability (athlete_id, unavailable_date, reason, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (athlete_id, unavailable_date) DO UPDATE SET
           reason = EXCLUDED.reason,
           note = EXCLUDED.note,
           updated_at = NOW()
         RETURNING *`,
        [athleteId, noteDate, reason, note]
      )
    );
    await skipWorkoutsForUnavailable(athleteId, noteDate);
    if (!existing) {
      const coaches = camelMany(
        await many(
          `SELECT coach_id FROM coach_assignments WHERE athlete_id = $1 AND status = 'active'`,
          [athleteId]
        )
      );
      const reasonLabel = reason === 'injury' ? 'injury' : reason === 'travel' ? 'travel' : reason === 'other' ? 'other' : 'rest';
      const body = `${req.user.firstName} can’t train on ${noteDate} (${reasonLabel}${note ? ` · ${note}` : ''}).`;
      for (const coach of coaches) {
        await createNotification({
          userId: coach.coachId,
          type: 'training',
          title: 'Athlete can’t train',
          body,
          data: { athleteId, date: noteDate, url: `/coaches/athletes/${athleteId}/training` },
        });
      }
    }
    res.json({ unavailable: row });
  })
);

router.put(
  '/day-notes',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const athleteId = req.body.athleteId;
    const noteDate = asDate(req.body.date);
    const body = String(req.body.body || '').trim().slice(0, 280);
    if (!athleteId || !noteDate) throw httpError(400, 'Pick a day');
    const assignment = await assertAssignedCoach(req.user.id, athleteId);
    if (!body) {
      await query(
        `DELETE FROM training_day_notes WHERE athlete_id = $1 AND coach_id = $2 AND note_date = $3`,
        [athleteId, req.user.id, noteDate]
      );
      return res.json({ note: null });
    }
    const row = camel(
      await one(
        `INSERT INTO training_day_notes (athlete_id, coach_id, club_id, note_date, body)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (athlete_id, coach_id, note_date) DO UPDATE SET
           body = EXCLUDED.body,
           club_id = COALESCE(EXCLUDED.club_id, training_day_notes.club_id),
           updated_at = NOW()
         RETURNING *`,
        [athleteId, req.user.id, assignment.clubId || null, noteDate, body]
      )
    );
    res.json({
      note: {
        ...row,
        coachFirstName: req.user.firstName,
        coachLastName: req.user.lastName,
      },
    });
  })
);

router.get(
  '/programs',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const programs = camelMany(
      await many(
        `SELECT p.*, c.name AS club_name, u.first_name AS athlete_first_name, u.last_name AS athlete_last_name
         FROM training_programs p
         JOIN clubs c ON c.id = p.club_id
         LEFT JOIN users u ON u.id = p.athlete_id
         WHERE p.coach_id = $1
         ORDER BY p.updated_at DESC`,
        [req.user.id]
      )
    );
    res.json({ programs });
  })
);

router.post(
  '/programs',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const { name, description, clubId, sport, startDate, endDate, targetEventId, targetEventName } = req.body;
    if (!String(name || '').trim()) throw httpError(400, 'Program name is required');
    if (!clubId) throw httpError(400, 'Choose a club for this program');
    await assertCoachInClub(req.user.id, clubId);
    const program = camel(
      await one(
        `INSERT INTO training_programs (
           coach_id, club_id, name, description, sport, start_date, end_date, target_event_id, target_event_name, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
         RETURNING *`,
        [
          req.user.id,
          clubId,
          String(name).trim(),
          description || null,
          requireSport(sport),
          asDate(startDate),
          asDate(endDate),
          targetEventId || null,
          targetEventName || null,
        ]
      )
    );
    res.status(201).json({ program: await hydrateProgram(program, req.user.id) });
  })
);

router.get(
  '/programs/:id',
  asyncHandler(async (req, res) => {
    const program = await loadProgram(req.params.id);
    await assertCanViewProgram(req.user, program);
    res.json({
      program: await hydrateProgram(program, req.user.id),
      canEdit: canModifyProgram(req.user, program),
    });
  })
);

router.patch(
  '/programs/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const program = await loadProgramOwnedOrThrow(req);
    if (req.body.clubId && req.body.clubId !== program.clubId) {
      throw httpError(400, 'Club context cannot be changed after a program is created');
    }
    if (req.body.athleteId && req.body.athleteId !== program.athleteId) {
      throw httpError(400, 'Assign the athlete with the assign endpoint');
    }
    const next = {
      name: req.body.name != null ? String(req.body.name).trim() : program.name,
      description: req.body.description != null ? req.body.description : program.description,
      sport: req.body.sport ? requireSport(req.body.sport) : program.sport,
      startDate: req.body.startDate !== undefined ? asDate(req.body.startDate) : program.startDate,
      endDate: req.body.endDate !== undefined ? asDate(req.body.endDate) : program.endDate,
      targetEventId: req.body.targetEventId !== undefined ? req.body.targetEventId || null : program.targetEventId,
      targetEventName: req.body.targetEventName !== undefined ? req.body.targetEventName : program.targetEventName,
    };
    const updated = camel(
      await one(
        `UPDATE training_programs
         SET name = $2, description = $3, sport = $4, start_date = $5, end_date = $6,
             target_event_id = $7, target_event_name = $8, updated_at = NOW()
         WHERE id = $1 AND coach_id = $9
         RETURNING *`,
        [program.id, next.name, next.description, next.sport, next.startDate, next.endDate, next.targetEventId, next.targetEventName, req.user.id]
      )
    );
    res.json({ program: await hydrateProgram(updated, req.user.id) });
  })
);

router.delete(
  '/programs/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const program = await loadProgramOwnedOrThrow(req);
    if (program.status === 'active') throw httpError(400, 'Archive or complete an active program before deleting it');
    await query('DELETE FROM training_programs WHERE id = $1 AND coach_id = $2', [program.id, req.user.id]);
    res.json({ message: 'Program deleted' });
  })
);

router.post(
  '/programs/:id/assign',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const program = await loadProgramOwnedOrThrow(req);
    const groupId = req.body.groupId || null;
    const athleteIds = Array.isArray(req.body.athleteIds) ? req.body.athleteIds : [];
    if (groupId || athleteIds.length > 1) {
      const targets = await resolveTargets(req.user, {
        groupId,
        athleteIds,
        clubId: program.clubId,
      });
      const copies = [];
      for (const athlete of targets.athletes) {
        if (program.athleteId === athlete.athleteId) {
          copies.push(program);
          continue;
        }
        const copy = await cloneProgramForAthlete(program, athlete.athleteId, targets.group?.id || null);
        await createNotification({
          userId: athlete.athleteId,
          type: 'training',
          title: 'New training plan',
          body: `${req.user.firstName} assigned ${copy.name} to ${targets.group ? `${targets.group.name}` : 'you'}.`,
          data: { programId: copy.id, url: `/training/programs/${copy.id}` },
        });
        copies.push(copy);
      }
      return res.json({
        assigned: copies.length,
        groupId: targets.group?.id || null,
        programs: copies,
        program: copies[0] ? await hydrateProgram(copies[0], req.user.id) : await hydrateProgram(program, req.user.id),
      });
    }

    const athleteId = req.body.athleteId || athleteIds[0];
    if (!athleteId) throw httpError(400, 'Choose an athlete or a group');
    const assignment = await assertAssignedCoach(req.user.id, athleteId);
    await assertAssignmentInClub(assignment, program.clubId);
    const startDate = asDate(req.body.startDate) || program.startDate;
    const endDate = asDate(req.body.endDate) || program.endDate;
    let updated;
    try {
      updated = camel(
        await one(
          `UPDATE training_programs
           SET athlete_id = $2, start_date = COALESCE($3, start_date), end_date = COALESCE($4, end_date),
               status = CASE WHEN status = 'draft' THEN 'active' ELSE status END,
               updated_at = NOW()
           WHERE id = $1 AND coach_id = $5
           RETURNING *`,
          [program.id, athleteId, startDate, endDate, req.user.id]
        )
      );
    } catch (err) {
      if (err.code === '23505') throw httpError(400, 'This athlete already has an active program in this club');
      throw err;
    }
    await syncWorkoutOwners(updated);
    await createNotification({
      userId: athleteId,
      type: 'training',
      title: 'New training plan',
      body: `${req.user.firstName} assigned ${updated.name} to you.`,
      data: { programId: updated.id, url: `/training/programs/${updated.id}` },
    });
    res.json({ program: await hydrateProgram(updated, req.user.id) });
  })
);

router.post(
  '/programs/:id/status',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const program = await loadProgramOwnedOrThrow(req);
    const next = String(req.body.status || '');
    const allowed = {
      draft: ['active', 'archived'],
      active: ['paused', 'halted', 'completed', 'archived'],
      paused: ['active', 'halted', 'completed', 'archived'],
      halted: ['active', 'archived'],
      completed: ['archived'],
      archived: [],
    };
    if (next === 'active' && !program.athleteId) throw httpError(400, 'Assign an athlete before activating');
    if (!(allowed[program.status] || []).includes(next)) {
      throw httpError(400, `Cannot change ${program.status} to ${next}`);
    }
    const updated = camel(
      await one(
        `UPDATE training_programs SET status = $2, updated_at = NOW()
         WHERE id = $1 AND coach_id = $3 RETURNING *`,
        [program.id, next, req.user.id]
      )
    );
    if (program.athleteId && ['paused', 'halted', 'active', 'completed'].includes(next)) {
      const titles = {
        paused: 'Training paused',
        halted: 'Training halted',
        active: 'Training resumed',
        completed: 'Training completed',
      };
      await createNotification({
        userId: program.athleteId,
        type: 'training',
        title: titles[next],
        body: `${program.name} is now ${next}.`,
        data: { programId: program.id, url: `/training/programs/${program.id}` },
      });
    }
    res.json({ program: await hydrateProgram(updated, req.user.id) });
  })
);

router.post(
  '/programs/:id/phases',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const program = await loadProgramOwnedOrThrow(req);
    const count = await one('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM training_phases WHERE program_id = $1', [program.id]);
    const phase = camel(
      await one(
        `INSERT INTO training_phases (program_id, name, objective, sort_order, start_date, end_date)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [program.id, String(req.body.name || `Phase ${count.next + 1}`).trim(), req.body.objective || null, count.next, asDate(req.body.startDate), asDate(req.body.endDate)]
      )
    );
    res.status(201).json({ phase });
  })
);

router.patch(
  '/phases/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const phase = camel(await one('SELECT * FROM training_phases WHERE id = $1', [req.params.id]));
    if (!phase) throw httpError(404, 'Phase not found');
    await loadProgramOwnedOrThrow(req, phase.programId);
    const updated = camel(
      await one(
        `UPDATE training_phases
         SET name = COALESCE($2, name), objective = COALESCE($3, objective),
             start_date = COALESCE($4, start_date), end_date = COALESCE($5, end_date),
             sort_order = COALESCE($6, sort_order)
         WHERE id = $1 RETURNING *`,
        [phase.id, req.body.name, req.body.objective, asDate(req.body.startDate), asDate(req.body.endDate), asInt(req.body.sortOrder)]
      )
    );
    res.json({ phase: updated });
  })
);

router.delete(
  '/phases/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const phase = camel(await one('SELECT * FROM training_phases WHERE id = $1', [req.params.id]));
    if (!phase) throw httpError(404, 'Phase not found');
    await loadProgramOwnedOrThrow(req, phase.programId);
    await query('DELETE FROM training_phases WHERE id = $1', [phase.id]);
    res.json({ message: 'Phase deleted' });
  })
);

router.post(
  '/phases/:id/weeks',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const phase = camel(await one('SELECT * FROM training_phases WHERE id = $1', [req.params.id]));
    if (!phase) throw httpError(404, 'Phase not found');
    await loadProgramOwnedOrThrow(req, phase.programId);
    const count = await one('SELECT COALESCE(MAX(week_number), 0) + 1 AS next FROM training_weeks WHERE phase_id = $1', [phase.id]);
    const week = camel(
      await one(
        `INSERT INTO training_weeks (program_id, phase_id, week_number, start_date, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [phase.programId, phase.id, asInt(req.body.weekNumber) || count.next, asDate(req.body.startDate), req.body.notes || null]
      )
    );
    res.status(201).json({ week });
  })
);

router.patch(
  '/weeks/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const week = camel(await one('SELECT * FROM training_weeks WHERE id = $1', [req.params.id]));
    if (!week) throw httpError(404, 'Week not found');
    await loadProgramOwnedOrThrow(req, week.programId);
    const updated = camel(
      await one(
        `UPDATE training_weeks
         SET week_number = COALESCE($2, week_number), start_date = COALESCE($3, start_date), notes = COALESCE($4, notes)
         WHERE id = $1 RETURNING *`,
        [week.id, asInt(req.body.weekNumber), asDate(req.body.startDate), req.body.notes]
      )
    );
    res.json({ week: updated });
  })
);

router.delete(
  '/weeks/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const week = camel(await one('SELECT * FROM training_weeks WHERE id = $1', [req.params.id]));
    if (!week) throw httpError(404, 'Week not found');
    await loadProgramOwnedOrThrow(req, week.programId);
    await query('DELETE FROM training_weeks WHERE id = $1', [week.id]);
    res.json({ message: 'Week deleted' });
  })
);

async function ensureProgramWeek(program, scheduledDate) {
  const date = scheduledDate || program.startDate || todayYmd();
  let week = camel(
    await one(
      `SELECT * FROM training_weeks
       WHERE program_id = $1
         AND start_date IS NOT NULL
         AND start_date <= $2::date
         AND start_date + 6 >= $2::date
       ORDER BY week_number, created_at
       LIMIT 1`,
      [program.id, date]
    )
  );
  if (week) {
    const phase = camel(await one('SELECT * FROM training_phases WHERE id = $1', [week.phaseId]));
    return { phase, week };
  }

  let phase = camel(
    await one(
      'SELECT * FROM training_phases WHERE program_id = $1 ORDER BY sort_order DESC, created_at DESC LIMIT 1',
      [program.id]
    )
  );
  if (!phase) {
    phase = camel(
      await one(
        `INSERT INTO training_phases (program_id, name, sort_order) VALUES ($1, 'Sessions', 0) RETURNING *`,
        [program.id]
      )
    );
  }

  const weekStart = mondayOf(date);
  week = camel(
    await one(
      'SELECT * FROM training_weeks WHERE program_id = $1 AND start_date = $2 LIMIT 1',
      [program.id, weekStart]
    )
  );
  if (week) return { phase: camel(await one('SELECT * FROM training_phases WHERE id = $1', [week.phaseId])), week };

  const count = await one(
    'SELECT COALESCE(MAX(week_number), 0) + 1 AS next FROM training_weeks WHERE phase_id = $1',
    [phase.id]
  );
  week = camel(
    await one(
      `INSERT INTO training_weeks (program_id, phase_id, week_number, start_date)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [program.id, phase.id, count.next, weekStart]
    )
  );
  return { phase, week };
}

router.post(
  '/programs/:id/workouts',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const program = await loadProgramOwnedOrThrow(req);
    const payload = workoutPayload(req.body, { sport: program.sport });
    if (!payload.scheduledDate) throw httpError(400, 'Choose a date for this session');
    const { phase, week } = await ensureProgramWeek(program, payload.scheduledDate);
    const workout = camel(
      await one(
        `INSERT INTO planned_workouts (
           program_id, phase_id, week_id, athlete_id, coach_id, club_id, scheduled_date, name, sport, workout_type,
           distance, duration, target_pace, target_hr_zone, target_hr, target_power, rpe,
           warmup, main_set, cooldown, instructions, coach_notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING *`,
        [
          program.id, phase.id, week.id, program.athleteId, program.coachId, program.clubId,
          payload.scheduledDate, payload.name, payload.sport, payload.workoutType,
          payload.distance, payload.duration, payload.targetPace, payload.targetHrZone, payload.targetHr, payload.targetPower, payload.rpe,
          payload.warmup, payload.mainSet, payload.cooldown, payload.instructions, payload.coachNotes,
        ]
      )
    );
    if (program.athleteId && program.status === 'active') {
      await createNotification({
        userId: program.athleteId,
        type: 'training',
        title: 'Workout scheduled',
        body: `${payload.name || payload.workoutType} on ${payload.scheduledDate}.`,
        data: { workoutId: workout.id, programId: program.id, url: `/training/workouts/${workout.id}` },
      });
    }
    res.status(201).json({ workout });
  })
);

router.post(
  '/weeks/:id/workouts',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const week = camel(await one('SELECT * FROM training_weeks WHERE id = $1', [req.params.id]));
    if (!week) throw httpError(404, 'Week not found');
    const program = await loadProgramOwnedOrThrow(req, week.programId);
    const payload = workoutPayload(req.body, { sport: program.sport, scheduledDate: week.startDate });
    if (!payload.scheduledDate) throw httpError(400, 'Workout date is required');
    const workout = camel(
      await one(
        `INSERT INTO planned_workouts (
           program_id, phase_id, week_id, athlete_id, coach_id, club_id, scheduled_date, name, sport, workout_type,
           distance, duration, target_pace, target_hr_zone, target_hr, target_power, rpe,
           warmup, main_set, cooldown, instructions, coach_notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING *`,
        [
          program.id, week.phaseId, week.id, program.athleteId, program.coachId, program.clubId,
          payload.scheduledDate, payload.name, payload.sport, payload.workoutType,
          payload.distance, payload.duration, payload.targetPace, payload.targetHrZone, payload.targetHr, payload.targetPower, payload.rpe,
          payload.warmup, payload.mainSet, payload.cooldown, payload.instructions, payload.coachNotes,
        ]
      )
    );
    if (program.athleteId && program.status === 'active') {
      await createNotification({
        userId: program.athleteId,
        type: 'training',
        title: 'Workout scheduled',
        body: `${payload.name || payload.workoutType} on ${payload.scheduledDate}.`,
        data: { workoutId: workout.id, programId: program.id, url: `/training/workouts/${workout.id}` },
      });
    }
    res.status(201).json({ workout });
  })
);

router.post(
  '/weeks/:id/copy',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const week = camel(await one('SELECT * FROM training_weeks WHERE id = $1', [req.params.id]));
    if (!week) throw httpError(404, 'Week not found');
    const program = await loadProgramOwnedOrThrow(req, week.programId);
    const shiftDays = asInt(req.body.shiftDays) ?? 7;
    const count = await one('SELECT COALESCE(MAX(week_number), 0) + 1 AS next FROM training_weeks WHERE phase_id = $1', [week.phaseId]);
    const copy = camel(
      await one(
        `INSERT INTO training_weeks (program_id, phase_id, week_number, start_date, notes)
         VALUES ($1,$2,$3, CASE WHEN $4::date IS NULL THEN NULL ELSE $4::date + ($5 * INTERVAL '1 day') END, $6)
         RETURNING *`,
        [program.id, week.phaseId, count.next, week.startDate, shiftDays, week.notes]
      )
    );
    await query(
      `INSERT INTO planned_workouts (
         program_id, phase_id, week_id, athlete_id, coach_id, club_id, scheduled_date, name, sport, workout_type,
         distance, duration, target_pace, target_hr_zone, target_hr, target_power, rpe,
         warmup, main_set, cooldown, instructions, coach_notes
       )
       SELECT program_id, phase_id, $2, athlete_id, coach_id, club_id,
              scheduled_date + ($3 * INTERVAL '1 day'), name, sport, workout_type,
              distance, duration, target_pace, target_hr_zone, target_hr, target_power, rpe,
              warmup, main_set, cooldown, instructions, coach_notes
       FROM planned_workouts WHERE week_id = $1`,
      [week.id, copy.id, shiftDays]
    );
    const workouts = camelMany(await many('SELECT * FROM planned_workouts WHERE week_id = $1 ORDER BY scheduled_date', [copy.id]));
    res.status(201).json({ week: copy, workouts });
  })
);

router.post(
  '/workouts',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const payload = workoutPayload(req.body, { sport: 'Run' });
    if (!payload.scheduledDate) throw httpError(400, 'Workout date is required');
    const targets = await resolveTargets(req.user, {
      athleteId: req.body.athleteId,
      groupId: req.body.groupId,
      athleteIds: req.body.athleteIds,
      clubId: req.body.clubId,
    });
    await assertCoachInClub(req.user.id, targets.clubId);
    const created = [];
    for (const athlete of targets.athletes) {
      const workout = camel(
        await one(
          `INSERT INTO planned_workouts (
             program_id, athlete_id, coach_id, club_id, group_id, scheduled_date, name, sport, workout_type,
             distance, duration, target_pace, target_hr_zone, target_hr, target_power, rpe,
             warmup, main_set, cooldown, instructions, coach_notes
           ) VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           RETURNING *`,
          [
            athlete.athleteId, req.user.id, targets.clubId, targets.group?.id || null,
            payload.scheduledDate, payload.name, payload.sport, payload.workoutType,
            payload.distance, payload.duration, payload.targetPace, payload.targetHrZone, payload.targetHr, payload.targetPower, payload.rpe,
            payload.warmup, payload.mainSet, payload.cooldown, payload.instructions, payload.coachNotes,
          ]
        )
      );
      await createNotification({
        userId: athlete.athleteId,
        type: 'training',
        title: 'Workout scheduled',
        body: `${payload.name || payload.workoutType} on ${payload.scheduledDate}${targets.group ? ` · ${targets.group.name}` : ''}.`,
        data: { workoutId: workout.id, url: `/training/workouts/${workout.id}` },
      });
      created.push(workout);
    }
    res.status(201).json({ workouts: created, count: created.length });
  })
);

router.get(
  '/workouts/:id',
  asyncHandler(async (req, res) => {
    const { workout, program, matches, accepted, suggested } = await loadWorkoutForUser(req, req.params.id);
    const rawActivity = accepted
      ? camel(await one('SELECT * FROM activities WHERE id = $1', [accepted.activityId]))
      : null;
    const activity = rawActivity && (await canViewerSeeActivity(req, rawActivity))
      ? rawActivity
      : null;
    const comparison = await comparisonForWorkout(workout, activity);
    const reviews = accepted
      ? camelMany(
          await many(
            `SELECT r.*, u.first_name AS coach_first_name, u.last_name AS coach_last_name, c.name AS club_name
             FROM activity_reviews r
             JOIN users u ON u.id = r.coach_id
             LEFT JOIN clubs c ON c.id = r.club_id
             WHERE r.activity_id = $1 AND r.status = 'published'
               AND ${reviewVisibilitySql('r', '$2')}`,
            [accepted.activityId, req.user.id]
          )
        )
      : [];
    res.json({
      workout,
      program: workoutProgramView(workout, program),
      canEdit: canModifyWorkout(req.user, workout, program),
      matches,
      accepted,
      suggested,
      comparison,
      reviews,
    });
  })
);

router.patch(
  '/workouts/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const current = camel(await one('SELECT * FROM planned_workouts WHERE id = $1', [req.params.id]));
    if (!current) throw httpError(404, 'Workout not found');
    const program = current.programId ? await loadProgramOwnedOrThrow(req, current.programId) : null;
    if (!canModifyWorkout(req.user, current, program)) throw httpError(403, 'Not authorized to modify this workout');
    const pastLocked = asDate(current.scheduledDate) < todayYmd() && !['planned', 'pending_match'].includes(current.completionStatus);
    const payload = pastLocked
      ? { ...current, coachNotes: req.body.coachNotes != null ? req.body.coachNotes : current.coachNotes, instructions: req.body.instructions != null ? req.body.instructions : current.instructions }
      : workoutPayload(req.body, current);
    const updated = camel(
      await one(
        `UPDATE planned_workouts SET
           scheduled_date = $2, name = $3, sport = $4, workout_type = $5, distance = $6, duration = $7,
           target_pace = $8, target_hr_zone = $9, target_hr = $10, target_power = $11, rpe = $12,
           warmup = $13, main_set = $14, cooldown = $15, instructions = $16, coach_notes = $17, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          current.id, payload.scheduledDate, payload.name, payload.sport, payload.workoutType, payload.distance, payload.duration,
          payload.targetPace, payload.targetHrZone, payload.targetHr, payload.targetPower, payload.rpe,
          payload.warmup, payload.mainSet, payload.cooldown, payload.instructions, payload.coachNotes,
        ]
      )
    );
    if ((program?.athleteId || current.athleteId) && (program ? program.status === 'active' : true) && !pastLocked) {
      await createNotification({
        userId: program?.athleteId || current.athleteId,
        type: 'training',
        title: 'Workout updated',
        body: `${updated.name || updated.workoutType} on ${asDate(updated.scheduledDate)} was changed.`,
        data: { workoutId: updated.id, url: `/training/workouts/${updated.id}` },
      });
    }
    res.json({ workout: updated });
  })
);

router.delete(
  '/workouts/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const current = camel(await one('SELECT * FROM planned_workouts WHERE id = $1', [req.params.id]));
    if (!current) throw httpError(404, 'Workout not found');
    const program = current.programId ? await loadProgram(current.programId) : null;
    if (!canModifyWorkout(req.user, current, program)) throw httpError(403, 'Not authorized to modify this workout');
    await query('DELETE FROM planned_workouts WHERE id = $1', [current.id]);
    res.json({ message: 'Workout deleted' });
  })
);

router.post(
  '/workouts/:id/duplicate',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const current = camel(await one('SELECT * FROM planned_workouts WHERE id = $1', [req.params.id]));
    if (!current) throw httpError(404, 'Workout not found');
    const program = current.programId ? await loadProgramOwnedOrThrow(req, current.programId) : null;
    if (!canModifyWorkout(req.user, current, program)) throw httpError(403, 'Not authorized to modify this workout');
    const date = asDate(req.body.scheduledDate) || current.scheduledDate;
    const copy = camel(
      await one(
        `INSERT INTO planned_workouts (
           program_id, phase_id, week_id, athlete_id, coach_id, club_id, scheduled_date, name, sport, workout_type,
           distance, duration, target_pace, target_hr_zone, target_hr, target_power, rpe,
           warmup, main_set, cooldown, instructions, coach_notes
         )
         SELECT program_id, phase_id, week_id, athlete_id, coach_id, club_id, $2, name, sport, workout_type,
                distance, duration, target_pace, target_hr_zone, target_hr, target_power, rpe,
                warmup, main_set, cooldown, instructions, coach_notes
         FROM planned_workouts WHERE id = $1
         RETURNING *`,
        [current.id, date]
      )
    );
    res.status(201).json({ workout: copy });
  })
);

router.post(
  '/workouts/:id/skip',
  asyncHandler(async (req, res) => {
    const { workout, program } = await loadWorkoutForUser(req, req.params.id);
    if (!canModifyWorkout(req.user, workout, program) && req.user.id !== (program?.athleteId || workout.athleteId)) {
      throw httpError(403, 'Access denied');
    }
    const updated = camel(
      await one(
        `UPDATE planned_workouts SET completion_status = 'skipped', updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [workout.id]
      )
    );
    res.json({ workout: updated });
  })
);

router.post(
  '/workouts/:id/matches/:matchId/confirm',
  asyncHandler(async (req, res) => {
    const { workout, program } = await loadWorkoutForUser(req, req.params.id);
    if (!canModifyWorkout(req.user, workout, program) && req.user.id !== (program?.athleteId || workout.athleteId)) {
      throw httpError(403, 'Access denied');
    }
    const match = camel(await one('SELECT * FROM workout_activity_matches WHERE id = $1 AND planned_workout_id = $2', [req.params.matchId, workout.id]));
    if (!match) throw httpError(404, 'Match not found');
    const result = await confirmMatch(match.id, req.user.id);
    res.json(result);
  })
);

router.post(
  '/workouts/:id/matches/:matchId/reject',
  asyncHandler(async (req, res) => {
    const { workout, program } = await loadWorkoutForUser(req, req.params.id);
    if (!canModifyWorkout(req.user, workout, program) && req.user.id !== (program?.athleteId || workout.athleteId)) {
      throw httpError(403, 'Access denied');
    }
    const match = camel(await one('SELECT * FROM workout_activity_matches WHERE id = $1 AND planned_workout_id = $2', [req.params.matchId, workout.id]));
    if (!match) throw httpError(404, 'Match not found');
    res.json({ match: await rejectMatch(match.id) });
  })
);

router.post(
  '/workouts/:id/link-activity',
  asyncHandler(async (req, res) => {
    const { workout, program } = await loadWorkoutForUser(req, req.params.id);
    if (!canModifyWorkout(req.user, workout, program) && req.user.id !== (program?.athleteId || workout.athleteId)) {
      throw httpError(403, 'Access denied');
    }
    if (!req.body.activityId) throw httpError(400, 'Choose an activity');
    const result = await linkActivityManually(workout, req.body.activityId, req.user.id);
    res.json(result);
  })
);

async function loadProgramOwnedOrThrow(req, programId = req.params.id) {
  const program = await loadProgram(programId);
  return assertCanModifyProgram(req.user, program);
}

export default router;
