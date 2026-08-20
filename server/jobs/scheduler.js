import cron from 'node-cron';
import { refreshMembershipStatuses } from '../services/membershipJob.js';
import { appTimeZone, refreshAthleteAges } from '../services/ageJob.js';
import { ensureStravaWebhookSubscription, syncAllConnectedStrava } from '../services/stravaService.js';
import { markMissedWorkouts } from '../services/workoutMatchService.js';

export function startScheduler() {
  const tz = appTimeZone();
  ensureStravaWebhookSubscription()
    .then((result) => console.log('[strava] webhook', result))
    .catch((err) => console.error('[strava] webhook subscribe failed', err.response?.data || err.message));

  refreshAthleteAges({ birthdaysOnly: false })
    .then((result) => console.log('[job] age/maf backfill', result))
    .catch((err) => console.error('[job] age/maf backfill failed', err.message));

  cron.schedule('0 */3 * * *', async () => {
    try {
      const result = await syncAllConnectedStrava();
      console.log('[job] strava incremental sync', result);
    } catch (err) {
      console.error('[job] strava incremental sync failed', err.message);
    }
  });

  cron.schedule('15 1 * * *', async () => {
    try {
      const result = await markMissedWorkouts();
      console.log('[job] missed workouts', result);
    } catch (err) {
      console.error('[job] missed workouts failed', err.message);
    }
  });

  cron.schedule('0 6 * * *', async () => {
    try {
      const result = await refreshMembershipStatuses();
      console.log('[job] membership refresh', result);
    } catch (err) {
      console.error('[job] membership refresh failed', err.message);
    }
  });

  cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        const result = await refreshAthleteAges({ birthdaysOnly: true });
        console.log('[job] birthday age/maf refresh', result);
      } catch (err) {
        console.error('[job] birthday age/maf refresh failed', err.message);
      }
    },
    { timezone: tz }
  );
}
