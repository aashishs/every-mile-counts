import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, requireRole } from '../middleware/auth.js';
import { getClubMembership, isMembershipUsable } from '../utils/membership.js';
import { clubAnalytics } from '../services/analysisService.js';
import { createNotification, notifyMany } from '../services/notificationService.js';
import { slugify } from '../utils/format.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();
router.use(protect, requireMembership);

const MAX_COACHES = 3;

async function membership(userId, clubId) {
  return camel(
    await one(
      `SELECT * FROM club_members WHERE club_id = $1 AND user_id = $2`,
      [clubId, userId]
    )
  );
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
    const { q } = req.query;
    const params = [];
    let sql = `SELECT c.*, 
        (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.id AND cm.status = 'active')::int AS member_count
      FROM clubs c WHERE c.status <> 'suspended'`;
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (c.name ILIKE $1 OR c.location ILIKE $1 OR c.description ILIKE $1)`;
    }
    sql += ' ORDER BY c.name ASC LIMIT 50';
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
    const members = camelMany(
      await many(
        `SELECT cm.*, u.first_name, u.last_name, u.email, u.avatar_url
         FROM club_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.club_id = $1
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
    const events = camelMany(
      await many(
        `SELECT * FROM events WHERE club_id = $1 ORDER BY event_date DESC LIMIT 20`,
        [club.id]
      )
    );
    const analytics = await clubAnalytics(club.id);
    const myMembership = await membership(req.user.id, club.id);
    const clubMem = await getClubMembership(club.id);
    res.json({
      club,
      members,
      announcements,
      events,
      analytics,
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
    const admins = await many(
      `SELECT user_id FROM club_members WHERE club_id = $1 AND role = 'club_admin' AND status = 'active'`,
      [club.id]
    );
    await notifyMany(
      admins.map((a) => a.user_id),
      {
        type: 'club',
        title: autoApprove ? 'New club member' : 'Club join request',
        body: `${req.user.firstName} ${req.user.lastName} ${autoApprove ? 'joined' : 'requested to join'} ${club.name}`,
        data: { clubId: club.id },
      }
    );
    res.status(201).json({ membership: row });
  })
);

router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    await query(
      `UPDATE club_members SET status = 'left' WHERE club_id = $1 AND user_id = $2`,
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
    if (!coachId) {
      return res.status(400).json({ message: 'At least one coach must be assigned when an athlete joins' });
    }
    const member = camel(
      await one(
        `UPDATE club_members SET status = 'active', approved_at = NOW()
         WHERE id = $1 AND club_id = $2 RETURNING *`,
        [req.params.memberId, req.params.id]
      )
    );
    if (!member) return res.status(404).json({ message: 'Membership not found' });

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
       ON CONFLICT (club_id, user_id) DO UPDATE SET role = 'coach', status = 'active', approved_at = NOW()`,
      [req.params.id, user.id]
    );
    await query(`UPDATE clubs SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'pending_coach'`, [
      req.params.id,
    ]);
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
    const remaining = await one(
      `SELECT COUNT(*)::int AS count FROM club_members
       WHERE club_id = $1 AND role = 'coach' AND status = 'active' AND user_id <> $2`,
      [req.params.id, req.params.userId]
    );
    if (remaining.count < 1) {
      return res.status(400).json({ message: 'Club must keep at least one coach' });
    }
    await query(
      `UPDATE club_members SET status = 'left' WHERE club_id = $1 AND user_id = $2 AND role = 'coach'`,
      [req.params.id, req.params.userId]
    );
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
       ON CONFLICT (athlete_id, coach_id) DO UPDATE SET status = 'active'`,
      [athleteId, coachId, req.params.id, req.user.id]
    );
    res.json({ message: 'Coach assigned' });
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
      `SELECT user_id FROM club_members WHERE club_id = $1 AND status = 'active'`,
      [req.params.id]
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
