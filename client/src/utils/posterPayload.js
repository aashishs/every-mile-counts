import { activityMetric } from './format.js';

export const BRAND_NAME = 'EVERY MILE COUNTS';
export const BRAND_SITE = 'everymilecounts.in';

export const POSTER_SIZE = { id: 'story', width: 1080, height: 1920 };

export const POSTER_STYLES = [
  { id: 'night', label: 'Night' },
  { id: 'ember', label: 'Race' },
  { id: 'light', label: 'Light' },
];

export const TEMPLATES = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'performance', label: 'Performance' },
  { id: 'race', label: 'Race' },
  { id: 'achievement', label: 'Achievement' },
  { id: 'training', label: 'Training' },
];

export const DEFAULT_OPTIONS = {
  showPace: true,
  showHr: true,
  showElevation: true,
  showDuration: true,
  showName: false,
  showMap: true,
  style: 'night',
};

const PRIVATE_KEYS = [
  'email',
  'phone',
  'token',
  'accessToken',
  'refreshToken',
  'password',
  'coachNotes',
  'instructions',
  'raw',
  'polyline',
  'gpsPoints',
];

export function formatClockDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.round(n % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPosterDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}

export function formatPosterDistance(meters, metric) {
  const n = Number(meters);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (metric === 'swim') return `${Math.round(n)} M`;
  return `${(n / 1000).toFixed(2)} KM`;
}

export function formatPosterPace(mps, metric) {
  if (metric === 'duration' || metric === 'swim') return null;
  const speed = Number(mps);
  if (!Number.isFinite(speed) || speed <= 0) return null;
  const secPerKm = 1000 / speed;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /KM`;
}

export function availableTemplates(shareContext = {}) {
  return TEMPLATES.filter((t) => {
    if (t.id === 'race') return Boolean(shareContext.event?.name);
    if (t.id === 'achievement') return Boolean(shareContext.achievements?.length);
    if (t.id === 'training') return Boolean(shareContext.plannedWorkout);
    return true;
  });
}

export function defaultTemplate(shareContext = {}) {
  const ids = availableTemplates(shareContext).map((t) => t.id);
  return ['achievement', 'race', 'training', 'performance', 'minimal'].find((id) => ids.includes(id)) || 'minimal';
}

function metricOf(activity) {
  return activityMetric(activity?.type, activity?.sportType, activity?.distance);
}

function displayName(value) {
  const name = String(value || '').trim();
  if (!name) return null;
  if (name.includes('@')) return null;
  return name.slice(0, 32).toUpperCase();
}

export function buildPosterModel({
  activity,
  athleteName,
  shareContext = {},
  template = 'minimal',
  options = DEFAULT_OPTIONS,
  route = null,
} = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allowed = availableTemplates(shareContext).map((t) => t.id);
  const kind = allowed.includes(template) ? template : defaultTemplate(shareContext);
  const metric = metricOf(activity || {});
  const duration = formatClockDuration(activity?.movingTime || activity?.elapsedTime);
  const distance = formatPosterDistance(activity?.distance, metric);
  const pace = opts.showPace ? formatPosterPace(activity?.avgSpeed, metric) : null;
  const hrValue = opts.showHr && Number(activity?.avgHeartrate) > 0
    ? `${Math.round(Number(activity.avgHeartrate))}`
    : null;
  const elevValue = opts.showElevation && Number(activity?.elevationGain) > 0
    ? `${Math.round(Number(activity.elevationGain))} m`
    : null;
  const name = opts.showName ? displayName(athleteName) : null;
  const date = formatPosterDate(activity?.startDate || activity?.startDateLocal);
  const title = String(activity?.name || activity?.type || 'ACTIVITY').toUpperCase();
  const sport = String(activity?.type || '').toUpperCase();
  const achievement = shareContext.achievements?.[0] || null;
  const event = shareContext.event || null;
  const workout = shareContext.plannedWorkout || null;

  const metrics = [];
  if (distance) metrics.push({ label: 'Distance', value: distance.replace(' KM', ' km').replace(' M', ' m') });
  if (opts.showDuration && duration) metrics.push({ label: 'Time', value: duration });
  if (pace) metrics.push({ label: 'Pace', value: pace.replace('/KM', '/km') });
  if (elevValue) metrics.push({ label: 'Elev', value: elevValue });
  if (hrValue) metrics.push({ label: 'Avg HR', value: `${hrValue} bpm` });

  const stats = [];
  if (kind === 'performance' || kind === 'minimal') {
    if (opts.showDuration && duration && distance) stats.push({ text: duration });
    if (pace) stats.push({ text: pace });
    if (kind === 'performance') {
      if (hrValue) stats.push({ text: `♥  ${hrValue} AVG HR` });
      if (elevValue) stats.push({ text: `↑  ${elevValue.toUpperCase()} ELEVATION` });
    }
  }

  const model = {
    template: kind,
    style: POSTER_STYLES.some((s) => s.id === opts.style) ? opts.style : 'night',
    brand: BRAND_NAME,
    site: BRAND_SITE,
    kicker: null,
    subtitle: [sport, date].filter(Boolean).join('  ·  ') || null,
    title,
    athleteName: name,
    primary: distance || (opts.showDuration ? duration : null),
    secondary: distance && opts.showDuration ? duration : null,
    tertiary: pace,
    metrics,
    stats: stats.filter((s) => s.text),
    footerDate: date || null,
    achievementHeadline: null,
    achievementTitle: null,
    eventName: null,
    planned: null,
    actual: null,
    completion: null,
    route: opts.showMap !== false && Array.isArray(route?.points) && route.points.length >= 8
      ? route.points.map((p) => ({ x: p.x, y: p.y }))
      : null,
  };

  if (kind === 'minimal') {
    model.stats = [];
  }

  if (kind === 'race' && event?.name) {
    model.kicker = 'RACE DAY';
    model.title = String(event.name).toUpperCase().slice(0, 48);
    model.eventName = model.title;
    model.primary = formatPosterDistance(event.distance || activity?.distance, metric) || model.primary;
    model.achievementHeadline = achievement ? achievement.headline : null;
    const raceDist = formatPosterDistance(event.distance || activity?.distance, metric);
    if (raceDist) {
      const value = raceDist.replace(' KM', ' km').replace(' M', ' m');
      const idx = model.metrics.findIndex((m) => m.label === 'Distance');
      if (idx >= 0) model.metrics[idx].value = value;
      else model.metrics.unshift({ label: 'Distance', value });
    }
  }

  if (kind === 'achievement' && achievement) {
    model.kicker = achievement.headline;
    model.title = String(achievement.title || title).toUpperCase();
    model.achievementHeadline = achievement.headline;
    model.achievementTitle = model.title;
    if (achievement.meters) model.primary = formatPosterDistance(achievement.meters, metric) || model.primary;
    if (achievement.movingTime) model.secondary = formatClockDuration(achievement.movingTime) || model.secondary;
  }

  if (kind === 'training' && workout) {
    const week = workout.weekNumber ? `WEEK ${workout.weekNumber}` : null;
    model.kicker = 'TRAINING SESSION';
    model.title = [workout.programName, week].filter(Boolean).join(' — ').toUpperCase() || title;
    model.planned = [
      formatPosterDistance(workout.plannedDistance, metric),
      formatClockDuration(workout.plannedDuration),
      workout.targetHrZone ? `ZONE ${workout.targetHrZone}` : null,
      workout.workoutType && String(workout.workoutType).toLowerCase() !== 'easy' ? String(workout.workoutType).toUpperCase() : null,
    ].filter(Boolean).join('  •  ') || null;
    model.actual = [
      formatPosterDistance(workout.actualDistance || activity?.distance, metric),
      formatClockDuration(workout.actualDuration || activity?.movingTime),
    ].filter(Boolean).join('  •  ') || null;
    const done = String(workout.completionStatus || '').toLowerCase();
    model.completion = done === 'completed' || done === 'partial'
      ? (done === 'partial' ? 'PARTIAL ✓' : 'COMPLETED ✓')
      : String(workout.completionStatus || '').toUpperCase() || null;
    model.primary = null;
    model.secondary = null;
    model.tertiary = null;
    model.stats = [];
    if (pace) model.stats.push({ text: pace });
    if (hrValue) model.stats.push({ text: `♥  ${hrValue} AVG HR` });
    model.metrics = [
      workout.plannedDistance || workout.plannedDuration
        ? { label: 'Planned', value: [formatPosterDistance(workout.plannedDistance, metric)?.replace(' KM', ' km'), formatClockDuration(workout.plannedDuration)].filter(Boolean).join(' · ') }
        : null,
      { label: 'Actual', value: [formatPosterDistance(workout.actualDistance || activity?.distance, metric)?.replace(' KM', ' km'), formatClockDuration(workout.actualDuration || activity?.movingTime)].filter(Boolean).join(' · ') },
      pace ? { label: 'Pace', value: pace.replace('/KM', '/km') } : null,
    ].filter((row) => row && row.value);
  }

  const serialized = JSON.stringify(model);
  for (const key of PRIVATE_KEYS) {
    if (activity?.[key] && serialized.includes(String(activity[key])) && String(activity[key]).length > 3) {
      throw new Error('Poster payload leaked a private field');
    }
  }
  return model;
}

export function posterFilename(activity) {
  const date = String(activity?.startDate || '').slice(0, 10) || 'activity';
  const slug = String(activity?.name || activity?.type || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'session';
  return `emc-${slug}-${date}.png`;
}
