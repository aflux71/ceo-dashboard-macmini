import axios from 'axios';
import db from '../db/database.js';
import dotenv from 'dotenv';

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

// Retail store names — everything else is warehouse/operational
const RETAIL_STORES = new Set([
  'neob Queen Street', 'neob Flower Farm', 'neob Elora',
  'neob Stratford', 'neob Bracebridge'
]);

// Sync locations
export async function syncLocations() {
  console.log('Syncing locations...');
  const res = await getWithRetry(`${SHOPIFY_URL}/locations.json`);
  const locations = res.data.locations;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO locations (id, name, city, is_retail, synced_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  const insertMany = db.transaction((items) => {
    for (const l of items) {
      insert.run(
        String(l.id), l.name, l.city,
        RETAIL_STORES.has(l.name) ? 1 : 0
      );
    }
  });
  insertMany(locations);

  console.log(`Locations synced: ${locations.length}`);
  return locations;
}

// Build a map of inventory_item_id -> {sku, product/variant info}
// by walking all products and their variants
async function buildVariantMap() {
  console.log('Building variant map from products...');
  const map = new Map();
  let url = `${SHOPIFY_URL}/products.json?limit=250&fields=id,title,variants`;
  let count = 0;

  while (url) {
    const res = await getWithRetry(url);
    for (const p of res.data.products) {
      for (const v of (p.variants || [])) {
        if (v.inventory_item_id) {
          map.set(String(v.inventory_item_id), {
            sku: v.sku || '',
            product_id: String(p.id),
            variant_id: String(v.id),
            variant_title: v.title || '',
            product_title: p.title || ''
          });
          count++;
        }
      }
    }
    url = nextPageUrl(res.headers['link']);
    if (url) await sleep(600);
  }

  console.log(`Variant map built: ${count} inventory items`);
  return map;
}

// Sync inventory levels for all locations
export async function syncInventory() {
  console.log('Starting inventory sync...');

  // 1. Locations first
  const locations = await syncLocations();
  const locationNames = {};
  for (const l of locations) locationNames[String(l.id)] = l.name;

  // 2. Variant map (inventory_item_id -> sku/product info)
  const variantMap = await buildVariantMap();

  // 3. Inventory levels — batch by inventory_item_ids, all locations
  console.log('Syncing inventory levels...');
  const allItemIds = [...variantMap.keys()];
  let synced = 0;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO inventory
    (inventory_item_id, location_id, location_name, available, sku,
     product_id, variant_id, variant_title, product_title, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  // Shopify allows up to 50 inventory_item_ids per inventory_levels call
  for (let i = 0; i < allItemIds.length; i += 50) {
    const batch = allItemIds.slice(i, i + 50);
    const url = `${SHOPIFY_URL}/inventory_levels.json?limit=250&inventory_item_ids=${batch.join(',')}`;

    let pageUrl = url;
    while (pageUrl) {
      const res = await getWithRetry(pageUrl);
      const levels = res.data.inventory_levels;

      const insertMany = db.transaction((items) => {
        for (const lvl of items) {
          const itemId = String(lvl.inventory_item_id);
          const locId = String(lvl.location_id);
          const v = variantMap.get(itemId) || {};
          insert.run(
            itemId, locId, locationNames[locId] || 'Unknown',
            lvl.available ?? 0, v.sku || '',
            v.product_id || '', v.variant_id || '',
            v.variant_title || '', v.product_title || '',
            lvl.updated_at || ''
          );
        }
      });
      insertMany(levels);
      synced += levels.length;

      pageUrl = nextPageUrl(res.headers['link']);
      if (pageUrl) await sleep(600);
    }

    if ((i / 50) % 5 === 0) console.log(`  ...${synced} inventory rows`);
    await sleep(600);
  }

  db.prepare(`INSERT INTO sync_log (entity, status, records_synced) VALUES (?, ?, ?)`)
    .run('inventory', 'success', synced);

  console.log(`Inventory synced: ${synced} rows`);
  return synced;
}
