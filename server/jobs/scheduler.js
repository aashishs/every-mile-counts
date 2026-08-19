import cron from 'node-cron';
import { refreshMembershipStatuses } from '../services/membershipJob.js';
import { ensureStravaWebhookSubscription, syncAllConnectedStrava } from '../services/stravaService.js';

export function startScheduler() {
  ensureStravaWebhookSubscription()
    .then((result) => console.log('[strava] webhook', result))
    .catch((err) => console.error('[strava] webhook subscribe failed', err.response?.data || err.message));

  cron.schedule('0 */3 * * *', async () => {
    try {
      const result = await syncAllConnectedStrava();
      console.log('[job] strava incremental sync', result);
    } catch (err) {
      console.error('[job] strava incremental sync failed', err.message);
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
}
