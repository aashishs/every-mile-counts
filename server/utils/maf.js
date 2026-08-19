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

export function mafHeartRate(age) {
  if (age == null || !Number.isFinite(Number(age)) || age < 1) return null;
  return 180 - Math.round(Number(age));
}

export function validateDateOfBirth(value) {
  const s = parseDateOfBirth(value);
  if (!s) return 'Date of birth is required';
  const age = ageFromDob(s);
  if (age == null || age < 8 || age > 100) return 'Enter a valid date of birth';
  return null;
}

export function athleteHrContext(user = {}) {
  const dateOfBirth = user.dateOfBirth ?? user.date_of_birth ?? null;
  const age = user.age ?? ageFromDob(dateOfBirth);
  return {
    dateOfBirth,
    age,
    mafHeartRate: user.mafHeartRate ?? user.maf_heart_rate ?? mafHeartRate(age),
    maxHeartRate: user.maxHeartRate ?? user.max_heart_rate ?? null,
  };
}
