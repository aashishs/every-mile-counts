import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildShareRoute,
  decodePolyline,
  projectRoute,
  trimRouteEnds,
} from './routePath.js';

function encodePolyline(points) {
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  const write = (value) => {
    let v = value < 0 ? ~(value << 1) : (value << 1);
    while (v >= 32) {
      out += String.fromCharCode((32 | (v & 31)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const ilat = Math.round(lat * 1e5);
    const ilng = Math.round(lng * 1e5);
    write(ilat - lastLat);
    write(ilng - lastLng);
    lastLat = ilat;
    lastLng = ilng;
  }
  return out;
}

describe('routePath', () => {
  it('decodes a known Google polyline', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.equal(points.length, 3);
    assert.ok(Math.abs(points[0][0] - 38.5) < 0.001);
    assert.ok(Math.abs(points[0][1] + 120.2) < 0.001);
  });

  it('trims start and end so home locations are not on the poster', () => {
    const points = [];
    for (let i = 0; i < 40; i += 1) points.push([18.52 + i * 0.001, 73.85]);
    const trimmed = trimRouteEnds(points, 220);
    assert.ok(trimmed.length < points.length);
    assert.notDeepEqual(trimmed[0], points[0]);
    assert.notDeepEqual(trimmed[trimmed.length - 1], points[points.length - 1]);
  });

  it('projects to 0–1 coordinates without storing raw lat/lng', () => {
    const projected = projectRoute([[18.5, 73.8], [18.52, 73.82], [18.51, 73.81]]);
    assert.ok(projected.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
    assert.equal(JSON.stringify(projected).includes('18.5'), false);
    assert.equal(JSON.stringify(projected).includes('73.8'), false);
  });

  it('builds a share route from a polyline and ignores tiny traces', () => {
    const line = [];
    for (let i = 0; i < 30; i += 1) line.push([19.07 + i * 0.0008, 72.87 + i * 0.0004]);
    const encoded = encodePolyline(line);
    const route = buildShareRoute(encoded, null);
    assert.ok(route.points.length >= 8);
    assert.equal(JSON.stringify(route).includes(encoded), false);
    assert.equal(buildShareRoute('abc', null), null);
  });
});
