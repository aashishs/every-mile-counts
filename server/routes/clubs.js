import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, rejectAppAdmin } from '../middleware/auth.js';
import { getClubMembership, isMembershipUsable, getUserRoles } from '../utils/membership.js';
import { createNotification, notifyMany } from '../services/notificationService.js';
import { slugify } from '../utils/format.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();
router.use(protect, requireMembership, rejectAppAdmin);

const MAX_COACHES = 3;

async function membership(userId, clubId) {
  return camel(
    await one(
      `SELECT * FROM club_members WHERE club_id = $1 AND user_id = $2`,
      [clubId, userId]
    )
  );
}

async function isClubCoach(userId, clubId) {
  const m = await membership(userId, clubId);
  if (!m || m.status !== 'active') return false;
  if (m.role === 'coach') return true;
  if (m.role === 'club_admin') {
    const roles = await getUserRoles(userId);
    return roles.includes('coach');
  }
  return false;
}

async function requireClubAdmin(req, clubId) {
  if (req.user.roles.includes('app_admin')) return true;
  const m = await membership(req.user.id, clubId);
  return m?.role === 'club_admin' && m.status === 'active';
}

async function clubWritable(clubId) {
  const club = camel(await one('SELECT * FROM clubs WHERE id = $1', [clubId]));
  if (!club) return { ok: false, status: 404, message: 'Club not found' };
  const mem = await getClubMembership(clubId);
  if (!isMembershipUsable(mem?.status) || club.status === 'read_only') {
    return { ok: false, status: 402, message: 'Club is in read-only mode until membership is renewed', club, membership: mem };
  }
  return { ok: true, club, membership: mem };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const isAdmin = req.user.roles.includes('app_admin');
    if (!isAdmin && q.length < 2) {
      return res.json({ clubs: [] });
    }
    const params = [];
    let sql = `SELECT c.id, c.name, c.location, c.description, c.is_verified, c.status,
        (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.id AND cm.status = 'active')::int AS member_count
      FROM clubs c WHERE c.status <> 'suspended'`;
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (c.name ILIKE $1 OR c.location ILIKE $1 OR c.description ILIKE $1)`;
    }
    sql += ' ORDER BY c.name ASC LIMIT 20';
    const clubs = camelMany(await many(sql, params));
    res.json({ clubs });
  })
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const clubs = camelMany(
      await many(
        `SELECT c.*, cm.role, cm.status AS membership_status
         FROM club_members cm
         JOIN clubs c ON c.id = cm.club_id
         WHERE cm.user_id = $1 AND cm.status IN ('active', 'pending')
         ORDER BY c.name`,
        [req.user.id]
      )
    );
    res.json({ clubs });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const club = camel(await one('SELECT * FROM clubs WHERE id = $1', [req.params.id]));
    if (!club) return res.status(404).json({ message: 'Club not found' });
    const myMembership = await membership(req.user.id, club.id);
    const canSeeRoster =
      req.user.roles.includes('app_admin') ||
      (myMembership?.status === 'active' && ['club_admin', 'coach', 'member'].includes(myMembership.role));
    if (!canSeeRoster) {
      return res.json({
        club: {
          id: club.id,
          name: club.name,
          location: club.location,
          description: club.description,
          isVerified: club.isVerified,
          status: club.status,
        },
        members: [],
        announcements: [],
        assignments: [],
        myMembership,
        clubMembership: null,
      });
    }
    const members = camelMany(
      await many(
        `SELECT cm.*, u.first_name, u.last_name, u.email, u.avatar_url,
                COALESCE(JSON_AGG(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL), '[]'::json) AS user_roles,
                (SELECT COUNT(*) FROM activities a WHERE a.athlete_id = u.id)::int AS activity_count
         FROM club_members cm
         JOIN users u ON u.id = cm.user_id
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         WHERE cm.club_id = $1
         GROUP BY cm.id, u.id
         ORDER BY cm.role, u.last_name`,
        [club.id]
      )
    );
    const announcements = camelMany(
      await many(
        `SELECT a.*, u.first_name, u.last_name
         FROM club_announcements a LEFT JOIN users u ON u.id = a.author_id
         WHERE a.club_id = $1 ORDER BY a.published_at DESC LIMIT 20`,
        [club.id]
      )
    );
    const assignments = camelMany(
      await many(
        `SELECT ca.*,
                ath.first_name AS athlete_first_name, ath.last_name AS athlete_last_name,
                co.first_name AS coach_first_name, co.last_name AS coach_last_name
         FROM coach_assignments ca
         JOIN users ath ON ath.id = ca.athlete_id
         JOIN users co ON co.id = ca.coach_id
         WHERE ca.club_id = $1 AND ca.status = 'active'
         ORDER BY ath.last_name`,
        [club.id]
      )
    );
    const clubMem = await getClubMembership(club.id);
    res.json({
      club,
      members,
      announcements,
      assignments,
      myMembership,
      clubMembership: clubMem,
    });
  })
);

router.post(
  '/:id/join',
  asyncHandler(async (req, res) => {
    const { invitationCode } = req.body;
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const { club } = writable;
    if (club.status === 'pending_coach') {
      return res.status(400).json({ message: 'This club must add at least one coach before accepting members' });
    }
    const existing = await membership(req.user.id, club.id);
    if (existing?.status === 'active') return res.status(400).json({ message: 'Already a member' });

    const autoApprove = Boolean(invitationCode);
    if (invitationCode) {
      const invite = await one(
        `SELECT * FROM invitation_codes WHERE UPPER(code) = UPPER($1) AND is_disabled = FALSE`,
        [invitationCode]
      );
      if (!invite) return res.status(400).json({ message: 'Invalid club invitation code' });
    }

    const row = camel(
      await one(
        `INSERT INTO club_members (club_id, user_id, role, status, approved_at)
         VALUES ($1, $2, 'member', $3, $4)
         ON CONFLICT (club_id, user_id) DO UPDATE SET status = EXCLUDED.status, requested_at = NOW()
         RETURNING *`,
        [club.id, req.user.id, autoApprove ? 'active' : 'pending', autoApprove ? new Date() : null]
      )
    );
    res.status(201).json({ membership: row });
  })
);

router.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const { club } = writable;
    if (club.status === 'pending_coach') {
      return res.status(400).json({ message: 'Add at least one coach before adding athletes' });
    }
    const { userId, email } = req.body;
    if (!userId && !email) return res.status(400).json({ message: 'Email is required' });
    const user = camel(
      await one(
        userId ? 'SELECT * FROM users WHERE id = $1 AND status = $2' : 'SELECT * FROM users WHERE email = $1 AND status = $2',
        [userId || String(email).toLowerCase(), 'active']
      )
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'athlete') ON CONFLICT DO NOTHING`, [user.id]);
    await query(
      `INSERT INTO club_members (club_id, user_id, role, status, approved_at)
       VALUES ($1, $2, 'member', 'active', NOW())
       ON CONFLICT (club_id, user_id) DO UPDATE SET
         status = 'active',
         approved_at = NOW(),
         role = CASE
           WHEN club_members.role IN ('club_admin', 'coach') THEN club_members.role
           ELSE 'member'
         END`,
      [club.id, user.id]
    );
    await createNotification({
      userId: user.id,
      type: 'club',
      title: `Added to ${club.name}`,
      body: `A club admin added you to ${club.name}.`,
      data: { clubId: club.id },
    });
    res.json({ message: `${user.email} added as an athlete` });
  })
);

router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    const mem = await membership(req.user.id, req.params.id);
    if (!mem || !['active', 'pending'].includes(mem.status)) {
      return res.status(400).json({ message: 'You are not a member of this club' });
    }
    if (mem.role === 'club_admin') {
      return res.status(400).json({ message: 'Club admins cannot leave from here' });
    }
    await query(
      `UPDATE club_members SET status = 'left' WHERE club_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    await query(
      `UPDATE coach_assignments SET status = 'inactive'
       WHERE club_id = $1 AND (athlete_id = $2 OR coach_id = $2) AND status = 'active'`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Left club' });
  })
);

router.post(
  '/:id/members/:memberId/approve',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    if (writable.club.status === 'pending_coach') {
      return res.status(400).json({ message: 'Assign at least one coach before accepting members' });
    }
    const { coachId } = req.body;
    const member = camel(
      await one(
        `UPDATE club_members SET status = 'active', approved_at = NOW()
         WHERE id = $1 AND club_id = $2 RETURNING *`,
        [req.params.memberId, req.params.id]
      )
    );
    if (!member) return res.status(404).json({ message: 'Membership not found' });

    if (coachId) {
      const countRow = await one(
        `SELECT COUNT(*)::int AS count FROM coach_assignments
         WHERE athlete_id = $1 AND status = 'active'`,
        [member.userId]
      );
      if (countRow.count >= MAX_COACHES) {
        return res.status(400).json({ message: 'Athlete already has three coaches' });
      }
      await query(
        `INSERT INTO coach_assignments (athlete_id, coach_id, club_id, assigned_by, status)
         VALUES ($1,$2,$3,$4,'active')
         ON CONFLICT (athlete_id, coach_id) DO UPDATE SET status = 'active', club_id = EXCLUDED.club_id`,
        [member.userId, coachId, req.params.id, req.user.id]
      );
    }
    await createNotification({
      userId: member.userId,
      type: 'club',
      title: 'Club membership approved',
      body: `You are now a member of ${writable.club.name}.`,
      data: { clubId: req.params.id },
    });
    res.json({ member });
  })
);

router.post(
  '/:id/coaches',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const { userId, email } = req.body;
    const user = camel(
      await one(
        userId ? 'SELECT * FROM users WHERE id = $1' : 'SELECT * FROM users WHERE email = $1',
        [userId || email?.toLowerCase()]
      )
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach') ON CONFLICT DO NOTHING`, [user.id]);
    await query(
      `INSERT INTO club_members (club_id, user_id, role, status, approved_at)
       VALUES ($1, $2, 'coach', 'active', NOW())
       ON CONFLICT (club_id, user_id) DO UPDATE SET
         status = 'active',
         approved_at = NOW(),
         role = CASE WHEN club_members.role = 'club_admin' THEN 'club_admin' ELSE 'coach' END`,
      [req.params.id, user.id]
    );
    await query(`UPDATE clubs SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'pending_coach'`, [
      req.params.id,
    ]);
    if (user.id !== req.user.id) {
      await createNotification({
        userId: user.id,
        type: 'club',
        title: `Added as coach at ${writable.club.name}`,
        body: `A club admin added you as a coach at ${writable.club.name}.`,
        data: { clubId: req.params.id },
      });
    }
    res.json({ message: 'Coach added' });
  })
);

router.delete(
  '/:id/coaches/:userId',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const target = await membership(req.params.userId, req.params.id);
    const remaining = await one(
      `SELECT COUNT(*)::int AS count
       FROM club_members cm
       WHERE cm.club_id = $1 AND cm.status = 'active' AND cm.user_id <> $2
         AND (
           cm.role = 'coach'
           OR (cm.role = 'club_admin' AND EXISTS (
             SELECT 1 FROM user_roles ur WHERE ur.user_id = cm.user_id AND ur.role = 'coach'
           ))
         )`,
      [req.params.id, req.params.userId]
    );
    if (remaining.count < 1) {
      return res.status(400).json({ message: 'Club must keep at least one coach' });
    }
    if (target?.role === 'club_admin') {
      await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'coach'`, [req.params.userId]);
      await query(
        `UPDATE coach_assignments SET status = 'inactive'
         WHERE club_id = $1 AND coach_id = $2 AND status = 'active'`,
        [req.params.id, req.params.userId]
      );
    } else {
      await query(
        `UPDATE club_members SET status = 'left' WHERE club_id = $1 AND user_id = $2 AND role = 'coach'`,
        [req.params.id, req.params.userId]
      );
    }
    await createNotification({
      userId: req.params.userId,
      type: 'club',
      title: `Removed as coach from ${writable.club.name}`,
      body: `A club admin removed you as a coach from ${writable.club.name}.`,
      data: { clubId: req.params.id },
    });
    res.json({ message: 'Coach removed' });
  })
);

router.post(
  '/:id/assign-coach',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const { athleteId, coachId } = req.body;
    if (!athleteId || !coachId) {
      return res.status(400).json({ message: 'Athlete and coach are required' });
    }
    const athleteMem = await membership(athleteId, req.params.id);
    if (!athleteMem || athleteMem.status !== 'active' || athleteMem.role !== 'member') {
      return res.status(400).json({ message: 'Athlete must be an active club athlete' });
    }
    if (!(await isClubCoach(coachId, req.params.id))) {
      return res.status(400).json({ message: 'Coach must belong to this club' });
    }
    const countRow = await one(
      `SELECT COUNT(*)::int AS count FROM coach_assignments WHERE athlete_id = $1 AND status = 'active'`,
      [athleteId]
    );
    if (countRow.count >= MAX_COACHES) {
      return res.status(400).json({ message: 'Maximum of three coaches per athlete' });
    }
    await query(
      `INSERT INTO coach_assignments (athlete_id, coach_id, club_id, assigned_by, status)
       VALUES ($1,$2,$3,$4,'active')
       ON CONFLICT (athlete_id, coach_id) DO UPDATE SET status = 'active', club_id = EXCLUDED.club_id`,
      [athleteId, coachId, req.params.id, req.user.id]
    );
    await createNotification({
      userId: athleteId,
      type: 'club',
      title: 'Coach assigned',
      body: 'Your club assigned a coach to you.',
      data: { clubId: req.params.id, coachId },
    });
    await createNotification({
      userId: coachId,
      type: 'club',
      title: 'New athlete assigned',
      body: 'A club assigned an athlete to you.',
      data: { clubId: req.params.id, athleteId },
    });
    res.json({ message: 'Coach assigned' });
  })
);

router.post(
  '/:id/unassign-coach',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const { athleteId, coachId } = req.body;
    if (!athleteId || !coachId) {
      return res.status(400).json({ message: 'Athlete and coach are required' });
    }
    await query(
      `UPDATE coach_assignments SET status = 'inactive'
       WHERE athlete_id = $1 AND coach_id = $2 AND club_id = $3 AND status = 'active'`,
      [athleteId, coachId, req.params.id]
    );
    await createNotification({
      userId: athleteId,
      type: 'club',
      title: 'Coach unassigned',
      body: 'Your club removed a coach assignment.',
      data: { clubId: req.params.id, coachId },
    });
    res.json({ message: 'Coach unassigned' });
  })
);

router.post(
  '/:id/announcements',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'Title and body required' });
    const announcement = camel(
      await one(
        `INSERT INTO club_announcements (club_id, author_id, title, body) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, req.user.id, title, body]
      )
    );
    const members = await many(
      `SELECT user_id FROM club_members WHERE club_id = $1 AND status = 'active' AND role <> 'club_admin' AND user_id <> $2`,
      [req.params.id, req.user.id]
    );
    await notifyMany(
      members.map((m) => m.user_id),
      {
        type: 'announcement',
        title: `Club announcement: ${title}`,
        body,
        data: { clubId: req.params.id, announcementId: announcement.id },
      }
    );
    res.status(201).json({ announcement });
  })
);

router.post(
  '/:id/events',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const { name, eventDate, distance, category = 'run', notes, location } = req.body;
    if (!name || !eventDate) return res.status(400).json({ message: 'Name and date required' });
    const event = camel(
      await one(
        `INSERT INTO events (owner_type, owner_id, club_id, name, event_date, distance, category, notes, location)
         VALUES ('club', $1, $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.params.id, name, eventDate, distance || null, category, notes || null, location || null]
      )
    );
    const members = await many(
      `SELECT user_id FROM club_members WHERE club_id = $1 AND status = 'active' AND role <> 'club_admin' AND user_id <> $2`,
      [req.params.id, req.user.id]
    );
    await notifyMany(
      members.map((m) => m.user_id),
      {
        type: 'event',
        title: `New club event: ${name}`,
        body: `${writable.club.name} added ${name} on ${eventDate}.`,
        data: { clubId: req.params.id, eventId: event.id, url: '/events' },
      }
    );
    res.status(201).json({ event });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const { name, description, logoUrl, location, website } = req.body;
    const club = camel(
      await one(
        `UPDATE clubs SET
           name = COALESCE($1, name),
           description = COALESCE($2, description),
           logo_url = COALESCE($3, logo_url),
           location = COALESCE($4, location),
           website = COALESCE($5, website),
           slug = COALESCE($6, slug),
           updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [name, description, logoUrl, location, website, name ? slugify(name) : null, req.params.id]
      )
    );
    res.json({ club });
  })
);

export default router;
