import { addDaysYmd } from './week.js';

export function dateStamp(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function daysBetweenYmd(from, to) {
  const a = dateStamp(from);
  const b = dateStamp(to);
  if (!a || !b) return 0;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function shiftDate(value, days) {
  const d = dateStamp(value);
  if (!d) return null;
  const n = Number(days) || 0;
  return n ? addDaysYmd(d, n) : d;
}

export function programAnchorDate(program, { workouts = [], weeks = [], phases = [] } = {}) {
  const dates = [
    dateStamp(program?.startDate || program?.start_date),
    ...phases.map((p) => dateStamp(p.startDate || p.start_date)),
    ...weeks.map((w) => dateStamp(w.startDate || w.start_date)),
    ...workouts.map((w) => dateStamp(w.scheduledDate || w.scheduled_date)),
  ]
    .filter(Boolean)
    .sort();
  return dates[0] || null;
}

export function cloneDateShift(program, extras, startDate) {
  const target = dateStamp(startDate);
  const anchor = programAnchorDate(program, extras);
  if (!target || !anchor) return 0;
  return daysBetweenYmd(anchor, target);
}
