import webpush from 'web-push';
import { many, query } from '../config/db.js';

function vapidReady() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

if (vapidReady()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@everymilecounts.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export function isPushConfigured() {
  return vapidReady();
}

function parseKeys(keys) {
  if (!keys) return null;
  const parsed = typeof keys === 'string' ? JSON.parse(keys) : keys;
  if (!parsed?.p256dh || !parsed?.auth) return null;
  return parsed;
}

export async function sendPushToUser(userId, payload) {
  if (!vapidReady()) return;
  const subs = await many(`SELECT * FROM push_subscriptions WHERE user_id = $1`, [userId]);
  await Promise.all(
    subs.map(async (s) => {
      const keys = parseKeys(s.keys);
      if (!keys) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys }, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
        }
      }
    })
  );
}
