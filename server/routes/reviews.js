import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole, rejectAppAdmin } from '../middleware/auth.js';
import { analyzeActivity } from '../services/analysisService.js';
import { createNotification } from '../services/notificationService.js';
import { asyncHandler } from '../middleware/error.js';
import { assertCanViewReview, getAssignment } from '../utils/coachingAccess.js';
import { canViewerSeeActivity } from '../utils/stravaShare.js';

const router = express.Router();
router.use(protect, requireMembership, rejectAppAdmin);

async function assigned(coachId, athleteId) {
  return one(
    `SELECT id FROM coach_assignments WHERE coach_id = $1 AND athlete_id = $2 AND status = 'active'`,
    [coachId, athleteId]
  );
}

router.post(
  '/request',
  asyncHandler(async (req, res) => {
    const { activityId, coachId: bodyCoachId } = req.body;
    const activity = camel(await one('SELECT * FROM activities WHERE id = $1 AND athlete_id = $2', [activityId, req.user.id]));
    if (!activity) return res.status(404).json({ message: 'Activity not found' });

    const assignedCoaches = await many(
      `SELECT coach_id FROM coach_assignments WHERE athlete_id = $1 AND status = 'active'`,
      [req.user.id]
    );
    if (!assignedCoaches.length) {
      return res.status(400).json({ message: 'No assigned coach. Join a club or ask an admin to assign a coach.' });
    }

    let coachId = bodyCoachId;
    if (!coachId) {
      if (assignedCoaches.length === 1) coachId = assignedCoaches[0].coach_id;
      else return res.status(400).json({ message: 'Select a coach' });
    }
    const ok = await assigned(coachId, req.user.id);
    if (!ok) return res.status(400).json({ message: 'That coach is not assigned to you' });

    const existingReview = await one(
      `SELECT id FROM activity_reviews WHERE activity_id = $1 AND coach_id = $2 AND status = 'published' LIMIT 1`,
      [activityId, coachId]
    );
    if (existingReview) {
      return res.status(400).json({ message: 'This coach already reviewed this activity' });
    }
    const existingRequest = await one(
      `SELECT id FROM review_requests WHERE activity_id = $1 AND coach_id = $2 AND status = 'pending' LIMIT 1`,
      [activityId, coachId]
    );
    if (existingRequest) {
      return res.status(400).json({ message: 'You already asked this coach for a review' });
    }

    const assignment = camel(
      await one(
        `SELECT club_id FROM coach_assignments WHERE coach_id = $1 AND athlete_id = $2 AND status = 'active'`,
        [coachId, req.user.id]
      )
    );
    const row = camel(
      await one(
        `INSERT INTO review_requests (activity_id, athlete_id, coach_id, club_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [activityId, req.user.id, coachId, assignment?.club_id || assignment?.clubId || null]
      )
    );
    await createNotification({
      userId: coachId,
      type: 'review_request',
      title: 'New activity review request',
      body: `${req.user.firstName} requested a review of ${activity.name || 'an activity'}.`,
      data: { activityId, requestId: row.id },
    });
    res.status(201).json({ requests: [row] });
  })
);

router.get(
  '/inbox',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const pageSizes = [10, 20, 50, 100];
    const parsedLimit = pageSizes.includes(Number(req.query.limit)) ? Number(req.query.limit) : 10;
    const parsedPage = Math.max(1, Number(req.query.page) || 1);
    const sortKey = ['requestedAt', 'name'].includes(String(req.query.sort || ''))
      ? String(req.query.sort)
      : 'requestedAt';
    const dirSql = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderSql =
      sortKey === 'name'
        ? `LOWER(u.last_name) ${dirSql} NULLS LAST, LOWER(u.first_name) ${dirSql}, rr.requested_at DESC`
        : `rr.requested_at ${dirSql} NULLS LAST`;
    const where = `rr.coach_id = $1
           AND rr.status = 'pending'
           AND NOT EXISTS (
             SELECT 1 FROM activity_reviews ar
             WHERE ar.activity_id = rr.activity_id
               AND ar.coach_id = rr.coach_id
               AND ar.status = 'published'
           )`;
    const count = await one(
      `SELECT COUNT(*)::int AS total
       FROM review_requests rr
       JOIN activities a ON a.id = rr.activity_id
       JOIN users u ON u.id = rr.athlete_id
       WHERE ${where}`,
      [req.user.id]
    );
    const total = count.total;
    const pages = Math.max(1, Math.ceil(total / parsedLimit) || 1);
    const safePage = Math.min(parsedPage, pages);
    const offset = (safePage - 1) * parsedLimit;
    const requests = camelMany(
      await many(
        `SELECT rr.*, a.name AS activity_name, a.type, a.distance, a.start_date,
                u.first_name, u.last_name
         FROM review_requests rr
         JOIN activities a ON a.id = rr.activity_id
         JOIN users u ON u.id = rr.athlete_id
         WHERE ${where}
         ORDER BY ${orderSql}
         LIMIT $2 OFFSET $3`,
        [req.user.id, parsedLimit, offset]
      )
    );
    res.json({
      requests,
      total,
      page: safePage,
      pages,
      limit: parsedLimit,
      sort: sortKey,
      dir: dirSql.toLowerCase(),
    });
  })
);

router.post(
  '/',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const {
      activityId,
      requestId,
      performanceSummary,
      strengths,
      improvements,
      technique,
      recommendations,
      recoveryAdvice,
      comments,
      rating,
      status = 'published',
    } = req.body;

    const activity = camel(await one('SELECT * FROM activities WHERE id = $1', [activityId]));
    if (!activity) return res.status(404).json({ message: 'Activity not found' });
    const assignment = await getAssignment(req.user.id, activity.athleteId);
    if (!assignment) {
      return res.status(403).json({ message: 'Not assigned to this athlete' });
    }
    if (!(await canViewerSeeActivity(req, activity))) {
      return res.status(403).json({ message: 'This athlete has not shared Strava activities with coaches.' });
    }
    if (req.body.athleteId && req.body.athleteId !== activity.athleteId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (req.body.clubId && assignment.clubId && req.body.clubId !== assignment.clubId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const athlete = camel(await one('SELECT * FROM users WHERE id = $1', [activity.athleteId]));
    const insights = analyzeActivity(activity, athlete);
    const clubId = assignment.clubId || null;
    const liveMatch = camel(
      await one(
        `SELECT w.id AS planned_workout_id, w.program_id
         FROM workout_activity_matches m
         JOIN planned_workouts w ON w.id = m.planned_workout_id
         WHERE m.activity_id = $1 AND m.status IN ('auto', 'confirmed')
         LIMIT 1`,
        [activityId]
      )
    );
    let programId = liveMatch?.programId || null;
    let plannedWorkoutId = liveMatch?.plannedWorkoutId || null;
    if (req.body.programId) {
      const owned = await one(
        `SELECT id FROM training_programs
         WHERE id = $1 AND athlete_id = $2 AND coach_id = $3 AND club_id IS NOT DISTINCT FROM $4`,
        [req.body.programId, activity.athleteId, req.user.id, clubId]
      );
      programId = owned?.id || programId;
    }
    if (req.body.plannedWorkoutId) {
      const owned = await one(
        `SELECT id FROM planned_workouts
         WHERE id = $1 AND athlete_id = $2 AND coach_id = $3 AND club_id IS NOT DISTINCT FROM $4`,
        [req.body.plannedWorkoutId, activity.athleteId, req.user.id, clubId]
      );
      plannedWorkoutId = owned?.id || plannedWorkoutId;
    }

    const review = camel(
      await one(
        `INSERT INTO activity_reviews (
           activity_id, coach_id, athlete_id, request_id, initiated_by, club_id, program_id, planned_workout_id,
           performance_summary, strengths, improvements, technique, recommendations,
           recovery_advice, comments, rating, coach_insights, status, published_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19)
         ON CONFLICT (activity_id, coach_id) DO UPDATE SET
           club_id = COALESCE(activity_reviews.club_id, EXCLUDED.club_id),
           program_id = COALESCE(EXCLUDED.program_id, activity_reviews.program_id),
           planned_workout_id = COALESCE(EXCLUDED.planned_workout_id, activity_reviews.planned_workout_id),
           performance_summary = EXCLUDED.performance_summary,
           strengths = EXCLUDED.strengths,
           improvements = EXCLUDED.improvements,
           technique = EXCLUDED.technique,
           recommendations = EXCLUDED.recommendations,
           recovery_advice = EXCLUDED.recovery_advice,
           comments = EXCLUDED.comments,
           rating = EXCLUDED.rating,
           coach_insights = EXCLUDED.coach_insights,
           status = EXCLUDED.status,
           published_at = EXCLUDED.published_at,
           updated_at = NOW()
         RETURNING *`,
        [
          activityId,
          req.user.id,
          activity.athleteId,
          requestId || null,
          requestId ? 'athlete' : 'coach',
          clubId,
          programId,
          plannedWorkoutId,
          performanceSummary,
          strengths,
          improvements,
          technique,
          recommendations,
          recoveryAdvice,
          comments,
          rating || null,
          JSON.stringify(insights),
          status,
          status === 'published' ? new Date() : null,
        ]
      )
    );

    if (status === 'published') {
      await query(
        `UPDATE review_requests SET status = 'completed'
         WHERE activity_id = $1 AND coach_id = $2 AND status = 'pending'`,
        [activityId, req.user.id]
      );
      await createNotification({
        userId: activity.athleteId,
        type: 'review',
        title: 'New coach review',
        body: `${req.user.firstName} published feedback on ${activity.name || 'your activity'}.`,
        data: { activityId, reviewId: review.id },
      });
    }
    res.status(201).json({ review, insights });
  })
);

router.get(
  '/activity/:activityId/insights',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const activity = camel(await one('SELECT * FROM activities WHERE id = $1', [req.params.activityId]));
    if (!activity) return res.status(404).json({ message: 'Activity not found' });
    if (!(await assigned(req.user.id, activity.athleteId))) {
      return res.status(403).json({ message: 'Not assigned to this athlete' });
    }
    if (!(await canViewerSeeActivity(req, activity))) {
      return res.status(403).json({ message: 'This athlete has not shared Strava activities with coaches.' });
    }
    const athlete = camel(await one('SELECT * FROM users WHERE id = $1', [activity.athleteId]));
    res.json({ insights: analyzeActivity(activity, athlete) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const review = camel(
      await one(
        `SELECT r.*, u.first_name AS coach_first_name, u.last_name AS coach_last_name, c.name AS club_name
         FROM activity_reviews r
         JOIN users u ON u.id = r.coach_id
         LEFT JOIN clubs c ON c.id = r.club_id
         WHERE r.id = $1`,
        [req.params.id]
      )
    );
    await assertCanViewReview(req.user, review);
    res.json({ review });
  })
);

router.patch(
  '/:id',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const existing = camel(await one('SELECT * FROM activity_reviews WHERE id = $1', [req.params.id]));
    if (!existing) return res.status(404).json({ message: 'Review not found' });
    if (existing.coachId !== req.user.id) {
      return res.status(403).json({ message: 'You can only modify your own reviews' });
    }
    const review = camel(
      await one(
        `UPDATE activity_reviews SET
           performance_summary = COALESCE($2, performance_summary),
           strengths = COALESCE($3, strengths),
           improvements = COALESCE($4, improvements),
           technique = COALESCE($5, technique),
           recommendations = COALESCE($6, recommendations),
           recovery_advice = COALESCE($7, recovery_advice),
           comments = COALESCE($8, comments),
           rating = COALESCE($9, rating),
           updated_at = NOW()
         WHERE id = $1 AND coach_id = $10
         RETURNING *`,
        [
          existing.id,
          req.body.performanceSummary,
          req.body.strengths,
          req.body.improvements,
          req.body.technique,
          req.body.recommendations,
          req.body.recoveryAdvice,
          req.body.comments,
          req.body.rating || null,
          req.user.id,
        ]
      )
    );
    res.json({ review });
  })
);

export default router;
