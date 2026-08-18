import cron from 'node-cron';
import { dailySyncAll } from '../services/syncService.js';
import { refreshMembershipStatuses } from '../services/membershipJob.js';

export function startScheduler() {
  cron.schedule('0 5 * * *', async () => {
    console.log('[job] daily Strava catch-up starting');
    try {
      const result = await dailySyncAll();
      console.log('[job] daily Strava catch-up complete', result);
    } catch (err) {
      console.error('[job] daily Strava catch-up failed', err.message);
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
