import axios from 'axios';
import db from '../db/database.js';
import dotenv from 'dotenv';
import { ensureDailySalesSchema } from '../db/schema.js';

dotenv.config();

// ── Net-sales reconstruction (Phase 1, Path B) ───────────────────────────────
// Rebuilds per-store/day net sales, discounts, returns, COGS and gross profit
// from the Shopify orders/refunds/cost data the current token can already read
// (no read_reports scope). Reconciled to the penny against Shopify Analytics for
// 2026-07-18 (net 13,776.95 / GP 5,108.84 / GM 39.0% across 6 POS locations).
//
// Definitions (match Shopify exactly):
//   gross            = Σ(line price × qty), pre-tax, excl gift-card lines
//                      (shop is taxes_included=false → price is already pre-tax).
//   discounts        = Σ line_item.discount_allocations (order- and line-level).
//   returns          = Σ refund_line_items.subtotal for refunds whose processed_at
//                      falls on the day, attributed to the refund line's location
//                      (NOT the original order date/location).
//   net_sales        = gross − discounts − returns   (the headline revenue tile).
//   no_cost_net      = net of items whose variant unitCost is null; Shopify's
//                      PROFIT report excludes these. Symmetric: a return of a
//                      no-cost item subtracts from no_cost_net.
//   cost_bearing_net = net_sales − no_cost_net       (Shopify's profit-report net).
//   cogs             = Σ(unitCost × qty sold) − Σ(unitCost × qty returned).
//   gross_profit     = cost_bearing_net − cogs.
//   gross_margin_pct = gross_profit / cost_bearing_net   (null if base ≤ 0).
//
// PHASE 2 ROLLUP RULE: to aggregate margin across stores/dates, sum the parts —
//   margin = Σ gross_profit / Σ(net_sales − no_cost_net) — NEVER average the
//   stored gross_margin_pct values (averaging percentages is wrong when the
//   denominators differ). Same for any multi-row GP%/AOV rollup.

const SHOPIFY_URL = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10`;
const SHOPIFY_GRAPHQL_URL = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`;
const HEADERS = {
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json'
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Location resolution (POS = the 6 physical/festival locations) ────────────
// Same id→name map as server/sync/shopify.js. Web orders (source_name='web')
// with no physical location resolve to Online/DTC.
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
const RETAIL_STORES = new Set(['Queen Street', 'Flower Farm', 'Elora', 'Stratford', 'Bracebridge']);
const AOV_THRESHOLD = 15.00;   // sub-$15 NET; first 5 per store/day excluded from AOV only

function orderLocationId(o) {
  if (o.location_id) return String(o.location_id);
  if (Array.isArray(o.fulfillments)) {
    const f = o.fulfillments.find(x => x.location_id);
    if (f) return String(f.location_id);
  }
  return null;
}
function storeNameFor(locationId, sourceName) {
  if (locationId && LOCATION_NAMES[locationId]) return LOCATION_NAMES[locationId];
  if (sourceName === 'web') return 'Online/DTC';
  if (sourceName === 'pos') return 'Retail (unattributed)';
  return 'Unattributed';
}

// ── DST-aware Toronto calendar day (IANA, not a fixed offset) ────────────────
// A fixed −04:00 would mis-bucket evening orders Nov–Mar (EST). en-CA formats as
// YYYY-MM-DD, and Intl applies the correct EST/EDT offset per instant.
const TZ = 'America/Toronto';
const _dfmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});
const torontoDate = (iso) => (iso ? _dfmt.format(new Date(iso)) : null);

// Start-of-day in Toronto for a YYYY-MM-DD, as a UTC instant, DST-aware. Used
// only to build the orders fetch lower bound (widened a day for safety).
function torontoStartInstant(dateStr) {
  // Determine Toronto's UTC offset on that date by probing noon UTC.
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, timeZoneName: 'shortOffset', hour: '2-digit', hour12: false
  }).formatToParts(noon);
  const off = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
  const m = off.match(/GMT([+-]\d{1,2})/);
  const hrs = m ? parseInt(m[1], 10) : -5;
  const sign = hrs < 0 ? '-' : '+';
  const hh = String(Math.abs(hrs)).padStart(2, '0');
  return new Date(`${dateStr}T00:00:00${sign}${hh}:00`);
}

// ── Shopify fetch helpers ────────────────────────────────────────────────────
async function getWithRetry(url, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, { headers: HEADERS, timeout: 30000 });
    } catch (err) {
      const status = err.response?.status;
      const retryable = status === 429 || status >= 500 ||
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(err.code);
      if (!retryable || attempt === maxRetries) throw err;
      await sleep(status === 429 ? 4000 : 1000 * attempt);
    }
  }
}
function nextPageUrl(linkHeader) {
  const m = (linkHeader || '').match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

const ORDER_FIELDS = [
  'id', 'name', 'created_at', 'updated_at', 'source_name', 'location_id',
  'fulfillments', 'line_items', 'refunds', 'cancelled_at', 'financial_status'
].join(',');

// Fetch all orders updated at/after `sinceIso` (status=any). This captures both
// new sales in the window AND older orders refunded in the window (a refund bumps
// updated_at), so returns processed in-range on old orders are not missed.
async function fetchOrdersUpdatedSince(sinceIso, onPage, untilIso = null) {
  // untilIso bounds the fetch (updated_at_max) for backfill chunks / historical
  // spot-checks. Caveat: an order refunded in-range but re-updated after untilIso
  // is excluded — acceptable for month chunks processed oldest→newest and for
  // isolated validation days; the unbounded nightly window never uses it.
  let url = `${SHOPIFY_URL}/orders.json?status=any&limit=250&updated_at_min=${encodeURIComponent(sinceIso)}`
    + (untilIso ? `&updated_at_max=${encodeURIComponent(untilIso)}` : '')
    + `&fields=${ORDER_FIELDS}`;
  let total = 0, pages = 0;
  while (url) {
    const res = await getWithRetry(url);
    const orders = res.data.orders || [];
    onPage(orders);
    total += orders.length;
    pages++;
    if (pages % 20 === 0) console.log(`  ...${pages} pages, ${total} orders`);
    url = nextPageUrl(res.headers['link']);
    if (url) await sleep(500);
  }
  return { total, pages };
}

// ── Variant unit cost (InventoryItem.unitCost via Admin GraphQL) ─────────────
// Matches Shopify's cost basis exactly (verified per-location on 2026-07-18).
// Cached per run so backfill month-chunks don't refetch the same variants.
const _costCache = new Map();   // variant_id -> number|null
async function graphQL(query, variables, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await axios.post(SHOPIFY_GRAPHQL_URL, { query, variables }, { headers: HEADERS, timeout: 30000 });
    } catch (err) {
      const status = err.response?.status;
      const retryable = status === 429 || status >= 500 ||
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(err.code);
      if (!retryable || attempt === maxRetries) throw err;
      await sleep(1000 * attempt);
      continue;
    }
    const { data, errors } = res.data;
    if (errors && errors.length) {
      if (errors.some(e => e.extensions?.code === 'THROTTLED') && attempt < maxRetries) {
        await sleep(2000 * attempt);
        continue;
      }
      throw new Error(errors.map(x => x.message).join('; '));
    }
    return data;
  }
}
async function ensureCosts(variantIds) {
  const todo = [...variantIds].filter(v => v && !_costCache.has(v));
  for (let i = 0; i < todo.length; i += 200) {
    const chunk = todo.slice(i, i + 200).map(id => `gid://shopify/ProductVariant/${id}`);
    const data = await graphQL(
      `query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id inventoryItem { unitCost { amount } } } } }`,
      { ids: chunk }
    );
    for (const n of (data?.nodes || [])) {
      if (!n?.id) continue;
      const vid = n.id.split('/').pop();
      const amt = n.inventoryItem?.unitCost?.amount;
      _costCache.set(vid, amt != null ? parseFloat(amt) : null);
    }
    // ids that resolved to null nodes (deleted variants) → treat as unknown cost
    for (const gid of chunk) {
      const vid = gid.split('/').pop();
      if (!_costCache.has(vid)) _costCache.set(vid, null);
    }
    await sleep(400);
  }
}
const costOf = (variantId) => (variantId ? _costCache.get(String(variantId)) : null);

// ── Aggregation ──────────────────────────────────────────────────────────────
const lineNet = (li) =>
  parseFloat(li.price || '0') * (li.quantity || 0) -
  (li.discount_allocations || []).reduce((s, d) => s + parseFloat(d.amount || '0'), 0);

const normTitle = (s) => (s || '').trim().toLowerCase();
function itemKeyFor(li) {
  if (li.variant_id != null) return String(li.variant_id);
  return 'custom:' + normTitle(li.title);
}

// Reconstruct [startDate, endDate] inclusive (Toronto YYYY-MM-DD) and upsert.
// Idempotent: deletes any existing rows in the range first, then reinserts.
export async function reconstructRange(startDate, endDate, source = 'orders_reconstruct', opts = {}) {
  ensureDailySalesSchema();
  const sinceIso = torontoStartInstant(startDate).toISOString();
  const untilIso = opts.untilDate ? torontoStartInstant(opts.untilDate).toISOString() : null;
  const inRange = (d) => d && d >= startDate && d <= endDate;

  // cell key "store date" -> aggregates
  const cells = new Map();
  const cell = (store, date) => {
    const k = store + ' ' + date;
    let c = cells.get(k);
    if (!c) {
      c = {
        store, date,
        gross: 0, disc: 0, rev: 0, unitsSold: 0, unitsRet: 0,
        orderIds: new Set(),
        smallTxns: [],           // retail only: {net, ts} for sub-$15 AOV rule
        items: new Map()         // item_key -> {variant_id, sku, title, is_fixable, soldQty, soldNet, retQty, retSub}
      };
      cells.set(k, c);
    }
    return c;
  };
  const itemOf = (c, li) => {
    const key = itemKeyFor(li);
    let e = c.items.get(key);
    if (!e) {
      e = {
        variant_id: li.variant_id != null ? String(li.variant_id) : null,
        sku: li.sku || null, title: li.title || null,
        is_fixable: li.variant_id != null ? 1 : 0,
        soldQty: 0, soldNet: 0, retQty: 0, retSub: 0
      };
      c.items.set(key, e);
    }
    return e;
  };

  // Single streaming pass — aggregate per store/day as pages arrive; never buffer
  // raw orders (the full backfill is ~200k). Costs are applied in a finalize pass,
  // so each cell keeps per-item qty/net (bounded by distinct SKUs sold that day).
  const variantIds = new Set();
  const stats = await fetchOrdersUpdatedSince(sinceIso, (orders) => {
    for (const o of orders) {
      const oLoc = orderLocationId(o);

      // SALES side — attributed to created date + order location.
      const saleDay = torontoDate(o.created_at);
      if (inRange(saleDay) && !o.cancelled_at) {
        const c = cell(storeNameFor(oLoc, o.source_name), saleDay);
        c.orderIds.add(String(o.id));
        let orderNet = 0;
        for (const li of (o.line_items || [])) {
          if (li.gift_card) continue;
          const qty = li.quantity || 0;
          const net = lineNet(li);
          c.gross += parseFloat(li.price || '0') * qty;
          c.disc += (li.discount_allocations || []).reduce((s, d) => s + parseFloat(d.amount || '0'), 0);
          c.unitsSold += qty;
          orderNet += net;
          const e = itemOf(c, li); e.soldQty += qty; e.soldNet += net;
          if (li.variant_id) variantIds.add(String(li.variant_id));
        }
        if (RETAIL_STORES.has(c.store) && orderNet < AOV_THRESHOLD) {
          c.smallTxns.push({ net: orderNet, ts: o.created_at });
        }
      }

      // REVERSAL side — attributed to processed date + refund-line location.
      for (const rf of (o.refunds || [])) {
        const refDay = torontoDate(rf.processed_at || rf.created_at);
        if (!inRange(refDay)) continue;
        for (const rli of (rf.refund_line_items || [])) {
          const li = rli.line_item || {};
          if (li.gift_card) continue;
          const rLoc = rli.location_id ? String(rli.location_id) : oLoc;
          const c = cell(storeNameFor(rLoc, o.source_name), refDay);
          const qty = rli.quantity || 0;
          const sub = parseFloat(rli.subtotal || '0');   // net line value refunded
          c.rev += sub;
          c.unitsRet += qty;
          const e = itemOf(c, li); e.retQty += qty; e.retSub += sub;
          if (li.variant_id) variantIds.add(String(li.variant_id));
        }
      }
    }
  }, untilIso);

  // Fetch costs once, then finalize each cell.
  await ensureCosts(variantIds);

  // Write (idempotent range replace).
  const rows = [];
  const ledgerRows = [];
  for (const c of cells.values()) {
    // Apply costs: split each item's net contribution into cogs (cost known) or
    // no_cost_net (cost null). Net qty/net already fold in same-cell returns.
    let cogs = 0, no_cost_net = 0;
    const cellLedger = [];
    for (const [key, e] of c.items) {
      const cost = costOf(e.variant_id);
      if (cost == null) {
        const itemNet = e.soldNet - e.retSub;
        no_cost_net += itemNet;
        cellLedger.push([key, c.date, c.store, e.variant_id, e.sku, e.title, e.is_fixable, itemNet]);
      } else {
        cogs += cost * (e.soldQty - e.retQty);
      }
    }
    const net_sales = c.gross - c.disc - c.rev;
    const costBearing = net_sales - no_cost_net;
    const gross_profit = costBearing - cogs;
    const gross_margin_pct = costBearing > 0 ? (gross_profit / costBearing) * 100 : null;
    const net_items = c.unitsSold - c.unitsRet;

    // AOV exclusion: first ≤5 sub-$15-net txns by time.
    c.smallTxns.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const excluded = c.smallTxns.slice(0, 5);
    const aov_excluded_orders = excluded.length;
    const aov_excluded_net = excluded.reduce((s, t) => s + t.net, 0);

    rows.push([
      c.store, c.date,
      round2(net_sales), round2(c.disc), round2(cogs), round2(no_cost_net),
      round2(gross_profit), gross_margin_pct == null ? null : round2(gross_margin_pct),
      net_items, c.orderIds.size,
      aov_excluded_orders, round2(aov_excluded_net), source
    ]);
    for (const r of cellLedger) {
      if (Math.abs(r[7]) < 0.005) continue;    // net-zero after returns → skip
      ledgerRows.push([r[0], r[1], r[2], r[3], r[4], r[5], r[6], round2(r[7])]);
    }
  }

  const insertDaily = db.prepare(`
    INSERT OR REPLACE INTO daily_sales
    (store_name, sale_date, net_sales, discounts, cogs, no_cost_net,
     gross_profit, gross_margin_pct, net_items, orders,
     aov_excluded_orders, aov_excluded_net, source, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertLedger = db.prepare(`
    INSERT OR REPLACE INTO missing_cost_ledger
    (item_key, sale_date, store_name, variant_id, sku, title, is_fixable, no_cost_net)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const delDaily = db.prepare(`DELETE FROM daily_sales WHERE sale_date BETWEEN ? AND ?`);
  const delLedger = db.prepare(`DELETE FROM missing_cost_ledger WHERE sale_date BETWEEN ? AND ?`);

  const write = db.transaction(() => {
    delDaily.run(startDate, endDate);
    delLedger.run(startDate, endDate);
    for (const r of rows) insertDaily.run(...r);
    for (const r of ledgerRows) insertLedger.run(...r);
  });
  write();

  return { range: [startDate, endDate], ordersFetched: stats.total, pages: stats.pages,
           cells: rows.length, ledgerRows: ledgerRows.length };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Convenience: reconstruct a single Toronto day.
export const reconstructDay = (date) => reconstructRange(date, date);

// Nightly sync: re-run a trailing window so late-processed refunds land on the
// right day. Wired into scheduler.js alongside (not replacing) the orders sync.
export async function runNetSalesSync(trailingDays = 3) {
  const today = torontoDate(new Date().toISOString());
  const start = torontoDate(new Date(Date.now() - trailingDays * 86400000).toISOString());
  console.log(`Net-sales sync: reconstructing ${start} → ${today}`);
  const r = await reconstructRange(start, today);
  db.prepare(`INSERT INTO sync_log (entity, status, records_synced) VALUES (?, ?, ?)`)
    .run('net_sales', 'success', r.cells);
  console.log(`Net-sales sync done:`, r);
  return r;
}
