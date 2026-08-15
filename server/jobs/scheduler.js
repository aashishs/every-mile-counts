import cron from 'node-cron';
import { dailySyncAll } from '../services/syncService.js';
import { refreshMembershipStatuses } from '../services/membershipJob.js';

export function startScheduler() {
  cron.schedule('0 4 * * *', async () => {
    console.log('[job] daily activity sync starting');
    try {
      const result = await dailySyncAll();
      console.log('[job] daily sync complete', result);
    } catch (err) {
      console.error('[job] daily sync failed', err.message);
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
