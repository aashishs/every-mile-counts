import axios from 'axios';
import { camel, one, query } from '../config/db.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import { analyzeActivity } from './analysisService.js';

const STRAVA_API = 'https://www.strava.com/api/v3';
const PER_PAGE = 200;
const MAX_PAGES = 250;

const stravaHttp = axios.create({
  timeout: 30000,
});

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

export async function refreshStravaToken(conn) {
  const response = await axios.post('https://www.strava.com/oauth/token', {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: decrypt(conn.refreshTokenEnc),
  });
  await saveTokens(conn.userId, {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresAt: new Date(response.data.expires_at * 1000),
    providerUserId: conn.providerUserId,
  });
  return response.data.access_token;
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
  return row.id;
}

async function newestStravaTimestamp(userId) {
  const row = await one(
    `SELECT EXTRACT(EPOCH FROM MAX(start_date))::bigint AS ts
     FROM activities WHERE athlete_id = $1 AND source = 'strava'`,
    [userId]
  );
  return row?.ts ? Number(row.ts) : null;
}

export async function syncStravaActivities(userId, { full = false } = {}) {
  const accessToken = await getValidAccessToken(userId);
  await query(
    `UPDATE oauth_connections
     SET last_sync_status = 'running', last_sync_error = NULL, updated_at = NOW()
     WHERE user_id = $1 AND provider = 'strava'`,
    [userId]
  );

  let page = 1;
  let synced = 0;
  const params = { per_page: PER_PAGE };
  const maxPages = full ? MAX_PAGES : 5;
  if (!full) {
    const conn = await getConnection(userId);
    const after = await newestStravaTimestamp(userId)
      || (conn?.lastSyncAt ? Math.floor(new Date(conn.lastSyncAt).getTime() / 1000) : null);
    if (after) params.after = after;
  }

  try {
    while (page <= maxPages) {
      const { data: activities } = await stravaGet(`${STRAVA_API}/athlete/activities`, accessToken, {
        ...params,
        page,
      });
      if (!Array.isArray(activities) || !activities.length) break;

      for (const act of activities) {
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
    await query(
      `UPDATE oauth_connections
       SET last_sync_status = 'error', last_sync_error = $2, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'strava'`,
      [userId, err.message]
    );
    throw err;
  }
}

const LOGIN_SYNC_COOLDOWN_MS = 2 * 60 * 1000;

export async function syncStravaOnLogin(userId) {
  const conn = await getConnection(userId);
  if (!conn?.connected) return { skipped: 'not_connected' };
  if (conn.lastSyncStatus === 'running') return { skipped: 'running' };
  if (conn.lastSyncAt && Date.now() - new Date(conn.lastSyncAt).getTime() < LOGIN_SYNC_COOLDOWN_MS) {
    return { skipped: 'recent' };
  }
  const newest = await newestStravaTimestamp(userId);
  if (!newest && !conn.lastSyncAt) return { skipped: 'never_synced' };
  const synced = await syncStravaActivities(userId, { full: false });
  return { synced };
}

export { analyzeActivity, getConnection as getStravaConnection };
