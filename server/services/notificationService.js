import { camel, one, query } from '../config/db.js';
import { isPushConfigured, sendPushToUser } from './pushService.js';

const TYPE_PREF = {
  review: 'reviews',
  review_request: 'reviews',
  announcement: 'announcements',
  sync: 'sync',
  goal: 'goals',
  membership: 'membership',
  club: 'membership',
  event: 'events',
};

function typeEnabled(prefs, type) {
  const key = TYPE_PREF[type];
  if (!key) return true;
  return prefs?.[key] !== false;
}

function notificationUrl(type, data = {}) {
  if (data.url) return data.url;
  if (type === 'review' && data.activityId) return `/activities/${data.activityId}`;
  if ((type === 'club' || type === 'announcement') && data.clubId) return `/clubs/${data.clubId}`;
  if (type === 'goal') return '/dashboard';
  if (type === 'sync') return '/activities';
  if (type === 'membership') return '/membership';
  if (type === 'event') return '/events';
  return '/notifications';
}

async function recipient(userId, type) {
  const row = await one(
    `SELECT u.id, u.status, u.notification_prefs,
            ARRAY_REMOVE(ARRAY_AGG(ur.role), NULL) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );
  if (!row || row.status !== 'active') return null;
  const roles = row.roles || [];
  if (roles.includes('app_admin')) return null;
  const clubOnly = roles.includes('club_admin') && !roles.includes('athlete') && !roles.includes('coach');
  if (clubOnly && !['club', 'announcement', 'membership', 'event'].includes(type)) return null;
  return { prefs: row.notification_prefs || {}, roles };
}

export async function createNotification({ userId, type, title, body, data = {} }) {
  if (!userId) return null;
  const dest = await recipient(userId, type);
  if (!dest) return null;
  if (!typeEnabled(dest.prefs, type)) return null;

  const inApp = dest.prefs.inApp !== false;
  const push = dest.prefs.push !== false;
  let row = null;
  if (inApp) {
    row = await one(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [userId, type, title, body || '', JSON.stringify(data)]
    );
  }
  if (push && isPushConfigured()) {
    sendPushToUser(userId, {
      title,
      body: body || '',
      data: { ...data, url: notificationUrl(type, data) },
    }).catch(() => {});
  }
  return row ? camel(row) : null;
}

export async function notifyMany(userIds, payload) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  await Promise.all(unique.map((id) => createNotification({ userId: id, ...payload })));
}

export async function unreadCount(userId) {
  const row = await one(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return row?.count || 0;
}

export async function markAllRead(userId) {
  await query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
}
