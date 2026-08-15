import crypto from 'crypto';
import oauth1 from 'oauth-1.0a';
import axios from 'axios';
import { camel, one, query } from '../config/db.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import { upsertActivity } from './stravaService.js';

const REQUEST_TOKEN_URL = 'https://connectapi.garmin.com/oauth-service/oauth/request_token';
const AUTHORIZE_URL = 'https://connect.garmin.com/oauthConfirm';
const ACCESS_TOKEN_URL = 'https://connectapi.garmin.com/oauth-service/oauth/access_token';
const ACTIVITIES_URL = 'https://apis.garmin.com/wellness-api/rest/backfill/activities';

const OAuth = oauth1.default || oauth1;

function garminOAuth() {
  return new OAuth({
    consumer: {
      key: process.env.GARMIN_CONSUMER_KEY,
      secret: process.env.GARMIN_CONSUMER_SECRET,
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base, key) {
      return crypto.createHmac('sha1', key).update(base).digest('base64');
    },
  });
}

function signedHeaders(url, method, token) {
  const oauth = garminOAuth();
  const requestData = { url, method };
  return oauth.toHeader(oauth.authorize(requestData, token));
}

export async function startGarminOAuth(userId) {
  if (!process.env.GARMIN_CONSUMER_KEY) {
    throw new Error('Garmin is not configured. Set GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET.');
  }
  const url = REQUEST_TOKEN_URL;
  const headers = signedHeaders(url, 'POST');
  const { data } = await axios.post(url, null, { headers });
  const params = new URLSearchParams(data);
  const token = params.get('oauth_token');
  const secret = params.get('oauth_token_secret');
  await query(
    `INSERT INTO oauth_pending (user_id, provider, request_token, request_token_secret_enc)
     VALUES ($1, 'garmin', $2, $3)`,
    [userId, token, encrypt(secret)]
  );
  const callback = encodeURIComponent(process.env.GARMIN_REDIRECT_URI);
  return `${AUTHORIZE_URL}?oauth_token=${token}&oauth_callback=${callback}`;
}

export async function completeGarminOAuth(oauthToken, oauthVerifier) {
  const pending = camel(
    await one(
      `SELECT * FROM oauth_pending WHERE provider = 'garmin' AND request_token = $1 ORDER BY created_at DESC LIMIT 1`,
      [oauthToken]
    )
  );
  if (!pending) throw new Error('Garmin OAuth session not found');

  const url = `${ACCESS_TOKEN_URL}?oauth_verifier=${oauthVerifier}`;
  const headers = signedHeaders(url, 'POST', {
    key: oauthToken,
    secret: decrypt(pending.requestTokenSecretEnc),
  });
  const { data } = await axios.post(url, null, { headers });
  const params = new URLSearchParams(data);
  const accessToken = params.get('oauth_token');
  const tokenSecret = params.get('oauth_token_secret');

  await query(
    `INSERT INTO oauth_connections
      (user_id, provider, access_token_enc, token_secret_enc, connected, updated_at)
     VALUES ($1, 'garmin', $2, $3, TRUE, NOW())
     ON CONFLICT (user_id, provider) DO UPDATE SET
       access_token_enc = EXCLUDED.access_token_enc,
       token_secret_enc = EXCLUDED.token_secret_enc,
       connected = TRUE,
       last_sync_error = NULL,
       updated_at = NOW()`,
    [pending.userId, encrypt(accessToken), encrypt(tokenSecret)]
  );
  await query(`DELETE FROM oauth_pending WHERE id = $1`, [pending.id]);
  return pending.userId;
}

function mapGarminActivity(act) {
  const summary = act.summary || act;
  return {
    sourceActivityId: String(act.activityId || act.summaryId || summary.activityId),
    name: act.activityName || summary.activityType || 'Garmin activity',
    type: mapGarminType(summary.activityType || act.activityType),
    sportType: summary.activityType,
    distance: summary.distanceInMeters || summary.distance,
    movingTime: summary.durationInSeconds || summary.movingDurationInSeconds,
    elapsedTime: summary.durationInSeconds,
    elevationGain: summary.totalElevationGainInMeters,
    startDate: summary.startTimeInSeconds
      ? new Date(summary.startTimeInSeconds * 1000)
      : summary.startTimeGMT
        ? new Date(summary.startTimeGMT)
        : null,
    avgSpeed: summary.averageSpeedInMetersPerSecond,
    maxSpeed: summary.maxSpeedInMetersPerSecond,
    avgHeartrate: summary.averageHeartRateInBeatsPerMinute,
    maxHeartrate: summary.maxHeartRateInBeatsPerMinute,
    avgCadence: summary.averageRunCadenceInStepsPerMinute || summary.averageBikeCadenceInRoundsPerMinute,
    avgPower: summary.averagePowerInWatts,
    calories: summary.activeKilocalories,
    polyline: null,
    splits: act.laps || [],
    weather: null,
    trainingLoad: summary.trainingStressScore,
    raw: act,
  };
}

function mapGarminType(type = '') {
  const t = String(type).toLowerCase();
  if (t.includes('run')) return 'Run';
  if (t.includes('cycl') || t.includes('bike') || t.includes('ride')) return 'Ride';
  if (t.includes('swim')) return 'Swim';
  if (t.includes('walk')) return 'Walk';
  if (t.includes('hike')) return 'Hike';
  return 'Workout';
}

export async function syncGarminActivities(userId) {
  const conn = camel(
    await one(`SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = 'garmin' AND connected = TRUE`, [
      userId,
    ])
  );
  if (!conn) throw new Error('Garmin not connected');

  const token = {
    key: decrypt(conn.accessTokenEnc),
    secret: decrypt(conn.tokenSecretEnc),
  };

  const summaryUrl = 'https://apis.garmin.com/wellness-api/rest/activities';
  const headers = signedHeaders(summaryUrl, 'GET', token);
  let synced = 0;
  try {
    const { data } = await axios.get(summaryUrl, { headers, params: { uploadStartTimeInSeconds: 0 } });
    const list = Array.isArray(data) ? data : data?.activities || [];
    for (const act of list) {
      await upsertActivity(userId, 'garmin', mapGarminActivity(act));
      synced += 1;
    }
    await query(
      `UPDATE oauth_connections
       SET last_sync_at = NOW(), last_sync_status = 'ok', last_sync_error = NULL, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'garmin'`,
      [userId]
    );
  } catch (err) {
    await query(
      `UPDATE oauth_connections
       SET last_sync_status = 'error', last_sync_error = $2, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'garmin'`,
      [userId, err.message]
    );
    throw err;
  }
  return synced;
}

export async function getGarminConnection(userId) {
  return camel(
    await one(`SELECT connected, last_sync_at, last_sync_status, last_sync_error, provider_user_id
               FROM oauth_connections WHERE user_id = $1 AND provider = 'garmin'`, [userId])
  );
}

export { ACTIVITIES_URL };
