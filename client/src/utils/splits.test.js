import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fillMissingElevation, nearestSeriesPoint, normalizeSplits, splitBarWidths, elevationSummary, fastestSplitPace, elapsedPaceSec, fastestSplitSpeed, elapsedSpeedKmh } from './splits.js';

describe('splits', () => {
  it('labels full kilometres and a partial last split with elevation', () => {
    const rows = normalizeSplits([
      { distance: 1000, movingTime: 518, pace: 518, elevation: 2, hr: 135 },
      { distance: 700, movingTime: 547, pace: 781, elevation: -67, hr: 115 },
    ]);
    assert.equal(rows[0].kmLabel, '1');
    assert.equal(rows[1].kmLabel, '0.7');
    assert.equal(rows[0].hr, 135);
    assert.equal(rows[0].elevM, 2);
    assert.equal(rows[1].elevM, -67);
  });

  it('fills missing elevation from the GPS altitude track', () => {
    const rows = normalizeSplits([
      { distance: 1000, pace: 500, hr: 140 },
      { distance: 1000, pace: 520, hr: 145 },
    ]);
    const filled = fillMissingElevation(rows, {
      distance: [0, 1000, 2000],
      altitude: [10, 25, 18],
    });
    assert.equal(filled[0].elevM, 15);
    assert.equal(filled[1].elevM, -7);
  });

  it('finds the nearest chart point for a tap', () => {
    const point = nearestSeriesPoint([
      { km: 1, hr: 140 },
      { km: 2, hr: 150 },
      { km: 3, hr: 162 },
    ], 2.4);
    assert.equal(point.km, 2);
  });

  it('summarises elevation gain and max, and hides a flat profile', () => {
    const summary = elevationSummary([
      { elev: 610 }, { elev: 612 }, { elev: 680 }, { elev: 650 },
    ]);
    assert.equal(summary.max, 680);
    assert.equal(summary.gain, 70);
    assert.equal(elevationSummary([{ elev: 10 }, { elev: 10 }, { elev: 10 }]), null);
  });

  it('uses the fastest full-kilometre split', () => {
    const rows = normalizeSplits([
      { distance: 1000, pace: 400 },
      { distance: 1000, pace: 297 },
      { distance: 400, pace: 250 },
    ]);
    assert.equal(fastestSplitPace(rows), 297);
    assert.equal(elapsedPaceSec({ distance: 10000, elapsedTime: 4460 }), 446);
  });

  it('uses km/h for ride split bars and fastest split', () => {
    const rows = normalizeSplits([
      { distance: 1000, pace: 150 },
      { distance: 1000, pace: 120 },
    ]);
    assert.ok(Math.abs(rows[1].speedKmh - 30) < 0.01);
    const bars = splitBarWidths(rows, 'speed');
    assert.ok(bars[1] > bars[0]);
    assert.ok(Math.abs(fastestSplitSpeed(rows) - 30) < 0.01);
    assert.ok(Math.abs(elapsedSpeedKmh({ distance: 30000, elapsedTime: 3600 }) - 30) < 0.01);
  });
});
