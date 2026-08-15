import express from 'express';
import bcrypt from 'bcryptjs';
import { camel, one, query } from '../config/db.js';
import { protect, requireMembership } from '../middleware/auth.js';
import { publicUser } from '../utils/membership.js';
import { writeAudit } from '../services/auditService.js';
import { asyncHandler } from '../middleware/error.js';

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
    ];
    const map = {
      firstName: 'first_name',
      lastName: 'last_name',
      avatarUrl: 'avatar_url',
      dateOfBirth: 'date_of_birth',
      maxHeartRate: 'max_heart_rate',
      restingHeartRate: 'resting_heart_rate',
      notificationPrefs: 'notification_prefs',
    };
    const sets = [];
    const vals = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const col = map[key] || key;
        sets.push(`${col} = $${i++}`);
        vals.push(key === 'notificationPrefs' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
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
