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

export function activityMetric(type, sportType) {
  const t = `${type || ''} ${sportType || ''}`.toLowerCase();
  if (DURATION_SPORTS.some((k) => t.includes(k))) return 'duration';
  if (SWIM_SPORTS.some((k) => t.includes(k))) return 'swim';
  if (DISTANCE_SPORTS.some((k) => t.includes(k))) return 'distance';
  return 'duration';
}

export function sportFamily(activity) {
  if (!activity) return '';
  const t = `${activity.type || ''} ${activity.sportType || ''}`.toLowerCase();
  if (t.includes('swim')) return 'Swim';
  if (t.includes('ride') || t.includes('cycle') || t.includes('bike')) return 'Ride';
  if (t.includes('run') || t.includes('trail')) return 'Run';
  if (t.includes('walk')) return 'Walk';
  if (t.includes('hike')) return 'Hike';
  if (t.includes('yoga')) return 'Yoga';
  if (t.includes('weight') || t.includes('strength')) return 'WeightTraining';
  if (t.includes('hiit') || t.includes('highintensity')) return 'HIIT';
  if (t.includes('workout')) return 'Workout';
  return activity?.type || 'Other';
}

export function formatActivityPrimary(activity) {
  const metric = activityMetric(activity?.type, activity?.sportType);
  if (metric === 'swim' && Number(activity?.distance) > 0) return `${Math.round(Number(activity.distance))} m`;
  if (metric === 'distance' && Number(activity?.distance) > 0) return formatDistance(activity.distance);
  const seconds = activity?.movingTime || activity?.elapsedTime;
  if (seconds) return formatDuration(seconds);
  if (Number(activity?.calories) > 0) return `${Math.round(activity.calories)} kcal`;
  return '';
}

export function formatActivitySecondary(activity) {
  const metric = activityMetric(activity.type, activity.sportType);
  if (metric === 'duration') {
    return Number(activity.calories) > 0 ? `${Math.round(activity.calories)} kcal` : '';
  }
  return formatDuration(activity.movingTime || activity.elapsedTime);
}

export function activitySummaryParts(activity) {
  const metric = activityMetric(activity?.type, activity?.sportType);
  const time = (activity?.movingTime || activity?.elapsedTime)
    ? formatDuration(activity.movingTime || activity.elapsedTime)
    : null;
  const hr = Number(activity?.avgHeartrate) > 0 ? `${Math.round(activity.avgHeartrate)} bpm` : null;
  const kcal = Number(activity?.calories) > 0 ? `${Math.round(activity.calories)} kcal` : null;
  if (metric === 'duration') return [time, kcal, hr].filter(Boolean);
  const dist = Number(activity?.distance) > 0
    ? (metric === 'swim' ? `${Math.round(activity.distance)} m` : formatDistance(activity.distance))
    : null;
  const effort = formatEffort(activity);
  const effortText = effort && effort !== '—' ? effort : null;
  return [dist, time, effortText, hr].filter(Boolean);
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
  const metric = activityMetric(type, sportType);
  if (metric === 'duration') return 'duration';
  if (metric === 'swim') return 'swim';
  const t = `${type || ''} ${sportType || ''}`.toLowerCase();
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
  if (kind === 'duration') return null;
  const mps = Number(activity?.avgSpeed);
  if (kind === 'speed') return formatSpeed(mps);
  if (kind === 'swim') return formatSwimPace(mps);
  if (kind === 'row') return formatRowPace(mps);
  return formatPace(mps);
}

export function formatActivityDistance(activity) {
  const metric = activityMetric(activity?.type, activity?.sportType);
  if (metric === 'swim' && Number(activity?.distance) > 0) return `${Math.round(Number(activity.distance))} m`;
  if (metric === 'distance' && Number(activity?.distance) > 0) return formatDistance(activity.distance);
  return '';
}

export function formatActivityEffort(activity) {
  if (effortKind(activity?.type, activity?.sportType) === 'duration') return '';
  const effort = formatEffort(activity);
  return effort && effort !== '—' ? effort : '';
}

export function effortStat(activity) {
  const kind = effortKind(activity?.type, activity?.sportType);
  if (kind === 'duration') return { kind, label: null, value: '', unit: '' };
  const formatted = formatEffort(activity);
  if (!formatted || formatted === '—') {
    return { kind, label: null, value: '', unit: '' };
  }
  if (kind === 'speed') {
    return { kind, label: 'Speed', value: formatted.replace(/ km\/h$/, ''), unit: 'km/h' };
  }
  if (kind === 'swim') {
    return { kind, label: 'Pace', value: formatted.replace(/ \/100m$/, ''), unit: '/100m' };
  }
  if (kind === 'row') {
    return { kind, label: 'Pace', value: formatted.replace(/ \/500m$/, ''), unit: '/500m' };
  }
  return { kind, label: 'Pace', value: formatted.replace(/ \/km$/, ''), unit: '/km' };
}

export function isCalendarDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

export function parseStamp(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (isCalendarDate(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const DATE_OPTS = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
const DATE_SHORT_OPTS = { month: 'short', day: 'numeric', year: 'numeric' };
const DATETIME_OPTS = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

export function formatDate(date) {
  const d = parseStamp(date);
  if (!d) return '';
  return d.toLocaleDateString('en-US', DATE_OPTS);
}

export function formatDateShort(date) {
  const d = parseStamp(date);
  if (!d) return '';
  return d.toLocaleDateString('en-US', DATE_SHORT_OPTS);
}

export function formatTime(value) {
  if (!value) return '';
  const text = String(value);
  return text.slice(0, 5);
}

export function formatDateTime(date) {
  const d = parseStamp(date);
  if (!d) return '';
  if (isCalendarDate(date)) return formatDate(date);
  return d.toLocaleString('en-US', DATETIME_OPTS);
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

export const GROUP_SESSION_SPORTS = [
  { value: 'run', label: 'Run' },
  { value: 'ride', label: 'Ride' },
  { value: 'swim', label: 'Swim' },
  { value: 'walk', label: 'Walk' },
  { value: 'other', label: 'Other' },
];

export const GOAL_ACTIVITY_TYPES = ['Run', 'Ride', 'Swim', 'Walk'];

export const GOAL_TYPES = [
  { value: 'race', label: 'Race / PB' },
  { value: 'distance', label: 'Distance' },
  { value: 'weekly_mileage', label: 'Weekly mileage' },
  { value: 'time', label: 'Time target' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'other', label: 'Other' },
];
