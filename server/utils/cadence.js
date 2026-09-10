const STEP_RE = /run|walk|hike|trail/;

export function isStepCadenceSport(type, sportType) {
  return STEP_RE.test(`${type || ''} ${sportType || ''}`.toLowerCase());
}

/**
 * Total steps/min for run/walk/hike.
 * Strava and FIT store one-foot cadence; Garmin's activity API already sends both feet.
 * Values already at total SPM (>= 130) are left as-is so a re-sync cannot double twice.
 */
export function stepsPerMinute(value, activity = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (!isStepCadenceSport(activity.type, activity.sportType || activity.sport)) return n;
  if (String(activity.source || '').toLowerCase() === 'garmin') return n;
  return n < 130 ? n * 2 : n;
}
