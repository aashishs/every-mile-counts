import test from 'node:test';
import assert from 'node:assert/strict';
import { countWeeklyStreak, weekWindowsFrom } from './week.js';

test('week windows end with the current week', () => {
  const weeks = weekWindowsFrom('2026-08-24', 4);
  assert.equal(weeks.length, 4);
  assert.equal(weeks[0].start, '2026-08-03');
  assert.equal(weeks[3].start, '2026-08-24');
  assert.equal(weeks[3].isCurrent, true);
  assert.equal(weeks[3].endInclusive, '2026-08-30');
});

test('streak skips an in-progress current week', () => {
  const weeks = [
    { hit: true, isCurrent: false },
    { hit: true, isCurrent: false },
    { hit: false, isCurrent: true },
  ];
  assert.equal(countWeeklyStreak(weeks), 2);
});

test('streak includes current week when already hit', () => {
  const weeks = [
    { hit: true, isCurrent: false },
    { hit: true, isCurrent: true },
  ];
  assert.equal(countWeeklyStreak(weeks), 2);
});

test('missed last week resets the streak', () => {
  const weeks = [
    { hit: true, isCurrent: false },
    { hit: false, isCurrent: false },
    { hit: false, isCurrent: true },
  ];
  assert.equal(countWeeklyStreak(weeks), 0);
});
