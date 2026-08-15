import express from 'express';
import webpush from 'web-push';
import { one, query } from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@everymilecounts.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

router.get('/vapid-public-key', protect, (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

router.post(
  '/subscribe',
  protect,
  asyncHandler(async (req, res) => {
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

export async function sendPushToUser(userId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  const { many } = await import('../config/db.js');
  const subs = await many(`SELECT * FROM push_subscriptions WHERE user_id = $1`, [userId]);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
        }
      }
    })
  );
}

export default router;
