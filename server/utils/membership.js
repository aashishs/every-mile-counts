import { camel, many, one, query } from '../config/db.js';
import { ageFromDob, mafHeartRate, parseDateOfBirth } from './maf.js';

export function computeMembershipStatus(membership) {
  if (!membership) return null;
  if (['suspended', 'cancelled'].includes(membership.status)) return membership.status;
  if (!membership.expires_at) return 'active';
  const expires = new Date(membership.expires_at);
  const now = new Date();
  if (expires < now) return 'expired';
  const days = (expires - now) / (1000 * 60 * 60 * 24);
  if (days <= 30) return 'expiring_soon';
  return 'active';
}

export function isMembershipUsable(status) {
  return status === 'active' || status === 'expiring_soon';
}

export async function getUserMembership(userId) {
  const row = await one(
    `SELECT m.*, p.name AS plan_name, p.duration_months, p.is_lifetime, p.audience
     FROM memberships m
     LEFT JOIN membership_plans p ON p.id = m.plan_id
     WHERE m.user_id = $1
     ORDER BY m.created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (!row) return null;
  const membership = camel(row);
  membership.status = computeMembershipStatus(membership);
  return membership;
}

export async function getClubMembership(clubId) {
  const row = await one(
    `SELECT m.*, p.name AS plan_name, p.max_club_members, p.max_club_coaches, p.is_lifetime
     FROM memberships m
     LEFT JOIN membership_plans p ON p.id = m.plan_id
     WHERE m.club_id = $1
     ORDER BY m.created_at DESC
     LIMIT 1`,
    [clubId]
  );
  if (!row) return null;
  const membership = camel(row);
  membership.status = computeMembershipStatus(membership);
  return membership;
}

export function planExpiryDate(plan, from = new Date()) {
  if (!plan || plan.is_lifetime || plan.isLifetime) return null;
  const months = plan.duration_months ?? plan.durationMonths;
  if (!months) return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + Number(months));
  return d;
}

export async function getUserRoles(userId) {
  const rows = await many('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return rows.map((r) => r.role);
}

export function isAppAdminUser(userOrRoles) {
  const roles = Array.isArray(userOrRoles) ? userOrRoles : userOrRoles?.roles || [];
  return roles.includes('app_admin');
}

export function isClubOnlyUser(userOrRoles) {
  const roles = Array.isArray(userOrRoles) ? userOrRoles : userOrRoles?.roles || [];
  return roles.includes('club_admin') && !roles.includes('athlete') && !roles.includes('coach') && !roles.includes('app_admin');
}

export function isAthleteUser(userOrRoles) {
  const roles = Array.isArray(userOrRoles) ? userOrRoles : userOrRoles?.roles || [];
  return roles.includes('athlete') && !roles.includes('app_admin');
}

export async function grantAthleteUnlessClubAdmin(userId) {
  const roles = await getUserRoles(userId);
  if (roles.includes('club_admin') || roles.includes('app_admin')) return;
  await query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, 'athlete') ON CONFLICT DO NOTHING`,
    [userId]
  );
}

export async function stripTrainingRolesForClubAdmin(userId) {
  const roles = await getUserRoles(userId);
  if (!roles.includes('club_admin') || roles.includes('app_admin')) return;
  await query(`DELETE FROM user_roles WHERE user_id = $1 AND role IN ('athlete', 'coach')`, [userId]);
  await query(
    `UPDATE coach_assignments SET status = 'inactive'
     WHERE status = 'active' AND (athlete_id = $1 OR coach_id = $1)`,
    [userId]
  );
}

export async function publicUser(user, extras = {}) {
  if (!user) return null;
  const roles = extras.roles || (await getUserRoles(user.id));
  const dateOfBirth = parseDateOfBirth(user.dateOfBirth ?? user.date_of_birth);
  const age = ageFromDob(dateOfBirth);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? user.first_name,
    lastName: user.lastName ?? user.last_name,
    avatarUrl: user.avatarUrl ?? user.avatar_url,
    bio: user.bio,
    location: user.location,
    timezone: user.timezone,
    dateOfBirth,
    age,
    mafHeartRate: mafHeartRate(age),
    maxHeartRate: user.maxHeartRate ?? user.max_heart_rate,
    restingHeartRate: user.restingHeartRate ?? user.resting_heart_rate,
    defaultActivityType: user.defaultActivityType ?? user.default_activity_type ?? 'Run',
    status: user.status,
    notificationPrefs: user.notificationPrefs ?? user.notification_prefs,
    roles,
    lastLoginAt: user.lastLoginAt ?? user.last_login_at,
    createdAt: user.createdAt ?? user.created_at,
    membership: extras.membership ?? null,
  };
}
