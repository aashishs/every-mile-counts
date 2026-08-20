const MAX_POINTS = 240;

function round(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function stride(length, max) {
  return Math.max(1, Math.ceil(length / Math.max(2, max)));
}

export function streamsByType(data) {
  if (!data) return {};
  if (!Array.isArray(data)) return data;
  const out = {};
  for (const stream of data) {
    if (stream?.type) out[stream.type] = stream;
  }
  return out;
}

export function downsampleStreams(raw, maxPoints = MAX_POINTS) {
  const streams = streamsByType(raw);
  const latlng = streams.latlng?.data || [];
  const distance = streams.distance?.data || [];
  const altitude = streams.altitude?.data || [];
  const heartrate = streams.heartrate?.data || [];
  const velocity = streams.velocity_smooth?.data || streams.velocity?.data || [];
  const n = Math.max(latlng.length, distance.length, altitude.length);
  if (n < 8) return null;
  const step = stride(n, maxPoints);
  const track = { latlng: [], distance: [], altitude: [], heartrate: [], velocity: [] };
  const push = (i) => {
    if (latlng[i]) {
      const lat = round(latlng[i][0], 5);
      const lng = round(latlng[i][1], 5);
      if (lat != null && lng != null) track.latlng.push([lat, lng]);
    }
    if (distance[i] != null) track.distance.push(Math.round(Number(distance[i])));
    if (altitude[i] != null) track.altitude.push(round(altitude[i], 1));
    if (heartrate[i] != null) track.heartrate.push(Math.round(Number(heartrate[i])));
    if (velocity[i] != null) track.velocity.push(round(velocity[i], 2));
  };
  for (let i = 0; i < n; i += step) push(i);
  if ((n - 1) % step !== 0) push(n - 1);
  if (track.latlng.length < 8 && track.distance.length < 8) return null;
  return track;
}

export function trackFromGpsPoints(points, maxPoints = MAX_POINTS) {
  const usable = (points || []).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon ?? p.lng)));
  if (usable.length < 8) return null;
  const step = stride(usable.length, maxPoints);
  const track = { latlng: [], distance: [], altitude: [], heartrate: [], velocity: [] };
  let travelled = 0;
  let prev = null;
  const push = (p, dist) => {
    track.latlng.push([round(p.lat, 5), round(p.lon ?? p.lng, 5)]);
    track.distance.push(Math.round(dist));
    if (p.ele != null) track.altitude.push(round(p.ele, 1));
    if (p.hr != null) track.heartrate.push(Math.round(Number(p.hr)));
  };
  for (let i = 0; i < usable.length; i += 1) {
    const p = usable[i];
    if (p.distance != null) travelled = Number(p.distance);
    else if (prev) {
      const dLat = (p.lat - prev.lat) * (Math.PI / 180);
      const dLon = ((p.lon ?? p.lng) - (prev.lon ?? prev.lng)) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(prev.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      travelled += 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
    }
    if (i % step === 0 || i === usable.length - 1) push(p, travelled);
    prev = p;
  }
  return track.latlng.length >= 8 ? track : null;
}
