export function formatSplitClock(secondsPerKm) {
  const sec = Number(secondsPerKm);
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}:${String(rem).padStart(2, '0')}`;
}

function splitPace(split) {
  if (Number(split?.pace) > 0) return Number(split.pace);
  const dist = Number(split?.distance);
  const time = Number(split?.movingTime ?? split?.moving_time);
  if (dist > 0 && time > 0) return time / (dist / 1000);
  return null;
}

export function normalizeSplits(splits) {
  if (!Array.isArray(splits) || !splits.length) return [];
  return splits.map((split, index) => {
    const distanceM = Number(split.distance) > 0 ? Number(split.distance) : 1000;
    const paceSec = splitPace(split);
    const elevM = split.elevation != null ? Number(split.elevation) : null;
    return {
      index,
      kmLabel: distanceM >= 950 ? String(index + 1) : (distanceM / 1000).toFixed(1).replace(/\.0$/, ''),
      distanceM,
      paceSec,
      elevM: Number.isFinite(elevM) ? Math.round(elevM) : null,
      hr: split.hr != null && Number(split.hr) > 0 ? Math.round(Number(split.hr)) : null,
      movingTime: Number(split.movingTime ?? split.moving_time) || null,
    };
  });
}

function altitudeAt(track, meters) {
  const dist = track?.distance || [];
  const alt = track?.altitude || [];
  if (!dist.length || !alt.length) return null;
  for (let i = 0; i < dist.length; i += 1) {
    if (Number(dist[i]) >= meters && alt[i] != null) return Number(alt[i]);
  }
  const last = alt[alt.length - 1];
  return last != null ? Number(last) : null;
}

export function fillMissingElevation(rows, track) {
  if (!rows?.length) return rows || [];
  if (!track?.altitude?.length || !track?.distance?.length) return rows;
  let cursor = 0;
  return rows.map((row) => {
    if (row.elevM != null) {
      cursor += row.distanceM;
      return row;
    }
    const start = altitudeAt(track, cursor);
    const end = altitudeAt(track, cursor + row.distanceM);
    cursor += row.distanceM;
    if (start == null || end == null) return row;
    return { ...row, elevM: Math.round(end - start) };
  });
}

export function splitBarWidths(rows) {
  const paces = rows.map((row) => row.paceSec).filter((n) => n > 0);
  if (!paces.length) return rows.map(() => 24);
  const minP = Math.min(...paces);
  const maxP = Math.max(...paces);
  return rows.map((row) => {
    if (!(row.paceSec > 0)) return 16;
    if (maxP === minP) return 70;
    return 18 + ((maxP - row.paceSec) / (maxP - minP)) * 82;
  });
}

export function elevationSummary(series) {
  const vals = (series || [])
    .map((row) => row?.elev)
    .filter((v) => v != null && Number.isFinite(Number(v)))
    .map(Number);
  if (vals.length < 3) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max - min < 1) return null;
  let gain = 0;
  let prev = null;
  for (const row of series) {
    if (row?.elev == null) continue;
    const n = Number(row.elev);
    if (prev != null && n > prev) gain += n - prev;
    prev = n;
  }
  return { gain: Math.round(gain), max: Math.round(max), min: Math.round(min) };
}

export function fastestSplitPace(rows) {
  const paced = (rows || []).filter((row) => row?.paceSec > 0);
  const full = paced.filter((row) => row.distanceM >= 950);
  const pool = full.length ? full : paced;
  if (!pool.length) return null;
  return Math.min(...pool.map((row) => row.paceSec));
}

export function elapsedPaceSec(activity) {
  const distKm = Number(activity?.distance) / 1000;
  const elapsed = Number(activity?.elapsedTime);
  if (!(distKm > 0) || !(elapsed > 0)) return null;
  return elapsed / distKm;
}

export function nearestSeriesPoint(series, km) {
  if (!Array.isArray(series) || !series.length || km == null) return null;
  let best = series[0];
  let bestDist = Math.abs(Number(series[0].km) - km);
  for (let i = 1; i < series.length; i += 1) {
    const dist = Math.abs(Number(series[i].km) - km);
    if (dist < bestDist) {
      best = series[i];
      bestDist = dist;
    }
  }
  return best;
}

export function activitySeriesFromTrack(track) {
  const distance = track?.distance || [];
  const velocity = track?.velocity || [];
  const altitude = track?.altitude || [];
  const heartrate = track?.heartrate || [];
  const n = Math.max(distance.length, velocity.length, altitude.length, heartrate.length);
  if (n < 3) return [];
  const series = [];
  for (let i = 0; i < n; i += 1) {
    const v = Number(velocity[i]);
    series.push({
      km: distance[i] != null ? Number(distance[i]) / 1000 : i,
      paceSec: v > 0.4 ? 1000 / v : null,
      elev: altitude[i] != null ? Number(altitude[i]) : null,
      hr: heartrate[i] != null ? Number(heartrate[i]) : null,
    });
  }
  return series;
}

export function paceSeriesFromSplits(rows) {
  let km = 0;
  let elev = 0;
  return rows.map((row) => {
    km += row.distanceM / 1000;
    if (row.elevM != null) elev += row.elevM;
    return {
      km,
      paceSec: row.paceSec,
      elev: row.elevM == null ? null : elev,
      hr: row.hr,
    };
  });
}
