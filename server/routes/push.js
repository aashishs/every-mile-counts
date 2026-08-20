import express from 'express';
import { query } from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { isPushConfigured } from '../services/pushService.js';
import { isStaffUser } from '../utils/staff.js';

const router = express.Router();

router.get('/vapid-public-key', protect, (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null, configured: isPushConfigured() });
});

router.post(
  '/subscribe',
  protect,
  asyncHandler(async (req, res) => {
    if (isStaffUser(req.user)) {
      return res.status(204).end();
    }
    const clubOnly =
      req.user.roles.includes('club_admin') &&
      !req.user.roles.includes('athlete') &&
      !req.user.roles.includes('coach');
    if (clubOnly) return res.status(204).end();

    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ message: 'Invalid push subscription' });
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`,
      [req.user.id, endpoint, JSON.stringify(keys)]
    );
    res.status(201).json({ message: 'Subscribed' });
  })
);

export { sendPushToUser } from '../services/pushService.js';
export default router;
