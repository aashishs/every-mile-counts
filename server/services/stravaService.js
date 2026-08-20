import axios from 'axios';
import crypto from 'node:crypto';
import { camel, camelMany, many, one, query } from '../config/db.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import { stravaWebhookUri } from '../utils/urls.js';
import { analyzeActivity } from './analysisService.js';
import { matchActivityToWorkout } from './workoutMatchService.js';
import {
  activityMatchesSyncTypes,
  normalizeSyncTypes,
  parseStoredSyncTypes,
  typesEqual,
} from '../utils/activityTypes.js';

const STRAVA_API = 'https://www.strava.com/api/v3';
const PER_PAGE = 200;
const MAX_PAGES = 250;

const stravaHttp = axios.create({
  timeout: 30000,
});

function stravaTokenBody(fields) {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value != null && value !== '') body.set(key, String(value));
  });
  return body;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function stravaGet(url, accessToken, params, attempt = 0) {
  try {
    return await stravaHttp.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });
  } catch (err) {
    const status = err.response?.status;
    if ((status === 429 || status >= 500) && attempt < 6) {
      const retryAfter = Number(err.response?.headers?.['retry-after'] || 15);
      await sleep((retryAfter + attempt * 2) * 1000);
      return stravaGet(url, accessToken, params, attempt + 1);
    }
    throw err;
  }
}

async function getConnection(userId) {
  const row = await one(
    `SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = 'strava'`,
    [userId]
  );
  return camel(row);
}

async function saveTokens(userId, { accessToken, refreshToken, expiresAt, providerUserId }) {
  await query(
    `INSERT INTO oauth_connections
      (user_id, provider, provider_user_id, access_token_enc, refresh_token_enc, expires_at, connected, updated_at)
     VALUES ($1, 'strava', $2, $3, $4, $5, TRUE, NOW())
     ON CONFLICT (user_id, provider) DO UPDATE SET
       provider_user_id = EXCLUDED.provider_user_id,
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       expires_at = EXCLUDED.expires_at,
       connected = TRUE,
       last_sync_error = NULL,
       updated_at = NOW()`,
    [userId, String(providerUserId), encrypt(accessToken), encrypt(refreshToken), expiresAt]
  );
}

export const STRAVA_REAUTH_MESSAGE = 'Strava access expired. Try Reconnect to continue syncing.';

export function isStravaAuthFailure(err) {
  const status = err?.response?.status || err?.status;
  const msg = String(err?.message || err?.response?.data?.message || '');
  return status === 401 || status === 403 || /unauthorized|invalid[_\s-]*token|status code 401/i.test(msg);
}

export class StravaAuthError extends Error {
  constructor(message = STRAVA_REAUTH_MESSAGE) {
    super(message);
    this.name = 'StravaAuthError';
    this.status = 409;
    this.code = 'strava_reauth';
  }
}

export function friendlyStravaSyncError(err) {
  return isStravaAuthFailure(err) ? STRAVA_REAUTH_MESSAGE : err.message || 'Strava sync failed';
}

export async function refreshStravaToken(conn) {
  try {
    const response = await axios.post(
      'https://www.strava.com/oauth/token',
      stravaTokenBody({
        client_id: String(process.env.STRAVA_CLIENT_ID || '').trim(),
        client_secret: String(process.env.STRAVA_CLIENT_SECRET || '').trim(),
        grant_type: 'refresh_token',
        refresh_token: decrypt(conn.refreshTokenEnc),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    await saveTokens(conn.userId, {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: new Date(response.data.expires_at * 1000),
      providerUserId: conn.providerUserId,
    });
    return response.data.access_token;
  } catch (err) {
    if (isStravaAuthFailure(err)) throw new StravaAuthError();
    throw err;
  }
}

export async function getValidAccessToken(userId) {
  const conn = await getConnection(userId);
  if (!conn?.connected) throw new Error('Strava not connected');
  const expiresAt = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;
  if (Date.now() >= expiresAt - 60000) {
    return refreshStravaToken(conn);
  }
  return decrypt(conn.accessTokenEnc);
}

export async function fetchStravaAthlete(accessToken) {
  const { data } = await stravaGet(`${STRAVA_API}/athlete`, accessToken);
  return data;
}

export async function completeStravaOAuth(userId, tokenData) {
  await saveTokens(userId, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: new Date(tokenData.expires_at * 1000),
    providerUserId: tokenData.athlete?.id,
  });
}

async function userIdForStravaAthlete(stravaAthleteId) {
  const row = await one(
    `SELECT user_id FROM oauth_connections
     WHERE provider = 'strava' AND connected = TRUE AND provider_user_id = $1
     LIMIT 1`,
    [String(stravaAthleteId)]
  );
  return row?.user_id || null;
}

export async function fetchStravaActivity(userId, activityId) {
  const accessToken = await getValidAccessToken(userId);
  const { data } = await stravaGet(`${STRAVA_API}/activities/${activityId}`, accessToken);
  return data;
}

export async function upsertStravaActivityById(userId, activityId) {
  const act = await fetchStravaActivity(userId, activityId);
  const types = await loadUserSyncTypes(userId);
  if (!activityMatchesSyncTypes(act, types)) return null;
  return upsertActivity(userId, 'strava', mapStravaActivity(act));
}

export async function handleStravaWebhookEvent(event) {
  const objectType = event?.object_type;
  const aspect = event?.aspect_type;
  const ownerId = event?.owner_id;
  const objectId = event?.object_id;
  if (!objectType || !ownerId) return;

  if (objectType === 'athlete' && (event?.updates?.authorized === 'false' || event?.updates?.authorized === false)) {
    await query(
      `UPDATE oauth_connections
       SET connected = FALSE, last_sync_error = 'Strava access revoked', updated_at = NOW()
       WHERE provider = 'strava' AND provider_user_id = $1`,
      [String(ownerId)]
    );
    return;
  }

  if (objectType !== 'activity') return;
  const userId = await userIdForStravaAthlete(ownerId);
  if (!userId) return;

  if (aspect === 'delete') {
    await query(
      `DELETE FROM activities WHERE source = 'strava' AND source_activity_id = $1 AND athlete_id = $2`,
      [String(objectId), userId]
    );
    return;
  }
  if (aspect === 'create' || aspect === 'update') {
    await upsertStravaActivityById(userId, objectId);
  }
}

export async function syncAllConnectedStrava() {
  const rows = await many(
    `SELECT user_id FROM oauth_connections WHERE provider = 'strava' AND connected = TRUE`
  );
  let users = 0;
  let activities = 0;
  for (const row of rows) {
    const userId = row.user_id;
    try {
      activities += await syncStravaActivities(userId, { full: false });
      users += 1;
    } catch (err) {
      console.error('[strava] scheduled sync failed', userId, err.message);
    }
  }
  return { users, activities };
}

function stravaClient() {
  return {
    client_id: String(process.env.STRAVA_CLIENT_ID || '').trim(),
    client_secret: String(process.env.STRAVA_CLIENT_SECRET || '').trim(),
  };
}

export function stravaWebhookVerifyToken() {
  const explicit = String(process.env.STRAVA_VERIFY_TOKEN || '').trim();
  if (explicit) return explicit;
  return crypto
    .createHash('sha256')
    .update(`${process.env.JWT_SECRET || 'emc'}:strava-webhook`)
    .digest('hex')
    .slice(0, 32);
}

export async function ensureStravaWebhookSubscription() {
  const { client_id, client_secret } = stravaClient();
  const callbackUrl = stravaWebhookUri();
  if (!client_id || !client_secret || !callbackUrl) return { skipped: true };
  if (callbackUrl.includes('localhost') || callbackUrl.includes('127.0.0.1')) {
    return { skipped: 'local' };
  }

  const verifyToken = stravaWebhookVerifyToken();
  const { data: existing } = await axios.get('https://www.strava.com/api/v3/push_subscriptions', {
    params: { client_id, client_secret },
  });
  const list = Array.isArray(existing) ? existing : [];
  const current = list.find((s) => s.callback_url === callbackUrl);
  if (current) return { ok: true, id: current.id, existing: true };

  for (const sub of list) {
    try {
      await axios.delete(`https://www.strava.com/api/v3/push_subscriptions/${sub.id}`, {
        params: { client_id, client_secret },
      });
    } catch (err) {
      console.error('[strava] webhook delete failed', err.message);
    }
  }

  const body = new URLSearchParams({
    client_id,
    client_secret,
    callback_url: callbackUrl,
    verify_token: verifyToken,
  });
  const { data } = await axios.post('https://www.strava.com/api/v3/push_subscriptions', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return { ok: true, id: data?.id };
}

export function isRelevantStravaActivity(act, types) {
  return activityMatchesSyncTypes(act, types);
}

async function loadUserSyncTypes(userId) {
  const row = camel(await one(`SELECT sync_activity_types FROM users WHERE id = $1`, [userId]));
  return parseStoredSyncTypes(row?.syncActivityTypes);
}

export async function pruneStravaActivitiesOutsideTypes(userId, types) {
  const allowed = parseStoredSyncTypes(types);
  const rows = camelMany(
    await many(
      `SELECT id, type, sport_type FROM activities WHERE athlete_id = $1 AND source = 'strava'`,
      [userId]
    )
  );
  const ids = rows.filter((row) => !activityMatchesSyncTypes(row, allowed)).map((row) => row.id);
  if (!ids.length) return 0;
  await query(`DELETE FROM activities WHERE id = ANY($1::uuid[])`, [ids]);
  return ids.length;
}

export async function saveSyncActivityTypes(userId, types) {
  const normalized = normalizeSyncTypes(types);
  await query(
    `UPDATE users SET
       sync_activity_types = $2::jsonb,
       sync_activity_types_confirmed_at = COALESCE(sync_activity_types_confirmed_at, NOW()),
       default_activity_type = CASE
         WHEN default_activity_type = ANY($3::text[]) THEN default_activity_type
         ELSE $4
       END,
       updated_at = NOW()
     WHERE id = $1`,
    [userId, JSON.stringify(normalized), normalized, normalized[0]]
  );
  return normalized;
}

export async function applySyncActivityTypes(userId, types) {
  const previous = await loadUserSyncTypes(userId);
  const normalized = await saveSyncActivityTypes(userId, types);
  const conn = await getConnection(userId);
  const changed = !typesEqual(previous, normalized);
  let pruned = 0;
  let synced = 0;
  if (changed && (conn?.connected || conn?.lastSyncAt)) {
    pruned = await pruneStravaActivitiesOutsideTypes(userId, normalized);
    if (conn?.connected) {
      synced = await syncStravaActivities(userId, { full: true });
    }
  }
  return { types: normalized, changed, pruned, synced, resynced: Boolean(changed && conn?.connected) };
}

function mapStravaActivity(act) {
  const splits = (act.splits_metric || act.laps || []).map((s) => ({
    distance: s.distance,
    movingTime: s.moving_time || s.elapsed_time,
    pace: s.average_speed ? 1000 / s.average_speed : null,
    elevation: s.elevation_difference,
    hr: s.average_heartrate,
  }));

  return {
    sourceActivityId: String(act.id),
    name: act.name,
    type: act.type || act.sport_type || 'Workout',
    sportType: act.sport_type,
    distance: act.distance,
    movingTime: act.moving_time,
    elapsedTime: act.elapsed_time,
    elevationGain: act.total_elevation_gain,
    startDate: act.start_date ? new Date(act.start_date) : null,
    startDateLocal: act.start_date_local ? new Date(act.start_date_local) : null,
    avgSpeed: act.average_speed,
    maxSpeed: act.max_speed,
    avgHeartrate: act.average_heartrate,
    maxHeartrate: act.max_heartrate,
    avgCadence: act.average_cadence,
    avgPower: act.average_watts,
    calories: act.calories,
    description: act.description,
    polyline: act.map?.summary_polyline,
    splits,
    weather: act.average_temp != null ? { temp: act.average_temp } : null,
    trainingLoad: act.suffer_score,
    raw: act,
  };
}

export async function upsertActivity(athleteId, source, mapped) {
  const row = await one(
    `INSERT INTO activities (
       athlete_id, source, source_activity_id, name, type, sport_type, distance, moving_time,
       elapsed_time, elevation_gain, start_date, start_date_local, avg_speed, max_speed,
       avg_heartrate, max_heartrate, avg_cadence, avg_power, calories, description, polyline,
       splits, weather, training_load, raw, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,$24,$25::jsonb,NOW()
     )
     ON CONFLICT (source, source_activity_id) DO UPDATE SET
       name = EXCLUDED.name,
       type = EXCLUDED.type,
       sport_type = EXCLUDED.sport_type,
       distance = EXCLUDED.distance,
       moving_time = EXCLUDED.moving_time,
       elapsed_time = EXCLUDED.elapsed_time,
       elevation_gain = EXCLUDED.elevation_gain,
       start_date = EXCLUDED.start_date,
       start_date_local = EXCLUDED.start_date_local,
       avg_speed = EXCLUDED.avg_speed,
       max_speed = EXCLUDED.max_speed,
       avg_heartrate = EXCLUDED.avg_heartrate,
       max_heartrate = EXCLUDED.max_heartrate,
       avg_cadence = EXCLUDED.avg_cadence,
       avg_power = EXCLUDED.avg_power,
       calories = EXCLUDED.calories,
       description = EXCLUDED.description,
       polyline = EXCLUDED.polyline,
       splits = EXCLUDED.splits,
       weather = EXCLUDED.weather,
       training_load = EXCLUDED.training_load,
       raw = EXCLUDED.raw,
       updated_at = NOW()
     RETURNING id`,
    [
      athleteId,
      source,
      mapped.sourceActivityId,
      mapped.name,
      mapped.type,
      mapped.sportType,
      mapped.distance,
      mapped.movingTime,
      mapped.elapsedTime,
      mapped.elevationGain,
      mapped.startDate,
      mapped.startDateLocal,
      mapped.avgSpeed,
      mapped.maxSpeed,
      mapped.avgHeartrate,
      mapped.maxHeartrate,
      mapped.avgCadence,
      mapped.avgPower,
      mapped.calories,
      mapped.description,
      mapped.polyline,
      JSON.stringify(mapped.splits || []),
      mapped.weather ? JSON.stringify(mapped.weather) : null,
      mapped.trainingLoad,
      JSON.stringify(mapped.raw || {}),
    ]
  );
  const activityId = row.id;
  matchActivityToWorkout(activityId).catch((err) => console.error('[training] activity match failed', err.message));
  return activityId;
}

async function newestStravaTimestamp(userId) {
  const row = await one(
    `SELECT EXTRACT(EPOCH FROM MAX(start_date))::bigint AS ts
     FROM activities WHERE athlete_id = $1 AND source = 'strava'`,
    [userId]
  );
  return row?.ts ? Number(row.ts) : null;
}

export async function syncStravaActivities(userId, { full = false, after: afterOverride } = {}) {
  await query(
    `UPDATE oauth_connections
     SET last_sync_status = 'running', last_sync_error = NULL, updated_at = NOW()
     WHERE user_id = $1 AND provider = 'strava'`,
    [userId]
  );

  try {
    const accessToken = await getValidAccessToken(userId);
    const types = await loadUserSyncTypes(userId);
    let page = 1;
    let synced = 0;
    const params = { per_page: PER_PAGE };
    const maxPages = full ? MAX_PAGES : 5;
    if (!full) {
      const conn = await getConnection(userId);
      const after =
        afterOverride
        || (await newestStravaTimestamp(userId))
        || (conn?.lastSyncAt ? Math.floor(new Date(conn.lastSyncAt).getTime() / 1000) : null);
      if (after) params.after = after;
    }

    while (page <= maxPages) {
      const { data: activities } = await stravaGet(`${STRAVA_API}/athlete/activities`, accessToken, {
        ...params,
        page,
      });
      if (!Array.isArray(activities) || !activities.length) break;

      for (const act of activities) {
        if (!isRelevantStravaActivity(act, types)) continue;
        try {
          await upsertActivity(userId, 'strava', mapStravaActivity(act));
          synced += 1;
        } catch (err) {
          console.error(`Strava activity ${act.id} failed:`, err.message);
        }
      }

      if (activities.length < PER_PAGE) break;
      page += 1;
    }

    await query(
      `UPDATE oauth_connections
       SET last_sync_at = NOW(), last_sync_status = 'ok', last_sync_error = NULL, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'strava'`,
      [userId]
    );
    return synced;
  } catch (err) {
    const message = friendlyStravaSyncError(err);
    await query(
      `UPDATE oauth_connections
       SET last_sync_status = 'error', last_sync_error = $2, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'strava'`,
      [userId, message]
    );
    if (isStravaAuthFailure(err) || err instanceof StravaAuthError) {
      throw err instanceof StravaAuthError ? err : new StravaAuthError();
    }
    throw err;
  }
}

const LOGIN_SYNC_COOLDOWN_MS = 15 * 60 * 1000;

export async function syncStravaOnLogin(userId) {
  const conn = await getConnection(userId);
  if (!conn?.connected) return { skipped: 'not_connected' };
  if (conn.lastSyncStatus === 'running') return { skipped: 'running' };
  if (conn.lastSyncAt && Date.now() - new Date(conn.lastSyncAt).getTime() < LOGIN_SYNC_COOLDOWN_MS) {
    return { skipped: 'recent' };
  }
  if (!conn.lastSyncAt) {
    const synced = await syncStravaActivities(userId, { full: true });
    return { synced };
  }
  const after = Math.floor(new Date(conn.lastSyncAt).getTime() / 1000);
  const synced = await syncStravaActivities(userId, { full: false, after });
  return { synced };
}

export { analyzeActivity, getConnection as getStravaConnection };
