export const ACTIVITY_TYPES = [
  'Run',
  'Ride',
  'Swim',
  'Walk',
  'Hike',
  'Workout',
  'WeightTraining',
  'Yoga',
  'HIIT',
];

export function activityTypeBlob(act) {
  return `${act?.type || ''} ${act?.sport_type || act?.sportType || ''}`.toLowerCase();
}

export function sportFamilyFromBlob(blob) {
  const t = String(blob || '');
  if (t.includes('swim')) return 'Swim';
  if (t.includes('ride') || t.includes('cycle') || t.includes('bike')) return 'Ride';
  if (t.includes('run') || t.includes('trail')) return 'Run';
  if (t.includes('walk')) return 'Walk';
  if (t.includes('hike')) return 'Hike';
  if (t.includes('yoga')) return 'Yoga';
  if (t.includes('weight') || t.includes('strength')) return 'WeightTraining';
  if (t.includes('hiit') || t.includes('highintensity')) return 'HIIT';
  if (t.includes('workout')) return 'Workout';
  return null;
}

export function sportFamilyOf(act) {
  return sportFamilyFromBlob(activityTypeBlob(act));
}

export function normalizeSyncTypes(input) {
  const picked = [...new Set((Array.isArray(input) ? input : []).filter((t) => ACTIVITY_TYPES.includes(t)))];
  if (!picked.length) {
    const err = new Error('Select at least one activity type');
    err.status = 400;
    throw err;
  }
  return ACTIVITY_TYPES.filter((t) => picked.includes(t));
}

export function isAllSyncTypes(types) {
  const list = Array.isArray(types) ? types : [];
  return list.length === ACTIVITY_TYPES.length && ACTIVITY_TYPES.every((t) => list.includes(t));
}

export function parseStoredSyncTypes(value) {
  if (!value) return ACTIVITY_TYPES.slice();
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return normalizeSyncTypes(parsed);
  } catch {
    return ACTIVITY_TYPES.slice();
  }
}

export function activityMatchesSyncTypes(act, types) {
  const family = sportFamilyOf(act);
  if (!family) return false;
  const allowed = parseStoredSyncTypes(types);
  return allowed.includes(family);
}

export function typesEqual(a, b) {
  const left = parseStoredSyncTypes(a);
  const right = parseStoredSyncTypes(b);
  return left.length === right.length && left.every((t, i) => t === right[i]);
}

const FAMILY_PATTERNS = {
  Run: ['%run%', '%trail%'],
  Ride: ['%ride%', '%cycle%', '%bike%'],
  Swim: ['%swim%'],
  Walk: ['%walk%'],
  Hike: ['%hike%'],
  Yoga: ['%yoga%'],
  HIIT: ['%hiit%', '%highintensity%'],
  WeightTraining: ['%weight%', '%strength%'],
  Workout: ['%workout%'],
};

export function familySqlClause(types, alias = 'a') {
  const allowed = parseStoredSyncTypes(types);
  if (isAllSyncTypes(allowed)) return null;
  const blob = `LOWER(COALESCE(${alias}.type,'') || ' ' || COALESCE(${alias}.sport_type,''))`;
  const parts = allowed.map((type) => {
    const likes = FAMILY_PATTERNS[type] || [`%${String(type).toLowerCase()}%`];
    return `(${likes.map((p) => `${blob} LIKE '${p}'`).join(' OR ')})`;
  });
  return parts.length ? `(${parts.join(' OR ')})` : 'FALSE';
}
