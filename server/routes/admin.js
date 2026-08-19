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
    let sql = `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.created_at, u.last_login_at,
                 ARRAY_REMOVE(ARRAY_AGG(DISTINCT ur.role), NULL) AS roles,
                 BOOL_OR(oc.connected) AS strava_connected,
                 MAX(oc.last_sync_at) AS last_sync_at,
                 MAX(oc.last_sync_status) AS last_sync_status,
                 MAX(oc.last_sync_error) AS last_sync_error,
                 (SELECT COUNT(*) FROM activities a WHERE a.athlete_id = u.id)::int AS activity_count
               FROM users u
               LEFT JOIN user_roles ur ON ur.user_id = u.id
               LEFT JOIN oauth_connections oc ON oc.user_id = u.id AND oc.provider = 'strava'
               WHERE u.status <> 'deleted'`;
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`;
    }
    if (status) {
      params.push(status);
      sql += ` AND u.status = $${params.length}`;
    }
    sql += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200';
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
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user = camel(await one('SELECT * FROM users WHERE id = $1', [req.params.id]));
    if (!user || user.status === 'deleted') return res.status(404).json({ message: 'User not found' });
    const roles = (await many(`SELECT role FROM user_roles WHERE user_id = $1`, [user.id])).map((r) => r.role);
    const strava = camel(
      await one(
        `SELECT connected, last_sync_at, last_sync_status, last_sync_error, provider_user_id, expires_at
         FROM oauth_connections WHERE user_id = $1 AND provider = 'strava'`,
        [user.id]
      )
    );
    const clubs = camelMany(
      await many(
        `SELECT c.id, c.name, cm.role, cm.status
         FROM club_members cm JOIN clubs c ON c.id = cm.club_id
         WHERE cm.user_id = $1 AND cm.status IN ('active', 'pending')
         ORDER BY c.name`,
        [user.id]
      )
    );
    const coaches = camelMany(
      await many(
        `SELECT ca.id, ca.status, ca.club_id, u.id AS coach_id, u.first_name, u.last_name, u.email, c.name AS club_name
         FROM coach_assignments ca
         JOIN users u ON u.id = ca.coach_id
         LEFT JOIN clubs c ON c.id = ca.club_id
         WHERE ca.athlete_id = $1 AND ca.status = 'active'
         ORDER BY u.last_name`,
        [user.id]
      )
    );
    const athletes = camelMany(
      await many(
        `SELECT ca.id, u.id AS athlete_id, u.first_name, u.last_name, u.email, c.name AS club_name
         FROM coach_assignments ca
         JOIN users u ON u.id = ca.athlete_id
         LEFT JOIN clubs c ON c.id = ca.club_id
         WHERE ca.coach_id = $1 AND ca.status = 'active'
         ORDER BY u.last_name`,
        [user.id]
      )
    );
    const totals = camel(
      await one(
        `SELECT COUNT(*)::int AS activities,
                COALESCE(SUM(distance), 0)::float AS distance_m,
                MAX(start_date) AS last_activity_at
         FROM activities WHERE athlete_id = $1`,
        [user.id]
      )
    );
    const recent = camelMany(
      await many(
        `SELECT id, name, type, sport_type, distance, moving_time, start_date
         FROM activities WHERE athlete_id = $1
         ORDER BY start_date DESC NULLS LAST LIMIT 8`,
        [user.id]
      )
    );
    const { passwordHash: _pw, ...safeUser } = user;
    res.json({
      user: { ...safeUser, roles },
      strava: strava || { connected: false },
      clubs,
      coaches,
      athletes,
      totals,
      recent,
    });
  })
);

router.post(
  '/users/:id/sync',
  asyncHandler(async (req, res) => {
    const { syncUserActivities } = await import('../services/syncService.js');
    try {
      const result = await syncUserActivities(req.params.id, { full: true, notify: true });
      await writeAudit({
        userId: req.user.id,
        action: 'admin_sync_user',
        entityType: 'user',
        entityId: req.params.id,
        metadata: result,
      });
      res.json(result);
    } catch (err) {
      return res.status(400).json({ message: err.message || 'Sync failed' });
    }
  })
);

router.post(
  '/users/:id/club',
  asyncHandler(async (req, res) => {
    const { clubId, role = 'member' } = req.body;
    if (!clubId) return res.status(400).json({ message: 'clubId is required' });
    if (!['member', 'coach', 'club_admin'].includes(role)) {
      return res.status(400).json({ message: 'Role must be member, coach, or club_admin' });
    }
    const user = camel(await one('SELECT * FROM users WHERE id = $1 AND status <> $2', [req.params.id, 'deleted']));
    const club = camel(await one('SELECT * FROM clubs WHERE id = $1', [clubId]));
    if (!user || !club) return res.status(404).json({ message: 'User or club not found' });
    if (role === 'coach') {
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach') ON CONFLICT DO NOTHING`, [user.id]);
    }
    if (role === 'member') {
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'athlete') ON CONFLICT DO NOTHING`, [user.id]);
    }
    await query(
      `INSERT INTO club_members (club_id, user_id, role, status, approved_at)
       VALUES ($1, $2, $3, 'active', NOW())
       ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', approved_at = NOW()`,
      [club.id, user.id, role]
    );
    if (role === 'coach') {
      await query(`UPDATE clubs SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'pending_coach'`, [
        club.id,
      ]);
    }
    await writeAudit({
      userId: req.user.id,
      action: 'admin_add_club_member',
      entityType: 'club',
      entityId: club.id,
      metadata: { userId: user.id, role },
    });
    res.json({ message: `${user.email} added to ${club.name} as ${role}` });
  })
);

router.delete(
  '/users/:id/club/:clubId',
  asyncHandler(async (req, res) => {
    await query(
      `UPDATE club_members SET status = 'left' WHERE club_id = $1 AND user_id = $2`,
      [req.params.clubId, req.params.id]
    );
    await query(
      `UPDATE coach_assignments SET status = 'inactive'
       WHERE club_id = $1 AND (athlete_id = $2 OR coach_id = $2) AND status = 'active'`,
      [req.params.clubId, req.params.id]
    );
    res.json({ message: 'Removed from club' });
  })
);

router.post(
  '/assign',
  asyncHandler(async (req, res) => {
    const { athleteId, coachId, clubId } = req.body;
    if (!athleteId || !coachId) return res.status(400).json({ message: 'athleteId and coachId are required' });
    const countRow = await one(
      `SELECT COUNT(*)::int AS count FROM coach_assignments WHERE athlete_id = $1 AND status = 'active' AND coach_id <> $2`,
      [athleteId, coachId]
    );
    if (countRow.count >= 3) {
      return res.status(400).json({ message: 'Maximum of three coaches per athlete' });
    }
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach') ON CONFLICT DO NOTHING`, [coachId]);
    await query(
      `INSERT INTO coach_assignments (athlete_id, coach_id, club_id, assigned_by, status)
       VALUES ($1,$2,$3,$4,'active')
       ON CONFLICT (athlete_id, coach_id) DO UPDATE SET status = 'active', club_id = COALESCE(EXCLUDED.club_id, coach_assignments.club_id)`,
      [athleteId, coachId, clubId || null, req.user.id]
    );
    await writeAudit({
      userId: req.user.id,
      action: 'admin_assign_coach',
      entityType: 'user',
      entityId: athleteId,
      metadata: { coachId, clubId },
    });
    res.json({ message: 'Coach assigned' });
  })
);

router.delete(
  '/assign/:id',
  asyncHandler(async (req, res) => {
    await query(`UPDATE coach_assignments SET status = 'inactive' WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Assignment removed' });
  })
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own admin account' });
    }
    const user = camel(await one('SELECT * FROM users WHERE id = $1', [req.params.id]));
    if (!user) return res.status(404).json({ message: 'User not found' });
    await query(`UPDATE clubs SET created_by = NULL WHERE created_by = $1`, [user.id]);
    await query(`UPDATE invitation_codes SET created_by = NULL WHERE created_by = $1`, [user.id]);
    await query(`UPDATE club_announcements SET author_id = NULL WHERE author_id = $1`, [user.id]);
    await query(`UPDATE coach_assignments SET assigned_by = NULL WHERE assigned_by = $1`, [user.id]);
    await query(`UPDATE support_tickets SET assigned_to = NULL WHERE assigned_to = $1`, [user.id]);
    await query(`DELETE FROM events WHERE owner_type = 'athlete' AND owner_id = $1`, [user.id]);
    await query(`DELETE FROM users WHERE id = $1`, [user.id]);
    await writeAudit({
      userId: req.user.id,
      action: 'admin_delete_user',
      entityType: 'user',
      entityId: req.params.id,
      metadata: { email: user.email },
    });
    res.json({ message: `Deleted ${user.email} and related data` });
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
