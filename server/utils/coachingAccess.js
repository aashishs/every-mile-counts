import { camel, many, one } from '../config/db.js';

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function getAssignment(coachId, athleteId) {
  return camel(
    await one(
      `SELECT * FROM coach_assignments
       WHERE coach_id = $1 AND athlete_id = $2 AND status = 'active'`,
      [coachId, athleteId]
    )
  );
}

export async function assertAssignedCoach(coachId, athleteId) {
  const assignment = await getAssignment(coachId, athleteId);
  if (!assignment) throw httpError(403, 'Not assigned to this athlete');
  return assignment;
}

export async function assertCoachInClub(coachId, clubId) {
  const row = await one(
    `SELECT id FROM club_members
     WHERE user_id = $1 AND club_id = $2 AND status = 'active' AND role IN ('coach', 'club_admin')`,
    [coachId, clubId]
  );
  if (!row) throw httpError(403, 'You are not a coach in that club');
  return row;
}

export async function assignmentClubMatches(assignment, clubId) {
  if (!clubId) return false;
  if (assignment.clubId) return assignment.clubId === clubId;
  const shared = await one(
    `SELECT 1
     FROM club_members athlete
     JOIN club_members coach
       ON coach.club_id = athlete.club_id
      AND coach.user_id = $2
      AND coach.status = 'active'
      AND coach.role IN ('coach', 'club_admin')
     WHERE athlete.user_id = $1 AND athlete.club_id = $3 AND athlete.status = 'active'
     LIMIT 1`,
    [assignment.athleteId, assignment.coachId, clubId]
  );
  return Boolean(shared);
}

export async function assertAssignmentInClub(assignment, clubId) {
  if (!(await assignmentClubMatches(assignment, clubId))) {
    throw httpError(403, 'This athlete is not coached by you in that club');
  }
}

export async function canViewReview(user, review) {
  if (!review) return false;
  if (user.id === review.athleteId) return true;
  if (user.id === review.coachId) return true;
  if (!(user.roles || []).includes('coach')) return false;
  if (!review.clubId) return false;
  const assignment = await getAssignment(user.id, review.athleteId);
  return Boolean(assignment && (await assignmentClubMatches(assignment, review.clubId)));
}

export async function assertCanViewReview(user, review) {
  if (!review) throw httpError(404, 'Review not found');
  if (!(await canViewReview(user, review))) {
    throw httpError(403, 'Access denied');
  }
  return review;
}

export function reviewVisibilitySql(alias, viewerParam) {
  return `(
    ${alias}.athlete_id = ${viewerParam}
    OR ${alias}.coach_id = ${viewerParam}
    OR EXISTS (
      SELECT 1 FROM coach_assignments ca
      WHERE ca.athlete_id = ${alias}.athlete_id
        AND ca.coach_id = ${viewerParam}
        AND ca.status = 'active'
        AND ${alias}.club_id IS NOT NULL
        AND ca.club_id = ${alias}.club_id
    )
  )`;
}

export async function loadProgram(id) {
  return camel(await one('SELECT * FROM training_programs WHERE id = $1', [id]));
}

export async function canViewProgram(user, program) {
  if (!program) return false;
  if (user.id === program.coachId) return true;
  if (program.athleteId && user.id === program.athleteId) return true;
  if ((user.roles || []).includes('coach') && program.athleteId && program.clubId) {
    const assignment = await getAssignment(user.id, program.athleteId);
    return Boolean(assignment && (await assignmentClubMatches(assignment, program.clubId)));
  }
  return false;
}

export function canModifyProgram(user, program) {
  return Boolean(program && user.id === program.coachId);
}

export async function assertCanViewProgram(user, program) {
  if (!program) throw httpError(404, 'Training program not found');
  if (!(await canViewProgram(user, program))) throw httpError(403, 'Access denied');
  return program;
}

export async function assertCanModifyProgram(user, program) {
  if (!program) throw httpError(404, 'Training program not found');
  if (!canModifyProgram(user, program)) {
    throw httpError(403, 'Not authorized to modify this training program');
  }
  return program;
}

export async function canViewWorkout(user, workout, program) {
  if (!workout) return false;
  if (user.id === workout.coachId || (workout.athleteId && user.id === workout.athleteId)) return true;
  if (program) return canViewProgram(user, program);
  if ((user.roles || []).includes('coach') && workout.athleteId && workout.clubId) {
    const assignment = await getAssignment(user.id, workout.athleteId);
    return Boolean(assignment && (await assignmentClubMatches(assignment, workout.clubId)));
  }
  return false;
}

export function canModifyWorkout(user, workout, program) {
  if (!workout) return false;
  if (user.id === workout.coachId) return true;
  return Boolean(program && canModifyProgram(user, program));
}

export async function assertCanViewWorkout(user, workout, program) {
  if (!workout) throw httpError(404, 'Workout not found');
  if (!(await canViewWorkout(user, workout, program))) throw httpError(403, 'Access denied');
  return workout;
}

export function workoutProgramView(workout, program) {
  if (program) {
    return {
      id: program.id,
      name: program.name,
      status: program.status,
      coachId: program.coachId,
      athleteId: program.athleteId,
      clubId: program.clubId,
    };
  }
  return {
    id: null,
    name: 'Assigned activity',
    status: 'active',
    coachId: workout.coachId,
    athleteId: workout.athleteId,
    clubId: workout.clubId,
  };
}

export async function coachClubIds(coachId) {
  const rows = await many(
    `SELECT club_id FROM club_members
     WHERE user_id = $1 AND status = 'active' AND role IN ('coach', 'club_admin')`,
    [coachId]
  );
  return rows.map((r) => r.club_id);
}
