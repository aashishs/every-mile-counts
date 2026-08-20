export const WORKOUT_TYPES = [
  'Rest',
  'Recovery',
  'Easy',
  'Long',
  'Tempo',
  'Threshold',
  'Intervals',
  'Hill repeats',
  'Fartlek',
  'Race',
  'Cycling',
  'Swimming',
  'Strength',
  'Mobility',
  'Custom',
];

export const PROGRAM_STATUS_LABEL = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  halted: 'Halted',
  completed: 'Completed',
  archived: 'Archived',
};

export const PROGRAM_STATUS_FILTERS = ['active', 'paused', 'halted', 'completed', 'draft', 'archived'];

export const COMPLETION_LABEL = {
  planned: 'Planned',
  completed: 'Completed',
  partial: 'Partially completed',
  missed: 'Missed',
  skipped: 'Skipped',
  pending_match: 'Pending match',
};

export function statusClass(status) {
  const map = {
    draft: 'bg-slate-500/20 text-slate-200',
    active: 'bg-emerald-500/15 text-emerald-200',
    paused: 'bg-amber-500/15 text-amber-200',
    halted: 'bg-rose-500/15 text-rose-200',
    completed: 'bg-brand/15 text-brand',
    archived: 'bg-slate-500/20 text-muted',
    planned: 'bg-sky-500/15 text-sky-200',
    partial: 'bg-amber-500/15 text-amber-200',
    missed: 'bg-rose-500/15 text-rose-200',
    skipped: 'bg-slate-500/20 text-muted',
    pending_match: 'bg-violet-500/15 text-violet-200',
    Rest: 'bg-slate-500/20 text-muted',
    Race: 'bg-brand/15 text-brand',
  };
  return map[status] || 'bg-ink text-muted';
}

export function calendarDot(workout) {
  if (String(workout.workoutType).toLowerCase() === 'rest') return 'bg-slate-400';
  if (String(workout.workoutType).toLowerCase() === 'race') return 'bg-brand';
  const map = {
    completed: 'bg-emerald-400',
    partial: 'bg-amber-400',
    missed: 'bg-rose-400',
    skipped: 'bg-slate-500',
    pending_match: 'bg-violet-400',
    planned: 'bg-sky-400',
  };
  return map[workout.completionStatus] || 'bg-accent';
}

export function metersToKmInput(meters) {
  if (meters == null || meters === '') return '';
  return (Number(meters) / 1000).toFixed(Number(meters) % 1000 === 0 ? 0 : 2);
}

export function minutesFromSeconds(seconds) {
  if (seconds == null || seconds === '') return '';
  return Math.round(Number(seconds) / 60);
}

export function secondsFromMinutes(minutes) {
  if (minutes === '' || minutes == null) return null;
  return Math.round(Number(minutes) * 60);
}

export function paceToInput(secPerKm) {
  if (!secPerKm) return '';
  const n = Number(secPerKm);
  const min = Math.floor(n / 60);
  const sec = Math.round(n % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function inputToPace(value) {
  if (!value) return null;
  const [min, sec] = String(value).split(':').map(Number);
  if (!Number.isFinite(min)) return null;
  return min * 60 + (Number.isFinite(sec) ? sec : 0);
}

export function formatPaceSec(secPerKm) {
  if (secPerKm == null || Number(secPerKm) <= 0) return '—';
  const n = Number(secPerKm);
  const min = Math.floor(n / 60);
  const sec = Math.round(n % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function formatComparisonValue(metric, side) {
  const value = metric?.[side];
  if (value == null) return '—';
  if (metric.unit === 'm') {
    const n = Number(value);
    return n >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${Math.round(n)} m`;
  }
  if (metric.unit === 's') {
    const n = Number(value);
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }
  if (metric.unit === 'sec_per_km') return formatPaceSec(value);
  if (metric.unit === 'bpm') return `${Math.round(value)} bpm`;
  if (metric.unit === 'zone') return `Z${value}`;
  if (metric.unit === 'w') return `${Math.round(value)} W`;
  return String(value);
}

export function formatKm(meters) {
  if (meters == null) return '—';
  return `${(Number(meters) / 1000).toFixed(2)} km`;
}

export function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
