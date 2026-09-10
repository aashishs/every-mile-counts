import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildActivityMarkdown, buildComparePrompt } from './activityMarkdown.js';

describe('compare AI prompt', () => {
  it('includes compact per-km splits with the session numbers', () => {
    const prompt = buildComparePrompt({
      sport: 'Run',
      sessions: [
        {
          name: 'Sinhgad Hill Run',
          type: 'Run',
          startDate: '2026-08-23T00:29:37.000Z',
          avgHeartrate: 148,
          maxHeartrate: 165,
          formatted: { distance: '21.22 km', time: '1h 52m', pace: '5:18 /km', elevation: '412 m' },
          splits: [
            { distance: 1000, pace: 318, hr: 140 },
            { distance: 1000, pace: 325, hr: 148 },
            { distance: 1000, pace: 340, hr: 152 },
          ],
        },
        {
          name: 'Sinhgad Hill Run',
          type: 'Run',
          startDate: '2025-06-15T00:28:06.000Z',
          avgHeartrate: 151,
          formatted: { distance: '21.30 km', time: '1h 55m', pace: '5:25 /km', elevation: '408 m' },
          splits: [
            { distance: 1000, pace: 330 },
            { distance: 1000, pace: 336 },
          ],
        },
      ],
    });
    assert.match(prompt, /Compare these 2 runs/);
    assert.match(prompt, /Sinhgad Hill Run — .+ \d{1,2}:\d{2}/);
    assert.match(prompt, /per-km splits/);
    assert.match(prompt, /Per-km: 1 5:18 \(140\) · 2 5:25 \(148\) · 3 5:40 \(152\)/);
    assert.match(prompt, /Per-km: 1 5:30 · 2 5:36/);
  });

  it('still prints a per-km line for every compared run', () => {
    const prompt = buildComparePrompt({
      sport: 'Run',
      sessions: [
        {
          name: 'Hill Run',
          type: 'Run',
          startDate: '2026-08-23T00:00:00.000Z',
          formatted: { distance: '10.00 km', time: '50m 0s', pace: '5:00 /km' },
          splits: [{ distance: 1000, pace: 300 }],
        },
        {
          name: 'Park Run',
          type: 'Run',
          startDate: '2026-07-01T00:00:00.000Z',
          formatted: { distance: '10.10 km', time: '51m 0s', pace: '5:03 /km' },
        },
      ],
    });
    assert.equal([...prompt.matchAll(/^Per-km:/gm)].length, 2);
    assert.match(prompt, /Per-km: not available/);
  });
});

describe('activity AI prompt', () => {
  it('puts the session start in local time', () => {
    const iso = '2026-08-23T00:29:37.000Z';
    const md = buildActivityMarkdown({ name: 'Morning run', type: 'Run', startDate: iso });
    const when = new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    assert.ok(md.includes(`**When:** ${when}`));
  });

  it('doubles one-foot running cadence in the prompt', () => {
    const md = buildActivityMarkdown({
      name: 'Hill Run',
      type: 'Run',
      source: 'strava',
      avgCadence: 74,
      distance: 21000,
      movingTime: 6700,
    });
    assert.match(md, /Avg cadence \| 148 spm/);
  });
});
