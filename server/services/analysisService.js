import { camelMany, many } from '../config/db.js';
import { formatDistance, formatDuration, paceFromSpeed, startOfMonth, startOfWeek, startOfYear } from '../utils/format.js';

function num(v) {
  return v == null ? 0 : Number(v);
}

function stddev(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function hrZones(avgHr, maxHr) {
  if (!avgHr || !maxHr) return null;
  const pct = avgHr / maxHr;
  if (pct < 0.6) return { zone: 1, label: 'Recovery', pct };
  if (pct < 0.7) return { zone: 2, label: 'Endurance', pct };
  if (pct < 0.8) return { zone: 3, label: 'Aerobic', pct };
  if (pct < 0.9) return { zone: 4, label: 'Threshold', pct };
  return { zone: 5, label: 'VO2 Max', pct };
}

export function analyzeActivity(activity, athlete = {}) {
  const distance = num(activity.distance);
  const moving = num(activity.movingTime ?? activity.moving_time);
  const elevation = num(activity.elevationGain ?? activity.elevation_gain);
  const avgHr = num(activity.avgHeartrate ?? activity.avg_heartrate);
  const maxHr = num(activity.maxHeartrate ?? activity.max_heartrate) || athlete.maxHeartRate || athlete.max_heart_rate;
  const cadence = num(activity.avgCadence ?? activity.avg_cadence);
  const avgSpeed = num(activity.avgSpeed ?? activity.avg_speed);
  const splits = activity.splits || [];

  const pace = paceFromSpeed(avgSpeed);
  const splitPaces = Array.isArray(splits)
    ? splits.map((s) => num(s.pace || s.moving_time || s.elapsed_time)).filter(Boolean)
    : [];
  const paceCv = splitPaces.length > 1 ? stddev(splitPaces) / (splitPaces.reduce((a, b) => a + b, 0) / splitPaces.length) : null;

  let paceConsistency = 'unknown';
  if (paceCv != null) {
    if (paceCv < 0.04) paceConsistency = 'excellent';
    else if (paceCv < 0.08) paceConsistency = 'good';
    else if (paceCv < 0.12) paceConsistency = 'fair';
    else paceConsistency = 'inconsistent';
  }

  const zone = hrZones(avgHr, maxHr);
  const elevPerKm = distance > 0 ? elevation / (distance / 1000) : 0;
  const trainingLoad =
    num(activity.trainingLoad ?? activity.training_load) ||
    (moving && avgHr ? (moving / 60) * (avgHr / 100) : moving / 60);

  const cadenceEfficiency =
    cadence && avgSpeed
      ? cadence >= 170 && cadence <= 190
        ? 'efficient'
        : cadence < 170
          ? 'low (consider quicker turnover)'
          : 'high'
      : null;

  const recovery =
    zone?.zone >= 4 || trainingLoad > 80
      ? 'Prioritize easy movement, sleep, and hydration over the next 24–48 hours.'
      : zone?.zone === 3
        ? 'A light recovery session or rest day will help absorb this work.'
        : 'You can continue aerobic training; keep intensity controlled.';

  const elevationImpact =
    elevPerKm > 40
      ? 'Significant climbing likely slowed pace; compare effort, not just speed.'
      : elevPerKm > 20
        ? 'Moderate hills. Expect some pace variation on climbs and descents.'
        : 'Mostly flat. Pace is a reliable performance signal.';

  return {
    pace,
    paceConsistency,
    paceCoefficientOfVariation: paceCv,
    splitCount: splitPaces.length,
    heartRateZone: zone,
    cadenceEfficiency,
    elevationPerKm: Math.round(elevPerKm * 10) / 10,
    elevationImpact,
    trainingLoad: Math.round(trainingLoad * 10) / 10,
    recoveryRecommendation: recovery,
    summary: {
      distance: formatDistance(distance),
      movingTime: formatDuration(moving),
      pace,
      elevation: `${Math.round(elevation)} m`,
    },
  };
}

export async function athleteDashboard(athleteId, athlete = {}) {
  const now = new Date();
  const week = startOfWeek(now);
  const month = startOfMonth(now);
  const year = startOfYear(now);

  const activities = camelMany(
    await many(
      `SELECT * FROM activities WHERE athlete_id = $1 AND start_date >= $2 ORDER BY start_date DESC`,
      [athleteId, year]
    )
  );

  const allTime = camelMany(
    await many(`SELECT * FROM activities WHERE athlete_id = $1 ORDER BY start_date DESC`, [athleteId])
  );

  const sum = (list, key) => list.reduce((a, b) => a + num(b[key]), 0);
  const inRange = (from) => activities.filter((a) => a.startDate && new Date(a.startDate) >= from);

  const weekly = inRange(week);
  const monthly = inRange(month);
  const yearly = activities;

  const last30 = new Date(now);
  last30.setDate(last30.getDate() - 30);
  const recent = allTime.filter((a) => a.startDate && new Date(a.startDate) >= last30);

  const weeklyTrend = {};
  for (const act of recent) {
    const key = startOfWeek(act.startDate).toISOString().slice(0, 10);
    if (!weeklyTrend[key]) weeklyTrend[key] = { week: key, count: 0, distance: 0, time: 0, elevation: 0 };
    weeklyTrend[key].count += 1;
    weeklyTrend[key].distance += num(act.distance);
    weeklyTrend[key].time += num(act.movingTime);
    weeklyTrend[key].elevation += num(act.elevationGain);
  }

  const daysWithActivity = new Set(
    recent.map((a) => new Date(a.startDate).toISOString().slice(0, 10))
  ).size;
  const consistency = Math.round((daysWithActivity / 30) * 100);

  const personalRecords = detectPersonalRecords(allTime);

  const coaches = camelMany(
    await many(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url
       FROM coach_assignments ca
       JOIN users u ON u.id = ca.coach_id
       WHERE ca.athlete_id = $1 AND ca.status = 'active'`,
      [athleteId]
    )
  );

  const pendingReviews = camelMany(
    await many(
      `SELECT rr.*, a.name AS activity_name, a.start_date
       FROM review_requests rr
       JOIN activities a ON a.id = rr.activity_id
       WHERE rr.athlete_id = $1 AND rr.status = 'pending'
       ORDER BY rr.requested_at DESC
       LIMIT 10`,
      [athleteId]
    )
  );

  const upcomingEvents = camelMany(
    await many(
      `SELECT * FROM events
       WHERE owner_type = 'athlete' AND owner_id = $1 AND status = 'upcoming'
       ORDER BY event_date ASC LIMIT 5`,
      [athleteId]
    )
  );

  const goals = camelMany(
    await many(
      `SELECT * FROM goals WHERE athlete_id = $1 AND status = 'active' ORDER BY target_date NULLS LAST`,
      [athleteId]
    )
  );

  const avgPaceSeries = recent
    .filter((a) => a.avgSpeed)
    .slice()
    .reverse()
    .map((a) => ({
      date: a.startDate,
      paceSecPerKm: 1000 / Number(a.avgSpeed),
      hr: a.avgHeartrate,
      distance: a.distance,
    }));

  return {
    mileage: {
      weekly: sum(weekly, 'distance'),
      monthly: sum(monthly, 'distance'),
      yearly: sum(yearly, 'distance'),
      formatted: {
        weekly: formatDistance(sum(weekly, 'distance')),
        monthly: formatDistance(sum(monthly, 'distance')),
        yearly: formatDistance(sum(yearly, 'distance')),
      },
    },
    totals: {
      activities: allTime.length,
      elevation: sum(allTime, 'elevationGain'),
      movingTime: sum(allTime, 'movingTime'),
    },
    consistency,
    recoveryIndicator: consistency > 80 ? 'high load — watch recovery' : consistency > 40 ? 'steady' : 'building',
    personalRecords,
    paceTrends: avgPaceSeries,
    weeklyTrend: Object.values(weeklyTrend).sort((a, b) => a.week.localeCompare(b.week)),
    coaches,
    pendingReviews,
    upcomingEvents,
    goals: goals.map((g) => ({
      ...g,
      completionPct: g.targetValue ? Math.min(100, Math.round((num(g.currentValue) / num(g.targetValue)) * 100)) : 0,
    })),
  };
}

export function detectPersonalRecords(activities) {
  const targets = [
    { key: 'fastest5k', meters: 5000, type: 'Run' },
    { key: 'fastest10k', meters: 10000, type: 'Run' },
    { key: 'fastestHalf', meters: 21097, type: 'Run' },
    { key: 'fastestMarathon', meters: 42195, type: 'Run' },
  ];
  const records = {};
  for (const t of targets) {
    const candidates = activities.filter(
      (a) => a.type === t.type && num(a.distance) >= t.meters * 0.98 && num(a.distance) <= t.meters * 1.08 && a.movingTime
    );
    const best = candidates.sort((a, b) => num(a.movingTime) - num(b.movingTime))[0];
    if (best) {
      records[t.key] = {
        activityId: best.id,
        name: best.name,
        time: formatDuration(best.movingTime),
        date: best.startDate,
        distance: formatDistance(best.distance),
      };
    }
  }
  const longest = [...activities].sort((a, b) => num(b.distance) - num(a.distance))[0];
  if (longest) {
    records.longestDistance = {
      activityId: longest.id,
      name: longest.name,
      distance: formatDistance(longest.distance),
      date: longest.startDate,
      type: longest.type,
    };
  }
  return records;
}

export async function periodAnalysis(athleteId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - Number(days));
  const prevSince = new Date(since);
  prevSince.setDate(prevSince.getDate() - Number(days));

  const current = camelMany(
    await many(
      `SELECT * FROM activities WHERE athlete_id = $1 AND start_date >= $2 ORDER BY start_date`,
      [athleteId, since]
    )
  );
  const previous = camelMany(
    await many(
      `SELECT * FROM activities WHERE athlete_id = $1 AND start_date >= $2 AND start_date < $3`,
      [athleteId, prevSince, since]
    )
  );

  const aggregate = (list) => ({
    count: list.length,
    distance: list.reduce((a, b) => a + num(b.distance), 0),
    time: list.reduce((a, b) => a + num(b.movingTime), 0),
    elevation: list.reduce((a, b) => a + num(b.elevationGain), 0),
    avgHr: list.filter((a) => a.avgHeartrate).length
      ? list.reduce((a, b) => a + num(b.avgHeartrate), 0) / list.filter((a) => a.avgHeartrate).length
      : 0,
    avgCadence: list.filter((a) => a.avgCadence).length
      ? list.reduce((a, b) => a + num(b.avgCadence), 0) / list.filter((a) => a.avgCadence).length
      : 0,
  });

  const cur = aggregate(current);
  const prev = aggregate(previous);
  const delta = (a, b) => (b ? ((a - b) / b) * 100 : a ? 100 : 0);

  const byType = {};
  for (const act of current) {
    if (!byType[act.type]) byType[act.type] = { count: 0, distance: 0, time: 0, elevation: 0 };
    byType[act.type].count += 1;
    byType[act.type].distance += num(act.distance);
    byType[act.type].time += num(act.movingTime);
    byType[act.type].elevation += num(act.elevationGain);
  }

  const weeklyBreakdown = {};
  for (const act of current) {
    const key = startOfWeek(act.startDate).toISOString().slice(0, 10);
    if (!weeklyBreakdown[key]) weeklyBreakdown[key] = { week: key, count: 0, distance: 0, time: 0 };
    weeklyBreakdown[key].count += 1;
    weeklyBreakdown[key].distance += num(act.distance);
    weeklyBreakdown[key].time += num(act.movingTime);
  }

  const personalRecords = detectPersonalRecords(
    camelMany(await many(`SELECT * FROM activities WHERE athlete_id = $1`, [athleteId]))
  );

  return {
    period: Number(days),
    current: {
      ...cur,
      formatted: {
        distance: formatDistance(cur.distance),
        time: formatDuration(cur.time),
        elevation: `${Math.round(cur.elevation)} m`,
      },
    },
    previous: prev,
    comparison: {
      distancePct: Math.round(delta(cur.distance, prev.distance)),
      timePct: Math.round(delta(cur.time, prev.time)),
      countPct: Math.round(delta(cur.count, prev.count)),
    },
    byType,
    weeklyBreakdown: Object.values(weeklyBreakdown).sort((a, b) => a.week.localeCompare(b.week)),
    personalRecords,
    paceTrends: current
      .filter((a) => a.avgSpeed)
      .map((a) => ({ date: a.startDate, paceSecPerKm: 1000 / Number(a.avgSpeed), hr: a.avgHeartrate })),
  };
}

export async function clubAnalytics(clubId) {
  const members = camelMany(
    await many(
      `SELECT u.id FROM club_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.club_id = $1 AND cm.status = 'active'`,
      [clubId]
    )
  );
  const ids = members.map((m) => m.id);
  if (!ids.length) {
    return { members: 0, distance: 0, activities: 0, leaderboard: [] };
  }
  const since = startOfMonth();
  const rows = camelMany(
    await many(
      `SELECT a.athlete_id, u.first_name, u.last_name,
              COUNT(*)::int AS activities,
              COALESCE(SUM(a.distance),0) AS distance,
              COALESCE(SUM(a.moving_time),0) AS moving_time
       FROM activities a
       JOIN users u ON u.id = a.athlete_id
       WHERE a.athlete_id = ANY($1::uuid[]) AND a.start_date >= $2
       GROUP BY a.athlete_id, u.first_name, u.last_name
       ORDER BY distance DESC
       LIMIT 25`,
      [ids, since]
    )
  );
  return {
    members: ids.length,
    activities: rows.reduce((a, b) => a + num(b.activities), 0),
    distance: rows.reduce((a, b) => a + num(b.distance), 0),
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      athleteId: r.athleteId,
      name: `${r.firstName} ${r.lastName}`,
      activities: r.activities,
      distance: r.distance,
      formattedDistance: formatDistance(r.distance),
    })),
  };
}
