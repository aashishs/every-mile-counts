export function hasRole(user, ...roles) {
  return roles.some((role) => user?.roles?.includes(role));
}

export function isClubOnlyAccount(user) {
  const roles = user?.roles || [];
  return roles.includes('club_admin') && !roles.includes('athlete') && !roles.includes('coach') && !roles.includes('app_admin');
}

export function homePath(user) {
  if (isClubOnlyAccount(user)) return '/clubs';
  return '/dashboard';
}
