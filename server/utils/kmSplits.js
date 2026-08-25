function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatSplitClock(secondsPerKm) {
  const sec = Number(secondsPerKm);
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}:${String(rem).padStart(2, '0')}`;
}

export function splitsLookLikeKm(splits) {
  if (!Array.isArray(splits) || splits.length < 2) return false;
  const kmLike = splits.filter((split) => {
    const d = num(split.distance);
    return d >= 800 && d <= 1300;
  }).length;
  return kmLike >= Math.max(2, splits.length - 2);
}

export function deriveKmSplitsFromTrack(track, { avgSpeed } = {}) {
  const distance = track?.distance || [];
  if (distance.length < 2) return [];
  const velocity = track.velocity || [];
  const heartrate = track.heartrate || [];
  const altitude = track.altitude || [];
  const fallbackV = num(avgSpeed);
  const buckets = [];

  for (let i = 1; i < distance.length; i += 1) {
    const d0 = num(distance[i - 1]);
    const d1 = num(distance[i]);
    if (!(d1 > d0)) continue;
    const v = num(velocity[i]) || num(velocity[i - 1]) || fallbackV;
    const sampleHr = heartrate[i] != null ? num(heartrate[i]) : (heartrate[i - 1] != null ? num(heartrate[i - 1]) : 0);
    const sampleAlt = altitude[i] != null ? num(altitude[i]) : null;
    let cursor = d0;
    while (cursor < d1 - 0.5) {
      const bucket = Math.floor(cursor / 1000);
      const edge = (bucket + 1) * 1000;
      const segEnd = Math.min(d1, edge);
      const seg = segEnd - cursor;
      const dt = v > 0.3 ? seg / v : 0;
      if (!buckets[bucket]) {
        buckets[bucket] = { dist: 0, time: 0, hrSum: 0, hrN: 0, elevStart: sampleAlt, elevEnd: sampleAlt };
      }
      buckets[bucket].dist += seg;
      buckets[bucket].time += dt;
      if (sampleHr > 0) {
        buckets[bucket].hrSum += sampleHr;
        buckets[bucket].hrN += 1;
      }
      if (sampleAlt != null) {
        if (buckets[bucket].elevStart == null) buckets[bucket].elevStart = sampleAlt;
        buckets[bucket].elevEnd = sampleAlt;
      }
      cursor = segEnd;
    }
  }

  return buckets.filter(Boolean).map((bucket) => ({
    distance: Math.round(bucket.dist),
    movingTime: Math.round(bucket.time),
    pace: bucket.dist > 0 && bucket.time > 0 ? bucket.time / (bucket.dist / 1000) : null,
    hr: bucket.hrN ? Math.round(bucket.hrSum / bucket.hrN) : null,
    elevation: bucket.elevStart != null && bucket.elevEnd != null
      ? Math.round(bucket.elevEnd - bucket.elevStart)
      : null,
  }));
}

export function ensureKmSplits(activity) {
  const existing = Array.isArray(activity?.splits) ? activity.splits : [];
  if (splitsLookLikeKm(existing)) return existing;
  const derived = deriveKmSplitsFromTrack(activity?.gpsPoints, { avgSpeed: activity?.avgSpeed });
  return derived.length ? derived : existing;
}

export function kmSplitDisplay(split, kind) {
  if (!split) return '—';
  const pace = num(split.pace) || (
    num(split.distance) > 0 && num(split.movingTime) > 0
      ? num(split.movingTime) / (num(split.distance) / 1000)
      : 0
  );
  if (!(pace > 0)) return '—';
  let clock = formatSplitClock(pace);
  if (kind === 'speed') clock = `${(3600 / pace).toFixed(1)}`;
  else if (kind === 'swim') clock = `${formatSplitClock(pace / 10)}/100m`;
  const hr = split.hr ? ` (${Math.round(Number(split.hr))})` : '';
  return `${clock}${hr}`;
}
