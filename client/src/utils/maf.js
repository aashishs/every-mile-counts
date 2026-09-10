export const MAF_BONUS_MAX = 5;

export function parseDateOfBirth(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return s;
}

export function ageFromDob(value, on = new Date()) {
  const s = parseDateOfBirth(value);
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  let age = on.getFullYear() - y;
  const month = on.getMonth() + 1;
  const day = on.getDate();
  if (month < m || (month === m && day < d)) age -= 1;
  return age;
}

export function mafBase(age) {
  if (age == null || !Number.isFinite(Number(age)) || age < 1) return null;
  return 180 - Math.round(Number(age));
}

export function clampMafOffset(offset) {
  const n = Math.round(Number(offset) || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAF_BONUS_MAX, Math.max(0, n));
}

export function mafHeartRate(age, offset = 0) {
  const base = mafBase(age);
  if (base == null) return null;
  return base + clampMafOffset(offset);
}

export function mafOffsetFromValue(age, value) {
  const base = mafBase(age);
  if (base == null || value == null || value === '') return 0;
  return clampMafOffset(Number(value) - base);
}

export function clampMafHeartRate(age, value) {
  const base = mafBase(age);
  if (base == null) return '';
  if (value == null || value === '') return base;
  const n = Number(value);
  if (!Number.isFinite(n)) return base;
  return Math.min(base + MAF_BONUS_MAX, Math.max(base, Math.round(n)));
}

export function todayIsoDate(on = new Date()) {
  const y = on.getFullYear();
  const m = String(on.getMonth() + 1).padStart(2, '0');
  const d = String(on.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
