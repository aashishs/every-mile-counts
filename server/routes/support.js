import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();
router.use(protect);

router.get(
  '/',
  requireMembership,
  asyncHandler(async (req, res) => {
    const tickets = camelMany(
      await many(
        req.user.roles.includes('app_admin')
          ? `SELECT t.*, u.email, u.first_name, u.last_name
             FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id
             ORDER BY t.created_at DESC LIMIT 100`
          : `SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC`,
        req.user.roles.includes('app_admin') ? [] : [req.user.id]
      )
    );
    res.json({ tickets });
  })
);

router.post(
  '/',
  requireMembership,
  asyncHandler(async (req, res) => {
    const { subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ message: 'Subject and body required' });
    const ticket = camel(
      await one(
        `INSERT INTO support_tickets (user_id, subject, body) VALUES ($1,$2,$3) RETURNING *`,
        [req.user.id, subject, body]
      )
    );
    res.status(201).json({ ticket });
  })
);

router.patch(
  '/:id',
  requireRole('app_admin'),
  asyncHandler(async (req, res) => {
    const { status, assignedTo } = req.body;
    const ticket = camel(
      await one(
        `UPDATE support_tickets SET
           status = COALESCE($1, status),
           assigned_to = COALESCE($2, assigned_to),
           updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [status || null, assignedTo || null, req.params.id]
      )
    );
    res.json({ ticket });
  })
);

export default router;
