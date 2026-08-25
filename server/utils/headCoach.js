import { camel, camelMany, many, one, query } from '../config/db.js';
import { MAX_COACHES } from './limits.js';
import { getAdminClub } from './membership.js';

export { getAdminClub };

export async function clubHasCoach(clubId) {
  const row = await one(
    `SELECT 1
     FROM clubs c
     WHERE c.id = $1
       AND (
         c.head_coach_user_id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM club_members cm
           WHERE cm.club_id = c.id AND cm.status = 'active' AND cm.role = 'coach'
         )
       )`,
    [clubId]
  );
  return Boolean(row);
}

export async function isClubHeadCoach(userId, clubId) {
  const row = await one(
    `SELECT 1 FROM clubs WHERE id = $1 AND head_coach_user_id = $2`,
    [clubId, userId]
  );
  return Boolean(row);
}

export async function isClubCoachOrHead(userId, clubId) {
  const m = camel(
    await one(
      `SELECT role, status FROM club_members WHERE club_id = $1 AND user_id = $2`,
      [clubId, userId]
    )
  );
  if (!m || m.status !== 'active') return false;
  if (m.role === 'coach') return true;
  if (m.role === 'club_admin') return await isClubHeadCoach(userId, clubId);
  return false;
}

export async function refreshClubCoachStatus(clubId) {
  const hasCoach = await clubHasCoach(clubId);
  await query(
    `UPDATE clubs
     SET status = $2, updated_at = NOW()
     WHERE id = $1 AND status IN ('pending_coach', 'active')`,
    [clubId, hasCoach ? 'active' : 'pending_coach']
  );
}

async function coachCount(athleteId) {
  const row = await one(
    `SELECT COUNT(*)::int AS count FROM coach_assignments WHERE athlete_id = $1 AND status = 'active'`,
    [athleteId]
  );
  return row?.count || 0;
}

export async function assignDefaultHeadCoach(clubId, athleteId) {
  const club = camel(await one('SELECT head_coach_user_id FROM clubs WHERE id = $1', [clubId]));
  const coachId = club?.headCoachUserId;
  if (!coachId || coachId === athleteId) return false;
  const existing = camel(
    await one(
      `SELECT id, status FROM coach_assignments WHERE athlete_id = $1 AND coach_id = $2`,
      [athleteId, coachId]
    )
  );
  if (existing?.status === 'active') return false;
  if (!existing && (await coachCount(athleteId)) >= MAX_COACHES) return false;
  if (existing) {
    await query(
      `UPDATE coach_assignments
       SET status = 'active', club_id = $2, assigned_by = $3
       WHERE id = $1`,
      [existing.id, clubId, coachId]
    );
    return true;
  }
  await query(
    `INSERT INTO coach_assignments (athlete_id, coach_id, club_id, assigned_by, status)
     VALUES ($1, $2, $3, $2, 'active')
     ON CONFLICT (athlete_id, coach_id) DO UPDATE SET
       status = 'active',
       club_id = EXCLUDED.club_id,
       assigned_by = EXCLUDED.assigned_by`,
    [athleteId, coachId, clubId]
  );
  return true;
}

async function assignHeadCoachToClubMembers(clubId, coachId) {
  const members = camelMany(
    await many(
      `SELECT user_id
       FROM club_members
       WHERE club_id = $1 AND status = 'active' AND role = 'member' AND user_id <> $2`,
      [clubId, coachId]
    )
  );
  for (const member of members) {
    await assignDefaultHeadCoach(clubId, member.userId);
  }
}

export async function setHeadCoach(userId, enabled) {
  const club = await getAdminClub(userId);
  if (!club) {
    const err = new Error('Create your club before becoming head coach');
    err.status = 400;
    throw err;
  }

  await query(
    `UPDATE club_members
     SET head_coach_choice = $3
     WHERE club_id = $1 AND user_id = $2 AND role = 'club_admin'`,
    [club.id, userId, enabled ? 'yes' : 'no']
  );

  if (enabled) {
    await query(
      `UPDATE clubs
       SET head_coach_user_id = $2,
           status = CASE WHEN status = 'pending_coach' THEN 'active' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [club.id, userId]
    );
    await query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach') ON CONFLICT DO NOTHING`,
      [userId]
    );
    await assignHeadCoachToClubMembers(club.id, userId);
    return { club, enabled: true };
  }

  await query(
    `UPDATE clubs SET head_coach_user_id = NULL, updated_at = NOW()
     WHERE id = $1 AND head_coach_user_id = $2`,
    [club.id, userId]
  );
  await query(
    `UPDATE coach_assignments SET status = 'inactive'
     WHERE coach_id = $1 AND club_id = $2 AND status = 'active'`,
    [userId, club.id]
  );
  const otherCoachSeat = await one(
    `SELECT 1 FROM club_members
     WHERE user_id = $1 AND status = 'active' AND role = 'coach'
     LIMIT 1`,
    [userId]
  );
  if (!otherCoachSeat) {
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'coach'`, [userId]);
  }
  await refreshClubCoachStatus(club.id);
  return { club, enabled: false };
}
