import { isBeta, versionLabel } from '../utils/appVersion';

export default function Badge({ children, variant = 'muted', className = '' }) {
  return <span className={`badge ${VARIANT_CLASS[variant] || VARIANT_CLASS.muted} ${className}`.trim()}>{children}</span>;
}

export function normalizeRoles(roles) {
  if (!roles) return [];
  if (Array.isArray(roles)) return [...new Set(roles.flatMap(normalizeRoles))];
  if (typeof roles === 'string') {
    return roles
      .replace(/[{}"]/g, '')
      .split(/[,\s]+/)
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

export function RoleBadges({ roles }) {
  const list = normalizeRoles(roles);
  if (!list.length) return <Badge>No role</Badge>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((role) => (
        <Badge key={role} variant={ROLE_VARIANT[role] || 'muted'}>
          {ROLE_LABEL[role] || humanize(role)}
        </Badge>
      ))}
    </span>
  );
}

const VARIANT_CLASS = {
  brand: 'badge-brand',
  accent: 'badge-accent',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  muted: 'badge-muted',
  info: 'badge-info',
};

const ROLE_LABEL = {
  athlete: 'Athlete',
  coach: 'Coach',
  club_admin: 'Club admin',
  app_admin: 'Super admin',
  super_admin: 'Super admin',
  admin: 'Admin',
  support_admin: 'Support admin',
  member: 'Athlete',
};

const ROLE_VARIANT = {
  athlete: 'brand',
  coach: 'accent',
  club_admin: 'info',
  app_admin: 'warning',
  super_admin: 'warning',
  admin: 'info',
  support_admin: 'accent',
  member: 'brand',
};

const STATUS_LABEL = {
  active: 'Active',
  suspended: 'Suspended',
  deleted: 'Deleted',
  pending: 'Pending',
  pending_coach: 'Needs coach',
  read_only: 'Read only',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  cancelled: 'Cancelled',
  used_up: 'Used up',
  disabled: 'Revoked',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_VARIANT = {
  active: 'success',
  suspended: 'danger',
  deleted: 'muted',
  pending: 'warning',
  pending_coach: 'warning',
  read_only: 'muted',
  expiring_soon: 'warning',
  expired: 'danger',
  cancelled: 'muted',
  used_up: 'warning',
  disabled: 'muted',
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  closed: 'muted',
};

export function StatusBadge({ value, fallback }) {
  const key = String(value || '').toLowerCase();
  return (
    <Badge variant={STATUS_VARIANT[key] || 'muted'}>
      {STATUS_LABEL[key] || fallback || humanize(value)}
    </Badge>
  );
}

export function VersionBadge({ className = '' }) {
  return (
    <Badge variant={isBeta ? 'warning' : 'muted'} className={className}>
      {isBeta ? 'Beta' : versionLabel}
    </Badge>
  );
}

export function StravaBadge({ connected, status }) {
  if (!connected) return <Badge variant="muted">Not connected</Badge>;
  if (status === 'running') return <Badge variant="info">Syncing</Badge>;
  if (status === 'error') return <Badge variant="danger">Sync failed</Badge>;
  if (status === 'ok' || status === 'connected') return <Badge variant="success">Connected</Badge>;
  if (status === 'never_synced') return <Badge variant="warning">Never synced</Badge>;
  return <Badge variant="success">Connected</Badge>;
}

export function CodeTypeBadge({ type }) {
  const labels = {
    athlete: 'Athlete',
    coach: 'Coach',
    club: 'Club',
    universal: 'Any account',
  };
  const variants = {
    athlete: 'brand',
    coach: 'accent',
    club: 'info',
    universal: 'muted',
  };
  return <Badge variant={variants[type] || 'muted'}>{labels[type] || humanize(type)}</Badge>;
}

function humanize(value) {
  if (!value) return 'Unknown';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
