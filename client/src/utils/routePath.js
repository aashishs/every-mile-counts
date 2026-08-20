const EARTH_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function decodePolyline(encoded) {
  const str = String(encoded || '');
  if (!str) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32 && index < str.length);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32 && index < str.length);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    const latitude = lat / 1e5;
    const longitude = lng / 1e5;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      points.push([latitude, longitude]);
    }
  }
  return points;
}

export function parseGpsPoints(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.points || raw.coordinates || [];
  return list.map((p) => {
    if (Array.isArray(p) && p.length >= 2) {
      const a = Number(p[0]);
      const b = Number(p[1]);
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [a, b];
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return [b, a];
      return null;
    }
    const lat = Number(p.lat ?? p.latitude ?? p[1]);
    const lng = Number(p.lng ?? p.lon ?? p.longitude ?? p[0]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
  }).filter(Boolean);
}

function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathLengthMeters(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) sum += haversine(points[i - 1], points[i]);
  return sum;
}

export function trimRouteEnds(points, meters = 220) {
  if (!Array.isArray(points) || points.length < 16) return points || [];
  const total = pathLengthMeters(points);
  const cut = Math.min(Math.max(meters, 0), total * 0.08);
  if (cut < 20) return points;

  let start = 0;
  let walked = 0;
  while (start < points.length - 8 && walked < cut) {
    walked += haversine(points[start], points[start + 1]);
    start += 1;
  }
  let end = points.length - 1;
  walked = 0;
  while (end > start + 8 && walked < cut) {
    walked += haversine(points[end - 1], points[end]);
    end -= 1;
  }
  return points.slice(start, end + 1);
}

export function downsample(points, max = 180) {
  if (points.length <= max) return points;
  const out = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

export function projectRoute(points) {
  if (!points.length) return [];
  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLng = points[0][1];
  let maxLng = points[0][1];
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const lngScale = Math.cos(toRad(midLat)) || 1;
  const width = (maxLng - minLng) * lngScale || 0.0001;
  const height = (maxLat - minLat) || 0.0001;
  const span = Math.max(width, height);
  return points.map(([lat, lng]) => ({
    x: 0.5 + (((lng - midLng) * lngScale) / span) * 0.82,
    y: 0.5 - ((lat - midLat) / span) * 0.82,
  }));
}

export function buildShareRoute(polyline, gpsPoints) {
  const decoded = decodePolyline(polyline);
  const gps = parseGpsPoints(gpsPoints);
  const source = decoded.length >= 8 ? decoded : gps;
  if (source.length < 8) return null;
  const trimmed = trimRouteEnds(source, 220);
  const points = projectRoute(downsample(trimmed, 180));
  if (points.length < 8) return null;
  return { points, trimmed: trimmed.length < source.length };
}
