import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeAdherence,
  computeAdherenceWindows,
  parseWeeklyTargetDays,
} from './adherence.js';

function noon(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function days(from, count) {
  const start = new Date(from);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { startDate: d };
  });
}

const now = noon(2026, 8, 20);

describe('weekly target days', () => {
  it('defaults to 5 and accepts 3–7', () => {
    assert.equal(parseWeeklyTargetDays(undefined), 5);
    assert.equal(parseWeeklyTargetDays(2), 5);
    assert.equal(parseWeeklyTargetDays(8), 5);
    assert.equal(parseWeeklyTargetDays(3), 3);
    assert.equal(parseWeeklyTargetDays(7), 7);
  });
});

describe('consistency score', () => {
  it('scores unique days against the weekly target, not every calendar day', () => {
    const activities = days(noon(2026, 7, 22), 20);
    const vsTarget = computeAdherence({
      activities,
      weeklyTargetDays: 5,
      periodDays: 30,
      now,
    });
    assert.equal(vsTarget.expectedDays, 21);
    assert.equal(vsTarget.daysWithActivity, 20);
    assert.equal(vsTarget.score, 95);
    assert.equal(vsTarget.label, 'excellent');
  });

  it('caps score at 100 when the athlete exceeds the target', () => {
    const activities = days(noon(2026, 7, 22), 30);
    const model = computeAdherence({
      activities,
      weeklyTargetDays: 5,
      periodDays: 30,
      now,
    });
    assert.equal(model.score, 100);
    assert.ok(model.daysWithActivity > model.expectedDays);
  });

  it('returns zero for an empty log', () => {
    const model = computeAdherence({ activities: [], weeklyTargetDays: 5, periodDays: 30, now });
    assert.equal(model.score, 0);
    assert.equal(model.currentDayStreak, 0);
    assert.equal(model.currentWeekStreak, 0);
  });
});

describe('streaks', () => {
  it('keeps a daily streak alive if today is still open', () => {
    const activities = [
      { startDate: noon(2026, 8, 18) },
      { startDate: noon(2026, 8, 19) },
    ];
    const model = computeAdherence({ activities, weeklyTargetDays: 5, periodDays: 30, now });
    assert.equal(model.currentDayStreak, 2);
  });

  it('does not break a weekly streak in the middle of an unfinished week', () => {
    const activities = [];
    for (let week = 0; week < 3; week += 1) {
      const monday = noon(2026, 7, 27);
      monday.setDate(monday.getDate() + week * 7);
      for (let day = 0; day < 5; day += 1) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + day);
        activities.push({ startDate: d });
      }
    }
    const model = computeAdherence({ activities, weeklyTargetDays: 5, periodDays: 90, now });
    assert.equal(model.currentWeekStreak, 3);
    assert.ok(model.currentWeekDays < 5);
  });
});

describe('period windows', () => {
  it('builds 1 / 3 / 6 / 12 month snapshots from the same log', () => {
    const activities = days(noon(2026, 2, 1), 180);
    const windows = computeAdherenceWindows(activities, 5, now);
    assert.equal(windows.weeklyTargetDays, 5);
    assert.equal(windows.periods['30'].periodDays, 30);
    assert.equal(windows.periods['90'].periodDays, 90);
    assert.equal(windows.periods['180'].periodDays, 180);
    assert.equal(windows.periods['365'].periodDays, 365);
    assert.ok(windows.periods['365'].daysWithActivity >= windows.periods['30'].daysWithActivity);
  });
});
