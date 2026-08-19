import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../services/auditService.js';
import { createNotification } from '../services/notificationService.js';
import { getUserRoles, grantAthleteUnlessClubAdmin, stripTrainingRolesForClubAdmin } from '../utils/membership.js';
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
                 COALESCE(JSON_AGG(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL), '[]'::json) AS roles,
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
    if (role) users = users.filter((u) => (Array.isArray(u.roles) ? u.roles : []).includes(role));
    res.json({ users });
  })
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { status, roles } = req.body;
    const before = camel(await one('SELECT * FROM users WHERE id = $1', [req.params.id]));
    if (status && before && status === 'suspended' && before.status !== 'suspended') {
      await createNotification({
        userId: req.params.id,
        type: 'membership',
        title: 'Account suspended',
        body: 'An admin suspended your account.',
        data: { status },
      });
    }
    if (status) {
      await query(`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
    }
    if (Array.isArray(roles)) {
      let nextRoles = roles.filter(Boolean);
      if (nextRoles.includes('club_admin')) {
        nextRoles = nextRoles.filter((r) => r !== 'athlete' && r !== 'coach');
      }
      await query(`DELETE FROM user_roles WHERE user_id = $1`, [req.params.id]);
      for (const role of nextRoles) {
        await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
          req.params.id,
          role,
        ]);
      }
      if (nextRoles.includes('club_admin')) {
        await stripTrainingRolesForClubAdmin(req.params.id);
      }
    }
    await writeAudit({
      userId: req.user.id,
      action: 'admin_update_user',
      entityType: 'user',
      entityId: req.params.id,
      metadata: { status, roles },
    });
    if (status && before && status === 'active' && before.status !== 'active') {
      await createNotification({
        userId: req.params.id,
        type: 'membership',
        title: 'Account restored',
        body: 'An admin restored your account.',
        data: { status },
      });
    }
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
    const userRoles = await getUserRoles(user.id);
    if (role === 'coach' && userRoles.includes('club_admin')) {
      return res.status(400).json({ message: 'Club admins cannot also be coaches' });
    }
    if (role === 'member' && userRoles.includes('club_admin')) {
      return res.status(400).json({ message: 'Club admins cannot also be athletes' });
    }
    if (role === 'club_admin') {
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'club_admin') ON CONFLICT DO NOTHING`, [user.id]);
      await stripTrainingRolesForClubAdmin(user.id);
    }
    if (role === 'coach') {
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach') ON CONFLICT DO NOTHING`, [user.id]);
      await grantAthleteUnlessClubAdmin(user.id);
    }
    if (role === 'member') {
      await grantAthleteUnlessClubAdmin(user.id);
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
    await createNotification({
      userId: user.id,
      type: 'club',
      title: `Added to ${club.name}`,
      body: `An admin added you to ${club.name} as ${role === 'coach' ? 'a coach' : role === 'club_admin' ? 'a club admin' : 'an athlete'}.`,
      data: { clubId: club.id },
    });
    res.json({ message: `${user.email} added to ${club.name} as ${role}` });
  })
);

router.delete(
  '/users/:id/club/:clubId',
  asyncHandler(async (req, res) => {
    const club = camel(await one('SELECT name FROM clubs WHERE id = $1', [req.params.clubId]));
    await query(
      `UPDATE club_members SET status = 'left' WHERE club_id = $1 AND user_id = $2`,
      [req.params.clubId, req.params.id]
    );
    await query(
      `UPDATE coach_assignments SET status = 'inactive'
       WHERE club_id = $1 AND (athlete_id = $2 OR coach_id = $2) AND status = 'active'`,
      [req.params.clubId, req.params.id]
    );
    await createNotification({
      userId: req.params.id,
      type: 'club',
      title: club ? `Removed from ${club.name}` : 'Removed from club',
      body: club ? `An admin removed you from ${club.name}.` : 'An admin removed you from a club.',
      data: { clubId: req.params.clubId },
    });
    res.json({ message: 'Removed from club' });
  })
);

router.post(
  '/assign',
  asyncHandler(async (req, res) => {
    const { athleteId, coachId, clubId } = req.body;
    if (!athleteId || !coachId) return res.status(400).json({ message: 'athleteId and coachId are required' });
    const athleteRoles = await getUserRoles(athleteId);
    const coachRoles = await getUserRoles(coachId);
    if (athleteRoles.includes('club_admin')) {
      return res.status(400).json({ message: 'Club admins cannot be assigned as athletes' });
    }
    if (coachRoles.includes('club_admin')) {
      return res.status(400).json({ message: 'Club admins cannot be assigned as coaches' });
    }
    const countRow = await one(
      `SELECT COUNT(*)::int AS count FROM coach_assignments WHERE athlete_id = $1 AND status = 'active' AND coach_id <> $2`,
      [athleteId, coachId]
    );
    if (countRow.count >= 3) {
      return res.status(400).json({ message: 'Maximum of three coaches per athlete' });
    }
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach') ON CONFLICT DO NOTHING`, [coachId]);
    await grantAthleteUnlessClubAdmin(coachId);
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
    await createNotification({
      userId: athleteId,
      type: 'club',
      title: 'Coach assigned',
      body: 'An admin assigned a coach to you.',
      data: { coachId, clubId },
    });
    await createNotification({
      userId: coachId,
      type: 'club',
      title: 'New athlete assigned',
      body: 'An admin assigned an athlete to you.',
      data: { athleteId, clubId },
    });
    res.json({ message: 'Coach assigned' });
  })
);

router.delete(
  '/assign/:id',
  asyncHandler(async (req, res) => {
    const row = camel(
      await one(
        `UPDATE coach_assignments SET status = 'inactive' WHERE id = $1 RETURNING athlete_id, coach_id, club_id`,
        [req.params.id]
      )
    );
    if (row?.athleteId) {
      await createNotification({
        userId: row.athleteId,
        type: 'club',
        title: 'Coach unassigned',
        body: 'An admin removed a coach assignment.',
        data: { coachId: row.coachId, clubId: row.clubId },
      });
    }
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
    if (user.status !== 'suspended') {
      return res.status(400).json({ message: 'Suspend this account before deleting it.' });
    }
    await query(`UPDATE clubs SET created_by = NULL WHERE created_by = $1`, [user.id]);
    await query(`UPDATE invitation_codes SET created_by = NULL WHERE created_by = $1`, [user.id]);
    await query(`UPDATE club_announcements SET author_id = NULL WHERE author_id = $1`, [user.id]);
    await query(`UPDATE coach_assignments SET assigned_by = NULL WHERE assigned_by = $1`, [user.id]);
    await query(`UPDATE support_tickets SET assigned_to = NULL WHERE assigned_to = $1`, [user.id]);
    await query(`DELETE FROM invitation_redemptions WHERE user_id = $1`, [user.id]);
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
           (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.id AND cm.status = 'active')::int AS member_count,
           (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.id AND cm.status = 'active' AND cm.role = 'member')::int AS athlete_count
         FROM clubs c ORDER BY c.created_at DESC`
      )
    );
    res.json({ clubs });
  })
);

router.get(
  '/clubs/:id',
  asyncHandler(async (req, res) => {
    const club = camel(await one('SELECT * FROM clubs WHERE id = $1', [req.params.id]));
    if (!club) return res.status(404).json({ message: 'Club not found' });
    const members = camelMany(
      await many(
        `SELECT cm.id, cm.role, cm.status, cm.requested_at, cm.approved_at,
                u.id AS user_id, u.first_name, u.last_name, u.email, u.status AS user_status,
                COALESCE(ARRAY_AGG(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS user_roles,
                BOOL_OR(oc.connected) FILTER (WHERE oc.provider = 'strava') AS strava_connected,
                (SELECT COUNT(*) FROM activities a WHERE a.athlete_id = u.id)::int AS activity_count
         FROM club_members cm
         JOIN users u ON u.id = cm.user_id
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN oauth_connections oc ON oc.user_id = u.id AND oc.provider = 'strava'
         WHERE cm.club_id = $1 AND u.status <> 'deleted'
         GROUP BY cm.id, u.id
         ORDER BY cm.role, u.last_name, u.first_name`,
        [req.params.id]
      )
    );
    res.json({ club, members });
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
  '/audit/days',
  asyncHandler(async (req, res) => {
    const tz = safeTz(req.query.tz);
    const days = camelMany(
      await many(
        `SELECT (created_at AT TIME ZONE $1)::date AS day, COUNT(*)::int AS count
         FROM audit_logs
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT 90`,
        [tz]
      )
    );
    res.json({
      tz,
      days: days.map((d) => ({
        day: formatDay(d.day),
        count: d.count,
      })),
    });
  })
);

router.get(
  '/audit/slots',
  asyncHandler(async (req, res) => {
    const tz = safeTz(req.query.tz);
    const day = String(req.query.day || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({ message: 'Pick a day first' });
    }
    const rows = camelMany(
      await many(
        `SELECT (FLOOR(EXTRACT(HOUR FROM created_at AT TIME ZONE $1) / 4)::int * 4) AS slot,
                COUNT(*)::int AS count
         FROM audit_logs
         WHERE created_at >= ($2::timestamp AT TIME ZONE $1)
           AND created_at < ((($2::date) + 1)::timestamp AT TIME ZONE $1)
         GROUP BY 1
         ORDER BY 1 ASC`,
        [tz, day]
      )
    );
    const counts = Object.fromEntries(rows.map((r) => [Number(r.slot), r.count]));
    const slots = [0, 4, 8, 12, 16, 20].map((slot) => ({ slot, count: counts[slot] || 0 }));
    res.json({ tz, day, slots });
  })
);

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const tz = safeTz(req.query.tz);
    const day = String(req.query.day || '').slice(0, 10);
    const slot = Number(req.query.slot);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || ![0, 4, 8, 12, 16, 20].includes(slot)) {
      return res.status(400).json({ message: 'Pick a day and a 4-hour slot first' });
    }
    const logs = camelMany(
      await many(
        `SELECT a.*, u.email FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.created_at >= (($1::date + ($2::int * INTERVAL '1 hour')) AT TIME ZONE $3)
           AND a.created_at < (($1::date + (($2::int + 4) * INTERVAL '1 hour')) AT TIME ZONE $3)
         ORDER BY a.created_at DESC
         LIMIT 500`,
        [day, slot, tz]
      )
    );
    res.json({ tz, day, slot, logs });
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
    if (membership?.userId) {
      await createNotification({
        userId: membership.userId,
        type: 'membership',
        title: 'Membership updated',
        body: status ? `An admin set your membership to ${String(status).replace(/_/g, ' ')}.` : 'An admin updated your membership.',
        data: { membershipId: membership.id, status, expiresAt },
      });
    }
    res.json({ membership });
  })
);

function safeTz(value) {
  const tz = String(value || 'UTC');
  if (!/^[A-Za-z0-9_+\-/]+$/.test(tz) || tz.length > 64) return 'UTC';
  return tz;
}

function formatDay(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

export default router;
