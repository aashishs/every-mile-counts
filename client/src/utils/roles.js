import { parseDateOfBirth } from './maf';

export const STAFF_ROLES = ['super_admin', 'app_admin', 'admin', 'support_admin'];

export function hasRole(user, ...roles) {
  return roles.some((role) => user?.roles?.includes(role));
}

export function isSuperAdminAccount(user) {
  return hasRole(user, 'super_admin', 'app_admin');
}

export function isOpsAdminAccount(user) {
  return hasRole(user, 'admin') || isSuperAdminAccount(user);
}

export function isSupportAdminAccount(user) {
  return hasRole(user, 'support_admin');
}

export function isSupportStaffAccount(user) {
  return isSupportAdminAccount(user) || isSuperAdminAccount(user);
}

export function isStaffAccount(user) {
  return hasRole(user, ...STAFF_ROLES);
}

export function isAppAdminAccount(user) {
  return isStaffAccount(user);
}

export function isAthleteAccount(user) {
  return hasRole(user, 'athlete') && !isStaffAccount(user);
}

export function isClubOnlyAccount(user) {
  const roles = user?.roles || [];
  return roles.includes('club_admin') && !roles.includes('athlete') && !roles.includes('coach') && !isStaffAccount(user);
}

export function needsDateOfBirth(user) {
  return isAthleteAccount(user) && !parseDateOfBirth(user?.dateOfBirth);
}

export function needsProfile(user) {
  if (!user || isStaffAccount(user)) return false;
  if (!String(user.firstName || '').trim() || !String(user.lastName || '').trim()) return true;
  if (needsDateOfBirth(user)) return true;
  if (isClubOnlyAccount(user) && !user.adminClubId) return true;
  return false;
}

export function homePath(user) {
  if (needsProfile(user)) return '/profile';
  if (isSupportAdminAccount(user) && !isSuperAdminAccount(user) && !hasRole(user, 'admin')) return '/support-desk';
  if (isOpsAdminAccount(user)) return '/admin';
  if (isClubOnlyAccount(user)) return '/clubs';
  if (hasRole(user, 'club_admin') && !hasRole(user, 'athlete')) return '/clubs';
  return '/dashboard';
}

export function afterJoinPath(user) {
  if (needsProfile(user)) return '/profile';
  const path = homePath(user);
  return path === '/dashboard' ? '/dashboard?connect=strava' : path;
}
