const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function normalizeWeekStartsOn(value) {
  if (value == null || value === '') return 1;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 1;
}

export function ymdInZone(date = new Date(), timeZone = 'UTC') {
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

export function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
  return dt.toISOString().slice(0, 10);
}

export function weekdayOfYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function currentWeekRange({ weekStartsOn = 1, timezone = 'UTC' } = {}, now = new Date()) {
  const startOn = normalizeWeekStartsOn(weekStartsOn);
  const today = ymdInZone(now, timezone);
  const offset = (weekdayOfYmd(today) - startOn + 7) % 7;
  const start = addDaysYmd(today, -offset);
  return {
    start,
    endExclusive: addDaysYmd(start, 7),
    endInclusive: addDaysYmd(start, 6),
    weekStartsOn: startOn,
  };
}

export function weekSpanLabel(weekStartsOn) {
  const startOn = normalizeWeekStartsOn(weekStartsOn);
  return `${SHORT_DAYS[startOn]}–${SHORT_DAYS[(startOn + 6) % 7]}`;
}

export function weekWindowsFrom(currentStart, count = 6) {
  const n = Math.max(1, Number(count) || 6);
  const windows = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = addDaysYmd(currentStart, -i * 7);
    windows.push({
      start,
      endExclusive: addDaysYmd(start, 7),
      endInclusive: addDaysYmd(start, 6),
      isCurrent: i === 0,
    });
  }
  return windows;
}

export function countWeeklyStreak(weeksOldestFirst) {
  const weeks = [...(weeksOldestFirst || [])].reverse();
  if (!weeks.length) return 0;
  let i = 0;
  if (weeks[0].isCurrent && !weeks[0].hit) i = 1;
  let n = 0;
  for (; i < weeks.length; i += 1) {
    if (!weeks[i].hit) break;
    n += 1;
  }
  return n;
}
