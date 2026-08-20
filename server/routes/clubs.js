import express from 'express';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { protect, requireMembership, rejectAppAdmin } from '../middleware/auth.js';
import { getClubMembership, isMembershipUsable, getUserRoles, grantAthleteUnlessClubAdmin } from '../utils/membership.js';
import { createNotification, notifyMany } from '../services/notificationService.js';
import { slugify } from '../utils/format.js';
import { asyncHandler } from '../middleware/error.js';
import { generateCode } from '../utils/crypto.js';
import { clientUrl } from '../utils/urls.js';
import {
  addUserToClub,
  assertClubSlot,
  assertCoachSlot,
  consumeInvitation,
  invitationState,
  loadInvitation,
} from '../utils/invites.js';
import {
  DEFAULT_CLUB_QR_USES,
  MAX_ACTIVE_CLUB_QR_CODES,
  MAX_CLUB_QR_USES,
  MAX_CLUBS,
} from '../utils/limits.js';

const router = express.Router();

function clubJoinPath({ clubId, role, code }) {
  const params = new URLSearchParams({
    club: clubId,
    role,
    code,
  });
  return `/join?${params.toString()}`;
}

function inviteExpiry(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59:59`;
  return s;
}

router.get(
  '/invite-preview',
  asyncHandler(async (req, res) => {
    const code = String(req.query.code || '').trim();
    const clubId = String(req.query.club || '').trim();
    const role = String(req.query.role || '').trim();
    if (!code) return res.status(400).json({ message: 'Invitation code is required' });
    const invite = await loadInvitation({
      code,
      type: ['athlete', 'coach'].includes(role) ? role : undefined,
    });
    if (!invite.clubId) {
      return res.status(400).json({ message: 'This code is not a club join QR' });
    }
    if (clubId && clubId !== invite.clubId) {
      return res.status(400).json({ message: 'This QR does not match that club' });
    }
    res.json({
      clubId: invite.clubId,
      clubName: invite.clubName,
      role: invite.type,
      remaining: Math.max(0, Number(invite.maxActivations) - Number(invite.activationsUsed)),
      expiresAt: invite.expiresAt,
      clubStatus: invite.clubStatus,
    });
  })
);

router.use(protect, requireMembership, rejectAppAdmin);

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
  return Boolean(m && m.status === 'active' && m.role === 'coach');
}

async function requireClubAdmin(req, clubId) {
  if (req.user.roles.some((role) => ['app_admin', 'super_admin', 'admin'].includes(role))) return true;
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
    params.push(req.user.id);
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = c.id AND cm.user_id = $${params.length} AND cm.status IN ('active', 'pending')
    )`;
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
    const ids = clubs.map((c) => c.id);
    if (!ids.length) return res.json({ clubs, max: MAX_CLUBS });
    const assigned = camelMany(
      await many(
        `SELECT ca.club_id, u.id, u.first_name, u.last_name, u.email
         FROM coach_assignments ca
         JOIN users u ON u.id = ca.coach_id
         WHERE ca.athlete_id = $1 AND ca.status = 'active' AND ca.club_id = ANY($2::uuid[])
         ORDER BY u.last_name, u.first_name`,
        [req.user.id, ids]
      )
    );
    const requests = camelMany(
      await many(
        `SELECT club_id FROM coach_assignment_requests
         WHERE athlete_id = $1 AND status = 'pending' AND club_id = ANY($2::uuid[])`,
        [req.user.id, ids]
      )
    );
    const coachesByClub = {};
    for (const row of assigned) {
      (coachesByClub[row.clubId] ||= []).push({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
      });
    }
    const requested = new Set(requests.map((r) => r.clubId));
    res.json({
      clubs: clubs.map((c) => ({
        ...c,
        coaches: coachesByClub[c.id] || [],
        coachRequested: requested.has(c.id),
      })),
      max: MAX_CLUBS,
    });
  })
);

router.get(
  '/:id/invite-codes',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const rows = camelMany(
      await many(
        `SELECT ic.*, u.email AS created_by_email
         FROM invitation_codes ic
         LEFT JOIN users u ON u.id = ic.created_by
         WHERE ic.club_id = $1
         ORDER BY ic.created_at DESC`,
        [req.params.id]
      )
    );
    const codes = rows.map((row) => {
      const next = invitationState(row);
      return {
        ...next,
        joinPath: clubJoinPath({ clubId: req.params.id, role: row.type, code: row.code }),
      };
    });
    const activeCount = codes.filter((c) => c.state === 'active').length;
    res.json({
      codes,
      limits: {
        maxActive: MAX_ACTIVE_CLUB_QR_CODES,
        activeCount,
        remainingSlots: Math.max(0, MAX_ACTIVE_CLUB_QR_CODES - activeCount),
        defaultUses: DEFAULT_CLUB_QR_USES,
        maxUses: MAX_CLUB_QR_USES,
      },
    });
  })
);

router.post(
  '/:id/invite-codes',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const type = req.body.type === 'coach' ? 'coach' : req.body.type === 'athlete' ? 'athlete' : null;
    if (!type) return res.status(400).json({ message: 'QR type must be athlete or coach' });
    const active = await one(
      `SELECT COUNT(*)::int AS count FROM invitation_codes
       WHERE club_id = $1
         AND is_disabled = FALSE
         AND (expires_at IS NULL OR expires_at > NOW())
         AND activations_used < max_activations`,
      [req.params.id]
    );
    if ((active?.count || 0) >= MAX_ACTIVE_CLUB_QR_CODES) {
      return res.status(400).json({
        message: `This club already has ${MAX_ACTIVE_CLUB_QR_CODES} active QR codes. Disable or let one expire before creating another.`,
      });
    }
    const uses = Math.min(MAX_CLUB_QR_USES, Math.max(1, Number(req.body.maxActivations) || DEFAULT_CLUB_QR_USES));
    const code = generateCode(type === 'coach' ? 'COA' : 'ATH');
    const row = camel(
      await one(
        `INSERT INTO invitation_codes
          (code, type, club_id, max_activations, valid_from, expires_at, created_by, notes)
         VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7) RETURNING *`,
        [code, type, req.params.id, uses, inviteExpiry(req.body.expiresAt), req.user.id, req.body.notes || null]
      )
    );
    const next = invitationState(row);
    res.status(201).json({
      code: {
        ...next,
        joinPath: clubJoinPath({ clubId: req.params.id, role: type, code: row.code }),
        joinUrl: `${clientUrl()}${clubJoinPath({ clubId: req.params.id, role: type, code: row.code })}`,
      },
    });
  })
);

router.patch(
  '/:id/invite-codes/:codeId',
  asyncHandler(async (req, res) => {
    if (!(await requireClubAdmin(req, req.params.id))) {
      return res.status(403).json({ message: 'Club admin required' });
    }
    const existing = camel(
      await one(
        `SELECT * FROM invitation_codes WHERE id = $1 AND club_id = $2`,
        [req.params.codeId, req.params.id]
      )
    );
    if (!existing) return res.status(404).json({ message: 'QR code not found' });
    let maxActivations = existing.maxActivations;
    if (req.body.maxActivations != null) {
      maxActivations = Math.min(
        MAX_CLUB_QR_USES,
        Math.max(Number(existing.activationsUsed) || 1, Number(req.body.maxActivations) || existing.maxActivations)
      );
    }
    const row = camel(
      await one(
        `UPDATE invitation_codes SET
           is_disabled = COALESCE($1, is_disabled),
           expires_at = COALESCE($2, expires_at),
           max_activations = $3,
           notes = COALESCE($4, notes)
         WHERE id = $5 AND club_id = $6 RETURNING *`,
        [
          req.body.isDisabled ?? null,
          req.body.expiresAt === undefined ? null : req.body.expiresAt,
          maxActivations,
          req.body.notes ?? null,
          req.params.codeId,
          req.params.id,
        ]
      )
    );
    const next = invitationState(row);
    res.json({
      code: {
        ...next,
        joinPath: clubJoinPath({ clubId: req.params.id, role: row.type, code: row.code }),
      },
    });
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
                (SELECT COUNT(*) FROM activities a WHERE a.athlete_id = u.id)::int AS activity_count,
                (SELECT MAX(a.start_date) FROM activities a WHERE a.athlete_id = u.id) AS last_activity_at,
                EXISTS (
                  SELECT 1 FROM coach_assignment_requests r
                  WHERE r.club_id = cm.club_id AND r.athlete_id = u.id AND r.status = 'pending'
                ) AS coach_requested,
                EXISTS (
                  SELECT 1 FROM coach_role_requests cr
                  WHERE cr.club_id = cm.club_id AND cr.athlete_id = u.id AND cr.status = 'pending'
                ) AS coach_role_requested
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
    const { invitationCode, role: requestedRole } = req.body;
    const writable = await clubWritable(req.params.id);
    if (!writable.ok) return res.status(writable.status).json({ message: writable.message });
    const { club } = writable;
    const existing = await membership(req.user.id, club.id);

    const roles = await getUserRoles(req.user.id);
    if (roles.includes('club_admin')) {
      return res.status(400).json({ message: 'Club admins cannot join as athletes or coaches' });
    }

    let joinRole = requestedRole === 'coach' ? 'coach' : 'member';
    let autoApprove = false;
    if (invitationCode) {
      const invite = await loadInvitation({
        code: invitationCode,
        type: ['athlete', 'coach'].includes(requestedRole) ? requestedRole : undefined,
        userId: req.user.id,
      });
      if (!invite.clubId || invite.clubId !== club.id) {
        return res.status(400).json({ message: 'This invitation is not for this club' });
      }
      joinRole = invite.type === 'coach' ? 'coach' : 'member';
      if (club.status === 'pending_coach' && joinRole !== 'coach') {
        return res.status(400).json({ message: 'This club must add at least one coach before accepting members' });
      }
      if (existing?.status === 'active' && (joinRole !== 'coach' || existing.role === 'coach')) {
        return res.status(400).json({ message: 'Already a member' });
      }
      await assertClubSlot(req.user.id, { clubId: club.id });
      await consumeInvitation({ invite, userId: req.user.id, clubId: club.id });
      autoApprove = true;
    } else if (existing?.status === 'active') {
      return res.status(400).json({ message: 'Already a member' });
    } else if (club.status === 'pending_coach') {
      return res.status(400).json({ message: 'This club must add at least one coach before accepting members' });
    } else {
      await assertClubSlot(req.user.id, { clubId: club.id });
    }

    const membershipRow = await addUserToClub({
      clubId: club.id,
      userId: req.user.id,
      role: joinRole,
      autoApprove,
    });
    res.status(201).json({ membership: membershipRow });
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
    const roles = await getUserRoles(user.id);
    if (roles.includes('club_admin')) {
      return res.status(400).json({ message: 'Club admins cannot be added as athletes' });
    }
    await assertClubSlot(user.id, { clubId: club.id });
    await grantAthleteUnlessClubAdmin(user.id);
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
         WHERE id = $1 AND club_id = $2 AND status = 'pending' RETURNING *`,
        [req.params.memberId, req.params.id]
      )
    );
    if (!member) return res.status(404).json({ message: 'Membership not found' });

    if (coachId) {
      await assertCoachSlot(member.userId, { coachId });
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
    const roles = await getUserRoles(user.id);
    if (roles.includes('club_admin')) {
      return res.status(400).json({ message: 'Club admins cannot also be coaches. Add a separate coach account.' });
    }
    await assertClubSlot(user.id, { clubId: req.params.id });
    if (roles.includes('coach')) {
      await query(
        `INSERT INTO club_members (club_id, user_id, role, status, approved_at)
         VALUES ($1, $2, 'coach', 'active', NOW())
         ON CONFLICT (club_id, user_id) DO UPDATE SET
           status = 'active',
           approved_at = NOW(),
           role = 'coach'`,
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
      return res.json({ message: 'Coach added', requested: false });
    }

    const request = camel(
      await one(
        `INSERT INTO coach_role_requests (club_id, athlete_id, requested_by, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (club_id, athlete_id) DO UPDATE SET
           status = 'pending',
           requested_by = EXCLUDED.requested_by,
           reviewed_by = NULL,
           reviewed_at = NULL
         RETURNING *`,
        [req.params.id, user.id, req.user.id]
      )
    );
    res.json({
      message: 'Request sent to platform admin to mark this athlete as a coach',
      requested: true,
      request,
    });
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
      `SELECT COUNT(*)::int AS count
       FROM club_members cm
       WHERE cm.club_id = $1 AND cm.status = 'active' AND cm.user_id <> $2 AND cm.role = 'coach'`,
      [req.params.id, req.params.userId]
    );
    if (remaining.count < 1) {
      return res.status(400).json({ message: 'Club must keep at least one coach' });
    }
    await query(
      `UPDATE club_members SET status = 'left' WHERE club_id = $1 AND user_id = $2 AND role = 'coach'`,
      [req.params.id, req.params.userId]
    );
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
  '/:id/request-coach',
  asyncHandler(async (req, res) => {
    const clubId = req.params.id;
    const mem = await membership(req.user.id, clubId);
    if (!mem || mem.status !== 'active' || mem.role !== 'member') {
      return res.status(400).json({ message: 'Join this club as an athlete first' });
    }
    const assigned = await one(
      `SELECT id FROM coach_assignments
       WHERE athlete_id = $1 AND club_id = $2 AND status = 'active' LIMIT 1`,
      [req.user.id, clubId]
    );
    if (assigned) {
      return res.status(400).json({ message: 'A coach is already assigned in this club' });
    }
    const existing = camel(
      await one(
        `SELECT * FROM coach_assignment_requests
         WHERE club_id = $1 AND athlete_id = $2`,
        [clubId, req.user.id]
      )
    );
    if (existing?.status === 'pending') {
      return res.status(400).json({ message: 'You already asked the club admin to assign a coach' });
    }
    await query(
      `INSERT INTO coach_assignment_requests (club_id, athlete_id, status, requested_at)
       VALUES ($1, $2, 'pending', NOW())
       ON CONFLICT (club_id, athlete_id) DO UPDATE SET status = 'pending', requested_at = NOW()`,
      [clubId, req.user.id]
    );
    const club = camel(await one('SELECT name FROM clubs WHERE id = $1', [clubId]));
    const admins = await many(
      `SELECT user_id FROM club_members
       WHERE club_id = $1 AND role = 'club_admin' AND status = 'active'`,
      [clubId]
    );
    await notifyMany(
      admins.map((a) => a.user_id),
      {
        type: 'club',
        title: 'Coach assignment requested',
        body: `${req.user.firstName} ${req.user.lastName} asked you to assign a coach at ${club?.name || 'your club'}.`,
        data: { clubId, athleteId: req.user.id, url: `/clubs/${clubId}?tab=requests` },
      }
    );
    res.status(201).json({ message: 'Club admin has been asked to assign a coach' });
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
    await assertCoachSlot(athleteId, { coachId });
    await query(
      `INSERT INTO coach_assignments (athlete_id, coach_id, club_id, assigned_by, status)
       VALUES ($1,$2,$3,$4,'active')
       ON CONFLICT (athlete_id, coach_id) DO UPDATE SET status = 'active', club_id = EXCLUDED.club_id`,
      [athleteId, coachId, req.params.id, req.user.id]
    );
    await query(
      `UPDATE coach_assignment_requests SET status = 'completed'
       WHERE club_id = $1 AND athlete_id = $2 AND status = 'pending'`,
      [req.params.id, athleteId]
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
