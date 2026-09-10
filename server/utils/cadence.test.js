import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isStepCadenceSport, stepsPerMinute } from './cadence.js';

describe('running cadence', () => {
  it('treats run/walk/hike as step sports, not rides', () => {
    assert.equal(isStepCadenceSport('Run', 'TrailRun'), true);
    assert.equal(isStepCadenceSport('Walk', null), true);
    assert.equal(isStepCadenceSport('Hike', null), true);
    assert.equal(isStepCadenceSport('Ride', 'GravelRide'), false);
  });

  it('doubles Strava/FIT one-foot cadence to total SPM', () => {
    assert.equal(stepsPerMinute(74, { type: 'Run', source: 'strava' }), 148);
    assert.equal(stepsPerMinute(88, { type: 'Run', source: 'file' }), 176);
  });

  it('does not double Garmin totals or already-normalized values', () => {
    assert.equal(stepsPerMinute(148, { type: 'Run', source: 'garmin' }), 148);
    assert.equal(stepsPerMinute(148, { type: 'Run', source: 'strava' }), 148);
  });

  it('leaves cycling RPM alone', () => {
    assert.equal(stepsPerMinute(88, { type: 'Ride', source: 'strava' }), 88);
  });
});
