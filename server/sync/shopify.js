import axios from 'axios';
import db from '../db/database.js';
import dotenv from 'dotenv';
import { syncInventory } from './inventory.js';

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

export async function syncOrders() {
  console.log('Syncing orders (last 12 months)...');
  let synced = 0;
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const createdMin = twelveMonthsAgo.toISOString();
  let url = `${SHOPIFY_URL}/orders.json?limit=250&status=any&created_at_min=${createdMin}`;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO orders
    (id, order_number, email, financial_status, fulfillment_status,
     total_price, currency, created_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let page = 0;
  while (url) {
    const res = await getWithRetry(url);
    const orders = res.data.orders;
    const insertMany = db.transaction((items) => {
      for (const o of items) {
        insert.run(
          String(o.id), String(o.order_number), o.email,
          o.financial_status, o.fulfillment_status,
          o.total_price, o.currency,
          o.created_at, o.updated_at
        );
      }
    });
    insertMany(orders);
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
  let synced = 0;
  const since = new Date();
  since.setHours(since.getHours() - hoursBack);
  const updatedMin = since.toISOString();
  let url = `${SHOPIFY_URL}/orders.json?limit=250&status=any&updated_at_min=${updatedMin}`;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO orders
    (id, order_number, email, financial_status, fulfillment_status,
     total_price, currency, created_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  while (url) {
    const res = await getWithRetry(url);
    const orders = res.data.orders;
    const insertMany = db.transaction((items) => {
      for (const o of items) {
        insert.run(
          String(o.id), String(o.order_number), o.email,
          o.financial_status, o.fulfillment_status,
          o.total_price, o.currency,
          o.created_at, o.updated_at
        );
      }
    });
    insertMany(orders);
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
