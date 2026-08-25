import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveKmSplitsFromTrack, ensureKmSplits, splitsLookLikeKm } from './kmSplits.js';

test('keeps stored kilometre splits', () => {
  const splits = [
    { distance: 1000, pace: 320, hr: 140 },
    { distance: 1000, pace: 330, hr: 145 },
    { distance: 800, pace: 340, hr: 150 },
  ];
  assert.equal(splitsLookLikeKm(splits), true);
  assert.equal(ensureKmSplits({ splits }).length, 3);
});

test('rebuilds per-km splits from a GPS track when laps are not kilometres', () => {
  const distance = [];
  const velocity = [];
  const heartrate = [];
  for (let i = 0; i <= 20; i += 1) {
    distance.push(i * 250);
    velocity.push(3.33);
    heartrate.push(140 + (i % 4));
  }
  const derived = deriveKmSplitsFromTrack({ distance, velocity, heartrate });
  assert.equal(derived.length, 5);
  assert.ok(derived[0].distance >= 950 && derived[0].distance <= 1050);
  assert.ok(derived[0].pace > 280 && derived[0].pace < 330);
  assert.ok(derived[0].hr >= 140);

  const ensured = ensureKmSplits({
    splits: [{ distance: 5000, pace: 300 }],
    gpsPoints: { distance, velocity, heartrate },
  });
  assert.equal(ensured.length, 5);
});
