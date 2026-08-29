import { ACTIVITY_TYPE_OPTIONS, GOAL_TYPES, formatDate, getActivityIcon } from './format';
import { formatKm } from './training';

function timeFromSeconds(total) {
  const n = Number(total);
  if (!n || n <= 0) return '';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function goalTypeLabel(type) {
  return GOAL_TYPES.find((t) => t.value === type)?.label || type;
}

export function activityTypeLabel(type) {
  return ACTIVITY_TYPE_OPTIONS.find((t) => t.value === type)?.label || type || '';
}

export function formatGoalTime(seconds) {
  const stamp = timeFromSeconds(seconds);
  if (!stamp) return null;
  const [h, m, s] = stamp.split(':');
  if (Number(h)) return `${Number(h)}h ${m}m ${s}s`;
  return `${Number(m)}m ${s}s`;
}

export function goalProgressLabel(goal) {
  const current = Number(goal.currentValue || 0);
  const target = Number(goal.targetValue || 0);
  if (goal.type === 'race') {
    const bits = [];
    if (target) bits.push(goal.status === 'completed' ? formatKm(target) : `${formatKm(current)} of ${formatKm(target)}`);
    const time = formatGoalTime(goal.targetTime);
    if (time) bits.push(time);
    return bits.join(' · ') || null;
  }
  if (goal.type === 'weekly_mileage') {
    const week = goal.weekLabel ? `This week (${goal.weekLabel})` : 'This week';
    return target ? `${week} · ${formatKm(current)} of ${formatKm(target)}` : `${week} · ${formatKm(current)}`;
  }
  if (goal.type === 'distance') {
    return target ? `${formatKm(current)} of ${formatKm(target)}` : formatKm(current);
  }
  if (goal.type === 'time') {
    const now = formatGoalTime(current);
    const goalTime = formatGoalTime(target);
    if (goalTime && now && goal.status !== 'completed') return `${now} of ${goalTime}`;
    return goalTime;
  }
  return null;
}

export function showsProgress(goal) {
  return ['distance', 'weekly_mileage', 'race', 'time'].includes(goal.type);
}

export function goalStatusLabel(status) {
  if (status === 'completed') return 'Completed';
  if (status === 'abandoned') return 'Abandoned';
  return 'Active';
}

export function sortGoals(goals) {
  return [...(goals || [])].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'));
}

function parseDay(date) {
  const day = String(date || '').slice(0, 10);
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function daysUntil(date) {
  const target = parseDay(date);
  if (!target) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((target - start) / 86400000);
}

export function daysUntilLabel(date) {
  const d = daysUntil(date);
  if (d == null) return null;
  if (d < 0) return d === -1 ? 'Yesterday' : `${Math.abs(d)} days ago`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `${d} days`;
}

export function goalDatePassed(goal) {
  const days = daysUntil(goal?.targetDate);
  return days != null && days < 0;
}

export function nextRaceGoal(goals) {
  const dated = (goals || []).filter((g) => g.targetDate && (g.type === 'race' || g.type === 'distance'));
  if (!dated.length) return null;
  const rank = (g) => (g.type === 'race' ? 0 : 1);
  const upcoming = dated
    .map((g) => ({ goal: g, days: daysUntil(g.targetDate) }))
    .filter((row) => row.days != null && row.days >= 0)
    .sort((a, b) => a.days - b.days || rank(a.goal) - rank(b.goal) || Number(a.goal.status === 'completed') - Number(b.goal.status === 'completed'));
  return upcoming[0]?.goal || null;
}

export function goalMetaLine(goal) {
  const sport = activityTypeLabel(goal.activityType);
  return [
    sport ? `${getActivityIcon(goal.activityType)} ${sport}` : null,
    goalTypeLabel(goal.type),
    goal.targetDate ? formatDate(goal.targetDate) : null,
    goalProgressLabel(goal),
  ].filter(Boolean).join(' · ');
}
