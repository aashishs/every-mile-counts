export const PROGRAM_STATUSES = ['draft', 'active', 'paused', 'halted', 'completed', 'archived'];
export const LIVE_PROGRAM_STATUSES = ['active', 'paused'];
export const OPEN_PROGRAM_STATUSES = ['draft', 'active', 'paused', 'halted'];
export const WORKOUT_COMPLETION = ['planned', 'completed', 'partial', 'missed', 'skipped', 'pending_match'];

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

export function isRestType(type) {
  return String(type || '').toLowerCase() === 'rest';
}

export function isRaceType(type) {
  return String(type || '').toLowerCase() === 'race';
}

export function normalizeWorkoutType(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Easy';
  const found = WORKOUT_TYPES.find((t) => t.toLowerCase() === raw.toLowerCase());
  return found || 'Custom';
}
