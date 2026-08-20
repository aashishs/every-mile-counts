import { camelMany, many } from '../config/db.js';
import { formatDistance, formatDuration, paceFromSpeed, startOfMonth, startOfWeek, startOfYear } from '../utils/format.js';
import { athleteHrContext } from '../utils/maf.js';
import { parseStoredSyncTypes } from '../utils/activityTypes.js';

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

function mafCheck(avgHr, activityMaxHr, mafHr) {
  if (!avgHr || !mafHr) return null;
  const avg = Math.round(avgHr);
  const maf = Math.round(mafHr);
  const delta = avg - maf;
  const relation = delta <= -3 ? 'below' : delta >= 3 ? 'above' : 'at';
  const max = activityMaxHr ? Math.round(activityMaxHr) : null;
  return {
    mafHeartRate: maf,
    avgHeartrate: avg,
    maxHeartrate: max,
    delta,
    relation,
    withinMaf: avg <= maf,
    maxAboveMaf: max != null && max > maf,
    label:
      relation === 'below'
        ? `${Math.abs(delta)} bpm below MAF`
        : relation === 'above'
          ? `${delta} bpm above MAF`
          : 'At MAF',
  };
}

export function analyzeActivity(activity, athlete = {}) {
  const distance = num(activity.distance);
  const moving = num(activity.movingTime ?? activity.moving_time);
  const elevation = num(activity.elevationGain ?? activity.elevation_gain);
  const avgHr = num(activity.avgHeartrate ?? activity.avg_heartrate);
  const activityMaxHr = num(activity.maxHeartrate ?? activity.max_heartrate);
  const profile = athleteHrContext(athlete);
  const maxHr = activityMaxHr || profile.maxHeartRate;
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
    mafCheck: avgHr ? mafCheck(avgHr, activityMaxHr, profile.mafHeartRate) : null,
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

export async function athleteDashboard(athleteId, athlete = {}, { type, syncTypes } = {}) {
  const now = new Date();
  const week = startOfWeek(now);
  const month = startOfMonth(now);
  const year = startOfYear(now);
  const allowed = parseStoredSyncTypes(syncTypes ?? athlete.syncActivityTypes);
  const filterType = type && type !== 'all' && allowed.includes(type) ? type : null;

  const activities = camelMany(
    await many(
      `SELECT * FROM activities WHERE athlete_id = $1 AND start_date >= $2 ORDER BY start_date DESC`,
      [athleteId, year]
    )
  );

  const allTime = camelMany(
    await many(`SELECT * FROM activities WHERE athlete_id = $1 ORDER BY start_date DESC`, [athleteId])
  );

  const visible = (list) =>
    list.filter((a) => {
      const family = sportFamily(a);
      if (!allowed.includes(family)) return false;
      return filterType ? family === filterType : true;
    });
  const scopedYear = visible(activities);
  const scopedAll = visible(allTime);

  const sum = (list, key) => list.reduce((a, b) => a + num(b[key]), 0);
  const inRange = (from) => scopedYear.filter((a) => a.startDate && new Date(a.startDate) >= from);

  const weekly = inRange(week);
  const monthly = inRange(month);
  const yearly = scopedYear;

  const last30 = new Date(now);
  last30.setDate(last30.getDate() - 30);
  const recent = scopedAll.filter((a) => a.startDate && new Date(a.startDate) >= last30);
  const durationView = filterType ? isDurationSport(filterType) : false;

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

  const personalRecords = detectPersonalRecords(scopedAll, filterType);
  const byActivityType = buildActivityTypeHighlights(filterType ? scopedAll : allTime);

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
         AND NOT EXISTS (
           SELECT 1 FROM activity_reviews ar
           WHERE ar.activity_id = rr.activity_id AND ar.status = 'published'
         )
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

  const formatVolume = (list) => {
    if (durationView) return formatDuration(sum(list, 'movingTime'));
    if (filterType === 'Swim') return `${Math.round(sum(list, 'distance'))} m`;
    return formatDistance(sum(list, 'distance'));
  };

  const DISTANCE_SPORTS = ['Run', 'Ride', 'Hike', 'Swim'];
  const distanceSports = DISTANCE_SPORTS.map((sport) => {
    const all = allTime.filter((a) => sportFamily(a) === sport);
    const yearList = all.filter((a) => a.startDate && new Date(a.startDate) >= year);
    const allDist = sum(all, 'distance');
    const yearDist = sum(yearList, 'distance');
    const fmt = (meters) => (sport === 'Swim' ? `${Math.round(meters)} m` : formatDistance(meters));
    return {
      type: sport,
      count: all.length,
      yearCount: yearList.length,
      allTime: allDist,
      yearly: yearDist,
      formattedAllTime: fmt(allDist),
      formattedYearly: fmt(yearDist),
    };
  });

  return {
    filterType: filterType || 'all',
    metric: durationView ? 'duration' : filterType === 'Swim' ? 'swim' : 'distance',
    mileage: {
      weekly: sum(weekly, durationView ? 'movingTime' : 'distance'),
      monthly: sum(monthly, durationView ? 'movingTime' : 'distance'),
      yearly: sum(yearly, durationView ? 'movingTime' : 'distance'),
      allTime: sum(scopedAll, durationView ? 'movingTime' : 'distance'),
      formatted: {
        weekly: formatVolume(weekly),
        monthly: formatVolume(monthly),
        yearly: formatVolume(yearly),
        allTime: formatVolume(scopedAll),
      },
    },
    totals: {
      activities: scopedAll.length,
      elevation: sum(scopedAll, 'elevationGain'),
      movingTime: sum(scopedAll, 'movingTime'),
    },
    consistency,
    recoveryIndicator: consistency > 80 ? 'high load — watch recovery' : consistency > 40 ? 'steady' : 'building',
    personalRecords,
    byActivityType,
    distanceSports,
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

export function sportFamily(activity) {
  const t = `${activity.type || ''} ${activity.sportType || ''}`.toLowerCase();
  if (t.includes('swim')) return 'Swim';
  if (t.includes('ride') || t.includes('cycle') || t.includes('bike')) return 'Ride';
  if (t.includes('run') || t.includes('trail')) return 'Run';
  if (t.includes('walk')) return 'Walk';
  if (t.includes('hike')) return 'Hike';
  if (t.includes('yoga')) return 'Yoga';
  if (t.includes('weight') || t.includes('strength')) return 'WeightTraining';
  if (t.includes('hiit') || t.includes('highintensity')) return 'HIIT';
  if (t.includes('workout')) return 'Workout';
  return activity.type || 'Other';
}

const TYPE_BUCKETS = {
  Run: [
    { key: '5k', label: '5K', min: 5000, max: 10000 },
    { key: '10k', label: '10K', min: 10000, max: 21097.5 },
    { key: 'hm', label: 'Half marathon', min: 21097.5, max: 42195 },
    { key: 'fm', label: 'Marathon', min: 42195, max: 50000 },
    { key: 'ultra', label: '50K+ ultra', min: 50000, max: Infinity },
  ],
  Ride: [
    { key: '50k', label: '50 km', min: 50000, max: 100000 },
    { key: '100k', label: '100 km', min: 100000, max: 150000 },
    { key: '150k', label: '150 km+', min: 150000, max: Infinity },
  ],
  Swim: [
    { key: '100m', label: '100 m', min: 100, max: 200 },
    { key: '200m', label: '200 m', min: 200, max: 500 },
    { key: '500m', label: '500 m', min: 500, max: 1000 },
    { key: '1000m', label: '1000 m', min: 1000, max: 1500 },
    { key: 'plus', label: '1500 m+', min: 1500, max: Infinity },
  ],
};

function recordPayload(act) {
  return {
    activityId: act.id,
    name: act.name,
    time: formatDuration(act.movingTime),
    movingTime: num(act.movingTime),
    date: act.startDate,
    distance: formatDistance(act.distance),
    meters: num(act.distance),
  };
}

function isDurationSport(type) {
  const t = String(type || '').toLowerCase();
  return [
    'workout', 'weight', 'yoga', 'crossfit', 'pilates', 'stretch', 'hiit',
    'highintensity', 'climb', 'stair', 'elliptical', 'meditation', 'taichi', 'strength',
  ].some((k) => t.includes(k));
}

const DURATION_BUCKETS = [
  { key: '15', label: '15–30 min', min: 15 * 60, max: 30 * 60 },
  { key: '30', label: '30–45 min', min: 30 * 60, max: 45 * 60 },
  { key: '45', label: '45–60 min', min: 45 * 60, max: 60 * 60 },
  { key: '60', label: '60–90 min', min: 60 * 60, max: 90 * 60 },
  { key: '90', label: '90 min+', min: 90 * 60, max: Infinity },
];

export function buildActivityTypeHighlights(activities) {
  const groups = {};
  for (const act of activities) {
    const family = sportFamily(act);
    if (!groups[family]) groups[family] = [];
    groups[family].push(act);
  }

  const order = ['Run', 'Ride', 'Hike', 'Swim'];
  const extra = Object.keys(groups).filter((k) => !order.includes(k)).sort();
  const types = [...order.filter((k) => groups[k]?.length), ...extra.filter((k) => groups[k]?.length)];

  return types.map((type) => {
    const list = groups[type];
    const totalDistance = list.reduce((a, b) => a + num(b.distance), 0);
    const totalTime = list.reduce((a, b) => a + num(b.movingTime || b.elapsedTime), 0);
    const totalCalories = list.reduce((a, b) => a + num(b.calories), 0);
    const metric = TYPE_BUCKETS[type] || ['Hike', 'Walk'].includes(type)
      ? (type === 'Swim' ? 'swim' : 'distance')
      : isDurationSport(type) || totalDistance < 50 * list.length
        ? 'duration'
        : 'distance';

    const bucketDefs = metric === 'duration' ? DURATION_BUCKETS : (TYPE_BUCKETS[type] || []);
    const buckets = bucketDefs.map((bucket) => {
      const matches = list.filter((a) => {
        const value = metric === 'duration' ? num(a.movingTime || a.elapsedTime) : num(a.distance);
        return value >= bucket.min && value < bucket.max && num(a.movingTime || a.elapsedTime) > 0;
      });
      const fastest = [...matches].sort((a, b) => num(a.movingTime) - num(b.movingTime))[0] || null;
      const longestSession = [...matches].sort((a, b) => num(b.movingTime) - num(a.movingTime))[0] || null;
      const highlight = metric === 'duration' ? longestSession : fastest;
      return {
        key: bucket.key,
        label: bucket.label,
        count: matches.length,
        fastest: highlight ? recordPayload(highlight) : null,
        badge: metric === 'duration' ? 'Longest' : 'PR',
      };
    });

    const longest = metric === 'duration'
      ? [...list].sort((a, b) => num(b.movingTime || b.elapsedTime) - num(a.movingTime || a.elapsedTime))[0]
      : [...list].sort((a, b) => num(b.distance) - num(a.distance))[0];

    const formattedPrimary = metric === 'swim'
      ? `${Math.round(totalDistance)} m`
      : metric === 'duration'
        ? formatDuration(totalTime)
        : formatDistance(totalDistance);

    return {
      type,
      metric,
      count: list.length,
      distance: totalDistance,
      formattedDistance: formattedPrimary,
      formattedTime: formatDuration(totalTime),
      formattedCalories: totalCalories ? `${Math.round(totalCalories)} kcal` : null,
      buckets,
      longest: longest
        ? {
            ...recordPayload(longest),
            distance: metric === 'swim'
              ? `${Math.round(num(longest.distance))} m`
              : metric === 'duration'
                ? formatDuration(longest.movingTime || longest.elapsedTime)
                : formatDistance(longest.distance),
          }
        : null,
    };
  });
}

export function detectPersonalRecords(activities, type) {
  const family = type && type !== 'all' ? type : 'Run';
  const list = activities.filter((a) => sportFamily(a) === family);
  const records = {};
  const buckets = TYPE_BUCKETS[family];
  if (buckets) {
    for (const bucket of buckets) {
      const candidates = list.filter(
        (a) => num(a.distance) >= bucket.min && num(a.distance) < bucket.max && a.movingTime
      );
      const best = candidates.sort((a, b) => num(a.movingTime) - num(b.movingTime))[0];
      if (best) {
        records[bucket.key] = {
          ...recordPayload(best),
          label: `PR ${bucket.label}`,
        };
      }
    }
    const longest = [...list].sort((a, b) => num(b.distance) - num(a.distance))[0];
    if (longest) {
      records.longest = {
        ...recordPayload(longest),
        distance: family === 'Swim' ? `${Math.round(num(longest.distance))} m` : formatDistance(longest.distance),
        label: family === 'Swim' ? 'Longest swim' : 'Longest distance',
      };
    }
    return records;
  }

  if (isDurationSport(family)) {
    const longest = [...list].sort((a, b) => num(b.movingTime || b.elapsedTime) - num(a.movingTime || a.elapsedTime))[0];
    if (longest) {
      records.longestSession = {
        ...recordPayload(longest),
        distance: formatDuration(longest.movingTime || longest.elapsedTime),
        label: 'Longest session',
      };
    }
    return records;
  }

  const longest = [...list].sort((a, b) => num(b.distance) - num(a.distance))[0];
  if (longest) {
    records.longestDistance = {
      ...recordPayload(longest),
      label: 'Longest distance',
    };
  }
  return records;
}

function volumeMetric(type) {
  if (!type || type === 'all') return 'distance';
  if (isDurationSport(type)) return 'duration';
  if (type === 'Swim') return 'swim';
  return 'distance';
}

function formatVolumeValue(distance, time, metric) {
  if (metric === 'duration') return formatDuration(time);
  if (metric === 'swim') return `${Math.round(distance)} m`;
  return formatDistance(distance);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function periodMonths(period) {
  const p = String(period ?? '90').toLowerCase();
  if (p === 'all' || p === '0') return null;
  const n = Number(p);
  if (n === 180 || n === 6) return 6;
  if (n === 365 || n === 12) return 12;
  return 3;
}

function localYmd(date = new Date()) {
  const d = new Date(date);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function addMonths({ year, month }, delta) {
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

function monthStamp({ year, month }) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Local midnight on the 1st, as UTC ISO so Postgres does not include the previous day. */
function localMidnightFirst(ym) {
  return new Date(ym.year, ym.month - 1, 1, 0, 0, 0, 0).toISOString();
}

function monthLabel(stamp) {
  const [year, month] = stamp.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${String(year).slice(-2)}`;
}

function eachMonthStamps(fromYm, toYm) {
  const keys = [];
  let cursor = { ...fromYm };
  const end = monthStamp(toYm);
  while (monthStamp(cursor) <= end) {
    keys.push(monthStamp(cursor));
    cursor = addMonths(cursor, 1);
  }
  return keys;
}

function monthKey(date) {
  return monthStamp(localYmd(date));
}

function periodWindow(period, today = new Date()) {
  const named = periodMonths(period);
  const now = localYmd(today);
  if (!named) {
    return { named: null, monthCount: null, since: null, prevSince: null, sinceYm: null, nowYm: now };
  }
  // On the 1st, current month has just started — include it plus N complete prior months.
  const monthCount = now.day === 1 ? named + 1 : named;
  const sinceYm = addMonths(now, -(monthCount - 1));
  const prevSinceYm = addMonths(sinceYm, -monthCount);
  return {
    named,
    monthCount,
    since: localMidnightFirst(sinceYm),
    prevSince: localMidnightFirst(prevSinceYm),
    sinceYm,
    nowYm: now,
  };
}

function monthlySeries(activities, fromYm, toYm) {
  const buckets = {};
  for (const act of activities) {
    const key = monthKey(act.startDate);
    if (!buckets[key]) {
      buckets[key] = { distance: 0, time: 0, paceDistance: 0, paceTime: 0, hrSum: 0, hrCount: 0, count: 0 };
    }
    const b = buckets[key];
    b.count += 1;
    b.distance += num(act.distance);
    b.time += num(act.movingTime);
    if (num(act.avgSpeed) > 0 && num(act.distance) > 0) {
      b.paceDistance += num(act.distance);
      b.paceTime += num(act.movingTime);
    }
    if (act.avgHeartrate) {
      b.hrSum += num(act.avgHeartrate);
      b.hrCount += 1;
    }
  }

  return eachMonthStamps(fromYm, toYm).map((key) => {
    const b = buckets[key] || { distance: 0, time: 0, paceDistance: 0, paceTime: 0, hrSum: 0, hrCount: 0, count: 0 };
    return {
      month: key,
      label: monthLabel(key),
      count: b.count,
      distance: b.distance,
      time: b.time,
      paceSecPerKm: b.paceDistance > 0 ? b.paceTime / (b.paceDistance / 1000) : null,
      hr: b.hrCount ? b.hrSum / b.hrCount : null,
    };
  });
}

export async function periodAnalysis(athleteId, period = '90', { type, syncTypes } = {}) {
  const window = periodWindow(period);
  const { named, monthCount, since, prevSince, sinceYm, nowYm } = window;
  const allowed = parseStoredSyncTypes(syncTypes);
  const filterType = type && type !== 'all' && allowed.includes(type) ? type : null;
  const metric = volumeMetric(filterType);

  const currentRaw = camelMany(
    await many(
      since
        ? `SELECT * FROM activities WHERE athlete_id = $1 AND start_date >= $2::timestamptz ORDER BY start_date`
        : `SELECT * FROM activities WHERE athlete_id = $1 ORDER BY start_date`,
      since ? [athleteId, since] : [athleteId]
    )
  );
  const previousRaw = named
    ? camelMany(
        await many(
          `SELECT * FROM activities WHERE athlete_id = $1 AND start_date >= $2::timestamptz AND start_date < $3::timestamptz`,
          [athleteId, prevSince, since]
        )
      )
    : [];
  const inSyncTypes = (list) =>
    list.filter((a) => {
      const family = sportFamily(a);
      if (!allowed.includes(family)) return false;
      return filterType ? family === filterType : true;
    });
  const current = inSyncTypes(currentRaw);
  const previous = inSyncTypes(previousRaw);

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
  const compareKey = metric === 'duration' ? 'time' : 'distance';

  const byType = {};
  for (const act of current) {
    const family = sportFamily(act);
    if (!byType[family]) byType[family] = { count: 0, distance: 0, time: 0, elevation: 0 };
    byType[family].count += 1;
    byType[family].distance += num(act.distance);
    byType[family].time += num(act.movingTime);
    byType[family].elevation += num(act.elevationGain);
  }

  const chartFromYm = sinceYm || (current[0]?.startDate ? localYmd(current[0].startDate) : nowYm);
  const monthlyBreakdown = monthlySeries(current, chartFromYm, nowYm);

  const allTime = camelMany(await many(`SELECT * FROM activities WHERE athlete_id = $1`, [athleteId]));

  return {
    period: named ? `${named}m` : 'all',
    monthCount,
    periodStart: since || localMidnightFirst(chartFromYm),
    filterType: filterType || 'all',
    metric,
    current: {
      ...cur,
      formatted: {
        distance: formatVolumeValue(cur.distance, cur.time, metric),
        time: formatDuration(cur.time),
        elevation: `${Math.round(cur.elevation)} m`,
      },
    },
    previous: prev,
    comparison: named
      ? {
          distancePct: Math.round(delta(cur[compareKey], prev[compareKey])),
          timePct: Math.round(delta(cur.time, prev.time)),
          countPct: Math.round(delta(cur.count, prev.count)),
        }
      : { distancePct: null, timePct: null, countPct: null },
    byType,
    monthlyBreakdown,
    weeklyBreakdown: monthlyBreakdown,
    personalRecords: detectPersonalRecords(allTime, filterType),
    paceTrends: monthlyBreakdown,
  };
}

function paceSecondsPerKm(activity) {
  const speed = num(activity.avgSpeed);
  if (speed > 0) return 1000 / speed;
  const distance = num(activity.distance);
  const time = num(activity.movingTime);
  if (distance > 50 && time > 0) return time / (distance / 1000);
  return null;
}

function formatClockDelta(totalSec) {
  const sec = Math.round(Math.abs(totalSec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatHr(value) {
  return value ? `${Math.round(value)} bpm` : '—';
}

function snapshot(activity, athlete = {}) {
  const insights = analyzeActivity(activity, athlete);
  const metric = volumeMetric(sportFamily(activity));
  const paceSec = paceSecondsPerKm(activity);
  return {
    id: activity.id,
    name: activity.name,
    type: activity.type,
    sport: sportFamily(activity),
    metric,
    startDate: activity.startDate,
    distance: num(activity.distance),
    movingTime: num(activity.movingTime),
    elevationGain: num(activity.elevationGain),
    avgHeartrate: num(activity.avgHeartrate) || null,
    maxHeartrate: num(activity.maxHeartrate) || null,
    avgCadence: num(activity.avgCadence) || null,
    avgPower: num(activity.avgPower) || null,
    avgSpeed: num(activity.avgSpeed) || null,
    calories: num(activity.calories) || null,
    paceSecPerKm: paceSec,
    pace: insights.pace,
    trainingLoad: insights.trainingLoad,
    heartRateZone: insights.heartRateZone,
    paceConsistency: insights.paceConsistency,
    formatted: {
      distance: metric === 'swim' ? `${Math.round(num(activity.distance))} m` : formatDistance(activity.distance),
      time: formatDuration(activity.movingTime),
      pace: insights.pace ? `${insights.pace} /km` : '—',
      elevation: `${Math.round(num(activity.elevationGain))} m`,
      hr: formatHr(activity.avgHeartrate),
      maxHr: formatHr(activity.maxHeartrate),
      cadence: activity.avgCadence ? `${Math.round(activity.avgCadence)} spm` : '—',
      load: insights.trainingLoad != null ? String(Math.round(insights.trainingLoad)) : '—',
    },
  };
}

function compareRow(key, label, olderDisplay, newerDisplay, { improved, deltaLabel, better } = {}) {
  return { key, label, older: olderDisplay, newer: newerDisplay, improved, deltaLabel: deltaLabel || '—', better };
}

export function compareActivities(activityA, activityB, athlete = {}) {
  const sportA = sportFamily(activityA);
  const sportB = sportFamily(activityB);
  if (sportA !== sportB) {
    const err = new Error(`Pick two ${sportA} sessions. These are ${sportA} and ${sportB}.`);
    err.status = 400;
    throw err;
  }

  const firstIsOlder = new Date(activityA.startDate) <= new Date(activityB.startDate);
  const olderAct = firstIsOlder ? activityA : activityB;
  const newerAct = firstIsOlder ? activityB : activityA;
  const older = snapshot(olderAct, athlete);
  const newer = snapshot(newerAct, athlete);
  const metric = older.metric;
  const comparable =
    metric === 'duration'
      ? Boolean(older.movingTime && newer.movingTime && Math.abs(older.movingTime - newer.movingTime) / Math.max(older.movingTime, newer.movingTime) <= 0.2)
      : Boolean(older.distance && newer.distance && Math.abs(older.distance - newer.distance) / Math.max(older.distance, newer.distance) <= 0.2);

  const rows = [];

  if (metric !== 'duration') {
    const distDelta = newer.distance - older.distance;
    rows.push(compareRow('distance', metric === 'swim' ? 'Distance' : 'Distance', older.formatted.distance, newer.formatted.distance, {
      improved: Math.abs(distDelta) < 50 ? null : distDelta > 0,
      deltaLabel: Math.abs(distDelta) < 50 ? 'similar' : `${distDelta > 0 ? '+' : ''}${metric === 'swim' ? `${Math.round(distDelta)} m` : formatDistance(distDelta)}`,
      better: 'higher',
    }));
  }

  const timeDelta = newer.movingTime - older.movingTime;
  rows.push(compareRow('time', 'Time', older.formatted.time, newer.formatted.time, {
    improved: metric === 'duration' ? (Math.abs(timeDelta) < 30 ? null : timeDelta > 0) : (comparable ? timeDelta < 0 : null),
    deltaLabel: Math.abs(timeDelta) < 5 ? 'similar' : `${timeDelta > 0 ? '+' : '−'}${formatClockDelta(timeDelta)}`,
    better: metric === 'duration' ? 'neutral' : 'lower',
  }));

  let paceImproved = null;
  if (older.paceSecPerKm && newer.paceSecPerKm) {
    const paceDelta = newer.paceSecPerKm - older.paceSecPerKm;
    paceImproved = Math.abs(paceDelta) < 2 ? null : paceDelta < 0;
    rows.push(compareRow('pace', 'Pace', older.formatted.pace, newer.formatted.pace, {
      improved: paceImproved,
      deltaLabel: Math.abs(paceDelta) < 2
        ? 'similar'
        : `${formatClockDelta(paceDelta)} /km ${paceDelta < 0 ? 'faster' : 'slower'}`,
      better: 'lower',
    }));
  }

  let hrImproved = null;
  if (older.avgHeartrate && newer.avgHeartrate) {
    const hrDelta = newer.avgHeartrate - older.avgHeartrate;
    hrImproved = Math.abs(hrDelta) < 3 ? null : hrDelta < 0;
    rows.push(compareRow('hr', 'Avg HR', older.formatted.hr, newer.formatted.hr, {
      improved: hrImproved,
      deltaLabel: Math.abs(hrDelta) < 3 ? 'similar' : `${hrDelta > 0 ? '+' : ''}${Math.round(hrDelta)} bpm`,
      better: 'lower',
    }));
  }

  if (older.maxHeartrate && newer.maxHeartrate) {
    const maxDelta = newer.maxHeartrate - older.maxHeartrate;
    rows.push(compareRow('maxHr', 'Max HR', older.formatted.maxHr, newer.formatted.maxHr, {
      improved: Math.abs(maxDelta) < 3 ? null : maxDelta < 0,
      deltaLabel: Math.abs(maxDelta) < 3 ? 'similar' : `${maxDelta > 0 ? '+' : ''}${Math.round(maxDelta)} bpm`,
      better: 'lower',
    }));
  }

  rows.push(compareRow('elevation', 'Elevation', older.formatted.elevation, newer.formatted.elevation, {
    improved: null,
    deltaLabel: `${newer.elevationGain - older.elevationGain >= 0 ? '+' : ''}${Math.round(newer.elevationGain - older.elevationGain)} m`,
    better: 'neutral',
  }));

  if (older.avgCadence && newer.avgCadence) {
    const cadDelta = newer.avgCadence - older.avgCadence;
    rows.push(compareRow('cadence', 'Cadence', older.formatted.cadence, newer.formatted.cadence, {
      improved: Math.abs(cadDelta) < 3 ? null : cadDelta > 0,
      deltaLabel: Math.abs(cadDelta) < 3 ? 'similar' : `${cadDelta > 0 ? '+' : ''}${Math.round(cadDelta)} spm`,
      better: 'higher',
    }));
  }

  if (older.trainingLoad != null && newer.trainingLoad != null) {
    const loadDelta = newer.trainingLoad - older.trainingLoad;
    rows.push(compareRow('load', 'Load', older.formatted.load, newer.formatted.load, {
      improved: null,
      deltaLabel: Math.abs(loadDelta) < 2 ? 'similar' : `${loadDelta > 0 ? '+' : ''}${Math.round(loadDelta)}`,
      better: 'neutral',
    }));
  }

  let verdict = 'mixed';
  let headline = `Comparing two ${sportA.toLowerCase()} sessions, older to newer.`;
  if (!comparable) {
    verdict = 'different';
    headline = `These ${sportA.toLowerCase()}s are different lengths. Pace is the fairest performance signal.`;
  }
  if (paceImproved === true && hrImproved !== false) {
    verdict = 'improved';
    headline = comparable
      ? 'The newer session is faster — that is a performance improvement.'
      : 'The newer session is faster, even though the distances differ.';
  } else if (paceImproved === true && hrImproved === false) {
    verdict = 'mixed';
    headline = 'The newer session is faster, but heart rate was higher. Speed improved; efficiency is mixed.';
  } else if (paceImproved === false && hrImproved === true) {
    verdict = 'mixed';
    headline = 'The newer session was slower, but heart rate was lower. That can be easier effort, not lost fitness.';
  } else if (paceImproved === false) {
    verdict = 'slower';
    headline = comparable
      ? 'The newer session is slower than the earlier one.'
      : 'The newer session has a slower pace. Distances differ, so treat this as a clue, not a verdict.';
  } else if (paceImproved == null && hrImproved === true && comparable) {
    verdict = 'improved';
    headline = 'Pace is similar, and heart rate is lower — that is better efficiency.';
  } else if (comparable && paceImproved == null && hrImproved == null) {
    verdict = 'similar';
    headline = 'These sessions look similar. No clear performance change.';
  } else if (metric === 'duration' && hrImproved === true) {
    verdict = 'improved';
    headline = 'Heart rate is lower on the newer session — effort looks more efficient.';
  }

  return {
    sport: sportA,
    metric,
    comparable,
    verdict,
    headline,
    older,
    newer,
    rows,
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
