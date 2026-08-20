import crypto from 'crypto';
import { upsertActivity } from './stravaService.js';
import { encodePolyline } from '../utils/polyline.js';
import { trackFromGpsPoints } from '../utils/track.js';

const ALLOWED_TYPES = [
  'Run', 'Ride', 'Swim', 'Walk', 'Hike', 'Workout', 'WeightTraining', 'Yoga', 'HIIT',
];

const MAX_FILE_CHARS = 6 * 1024 * 1024;
const PAUSE_GAP_SEC = 60;

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tagText(xml, tag) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, 'i');
  const m = String(xml).match(re);
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : null;
}

function attr(block, name) {
  const m = String(block).match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? m[1] : null;
}

function inferType(value) {
  const t = String(value || '').toLowerCase();
  if (!t) return null;
  if (t.includes('run') || t.includes('trail') || t === 'running') return 'Run';
  if (t.includes('ride') || t.includes('cycl') || t.includes('bike') || t === 'biking') return 'Ride';
  if (t.includes('swim')) return 'Swim';
  if (t.includes('walk')) return 'Walk';
  if (t.includes('hike')) return 'Hike';
  if (t.includes('yoga')) return 'Yoga';
  if (t.includes('hiit') || t.includes('highintensity')) return 'HIIT';
  if (t.includes('weight') || t.includes('strength')) return 'WeightTraining';
  if (t.includes('workout') || t.includes('other')) return 'Workout';
  return null;
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, x)));
}

function pointHr(block) {
  const bpm = String(block).match(/<(?:[\w.-]+:)?HeartRateBpm\b[\s\S]*?<(?:[\w.-]+:)?Value\b[^>]*>([^<]+)</i);
  if (bpm) return num(bpm[1]);
  const hr = String(block).match(/<(?:[\w.-]+:)?hr(?:bpm)?\b[^>]*>([^<]+)</i);
  return hr ? num(hr[1]) : null;
}

function pointCadence(block) {
  const run = String(block).match(/<(?:[\w.-]+:)?(?:cad|cadence|runcadence)\b[^>]*>([^<]+)</i);
  return run ? num(run[1]) : null;
}

function parseGpxPoints(xml) {
  const points = [];
  const re = /<(?:[\w.-]+:)?(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?(?:trkpt|rtept)>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const lat = num(attr(match[1], 'lat'));
    const lon = num(attr(match[1], 'lon'));
    if (lat == null || lon == null) continue;
    const timeText = tagText(match[2], 'time');
    points.push({
      lat,
      lon,
      ele: num(tagText(match[2], 'ele')),
      time: timeText ? new Date(timeText) : null,
      hr: pointHr(match[2]),
      cadence: pointCadence(match[2]),
      distance: null,
    });
  }
  return points;
}

function parseTcxPoints(xml) {
  const points = [];
  const re = /<(?:[\w.-]+:)?Trackpoint\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Trackpoint>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const block = match[1];
    const lat = num(tagText(block, 'LatitudeDegrees'));
    const lon = num(tagText(block, 'LongitudeDegrees'));
    const timeText = tagText(block, 'Time');
    if (lat == null && lon == null && !timeText) continue;
    points.push({
      lat,
      lon,
      ele: num(tagText(block, 'AltitudeMeters')),
      time: timeText ? new Date(timeText) : null,
      hr: pointHr(block),
      cadence: pointCadence(block),
      distance: num(tagText(block, 'DistanceMeters')),
    });
  }
  return points;
}

function summarizePoints(points) {
  let distance = 0;
  let elevationGain = 0;
  let movingTime = 0;
  let maxSpeed = 0;
  const hrs = [];
  const cads = [];

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p.hr) hrs.push(p.hr);
    if (p.cadence) cads.push(p.cadence);
    if (i === 0) continue;
    const prev = points[i - 1];
    const step =
      p.distance != null && prev.distance != null && p.distance >= prev.distance
        ? p.distance - prev.distance
        : p.lat != null && prev.lat != null
          ? haversine(prev, p)
          : 0;
    if (step > 0 && step < 5000) distance += step;

    if (p.ele != null && prev.ele != null) {
      const rise = p.ele - prev.ele;
      if (rise > 0.5 && rise < 50) elevationGain += rise;
    }

    if (p.time && prev.time && !Number.isNaN(p.time) && !Number.isNaN(prev.time)) {
      const dt = (p.time - prev.time) / 1000;
      if (dt > 0 && dt <= PAUSE_GAP_SEC) {
        movingTime += dt;
        if (step > 0) maxSpeed = Math.max(maxSpeed, step / dt);
      }
    }
  }

  const lastWithDist = [...points].reverse().find((p) => p.distance != null);
  if (lastWithDist?.distance > distance) distance = lastWithDist.distance;

  const timed = points.filter((p) => p.time && !Number.isNaN(p.time.getTime()));
  const start = timed[0]?.time || null;
  const end = timed[timed.length - 1]?.time || null;
  const elapsed = start && end ? Math.max(0, (end - start) / 1000) : 0;

  return {
    distance,
    elevationGain,
    movingTime: movingTime || elapsed,
    elapsedTime: elapsed || movingTime,
    startDate: start,
    maxSpeed,
    avgHeartrate: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
    maxHeartrate: hrs.length ? Math.max(...hrs) : null,
    avgCadence: cads.length ? cads.reduce((a, b) => a + b, 0) / cads.length : null,
  };
}

function kmSplits(points, totalDistance) {
  if (!points.length || totalDistance < 400) return [];
  const splits = [];
  let mark = 1000;
  let last = points[0];
  let travelled = 0;

  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[i - 1];
    const step =
      p.distance != null && prev.distance != null && p.distance >= prev.distance
        ? p.distance - prev.distance
        : p.lat != null && prev.lat != null
          ? haversine(prev, p)
          : 0;
    travelled += step > 0 && step < 5000 ? step : 0;
    while (travelled >= mark && last?.time && p.time) {
      const sec = (p.time - last.time) / 1000;
      const elev = last.ele != null && p.ele != null ? p.ele - last.ele : null;
      splits.push({
        distance: 1000,
        movingTime: Math.max(1, Math.round(sec)),
        pace: sec > 0 ? sec : null,
        elevation: elev != null ? Math.round(elev) : null,
        hr: p.hr,
      });
      last = p;
      mark += 1000;
    }
  }
  return splits.slice(0, 80);
}

function parseHms(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const parts = String(value).trim().split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  if (parts.length === 1) return Math.round(parts[0]);
  return null;
}

function defaultName(type, startDate) {
  if (!startDate) return type || 'Activity';
  const h = new Date(startDate).getHours();
  const when = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return `${when} ${type || 'activity'}`;
}

function normalizeType(type) {
  if (ALLOWED_TYPES.includes(type)) return type;
  return inferType(type) || 'Workout';
}

export function mappedFromManual(body) {
  const type = normalizeType(body.type);
  const startDate = body.startDate ? new Date(body.startDate) : fail(400, 'Start date is required');
  if (Number.isNaN(startDate.getTime())) fail(400, 'Start date is invalid');

  const movingTime = parseHms(body.movingTime ?? body.duration) || Number(body.movingTimeSeconds) || 0;
  if (movingTime < 10) fail(400, 'Duration must be at least 10 seconds');
  if (movingTime > 48 * 3600) fail(400, 'Duration is too long');

  const distanceKm = num(body.distanceKm);
  const distance = num(body.distance) ?? (distanceKm != null ? distanceKm * 1000 : 0);
  if (distance < 0 || distance > 1_000_000) fail(400, 'Distance looks invalid');

  const elevationGain = num(body.elevationGain) || 0;
  const avgSpeed = distance > 0 && movingTime > 0 ? distance / movingTime : null;
  const name = String(body.name || '').trim() || defaultName(type, startDate);

  return {
    sourceActivityId: `manual-${crypto.randomUUID()}`,
    name,
    type,
    sportType: type,
    distance,
    movingTime: Math.round(movingTime),
    elapsedTime: Math.round(num(body.elapsedTime) || movingTime),
    elevationGain,
    startDate,
    startDateLocal: startDate,
    avgSpeed,
    maxSpeed: null,
    avgHeartrate: num(body.avgHeartrate),
    maxHeartrate: num(body.maxHeartrate),
    avgCadence: num(body.avgCadence),
    avgPower: num(body.avgPower),
    calories: num(body.calories),
    description: String(body.description || '').trim() || null,
    polyline: null,
    gpsPoints: null,
    splits: [],
    weather: null,
    trainingLoad: null,
    raw: { source: 'manual' },
  };
}

export function mappedFromFile({ filename, content, name, type, movingTimeSeconds, description }) {
  const fileName = String(filename || 'activity.gpx');
  const xml = String(content || '');
  if (!xml.trim()) fail(400, 'The file is empty');
  if (xml.length > MAX_FILE_CHARS) fail(400, 'File is too large. Export a smaller GPX or TCX.');

  const ext = fileName.toLowerCase();
  if (ext.endsWith('.fit') || xml.startsWith('FIT') || xml.includes('\0')) {
    fail(400, 'FIT files are not supported yet. Export GPX or TCX from Strava or Garmin.');
  }

  const looksXml = xml.includes('<');
  if (!looksXml) fail(400, 'Could not read that file. Use a .gpx or .tcx export.');

  const isTcx = ext.endsWith('.tcx') || /<TrainingCenterDatabase/i.test(xml);
  const isGpx = ext.endsWith('.gpx') || /<gpx\b/i.test(xml);
  if (!isTcx && !isGpx) fail(400, 'Use a .gpx or .tcx file.');

  const points = isTcx ? parseTcxPoints(xml) : parseGpxPoints(xml);
  if (points.length < 2 && !tagText(xml, 'TotalTimeSeconds')) {
    fail(400, 'No GPS track found in that file.');
  }

  const stats = summarizePoints(points);
  const tcxTime = num(tagText(xml, 'TotalTimeSeconds'));
  const tcxDist = num(tagText(xml, 'DistanceMeters'));
  const tcxCal = num(tagText(xml, 'Calories'));
  const elevationFromTcx = num(tagText(xml, 'ElevationGain') || tagText(xml, 'TotalElevationGain'));

  let movingTime = parseHms(movingTimeSeconds) || stats.movingTime || tcxTime || 0;
  if (movingTime < 10) fail(400, 'This file has no timestamps. Add the activity manually and enter duration.');

  const distance = stats.distance || tcxDist || 0;
  const startDate =
    stats.startDate ||
    (tagText(xml, 'Id') ? new Date(tagText(xml, 'Id')) : null) ||
    (tagText(xml, 'time') ? new Date(tagText(xml, 'time')) : null);
  if (!startDate || Number.isNaN(startDate.getTime())) fail(400, 'This file has no start time.');

  const fileType =
    inferType(type) ||
    inferType(attr(xml.match(/<(?:[\w.-]+:)?Activity\b[^>]*>/i)?.[0] || '', 'Sport')) ||
    inferType(tagText(xml, 'type') || tagText(xml, 'Type')) ||
    'Run';
  const sport = normalizeType(fileType);
  const title =
    String(name || '').trim() ||
    tagText(xml, 'name') ||
    tagText(xml, 'Name') ||
    defaultName(sport, startDate);

  const avgSpeed = distance > 0 && movingTime > 0 ? distance / movingTime : null;
  const hash = crypto.createHash('sha256').update(xml).digest('hex').slice(0, 24);
  const gpsPoints = trackFromGpsPoints(points);
  const polyline = gpsPoints?.latlng?.length
    ? encodePolyline(gpsPoints.latlng)
    : encodePolyline(points.filter((p) => p.lat != null).map((p) => [p.lat, p.lon]));

  return {
    sourceActivityId: null,
    fileHash: hash,
    name: title,
    type: sport,
    sportType: sport,
    distance,
    movingTime: Math.round(movingTime),
    elapsedTime: Math.round(stats.elapsedTime || tcxTime || movingTime),
    elevationGain: Math.round(stats.elevationGain || elevationFromTcx || 0),
    startDate,
    startDateLocal: startDate,
    avgSpeed,
    maxSpeed: stats.maxSpeed || null,
    avgHeartrate: stats.avgHeartrate,
    maxHeartrate: stats.maxHeartrate,
    avgCadence: stats.avgCadence,
    avgPower: null,
    calories: tcxCal,
    description: String(description || '').trim() || null,
    polyline,
    gpsPoints,
    splits: kmSplits(points, distance),
    weather: null,
    trainingLoad: null,
    raw: { source: 'file', format: isTcx ? 'tcx' : 'gpx', filename: fileName, points: points.length },
  };
}

export async function saveManualActivity(athleteId, mapped) {
  const payload = { ...mapped };
  if (!payload.sourceActivityId) {
    payload.sourceActivityId = `file-${athleteId}:${mapped.fileHash || crypto.randomUUID()}`;
  }
  delete payload.fileHash;
  const id = await upsertActivity(athleteId, 'manual', payload);
  return id;
}
