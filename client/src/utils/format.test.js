import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activityMetric, activitySummaryParts, effortKind, effortStat, formatActivityPrimary, formatEffort, formatPace, formatSpeed, formatSwimPace } from './format.js';

describe('effort display', () => {
  it('uses speed for rides and pace for runs', () => {
    assert.equal(effortKind('Ride', 'GravelRide'), 'speed');
    assert.equal(effortKind('VirtualRide', null), 'speed');
    assert.equal(effortKind('Run', 'TrailRun'), 'pace');
    assert.equal(effortKind('Walk', null), 'pace');
    assert.equal(effortKind('Swim', 'OpenWaterSwim'), 'swim');
    assert.equal(effortKind('Rowing', null), 'row');
    assert.equal(effortKind('Kayaking', null), 'speed');
    assert.equal(effortKind('Workout', null), 'duration');
    assert.equal(effortKind('Yoga', null), 'duration');
    assert.equal(effortKind('WeightTraining', null), 'duration');
    assert.equal(effortKind('HIIT', null), 'duration');
  });

  it('classifies metric from activity type, not GPS distance', () => {
    assert.equal(activityMetric('Run'), 'distance');
    assert.equal(activityMetric('Ride'), 'distance');
    assert.equal(activityMetric('Swim'), 'swim');
    assert.equal(activityMetric('Yoga'), 'duration');
    assert.equal(activityMetric('Workout'), 'duration');
    assert.equal(activityMetric('WeightTraining'), 'duration');
    assert.equal(formatActivityPrimary({ type: 'Yoga', distance: 80, movingTime: 3600, avgSpeed: 0.2 }), '1h 0m');
    assert.equal(formatEffort({ type: 'Yoga', avgSpeed: 0.2, distance: 80 }), null);
    assert.deepEqual(
      activitySummaryParts({ type: 'Yoga', distance: 80, movingTime: 3600, avgSpeed: 0.2, calories: 180, avgHeartrate: 95 }),
      ['1h 0m', '180 kcal', '95 bpm']
    );
    assert.equal(formatEffort({ type: 'Run', avgSpeed: 3.333 }), '5:00 /km');
  });

  it('formats ride speed in km/h and run pace per km', () => {
    assert.equal(formatSpeed(8.333), '30.0 km/h');
    assert.equal(formatPace(3.333), '5:00 /km');
    assert.equal(formatSwimPace(1.25), '1:20 /100m');
    assert.equal(formatEffort({ type: 'Ride', avgSpeed: 8.333 }), '30.0 km/h');
    assert.equal(effortStat({ type: 'Ride', avgSpeed: 8.333 }).label, 'Speed');
    assert.equal(effortStat({ type: 'Run', avgSpeed: 3.333 }).unit, '/km');
    assert.equal(effortStat({ type: 'Swim', avgSpeed: 1.25 }).unit, '/100m');
  });
});
