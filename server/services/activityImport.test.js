import test from 'node:test';
import assert from 'node:assert/strict';
import { Encoder, Profile, Utils } from '@garmin/fitsdk';
import { mappedFromFile } from './activityImportService.js';

function toSemi(deg) {
  return Math.round((deg * 2 ** 31) / 180);
}

function encodeFit({ sport = 'running', gps = true, points = 30 } = {}) {
  const start = new Date('2026-08-23T06:30:00Z');
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    type: 'activity',
    manufacturer: 'development',
    product: 1,
    timeCreated: start,
    serialNumber: 1,
  });
  for (let i = 0; i < points; i += 1) {
    const rec = {
      timestamp: Utils.convertDateToDateTime(new Date(start.getTime() + i * 1000)),
      heartRate: 140 + (i % 4),
      cadence: 88,
      distance: i * 8,
    };
    if (gps) {
      rec.positionLat = toSemi(18.52 + i * 0.00008);
      rec.positionLong = toSemi(73.85 + i * 0.00008);
      rec.altitude = 560 + i * 0.4;
    }
    encoder.onMesg(Profile.MesgNum.RECORD, rec);
  }
  encoder.onMesg(Profile.MesgNum.SESSION, {
    event: 'session',
    eventType: 'stop',
    startTime: Utils.convertDateToDateTime(start),
    timestamp: Utils.convertDateToDateTime(new Date(start.getTime() + points * 1000)),
    sport,
    totalElapsedTime: points,
    totalTimerTime: points,
    totalDistance: (points - 1) * 8,
    totalAscent: gps ? 12 : 0,
    totalCalories: 18,
    avgHeartRate: 142,
    maxHeartRate: 148,
  });
  return Buffer.from(encoder.close());
}

test('imports a FIT run with GPS, HR, and session totals', () => {
  const buffer = encodeFit();
  const mapped = mappedFromFile({
    filename: 'morning-run.fit',
    content: buffer.toString('base64'),
    encoding: 'base64',
  });
  assert.equal(mapped.type, 'Run');
  assert.equal(mapped.raw.format, 'fit');
  assert.ok(mapped.distance > 100);
  assert.ok(mapped.movingTime >= 20);
  assert.equal(mapped.startDate.toISOString(), '2026-08-23T06:30:00.000Z');
  assert.ok(mapped.avgHeartrate > 130);
  assert.equal(Math.round(mapped.avgCadence), 176);
  assert.ok(mapped.polyline);
  assert.ok(mapped.gpsPoints?.latlng?.length >= 8);
  assert.equal(mapped.calories, 18);
});

test('imports an indoor FIT without GPS from session distance', () => {
  const buffer = encodeFit({ sport: 'cycling', gps: false });
  const mapped = mappedFromFile({
    filename: 'trainer.fit',
    content: buffer,
  });
  assert.equal(mapped.type, 'Ride');
  assert.ok(mapped.distance >= 200);
  assert.ok(mapped.movingTime >= 20);
  assert.equal(mapped.startDate.toISOString(), '2026-08-23T06:30:00.000Z');
});

test('rejects a FIT file that was sent as text', () => {
  assert.throws(
    () => mappedFromFile({ filename: 'run.fit', content: 'not-a-real-fit-file' }),
    (err) => err.status === 400 && /text/i.test(err.message)
  );
});

test('still imports a GPX track', () => {
  const start = new Date('2026-08-23T06:30:00Z');
  const pts = Array.from({ length: 12 }, (_, i) => {
    const t = new Date(start.getTime() + i * 2000).toISOString();
    const lat = (18.52 + i * 0.0002).toFixed(6);
    const lon = (73.85 + i * 0.0002).toFixed(6);
    return `<trkpt lat="${lat}" lon="${lon}"><ele>560</ele><time>${t}</time></trkpt>`;
  }).join('');
  const xml = `<?xml version="1.0"?><gpx><trk><name>Hill repeats</name><trkseg>${pts}</trkseg></trk></gpx>`;
  const mapped = mappedFromFile({ filename: 'run.gpx', content: xml });
  assert.equal(mapped.type, 'Run');
  assert.equal(mapped.name, 'Hill repeats');
  assert.equal(mapped.raw.format, 'gpx');
  assert.ok(mapped.distance > 0);
  assert.ok(mapped.movingTime >= 10);
});
