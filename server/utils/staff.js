export const SUPER_ROLES = ['super_admin', 'app_admin'];
export const OPS_ROLES = ['admin'];
export const SUPPORT_ROLES = ['support_admin'];
export const STAFF_ROLES = [...SUPER_ROLES, ...OPS_ROLES, ...SUPPORT_ROLES];
export const MANAGEABLE_STAFF_ROLES = ['admin', 'support_admin'];

export function roleList(userOrRoles) {
  return Array.isArray(userOrRoles) ? userOrRoles : userOrRoles?.roles || [];
}

export function hasAnyRole(userOrRoles, roles) {
  const have = roleList(userOrRoles);
  return roles.some((role) => have.includes(role));
}

export function isSuperAdminUser(userOrRoles) {
  return hasAnyRole(userOrRoles, SUPER_ROLES);
}

export function isOpsAdminUser(userOrRoles) {
  return hasAnyRole(userOrRoles, OPS_ROLES) || isSuperAdminUser(userOrRoles);
}

export function isSupportStaffUser(userOrRoles) {
  return hasAnyRole(userOrRoles, SUPPORT_ROLES) || isSuperAdminUser(userOrRoles);
}

export function isStaffUser(userOrRoles) {
  return hasAnyRole(userOrRoles, STAFF_ROLES);
}

export const STAFF_ROLE_SQL = `('app_admin', 'super_admin', 'admin', 'support_admin')`;
