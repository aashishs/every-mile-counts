import axios from 'axios';
import { camel, one, query } from '../config/db.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import { analyzeActivity } from './analysisService.js';

const STRAVA_API = 'https://www.strava.com/api/v3';

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
  const { data } = await axios.get(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
       distance = EXCLUDED.distance,
       moving_time = EXCLUDED.moving_time,
       elapsed_time = EXCLUDED.elapsed_time,
       elevation_gain = EXCLUDED.elevation_gain,
       avg_speed = EXCLUDED.avg_speed,
       max_speed = EXCLUDED.max_speed,
       avg_heartrate = EXCLUDED.avg_heartrate,
       max_heartrate = EXCLUDED.max_heartrate,
       avg_cadence = EXCLUDED.avg_cadence,
       avg_power = EXCLUDED.avg_power,
       calories = EXCLUDED.calories,
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

export async function syncStravaActivities(userId) {
  const accessToken = await getValidAccessToken(userId);
  let page = 1;
  let synced = 0;
  const perPage = 50;

  while (page <= 20) {
    const { data: activities } = await axios.get(`${STRAVA_API}/athlete/activities`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { page, per_page: perPage },
    });
    if (!activities.length) break;
    for (const act of activities) {
      await upsertActivity(userId, 'strava', mapStravaActivity(act));
      synced += 1;
    }
    if (activities.length < perPage) break;
    page += 1;
  }

  await query(
    `UPDATE oauth_connections
     SET last_sync_at = NOW(), last_sync_status = 'ok', last_sync_error = NULL, updated_at = NOW()
     WHERE user_id = $1 AND provider = 'strava'`,
    [userId]
  );
  return synced;
}

export { analyzeActivity, getConnection as getStravaConnection };
