import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cloneDateShift, daysBetweenYmd, programAnchorDate, shiftDate } from './programClone.js';

describe('program clone dates', () => {
  it('shifts every date by the gap from the plan’s first day to the new start', () => {
    const program = { startDate: '2026-01-05' };
    const extras = {
      workouts: [{ scheduled_date: '2026-01-06' }, { scheduledDate: '2026-01-13' }],
      weeks: [{ start_date: '2026-01-05' }],
    };
    assert.equal(programAnchorDate(program, extras), '2026-01-05');
    assert.equal(daysBetweenYmd('2026-01-05', '2026-05-04'), 119);
    const delta = cloneDateShift(program, extras, '2026-05-04');
    assert.equal(shiftDate('2026-01-05', delta), '2026-05-04');
    assert.equal(shiftDate('2026-01-06', delta), '2026-05-05');
    assert.equal(shiftDate('2026-01-13', delta), '2026-05-12');
  });

  it('uses the first workout when the plan has no start date', () => {
    assert.equal(
      programAnchorDate({}, { workouts: [{ scheduledDate: '2026-03-10' }, { scheduledDate: '2026-03-08' }] }),
      '2026-03-08'
    );
  });
});
