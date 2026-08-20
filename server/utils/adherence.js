import { startOfWeek } from './format.js';

export const DEFAULT_WEEKLY_TARGET_DAYS = 5;
export const MIN_WEEKLY_TARGET_DAYS = 3;
export const MAX_WEEKLY_TARGET_DAYS = 7;

export const ADHERENCE_PERIODS = [
  { id: '30', days: 30, label: '1 month' },
  { id: '90', days: 90, label: '3 months' },
  { id: '180', days: 180, label: '6 months' },
  { id: '365', days: 365, label: '1 year' },
];

export function parseWeeklyTargetDays(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_WEEKLY_TARGET_DAYS || n > MAX_WEEKLY_TARGET_DAYS) {
    return DEFAULT_WEEKLY_TARGET_DAYS;
  }
  return n;
}

export function dayKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDay(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function addDays(key, delta) {
  const d = parseDay(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

function mondayOf(key) {
  return dayKey(startOfWeek(parseDay(key)));
}

function daysInclusive(fromKey, toKey) {
  const from = parseDay(fromKey);
  const to = parseDay(toKey);
  return Math.max(1, Math.round((to - from) / 86400000) + 1);
}

export function uniqueDayKeys(activities = []) {
  const set = new Set();
  for (const activity of activities) {
    const key = dayKey(activity?.startDate || activity?.start_date);
    if (key) set.add(key);
  }
  return [...set].sort();
}

export function adherenceLabel(score) {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'building';
}

export function recoveryFromDensity(daysWithActivity, periodDays) {
  const density = periodDays > 0 ? daysWithActivity / periodDays : 0;
  if (density > 0.8) return 'high load — watch recovery';
  if (density > 0.4) return 'steady';
  return 'building';
}

function weekDayCount(daySet, monday) {
  let count = 0;
  for (let i = 0; i < 7; i += 1) {
    if (daySet.has(addDays(monday, i))) count += 1;
  }
  return count;
}

function currentDayStreak(allDays, today) {
  const set = new Set(allDays);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function currentWeekStreak(allDays, today, target) {
  if (!allDays.length) return 0;
  const set = new Set(allDays);
  let monday = mondayOf(today);
  if (weekDayCount(set, monday) < target && today < addDays(monday, 6)) {
    monday = addDays(monday, -7);
  }
  const earliest = mondayOf(allDays[0]);
  let streak = 0;
  while (monday >= earliest) {
    if (weekDayCount(set, monday) >= target) {
      streak += 1;
      monday = addDays(monday, -7);
    } else {
      break;
    }
  }
  return streak;
}

function longestDayStreak(days) {
  if (!days.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i] === addDays(days[i - 1], 1)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function overlappingWeeks(start, today) {
  const weeks = [];
  let monday = mondayOf(start);
  if (monday < start) monday = addDays(monday, 7);
  const last = mondayOf(today);
  while (monday <= last) {
    weeks.push(monday);
    monday = addDays(monday, 7);
  }
  return weeks;
}

function weekSummaries(windowDays, start, today, target) {
  const set = new Set(windowDays);
  const currentMonday = mondayOf(today);
  return overlappingWeeks(start, today).map((monday) => {
    const trained = weekDayCount(set, monday);
    const complete = addDays(monday, 6) < today;
    const current = monday === currentMonday;
    return {
      week: monday,
      days: trained,
      met: trained >= target,
      complete,
      current,
    };
  });
}

function longestWeekStreak(weeks) {
  let best = 0;
  let run = 0;
  for (const week of weeks) {
    if (week.current && !week.complete && !week.met) continue;
    if (week.met) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export function computeAdherence({
  activities = [],
  weeklyTargetDays = DEFAULT_WEEKLY_TARGET_DAYS,
  periodDays = 30,
  now = new Date(),
} = {}) {
  const target = parseWeeklyTargetDays(weeklyTargetDays);
  const today = dayKey(now);
  const allDays = uniqueDayKeys(activities).filter((key) => key <= today);
  const windowDaysCount = Number.isFinite(Number(periodDays)) && Number(periodDays) > 0
    ? Math.round(Number(periodDays))
    : allDays.length
      ? daysInclusive(allDays[0], today)
      : 1;
  const start = addDays(today, -(windowDaysCount - 1));
  const windowDays = allDays.filter((key) => key >= start && key <= today);
  const daysWithActivity = windowDays.length;
  const expectedDays = Math.max(1, Math.round((windowDaysCount / 7) * target));
  const score = Math.min(100, Math.round((daysWithActivity / expectedDays) * 100));
  const weeks = weekSummaries(windowDays, start, today, target);
  const countedWeeks = weeks.filter((week) => week.complete || week.met);
  const weeksHit = countedWeeks.filter((week) => week.met).length;
  const currentWeek = weeks.find((week) => week.current) || null;

  return {
    weeklyTargetDays: target,
    periodDays: windowDaysCount,
    score,
    label: adherenceLabel(score),
    daysWithActivity,
    expectedDays,
    weeksHit,
    weeksConsidered: countedWeeks.length,
    currentWeekDays: currentWeek?.days || 0,
    currentWeekStreak: currentWeekStreak(allDays, today, target),
    longestWeekStreak: longestWeekStreak(weeks),
    currentDayStreak: currentDayStreak(allDays, today),
    longestDayStreak: longestDayStreak(windowDays),
    recoveryIndicator: recoveryFromDensity(daysWithActivity, windowDaysCount),
  };
}

export function computeAdherenceWindows(activities, weeklyTargetDays, now = new Date()) {
  const target = parseWeeklyTargetDays(weeklyTargetDays);
  const periods = {};
  for (const period of ADHERENCE_PERIODS) {
    periods[period.id] = computeAdherence({
      activities,
      weeklyTargetDays: target,
      periodDays: period.days,
      now,
    });
  }
  return { weeklyTargetDays: target, periods };
}
