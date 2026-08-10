import cron from 'node-cron';
import { runNightlySync } from './sync/shopify.js';
import { runNetSalesSync } from './sync/net_sales.js';
import { syncOrderBundlesTrailing } from './sync/bundle_attribution.js';

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

// Same retry policy for the net-sales reconstruction. Separate wrapper so the
// orders sync above is untouched. `trailingDays` sets how far back to recompute.
async function runNetSalesWithRetry(trailingDays, maxRetries = 2, delayMs = 15 * 60 * 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await runNetSalesSync(trailingDays);
      if (attempt > 0) {
        console.log(`Net-sales sync succeeded on retry ${attempt}`);
      }
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        console.error(`Net-sales sync attempt ${attempt + 1} failed (${err.message}); retrying in ${Math.round(delayMs / 60000)} min`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        console.error(`Net-sales sync failed after ${maxRetries + 1} attempts:`, err.message);
        // runNetSalesSync already logs the error row to sync_log on each failure
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

  // Bundle attribution — ADDITIVE, GraphQL-based, independent of the REST order
  // sync above. Runs at 3:15 AM, between the orders sync (3:00) and net sales
  // (3:30), so a night's orders are mirrored before their bundles are attributed.
  //
  // A 3-day TRAILING window, not just yesterday: an amended or late-captured
  // order must re-land, and the upsert is idempotent so re-scanning is free.
  // Shopify Bundles never puts the bundle parent on a REST order line, so this
  // is the ONLY path by which bundle sales become attributable.
  cron.schedule('15 3 * * *', async () => {
    console.log(`[${new Date().toISOString()}] Bundle attribution (3-day trailing) triggered`);
    try {
      const r = await syncOrderBundlesTrailing(3);
      console.log('Bundle attribution done:', JSON.stringify(r));
    } catch (err) {
      // console only — scheduler.js deliberately holds no db handle; the other
      // jobs log their own sync_log rows from inside the sync module.
      console.error('Bundle attribution failed:', err.message);
    }
  }, { timezone: 'America/Toronto' });

  // Net-sales reconstruction — ADDITIVE, independent of the orders sync above
  // (it fetches from Shopify directly, not from the local orders table).
  //
  // Nightly at 3:30 AM: recompute a 30-day TRAILING window, not just yesterday.
  // Returns/refunds are attributed to the date they're PROCESSED, so a refund
  // processed days/weeks after the original sale must re-land on its own day —
  // re-running the trailing window with the idempotent upsert makes every recent
  // day self-correct as late refunds arrive.
  cron.schedule('30 3 * * *', async () => {
    console.log(`[${new Date().toISOString()}] Net-sales nightly (30-day trailing) triggered`);
    await runNetSalesWithRetry(30);
  }, {
    timezone: 'America/Toronto'
  });

  // Weekly deeper re-sync (Sundays 4:00 AM): recompute 90 days to catch late
  // returns that land beyond the nightly 30-day window.
  cron.schedule('0 4 * * 0', async () => {
    console.log(`[${new Date().toISOString()}] Net-sales weekly deep (90-day) triggered`);
    await runNetSalesWithRetry(90);
  }, {
    timezone: 'America/Toronto'
  });

  console.log('Scheduler started — orders 3:00 AM; bundles 3:15 AM (3d trailing); net-sales 3:30 AM (30d) + Sun 4:00 AM (90d), America/Toronto (with retry)');
}
