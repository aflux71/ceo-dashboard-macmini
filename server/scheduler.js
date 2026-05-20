import cron from 'node-cron';
import { runNightlySync } from './sync/shopify.js';

export function startScheduler() {
  // Nightly sync at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    console.log(`[${new Date().toISOString()}] Nightly sync triggered`);
    try {
      await runNightlySync();
    } catch (err) {
      console.error('Nightly sync failed:', err.message);
    }
  }, {
    timezone: 'America/Toronto'
  });

  console.log('Scheduler started — nightly sync at 3:00 AM America/Toronto');
}
