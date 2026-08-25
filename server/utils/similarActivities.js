import { decodePolyline } from './polyline.js';
import { sportFamilyOf } from './activityTypes.js';
import { formatDistance } from './format.js';

export const SIMILAR_SPORTS = ['Run', 'Ride', 'Swim'];
export const SIMILAR_DEFAULT_LIMIT = 8;

const SPORT_LABEL = {
  Run: 'runs',
  Ride: 'rides',
  Swim: 'swims',
};

const WEAK_TITLE_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'after', 'from', 'into',
  'morning', 'evening', 'afternoon', 'night', 'lunch',
  'easy', 'recovery', 'steady', 'tempo', 'long', 'short',
  'run', 'ride', 'swim', 'trail', 'workout', 'session',
  'hill', 'hills', 'park', 'road', 'loop', 'marathon', 'ultra',
]);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function similarSport(activity) {
  return sportFamilyOf(activity) || activity?.type || 'Other';
}

export function similarSupported(sport) {
  return SIMILAR_SPORTS.includes(sport);
}

export function similarHeading(sport) {
  return similarSupported(sport) ? `Similar ${SPORT_LABEL[sport]}` : null;
}

function relDiff(a, b) {
  const max = Math.max(a, b);
  if (!(max > 0)) return 1;
  return Math.abs(a - b) / max;
}

function meters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function samplePoints(points, count = 6) {
  if (!points.length) return [];
  if (points.length <= count) return points;
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.round((i * (points.length - 1)) / (count - 1));
    return points[idx];
  });
}

export function routeSignature(polyline) {
  const points = decodePolyline(polyline);
  if (points.length < 2) return null;
  return {
    start: points[0],
    end: points[points.length - 1],
    samples: samplePoints(points),
  };
}

function sampleCloseness(aSamples, bSamples) {
  if (!aSamples.length || !bSamples.length) return Infinity;
  const distances = aSamples.map((point) => Math.min(...bSamples.map((other) => meters(point, other))));
  return distances.reduce((sum, d) => sum + d, 0) / distances.length;
}

export function routesMatch(sigA, sigB) {
  if (!sigA || !sigB) return false;
  const startEnd = meters(sigA.start, sigB.start) <= 350 && meters(sigA.end, sigB.end) <= 450;
  const reversed = meters(sigA.start, sigB.end) <= 350 && meters(sigA.end, sigB.start) <= 450;
  if (startEnd || reversed) return true;
  return sampleCloseness(sigA.samples, sigB.samples) <= 400
    && sampleCloseness(sigB.samples, sigA.samples) <= 400;
}

function titleTokens(name) {
  return String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !WEAK_TITLE_TOKENS.has(token));
}

export function titlesAlign(seedName, otherName) {
  const left = titleTokens(seedName);
  const right = new Set(titleTokens(otherName));
  if (!left.length || !right.size) return false;
  const hits = left.filter((token) => right.has(token));
  if (hits.length >= 2) return true;
  return hits.some((token) => token.length >= 6);
}

export function distancesAlign(seed, other) {
  const a = num(seed.distance);
  const b = num(other.distance);
  if (!(a > 0) || !(b > 0)) return false;
  return relDiff(a, b) <= 0.12;
}

export function isHighElevation(activity, sport) {
  const elev = num(activity.elevationGain);
  if (!(elev > 0) || sport === 'Swim') return false;
  const km = num(activity.distance) / 1000;
  if (sport === 'Ride') return elev >= 400 || (km > 0 && elev / km >= 12);
  return elev >= 200 || (km > 0 && elev / km >= 20);
}

export function elevationsAlign(seed, other, sport) {
  if (!isHighElevation(seed, sport) || !isHighElevation(other, sport)) return false;
  return relDiff(num(seed.elevationGain), num(other.elevationGain)) <= 0.25;
}

function sizeLabel(sport, metersValue) {
  if (sport === 'Swim') return `${Math.round(metersValue)} m`;
  return formatDistance(metersValue);
}

function whyParts({ route, title, climb }) {
  const parts = [];
  if (route) parts.push('Same route');
  if (title) parts.push('Same title');
  if (climb) parts.push('Similar climb');
  return parts.join(' · ');
}

export function rankSimilarActivities(seed, candidates, { limit = SIMILAR_DEFAULT_LIMIT } = {}) {
  const sport = similarSport(seed);
  if (!similarSupported(sport)) return [];

  const seedSig = routeSignature(seed.polyline);
  const scored = [];

  for (const candidate of candidates || []) {
    if (!candidate || candidate.id === seed.id) continue;
    if (similarSport(candidate) !== sport) continue;

    const route = routesMatch(seedSig, routeSignature(candidate.polyline));
    const title = titlesAlign(seed.name, candidate.name) && distancesAlign(seed, candidate);
    const climb = elevationsAlign(seed, candidate, sport);
    if (!route && !title && !climb) continue;

    const score = (route ? 100 : 0) + (title ? 40 : 0) + (climb ? 30 : 0);
    scored.push({
      activity: candidate,
      score,
      why: whyParts({ route, title, climb }),
      size: sizeLabel(sport, num(candidate.distance)),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.activity.startDate || 0) - new Date(a.activity.startDate || 0);
  });

  return scored.slice(0, Math.max(1, Number(limit) || SIMILAR_DEFAULT_LIMIT));
}
