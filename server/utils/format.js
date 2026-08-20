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

export function paceFromSpeed(mps) {
  if (!mps || Number(mps) <= 0) return null;
  const secPerKm = 1000 / Number(mps);
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

const DURATION_SPORTS = [
  'workout', 'weight', 'yoga', 'crossfit', 'pilates', 'stretch', 'hiit',
  'highintensity', 'climb', 'stair', 'elliptical', 'meditation', 'taichi',
  'strength', 'functional', 'prepare_for_battle',
];
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
  if (!mps || Number(mps) <= 0) return null;
  return `${(Number(mps) * 3.6).toFixed(digits)} km/h`;
}

export function formatEffort(activity) {
  const kind = effortKind(activity?.type, activity?.sportType);
  const mps = Number(activity?.avgSpeed);
  if (!(mps > 0)) return null;
  if (kind === 'speed') return formatSpeed(mps);
  if (kind === 'swim') {
    const sec = 100 / mps;
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return `${min}:${String(rem).padStart(2, '0')} /100m`;
  }
  if (kind === 'row') {
    const sec = 500 / mps;
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return `${min}:${String(rem).padStart(2, '0')} /500m`;
  }
  if (kind === 'duration') return null;
  const clock = paceFromSpeed(mps);
  return clock ? `${clock} /km` : null;
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

export function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfYear(date = new Date()) {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
