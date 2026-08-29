import { camel, many, one, query } from '../config/db.js';
import { ageFromDob, clampMafOffset, mafHeartRate, parseDateOfBirth } from './maf.js';
import { isStaffUser, isSuperAdminUser } from './staff.js';
import { parseStoredSyncTypes } from './activityTypes.js';

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
  return isSuperAdminUser(userOrRoles);
}

export function isClubOnlyUser(userOrRoles) {
  const roles = Array.isArray(userOrRoles) ? userOrRoles : userOrRoles?.roles || [];
  return roles.includes('club_admin') && !roles.includes('athlete') && !roles.includes('coach') && !isStaffUser(roles);
}

export function isAthleteUser(userOrRoles) {
  const roles = Array.isArray(userOrRoles) ? userOrRoles : userOrRoles?.roles || [];
  return roles.includes('athlete') && !isStaffUser(roles);
}

export async function grantAthleteUnlessClubAdmin(userId) {
  const roles = await getUserRoles(userId);
  if (roles.includes('club_admin') || isStaffUser(roles)) return;
  await query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, 'athlete') ON CONFLICT DO NOTHING`,
    [userId]
  );
}

export async function stripTrainingRolesForClubAdmin(userId) {
  const roles = await getUserRoles(userId);
  if (!roles.includes('club_admin') || isStaffUser(roles)) return;
  const headClub = await one('SELECT id FROM clubs WHERE head_coach_user_id = $1', [userId]);
  if (headClub) {
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'athlete'`, [userId]);
    await query(
      `UPDATE coach_assignments SET status = 'inactive'
       WHERE status = 'active' AND athlete_id = $1`,
      [userId]
    );
    await query(
      `UPDATE coach_assignments SET status = 'inactive'
       WHERE status = 'active' AND coach_id = $1 AND club_id IS DISTINCT FROM $2`,
      [userId, headClub.id]
    );
    return;
  }
  await query(`DELETE FROM user_roles WHERE user_id = $1 AND role IN ('athlete', 'coach')`, [userId]);
  await query(
    `UPDATE coach_assignments SET status = 'inactive'
     WHERE status = 'active' AND (athlete_id = $1 OR coach_id = $1)`,
    [userId]
  );
}

export async function getAdminClub(userId) {
  return camel(
    await one(
      `SELECT c.id, c.name, c.status, c.head_coach_user_id, cm.head_coach_choice
       FROM clubs c
       JOIN club_members cm ON cm.club_id = c.id
       WHERE cm.user_id = $1 AND cm.role = 'club_admin' AND cm.status = 'active'
       ORDER BY cm.requested_at ASC
       LIMIT 1`,
      [userId]
    )
  );
}

export async function publicUser(user, extras = {}) {
  if (!user) return null;
  let roles = extras.roles ? [...extras.roles] : await getUserRoles(user.id);
  const dateOfBirth = parseDateOfBirth(user.dateOfBirth ?? user.date_of_birth);
  const age = ageFromDob(dateOfBirth);
  const firstName = String(user.firstName ?? user.first_name ?? '').trim();
  const lastName = String(user.lastName ?? user.last_name ?? '').trim();
  let adminClubId = extras.adminClubId ?? null;
  let adminClubName = extras.adminClubName ?? null;
  let adminClub = null;
  if (roles.includes('club_admin') && extras.adminClubId === undefined) {
    adminClub = await getAdminClub(user.id);
    adminClubId = adminClub?.id || null;
    adminClubName = adminClub?.name || null;
  }
  const isHeadCoach = Boolean(adminClub?.headCoachUserId && adminClub.headCoachUserId === user.id);
  if (isHeadCoach && !roles.includes('coach')) {
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach') ON CONFLICT DO NOTHING`, [user.id]);
    roles = [...roles, 'coach'];
  }
  return {
    id: user.id,
    email: user.email,
    firstName,
    lastName,
    avatarUrl: user.avatarUrl ?? user.avatar_url,
    bio: user.bio,
    location: user.location,
    timezone: user.timezone,
    dateOfBirth,
    age,
    mafOffset: clampMafOffset(user.mafOffset ?? user.maf_offset),
    mafHeartRate:
      user.mafHeartRate
      ?? user.maf_heart_rate
      ?? mafHeartRate(age, user.mafOffset ?? user.maf_offset),
    maxHeartRate: user.maxHeartRate ?? user.max_heart_rate,
    restingHeartRate: user.restingHeartRate ?? user.resting_heart_rate,
    defaultActivityType: user.defaultActivityType ?? user.default_activity_type ?? 'Run',
    weekStartsOn: (() => {
      const raw = user.weekStartsOn ?? user.week_starts_on;
      if (raw == null || raw === '') return 1;
      const n = Number(raw);
      return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 1;
    })(),
    syncActivityTypes: parseStoredSyncTypes(user.syncActivityTypes ?? user.sync_activity_types),
    syncActivityTypesConfirmed: Boolean(user.syncActivityTypesConfirmedAt ?? user.sync_activity_types_confirmed_at),
    status: user.status,
    notificationPrefs: user.notificationPrefs ?? user.notification_prefs,
    roles,
    lastLoginAt: user.lastLoginAt ?? user.last_login_at,
    createdAt: user.createdAt ?? user.created_at,
    membership: extras.membership ?? null,
    adminClubId,
    adminClubName,
    isHeadCoach,
    headCoachPrompt: Boolean(roles.includes('club_admin') && adminClub && !isHeadCoach && adminClub.headCoachChoice == null),
    headCoachClubId: adminClub?.id || null,
    headCoachClubName: adminClub?.name || null,
  };
}
