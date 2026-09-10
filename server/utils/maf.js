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

export function validateMafHeartRate(age, value) {
  const base = mafBase(age);
  if (base == null) return 'Set date of birth first';
  const n = Number(value);
  if (!Number.isFinite(n) || Math.round(n) !== n) return 'MAF must be a whole number';
  if (n < base || n > base + MAF_BONUS_MAX) {
    return `MAF must be between ${base} and ${base + MAF_BONUS_MAX} bpm`;
  }
  return null;
}

export function validateDateOfBirth(value) {
  const s = parseDateOfBirth(value);
  if (!s) return 'Date of birth is required';
  const age = ageFromDob(s);
  if (age == null || age < 8 || age > 100) return 'Enter a valid date of birth';
  return null;
}

export function todayInTimeZone(tz = process.env.APP_TZ || 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(pick('year'), pick('month') - 1, pick('day'));
}

export function ageAndMafFromDob(value, on = new Date(), offset = 0) {
  const age = ageFromDob(value, on);
  return { age, mafHeartRate: mafHeartRate(age, offset), mafOffset: clampMafOffset(offset) };
}

export function isBirthdayOn(value, on = new Date()) {
  const s = parseDateOfBirth(value);
  if (!s) return false;
  const [, month, day] = s.split('-').map(Number);
  const onMonth = on.getMonth() + 1;
  const onDay = on.getDate();
  if (onMonth === month && onDay === day) return true;
  if (month === 2 && day === 29 && onMonth === 2 && onDay === 28) {
    const y = on.getFullYear();
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return !leap;
  }
  return false;
}

export function athleteHrContext(user = {}) {
  const dateOfBirth = user.dateOfBirth ?? user.date_of_birth ?? null;
  const age = user.age ?? ageFromDob(dateOfBirth);
  return {
    dateOfBirth,
    age,
    mafHeartRate: user.mafHeartRate ?? user.maf_heart_rate ?? mafHeartRate(age, user.mafOffset ?? user.maf_offset),
    mafOffset: clampMafOffset(user.mafOffset ?? user.maf_offset),
    maxHeartRate: user.maxHeartRate ?? user.max_heart_rate ?? null,
  };
}
