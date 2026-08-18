import { many } from '../config/db.js';
import { createNotification } from './notificationService.js';
import { syncStravaActivities } from './stravaService.js';
import { refreshMembershipStatuses } from './membershipJob.js';

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

export async function dailySyncAll() {
  const users = await many(
    `SELECT DISTINCT oc.user_id
     FROM oauth_connections oc
     WHERE oc.connected = TRUE AND oc.provider = 'strava'
       AND EXISTS (
         SELECT 1 FROM user_roles ur
         WHERE ur.user_id = oc.user_id AND ur.role IN ('athlete', 'coach', 'app_admin')
       )`
  );
  const summary = { users: users.length, ok: 0, failed: 0, synced: 0 };
  for (const row of users) {
    try {
      const result = await syncUserActivities(row.user_id, { full: false, notify: true });
      summary.ok += 1;
      summary.synced += result.total || 0;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
