import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const MAX_COACHES = 3;
const router = express.Router();
router.use(protect, requireMembership);

router.get(
  '/my-coaches',
  asyncHandler(async (req, res) => {
    const assignments = camelMany(
      await many(
        `SELECT ca.*, u.first_name, u.last_name, u.email, u.avatar_url, c.name AS club_name
         FROM coach_assignments ca
         JOIN users u ON u.id = ca.coach_id
         LEFT JOIN clubs c ON c.id = ca.club_id
         WHERE ca.athlete_id = $1 AND ca.status = 'active'`,
        [req.user.id]
      )
    );
    res.json({ coaches: assignments, count: assignments.length, max: MAX_COACHES });
  })
);

router.get(
  '/my-athletes',
  requireRole('coach', 'app_admin'),
  asyncHandler(async (req, res) => {
    const athletes = camelMany(
      await many(
        `SELECT ca.*, u.first_name, u.last_name, u.email, u.avatar_url,
                (SELECT COUNT(*) FROM activities a WHERE a.athlete_id = u.id)::int AS activity_count
         FROM coach_assignments ca
         JOIN users u ON u.id = ca.athlete_id
         WHERE ca.coach_id = $1 AND ca.status = 'active'
         ORDER BY u.last_name`,
        [req.user.id]
      )
    );
    res.json({ athletes, count: athletes.length });
  })
);

router.delete(
  '/remove/:coachId',
  asyncHandler(async (req, res) => {
    const assignment = await one(
      `UPDATE coach_assignments SET status = 'inactive'
       WHERE athlete_id = $1 AND coach_id = $2 AND status = 'active'
       RETURNING id`,
      [req.user.id, req.params.coachId]
    );
    if (!assignment) return res.status(404).json({ message: 'Coach assignment not found' });
    res.json({ message: 'Coach removed' });
  })
);

export default router;
