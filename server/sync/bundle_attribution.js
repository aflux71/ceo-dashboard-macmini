import axios from 'axios';
import db from '../db/database.js';
import dotenv from 'dotenv';
import { ensureOrderBundlesSchema } from '../db/schema.js';

dotenv.config();

// ── Bundle attribution via GraphQL LineItem.lineItemGroup ────────────────────
// Why this exists, and why it is GraphQL when the order sync is REST:
//
// Shopify Bundles puts COMPONENT line items on an order and never the bundle
// parent as a line. The REST 2023-10 order payload the main sync reads has no
// reference to the parent at all, so matching on the GS#### SKU found nothing
// after the 2026-06-15 conversion and "Packaged Bundle %" read 0% while the
// bundles were selling normally (Shopify Analytics: 32 bundles, 100% POS).
//
// The parent IS exposed on the GraphQL Admin API as `LineItem.lineItemGroup`.
// Introspected 2026-08-09: `bundleComponents` does NOT exist at 2024-10 or
// 2025-01; `lineItemGroup` does, and carries id/title/productId/variantId/
// variantSku/quantity. Verified against 16,642 live orders — 622 bundle
// attributions, 100% POS, real GS#### SKUs, 32 distinct products over 30 days
// which matches Shopify's own Analytics exactly.
//
// This runs ALONGSIDE the REST order sync rather than replacing it: same
// pattern as net_sales.js. Rewriting the whole order sync to GraphQL to obtain
// one field would put the order mirror, line items and location resolution at
// risk for no benefit. This module writes only order_bundles.

const SHOPIFY_GRAPHQL_URL = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`;
const HEADERS = {
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json'
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Same id→name map as shopify.js / net_sales.js. GraphQL returns display names
// like "neob Queen Street"; our canonical store name is "Queen Street", so map
// by ID rather than string-munging the label.
const LOCATION_NAMES = {
  '72406499553': 'neob HQ',
  '83628064993': 'Ecommerce Warehouse',
  '86510141665': '3PL-Online Orders',
  '83109183713': 'Festivals & Events',
  '81226596577': 'Walkers Market Warehouse',
  '72406204641': 'Queen Street',
  '72403026145': 'Flower Farm',
  '72406270177': 'Elora',
  '72406335713': 'Stratford',
  '72406401249': 'Bracebridge'
};

function locationName(locId, sourceName) {
  if (locId && LOCATION_NAMES[locId]) return LOCATION_NAMES[locId];
  if (sourceName === 'web') return 'Online/DTC';
  if (sourceName === 'pos') return 'Retail (unattributed)';
  return 'Unattributed';
}

async function graphQL(query, maxRetries = 6) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post(SHOPIFY_GRAPHQL_URL, { query }, { headers: HEADERS, timeout: 60000 });
      const { data, errors } = res.data;
      if (errors && errors.length) {
        if (errors.some(e => e.extensions?.code === 'THROTTLED') && attempt < maxRetries) {
          await sleep(2000 * attempt);
          continue;
        }
        throw new Error(errors.map(e => e.message).join('; '));
      }
      return data;
    } catch (err) {
      const status = err.response?.status;
      const retryable = status === 429 || status >= 500 ||
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(err.code);
      if (!retryable || attempt === maxRetries) throw err;
      await sleep(1500 * attempt);
    }
  }
  throw new Error('graphQL retries exhausted');
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO order_bundles
  (order_id, group_id, bundle_sku, bundle_title, bundle_product_id,
   quantity, component_lines, order_date, location_name, source_name, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`;

// createdAt comes back as an ISO instant; the rest of the codebase keys on the
// Toronto calendar day, so convert rather than slicing the UTC string.
const TZ = 'America/Toronto';
const torontoDayOf = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso));

const legacyId = (gid) => (gid ? String(gid).split('/').pop() : null);

// Sync bundle attribution for orders created on/after `fromDate` (YYYY-MM-DD).
// Idempotent: rows are keyed (order_id, group_id) and REPLACEd, and an order's
// existing rows are cleared before reinsert so an amended order cannot leave
// stale bundles behind.
export async function syncOrderBundles(fromDate, opts = {}) {
  ensureOrderBundlesSchema();
  const { dryRun = false, maxPages = Infinity, quiet = false } = opts;

  const insert = db.prepare(INSERT_SQL);
  const del = db.prepare('DELETE FROM order_bundles WHERE order_id = ?');

  // One transaction per page: an interruption leaves whole pages done.
  const writePage = db.transaction((orders) => {
    let n = 0;
    for (const o of orders) {
      const orderId = legacyId(o.id);
      del.run(orderId);
      // Collapse component lines into their parent group.
      const groups = new Map();
      for (const li of (o.lineItems?.nodes || [])) {
        const g = li.lineItemGroup;
        if (!g) continue;
        const gid = legacyId(g.id);
        const cur = groups.get(gid);
        if (cur) { cur.component_lines++; continue; }
        groups.set(gid, {
          sku: g.variantSku || null,
          title: g.title || null,
          productId: legacyId(g.productId),
          quantity: g.quantity != null ? g.quantity : 1,
          component_lines: 1
        });
      }
      if (!groups.size) continue;
      const locId = legacyId(o.physicalLocation?.id);
      const src = o.sourceName || null;
      const loc = locationName(locId, src);
      const day = torontoDayOf(o.createdAt);
      for (const [gid, g] of groups) {
        insert.run(orderId, gid, g.sku, g.title, g.productId,
                   g.quantity, g.component_lines, day, loc, src);
        n++;
      }
    }
    return n;
  });

  let cursor = null, pages = 0, scanned = 0, rows = 0, bundleOrders = 0;
  const started = Date.now();
  if (!quiet) console.log(`Bundle attribution: scanning orders created_at>=${fromDate}${dryRun ? ' (DRY RUN)' : ''}...`);

  while (pages < maxPages) {
    const after = cursor ? `, after:"${cursor}"` : '';
    const data = await graphQL(`{
      orders(first:100, reverse:true, query:"created_at:>=${fromDate}"${after}) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id createdAt sourceName
          physicalLocation { id }
          lineItems(first:100) {
            nodes { lineItemGroup { id title productId variantId variantSku quantity } }
          }
        }
      }
    }`);
    const page = data.orders;
    scanned += page.nodes.length;
    bundleOrders += page.nodes.filter(o => (o.lineItems?.nodes || []).some(li => li.lineItemGroup)).length;
    if (!dryRun) rows += writePage(page.nodes);
    else rows += page.nodes.reduce((a, o) => {
      const ids = new Set((o.lineItems?.nodes || []).filter(li => li.lineItemGroup).map(li => li.lineItemGroup.id));
      return a + ids.size;
    }, 0);

    pages++;
    if (!quiet && pages % 25 === 0) {
      console.log(`  page ${pages} · ${scanned} orders · ${rows} bundle rows · ${((Date.now() - started) / 60000).toFixed(1)}m`);
    }
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
    await sleep(350);
  }

  const summary = {
    pages, scanned, bundleOrders, rows,
    minutes: Number(((Date.now() - started) / 60000).toFixed(2)), dryRun
  };
  if (!quiet) console.log(`Bundle attribution ${dryRun ? '(dry run) ' : ''}complete: ${JSON.stringify(summary)}`);
  return summary;
}

// Nightly helper: re-scan a trailing window so amended orders self-correct,
// mirroring the net-sales sync's trailing-window approach.
export async function syncOrderBundlesTrailing(days = 3) {
  const from = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() - days * 86400000));
  return syncOrderBundles(from);
}

// CLI: node server/sync/bundle_attribution.js [--dry-run] [--from=YYYY-MM-DD] [--max-pages=N]
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => {
    const m = process.argv.find(a => a.startsWith(`--${k}=`));
    return m ? m.split('=')[1] : d;
  };
  syncOrderBundles(arg('from', '2026-06-01'), {
    dryRun: process.argv.includes('--dry-run'),
    maxPages: Number(arg('max-pages', Infinity))
  }).then(() => process.exit(0))
    .catch(e => { console.error('Bundle attribution failed:', e.message); process.exit(1); });
}
