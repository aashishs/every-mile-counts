import cron from 'node-cron';
import { refreshMembershipStatuses } from '../services/membershipJob.js';

export function startScheduler() {
  cron.schedule('0 6 * * *', async () => {
    try {
      const result = await refreshMembershipStatuses();
      console.log('[job] membership refresh', result);
    } catch (err) {
      console.error('[job] membership refresh failed', err.message);
    }
  });
}
