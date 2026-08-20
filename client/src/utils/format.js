export function formatDuration(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDistance(meters) {
  if (!meters) return '0 km';
  return `${(Number(meters) / 1000).toFixed(2)} km`;
}

const DURATION_SPORTS = [
  'workout', 'weight', 'yoga', 'crossfit', 'pilates', 'stretch', 'hiit',
  'highintensity', 'climb', 'stair', 'elliptical', 'meditation', 'taichi',
  'strength', 'functional', 'prepare_for_battle',
];

const SWIM_SPORTS = ['swim'];
const DISTANCE_SPORTS = [
  'run', 'ride', 'cycle', 'bike', 'walk', 'hike', 'trail', 'row', 'kayak',
  'canoe', 'skate', 'ski', 'surf', 'sail', 'paddle', 'snowshoe',
];

export function activityMetric(type, sportType, distance) {
  const t = `${type || ''} ${sportType || ''}`.toLowerCase();
  if (DURATION_SPORTS.some((k) => t.includes(k))) return 'duration';
  if (SWIM_SPORTS.some((k) => t.includes(k))) return 'swim';
  if (DISTANCE_SPORTS.some((k) => t.includes(k))) return 'distance';
  if (!distance || Number(distance) < 50) return 'duration';
  return 'distance';
}

export function formatActivityPrimary(activity) {
  const metric = activityMetric(activity.type, activity.sportType, activity.distance);
  if (metric === 'swim') return `${Math.round(Number(activity.distance) || 0)} m`;
  if (metric === 'distance') return formatDistance(activity.distance);
  return formatDuration(activity.movingTime || activity.elapsedTime);
}

export function formatActivitySecondary(activity) {
  const metric = activityMetric(activity.type, activity.sportType, activity.distance);
  if (metric === 'duration') {
    return activity.calories ? `${Math.round(activity.calories)} kcal` : '';
  }
  return formatDuration(activity.movingTime);
}

export function formatPace(mps) {
  if (!mps || Number(mps) <= 0) return '—';
  const secPerKm = 1000 / Number(mps);
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

const SPEED_SPORTS = [
  'ride', 'cycle', 'bike', 'ebike', 'gravel', 'velomobile', 'handcycle',
  'ski', 'snowboard', 'skate', 'sail', 'surf', 'kayak', 'canoe', 'paddle',
  'kitesurf', 'windsurf', 'wheelchair',
];

export function effortKind(type, sportType) {
  const t = `${type || ''} ${sportType || ''}`.toLowerCase();
  if (DURATION_SPORTS.some((k) => t.includes(k))) return 'duration';
  if (t.includes('swim')) return 'swim';
  if (t.includes('row') && !t.includes('kayak')) return 'row';
  if (SPEED_SPORTS.some((k) => t.includes(k))) return 'speed';
  return 'pace';
}

export function formatSpeed(mps, digits = 1) {
  if (!mps || Number(mps) <= 0) return '—';
  return `${(Number(mps) * 3.6).toFixed(digits)} km/h`;
}

function formatIntervalPace(mps, meters, suffix) {
  if (!mps || Number(mps) <= 0) return '—';
  const sec = meters / Number(mps);
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}:${String(rem).padStart(2, '0')} ${suffix}`;
}

export function formatSwimPace(mps) {
  return formatIntervalPace(mps, 100, '/100m');
}

export function formatRowPace(mps) {
  return formatIntervalPace(mps, 500, '/500m');
}

export function formatEffort(activity) {
  const kind = effortKind(activity?.type, activity?.sportType);
  const mps = Number(activity?.avgSpeed);
  if (kind === 'speed') return formatSpeed(mps);
  if (kind === 'swim') return formatSwimPace(mps);
  if (kind === 'row') return formatRowPace(mps);
  if (kind === 'duration') return '';
  return formatPace(mps);
}

export function effortStat(activity) {
  const kind = effortKind(activity?.type, activity?.sportType);
  const formatted = formatEffort(activity);
  if (kind === 'speed') {
    return { kind, label: 'Speed', value: formatted.replace(/ km\/h$/, ''), unit: 'km/h' };
  }
  if (kind === 'swim') {
    return { kind, label: 'Pace', value: formatted.replace(/ \/100m$/, ''), unit: '/100m' };
  }
  if (kind === 'row') {
    return { kind, label: 'Pace', value: formatted.replace(/ \/500m$/, ''), unit: '/500m' };
  }
  if (kind === 'duration' || formatted === '—') {
    return { kind, label: null, value: '', unit: '' };
  }
  return { kind, label: 'Pace', value: formatted.replace(/ \/km$/, ''), unit: '/km' };
}

export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateShort(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(value) {
  if (!value) return '';
  const text = String(value);
  return text.slice(0, 5);
}

export function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const ACTIVITY_ICONS = {
  Run: '🏃',
  Ride: '🚴',
  Swim: '🏊',
  Walk: '🚶',
  Hike: '🥾',
  VirtualRide: '🚴',
  VirtualRun: '🏃',
  Workout: '⚡',
  WeightTraining: '🏋️',
  Yoga: '🧘',
  HIIT: '💥',
  default: '⚡',
};

export function getActivityIcon(type) {
  return ACTIVITY_ICONS[type] || ACTIVITY_ICONS.default;
}

export const ACTIVITY_TYPE_OPTIONS = [
  { value: 'Run', label: 'Run' },
  { value: 'Ride', label: 'Ride' },
  { value: 'Swim', label: 'Swim' },
  { value: 'Walk', label: 'Walk' },
  { value: 'Hike', label: 'Hike' },
  { value: 'Workout', label: 'Workout' },
  { value: 'WeightTraining', label: 'Weights' },
  { value: 'Yoga', label: 'Yoga' },
  { value: 'HIIT', label: 'HIIT' },
];

export const DEFAULT_ACTIVITY_TYPE = 'Run';

const ACTIVITY_TYPE_STORAGE_KEY = 'emcActivityType';

export function visibleActivityTypeOptions(user) {
  const selected = Array.isArray(user?.syncActivityTypes) && user.syncActivityTypes.length
    ? user.syncActivityTypes
    : ACTIVITY_TYPE_OPTIONS.map((o) => o.value);
  const options = ACTIVITY_TYPE_OPTIONS.filter((o) => selected.includes(o.value));
  return options.length ? options : ACTIVITY_TYPE_OPTIONS;
}

export function rememberActivityType(type) {
  if (!type || type === 'all') return;
  try {
    sessionStorage.setItem(ACTIVITY_TYPE_STORAGE_KEY, type);
  } catch {
    /* ignore */
  }
}

export function initialActivityType(user, queryType) {
  const allowed = visibleActivityTypeOptions(user).map((o) => o.value);
  const fallback = allowed.includes(user?.defaultActivityType)
    ? user.defaultActivityType
    : (allowed[0] || DEFAULT_ACTIVITY_TYPE);
  if (queryType && allowed.includes(queryType)) return queryType;
  try {
    const stored = sessionStorage.getItem(ACTIVITY_TYPE_STORAGE_KEY);
    if (stored && allowed.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  return fallback;
}

export const EVENT_TYPES = [
  { value: 'run', label: 'Run' },
  { value: 'bike', label: 'Bike' },
  { value: 'swim', label: 'Swim' },
  { value: 'triathlon', label: 'Triathlon' },
  { value: 'walk', label: 'Walk' },
  { value: 'other', label: 'Other' },
];

export const GOAL_TYPES = [
  { value: 'race', label: 'Race / PB' },
  { value: 'distance', label: 'Distance' },
  { value: 'weekly_mileage', label: 'Weekly mileage' },
  { value: 'time', label: 'Time target' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'other', label: 'Other' },
];
