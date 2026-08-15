import { many } from '../config/db.js';
import { createNotification } from './notificationService.js';
import { syncStravaActivities } from './stravaService.js';
import { syncGarminActivities } from './garminService.js';
import { refreshMembershipStatuses } from './membershipJob.js';

export async function syncUserActivities(userId) {
  const connections = await many(
    `SELECT provider FROM oauth_connections WHERE user_id = $1 AND connected = TRUE`,
    [userId]
  );
  if (!connections.length) {
    throw new Error('No activity source connected');
  }
  let total = 0;
  const results = {};
  for (const { provider } of connections) {
    try {
      const count =
        provider === 'garmin' ? await syncGarminActivities(userId) : await syncStravaActivities(userId);
      results[provider] = { ok: true, synced: count };
      total += count;
    } catch (err) {
      results[provider] = { ok: false, error: err.message };
    }
  }
  await createNotification({
    userId,
    type: 'sync',
    title: 'Activity sync complete',
    body: `Imported or updated ${total} activities.`,
    data: results,
  });
  return { total, results };
}

export async function dailySyncAll() {
  const users = await many(
    `SELECT DISTINCT user_id FROM oauth_connections WHERE connected = TRUE`
  );
  const summary = { users: users.length, ok: 0, failed: 0 };
  for (const row of users) {
    try {
      await syncUserActivities(row.user_id);
      summary.ok += 1;
    } catch {
      summary.failed += 1;
    }
  }
  await refreshMembershipStatuses();
  return summary;
}
