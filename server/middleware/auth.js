import { verifyToken } from '../utils/jwt.js';
import { camel, one } from '../config/db.js';
import { getUserMembership, getUserRoles, isMembershipUsable, publicUser } from '../utils/membership.js';
import { isOpsAdminUser, isStaffUser, isSuperAdminUser } from '../utils/staff.js';

export async function protect(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = verifyToken(header.split(' ')[1]);
    const row = await one('SELECT * FROM users WHERE id = $1 AND status <> $2', [decoded.id, 'deleted']);
    if (!row) {
      return res.status(401).json({ message: 'User not found' });
    }
    const user = camel(row);
    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Account is suspended' });
    }
    user.roles = await getUserRoles(user.id);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Not authorized, token invalid' });
  }
}

export function rejectAppAdmin(req, res, next) {
  if (isStaffUser(req.user)) {
    return res.status(403).json({ message: 'Staff accounts manage the platform only' });
  }
  next();
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    const have = req.user.roles || [];
    const expanded = roles.flatMap((role) => {
      if (role === 'app_admin' || role === 'super_admin') return ['app_admin', 'super_admin'];
      return [role];
    });
    let has = expanded.some((role) => have.includes(role));
    if (!has && expanded.includes('coach')) {
      const head = await one(
        `SELECT 1 FROM clubs WHERE head_coach_user_id = $1 LIMIT 1`,
        [req.user.id]
      );
      if (head) {
        if (!have.includes('coach')) req.user.roles = [...have, 'coach'];
        has = true;
      }
    }
    if (!has) {
      return res.status(403).json({ message: `Requires one of: ${roles.join(', ')}` });
    }
    next();
  };
}

export function requireSuperAdmin(req, res, next) {
  if (!isSuperAdminUser(req.user)) {
    return res.status(403).json({ message: 'Super admin required' });
  }
  next();
}

export function requireOpsAdmin(req, res, next) {
  if (!isOpsAdminUser(req.user)) {
    return res.status(403).json({ message: 'Admin required' });
  }
  next();
}

const MEMBERSHIP_BYPASS_PREFIXES = [
  '/api/auth/me',
  '/api/users/me',
  '/api/membership',
  '/api/notifications',
  '/api/push',
  '/api/support',
];

export async function requireMembership(req, res, next) {
  if (isStaffUser(req.user)) {
    req.membership = { status: 'active', planName: 'Staff' };
    return next();
  }

  const path = req.originalUrl.split('?')[0];
  if (MEMBERSHIP_BYPASS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    req.membership = await getUserMembership(req.user.id);
    return next();
  }

  const membership = await getUserMembership(req.user.id);
  req.membership = membership;
  if (!isMembershipUsable(membership?.status)) {
    return res.status(402).json({
      message: 'Active membership required',
      membershipStatus: membership?.status || 'none',
      code: 'MEMBERSHIP_REQUIRED',
    });
  }
  next();
}

export async function loadPublicUser(user) {
  const membership = await getUserMembership(user.id);
  return publicUser(user, { roles: user.roles, membership });
}
