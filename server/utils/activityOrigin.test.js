import test from 'node:test';
import assert from 'node:assert/strict';
import { activityOrigin } from './activityOrigin.js';

test('labels Strava and Garmin from source', () => {
  assert.equal(activityOrigin({ source: 'strava' }).label, 'Strava');
  assert.equal(activityOrigin({ source: 'garmin' }).label, 'Garmin');
});

test('labels typed-in sessions as Manual', () => {
  assert.equal(activityOrigin({ source: 'manual', sourceActivityId: 'manual-abc' }).label, 'Manual');
  assert.equal(activityOrigin({ source: 'manual', raw: { source: 'manual' } }).label, 'Manual');
});

test('labels FIT, GPX, and TCX file imports', () => {
  assert.equal(activityOrigin({
    source: 'manual',
    sourceActivityId: 'file-1:abc',
    raw: { source: 'file', format: 'fit', filename: 'run.fit' },
  }).label, 'FIT file');
  assert.equal(activityOrigin({
    source: 'manual',
    sourceActivityId: 'file-1:abc',
    raw: { source: 'file', format: 'gpx' },
  }).label, 'GPX file');
  assert.equal(activityOrigin({
    source: 'manual',
    importFormat: 'tcx',
    sourceActivityId: 'file-1:abc',
  }).label, 'TCX file');
});
