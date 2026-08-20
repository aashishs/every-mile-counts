import { sportFamilyFromBlob } from './activityTypes.js';
import { isRestType } from './workoutTypes.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ratioScore(planned, actual, full, partial) {
  if (planned == null || actual == null || planned <= 0 || actual < 0) return 0;
  const ratio = actual / planned;
  if (ratio >= 0.9 && ratio <= 1.15) return full;
  if (ratio >= 0.7 && ratio <= 1.35) return partial;
  if (ratio >= 0.4 && ratio <= 1.6) return Math.round(partial / 2);
  return 0;
}

function activityDate(activity) {
  const raw = activity.startDateLocal || activity.start_date_local || activity.startDate || activity.start_date;
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

function daysBetween(a, b) {
  if (!a || !b) return 99;
  const left = Date.parse(`${a}T00:00:00`);
  const right = Date.parse(`${b}T00:00:00`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 99;
  return Math.round(Math.abs(left - right) / 86400000);
}

function actualPaceSecPerKm(activity) {
  const speed = num(activity.avgSpeed ?? activity.avg_speed);
  if (!speed || speed <= 0) return null;
  return 1000 / speed;
}

function hrZoneFromAvg(avgHr, maxHr) {
  if (!avgHr || !maxHr) return null;
  const pct = avgHr / maxHr;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}

export function scoreWorkoutMatch(workout, activity, { athleteMaxHr } = {}) {
  if (isRestType(workout.workoutType || workout.workout_type)) {
    return { score: 0, confidence: 'low', reasons: ['rest'] };
  }

  const reasons = [];
  let score = 0;
  const wDate = String(workout.scheduledDate || workout.scheduled_date || '').slice(0, 10);
  const aDate = activityDate(activity);
  const dayDelta = daysBetween(wDate, aDate);
  if (dayDelta === 0) {
    score += 40;
    reasons.push('same-day');
  } else if (dayDelta === 1) {
    score += 12;
    reasons.push('adjacent-day');
  } else {
    return { score: 0, confidence: 'low', reasons: ['date-mismatch'] };
  }

  const workoutSport = workout.sport || 'Run';
  const activityFamily = sportFamilyFromBlob(`${activity.type || ''} ${activity.sportType || activity.sport_type || ''}`.toLowerCase());
  const workoutFamily = sportFamilyFromBlob(String(workoutSport).toLowerCase()) || workoutSport;
  const sportMatch = activityFamily && workoutFamily && String(activityFamily).toLowerCase() === String(workoutFamily).toLowerCase();
  if (sportMatch) {
    score += 25;
    reasons.push('sport');
  } else {
    score -= 20;
    reasons.push('sport-mismatch');
  }

  const plannedDistance = num(workout.distance);
  const actualDistance = num(activity.distance);
  const distancePts = ratioScore(plannedDistance, actualDistance, 15, 8);
  if (distancePts) {
    score += distancePts;
    reasons.push('distance');
  }

  const plannedDuration = num(workout.duration);
  const actualDuration = num(activity.movingTime ?? activity.moving_time ?? activity.elapsedTime ?? activity.elapsed_time);
  const durationPts = ratioScore(plannedDuration, actualDuration, 10, 5);
  if (durationPts) {
    score += durationPts;
    reasons.push('duration');
  }

  const plannedPace = num(workout.targetPace ?? workout.target_pace);
  const actualPace = actualPaceSecPerKm(activity);
  if (plannedPace && actualPace) {
    const paceRatio = actualPace / plannedPace;
    if (paceRatio >= 0.9 && paceRatio <= 1.12) {
      score += 5;
      reasons.push('pace');
    }
  }

  const plannedHr = num(workout.targetHr ?? workout.target_hr);
  const actualHr = num(activity.avgHeartrate ?? activity.avg_heartrate);
  if (plannedHr && actualHr && Math.abs(actualHr - plannedHr) <= 8) {
    score += 4;
    reasons.push('hr');
  }

  const plannedZone = num(workout.targetHrZone ?? workout.target_hr_zone);
  const actualZone = hrZoneFromAvg(actualHr, athleteMaxHr);
  if (plannedZone && actualZone && plannedZone === actualZone) {
    score += 4;
    reasons.push('hr-zone');
  }

  const plannedPower = num(workout.targetPower ?? workout.target_power);
  const actualPower = num(activity.avgPower ?? activity.avg_power);
  if (plannedPower && actualPower) {
    const powerRatio = actualPower / plannedPower;
    if (powerRatio >= 0.9 && powerRatio <= 1.12) {
      score += 4;
      reasons.push('power');
    }
  }

  score = Math.max(0, Math.min(100, score));
  let confidence = 'low';
  if (score >= 70 && sportMatch && dayDelta === 0) confidence = 'high';
  else if (score >= 50 && sportMatch) confidence = 'medium';

  return { score, confidence, reasons, sportMatch, dayDelta };
}

export function completionFromComparison(workout, activity) {
  const plannedDistance = num(workout.distance);
  const actualDistance = num(activity.distance);
  const plannedDuration = num(workout.duration);
  const actualDuration = num(activity.movingTime ?? activity.moving_time ?? activity.elapsedTime ?? activity.elapsed_time);
  const ratios = [];
  if (plannedDistance && plannedDistance > 0 && actualDistance != null) ratios.push(actualDistance / plannedDistance);
  if (plannedDuration && plannedDuration > 0 && actualDuration != null) ratios.push(actualDuration / plannedDuration);
  if (!ratios.length) return 'completed';
  const best = Math.max(...ratios);
  if (best >= 0.7) return 'completed';
  if (best >= 0.35) return 'partial';
  return 'partial';
}

export function plannedVsActual(workout, activity, { athleteMaxHr } = {}) {
  const metrics = [];
  const plannedDistance = num(workout.distance);
  const actualDistance = num(activity?.distance);
  if (plannedDistance != null || actualDistance != null) {
    metrics.push({
      key: 'distance',
      label: 'Distance',
      planned: plannedDistance,
      actual: actualDistance,
      unit: 'm',
    });
  }

  const plannedDuration = num(workout.duration);
  const actualDuration = num(activity?.movingTime ?? activity?.moving_time);
  if (plannedDuration != null || actualDuration != null) {
    metrics.push({
      key: 'duration',
      label: 'Duration',
      planned: plannedDuration,
      actual: actualDuration,
      unit: 's',
    });
  }

  const plannedPace = num(workout.targetPace ?? workout.target_pace);
  const actualPace = activity ? actualPaceSecPerKm(activity) : null;
  if (plannedPace != null || actualPace != null) {
    metrics.push({
      key: 'pace',
      label: 'Pace',
      planned: plannedPace,
      actual: actualPace,
      unit: 'sec_per_km',
    });
  }

  const plannedHr = num(workout.targetHr ?? workout.target_hr);
  const actualHr = num(activity?.avgHeartrate ?? activity?.avg_heartrate);
  if (plannedHr != null || actualHr != null) {
    metrics.push({
      key: 'hr',
      label: 'Heart rate',
      planned: plannedHr,
      actual: actualHr,
      unit: 'bpm',
    });
  }

  const plannedZone = num(workout.targetHrZone ?? workout.target_hr_zone);
  const actualZone = hrZoneFromAvg(actualHr, athleteMaxHr);
  if (plannedZone != null || actualZone != null) {
    metrics.push({
      key: 'hrZone',
      label: 'HR zone',
      planned: plannedZone,
      actual: actualZone,
      unit: 'zone',
    });
  }

  const plannedPower = num(workout.targetPower ?? workout.target_power);
  const actualPower = num(activity?.avgPower ?? activity?.avg_power);
  if (plannedPower != null || actualPower != null) {
    metrics.push({
      key: 'power',
      label: 'Power',
      planned: plannedPower,
      actual: actualPower,
      unit: 'w',
    });
  }

  return metrics.filter((m) => m.planned != null || m.actual != null);
}

export function chooseAutoMatch(ranked) {
  if (!ranked.length) return { action: 'none' };
  const top = ranked[0];
  const runnerUp = ranked[1];
  const closeSecond = runnerUp && top.score - runnerUp.score < 10 && runnerUp.score >= 50;
  if (top.confidence === 'high' && !closeSecond) return { action: 'auto', candidate: top };
  if (top.confidence === 'medium' || (top.confidence === 'high' && closeSecond)) {
    return { action: 'suggest', candidate: top };
  }
  return { action: 'none' };
}
