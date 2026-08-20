import { one } from '../config/db.js';

export const STRAVA_COACH_SHARE_SQL = `(a.source <> 'strava' OR EXISTS (
  SELECT 1 FROM oauth_connections oc
  WHERE oc.user_id = a.athlete_id
    AND oc.provider = 'strava'
    AND oc.coach_share_consented_at IS NOT NULL
))`;

export function isOwnerViewer(req, athleteId) {
  return String(req.user?.id || '') === String(athleteId || '');
}

export function stravaVisibleSql(viewerIdParam) {
  return `(a.source <> 'strava' OR a.athlete_id = ${viewerIdParam} OR EXISTS (
    SELECT 1 FROM oauth_connections oc
    WHERE oc.user_id = a.athlete_id
      AND oc.provider = 'strava'
      AND oc.coach_share_consented_at IS NOT NULL
  ))`;
}

export function stravaShareFilterSql(req, athleteId) {
  if (isOwnerViewer(req, athleteId)) return '';
  if (!(req.user?.roles || []).includes('coach')) return `AND a.source <> 'strava'`;
  return `AND ${STRAVA_COACH_SHARE_SQL}`;
}

export function stravaShareClause(req, athleteId) {
  if (isOwnerViewer(req, athleteId)) return null;
  if (!(req.user?.roles || []).includes('coach')) return `a.source <> 'strava'`;
  return STRAVA_COACH_SHARE_SQL;
}

export async function getCoachShareState(athleteId) {
  const row = await one(
    `SELECT connected, coach_share_consented_at
     FROM oauth_connections
     WHERE user_id = $1 AND provider = 'strava'`,
    [athleteId]
  );
  return {
    connected: Boolean(row?.connected),
    consented: Boolean(row?.coach_share_consented_at),
  };
}

export async function hasCoachShareConsent(athleteId) {
  const state = await getCoachShareState(athleteId);
  return state.consented;
}

export async function canViewerSeeActivity(req, activity) {
  if (!activity) return false;
  if (isOwnerViewer(req, activity.athleteId)) return true;
  if (activity.source !== 'strava') return true;
  if (!(req.user?.roles || []).includes('coach')) return false;
  return hasCoachShareConsent(activity.athleteId);
}

export function stravaActivityUrl(activity) {
  const id = activity?.sourceActivityId;
  if (activity?.source !== 'strava' || !id) return null;
  if (String(id).startsWith('manual-') || String(id).startsWith('file-')) return null;
  return `https://www.strava.com/activities/${id}`;
}
