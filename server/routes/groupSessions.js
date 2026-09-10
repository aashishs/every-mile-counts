import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, rejectAppAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { notifyMany } from '../services/notificationService.js';
import { isClubHeadCoach } from '../utils/headCoach.js';
import {
  clockTime,
  GROUP_SESSION_RSVP,
  GROUP_SESSION_SPORTS,
  sportLabel,
  summarizeRsvps,
} from '../utils/groupSession.js';

const router = express.Router();
router.use(protect, requireMembership, rejectAppAdmin);

async function clubMembership(userId, clubId) {
  return camel(
    await one(
      `SELECT * FROM club_members WHERE club_id = $1 AND user_id = $2`,
      [clubId, userId]
    )
  );
}

async function canViewClub(userId, clubId) {
  const m = await clubMembership(userId, clubId);
  return m?.status === 'active';
}

async function canPostClub(userId, clubId) {
  const m = await clubMembership(userId, clubId);
  if (!m || m.status !== 'active') return false;
  if (m.role === 'coach' || m.role === 'club_admin') return true;
  return Boolean(await isClubHeadCoach(userId, clubId));
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function parseSport(value) {
  const sport = String(value || 'run').toLowerCase();
  if (sport === 'bike') return 'ride';
  if (!GROUP_SESSION_SPORTS.includes(sport)) fail(400, 'Choose run, ride, swim, walk, or other');
  return sport;
}

function parseDate(value) {
  const s = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(400, 'Date is required');
  return s;
}

function parseTime(value) {
  const s = String(value || '').trim();
  if (!s) fail(400, 'Start time is required');
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) fail(400, 'Start time looks invalid');
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) fail(400, 'Start time looks invalid');
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

async function loadRsvps(sessionId) {
  return camelMany(
    await many(
      `SELECT r.user_id, r.status, u.first_name, u.last_name
       FROM group_session_rsvps r
       JOIN users u ON u.id = r.user_id
       WHERE r.session_id = $1
       ORDER BY r.status, u.first_name, u.last_name`,
      [sessionId]
    )
  );
}

async function shapeSession(row, userId) {
  const session = camel(row);
  session.sessionTime = clockTime(session.sessionTime);
  const summary = summarizeRsvps(await loadRsvps(session.id), userId);
  return {
    ...session,
    sportLabel: sportLabel(session.sport),
    canPost: Boolean(session.canPost),
    ...summary,
  };
}

async function getSession(id) {
  return camel(
    await one(
      `SELECT gs.*, c.name AS club_name,
              u.first_name AS creator_first_name, u.last_name AS creator_last_name
       FROM group_sessions gs
       JOIN clubs c ON c.id = gs.club_id
       JOIN users u ON u.id = gs.created_by
       WHERE gs.id = $1`,
      [id]
    )
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clubId = String(req.query.clubId || '').trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const params = [req.user.id];
    let sql = `SELECT gs.*, c.name AS club_name,
                      u.first_name AS creator_first_name, u.last_name AS creator_last_name
               FROM group_sessions gs
               JOIN clubs c ON c.id = gs.club_id
               JOIN users u ON u.id = gs.created_by
               JOIN club_members cm ON cm.club_id = gs.club_id AND cm.user_id = $1 AND cm.status = 'active'
               WHERE gs.status = 'upcoming'`;
    if (clubId) {
      if (!(await canViewClub(req.user.id, clubId))) {
        return res.status(403).json({ message: 'Join this club to see group sessions' });
      }
      params.push(clubId);
      sql += ` AND gs.club_id = $${params.length}`;
    }
    sql += ` AND gs.session_date >= CURRENT_DATE`;
    sql += ` ORDER BY gs.session_date ASC, gs.session_time ASC LIMIT ${limit}`;
    const rows = await many(sql, params);
    const canPost = clubId ? await canPostClub(req.user.id, clubId) : false;
    const sessions = [];
    for (const row of rows) {
      const post = clubId ? canPost : await canPostClub(req.user.id, row.club_id);
      sessions.push(await shapeSession({ ...row, can_post: post }, req.user.id));
    }
    res.json({ sessions, canPost: clubId ? canPost : false });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const clubId = String(req.body.clubId || '').trim();
    if (!clubId) return res.status(400).json({ message: 'Club is required' });
    if (!(await canPostClub(req.user.id, clubId))) {
      return res.status(403).json({ message: 'Club admin or coach can post a group session' });
    }
    const name = String(req.body.name || '').trim();
    const meetupPoint = String(req.body.meetupPoint || '').trim();
    const notes = String(req.body.notes || '').trim();
    if (!name) return res.status(400).json({ message: 'Give the session a name' });
    if (name.length > 80) return res.status(400).json({ message: 'Name is too long' });
    if (!meetupPoint) return res.status(400).json({ message: 'Meetup point is required' });
    if (meetupPoint.length > 120) return res.status(400).json({ message: 'Meetup point is too long' });
    if (notes.length > 280) return res.status(400).json({ message: 'Notes must be 280 characters or less' });
    const sessionDate = parseDate(req.body.sessionDate);
    const sessionTime = parseTime(req.body.sessionTime);
    const sport = parseSport(req.body.sport);
    const row = await one(
      `INSERT INTO group_sessions
         (club_id, created_by, name, session_date, session_time, sport, meetup_point, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [clubId, req.user.id, name, sessionDate, sessionTime, sport, meetupPoint, notes || null]
    );
    const club = camel(await one(`SELECT name FROM clubs WHERE id = $1`, [clubId]));
    const members = await many(
      `SELECT user_id FROM club_members
       WHERE club_id = $1 AND status = 'active' AND user_id <> $2`,
      [clubId, req.user.id]
    );
    const when = `${sessionDate} ${sessionTime}`;
    await notifyMany(
      members.map((m) => m.user_id),
      {
        type: 'event',
        title: `${club?.name || 'Club'}: ${name}`,
        body: `${sportLabel(sport)} · ${when} · ${meetupPoint}. RSVP in the club.`,
        data: { clubId, sessionId: row.id, url: `/clubs/${clubId}` },
      }
    );
    const session = await shapeSession(
      { ...(await getSession(row.id)), can_post: true },
      req.user.id
    );
    res.status(201).json({ session });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const current = await getSession(req.params.id);
    if (!current) return res.status(404).json({ message: 'Session not found' });
    if (!(await canPostClub(req.user.id, current.clubId))) {
      return res.status(403).json({ message: 'Club admin or coach can update this session' });
    }
    const status = req.body.status === 'cancelled' ? 'cancelled' : current.status;
    const name = req.body.name != null ? String(req.body.name).trim() : current.name;
    const meetupPoint = req.body.meetupPoint != null ? String(req.body.meetupPoint).trim() : current.meetupPoint;
    const notes = req.body.notes != null ? String(req.body.notes).trim() : (current.notes || '');
    if (!name) return res.status(400).json({ message: 'Give the session a name' });
    if (!meetupPoint && status !== 'cancelled') return res.status(400).json({ message: 'Meetup point is required' });
    const sessionDate = req.body.sessionDate != null ? parseDate(req.body.sessionDate) : current.sessionDate;
    const sessionTime = req.body.sessionTime != null ? parseTime(req.body.sessionTime) : clockTime(current.sessionTime);
    const sport = req.body.sport != null ? parseSport(req.body.sport) : current.sport;
    await query(
      `UPDATE group_sessions SET
         name = $1, session_date = $2, session_time = $3, sport = $4,
         meetup_point = $5, notes = $6, status = $7, updated_at = NOW()
       WHERE id = $8`,
      [name, sessionDate, sessionTime, sport, meetupPoint, notes || null, status, current.id]
    );
    const session = await shapeSession(
      { ...(await getSession(current.id)), can_post: true },
      req.user.id
    );
    res.json({ session });
  })
);

router.put(
  '/:id/rsvp',
  asyncHandler(async (req, res) => {
    const current = await getSession(req.params.id);
    if (!current) return res.status(404).json({ message: 'Session not found' });
    if (!(await canViewClub(req.user.id, current.clubId))) {
      return res.status(403).json({ message: 'Join this club to RSVP' });
    }
    if (current.status !== 'upcoming') {
      return res.status(400).json({ message: 'This session is cancelled' });
    }
    const status = String(req.body.status || '').trim();
    if (!GROUP_SESSION_RSVP.includes(status)) {
      return res.status(400).json({ message: 'Choose In, Maybe, or Can’t' });
    }
    await query(
      `INSERT INTO group_session_rsvps (session_id, user_id, status, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (session_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
      [current.id, req.user.id, status]
    );
    const canPost = await canPostClub(req.user.id, current.clubId);
    const session = await shapeSession(
      { ...(await getSession(current.id)), can_post: canPost },
      req.user.id
    );
    res.json({ session });
  })
);

export default router;
