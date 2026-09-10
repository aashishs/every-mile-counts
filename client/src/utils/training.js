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

export function dayKey(value) {
  return String(value || '').slice(0, 10);
}

export function calendarEvents(workouts = [], dayNotes = []) {
  const events = workouts.map((w) => ({
    id: w.id,
    eventDate: w.scheduledDate,
    dotClass: calendarDot(w),
  }));
  const workoutDays = new Set(workouts.map((w) => dayKey(w.scheduledDate)));
  for (const note of dayNotes) {
    const day = dayKey(note.noteDate);
    if (!day || workoutDays.has(day)) continue;
    events.push({ id: `note-${note.id}`, eventDate: day, dotClass: 'bg-amber-300' });
  }
  return events;
}

export function notesOnDay(dayNotes, date) {
  const key = dayKey(date);
  return (dayNotes || []).filter((n) => dayKey(n.noteDate) === key);
}

export const UNAVAILABLE_REASONS = [
  { id: 'injury', label: 'Injury' },
  { id: 'travel', label: 'Travel' },
  { id: 'rest', label: 'Rest' },
  { id: 'other', label: 'Other' },
];

export function unavailableOnDay(list, date) {
  const key = dayKey(date);
  return (list || []).find((row) => dayKey(row.unavailableDate) === key) || null;
}

export function unavailableDays(list) {
  return [...new Set((list || []).map((row) => dayKey(row.unavailableDate)).filter(Boolean))];
}

export function unavailableLabel(row) {
  if (!row) return '';
  const reason = UNAVAILABLE_REASONS.find((r) => r.id === row.reason)?.label || 'Can’t train';
  return row.note ? `${reason} · ${row.note}` : reason;
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

function addDays(ymdStr, days) {
  const d = new Date(`${ymdStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekRange(ymdStr, weekStartsOn = 1) {
  const startOn = Number.isInteger(Number(weekStartsOn)) && Number(weekStartsOn) >= 0 && Number(weekStartsOn) <= 6
    ? Number(weekStartsOn)
    : 1;
  const d = new Date(`${ymdStr}T00:00:00`);
  const offset = (d.getDay() - startOn + 7) % 7;
  const from = addDays(ymdStr, -offset);
  return { from, to: addDays(from, 6) };
}

export function weekSpanText(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const monthDay = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (sameMonth) return `${monthDay(a)}–${b.getDate()}`;
  return `${monthDay(a)} – ${monthDay(b)}`;
}

export function isRestWorkout(workout) {
  return String(workout?.workoutType || '').toLowerCase() === 'rest';
}

export function summarizeWeek(workouts, today = ymdToday(), weekStartsOn = 1) {
  return buildWeekRecap(workouts, [], today, weekStartsOn);
}

export function buildWeekRecap(workouts, unavailable = [], today = ymdToday(), weekStartsOn = 1) {
  const { from, to } = weekRange(today, weekStartsOn);
  const inWeek = (workouts || []).filter((w) => {
    const day = dayKey(w.scheduledDate);
    return day >= from && day <= to;
  });
  const daysOff = (unavailable || []).filter((row) => {
    const day = dayKey(row.unavailableDate);
    return day >= from && day <= to;
  });
  const countable = inWeek.filter((w) => !isRestWorkout(w) && w.completionStatus !== 'skipped');
  const plannedDistance = countable.reduce((sum, w) => sum + Number(w.distance || 0), 0);
  const actualDistance = countable.reduce((sum, w) => sum + Number(w.actualDistance || 0), 0);
  const done = countable.filter((w) => ['completed', 'partial'].includes(w.completionStatus));
  const open = countable.filter((w) => ['planned', 'pending_match'].includes(w.completionStatus));
  const missed = countable.filter((w) => w.completionStatus === 'missed');
  return {
    from,
    to,
    isWeekEnd: today === to,
    plannedDistance,
    actualDistance,
    done: done.length,
    total: countable.length,
    open,
    missed: missed.length,
    daysOff,
    hasAnything: countable.length > 0 || daysOff.length > 0,
  };
}

export function plannedActualLine(workout) {
  const planned = workout.distance != null ? formatKm(workout.distance) : null;
  const actual = workout.activityId && workout.actualDistance != null ? formatKm(workout.actualDistance) : null;
  if (planned && actual) return `Planned ${planned} → ${actual} done`;
  if (planned) return `Planned ${planned}`;
  if (actual) return `${actual} logged`;
  return null;
}
