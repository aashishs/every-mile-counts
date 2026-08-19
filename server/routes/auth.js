import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { camel, one, query } from '../config/db.js';
import { signToken } from '../utils/jwt.js';
import { loadPublicUser, protect } from '../middleware/auth.js';
import { planExpiryDate, publicUser, isClubOnlyUser } from '../utils/membership.js';
import { writeAudit } from '../services/auditService.js';
import { asyncHandler } from '../middleware/error.js';
import { syncStravaOnLogin } from '../services/stravaService.js';
import { clientUrl } from '../utils/urls.js';
import { sendMail } from '../services/mailer.js';

const router = express.Router();

async function redeemInvitation({ code, type, userId, clubId }) {
  const invite = camel(
    await one(
      `SELECT ic.id, ic.code, ic.type, ic.plan_id, ic.max_activations, ic.activations_used,
              ic.valid_from, ic.expires_at, ic.is_disabled,
              p.duration_months, p.is_lifetime
       FROM invitation_codes ic
       LEFT JOIN membership_plans p ON p.id = ic.plan_id
       WHERE UPPER(ic.code) = UPPER($1)`,
      [code]
    )
  );
  if (!invite) throw Object.assign(new Error('Invalid invitation code'), { status: 400 });
  if (invite.isDisabled) throw Object.assign(new Error('Invitation code is disabled'), { status: 400 });
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    throw Object.assign(new Error('Invitation code has expired'), { status: 400 });
  }
  if (invite.validFrom && new Date(invite.validFrom) > new Date()) {
    throw Object.assign(new Error('Invitation code is not yet valid'), { status: 400 });
  }
  if (invite.activationsUsed >= invite.maxActivations) {
    throw Object.assign(new Error('Invitation code has no remaining activations'), { status: 400 });
  }
  if (invite.type !== 'universal' && type && invite.type !== type) {
    throw Object.assign(new Error(`This code is for ${invite.type} registration`), { status: 400 });
  }

  await query(`UPDATE invitation_codes SET activations_used = activations_used + 1 WHERE id = $1`, [invite.id]);
  await query(
    `INSERT INTO invitation_redemptions (code_id, user_id, club_id) VALUES ($1, $2, $3)`,
    [invite.id, userId || null, clubId || null]
  );

  const plan = invite.planId
    ? {
        id: invite.planId,
        duration_months: invite.durationMonths,
        is_lifetime: invite.isLifetime,
      }
    : await one(`SELECT * FROM membership_plans WHERE name = '12 Months' LIMIT 1`);

  return { invite, plan };
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, roles, invitationCode, clubName, location } = req.body;
    if (!email || !password || !firstName || !lastName || !invitationCode) {
      return res.status(400).json({ message: 'Name, email, password, and invitation code are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const existing = await one('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const requested = Array.isArray(roles) ? roles : [roles || 'athlete'];
    const valid = ['athlete', 'coach', 'club_admin'];
    let userRoles = requested.filter((r) => valid.includes(r));
    if (userRoles.includes('club_admin')) {
      userRoles = ['club_admin'];
    } else if (!userRoles.length) {
      userRoles = ['athlete'];
    }
    if (userRoles.includes('club_admin') && !clubName) {
      return res.status(400).json({ message: 'Club name is required for club registration' });
    }

    const primaryType = userRoles.includes('club_admin')
      ? 'club'
      : userRoles.includes('coach') && !userRoles.includes('athlete')
        ? 'coach'
        : userRoles.includes('coach')
          ? 'coach'
          : 'athlete';

    const hash = await bcrypt.hash(password, 12);
    const user = camel(
      await one(
        `INSERT INTO users (email, password_hash, first_name, last_name, location)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [email.toLowerCase(), hash, firstName, lastName, location || null]
      )
    );

    for (const role of userRoles) {
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, role]);
    }
    if (!userRoles.includes('athlete') && !userRoles.includes('club_admin')) {
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'athlete') ON CONFLICT DO NOTHING`, [user.id]);
      userRoles.push('athlete');
    }

    let club = null;
    if (userRoles.includes('club_admin')) {
      const { slugify } = await import('../utils/format.js');
      let slug = slugify(clubName);
      const clash = await one('SELECT id FROM clubs WHERE slug = $1', [slug]);
      if (clash) slug = `${slug}-${user.id.slice(0, 6)}`;
      club = camel(
        await one(
          `INSERT INTO clubs (name, slug, location, created_by, status)
           VALUES ($1, $2, $3, $4, 'pending_coach') RETURNING *`,
          [clubName, slug, location || null, user.id]
        )
      );
      await query(
        `INSERT INTO club_members (club_id, user_id, role, status, approved_at)
         VALUES ($1, $2, 'club_admin', 'active', NOW())`,
        [club.id, user.id]
      );
    }

    const { invite, plan } = await redeemInvitation({
      code: invitationCode,
      type: primaryType,
      userId: user.id,
      clubId: club?.id,
    });
    const expiresAt = planExpiryDate(plan);

    await query(
      `INSERT INTO memberships (user_id, plan_id, invitation_code_id, status, starts_at, expires_at)
       VALUES ($1, $2, $3, 'active', NOW(), $4)`,
      [user.id, plan?.id || invite.planId, invite.id, expiresAt]
    );

    if (club) {
      await query(
        `INSERT INTO memberships (club_id, plan_id, invitation_code_id, status, starts_at, expires_at)
         VALUES ($1, $2, $3, 'active', NOW(), $4)`,
        [club.id, plan?.id || invite.planId, invite.id, expiresAt]
      );
    }

    await writeAudit({
      userId: user.id,
      action: 'register',
      entityType: 'user',
      entityId: user.id,
      ip: req.ip,
    });

    const membership = {
      status: 'active',
      startsAt: new Date(),
      expiresAt,
    };
    const payload = await publicUser(user, { roles: userRoles, membership });
    res.status(201).json({ token: signToken(user.id), user: payload, club });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }
    const row = await one('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (row.status === 'suspended') {
      return res.status(403).json({ message: 'Account is suspended' });
    }
    if (row.status === 'deleted') {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [row.id]);
    const user = camel(row);
    const { getUserRoles, getUserMembership } = await import('../utils/membership.js');
    user.roles = await getUserRoles(user.id);
    const membership = await getUserMembership(user.id);

    await writeAudit({ userId: user.id, action: 'login', entityType: 'user', entityId: user.id, ip: req.ip });

    res.json({
      token: signToken(user.id),
      user: await publicUser(user, { roles: user.roles, membership }),
    });

    if (!isClubOnlyUser(user.roles)) {
      syncStravaOnLogin(user.id).catch((err) => {
        console.error('Login Strava sync:', err.message);
      });
    }
  })
);

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many reset requests. Try again in a few minutes.' },
});

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

router.post(
  '/forgot-password',
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const generic = { message: 'If that email is registered, we sent a reset link.' };
    if (!email) return res.json(generic);

    const user = camel(await one(
      `SELECT id, email, first_name, status FROM users WHERE email = $1`,
      [email]
    ));
    if (!user || user.status === 'deleted') {
      return res.json(generic);
    }
    if (user.status === 'suspended') {
      return res.json(generic);
    }

    await query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [user.id]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashResetToken(token), expiresAt]
    );

    const resetUrl = `${clientUrl()}/reset-password?token=${token}`;
    const { sent } = await sendMail({
      to: user.email,
      subject: 'Reset your Every Mile Counts password',
      text: `Hi ${user.firstName || ''},\n\nReset your password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Hi ${user.firstName || ''},</p><p>Reset your password using this link (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });

    await writeAudit({ userId: user.id, action: 'forgot_password', entityType: 'user', entityId: user.id, ip: req.ip });

    if (!sent && process.env.NODE_ENV !== 'production') {
      return res.json({ ...generic, resetUrl });
    }
    res.json(generic);
  })
);

router.post(
  '/reset-password',
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Reset link and a new password (8+ characters) are required' });
    }
    const row = camel(
      await one(
        `SELECT t.id, t.user_id, t.expires_at, t.used_at, u.status
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1`,
        [hashResetToken(String(token))]
      )
    );
    if (!row || row.usedAt || new Date(row.expiresAt) < new Date() || row.status !== 'active') {
      return res.status(400).json({ message: 'This reset link is invalid or has expired' });
    }

    const hash = await bcrypt.hash(String(newPassword), 12);
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, row.userId]);
    await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
    await query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [row.userId]
    );
    await writeAudit({ userId: row.userId, action: 'reset_password', entityType: 'user', entityId: row.userId, ip: req.ip });
    res.json({ message: 'Password updated. You can sign in now.' });
  })
);

router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    res.json({ user: await loadPublicUser(req.user) });
  })
);

export default router;
