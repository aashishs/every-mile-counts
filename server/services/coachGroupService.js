import { camel, camelMany, many, one, pool, query } from '../config/db.js';
import {
  assertAssignedCoach,
  assertAssignmentInClub,
  assertCoachInClub,
  httpError,
} from '../utils/coachingAccess.js';

export async function loadGroup(id) {
  return camel(await one('SELECT * FROM coach_groups WHERE id = $1', [id]));
}

export async function assertGroupOwned(user, groupId) {
  const group = await loadGroup(groupId);
  if (!group) throw httpError(404, 'Group not found');
  if (group.coachId !== user.id) throw httpError(403, 'Not authorized to change this group');
  return group;
}

export async function groupAthletes(groupId) {
  return camelMany(
    await many(
      `SELECT u.id AS athlete_id, u.first_name, u.last_name, u.email, u.avatar_url, ca.club_id
       FROM coach_group_members m
       JOIN users u ON u.id = m.athlete_id
       JOIN coach_groups g ON g.id = m.group_id
       JOIN coach_assignments ca
         ON ca.athlete_id = m.athlete_id AND ca.coach_id = g.coach_id AND ca.status = 'active'
       WHERE m.group_id = $1
       ORDER BY u.last_name, u.first_name`,
      [groupId]
    )
  );
}

export async function hydrateGroup(group) {
  const athletes = await groupAthletes(group.id);
  const club = camel(await one('SELECT id, name FROM clubs WHERE id = $1', [group.clubId]));
  return { ...group, club, athletes, athleteCount: athletes.length };
}

export async function listCoachGroups(coachId) {
  const groups = camelMany(
    await many(
      `SELECT g.*, c.name AS club_name,
              (SELECT COUNT(*)::int FROM coach_group_members m WHERE m.group_id = g.id) AS athlete_count
       FROM coach_groups g
       JOIN clubs c ON c.id = g.club_id
       WHERE g.coach_id = $1
       ORDER BY g.name`,
      [coachId]
    )
  );
  const withMembers = [];
  for (const group of groups) {
    withMembers.push({ ...group, athletes: await groupAthletes(group.id) });
  }
  return withMembers;
}

async function assertAthletesInClub(coachId, clubId, athleteIds) {
  const unique = [...new Set((athleteIds || []).filter(Boolean))];
  const athletes = [];
  for (const athleteId of unique) {
    const assignment = await assertAssignedCoach(coachId, athleteId);
    await assertAssignmentInClub(assignment, clubId);
    athletes.push({ athleteId, assignment });
  }
  return athletes;
}

export async function createGroup(user, { name, clubId, description, athleteIds }) {
  if (!String(name || '').trim()) throw httpError(400, 'Group name is required');
  if (!clubId) throw httpError(400, 'Choose a club for this group');
  await assertCoachInClub(user.id, clubId);
  const members = await assertAthletesInClub(user.id, clubId, athleteIds);
  const group = camel(
    await one(
      `INSERT INTO coach_groups (coach_id, club_id, name, description)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [user.id, clubId, String(name).trim(), description || null]
    )
  );
  for (const member of members) {
    await query(
      `INSERT INTO coach_group_members (group_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [group.id, member.athleteId]
    );
  }
  return hydrateGroup(group);
}

export async function updateGroup(user, groupId, { name, description, athleteIds }) {
  const group = await assertGroupOwned(user, groupId);
  const nextName = name != null ? String(name).trim() : group.name;
  if (!nextName) throw httpError(400, 'Group name is required');
  const updated = camel(
    await one(
      `UPDATE coach_groups
       SET name = $2, description = $3, updated_at = NOW()
       WHERE id = $1 AND coach_id = $4
       RETURNING *`,
      [group.id, nextName, description !== undefined ? description || null : group.description, user.id]
    )
  );
  if (Array.isArray(athleteIds)) {
    const members = await assertAthletesInClub(user.id, group.clubId, athleteIds);
    await query('DELETE FROM coach_group_members WHERE group_id = $1', [group.id]);
    for (const member of members) {
      await query(
        `INSERT INTO coach_group_members (group_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [group.id, member.athleteId]
      );
    }
  }
  return hydrateGroup(updated);
}

export async function deleteGroup(user, groupId) {
  await assertGroupOwned(user, groupId);
  await query('DELETE FROM coach_groups WHERE id = $1 AND coach_id = $2', [groupId, user.id]);
}

export async function resolveTargets(user, { athleteId, groupId, athleteIds, clubId }) {
  if (groupId) {
    const group = await assertGroupOwned(user, groupId);
    if (clubId && clubId !== group.clubId) {
      throw httpError(400, 'That group belongs to a different club');
    }
    const athletes = await groupAthletes(group.id);
    if (!athletes.length) throw httpError(400, 'Add athletes to this group first');
    return { group, clubId: group.clubId, athletes };
  }
  const ids = [...new Set((athleteIds || []).concat(athleteId ? [athleteId] : []).filter(Boolean))];
  if (!ids.length) throw httpError(400, 'Choose an athlete or a group');
  if (!clubId) throw httpError(400, 'Choose a club');
  const members = await assertAthletesInClub(user.id, clubId, ids);
  const athletes = members.map((row) => ({ athleteId: row.athleteId }));
  return { group: null, clubId, athletes };
}

export async function cloneProgramForAthlete(program, athleteId, groupId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const copy = await client.query(
      `INSERT INTO training_programs (
         coach_id, club_id, athlete_id, name, description, sport, start_date, end_date,
         target_event_id, target_event_name, status
       )
       SELECT coach_id, club_id, $2, name, description, sport, start_date, end_date,
              target_event_id, target_event_name, 'active'
       FROM training_programs WHERE id = $1
       RETURNING *`,
      [program.id, athleteId]
    );
    const next = copy.rows[0];
    const phases = await client.query(
      'SELECT * FROM training_phases WHERE program_id = $1 ORDER BY sort_order, created_at',
      [program.id]
    );
    const phaseMap = {};
    for (const phase of phases.rows) {
      const inserted = await client.query(
        `INSERT INTO training_phases (program_id, name, objective, sort_order, start_date, end_date)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [next.id, phase.name, phase.objective, phase.sort_order, phase.start_date, phase.end_date]
      );
      phaseMap[phase.id] = inserted.rows[0].id;
    }
    const weeks = await client.query(
      'SELECT * FROM training_weeks WHERE program_id = $1 ORDER BY week_number, created_at',
      [program.id]
    );
    const weekMap = {};
    for (const week of weeks.rows) {
      const inserted = await client.query(
        `INSERT INTO training_weeks (program_id, phase_id, week_number, start_date, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [next.id, phaseMap[week.phase_id] || null, week.week_number, week.start_date, week.notes]
      );
      weekMap[week.id] = inserted.rows[0].id;
    }
    const workouts = await client.query(
      'SELECT * FROM planned_workouts WHERE program_id = $1 ORDER BY scheduled_date, created_at',
      [program.id]
    );
    for (const workout of workouts.rows) {
      await client.query(
        `INSERT INTO planned_workouts (
           program_id, phase_id, week_id, athlete_id, coach_id, club_id, group_id, scheduled_date, name, sport, workout_type,
           distance, duration, target_pace, target_hr_zone, target_hr, target_power, rpe,
           warmup, main_set, cooldown, instructions, coach_notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          next.id,
          workout.phase_id ? phaseMap[workout.phase_id] || null : null,
          workout.week_id ? weekMap[workout.week_id] || null : null,
          athleteId,
          workout.coach_id,
          workout.club_id,
          groupId,
          workout.scheduled_date,
          workout.name,
          workout.sport,
          workout.workout_type,
          workout.distance,
          workout.duration,
          workout.target_pace,
          workout.target_hr_zone,
          workout.target_hr,
          workout.target_power,
          workout.rpe,
          workout.warmup,
          workout.main_set,
          workout.cooldown,
          workout.instructions,
          workout.coach_notes,
        ]
      );
    }
    await client.query('COMMIT');
    return camel(next);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
