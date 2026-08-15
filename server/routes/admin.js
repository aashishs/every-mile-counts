import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../services/auditService.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();
router.use(protect, requireRole('app_admin'));

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const users = await one(`SELECT COUNT(*)::int AS count FROM users WHERE status <> 'deleted'`);
    const clubs = await one(`SELECT COUNT(*)::int AS count FROM clubs`);
    const activities = await one(`SELECT COUNT(*)::int AS count FROM activities`);
    const memberships = await one(
      `SELECT COUNT(*)::int AS active FROM memberships WHERE status IN ('active','expiring_soon') AND user_id IS NOT NULL`
    );
    const byRole = camelMany(
      await many(`SELECT role, COUNT(*)::int AS count FROM user_roles GROUP BY role`)
    );
    res.json({
      users: users.count,
      clubs: clubs.count,
      activities: activities.count,
      activeMemberships: memberships.active,
      byRole,
    });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { q, role, status } = req.query;
    const params = [];
    let sql = `SELECT u.*, ARRAY_AGG(ur.role) AS roles
               FROM users u
               LEFT JOIN user_roles ur ON ur.user_id = u.id
               WHERE u.status <> 'deleted'`;
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`;
    }
    if (status) {
      params.push(status);
      sql += ` AND u.status = $${params.length}`;
    }
    sql += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100';
    let users = camelMany(await many(sql, params));
    if (role) users = users.filter((u) => (u.roles || []).includes(role));
    res.json({ users });
  })
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { status, roles } = req.body;
    if (status) {
      await query(`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
    }
    if (Array.isArray(roles)) {
      await query(`DELETE FROM user_roles WHERE user_id = $1`, [req.params.id]);
      for (const role of roles) {
        await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
          req.params.id,
          role,
        ]);
      }
    }
    await writeAudit({
      userId: req.user.id,
      action: 'admin_update_user',
      entityType: 'user',
      entityId: req.params.id,
      metadata: { status, roles },
    });
    const user = camel(await one('SELECT * FROM users WHERE id = $1', [req.params.id]));
    res.json({ user });
  })
);

router.get(
  '/clubs',
  asyncHandler(async (_req, res) => {
    const clubs = camelMany(
      await many(
        `SELECT c.*,
           (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.id AND cm.status = 'active')::int AS member_count
         FROM clubs c ORDER BY c.created_at DESC`
      )
    );
    res.json({ clubs });
  })
);

router.patch(
  '/clubs/:id',
  asyncHandler(async (req, res) => {
    const { isVerified, status } = req.body;
    const club = camel(
      await one(
        `UPDATE clubs SET
           is_verified = COALESCE($1, is_verified),
           status = COALESCE($2, status),
           updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [isVerified ?? null, status ?? null, req.params.id]
      )
    );
    await writeAudit({
      userId: req.user.id,
      action: 'admin_update_club',
      entityType: 'club',
      entityId: req.params.id,
    });
    res.json({ club });
  })
);

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const rows = await many('SELECT key, value FROM app_settings');
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ settings });
  })
);

router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const entries = Object.entries(req.body || {});
    for (const [key, value] of entries) {
      await query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }
    res.json({ message: 'Settings saved' });
  })
);

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const logs = camelMany(
      await many(
        `SELECT a.*, u.email FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC LIMIT 200`
      )
    );
    res.json({ logs });
  })
);

router.get(
  '/memberships',
  asyncHandler(async (_req, res) => {
    const memberships = camelMany(
      await many(
        `SELECT m.*, u.email, u.first_name, u.last_name, p.name AS plan_name, c.name AS club_name
         FROM memberships m
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN clubs c ON c.id = m.club_id
         LEFT JOIN membership_plans p ON p.id = m.plan_id
         ORDER BY m.created_at DESC LIMIT 200`
      )
    );
    res.json({ memberships });
  })
);

router.patch(
  '/memberships/:id',
  asyncHandler(async (req, res) => {
    const { status, expiresAt } = req.body;
    const membership = camel(
      await one(
        `UPDATE memberships SET status = COALESCE($1, status), expires_at = COALESCE($2, expires_at), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [status || null, expiresAt || null, req.params.id]
      )
    );
    res.json({ membership });
  })
);

export default router;
