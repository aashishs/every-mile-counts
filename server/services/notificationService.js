import { camel, one, query } from '../config/db.js';

export async function createNotification({ userId, type, title, body, data = {} }) {
  const row = await one(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [userId, type, title, body || '', JSON.stringify(data)]
  );
  return camel(row);
}

export async function notifyMany(userIds, payload) {
  await Promise.all(userIds.map((userId) => createNotification({ userId, ...payload })));
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
