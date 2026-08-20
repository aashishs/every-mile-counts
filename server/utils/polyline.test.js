import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePolyline, encodePolyline } from './polyline.js';

describe('polyline', () => {
  it('round-trips lat/lng points', () => {
    const points = [[18.52, 73.85], [18.53, 73.86], [18.54, 73.84]];
    const encoded = encodePolyline(points);
    const decoded = decodePolyline(encoded);
    assert.equal(decoded.length, 3);
    assert.ok(Math.abs(decoded[0][0] - 18.52) < 0.0001);
    assert.ok(Math.abs(decoded[1][1] - 73.86) < 0.0001);
  });
});
