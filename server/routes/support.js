import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { isStaffUser, isSupportStaffUser } from '../utils/staff.js';

const router = express.Router();
router.use(protect);

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    if (!isSupportStaffUser(req.user)) {
      return res.status(403).json({ message: 'Support staff required' });
    }
    const byStatus = camelMany(
      await many(
        `SELECT status, COUNT(*)::int AS count FROM support_tickets GROUP BY status`
      )
    );
    const totals = Object.fromEntries(byStatus.map((r) => [r.status, r.count]));
    const recent = camel(
      await one(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7_days,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30_days,
           COUNT(*) FILTER (WHERE status IN ('resolved', 'closed') AND updated_at >= NOW() - INTERVAL '30 days')::int AS closed_30_days
         FROM support_tickets`
      )
    );
    const avg = camel(
      await one(
        `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::numeric, 1) AS hours
         FROM support_tickets
         WHERE status IN ('resolved', 'closed')`
      )
    );
    const daily = camelMany(
      await many(
        `SELECT created_at::date AS day, COUNT(*)::int AS count
         FROM support_tickets
         WHERE created_at >= NOW() - INTERVAL '14 days'
         GROUP BY created_at::date
         ORDER BY day`
      )
    );
    res.json({
      totals: {
        open: totals.open || 0,
        inProgress: totals.in_progress || 0,
        resolved: totals.resolved || 0,
        closed: totals.closed || 0,
        all: Object.values(totals).reduce((s, n) => s + n, 0),
      },
      last7Days: recent.last7Days,
      last30Days: recent.last30Days,
      closed30Days: recent.closed30Days,
      avgHoursToClose: avg.hours,
      daily,
    });
  })
);

router.get(
  '/',
  requireMembership,
  asyncHandler(async (req, res) => {
    const staff = isSupportStaffUser(req.user);
    const pageSizes = [10, 20, 50, 100];
    const parsedLimit = pageSizes.includes(Number(req.query.limit)) ? Number(req.query.limit) : 10;
    const parsedPage = Math.max(1, Number(req.query.page) || 1);
    const allowed = staff ? ['date', 'subject', 'status', 'name'] : ['date', 'subject', 'status'];
    const sortKey = allowed.includes(String(req.query.sort || '')) ? String(req.query.sort) : 'date';
    const dirSql = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderSql = {
      subject: `LOWER(t.subject) ${dirSql} NULLS LAST, t.created_at DESC`,
      status: `t.status ${dirSql}, t.created_at DESC`,
      name: `LOWER(COALESCE(u.last_name,'')) ${dirSql} NULLS LAST, LOWER(COALESCE(u.first_name,'')) ${dirSql}, t.created_at DESC`,
      date: `t.created_at ${dirSql} NULLS LAST`,
    }[sortKey];

    const count = await one(
      staff
        ? `SELECT COUNT(*)::int AS total FROM support_tickets t`
        : `SELECT COUNT(*)::int AS total FROM support_tickets t WHERE t.user_id = $1`,
      staff ? [] : [req.user.id]
    );
    const total = count.total;
    const pages = Math.max(1, Math.ceil(total / parsedLimit) || 1);
    const safePage = Math.min(parsedPage, pages);
    const offset = (safePage - 1) * parsedLimit;
    const tickets = camelMany(
      await many(
        staff
          ? `SELECT t.*, u.email, u.first_name, u.last_name,
                    (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id)::int AS message_count
             FROM support_tickets t
             LEFT JOIN users u ON u.id = t.user_id
             ORDER BY ${orderSql}
             LIMIT $1 OFFSET $2`
          : `SELECT t.*,
                    (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id)::int AS message_count
             FROM support_tickets t
             WHERE t.user_id = $1
             ORDER BY ${orderSql}
             LIMIT $2 OFFSET $3`,
        staff ? [parsedLimit, offset] : [req.user.id, parsedLimit, offset]
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

router.get(
  '/:id',
  requireMembership,
  asyncHandler(async (req, res) => {
    const ticket = camel(
      await one(
        `SELECT t.*, u.email, u.first_name, u.last_name
         FROM support_tickets t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.id = $1`,
        [req.params.id]
      )
    );
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    const staff = isSupportStaffUser(req.user);
    if (!staff && ticket.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const messages = camelMany(
      await many(
        `SELECT m.*, u.first_name, u.last_name, u.email
         FROM support_ticket_messages m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.ticket_id = $1
         ORDER BY m.created_at ASC`,
        [ticket.id]
      )
    );
    res.json({ ticket, messages });
  })
);

router.post(
  '/',
  requireMembership,
  asyncHandler(async (req, res) => {
    if (isStaffUser(req.user)) {
      return res.status(400).json({ message: 'Staff accounts do not open support tickets' });
    }
    const { subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ message: 'Subject and body required' });
    const ticket = camel(
      await one(
        `INSERT INTO support_tickets (user_id, subject, body) VALUES ($1,$2,$3) RETURNING *`,
        [req.user.id, subject, body]
      )
    );
    await query(
      `INSERT INTO support_ticket_messages (ticket_id, user_id, body) VALUES ($1, $2, $3)`,
      [ticket.id, req.user.id, body]
    );
    res.status(201).json({ ticket });
  })
);

router.post(
  '/:id/replies',
  requireMembership,
  asyncHandler(async (req, res) => {
    const ticket = camel(await one('SELECT * FROM support_tickets WHERE id = $1', [req.params.id]));
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    const staff = isSupportStaffUser(req.user);
    if (!staff && ticket.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Reply is required' });
    const message = camel(
      await one(
        `INSERT INTO support_ticket_messages (ticket_id, user_id, body) VALUES ($1, $2, $3) RETURNING *`,
        [ticket.id, req.user.id, body]
      )
    );
    if (staff && ticket.status === 'open') {
      await query(`UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [ticket.id]);
    } else {
      await query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [ticket.id]);
    }
    res.status(201).json({ message });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isSupportStaffUser(req.user)) {
      return res.status(403).json({ message: 'Support staff required' });
    }
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
