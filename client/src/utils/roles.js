export function hasRole(user, ...roles) {
  return roles.some((role) => user?.roles?.includes(role));
}

export function isAppAdminAccount(user) {
  return hasRole(user, 'app_admin');
}

export function isClubOnlyAccount(user) {
  const roles = user?.roles || [];
  return roles.includes('club_admin') && !roles.includes('athlete') && !roles.includes('coach') && !roles.includes('app_admin');
}

export function homePath(user) {
  if (isAppAdminAccount(user)) return '/admin';
  if (isClubOnlyAccount(user)) return '/clubs';
  if (hasRole(user, 'club_admin') && !hasRole(user, 'athlete')) return '/clubs';
  return '/dashboard';
}

export function afterJoinPath(user) {
  const path = homePath(user);
  return path === '/dashboard' ? '/dashboard?connect=strava' : path;
}
