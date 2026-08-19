import { many } from '../config/db.js';
import { createNotification } from './notificationService.js';
import { syncStravaActivities } from './stravaService.js';

export async function syncUserActivities(userId, { full = false, notify = true } = {}) {
  const connections = await many(
    `SELECT provider FROM oauth_connections WHERE user_id = $1 AND connected = TRUE AND provider = 'strava'`,
    [userId]
  );
  if (!connections.length) {
    throw new Error('No activity source connected');
  }
  let total = 0;
  const results = {};
  for (const { provider } of connections) {
    try {
      const count = await syncStravaActivities(userId, { full });
      results[provider] = { ok: true, synced: count };
      total += count;
    } catch (err) {
      results[provider] = { ok: false, error: err.message };
    }
  }
  if (notify && total > 0) {
    await createNotification({
      userId,
      type: 'sync',
      title: 'New activities synced',
      body: `Imported or updated ${total} activities from Strava.`,
      data: results,
    });
  }
  return { total, results };
}
