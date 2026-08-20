import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QUOTES, quoteForDay } from './dailyQuotes.js';

describe('daily quotes', () => {
  it('returns a stable quote for the same athlete and day', () => {
    const a = quoteForDay('user-1', '2026-08-20');
    const b = quoteForDay('user-1', '2026-08-20');
    assert.equal(a, b);
    assert.ok(QUOTES.includes(a));
  });

  it('can change across days and athletes', () => {
    const today = quoteForDay('user-1', '2026-08-20');
    const next = quoteForDay('user-1', '2026-08-21');
    const other = quoteForDay('user-2', '2026-08-20');
    assert.equal(typeof next, 'string');
    assert.equal(typeof other, 'string');
    assert.ok(today.length > 8);
    assert.ok(today !== next || today !== other);
  });
});
