import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole, rejectAppAdmin } from '../middleware/auth.js';
import { analyzeActivity } from '../services/analysisService.js';
import { createNotification } from '../services/notificationService.js';
import { asyncHandler } from '../middleware/error.js';

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
    const { activityId, coachId } = req.body;
    const activity = camel(await one('SELECT * FROM activities WHERE id = $1 AND athlete_id = $2', [activityId, req.user.id]));
    if (!activity) return res.status(404).json({ message: 'Activity not found' });

    const coaches = coachId
      ? [{ coach_id: coachId }]
      : await many(
          `SELECT coach_id FROM coach_assignments WHERE athlete_id = $1 AND status = 'active'`,
          [req.user.id]
        );
    if (!coaches.length) {
      return res.status(400).json({ message: 'No assigned coach. Join a club or ask an admin to assign a coach.' });
    }

    const existingReview = await one(
      `SELECT id FROM activity_reviews WHERE activity_id = $1 AND status = 'published' LIMIT 1`,
      [activityId]
    );
    if (existingReview) {
      return res.status(400).json({ message: 'This activity already has a coach review' });
    }
    const existingRequest = await one(
      `SELECT id FROM review_requests WHERE activity_id = $1 AND status = 'pending' LIMIT 1`,
      [activityId]
    );
    if (existingRequest) {
      return res.status(400).json({ message: 'A review has already been requested for this activity' });
    }

    const created = [];
    for (const c of coaches) {
      const ok = await assigned(c.coach_id, req.user.id);
      if (!ok) continue;
      const row = await one(
        `INSERT INTO review_requests (activity_id, athlete_id, coach_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [activityId, req.user.id, c.coach_id]
      );
      created.push(camel(row));
      await createNotification({
        userId: c.coach_id,
        type: 'review_request',
        title: 'New activity review request',
        body: `${req.user.firstName} requested a review of ${activity.name || 'an activity'}.`,
        data: { activityId, requestId: row.id },
      });
    }
    res.status(201).json({ requests: created });
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
    if (!(await assigned(req.user.id, activity.athleteId))) {
      return res.status(403).json({ message: 'Not assigned to this athlete' });
    }

    const athlete = camel(await one('SELECT * FROM users WHERE id = $1', [activity.athleteId]));
    const insights = analyzeActivity(activity, athlete);

    const review = camel(
      await one(
        `INSERT INTO activity_reviews (
           activity_id, coach_id, athlete_id, request_id, initiated_by,
           performance_summary, strengths, improvements, technique, recommendations,
           recovery_advice, comments, rating, coach_insights, status, published_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
         ON CONFLICT (activity_id, coach_id) DO UPDATE SET
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
         WHERE activity_id = $1 AND status = 'pending'`,
        [activityId]
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
    const athlete = camel(await one('SELECT * FROM users WHERE id = $1', [activity.athleteId]));
    res.json({ insights: analyzeActivity(activity, athlete) });
  })
);

export default router;
