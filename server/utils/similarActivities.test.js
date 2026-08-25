import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePolyline } from './polyline.js';
import {
  rankSimilarActivities,
  similarHeading,
  similarSupported,
} from './similarActivities.js';

const puneLoop = encodePolyline([
  [18.5204, 73.8567],
  [18.5280, 73.8600],
  [18.5340, 73.8520],
  [18.5260, 73.8480],
  [18.5204, 73.8567],
]);
const nearbyLoop = encodePolyline([
  [18.5206, 73.8569],
  [18.5282, 73.8602],
  [18.5341, 73.8522],
  [18.5261, 73.8482],
  [18.5206, 73.8569],
]);
const otherTown = encodePolyline([
  [19.0760, 72.8777],
  [19.0800, 72.8800],
  [19.0840, 72.8740],
  [19.0760, 72.8777],
]);

const seed = {
  id: 'seed',
  name: 'Sinhgad Hill Run',
  type: 'Run',
  sportType: 'Run',
  distance: 21200,
  movingTime: 7200,
  elevationGain: 420,
  polyline: puneLoop,
  startDate: '2026-08-23T00:00:00.000Z',
};

test('only run, ride, and swim are supported', () => {
  assert.equal(similarSupported('Run'), true);
  assert.equal(similarSupported('Walk'), false);
  assert.equal(similarHeading('Yoga'), null);
  assert.equal(
    rankSimilarActivities({ ...seed, type: 'Yoga', sportType: 'Yoga' }, [
      { id: 'y', name: 'Yoga', type: 'Yoga', distance: 80, movingTime: 3300 },
    ]).length,
    0
  );
});

test('does not treat similar distance alone as a match', () => {
  const ranked = rankSimilarActivities(seed, [
    { id: 'flat', name: 'Morning Run', type: 'Run', distance: 21100, movingTime: 7000, elevationGain: 40 },
  ]);
  assert.equal(ranked.length, 0);
});

test('matches the same route even when the title differs', () => {
  const ranked = rankSimilarActivities(seed, [
    { id: 'route', name: 'Sunday Long Run', type: 'Run', distance: 20800, polyline: nearbyLoop, startDate: '2026-06-01T00:00:00.000Z' },
    { id: 'elsewhere', name: 'Coastal Run', type: 'Run', distance: 21200, polyline: otherTown, elevationGain: 40, startDate: '2026-05-01T00:00:00.000Z' },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].activity.id, 'route');
  assert.match(ranked[0].why, /route/i);
});

test('matches title only when distance also matches', () => {
  const ranked = rankSimilarActivities({ ...seed, polyline: null }, [
    { id: 'title', name: 'Sinhgad Hill Run', type: 'Run', distance: 21400, elevationGain: 40 },
    { id: 'far', name: 'Sinhgad Hill Run', type: 'Run', distance: 42000, elevationGain: 40 },
  ]);
  assert.equal(ranked.map((r) => r.activity.id).join(','), 'title');
});

test('matches high-elevation sessions by climb', () => {
  const ranked = rankSimilarActivities({ ...seed, polyline: null, name: 'Hill workout' }, [
    { id: 'climb', name: 'Temple climb', type: 'Run', distance: 18000, elevationGain: 390 },
    { id: 'flat', name: 'Temple climb', type: 'Run', distance: 18000, elevationGain: 30 },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].activity.id, 'climb');
  assert.match(ranked[0].why, /climb/i);
});

test('does not mix sports', () => {
  const ranked = rankSimilarActivities(seed, [
    { id: 'ride', name: 'Sinhgad Hill Run', type: 'Ride', distance: 21200, polyline: nearbyLoop, elevationGain: 420 },
  ]);
  assert.equal(ranked.length, 0);
});
