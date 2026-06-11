import axios from 'axios';
import db from '../db/database.js';
import dotenv from 'dotenv';
import { syncInventory } from './inventory.js';
import { ensureBundleSchema } from '../db/schema.js';

dotenv.config();

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
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

// ── Location resolution ──────────────────────────────────────────
// Shopify REST orders give location_id reliably only for POS orders.
// We derive: (1) source_name (web/pos/etc), (2) best-effort location_id.
function resolveOrderLocation(o) {
  let locationId = o.location_id ? String(o.location_id) : null;

  // POS orders without top-level location_id: check fulfillments
  if (!locationId && Array.isArray(o.fulfillments) && o.fulfillments.length > 0) {
    const fl = o.fulfillments.find(f => f.location_id);
    if (fl) locationId = String(fl.location_id);
  }

  return {
    locationId,
    sourceName: o.source_name || 'unknown'
  };
}

// Map Shopify location IDs -> store names (from inventory sync — 10 known locations)
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

function locationName(locationId, sourceName) {
  if (locationId && LOCATION_NAMES[locationId]) return LOCATION_NAMES[locationId];
  if (sourceName === 'web') return 'Online/DTC';
  if (sourceName === 'pos') return 'Retail (unattributed)';
  return 'Unattributed';
}

export async function syncProducts() {
  console.log('Syncing products...');
  let synced = 0;
  let url = `${SHOPIFY_URL}/products.json?limit=250`;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO products
    (id, title, vendor, product_type, status, tags, created_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  while (url) {
    const res = await getWithRetry(url);
    const products = res.data.products;
    const insertMany = db.transaction((items) => {
      for (const p of items) {
        insert.run(
          String(p.id), p.title, p.vendor, p.product_type,
          p.status, p.tags, p.created_at, p.updated_at
        );
      }
    });
    insertMany(products);
    synced += products.length;
    url = nextPageUrl(res.headers['link']);
    if (url) await sleep(600);
  }

  db.prepare(`INSERT INTO sync_log (entity, status, records_synced) VALUES (?, ?, ?)`)
    .run('products', 'success', synced);
  console.log(`Products synced: ${synced}`);
  return synced;
}

// ── Bundle detection ─────────────────────────────────────────────
// neōb bundles are marked by dedicated product tags set in Shopify admin,
// with the sales channel encoded in the tag itself:
//   "neob-bundle-pos" → POS bundle   (is_bundle_pos)
//   "neob-bundle-dtc" → DTC bundle   (is_bundle_dtc)
// The map is built by reading product tags straight from the Shopify API
// (not the local products table) so newly-tagged products are picked up
// even when the local products mirror hasn't re-synced yet. Each order is
// then flagged by matching its line-item product IDs against this map.
const BUNDLE_TAG_POS = 'neob-bundle-pos';
const BUNDLE_TAG_DTC = 'neob-bundle-dtc';

async function buildBundleTagMap() {
  const map = new Map();
  let url = `${SHOPIFY_URL}/products.json?limit=250&fields=id,tags`;

  while (url) {
    const res = await getWithRetry(url);
    for (const p of res.data.products) {
      const tagList = (p.tags || '').split(',').map(t => t.trim());
      const pos = tagList.includes(BUNDLE_TAG_POS);
      const dtc = tagList.includes(BUNDLE_TAG_DTC);
      if (pos || dtc) map.set(String(p.id), { pos, dtc });
    }
    url = nextPageUrl(res.headers['link']);
    if (url) await sleep(600);
  }
  return map;
}

const ORDER_INSERT_SQL = `
  INSERT OR REPLACE INTO orders
  (id, order_number, email, financial_status, fulfillment_status,
   total_price, currency, location_id, location_name, source_name,
   tags, is_bundle_pos, is_bundle_dtc,
   created_at, updated_at, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`;

const LINE_ITEM_INSERT_SQL = `
  INSERT OR REPLACE INTO order_line_items
  (id, order_id, product_id, variant_id, title, sku, quantity, price, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`;

// Flag an order by matching its line-item product IDs against the bundle map.
// pos/dtc are independent flags (a product carries at most one bundle tag, but
// an order could in principle contain both kinds of line item).
function detectBundles(order, bundleMap) {
  let isBundlePos = 0;
  let isBundleDtc = 0;
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  for (const li of lineItems) {
    const pid = li.product_id != null ? String(li.product_id) : null;
    const b = pid ? bundleMap.get(pid) : null;
    if (b) {
      if (b.pos) isBundlePos = 1;
      if (b.dtc) isBundleDtc = 1;
    }
  }
  return { isBundlePos, isBundleDtc };
}

function insertOrders(orders, bundleMap) {
  const insert = db.prepare(ORDER_INSERT_SQL);
  const insertLineItem = db.prepare(LINE_ITEM_INSERT_SQL);
  const deleteLineItems = db.prepare(`DELETE FROM order_line_items WHERE order_id = ?`);

  const insertMany = db.transaction((items) => {
    for (const o of items) {
      const orderId = String(o.id);
      const { locationId, sourceName } = resolveOrderLocation(o);
      const locName = locationName(locationId, sourceName);
      const { isBundlePos, isBundleDtc } = detectBundles(o, bundleMap);

      insert.run(
        orderId, String(o.order_number), o.email,
        o.financial_status, o.fulfillment_status,
        o.total_price, o.currency,
        locationId, locName, sourceName,
        o.tags || null, isBundlePos, isBundleDtc,
        o.created_at, o.updated_at
      );

      // Replace line items wholesale so re-syncs stay correct if lines change.
      deleteLineItems.run(orderId);
      const lineItems = Array.isArray(o.line_items) ? o.line_items : [];
      for (const li of lineItems) {
        insertLineItem.run(
          String(li.id), orderId,
          li.product_id != null ? String(li.product_id) : null,
          li.variant_id != null ? String(li.variant_id) : null,
          li.title, li.sku,
          li.quantity, li.price
        );
      }
    }
  });
  insertMany(orders);
}

// Explicit history floor — covers all orders back to Feb 2024.
// A fixed date is more predictable than a rolling window and won't drift.
const ORDER_HISTORY_FLOOR = '2024-01-01T00:00:00Z';

export async function syncOrders() {
  console.log('Syncing orders (full history from ' + ORDER_HISTORY_FLOOR + ') with location data...');
  ensureBundleSchema();
  const bundleMap = await buildBundleTagMap();
  console.log(`  bundle tag map: ${bundleMap.size} bundle products`);
  let synced = 0;
  const createdMin = ORDER_HISTORY_FLOOR;
  let url = `${SHOPIFY_URL}/orders.json?limit=250&status=any&created_at_min=${createdMin}`;

  let page = 0;
  while (url) {
    const res = await getWithRetry(url);
    const orders = res.data.orders;
    insertOrders(orders, bundleMap);
    synced += orders.length;
    page++;
    if (page % 10 === 0) console.log(`  ...${synced} orders`);
    url = nextPageUrl(res.headers['link']);
    if (url) await sleep(600);
  }

  db.prepare(`INSERT INTO sync_log (entity, status, records_synced) VALUES (?, ?, ?)`)
    .run('orders', 'success', synced);
  console.log(`Orders synced: ${synced}`);
  return synced;
}

export async function syncOrdersIncremental(hoursBack = 48) {
  console.log(`Syncing orders updated in last ${hoursBack}h...`);
  ensureBundleSchema();
  const bundleMap = await buildBundleTagMap();
  console.log(`  bundle tag map: ${bundleMap.size} bundle products`);
  let synced = 0;
  const since = new Date();
  since.setHours(since.getHours() - hoursBack);
  const updatedMin = since.toISOString();
  let url = `${SHOPIFY_URL}/orders.json?limit=250&status=any&updated_at_min=${updatedMin}`;

  while (url) {
    const res = await getWithRetry(url);
    const orders = res.data.orders;
    insertOrders(orders, bundleMap);
    synced += orders.length;
    url = nextPageUrl(res.headers['link']);
    if (url) await sleep(600);
  }

  db.prepare(`INSERT INTO sync_log (entity, status, records_synced) VALUES (?, ?, ?)`)
    .run('orders_incremental', 'success', synced);
  console.log(`Orders updated: ${synced}`);
  return synced;
}

export async function runFullSync() {
  console.log('Starting full Shopify sync...');
  try {
    const products = await syncProducts();
    const orders = await syncOrders();
    const inventory = await syncInventory();
    console.log('Full sync complete');
    return { products, orders, inventory };
  } catch (err) {
    console.error('Sync error:', err.message);
    db.prepare(`INSERT INTO sync_log (entity, status, error) VALUES (?, ?, ?)`)
      .run('full_sync', 'error', err.message);
    throw err;
  }
}

export async function runNightlySync() {
  console.log('Starting nightly Shopify sync...');
  try {
    const products = await syncProducts();
    const orders = await syncOrdersIncremental(48);
    const inventory = await syncInventory();
    console.log('Nightly sync complete');
    return { products, orders, inventory };
  } catch (err) {
    console.error('Nightly sync error:', err.message);
    db.prepare(`INSERT INTO sync_log (entity, status, error) VALUES (?, ?, ?)`)
      .run('nightly_sync', 'error', err.message);
    throw err;
  }
}
