import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  availableTemplates,
  buildPosterModel,
  defaultTemplate,
  formatClockDuration,
  formatPosterDistance,
  formatPosterPace,
  posterFilename,
} from './posterPayload.js';

const run = {
  id: 'act-1',
  name: 'Morning Run',
  type: 'Run',
  sportType: 'Run',
  distance: 10240,
  movingTime: 3522,
  avgSpeed: 1000 / 344,
  avgHeartrate: 148,
  elevationGain: 124,
  startDate: '2026-08-20T01:00:00.000Z',
  email: 'hidden.athlete@example.com',
  phone: '9999999999',
  token: 'secret-token-value',
  coachNotes: 'keep this private',
  polyline: 'abcPolylineSecret',
};

describe('poster payload', () => {
  it('minimal template uses distance, duration, pace and branding', () => {
    const model = buildPosterModel({ activity: run, template: 'minimal' });
    assert.equal(model.template, 'minimal');
    assert.equal(model.brand, 'EVERY MILE COUNTS');
    assert.equal(model.site, 'everymilecounts.in');
    assert.equal(model.primary, '10.24 KM');
    assert.equal(model.secondary, '58:42');
    assert.equal(model.tertiary, '5:44 /KM');
    assert.equal(model.athleteName, null);
    assert.deepEqual(model.metrics.map((m) => m.label), ['Distance', 'Time', 'Pace', 'Elev', 'Avg HR']);
    assert.equal(model.metrics[0].value, '10.24 km');
    assert.equal(model.metrics[2].value, '5:44 /km');
    assert.match(model.subtitle, /RUN/);
  });

  it('performance template includes HR and elevation when present', () => {
    const model = buildPosterModel({ activity: run, template: 'performance' });
    const texts = model.stats.map((s) => s.text).join(' ');
    assert.match(texts, /148 AVG HR/);
    assert.match(texts, /124 M ELEVATION/);
    assert.equal(model.metrics.find((m) => m.label === 'Avg HR')?.value, '148 bpm');
    assert.equal(model.metrics.find((m) => m.label === 'Elev')?.value, '124 m');
  });

  it('omits missing HR and elevation', () => {
    const model = buildPosterModel({
      activity: { ...run, avgHeartrate: null, elevationGain: 0 },
      template: 'performance',
    });
    const texts = model.stats.map((s) => s.text).join(' ');
    assert.equal(texts.includes('HR'), false);
    assert.equal(texts.includes('ELEVATION'), false);
    assert.equal(texts.includes('--'), false);
    assert.equal(model.metrics.some((m) => m.label === 'Avg HR'), false);
    assert.equal(model.metrics.some((m) => m.label === 'Elev'), false);
  });

  it('omits pace when missing or hidden', () => {
    const none = buildPosterModel({ activity: { ...run, avgSpeed: null }, template: 'minimal' });
    assert.equal(none.tertiary, null);
    const hidden = buildPosterModel({ activity: run, template: 'minimal', options: { showPace: false } });
    assert.equal(hidden.tertiary, null);
  });

  it('truncates a long activity name', () => {
    const model = buildPosterModel({
      activity: { ...run, name: 'Very Long Sunrise Tempo Around The Lake With Friends' },
      template: 'minimal',
    });
    assert.ok(model.title.length > 10);
    assert.equal(model.title.includes('@'), false);
  });

  it('optional athlete name is uppercased and never an email', () => {
    const shown = buildPosterModel({
      activity: run,
      athleteName: 'Ashish',
      template: 'minimal',
      options: { showName: true },
    });
    assert.equal(shown.athleteName, 'ASHISH');
    const blocked = buildPosterModel({
      activity: run,
      athleteName: 'hidden.athlete@example.com',
      template: 'minimal',
      options: { showName: true },
    });
    assert.equal(blocked.athleteName, null);
  });

  it('does not leak private fields onto the poster', () => {
    const model = buildPosterModel({
      activity: run,
      athleteName: 'Ashish',
      template: 'performance',
      options: { showName: true },
    });
    const blob = JSON.stringify(model);
    assert.equal(blob.includes('hidden.athlete@example.com'), false);
    assert.equal(blob.includes('9999999999'), false);
    assert.equal(blob.includes('secret-token-value'), false);
    assert.equal(blob.includes('keep this private'), false);
    assert.equal(blob.includes('abcPolylineSecret'), false);
    assert.equal(blob.includes(run.id), false);
  });

  it('stores a privacy-trimmed route without the raw polyline', () => {
    const model = buildPosterModel({
      activity: run,
      template: 'performance',
      route: { points: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 }] },
    });
    assert.equal(model.route, null);
    const withRoute = buildPosterModel({
      activity: run,
      template: 'performance',
      route: {
        points: Array.from({ length: 10 }, (_, i) => ({ x: i / 9, y: 0.4 })),
      },
    });
    assert.equal(withRoute.route.length, 10);
    assert.equal(JSON.stringify(withRoute).includes('abcPolylineSecret'), false);
    const hidden = buildPosterModel({
      activity: run,
      template: 'performance',
      options: { showMap: false },
      route: { points: Array.from({ length: 10 }, (_, i) => ({ x: i / 9, y: 0.4 })) },
    });
    assert.equal(hidden.route, null);
  });

  it('race template uses event name and hides itself without an event', () => {
    const ctx = { event: { name: 'Satara Half Marathon', distance: 21097.5 } };
    assert.ok(availableTemplates(ctx).some((t) => t.id === 'race'));
    const model = buildPosterModel({ activity: run, shareContext: ctx, template: 'race' });
    assert.equal(model.kicker, 'RACE DAY');
    assert.match(model.title, /SATARA/);
    assert.equal(model.primary, '21.10 KM');
    assert.equal(model.metrics.find((m) => m.label === 'Distance')?.value, '21.10 km');
    assert.equal(availableTemplates({}).some((t) => t.id === 'race'), false);
  });

  it('achievement template uses existing PR payload, not a new calculation', () => {
    const ctx = {
      achievements: [{
        key: '10k',
        headline: 'NEW PERSONAL BEST',
        title: '10K',
        movingTime: 3138,
        meters: 10000,
      }],
    };
    const model = buildPosterModel({ activity: run, shareContext: ctx, template: 'achievement' });
    assert.equal(model.kicker, 'NEW PERSONAL BEST');
    assert.equal(model.title, '10K');
    assert.equal(model.secondary, '52:18');
    const none = buildPosterModel({ activity: run, shareContext: {}, template: 'achievement' });
    assert.notEqual(none.template, 'achievement');
  });

  it('training template shows planned vs actual without coach notes', () => {
    const ctx = {
      plannedWorkout: {
        programName: 'Half Marathon',
        weekNumber: 7,
        workoutType: 'Long',
        plannedDistance: 8000,
        actualDistance: 8200,
        plannedDuration: 2400,
        actualDuration: 2460,
        completionStatus: 'completed',
        targetHrZone: 2,
      },
    };
    const model = buildPosterModel({ activity: run, shareContext: ctx, template: 'training' });
    assert.equal(model.kicker, 'TRAINING SESSION');
    assert.match(model.title, /WEEK 7/);
    assert.match(model.planned, /8.00 KM/);
    assert.match(model.actual, /8.20 KM/);
    assert.equal(model.completion, 'COMPLETED ✓');
    assert.equal(model.metrics[0].label, 'Planned');
    assert.match(model.metrics[0].value, /8.00 km/);
    assert.equal(model.metrics[1].label, 'Actual');
    assert.match(model.metrics[1].value, /8.20 km/);
    assert.equal(JSON.stringify(model).includes('coach'), false);
  });

  it('defaults to achievement, then race, then training', () => {
    assert.equal(defaultTemplate({ achievements: [{ headline: 'NEW PERSONAL BEST' }] }), 'achievement');
    assert.equal(defaultTemplate({ event: { name: 'Race' } }), 'race');
    assert.equal(defaultTemplate({ plannedWorkout: { name: 'Easy' } }), 'training');
    assert.equal(defaultTemplate({}), 'performance');
  });

  it('formats duration sports without fake pace', () => {
    const yoga = {
      name: 'Morning Yoga',
      type: 'Yoga',
      movingTime: 3600,
      distance: 0,
      avgSpeed: 0,
    };
    const model = buildPosterModel({ activity: yoga, template: 'minimal' });
    assert.equal(model.primary, '1:00:00');
    assert.equal(model.tertiary, null);
  });

  it('builds a safe filename', () => {
    assert.equal(posterFilename(run), 'emc-morning-run-2026-08-20.png');
    assert.equal(posterFilename({ name: 'a@b.com', startDate: '2026-01-02' }).includes('@'), false);
  });
});

describe('poster formatters', () => {
  it('clock duration and distance', () => {
    assert.equal(formatClockDuration(3522), '58:42');
    assert.equal(formatClockDuration(3661), '1:01:01');
    assert.equal(formatClockDuration(0), null);
    assert.equal(formatPosterDistance(10240), '10.24 KM');
    assert.equal(formatPosterDistance(1500, 'swim'), '1500 M');
    assert.equal(formatPosterPace(0), null);
  });
});
