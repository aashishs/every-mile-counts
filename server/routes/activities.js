import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole } from '../middleware/auth.js';
import { analyzeActivity, athleteDashboard, periodAnalysis } from '../services/analysisService.js';
import { syncUserActivities } from '../services/syncService.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();
router.use(protect, requireMembership);

async function canViewAthlete(req, athleteId) {
  if (req.user.id === athleteId) return true;
  if (req.user.roles.includes('app_admin')) return true;
  if (req.user.roles.includes('coach')) {
    const assignment = await one(
      `SELECT id FROM coach_assignments WHERE athlete_id = $1 AND coach_id = $2 AND status = 'active'`,
      [athleteId, req.user.id]
    );
    return Boolean(assignment);
  }
  return false;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { type, startDate, endDate, page = 1, limit = 20, athleteId } = req.query;
    const ownerId = athleteId || req.user.id;
    if (!(await canViewAthlete(req, ownerId))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const filters = ['athlete_id = $1'];
    const params = [ownerId];
    let i = 2;
    if (type && type !== 'all') {
      const family = activityTypeSql(type);
      if (family.params.length) {
        filters.push(family.clause.replace(/\$n/g, `$${i}`));
        params.push(...family.params);
        i += family.params.length;
      } else {
        filters.push(family.clause);
      }
    }
    if (startDate) {
      filters.push(`start_date >= $${i++}`);
      params.push(startDate);
    }
    if (endDate) {
      filters.push(`start_date <= $${i++}`);
      params.push(endDate);
    }
    const where = filters.join(' AND ');
    const offset = (Number(page) - 1) * Number(limit);
    const count = await one(`SELECT COUNT(*)::int AS total FROM activities WHERE ${where}`, params);
    const activities = camelMany(
      await many(
        `SELECT a.*, e.name AS event_name, e.event_date
         FROM activities a
         LEFT JOIN events e ON e.id = a.event_id
         WHERE ${where}
         ORDER BY a.start_date DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, Number(limit), offset]
      )
    );
    res.json({
      activities,
      total: count.total,
      page: Number(page),
      pages: Math.ceil(count.total / Number(limit)),
    });
  })
);

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const data = await athleteDashboard(req.user.id, req.user, { type: req.query.type });
    res.json(data);
  })
);

router.get(
  '/analysis',
  asyncHandler(async (req, res) => {
    const data = await periodAnalysis(req.user.id, req.query.period || 30, { type: req.query.type });
    res.json(data);
  })
);

router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const result = await syncUserActivities(req.user.id, { full: true });
    res.json(result);
  })
);

router.get(
  '/athlete/:athleteId',
  requireRole('coach', 'app_admin'),
  asyncHandler(async (req, res) => {
    if (!(await canViewAthlete(req, req.params.athleteId))) {
      return res.status(403).json({ message: 'Not assigned to this athlete' });
    }
    const activities = camelMany(
      await many(
        `SELECT * FROM activities WHERE athlete_id = $1 ORDER BY start_date DESC LIMIT 50`,
        [req.params.athleteId]
      )
    );
    const analysis = await periodAnalysis(req.params.athleteId, 30);
    res.json({ activities, analysis });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const activity = camel(
      await one(
        `SELECT a.*, u.first_name, u.last_name, u.email, u.max_heart_rate
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

    const insights = analyzeActivity(activity, { maxHeartRate: activity.maxHeartRate || req.user.maxHeartRate });
    const isCoach = req.user.roles.includes('coach') && req.user.id !== activity.athleteId;

    const reviews = camelMany(
      await many(
        `SELECT r.*, u.first_name AS coach_first_name, u.last_name AS coach_last_name
         FROM activity_reviews r
         JOIN users u ON u.id = r.coach_id
         WHERE r.activity_id = $1 AND r.status = 'published'`,
        [activity.id]
      )
    );

    const requests = camelMany(
      await many(
        `SELECT * FROM review_requests WHERE activity_id = $1 ORDER BY requested_at DESC`,
        [activity.id]
      )
    );

    res.json({
      activity,
      insights: isCoach || req.user.roles.includes('app_admin') ? insights : undefined,
      athleteInsights: req.user.id === activity.athleteId ? {
        summary: insights.summary,
        pace: insights.pace,
        recoveryRecommendation: insights.recoveryRecommendation,
      } : undefined,
      reviews: req.user.id === activity.athleteId || isCoach || req.user.roles.includes('app_admin') ? reviews : [],
      requests,
    });
  })
);

function activityTypeSql(type) {
  const blob = `LOWER(COALESCE(type,'') || ' ' || COALESCE(sport_type,''))`;
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
  return map[type] || { clause: 'type = $n', params: [type] };
}

export default router;
