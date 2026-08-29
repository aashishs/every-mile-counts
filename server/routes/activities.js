import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, rejectAppAdmin } from '../middleware/auth.js';
import { analyzeActivity, athleteDashboard, coachAthleteGlance, compareActivitySet, periodAnalysis } from '../services/analysisService.js';
import { enrichStravaActivity } from '../services/stravaService.js';
import { athleteHrContext } from '../utils/maf.js';
import { syncUserActivities } from '../services/syncService.js';
import { mappedFromFile, mappedFromManual, saveManualActivity } from '../services/activityImportService.js';
import { asyncHandler } from '../middleware/error.js';
import { familySqlClause, parseStoredSyncTypes } from '../utils/activityTypes.js';
import { assignmentClubMatches, getAssignment } from '../utils/coachingAccess.js';
import { ensureKmSplits } from '../utils/kmSplits.js';
import { rankSimilarActivities, similarHeading, similarSport, similarSupported } from '../utils/similarActivities.js';
import { canViewerSeeActivity, stravaShareClause, stravaShareFilterSql } from '../utils/stravaShare.js';
import { activityOrigin } from '../utils/activityOrigin.js';

const router = express.Router();
router.use(protect, requireMembership, rejectAppAdmin);

async function canViewAthlete(req, athleteId) {
  if (req.user.id === athleteId) return true;
  if (req.user.roles.includes('coach')) {
    const assignment = await one(
      `SELECT id FROM coach_assignments WHERE athlete_id = $1 AND coach_id = $2 AND status = 'active'`,
      [athleteId, req.user.id]
    );
    if (assignment) return true;
  }
  if (req.user.roles.includes('club_admin')) {
    const inClub = await one(
      `SELECT 1
       FROM club_members admin
       JOIN club_members ath ON ath.club_id = admin.club_id
       WHERE admin.user_id = $1 AND admin.role = 'club_admin' AND admin.status = 'active'
         AND ath.user_id = $2 AND ath.status = 'active' AND ath.role = 'member'
       LIMIT 1`,
      [req.user.id, athleteId]
    );
    if (inClub) return true;
  }
  return false;
}

function requireAthlete(req, res, next) {
  if (!req.user.roles.includes('athlete')) {
    return res.status(403).json({ message: 'Athlete account required' });
  }
  next();
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { type, startDate, endDate, q, minDistance, maxDistance, page = 1, limit = 10, athleteId, sort, dir } = req.query;
    const ownerId = athleteId || req.user.id;
    if (ownerId === req.user.id && !req.user.roles.includes('athlete')) {
      return res.status(403).json({ message: 'Athlete account required' });
    }
    if (!(await canViewAthlete(req, ownerId))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const pageSizes = [10, 20, 50, 100];
    const parsedLimit = pageSizes.includes(Number(limit)) ? Number(limit) : 10;
    const parsedPage = Math.max(1, Number(page) || 1);
    const sortKey = ['date', 'name'].includes(String(sort || '')) ? String(sort) : 'date';
    const dirSql = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderSql =
      sortKey === 'name'
        ? `LOWER(COALESCE(a.name, '')) ${dirSql} NULLS LAST, a.start_date DESC`
        : `a.start_date ${dirSql} NULLS LAST`;
    const filters = ['a.athlete_id = $1'];
    const params = [ownerId];
    let i = 2;
    const owner =
      ownerId === req.user.id
        ? req.user
        : camel(await one('SELECT sync_activity_types FROM users WHERE id = $1', [ownerId]));
    const selectedTypes = parseStoredSyncTypes(owner?.syncActivityTypes);
    if (type && type !== 'all') {
      if (!selectedTypes.includes(String(type))) {
        return res.json({
          activities: [],
          total: 0,
          page: 1,
          pages: 1,
          limit: parsedLimit,
          sort: sortKey,
          dir: dirSql.toLowerCase(),
        });
      }
      const family = activityTypeSql(type);
      if (family.params.length) {
        filters.push(family.clause.replace(/\$n/g, `$${i}`));
        params.push(...family.params);
        i += family.params.length;
      } else {
        filters.push(family.clause);
      }
    } else {
      const scoped = familySqlClause(selectedTypes);
      if (scoped) filters.push(scoped);
    }
    if (q && String(q).trim()) {
      filters.push(`a.name ILIKE $${i++}`);
      params.push(`%${String(q).trim()}%`);
    }
    if (startDate) {
      filters.push(`a.start_date >= $${i++}::date`);
      params.push(startDate);
    }
    if (endDate) {
      filters.push(`a.start_date < ($${i++}::date + INTERVAL '1 day')`);
      params.push(endDate);
    }
    const minKm = Number(minDistance);
    const maxKm = Number(maxDistance);
    if (minDistance && !Number.isNaN(minKm)) {
      filters.push(`a.distance >= $${i++}`);
      params.push(minKm * 1000);
    }
    if (maxDistance && !Number.isNaN(maxKm)) {
      filters.push(`a.distance <= $${i++}`);
      params.push(maxKm * 1000);
    }
    const shareClause = stravaShareClause(req, ownerId);
    if (shareClause) filters.push(shareClause);
    const where = filters.join(' AND ');
    const count = await one(`SELECT COUNT(*)::int AS total FROM activities a WHERE ${where}`, params);
    const total = count.total;
    const pages = Math.max(1, Math.ceil(total / parsedLimit) || 1);
    const safePage = Math.min(parsedPage, pages);
    const offset = (safePage - 1) * parsedLimit;
    const activities = camelMany(
      await many(
        `SELECT a.*, e.name AS event_name, e.event_date
         FROM activities a
         LEFT JOIN events e ON e.id = a.event_id
         WHERE ${where}
         ORDER BY ${orderSql}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, parsedLimit, offset]
      )
    );
    res.json({
      activities: activities.map(publicListActivity),
      total,
      page: safePage,
      pages,
      limit: parsedLimit,
      sort: sortKey,
      dir: dirSql.toLowerCase(),
    });
  })
);

router.get(
  '/dashboard',
  requireAthlete,
  asyncHandler(async (req, res) => {
    const data = await athleteDashboard(req.user.id, req.user, {
      type: req.query.type,
      syncTypes: req.user.syncActivityTypes,
    });
    res.json(data);
  })
);

router.get(
  '/analysis',
  requireAthlete,
  asyncHandler(async (req, res) => {
    const data = await periodAnalysis(req.user.id, req.query.period || '90', {
      type: req.query.type,
      syncTypes: req.user.syncActivityTypes,
    });
    res.json(data);
  })
);

router.post(
  '/sync',
  requireAthlete,
  asyncHandler(async (req, res) => {
    const result = await syncUserActivities(req.user.id, { full: true });
    res.json(result);
  })
);

router.post(
  '/',
  requireAthlete,
  asyncHandler(async (req, res) => {
    const mapped = mappedFromManual(req.body || {});
    const allowed = parseStoredSyncTypes(req.user.syncActivityTypes);
    if (mapped.type && !allowed.includes(mapped.type)) {
      return res.status(400).json({ message: 'That sport is not in your selected activity types' });
    }
    const id = await saveManualActivity(req.user.id, mapped);
    res.status(201).json({ id, source: 'manual' });
  })
);

router.post(
  '/import',
  requireAthlete,
  asyncHandler(async (req, res) => {
    const mapped = mappedFromFile(req.body || {});
    const allowed = parseStoredSyncTypes(req.user.syncActivityTypes);
    if (mapped.type && !allowed.includes(mapped.type)) {
      return res.status(400).json({ message: 'That sport is not in your selected activity types' });
    }
    const id = await saveManualActivity(req.user.id, mapped);
    res.status(201).json({
      id,
      source: 'manual',
      name: mapped.name,
      type: mapped.type,
      distance: mapped.distance,
      movingTime: mapped.movingTime,
    });
  })
);

router.get(
  '/compare',
  asyncHandler(async (req, res) => {
    const fromIds = String(req.query.ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const fromParams = ['a', 'b', 'c'].map((key) => String(req.query[key] || '').trim()).filter(Boolean);
    const ids = [...new Set(fromIds.length ? fromIds : fromParams)];
    if (ids.length < 2 || ids.length > 3) {
      return res.status(400).json({ message: 'Pick 2 or 3 activities to compare.' });
    }
    const loadActivity = async (id) => camel(
      await one(
        `SELECT a.*, u.first_name, u.last_name, u.email, u.max_heart_rate, u.date_of_birth
         FROM activities a
         JOIN users u ON u.id = a.athlete_id
         WHERE a.id = $1`,
        [id]
      )
    );
    const loaded = [];
    for (const id of ids) {
      const row = await loadActivity(id);
      if (!row) return res.status(404).json({ message: 'Activity not found' });
      loaded.push(row);
    }
    if (loaded.some((act) => act.athleteId !== loaded[0].athleteId)) {
      return res.status(400).json({ message: 'Compare sessions from the same athlete.' });
    }
    if (!(await canViewAthlete(req, loaded[0].athleteId))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    for (const act of loaded) {
      if (!(await canViewerSeeActivity(req, act))) {
        return res.status(403).json({ message: 'This athlete has not shared Strava activities with coaches.' });
      }
    }
    const prepared = await Promise.all(loaded.map(async (act) => {
      const detailed = await enrichStravaActivity(act);
      return { ...detailed, splits: ensureKmSplits(detailed) };
    }));
    const payload = compareActivitySet(prepared, athleteHrContext(prepared[0]));
    const athleteId = prepared[0]?.athleteId;
    if (req.user.roles.includes('coach') && athleteId && athleteId !== req.user.id) {
      const assignment = await getAssignment(req.user.id, athleteId);
      if (assignment) {
        const reviewed = camelMany(
          await many(
            `SELECT activity_id FROM activity_reviews
             WHERE coach_id = $1 AND status = 'published' AND activity_id = ANY($2::uuid[])`,
            [req.user.id, prepared.map((act) => act.id)]
          )
        );
        payload.canReview = true;
        payload.athleteId = athleteId;
        payload.reviewedIds = reviewed.map((row) => row.activityId);
      }
    }
    res.json(payload);
  })
);

router.get(
  '/athlete/:athleteId',
  asyncHandler(async (req, res) => {
    if (!(await canViewAthlete(req, req.params.athleteId))) {
      return res.status(403).json({ message: 'Not authorized to view this athlete' });
    }
    const pageSizes = [10, 20, 50, 100];
    const limit = pageSizes.includes(Number(req.query.limit)) ? Number(req.query.limit) : 10;
    const page = Math.max(1, Number(req.query.page) || 1);
    const review = ['pending', 'reviewed'].includes(String(req.query.review || ''))
      ? String(req.query.review)
      : 'all';
    const sortKey = ['date', 'type', 'name', 'distance', 'time', 'hr', 'review'].includes(String(req.query.sort || ''))
      ? String(req.query.sort)
      : 'date';
    const dirSql = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const athleteId = req.params.athleteId;
    const coachId = req.user.id;
    const shareSql = stravaShareFilterSql(req, athleteId);
    const reviewedSql = `EXISTS (
      SELECT 1 FROM activity_reviews r
      WHERE r.activity_id = a.id AND r.coach_id = $2 AND r.status = 'published'
    )`;
    const reviewClause =
      review === 'pending' ? `AND NOT ${reviewedSql}` : review === 'reviewed' ? `AND ${reviewedSql}` : '';
    const orderSql = {
      date: `a.start_date ${dirSql} NULLS LAST`,
      type: `LOWER(COALESCE(a.type, '')) ${dirSql} NULLS LAST, a.start_date DESC`,
      name: `LOWER(COALESCE(a.name, '')) ${dirSql} NULLS LAST, a.start_date DESC`,
      distance: `a.distance ${dirSql} NULLS LAST, a.start_date DESC`,
      time: `a.moving_time ${dirSql} NULLS LAST, a.start_date DESC`,
      hr: `a.avg_heartrate ${dirSql} NULLS LAST, a.start_date DESC`,
      review: `(${reviewedSql}) ${dirSql}, a.start_date DESC`,
    }[sortKey];
    const countParams = review === 'all' ? [athleteId] : [athleteId, coachId];
    const count = await one(
      `SELECT COUNT(*)::int AS total FROM activities a WHERE a.athlete_id = $1 ${shareSql} ${reviewClause}`,
      countParams
    );
    const pending = await one(
      `SELECT COUNT(*)::int AS total FROM activities a WHERE a.athlete_id = $1 ${shareSql} AND NOT ${reviewedSql}`,
      [athleteId, coachId]
    );
    const total = count.total;
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * limit;
    const activities = camelMany(
      await many(
        `SELECT a.*, ${reviewedSql} AS reviewed_by_me
         FROM activities a
         WHERE a.athlete_id = $1 ${shareSql} ${reviewClause}
         ORDER BY ${orderSql}
         LIMIT $3 OFFSET $4`,
        [athleteId, coachId, limit, offset]
      )
    );
    const glance = await coachAthleteGlance(athleteId, coachId);
    res.json({
      activities: activities.map(publicListActivity),
      glance,
      total,
      pendingTotal: pending.total,
      page: safePage,
      pages,
      limit,
      sort: sortKey,
      dir: dirSql.toLowerCase(),
    });
  })
);

router.get(
  '/:id/similar',
  asyncHandler(async (req, res) => {
    const seed = camel(
      await one(
        `SELECT a.*
         FROM activities a
         WHERE a.id = $1`,
        [req.params.id]
      )
    );
    if (!seed) return res.status(404).json({ message: 'Activity not found' });
    if (!(await canViewAthlete(req, seed.athleteId))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (!(await canViewerSeeActivity(req, seed))) {
      return res.status(403).json({ message: 'This athlete has not shared Strava activities with coaches.' });
    }

    const sport = similarSport(seed);
    if (!similarSupported(sport)) {
      return res.json({ sport, supported: false, heading: null, activities: [] });
    }
    const typeFilter = activityTypeSql(sport);
    const filters = ['a.athlete_id = $1', 'a.id <> $2'];
    const params = [seed.athleteId, seed.id];
    let i = 3;
    if (typeFilter.params.length) {
      filters.push(typeFilter.clause.replace(/\$n/g, `$${i}`));
      params.push(...typeFilter.params);
      i += typeFilter.params.length;
    } else {
      filters.push(typeFilter.clause);
    }

    const shareClause = stravaShareClause(req, seed.athleteId);
    if (shareClause) filters.push(shareClause);

    const rows = camelMany(
      await many(
        `SELECT a.id, a.athlete_id, a.name, a.type, a.sport_type, a.source, a.source_activity_id,
                a.distance, a.moving_time, a.elapsed_time, a.elevation_gain, a.start_date,
                a.avg_speed, a.avg_heartrate, a.calories, a.polyline
         FROM activities a
         WHERE ${filters.join(' AND ')}
         ORDER BY a.start_date DESC
         LIMIT 500`,
        params
      )
    );

    const ranked = rankSimilarActivities(seed, rows, { limit: 8 });
    res.json({
      sport,
      supported: true,
      heading: similarHeading(sport),
      activities: ranked.map((row) => {
        const { polyline: _polyline, ...rest } = publicListActivity(row.activity);
        return {
          ...rest,
          why: row.why,
          size: row.size,
        };
      }),
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const activity = camel(
      await one(
        `SELECT a.*, u.first_name, u.last_name, u.email, u.max_heart_rate, u.date_of_birth, u.age, u.maf_heart_rate
         FROM activities a
         JOIN users u ON u.id = a.athlete_id
         WHERE a.id = $1`,
        [req.params.id]
      )
    );
    if (!activity) return res.status(404).json({ message: 'Activity not found' });
    if (!(await canViewAthlete(req, activity.athleteId))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (!(await canViewerSeeActivity(req, activity))) {
      return res.status(403).json({ message: 'This athlete has not shared Strava activities with coaches.' });
    }

    const detailed = await enrichStravaActivity(activity);
    const hr = athleteHrContext(detailed);
    const insights = analyzeActivity(detailed, hr);
    const isCoach = req.user.roles.includes('coach') && req.user.id !== detailed.athleteId;

    const reviews = camelMany(
      await many(
        `SELECT r.*, u.first_name AS coach_first_name, u.last_name AS coach_last_name, c.name AS club_name
         FROM activity_reviews r
         JOIN users u ON u.id = r.coach_id
         LEFT JOIN clubs c ON c.id = r.club_id
         WHERE r.activity_id = $1 AND r.status = 'published'
           AND (
             r.athlete_id = $2
             OR r.coach_id = $2
             OR EXISTS (
               SELECT 1 FROM coach_assignments ca
               WHERE ca.athlete_id = r.athlete_id
                 AND ca.coach_id = $2
                 AND ca.status = 'active'
                 AND r.club_id IS NOT NULL
                 AND ca.club_id = r.club_id
             )
           )`,
        [activity.id, req.user.id]
      )
    );

    const requests = camelMany(
      await many(
        `SELECT rr.*, u.first_name AS coach_first_name, u.last_name AS coach_last_name
         FROM review_requests rr
         JOIN users u ON u.id = rr.coach_id
         WHERE rr.activity_id = $1
           AND (
             rr.athlete_id = $2
             OR rr.coach_id = $2
             OR EXISTS (
               SELECT 1 FROM coach_assignments ca
               WHERE ca.athlete_id = rr.athlete_id
                 AND ca.coach_id = $2
                 AND ca.status = 'active'
                 AND rr.club_id IS NOT NULL
                 AND ca.club_id = rr.club_id
             )
           )
         ORDER BY rr.requested_at DESC`,
        [activity.id, req.user.id]
      )
    );

    const match = camel(
      await one(
        `SELECT m.comparison, w.id AS planned_workout_id, w.name AS workout_name, w.workout_type, w.sport,
                w.completion_status, w.program_id, w.coach_id, w.club_id, p.name AS program_name
         FROM workout_activity_matches m
         JOIN planned_workouts w ON w.id = m.planned_workout_id
         LEFT JOIN training_programs p ON p.id = w.program_id
         WHERE m.activity_id = $1 AND m.status IN ('auto', 'confirmed')
         LIMIT 1`,
        [activity.id]
      )
    );
    let plannedWorkout = null;
    if (match) {
      let canSeePlan = req.user.id === activity.athleteId || req.user.id === match.coachId;
      if (!canSeePlan && (req.user.roles || []).includes('coach')) {
        const assignment = await getAssignment(req.user.id, activity.athleteId);
        canSeePlan = Boolean(assignment && (await assignmentClubMatches(assignment, match.clubId)));
      }
      if (canSeePlan) {
        plannedWorkout = {
          id: match.plannedWorkoutId,
          name: match.workoutName,
          workoutType: match.workoutType,
          sport: match.sport,
          programId: match.programId,
          programName: match.programName,
          completionStatus: match.completionStatus,
          comparison: match.comparison || [],
        };
      }
    }

    const {
      raw: _raw,
      email: _email,
      ...safeActivity
    } = detailed;
    res.json({
      activity: {
        ...safeActivity,
        origin: activityOrigin(detailed),
        sourceActivityId: detailed.sourceActivityId || detailed.raw?.id || null,
        age: hr.age,
        mafHeartRate: hr.mafHeartRate,
      },
      plannedWorkout,
      insights: isCoach ? insights : undefined,
      athleteInsights: req.user.id === activity.athleteId ? {
        summary: insights.summary,
        pace: insights.pace,
        paceConsistency: insights.paceConsistency,
        heartRateZone: insights.heartRateZone,
        mafCheck: insights.mafCheck,
        trainingLoad: insights.trainingLoad,
        elevationImpact: insights.elevationImpact,
        recoveryRecommendation: insights.recoveryRecommendation,
      } : undefined,
      reviews,
      requests,
    });
  })
);

function publicListActivity(row) {
  const { raw, gpsPoints, email, polyline, importFormat, importSource, ...rest } = row || {};
  return { ...rest, origin: activityOrigin(row) };
}

function activityTypeSql(type) {
  const blob = `LOWER(COALESCE(a.type,'') || ' ' || COALESCE(a.sport_type,''))`;
  const like = (term) => ({ clause: `${blob} LIKE '%${term}%'`, params: [] });
  const map = {
    Run: { clause: `(${blob} LIKE '%run%' OR ${blob} LIKE '%trail%')`, params: [] },
    Ride: { clause: `(${blob} LIKE '%ride%' OR ${blob} LIKE '%cycle%' OR ${blob} LIKE '%bike%')`, params: [] },
    Swim: like('swim'),
    Walk: like('walk'),
    Hike: like('hike'),
    Yoga: like('yoga'),
    HIIT: { clause: `(${blob} LIKE '%hiit%' OR ${blob} LIKE '%highintensity%')`, params: [] },
    WeightTraining: { clause: `(${blob} LIKE '%weight%' OR ${blob} LIKE '%strength%')`, params: [] },
    Workout: like('workout'),
  };
  return map[type] || { clause: 'a.type = $n', params: [type] };
}

export default router;
