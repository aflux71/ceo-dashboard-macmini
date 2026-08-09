import axios from 'axios';
import db from '../db/database.js';
import dotenv from 'dotenv';
import { ensureOrderDiscountsSchema } from '../db/schema.js';

dotenv.config();

// ── One-off backfill: order_discounts only (Round 2 item 6) ──────────────────
// The nightly sync is syncOrdersIncremental(48), so discount_applications only
// accumulates forward 48h at a time — history will NOT fill itself.
//
// Deliberately NOT syncOrders(floor): that path rewrites every row in `orders`
// AND deletes/reinserts every row in `order_line_items` (182,817 + 93,143 rows
// as of 2026-08-09) to obtain data we already have. This writes ONLY
// order_discounts and never touches another table, so a failure mid-run cannot
// corrupt the order mirror.
//
// Idempotent: discounts for an order are deleted and reinserted together, per
// page, inside one transaction. Re-running is safe, and resuming after an
// interruption just redoes the pages already done.
//
// Costed 2026-08-09: 182,817 orders = 732 pages = 732 API calls, ~15 min at
// 600ms spacing (~1.6 req/s against Shopify's 2 req/s sustained limit).
// discount_applications is already in the order payload — no extra request and
// no `fields=` filter is set, so this adds nothing to the per-page cost.

const SHOPIFY_URL = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10`;
const HEADERS = {
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json'
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getWithRetry(url, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, { headers: HEADERS, timeout: 30000 });
    } catch (err) {
      const status = err.response?.status;
      const retryable = status === 429 || status >= 500 ||
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(err.code);
      if (!retryable || attempt === maxRetries) throw err;
      const wait = status === 429 ? 4000 : 1000 * attempt;
      console.log(`  retry ${attempt}/${maxRetries} after ${wait}ms (${err.code || status})`);
      await sleep(wait);
    }
  }
}

function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

const DISCOUNT_INSERT_SQL = `
  INSERT OR REPLACE INTO order_discounts
  (order_id, idx, type, title, norm_title, code, value, value_type,
   allocation_method, target_selection, target_type, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`;

const normDiscountTitle = (d) =>
  String(d.title || d.code || '').trim().toLowerCase() || null;

export async function backfillDiscounts(createdMin = '2024-01-01T00:00:00Z', opts = {}) {
  ensureOrderDiscountsSchema();
  const { dryRun = false, maxPages = Infinity } = opts;

  const insert = db.prepare(DISCOUNT_INSERT_SQL);
  const del = db.prepare('DELETE FROM order_discounts WHERE order_id = ?');

  // Per page, in one transaction: an interrupted run leaves whole pages done,
  // never a half-written order.
  const writePage = db.transaction((orders) => {
    let rows = 0;
    for (const o of orders) {
      const orderId = String(o.id);
      const das = Array.isArray(o.discount_applications) ? o.discount_applications : [];
      del.run(orderId);
      das.forEach((d, i) => {
        insert.run(
          orderId, i,
          d.type || null,
          d.title || d.code || null,
          normDiscountTitle(d),
          d.code || null,
          d.value != null ? parseFloat(d.value) : null,
          d.value_type || null,
          d.allocation_method || null,
          d.target_selection || null,
          d.target_type || null
        );
        rows++;
      });
    }
    return rows;
  });

  let url = `${SHOPIFY_URL}/orders.json?limit=250&status=any&created_at_min=${createdMin}`;
  let pages = 0, orders = 0, rows = 0, ordersWithDiscounts = 0;
  const started = Date.now();

  console.log(`Backfilling order_discounts from ${createdMin}${dryRun ? ' (DRY RUN — no writes)' : ''}...`);

  while (url && pages < maxPages) {
    const res = await getWithRetry(url);
    const batch = res.data.orders || [];
    orders += batch.length;
    ordersWithDiscounts += batch.filter(o => (o.discount_applications || []).length).length;
    if (!dryRun) rows += writePage(batch);
    else rows += batch.reduce((a, o) => a + (o.discount_applications || []).length, 0);

    pages++;
    if (pages % 25 === 0) {
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`  page ${pages} · ${orders.toLocaleString()} orders · ${rows.toLocaleString()} discount rows · ${mins}m`);
    }
    url = nextPageUrl(res.headers['link']);
    if (url) await sleep(600);
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  const summary = { pages, orders, ordersWithDiscounts, rows, minutes: Number(mins), dryRun };
  console.log(`Backfill ${dryRun ? '(dry run) ' : ''}complete: ${JSON.stringify(summary)}`);
  return summary;
}

// CLI: node server/sync/backfill_discounts.js [--dry-run] [--from=YYYY-MM-DD] [--max-pages=N]
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => {
    const m = process.argv.find(a => a.startsWith(`--${k}=`));
    return m ? m.split('=')[1] : d;
  };
  const dryRun = process.argv.includes('--dry-run');
  const from = arg('from', '2024-01-01');
  const maxPages = Number(arg('max-pages', Infinity));
  backfillDiscounts(`${from}T00:00:00Z`, { dryRun, maxPages })
    .then(() => process.exit(0))
    .catch(e => { console.error('Backfill failed:', e.message); process.exit(1); });
}
