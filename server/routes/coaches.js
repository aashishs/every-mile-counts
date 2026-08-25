import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole, rejectAppAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { ageFromDob, mafHeartRate } from '../utils/maf.js';
import { createNotification } from '../services/notificationService.js';
import { MAX_COACHES } from '../utils/limits.js';
import { assertCoachSlot } from '../utils/invites.js';
import { getUserRoles } from '../utils/membership.js';
import { STRAVA_COACH_SHARE_SQL } from '../utils/stravaShare.js';

const router = express.Router();
router.use(protect, requireMembership, rejectAppAdmin);

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
  '/available',
  asyncHandler(async (req, res) => {
    const coaches = camelMany(
      await many(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.avatar_url,
                c.id AS club_id, c.name AS club_name
         FROM club_members me
         JOIN clubs c ON c.id = me.club_id
         JOIN club_members cm ON cm.club_id = me.club_id AND cm.status = 'active'
           AND (
             cm.role = 'coach'
             OR (cm.role = 'club_admin' AND c.head_coach_user_id = cm.user_id)
           )
         JOIN users u ON u.id = cm.user_id
         WHERE me.user_id = $1 AND me.status = 'active' AND me.role = 'member'
           AND u.id <> $1
           AND NOT EXISTS (
             SELECT 1 FROM coach_assignments ca
             WHERE ca.athlete_id = $1 AND ca.coach_id = u.id AND ca.status = 'active'
           )
         ORDER BY u.last_name, u.first_name`,
        [req.user.id]
      )
    );
    res.json({ coaches });
  })
);

router.post(
  '/add',
  asyncHandler(async (req, res) => {
    const { coachId, email } = req.body;
    if (!coachId && !email) {
      return res.status(400).json({ message: 'Choose a coach or enter their email' });
    }
    const coach = camel(
      await one(
        coachId
          ? `SELECT u.* FROM users u JOIN user_roles ur ON ur.user_id = u.id
             WHERE u.id = $1 AND ur.role = 'coach' AND u.status = 'active'`
          : `SELECT u.* FROM users u JOIN user_roles ur ON ur.user_id = u.id
             WHERE LOWER(u.email) = LOWER($1) AND ur.role = 'coach' AND u.status = 'active'`,
        [coachId || email]
      )
    );
    if (!coach) return res.status(404).json({ message: 'Coach not found' });
    if (coach.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot add yourself as a coach' });
    }
    await assertCoachSlot(req.user.id, { coachId: coach.id });
    const sharedClub = camel(
      await one(
        `SELECT me.club_id
         FROM club_members me
         JOIN clubs c ON c.id = me.club_id
         JOIN club_members cm ON cm.club_id = me.club_id AND cm.user_id = $2 AND cm.status = 'active'
           AND (
             cm.role = 'coach'
             OR (cm.role = 'club_admin' AND c.head_coach_user_id = cm.user_id)
           )
         WHERE me.user_id = $1 AND me.status = 'active'
         LIMIT 1`,
        [req.user.id, coach.id]
      )
    );
    const coachRoles = await getUserRoles(coach.id);
    if (coachRoles.includes('club_admin') && !sharedClub) {
      return res.status(400).json({ message: 'This coach only works with athletes in their club' });
    }
    await query(
      `INSERT INTO coach_assignments (athlete_id, coach_id, club_id, assigned_by, status)
       VALUES ($1,$2,$3,$4,'active')
       ON CONFLICT (athlete_id, coach_id) DO UPDATE SET status = 'active', club_id = EXCLUDED.club_id, assigned_by = EXCLUDED.assigned_by`,
      [req.user.id, coach.id, sharedClub?.clubId || null, req.user.id]
    );
    await createNotification({
      userId: coach.id,
      type: 'club',
      title: 'New athlete',
      body: `${req.user.firstName} ${req.user.lastName} added you as their coach.`,
      data: { athleteId: req.user.id },
    });
    res.json({ message: 'Coach added' });
  })
);

router.get(
  '/my-athletes',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const pageSizes = [10, 20, 50, 100];
    const limit = pageSizes.includes(Number(req.query.limit)) ? Number(req.query.limit) : 10;
    const page = Math.max(1, Number(req.query.page) || 1);
    const sortKey = ['name', 'lastActivity', 'activities'].includes(String(req.query.sort))
      ? String(req.query.sort)
      : 'name';
    const dir = String(req.query.dir).toLowerCase() === 'desc' ? 'desc' : 'asc';
    const athleteId = String(req.query.athleteId || '').trim();

    const orderSql = {
      name: dir === 'desc' ? 'last_name DESC, first_name DESC' : 'last_name ASC, first_name ASC',
      lastActivity:
        dir === 'asc'
          ? 'last_activity_at ASC NULLS LAST, last_name ASC'
          : 'last_activity_at DESC NULLS LAST, last_name ASC',
      activities:
        dir === 'asc' ? 'activity_count ASC, last_name ASC' : 'activity_count DESC, last_name ASC',
    }[sortKey];

    const where = ['ca.coach_id = $1', `ca.status = 'active'`];
    const params = [req.user.id];
    if (athleteId) {
      where.push(`u.id = $2`);
      params.push(athleteId);
    }

    const fromSql = `
      FROM coach_assignments ca
      JOIN users u ON u.id = ca.athlete_id
      WHERE ${where.join(' AND ')}
    `;
    const selectSql = `
      SELECT ca.athlete_id, ca.club_id, u.first_name, u.last_name, u.email, u.avatar_url,
             u.date_of_birth, u.age, u.maf_heart_rate,
             (SELECT COUNT(*) FROM activities a WHERE a.athlete_id = u.id AND ${STRAVA_COACH_SHARE_SQL})::int AS activity_count,
             (SELECT MAX(a.start_date) FROM activities a WHERE a.athlete_id = u.id AND ${STRAVA_COACH_SHARE_SQL}) AS last_activity_at
      ${fromSql}
    `;

    if (athleteId) {
      const row = withAthleteMaf(camel(await one(selectSql, params)));
      return res.json({ athletes: row ? [row] : [], count: row ? 1 : 0 });
    }

    const count = await one(`SELECT COUNT(*)::int AS total ${fromSql}`, params);
    const total = count.total;
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * limit;
    const athletes = camelMany(
      await many(
        `${selectSql} ORDER BY ${orderSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      )
    ).map(withAthleteMaf);
    res.json({
      athletes,
      total,
      page: safePage,
      pages,
      limit,
      sort: sortKey,
      dir,
    });
  })
);

router.delete(
  '/athletes/:athleteId',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    const assignment = camel(
      await one(
        `UPDATE coach_assignments SET status = 'inactive'
         WHERE coach_id = $1 AND athlete_id = $2 AND status = 'active'
         RETURNING *`,
        [req.user.id, req.params.athleteId]
      )
    );
    if (!assignment) return res.status(404).json({ message: 'Athlete is not on your coaching list' });
    res.json({ message: 'Athlete removed from your coaching list' });
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

function withAthleteMaf(row) {
  if (!row) return row;
  const age = ageFromDob(row.dateOfBirth) ?? row.age ?? null;
  return {
    ...row,
    age,
    mafHeartRate: mafHeartRate(age) ?? row.mafHeartRate ?? null,
  };
}
