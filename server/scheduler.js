import cron from 'node-cron';
import { runNightlySync } from './sync/shopify.js';

// Runs the nightly sync with automatic retry on transient failure.
// Retries up to `maxRetries` times, waiting `delayMs` between attempts.
async function runWithRetry(maxRetries = 2, delayMs = 15 * 60 * 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await runNightlySync();
      if (attempt > 0) {
        console.log(`Nightly sync succeeded on retry ${attempt}`);
      }
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        console.error(`Nightly sync attempt ${attempt + 1} failed (${err.message}); retrying in ${Math.round(delayMs / 60000)} min`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        console.error(`Nightly sync failed after ${maxRetries + 1} attempts:`, err.message);
        // runNightlySync already logs the error row to sync_log on each failure
      }
    }
  }
}

export function startScheduler() {
  // Nightly sync at 3:00 AM America/Toronto, with retry
  cron.schedule('0 3 * * *', async () => {
    console.log(`[${new Date().toISOString()}] Nightly sync triggered`);
    await runWithRetry();
  }, {
    timezone: 'America/Toronto'
  });

  console.log('Scheduler started — nightly sync at 3:00 AM America/Toronto (with retry)');
}
