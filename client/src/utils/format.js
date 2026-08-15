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

export function formatPace(mps) {
  if (!mps || Number(mps) <= 0) return '—';
  const secPerKm = 1000 / Number(mps);
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
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
  default: '⚡',
};

export function getActivityIcon(type) {
  return ACTIVITY_ICONS[type] || ACTIVITY_ICONS.default;
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
