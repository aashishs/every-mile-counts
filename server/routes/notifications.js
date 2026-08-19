import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { markAllRead, unreadCount } from '../services/notificationService.js';

const router = express.Router();
router.use(protect);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = camelMany(
      await many(
        `SELECT * FROM notifications WHERE user_id = $1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 50`,
        [req.user.id]
      )
    );
    res.json({ notifications, unread: await unreadCount(req.user.id) });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ unread: await unreadCount(req.user.id) });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await markAllRead(req.user.id);
    res.json({ message: 'All notifications marked read' });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const row = await one(
      `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    res.json({ notification: camel(row) });
  })
);

export default router;
