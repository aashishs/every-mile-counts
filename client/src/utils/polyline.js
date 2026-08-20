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

export function routePositions(activity) {
  const track = activity?.gpsPoints?.latlng;
  if (Array.isArray(track) && track.length >= 8) return track;
  return decodePolyline(activity?.polyline);
}
