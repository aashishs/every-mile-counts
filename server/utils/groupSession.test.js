import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rsvpLabel, sportLabel, summarizeRsvps } from './groupSession.js';

describe('group session RSVP', () => {
  it('counts going / maybe / can’t and remembers my reply', () => {
    const summary = summarizeRsvps(
      [
        { userId: 'a', firstName: 'Ash', lastName: 'S', status: 'going' },
        { userId: 'b', firstName: 'Bo', lastName: 'T', status: 'maybe' },
        { userId: 'c', firstName: 'Cy', lastName: 'U', status: 'not_going' },
        { userId: 'd', firstName: 'Di', lastName: 'V', status: 'going' },
      ],
      'a'
    );
    assert.equal(summary.myRsvp, 'going');
    assert.equal(summary.counts.going, 2);
    assert.equal(summary.counts.maybe, 1);
    assert.equal(summary.counts.notGoing, 1);
    assert.equal(sportLabel('ride'), 'Ride');
    assert.equal(rsvpLabel('not_going'), "Can't");
  });
});
