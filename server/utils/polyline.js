export function decodePolyline(encoded, precision = 5) {
  const str = String(encoded || '');
  if (!str) return [];
  const factor = 10 ** precision;
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
    } while (b >= 32 && index <= str.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32 && index <= str.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    const latitude = lat / factor;
    const longitude = lng / factor;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      points.push([latitude, longitude]);
    }
  }
  return points;
}

function encodeSigned(value) {
  let n = value < 0 ? ~(value << 1) : (value << 1);
  let out = '';
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  out += String.fromCharCode(n + 63);
  return out;
}

export function encodePolyline(points, precision = 5) {
  const factor = 10 ** precision;
  let prevLat = 0;
  let prevLng = 0;
  let result = '';
  for (const point of points || []) {
    const lat = Number(point?.[0]);
    const lng = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const iLat = Math.round(lat * factor);
    const iLng = Math.round(lng * factor);
    result += encodeSigned(iLat - prevLat) + encodeSigned(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return result || null;
}
