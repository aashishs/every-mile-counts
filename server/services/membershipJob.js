import { many, query } from '../config/db.js';
import { computeMembershipStatus } from '../utils/membership.js';
import { createNotification } from './notificationService.js';

export async function refreshMembershipStatuses() {
  const rows = await many(
    `SELECT id, user_id, club_id, status, expires_at FROM memberships
     WHERE status IN ('active', 'expiring_soon', 'expired')`
  );

  const windows = [30, 15, 7];
  let updated = 0;

  for (const m of rows) {
    const next = computeMembershipStatus(m);
    if (next && next !== m.status) {
      await query(`UPDATE memberships SET status = $1, updated_at = NOW() WHERE id = $2`, [next, m.id]);
      updated += 1;
      if (m.club_id && next === 'expired') {
        await query(`UPDATE clubs SET status = 'read_only', updated_at = NOW() WHERE id = $1 AND status = 'active'`, [
          m.club_id,
        ]);
      }
    }

    if (!m.expires_at || !m.user_id) continue;
    const days = Math.ceil((new Date(m.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
    if (windows.includes(days)) {
      await createNotification({
        userId: m.user_id,
        type: 'membership',
        title: 'Membership expiring soon',
        body: `Your membership expires in ${days} day${days === 1 ? '' : 's'}.`,
        data: { membershipId: m.id, days },
      });
    }
  }

  return { scanned: rows.length, updated };
}
