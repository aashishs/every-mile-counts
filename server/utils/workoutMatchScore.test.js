import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAutoMatch, completionFromComparison, scoreWorkoutMatch } from './workoutMatchScore.js';

const easyRun = {
  workoutType: 'Easy',
  sport: 'Run',
  scheduledDate: '2026-08-20',
  distance: 8000,
  duration: 3600,
  targetHrZone: 2,
};

const matchingActivity = {
  type: 'Run',
  sportType: 'Run',
  startDateLocal: '2026-08-20T07:00:00',
  distance: 8200,
  movingTime: 3480,
  avgSpeed: 8000 / 3480,
  avgHeartrate: 145,
};

test('same-day same-sport similar distance is high confidence', () => {
  const result = scoreWorkoutMatch(easyRun, matchingActivity, { athleteMaxHr: 190 });
  assert.equal(result.confidence, 'high');
  assert.ok(result.score >= 70);
});

test('sport mismatch is not auto-matched', () => {
  const result = scoreWorkoutMatch(easyRun, { ...matchingActivity, type: 'Ride', sportType: 'Ride' }, { athleteMaxHr: 190 });
  assert.notEqual(result.confidence, 'high');
});

test('rest days never auto-match', () => {
  const result = scoreWorkoutMatch({ ...easyRun, workoutType: 'Rest' }, matchingActivity);
  assert.equal(result.score, 0);
  assert.equal(result.confidence, 'low');
});

test('far-apart dates do not match', () => {
  const result = scoreWorkoutMatch(easyRun, { ...matchingActivity, startDateLocal: '2026-08-01T07:00:00' });
  assert.equal(result.confidence, 'low');
});

test('close competing scores stay as suggestions', () => {
  const decision = chooseAutoMatch([
    { score: 78, confidence: 'high' },
    { score: 74, confidence: 'high' },
  ]);
  assert.equal(decision.action, 'suggest');
});

test('unique high score auto-matches', () => {
  const decision = chooseAutoMatch([{ score: 82, confidence: 'high' }, { score: 40, confidence: 'low' }]);
  assert.equal(decision.action, 'auto');
});

test('short activity is partial, not completed', () => {
  const status = completionFromComparison(easyRun, { distance: 3000, movingTime: 1200 });
  assert.equal(status, 'partial');
});
