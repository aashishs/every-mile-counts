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
    const isAdmin = req.user.roles.includes('app_admin');
    const pageSizes = [10, 20, 50, 100];
    const parsedLimit = pageSizes.includes(Number(req.query.limit)) ? Number(req.query.limit) : 10;
    const parsedPage = Math.max(1, Number(req.query.page) || 1);
    const allowed = isAdmin ? ['date', 'subject', 'status', 'name'] : ['date', 'subject', 'status'];
    const sortKey = allowed.includes(String(req.query.sort || '')) ? String(req.query.sort) : 'date';
    const dirSql = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderSql = {
      subject: `LOWER(t.subject) ${dirSql} NULLS LAST, t.created_at DESC`,
      status: `t.status ${dirSql}, t.created_at DESC`,
      name: `LOWER(COALESCE(u.last_name,'')) ${dirSql} NULLS LAST, LOWER(COALESCE(u.first_name,'')) ${dirSql}, t.created_at DESC`,
      date: `t.created_at ${dirSql} NULLS LAST`,
    }[sortKey];

    const count = await one(
      isAdmin
        ? `SELECT COUNT(*)::int AS total FROM support_tickets t`
        : `SELECT COUNT(*)::int AS total FROM support_tickets t WHERE t.user_id = $1`,
      isAdmin ? [] : [req.user.id]
    );
    const total = count.total;
    const pages = Math.max(1, Math.ceil(total / parsedLimit) || 1);
    const safePage = Math.min(parsedPage, pages);
    const offset = (safePage - 1) * parsedLimit;
    const tickets = camelMany(
      await many(
        isAdmin
          ? `SELECT t.*, u.email, u.first_name, u.last_name
             FROM support_tickets t
             LEFT JOIN users u ON u.id = t.user_id
             ORDER BY ${orderSql}
             LIMIT $1 OFFSET $2`
          : `SELECT t.*
             FROM support_tickets t
             WHERE t.user_id = $1
             ORDER BY ${orderSql}
             LIMIT $2 OFFSET $3`,
        isAdmin ? [parsedLimit, offset] : [req.user.id, parsedLimit, offset]
      )
    );
    res.json({
      tickets,
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
