import express from 'express';
import bcrypt from 'bcryptjs';
import { camel, one, query } from '../config/db.js';
import { protect, requireMembership } from '../middleware/auth.js';
import { publicUser, isAthleteUser, getAdminClub, getUserMembership } from '../utils/membership.js';
import { validateDateOfBirth, ageAndMafFromDob } from '../utils/maf.js';
import { slugify } from '../utils/format.js';
import { writeAudit } from '../services/auditService.js';
import { asyncHandler } from '../middleware/error.js';
import { ACTIVITY_TYPES, parseStoredSyncTypes } from '../utils/activityTypes.js';

const router = express.Router();

router.use(protect);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ user: await publicUser(req.user, { roles: req.user.roles }) });
  })
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const allowed = [
      'firstName',
      'lastName',
      'bio',
      'location',
      'timezone',
      'avatarUrl',
      'dateOfBirth',
      'maxHeartRate',
      'restingHeartRate',
      'notificationPrefs',
      'defaultActivityType',
    ];
    const map = {
      firstName: 'first_name',
      lastName: 'last_name',
      avatarUrl: 'avatar_url',
      dateOfBirth: 'date_of_birth',
      maxHeartRate: 'max_heart_rate',
      restingHeartRate: 'resting_heart_rate',
      notificationPrefs: 'notification_prefs',
      defaultActivityType: 'default_activity_type',
    };
    const allowedTypes = ACTIVITY_TYPES;
    if (req.body.defaultActivityType !== undefined && !allowedTypes.includes(req.body.defaultActivityType)) {
      return res.status(400).json({ message: 'Choose a valid default activity type' });
    }
    if (req.body.defaultActivityType !== undefined) {
      const selected = parseStoredSyncTypes(req.user.syncActivityTypes);
      if (!selected.includes(req.body.defaultActivityType)) {
        return res.status(400).json({ message: 'Default activity must be one of your selected sports' });
      }
    }
    if (req.body.firstName !== undefined && !String(req.body.firstName).trim()) {
      return res.status(400).json({ message: 'First name is required' });
    }
    if (req.body.lastName !== undefined && !String(req.body.lastName).trim()) {
      return res.status(400).json({ message: 'Last name is required' });
    }
    if (isAthleteUser(req.user) && req.body.dateOfBirth !== undefined) {
      const dobError = validateDateOfBirth(req.body.dateOfBirth);
      if (dobError) return res.status(400).json({ message: dobError });
    }
    const clubName = req.body.clubName !== undefined ? String(req.body.clubName).trim() : undefined;
    if (clubName !== undefined && req.user.roles.includes('club_admin')) {
      if (!clubName) return res.status(400).json({ message: 'Club name is required' });
      const existingClub = await getAdminClub(req.user.id);
      if (!existingClub) {
        let slug = slugify(clubName) || `club-${req.user.id.slice(0, 8)}`;
        const clash = await one('SELECT id FROM clubs WHERE slug = $1', [slug]);
        if (clash) slug = `${slug}-${req.user.id.slice(0, 6)}`;
        const location = req.body.location !== undefined ? (req.body.location || null) : req.user.location;
        const club = camel(
          await one(
            `INSERT INTO clubs (name, slug, location, created_by, status)
             VALUES ($1, $2, $3, $4, 'pending_coach') RETURNING *`,
            [clubName, slug, location, req.user.id]
          )
        );
        await query(
          `INSERT INTO club_members (club_id, user_id, role, status, approved_at)
           VALUES ($1, $2, 'club_admin', 'active', NOW())`,
          [club.id, req.user.id]
        );
        const membership = await getUserMembership(req.user.id);
        if (membership) {
          await query(
            `INSERT INTO memberships (club_id, plan_id, invitation_code_id, status, starts_at, expires_at)
             VALUES ($1, $2, $3, 'active', $4, $5)`,
            [
              club.id,
              membership.planId || null,
              membership.invitationCodeId || null,
              membership.startsAt || new Date(),
              membership.expiresAt || null,
            ]
          );
        }
        await query(
          `UPDATE invitation_redemptions SET club_id = $1 WHERE user_id = $2 AND club_id IS NULL`,
          [club.id, req.user.id]
        );
      }
    }
    const sets = [];
    const vals = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const col = map[key] || key;
        sets.push(`${col} = $${i++}`);
        vals.push(
          key === 'notificationPrefs'
            ? JSON.stringify(req.body[key])
            : ['maxHeartRate', 'restingHeartRate', 'dateOfBirth'].includes(key) && req.body[key] === ''
              ? null
              : ['firstName', 'lastName'].includes(key)
                ? String(req.body[key]).trim()
                : req.body[key]
        );
      }
    }
    if (req.body.dateOfBirth !== undefined) {
      const { age, mafHeartRate } = ageAndMafFromDob(req.body.dateOfBirth || null);
      sets.push(`age = $${i++}`);
      vals.push(age);
      sets.push(`maf_heart_rate = $${i++}`);
      vals.push(mafHeartRate);
    }
    if (!sets.length) {
      return res.json({ user: await publicUser(req.user, { roles: req.user.roles }) });
    }
    sets.push('updated_at = NOW()');
    vals.push(req.user.id);
    const row = await one(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    await writeAudit({
      userId: req.user.id,
      action: 'update_profile',
      entityType: 'user',
      entityId: req.user.id,
    });
    res.json({ user: await publicUser(camel(row), { roles: req.user.roles }) });
  })
);

router.post(
  '/me/password',
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Current password and new password (8+ chars) required' });
    }
    const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    await writeAudit({ userId: req.user.id, action: 'change_password', entityType: 'user', entityId: req.user.id });
    res.json({ message: 'Password updated' });
  })
);

router.get(
  '/search',
  requireMembership,
  asyncHandler(async (req, res) => {
    const { q, role } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }
    const params = [`%${q}%`, req.user.id];
    let sql = `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.avatar_url
               FROM users u
               JOIN user_roles ur ON ur.user_id = u.id
               WHERE u.id <> $2 AND u.status = 'active'
                 AND (u.email ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)`;
    if (role) {
      params.push(role);
      sql += ` AND ur.role = $3`;
    }
    sql += ' LIMIT 15';
    const { camelMany } = await import('../config/db.js');
    const { many } = await import('../config/db.js');
    const users = camelMany(await many(sql, params));
    res.json({ users });
  })
);

export default router;
