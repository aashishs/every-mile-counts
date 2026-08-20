import { camel, one, query } from '../config/db.js';
import { MAX_CLUBS, MAX_COACHES } from './limits.js';
import { getUserRoles, grantAthleteUnlessClubAdmin } from './membership.js';

export async function loadInvitation({ code, type, userId }) {
  const invite = camel(
    await one(
      `SELECT ic.id, ic.code, ic.type, ic.plan_id, ic.max_activations, ic.activations_used,
              ic.valid_from, ic.expires_at, ic.is_disabled, ic.club_id,
              p.duration_months, p.is_lifetime, c.name AS club_name, c.status AS club_status
       FROM invitation_codes ic
       LEFT JOIN membership_plans p ON p.id = ic.plan_id
       LEFT JOIN clubs c ON c.id = ic.club_id
       WHERE UPPER(ic.code) = UPPER($1)`,
      [code]
    )
  );
  if (!invite) throw Object.assign(new Error('Invalid invitation code'), { status: 400 });
  if (invite.isDisabled) throw Object.assign(new Error('Invitation code is disabled'), { status: 400 });
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    throw Object.assign(new Error('Invitation code has expired'), { status: 400 });
  }
  if (invite.validFrom && new Date(invite.validFrom) > new Date()) {
    throw Object.assign(new Error('Invitation code is not yet valid'), { status: 400 });
  }
  if (invite.activationsUsed >= invite.maxActivations) {
    const redeemed = userId
      ? await one(
          `SELECT id FROM invitation_redemptions WHERE code_id = $1 AND user_id = $2 LIMIT 1`,
          [invite.id, userId]
        )
      : null;
    if (!redeemed) {
      throw Object.assign(new Error('This QR / invite has no remaining uses'), { status: 400 });
    }
  }
  if (invite.type !== 'universal' && type && invite.type !== type) {
    throw Object.assign(new Error(`This code is for ${invite.type} registration`), { status: 400 });
  }
  return invite;
}

export async function applyInvitation({ invite, userId, clubId }) {
  await query(`UPDATE invitation_codes SET activations_used = activations_used + 1 WHERE id = $1`, [invite.id]);
  await query(
    `INSERT INTO invitation_redemptions (code_id, user_id, club_id) VALUES ($1, $2, $3)`,
    [invite.id, userId || null, clubId || invite.clubId || null]
  );

  const plan = invite.planId
    ? {
        id: invite.planId,
        duration_months: invite.durationMonths,
        is_lifetime: invite.isLifetime,
      }
    : await one(`SELECT * FROM membership_plans WHERE name = '12 Months' LIMIT 1`);

  return { invite, plan };
}

export async function consumeInvitation({ invite, userId, clubId }) {
  const already = await one(
    `SELECT id FROM invitation_redemptions WHERE code_id = $1 AND user_id = $2 LIMIT 1`,
    [invite.id, userId]
  );
  if (already) return { invite, plan: null, reused: true };
  return { ...(await applyInvitation({ invite, userId, clubId })), reused: false };
}

export async function countUserClubs(userId) {
  const row = await one(
    `SELECT COUNT(*)::int AS count
     FROM club_members
     WHERE user_id = $1
       AND status IN ('active', 'pending')
       AND role IN ('member', 'coach')`,
    [userId]
  );
  return row?.count || 0;
}

export async function assertClubSlot(userId, { clubId } = {}) {
  const existing = clubId
    ? await one(
        `SELECT id FROM club_members
         WHERE user_id = $1 AND club_id = $2 AND status IN ('active', 'pending')`,
        [userId, clubId]
      )
    : null;
  if (existing) return;
  const count = await countUserClubs(userId);
  if (count >= MAX_CLUBS) {
    throw Object.assign(new Error(`You can belong to at most ${MAX_CLUBS} clubs`), { status: 400 });
  }
}

export async function assertCoachSlot(athleteId, { coachId } = {}) {
  const row = await one(
    `SELECT COUNT(*)::int AS count FROM coach_assignments
     WHERE athlete_id = $1 AND status = 'active' AND coach_id <> COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000')`,
    [athleteId, coachId || null]
  );
  if ((row?.count || 0) >= MAX_COACHES) {
    throw Object.assign(new Error(`Maximum of ${MAX_COACHES} coaches per athlete`), { status: 400 });
  }
}

export function invitationState(row) {
  const expired = row.expiresAt && new Date(row.expiresAt) < new Date();
  const exhausted = Number(row.activationsUsed) >= Number(row.maxActivations);
  let state = 'active';
  if (row.isDisabled) state = 'disabled';
  else if (expired) state = 'expired';
  else if (exhausted) state = 'used_up';
  return {
    ...row,
    remaining: Math.max(0, Number(row.maxActivations) - Number(row.activationsUsed)),
    state,
  };
}

export async function addUserToClub({ clubId, userId, role, autoApprove = true }) {
  const roles = await getUserRoles(userId);
  if (roles.includes('club_admin')) {
    throw Object.assign(new Error('Club admins cannot join as athletes or coaches'), { status: 400 });
  }
  const club = camel(await one('SELECT id, name, status FROM clubs WHERE id = $1', [clubId]));
  if (!club) throw Object.assign(new Error('Club not found'), { status: 404 });
  const clubRole = role === 'coach' ? 'coach' : 'member';
  if (club.status === 'pending_coach' && clubRole !== 'coach') {
    throw Object.assign(new Error('This club must add at least one coach before accepting athletes'), { status: 400 });
  }
  await assertClubSlot(userId, { clubId });
  if (clubRole === 'coach') {
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'coach') ON CONFLICT DO NOTHING`, [userId]);
  }
  await grantAthleteUnlessClubAdmin(userId);
  const status = autoApprove ? 'active' : 'pending';
  await query(
    `INSERT INTO club_members (club_id, user_id, role, status, approved_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (club_id, user_id) DO UPDATE SET
       status = EXCLUDED.status,
       requested_at = NOW(),
       approved_at = CASE WHEN EXCLUDED.status = 'pending' THEN NULL ELSE COALESCE(EXCLUDED.approved_at, NOW()) END,
       role = CASE
         WHEN EXCLUDED.role = 'coach' THEN 'coach'
         WHEN club_members.role IN ('club_admin', 'coach') THEN club_members.role
         ELSE EXCLUDED.role
       END`,
    [clubId, userId, clubRole, status, autoApprove ? new Date() : null]
  );
  if (clubRole === 'coach') {
    await query(`UPDATE clubs SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'pending_coach'`, [
      clubId,
    ]);
  }
  return { club, role: clubRole, status };
}
