import express from 'express';
import { randomInt } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db/database.js';
import { loadKnowledge, getLoadedDocs, getKnowledgeStatus } from '../knowledge.js';
import { logUsage } from '../usage.js';

const router = express.Router();

// --- PRODUCTS ---
router.get('/products', (req, res) => {
  try {
    const { search, type, status, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND title LIKE ?'; params.push(`%${search}%`); }
    if (type) { sql += ' AND product_type = ?'; params.push(type); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY title LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql).all(...params);
    const total = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    res.json({ data: rows, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/products/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json({ data: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ORDERS ---
router.get('/orders', (req, res) => {
  try {
    const { fulfillment_status, financial_status, since, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (fulfillment_status) {
      sql += ' AND fulfillment_status IS ?';
      params.push(fulfillment_status === 'null' ? null : fulfillment_status);
    }
    if (financial_status) { sql += ' AND financial_status = ?'; params.push(financial_status); }
    if (since) { sql += ' AND created_at >= ?'; params.push(since); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql).all(...params);
    const total = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
    res.json({ data: rows, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders/unfulfilled', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM orders
      WHERE fulfillment_status IS NULL OR fulfillment_status = 'partial'
      ORDER BY created_at DESC
    `).all();
    res.json({ data: rows, count: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- LOCATIONS ---
router.get('/locations', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM locations ORDER BY is_retail DESC, name').all();
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- INVENTORY ---

// Inventory rows, optionally filtered by location or search
router.get('/inventory', (req, res) => {
  try {
    const { search, location_id, low, limit = 200, offset = 0 } = req.query;
    let sql = 'SELECT * FROM inventory WHERE 1=1';
    const params = [];
    if (search) {
      sql += ' AND (product_title LIKE ? OR sku LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (location_id) { sql += ' AND location_id = ?'; params.push(location_id); }
    if (low) { sql += ' AND available <= ?'; params.push(Number(low)); }
    sql += ' ORDER BY available ASC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql).all(...params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stock for one SKU across all locations
router.get('/inventory/sku/:sku', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT location_name, available, product_title, variant_title
      FROM inventory WHERE sku = ?
      ORDER BY available DESC
    `).all(req.params.sku);
    const total = rows.reduce((s, r) => s + (r.available || 0), 0);
    res.json({ sku: req.params.sku, total, locations: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stock summary by location
router.get('/inventory/by-location', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT location_name, COUNT(*) AS skus, SUM(available) AS total_units
      FROM inventory
      GROUP BY location_name
      ORDER BY total_units DESC
    `).all();
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Production needs — SKUs low across the whole network (HQ hub view)
router.get('/inventory/production-needs', (req, res) => {
  try {
    const threshold = Number(req.query.threshold || 20);
    const rows = db.prepare(`
      SELECT sku, product_title, variant_title,
             SUM(available) AS total_available,
             SUM(CASE WHEN location_name = 'neob HQ' THEN available ELSE 0 END) AS hq_stock
      FROM inventory
      WHERE sku != ''
      GROUP BY sku
      HAVING total_available <= ?
      ORDER BY total_available ASC
    `).all(threshold);
    res.json({ threshold, count: rows.length, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Replenishment needs — store low but HQ has stock to send
router.get('/inventory/replenishment', (req, res) => {
  try {
    const storeThreshold = Number(req.query.threshold || 5);
    const rows = db.prepare(`
      SELECT s.location_name AS store, s.sku, s.product_title,
             s.available AS store_stock,
             hq.available AS hq_stock
      FROM inventory s
      JOIN inventory hq ON s.sku = hq.sku AND hq.location_name = 'neob HQ'
      JOIN locations l ON s.location_id = l.id AND l.is_retail = 1
      WHERE s.available <= ? AND hq.available > 0 AND s.sku != ''
      ORDER BY s.available ASC
    `).all(storeThreshold);
    res.json({ threshold: storeThreshold, count: rows.length, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- DASHBOARD STATS ---
router.get('/stats', (req, res) => {
  try {
    const products = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    const activeProducts = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'active'").get().c;
    const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
    const unfulfilled = db.prepare(`
      SELECT COUNT(*) AS c FROM orders
      WHERE fulfillment_status IS NULL OR fulfillment_status = 'partial'
    `).get().c;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const revenue30 = db.prepare(`
      SELECT COALESCE(SUM(CAST(total_price AS REAL)), 0) AS total
      FROM orders WHERE created_at >= ?
    `).get(since.toISOString()).total;
    const inventoryUnits = db.prepare('SELECT COALESCE(SUM(available),0) AS u FROM inventory').get().u;
    res.json({
      products, activeProducts, orders, unfulfilled,
      revenue_30d: Math.round(revenue30 * 100) / 100,
      inventory_units: inventoryUnits
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SYNC ---
router.get('/sync/status', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 20').all();
    const lastSuccess = db.prepare(`
      SELECT created_at FROM sync_log
      WHERE status = 'success' ORDER BY id DESC LIMIT 1
    `).get();
    res.json({ history: rows, last_success: lastSuccess?.created_at || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sync/run', async (req, res) => {
  try {
    const { runFullSync } = await import('../sync/shopify.js');
    res.json({ ok: true, message: 'Sync started' });
    runFullSync().catch(err => console.error('Manual sync failed:', err.message));
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- AI ASSISTANT ---
router.post('/assistant', async (req, res) => {
  try {
    const { askAssistant } = await import('../assistant.js');
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'No message provided' });
    const result = await askAssistant(message, history);
    res.json({ answer: result.answer, history: result.messages });
  } catch (err) {
    console.error('Assistant error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// Enhanced CEO stats endpoint
router.get('/stats/ceo', (req, res) => {
  try {
    const d30 = new Date(Date.now() - 30*86400000).toISOString();
    const ytd = new Date(new Date().getFullYear(), 0, 1).toISOString();

    const s30 = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ?').get(d30);
    const sYTD = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ?').get(ytd);
    const s30Retail = db.prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ? AND location_name IN ('Queen Street','Flower Farm','Elora','Stratford','Bracebridge')").get(d30);
    const sYTDRetail = db.prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ? AND location_name IN ('Queen Street','Flower Farm','Elora','Stratford','Bracebridge')").get(ytd);
    const prods = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'active'").get();
    const inv = db.prepare('SELECT COALESCE(SUM(available),0) AS u FROM inventory').get();
    const unfCutoff = new Date(Date.now() - 14*86400000).toISOString();
    const unf = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE fulfillment_status IS NULL AND created_at >= ?").get(unfCutoff);
    const lastSync = db.prepare("SELECT created_at FROM sync_log WHERE status='success' ORDER BY id DESC LIMIT 1").get();

    const dayOfYear = Math.ceil((Date.now() - new Date(new Date().getFullYear(),0,1)) / 86400000);
    const annualRunRate = Math.round((sYTD.rev / dayOfYear) * 365);

    res.json({
      rev_30d: Math.round(s30.rev * 100) / 100,
      orders_30d: s30.cnt,
      aov_30d: s30Retail.cnt > 0 ? Math.round(s30Retail.rev / s30Retail.cnt * 100) / 100 : 0,
      rev_ytd: Math.round(sYTD.rev * 100) / 100,
      orders_ytd: sYTD.cnt,
      aov_ytd: sYTDRetail.cnt > 0 ? Math.round(sYTDRetail.rev / sYTDRetail.cnt * 100) / 100 : 0,
      annual_run_rate: annualRunRate,
      active_products: prods.c,
      inventory_units: inv.u,
      unfulfilled: unf.c,
      last_sync: lastSync?.created_at || null,
      day_of_year: dayOfYear
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// Enhanced CEO stats endpoint
router.get('/stats/ceo', (req, res) => {
  try {
    const d30 = new Date(Date.now() - 30*86400000).toISOString();
    const ytd = new Date(new Date().getFullYear(), 0, 1).toISOString();

    const s30 = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ?').get(d30);
    const sYTD = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ?').get(ytd);
    const s30Retail = db.prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ? AND location_name IN ('Queen Street','Flower Farm','Elora','Stratford','Bracebridge')").get(d30);
    const sYTDRetail = db.prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ? AND location_name IN ('Queen Street','Flower Farm','Elora','Stratford','Bracebridge')").get(ytd);
    const prods = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'active'").get();
    const inv = db.prepare('SELECT COALESCE(SUM(available),0) AS u FROM inventory').get();
    const unfCutoff = new Date(Date.now() - 14*86400000).toISOString();
    const unf = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE fulfillment_status IS NULL AND created_at >= ?").get(unfCutoff);
    const lastSync = db.prepare("SELECT created_at FROM sync_log WHERE status='success' ORDER BY id DESC LIMIT 1").get();

    const dayOfYear = Math.ceil((Date.now() - new Date(new Date().getFullYear(),0,1)) / 86400000);
    const annualRunRate = Math.round((sYTD.rev / dayOfYear) * 365);

    res.json({
      rev_30d: Math.round(s30.rev * 100) / 100,
      orders_30d: s30.cnt,
      aov_30d: s30Retail.cnt > 0 ? Math.round(s30Retail.rev / s30Retail.cnt * 100) / 100 : 0,
      rev_ytd: Math.round(sYTD.rev * 100) / 100,
      orders_ytd: sYTD.cnt,
      aov_ytd: sYTDRetail.cnt > 0 ? Math.round(sYTDRetail.rev / sYTDRetail.cnt * 100) / 100 : 0,
      annual_run_rate: annualRunRate,
      active_products: prods.c,
      inventory_units: inv.u,
      unfulfilled: unf.c,
      last_sync: lastSync?.created_at || null,
      day_of_year: dayOfYear
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// ── Channel exclusions — baked into every revenue query ──────────
// Matrixify App: pre-Shopify historical import (8,180 orders, $788K) — NOT real Shopify sales
// 3890849: unknown app channel, likely another import — excluded for data integrity
const EXCLUDED_SOURCES = "'Matrixify App','3890849'";

// Known retail store location IDs
const STORE_LOCATIONS = {
  '72406204641': 'Queen Street',
  '72403026145': 'Flower Farm',
  '72406270177': 'Elora',
  '72406335713': 'Stratford',
  '72406401249': 'Bracebridge'
};

// ── /api/revenue/by-store ─────────────────────────────────────────
// Returns per-store revenue, orders, AOV for a given period
// Query params: period = '30d' | 'ytd' | 'ly30d' | 'lytd' | custom
// Optional: date_from, date_to (ISO strings)
router.get('/revenue/by-store', (req, res) => {
  try {
    const { period = '30d', date_from, date_to } = req.query;
    const { from, to } = resolvePeriod(period, date_from, date_to);

    // Per-store revenue (POS orders with known location)
    const storeRows = db.prepare(`
      SELECT
        location_id,
        location_name,
        COUNT(*) AS orders,
        ROUND(SUM(CAST(total_price AS REAL)), 2) AS revenue,
        ROUND(SUM(CAST(total_price AS REAL)) / COUNT(*), 2) AS aov
      FROM orders
      WHERE source_name NOT IN (${EXCLUDED_SOURCES})
        AND created_at >= ?
        AND created_at < ?
        AND location_id IS NOT NULL
        AND location_name NOT IN ('neob HQ','Ecommerce Warehouse','3PL-Online Orders','Festivals & Events','Walkers Market Warehouse')
      GROUP BY location_id, location_name
      ORDER BY revenue DESC
    `).all(from, to);

    // Online/DTC revenue (web orders)
    const onlineRow = db.prepare(`
      SELECT
        'Online/DTC' AS location_name,
        COUNT(*) AS orders,
        ROUND(SUM(CAST(total_price AS REAL)), 2) AS revenue,
        ROUND(SUM(CAST(total_price AS REAL)) / COUNT(*), 2) AS aov
      FROM orders
      WHERE source_name = 'web'
        AND created_at >= ?
        AND created_at < ?
    `).get(from, to);

    // Total (all clean channels)
    const totalRow = db.prepare(`
      SELECT
        COUNT(*) AS orders,
        ROUND(SUM(CAST(total_price AS REAL)), 2) AS revenue,
        ROUND(SUM(CAST(total_price AS REAL)) / COUNT(*), 2) AS aov
      FROM orders
      WHERE source_name NOT IN (${EXCLUDED_SOURCES})
        AND created_at >= ?
        AND created_at < ?
    `).get(from, to);

    const stores = storeRows.map(r => ({
      location_id: r.location_id,
      location_name: r.location_name,
      orders: r.orders,
      revenue: r.revenue,
      aov: r.aov
    }));

    if (onlineRow?.revenue) {
      stores.push({
        location_id: 'online',
        location_name: 'Online/DTC',
        orders: onlineRow.orders,
        revenue: onlineRow.revenue,
        aov: onlineRow.aov
      });
    }

    res.json({
      period,
      from,
      to,
      stores,
      total: totalRow
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── /api/revenue/ytd ──────────────────────────────────────────────
// YTD revenue vs same period last year, by store + total
router.get('/revenue/ytd', (req, res) => {
  try {
    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01T00:00:00Z`;
    const today = now.toISOString();

    // Same day/month range last year
    const lyStart = `${now.getFullYear()-1}-01-01T00:00:00Z`;
    const lyEnd = new Date(now);
    lyEnd.setFullYear(lyEnd.getFullYear() - 1);
    const lyToday = lyEnd.toISOString();

    const ytdStores = getStoreRevenue(yearStart, today);
    const lyStores = getStoreRevenue(lyStart, lyToday);

    // Merge YTD and LY
    const storeMap = {};
    for (const s of ytdStores) {
      storeMap[s.location_name] = { ...s, ly_revenue: 0, ly_orders: 0, ly_aov: 0 };
    }
    for (const s of lyStores) {
      if (storeMap[s.location_name]) {
        storeMap[s.location_name].ly_revenue = s.revenue;
        storeMap[s.location_name].ly_orders = s.orders;
        storeMap[s.location_name].ly_aov = s.aov;
      } else {
        storeMap[s.location_name] = { location_name: s.location_name, revenue: 0, orders: 0, aov: 0, ly_revenue: s.revenue, ly_orders: s.orders, ly_aov: s.aov };
      }
    }

    const stores = Object.values(storeMap).sort((a,b) => b.revenue - a.revenue);

    // Totals
    const ytdTotal = db.prepare(`
      SELECT COUNT(*) AS orders, ROUND(SUM(CAST(total_price AS REAL)),2) AS revenue
      FROM orders WHERE source_name NOT IN (${EXCLUDED_SOURCES}) AND created_at >= ? AND created_at < ?
    `).get(yearStart, today);

    const lyTotal = db.prepare(`
      SELECT COUNT(*) AS orders, ROUND(SUM(CAST(total_price AS REAL)),2) AS revenue
      FROM orders WHERE source_name NOT IN (${EXCLUDED_SOURCES}) AND created_at >= ? AND created_at < ?
    `).get(lyStart, lyToday);

    res.json({
      ytd_from: yearStart,
      ytd_to: today,
      ly_from: lyStart,
      ly_to: lyToday,
      stores,
      ytd_total: ytdTotal,
      ly_total: lyTotal,
      vs_ly_pct: lyTotal.revenue > 0 ? Math.round(((ytdTotal.revenue - lyTotal.revenue) / lyTotal.revenue) * 100) : null
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── /api/bundles/penetration ──────────────────────────────────────
// "Packaged Bundle %" — share of orders containing a tagged bundle product
// (neob-bundle-pos / neob-bundle-dtc), matched by stable SKU. POS % is per
// retail store; DTC % is overall web. This is packaged gift-set bundles only
// — a SUBSET of $40-threshold compliance — and is deliberately NOT the same
// as the 35-40% program target. Multi-item discount baskets are a separate
// (Phase 3) metric. Bundle flags are only backfilled from 2026-05-01, so this
// endpoint is restricted to a 30d window by default.
const RETAIL_STORES = "'Queen Street','Flower Farm','Elora','Stratford','Bracebridge'";
const BUNDLE_TARGET_PCT = 10; // placeholder — not the 35-40% program target

router.get('/bundles/penetration', (req, res) => {
  try {
    const { period = '30d', date_from, date_to } = req.query;
    const { from, to } = resolvePeriod(period, date_from, date_to);

    const stores = db.prepare(`
      SELECT location_name AS store,
        COUNT(*) AS orders,
        COALESCE(SUM(is_bundle_pos),0) AS bundle_orders,
        ROUND(100.0*SUM(is_bundle_pos)/NULLIF(COUNT(*),0),1) AS bundle_pos_pct
      FROM orders
      WHERE location_name IN (${RETAIL_STORES})
        AND created_at >= ? AND created_at < ?
      GROUP BY location_name
      ORDER BY bundle_pos_pct DESC
    `).all(from, to);

    const retailTotal = db.prepare(`
      SELECT COUNT(*) AS orders, COALESCE(SUM(is_bundle_pos),0) AS bundle_orders,
        ROUND(100.0*SUM(is_bundle_pos)/NULLIF(COUNT(*),0),1) AS bundle_pos_pct
      FROM orders
      WHERE location_name IN (${RETAIL_STORES})
        AND created_at >= ? AND created_at < ?
    `).get(from, to);

    const dtc = db.prepare(`
      SELECT COUNT(*) AS orders, COALESCE(SUM(is_bundle_dtc),0) AS bundle_orders,
        ROUND(100.0*SUM(is_bundle_dtc)/NULLIF(COUNT(*),0),1) AS bundle_dtc_pct
      FROM orders
      WHERE source_name = 'web'
        AND created_at >= ? AND created_at < ?
    `).get(from, to);

    res.json({
      period, from, to,
      target_pct: BUNDLE_TARGET_PCT,
      data_since: '2026-05-01',
      label: 'Packaged Bundle %',
      stores,
      retail_total: retailTotal,
      dtc
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── helpers ───────────────────────────────────────────────────────
function resolvePeriod(period, date_from, date_to) {
  const now = new Date();
  if (date_from && date_to) return { from: date_from, to: date_to };
  switch(period) {
    case 'ytd':
      return { from: `${now.getFullYear()}-01-01T00:00:00Z`, to: now.toISOString() };
    case 'lytd': {
      const ly = new Date(now); ly.setFullYear(ly.getFullYear()-1);
      return { from: `${ly.getFullYear()}-01-01T00:00:00Z`, to: ly.toISOString() };
    }
    case '7d':
      return { from: new Date(now - 7*86400000).toISOString(), to: now.toISOString() };
    case '30d':
    default:
      return { from: new Date(now - 30*86400000).toISOString(), to: now.toISOString() };
  }
}

function getStoreRevenue(from, to) {
  const storeRows = db.prepare(`
    SELECT location_name, COUNT(*) AS orders,
      ROUND(SUM(CAST(total_price AS REAL)),2) AS revenue,
      ROUND(SUM(CAST(total_price AS REAL))/COUNT(*),2) AS aov
    FROM orders
    WHERE source_name NOT IN (${EXCLUDED_SOURCES})
      AND created_at >= ? AND created_at < ?
      AND location_id IS NOT NULL
      AND location_name NOT IN ('neob HQ','Ecommerce Warehouse','3PL-Online Orders','Festivals & Events','Walkers Market Warehouse','Retail (unattributed)','Unattributed')
    GROUP BY location_name ORDER BY revenue DESC
  `).all(from, to);

  const onlineRow = db.prepare(`
    SELECT COUNT(*) AS orders,
      ROUND(SUM(CAST(total_price AS REAL)),2) AS revenue,
      ROUND(SUM(CAST(total_price AS REAL))/COUNT(*),2) AS aov
    FROM orders WHERE source_name = 'web' AND created_at >= ? AND created_at < ?
  `).get(from, to);

  const result = [...storeRows];
  if (onlineRow?.revenue) result.push({ location_name: 'Online/DTC', ...onlineRow });
  return result;
}


// ── TASK MANAGEMENT ENDPOINTS ─────────────────────────────────────

// GET all tasks
router.get('/tasks', (req, res) => {
  try {
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY due_date ASC').all();
    res.json({ tasks });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST create a new task
router.post('/tasks', (req, res) => {
  try {
    const { title, owner, quarter, priority, status, due_date, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const result = db.prepare(`
      INSERT INTO tasks (title, owner, quarter, priority, status, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      owner || null,
      quarter || null,
      priority || 'medium',
      status || 'Not Started',
      due_date || null,
      notes || null
    );
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    res.json({ task });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PATCH update a task
router.patch('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const fields = ['title','owner','quarter','priority','status','due_date','notes'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[f]);
      }
    }
    if (updates.length === 0) return res.json({ task: existing });

    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.json({ task });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// DELETE a task
router.delete('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.json({ ok: true, deleted: id });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// ── PORTAL SYNC API ───────────────────────────────────────────────
// Replaces Base44 portalSync.ts — Cloudflare Store Portal talks to this
// Auth: Bearer neob-portal-sync-2026

const PORTAL_SYNC_KEY = 'neob-portal-sync-2026';

function checkPortalAuth(req, res) {
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${PORTAL_SYNC_KEY}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// GET /api/portal-sync?action=targets&store=Queen Street&date=2026-05-25
// GET /api/portal-sync?action=all_targets&date=2026-05-25
router.get('/portal-sync', (req, res) => {
  if (!checkPortalAuth(req, res)) return;
  try {
    const { action, store, date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    if (action === 'targets') {
      if (!store) return res.status(400).json({ error: 'Missing store parameter' });

      // Look for exact date first, then fall back to most recent target
      let target = db.prepare(
        'SELECT * FROM kpi_targets WHERE store_name = ? AND target_date = ?'
      ).get(store, targetDate);

      if (!target) {
        target = db.prepare(
          'SELECT * FROM kpi_targets WHERE store_name = ? ORDER BY target_date DESC LIMIT 1'
        ).get(store);
      }

      if (target) {
        return res.json({
          target: {
            store: target.store_name,
            target_date: target.target_date,
            revenue_target: target.revenue_target,
            aov_target: target.aov_target,
            bundle_target: target.bundle_target,
            forty_target: target.forty_target
          }
        });
      }
      return res.json({ target: null });
    }

    if (action === 'all_targets') {
      const targets = db.prepare(
        'SELECT * FROM kpi_targets WHERE target_date = ? ORDER BY store_name'
      ).all(targetDate);

      // If no targets for today, get most recent per store
      if (targets.length === 0) {
        const stores = ['Queen Street', 'Flower Farm', 'Elora', 'Stratford', 'Bracebridge', 'Online/DTC'];
        const latest = stores.map(s =>
          db.prepare('SELECT * FROM kpi_targets WHERE store_name = ? ORDER BY target_date DESC LIMIT 1').get(s)
        ).filter(Boolean);
        return res.json({ targets: latest });
      }

      return res.json({ targets });
    }

    return res.status(400).json({ error: 'Invalid action. Use: targets, all_targets, submit' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /api/portal-sync?action=submit
router.post('/portal-sync', (req, res) => {
  if (!checkPortalAuth(req, res)) return;
  try {
    const { action } = req.query;
    if (action !== 'submit') return res.status(400).json({ error: 'Invalid action' });

    const {
      store, entry_date, revenue, transactions, aov,
      bundle_pct, forty_compliance, soap_attach,
      submitted_at, submitted_by, source, notes
    } = req.body;

    if (!store || !entry_date || revenue === undefined) {
      return res.status(400).json({ error: 'Missing required fields: store, entry_date, revenue' });
    }

    // Upsert — one entry per store per day
    db.prepare(`
      INSERT INTO daily_kpi
        (store_name, staff_name, entry_date, revenue, transactions, aov,
         bundle_pct, forty_compliance, soap_attach, notes,
         submitted_at, synced_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store_name, entry_date) DO UPDATE SET
        staff_name = excluded.staff_name,
        revenue = excluded.revenue,
        transactions = excluded.transactions,
        aov = excluded.aov,
        bundle_pct = excluded.bundle_pct,
        forty_compliance = excluded.forty_compliance,
        soap_attach = excluded.soap_attach,
        notes = excluded.notes,
        submitted_at = excluded.submitted_at
    `).run(
      store,
      submitted_by || 'staff',
      entry_date,
      Number(revenue),
      transactions ? Number(transactions) : null,
      aov ? Number(aov) : null,
      bundle_pct ? Number(bundle_pct) : null,
      forty_compliance ? Number(forty_compliance) : null,
      soap_attach ? Number(soap_attach) : null,
      notes || null,
      submitted_at || new Date().toISOString(),
      source || 'portal'
    );

    // Log to console for visibility
    console.log(`Portal entry: ${store} - ${entry_date} - $${revenue} (by ${submitted_by || 'staff'})`);

    return res.json({
      success: true,
      message: `Entry saved for ${store} on ${entry_date}`,
      store, entry_date, revenue: Number(revenue)
    });
  } catch(err) {
    console.error('Portal sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portal-sync/entries — view recent entries (CEO use)
router.get('/portal-sync/entries', (req, res) => {
  if (!checkPortalAuth(req, res)) return;
  try {
    const { store, days = 7 } = req.query;
    const since = new Date(Date.now() - Number(days) * 86400000).toISOString().split('T')[0];
    const query = store
      ? 'SELECT * FROM daily_kpi WHERE store_name = ? AND entry_date >= ? ORDER BY entry_date DESC, store_name'
      : 'SELECT * FROM daily_kpi WHERE entry_date >= ? ORDER BY entry_date DESC, store_name';
    const rows = store
      ? db.prepare(query).all(store, since)
      : db.prepare(query).all(since);
    res.json({ entries: rows });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN AUTH + ADMIN-FACING ENDPOINTS ───────────────────────────
// Backs /targets.html and /staff.html. PIN gate via X-Admin-Pin header
// against admin_users table. /api/admin-auth/login is the only
// endpoint that does not require the header (it accepts pin in body).

if (!process.env.CF_API_TOKEN) {
  console.warn('[admin] CF_API_TOKEN not set — /api/staff and /api/store-access will return 503 until configured in .env');
}

const ADMIN_STORES = ['Queen Street', 'Flower Farm', 'Elora', 'Stratford', 'Bracebridge', 'Online/DTC'];

function checkAdminPin(req, res) {
  const pin = req.headers['x-admin-pin'];
  if (!pin) {
    res.status(401).json({ error: 'Missing X-Admin-Pin header' });
    return null;
  }
  const user = db.prepare(
    'SELECT id, name, role FROM admin_users WHERE pin = ? AND is_active = 1'
  ).get(String(pin));
  if (!user) {
    res.status(401).json({ error: 'Invalid admin PIN' });
    return null;
  }
  return user;
}

async function d1Query(sql, params = []) {
  if (!process.env.CF_API_TOKEN || !process.env.CF_ACCOUNT_ID || !process.env.CF_D1_DATABASE_ID) {
    const err = new Error('Cloudflare D1 not configured (set CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_API_TOKEN in .env)');
    err.status = 503;
    throw err;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.CF_D1_DATABASE_ID}/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.success) {
    const err = new Error('D1 error: ' + JSON.stringify(json.errors || json.messages || { status: resp.status }));
    err.status = 502;
    throw err;
  }
  return json.result?.[0]?.results || [];
}

function sendError(res, err) {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
}

// — admin auth —
router.post('/admin-auth/login', (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'Missing pin' });
    const user = db.prepare(
      'SELECT name, role FROM admin_users WHERE pin = ? AND is_active = 1'
    ).get(String(pin));
    if (!user) return res.status(401).json({ error: 'Invalid PIN' });
    res.json({ ok: true, name: user.name, role: user.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin-users', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const rows = db.prepare(
      'SELECT id, name, role, is_active, created_at FROM admin_users ORDER BY name'
    ).all();
    res.json({ users: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// — targets —
function pad2(n) { return String(n).padStart(2, '0'); }
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

function lyDailyRevenue(store, fromDate, toDate) {
  if (store === 'Online/DTC') {
    return db.prepare(`
      SELECT DATE(created_at) AS day, ROUND(SUM(CAST(total_price AS REAL)), 2) AS revenue
      FROM orders
      WHERE source_name = 'web'
        AND DATE(created_at) BETWEEN ? AND ?
      GROUP BY DATE(created_at)
    `).all(fromDate, toDate);
  }
  return db.prepare(`
    SELECT DATE(created_at) AS day, ROUND(SUM(CAST(total_price AS REAL)), 2) AS revenue
    FROM orders
    WHERE source_name NOT IN (${EXCLUDED_SOURCES})
      AND location_name = ?
      AND DATE(created_at) BETWEEN ? AND ?
    GROUP BY DATE(created_at)
  `).all(store, fromDate, toDate);
}

router.get('/targets/month', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const store = req.query.store;
    if (!year || !month || !store) {
      return res.status(400).json({ error: 'Missing year, month, or store' });
    }
    if (!ADMIN_STORES.includes(store)) {
      return res.status(400).json({ error: 'Unknown store' });
    }

    const lyYear = year - 1;
    const days = daysInMonth(year, month);
    const monthStart = `${year}-${pad2(month)}-01`;
    const monthEnd = `${year}-${pad2(month)}-${pad2(days)}`;
    const lyStart = `${lyYear}-${pad2(month)}-01`;
    const lyEnd = `${lyYear}-${pad2(month)}-${pad2(daysInMonth(lyYear, month))}`;

    const lyRows = lyDailyRevenue(store, lyStart, lyEnd);
    const lyMap = {};
    for (const r of lyRows) lyMap[r.day] = r.revenue || 0;

    const existing = db.prepare(
      'SELECT target_date, revenue_target FROM kpi_targets WHERE store_name = ? AND target_date BETWEEN ? AND ?'
    ).all(store, monthStart, monthEnd);
    const existingMap = {};
    for (const r of existing) existingMap[r.target_date] = r.revenue_target;

    const rows = [];
    for (let day = 1; day <= days; day++) {
      const date = `${year}-${pad2(month)}-${pad2(day)}`;
      const lyDate = `${lyYear}-${pad2(month)}-${pad2(day)}`;
      rows.push({
        date,
        ly_date: lyDate,
        ly_revenue: lyMap[lyDate] || 0,
        existing_target: existingMap[date] ?? null
      });
    }
    res.json({ store, year, month, rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/targets/ly-summary', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!year || !month) return res.status(400).json({ error: 'Missing year or month' });
    const lyYear = year - 1;
    const lyStart = `${lyYear}-${pad2(month)}-01`;
    const lyEnd = `${lyYear}-${pad2(month)}-${pad2(daysInMonth(lyYear, month))}`;

    const stores = ADMIN_STORES.map(store => {
      const rows = lyDailyRevenue(store, lyStart, lyEnd);
      const total = rows.reduce((s, r) => s + (r.revenue || 0), 0);
      return { store, ly_revenue: Math.round(total * 100) / 100 };
    });
    res.json({ year, month, ly_year: lyYear, stores });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/targets/bulk', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const { targets } = req.body || {};
    if (!Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ error: 'Missing targets array' });
    }
    const upsert = db.prepare(`
      INSERT INTO kpi_targets (store_name, target_date, revenue_target, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(store_name, target_date) DO UPDATE SET
        revenue_target = excluded.revenue_target,
        updated_at = excluded.updated_at
    `);
    let count = 0;
    const tx = db.transaction((rows) => {
      for (const t of rows) {
        if (!t.date || !t.store) continue;
        if (t.revenue_target === undefined || t.revenue_target === null) continue;
        upsert.run(t.store, t.date, Number(t.revenue_target));
        count++;
      }
    });
    tx(targets);
    res.json({ ok: true, count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// — staff (proxy to Cloudflare D1) —
router.get('/staff', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const rows = await d1Query('SELECT * FROM staff ORDER BY name');
    res.json({ staff: rows });
  } catch (err) { sendError(res, err); }
});

router.post('/staff', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const { name, pin, store_name, role } = req.body || {};
    if (!name || !pin) return res.status(400).json({ error: 'name and pin required' });
    await d1Query(
      "INSERT INTO staff (name, pin, store_name, role, is_active, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))",
      [name, String(pin), store_name || null, role || 'staff']
    );
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.patch('/staff/:id', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const fields = ['name', 'pin', 'store_name', 'role', 'is_active'];
    const updates = [];
    const params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(f === 'pin' ? String(req.body[f]) : req.body[f]);
      }
    }
    if (updates.length === 0) return res.json({ ok: true, noop: true });
    params.push(req.params.id);
    await d1Query(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.delete('/staff/:id', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    await d1Query('UPDATE staff SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// — store access codes (D1) —
// 7-char code: 4-letter colour + 3-digit number, e.g. BLUE742
const COLOR_POOL = ['BLUE','GOLD','PINK','ROSE','SAGE','PLUM','MINT','RUBY','OPAL','NAVY','CLAY','SAND','LIME','TEAL','JADE','AQUA','IRIS','FERN','MOSS','LILY'];
function newStoreCode() {
  const color = COLOR_POOL[randomInt(0, COLOR_POOL.length)];
  const num = randomInt(100, 1000);
  return `${color}${num}`;
}

router.get('/store-access', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const rows = await d1Query('SELECT * FROM store_access ORDER BY store_name');
    res.json({ access: rows });
  } catch (err) { sendError(res, err); }
});

router.post('/store-access/:id/rotate', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const code = newStoreCode();
    const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
    await d1Query(
      'UPDATE store_access SET store_code = ?, code_expires_at = ? WHERE id = ?',
      [code, expiresAt, req.params.id]
    );
    res.json({ ok: true, store_code: code, code_expires_at: expiresAt });
  } catch (err) { sendError(res, err); }
});

// — API usage / spend tracking —

function summarizeUsage(whereClause, ...params) {
  const total = db.prepare(
    `SELECT COALESCE(SUM(cost_cents),0) AS c, COUNT(*) AS n FROM api_usage WHERE ${whereClause}`
  ).get(...params);
  const byFeatureRows = db.prepare(
    `SELECT feature, COALESCE(SUM(cost_cents),0) AS c, COUNT(*) AS n FROM api_usage WHERE ${whereClause} GROUP BY feature`
  ).all(...params);
  const by_feature = {};
  for (const r of byFeatureRows) by_feature[r.feature] = { cost_cents: r.c, query_count: r.n };
  return { total_cents: total.c, query_count: total.n, by_feature };
}

router.get('/usage/today', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    res.json(summarizeUsage("date(timestamp) = date('now')"));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/usage/mtd', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    res.json(summarizeUsage("strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')"));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// — RAG Q&A bot —

const RAG_MODEL = 'claude-sonnet-4-6';
const RAG_DAILY_CAP_CENTS = 500; // $5/day
const RAG_FEATURE = 'rag_bot';

let ragClient = null;
function getRagClient() {
  if (ragClient) return ragClient;
  const apiKey = process.env.ANTHROPIC_KEY_PRODUCTION;
  if (!apiKey) return null;
  ragClient = new Anthropic({ apiKey });
  return ragClient;
}

const RAG_SYSTEM_PROMPT = `You are the neōb Growth Plan assistant. You have access to the company's growth plan documents.
Answer questions strictly from these documents. If the documents don't contain the answer, say so directly.
When citing information, mention which document it came from (e.g., "According to Section C, the $40 rule...").
Be concise. Use plain prose. Avoid bullet lists unless the document itself uses them.`;

function todayRagCostCents() {
  const row = db.prepare(
    "SELECT COALESCE(SUM(cost_cents),0) AS c FROM api_usage WHERE feature = ? AND date(timestamp) = date('now')"
  ).get(RAG_FEATURE);
  return row?.c || 0;
}

router.get('/knowledge/status', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    res.json(getKnowledgeStatus());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/knowledge/reload', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    await loadKnowledge();
    res.json(getKnowledgeStatus());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ask', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const { question, history } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }

    const todayCents = todayRagCostCents();
    if (todayCents >= RAG_DAILY_CAP_CENTS) {
      return res.status(429).json({
        error: `Daily $${(RAG_DAILY_CAP_CENTS / 100).toFixed(2)} cap reached ($${(todayCents / 100).toFixed(2)} used today). Resets at midnight.`,
        today_cents: todayCents,
        cap_cents: RAG_DAILY_CAP_CENTS
      });
    }

    const docs = getLoadedDocs();
    if (docs.length === 0) {
      return res.status(503).json({
        error: 'No documents indexed yet. Add PDFs to knowledge/growth-plan/ and POST /api/knowledge/reload.'
      });
    }

    const client = getRagClient();
    if (!client) {
      return res.status(503).json({ error: 'ANTHROPIC_KEY_PRODUCTION not set' });
    }

    // Build document blocks. Cache_control on the last one caches the prefix.
    const docBlocks = docs.map((doc, i) => {
      const block = {
        type: 'document',
        source: { type: 'file', file_id: doc.file_id },
        title: doc.filename,
        citations: { enabled: true }
      };
      if (i === docs.length - 1) block.cache_control = { type: 'ephemeral', ttl: '1h' };
      return block;
    });

    // Reconstruct conversation: documents always sit in the first user message
    // so the prefix is stable across turns and the cache hits.
    let messages;
    const hist = Array.isArray(history) ? history : [];
    if (hist.length === 0) {
      messages = [{ role: 'user', content: [...docBlocks, { type: 'text', text: question }] }];
    } else {
      const firstUserIdx = hist.findIndex(m => m.role === 'user');
      if (firstUserIdx === -1) {
        messages = [{ role: 'user', content: [...docBlocks, { type: 'text', text: question }] }];
      } else {
        const firstUser = hist[firstUserIdx];
        const firstUserText = typeof firstUser.content === 'string' ? firstUser.content : '[prior context]';
        messages = [
          { role: 'user', content: [...docBlocks, { type: 'text', text: firstUserText }] },
          ...hist.slice(firstUserIdx + 1),
          { role: 'user', content: question }
        ];
      }
    }

    const response = await client.beta.messages.create({
      model: RAG_MODEL,
      max_tokens: 2048,
      system: RAG_SYSTEM_PROMPT,
      messages,
      betas: ['files-api-2025-04-14']
    });

    logUsage({ feature: RAG_FEATURE, model: RAG_MODEL, response });

    // Extract answer text and group citations by filename (page-level)
    const textParts = [];
    const sourceMap = new Map(); // filename -> { filename, citations: [{start_page, end_page, quote}] }
    for (const block of response.content || []) {
      if (block.type === 'text') {
        textParts.push(block.text || '');
        for (const cit of block.citations || []) {
          let filename = cit.document_title;
          if (!filename && typeof cit.document_index === 'number' && docs[cit.document_index]) {
            filename = docs[cit.document_index].filename;
          }
          if (!filename) continue;
          if (!sourceMap.has(filename)) sourceMap.set(filename, { filename, citations: [] });
          const entry = sourceMap.get(filename);
          const dup = entry.citations.find(c =>
            c.start_page === cit.start_page_number &&
            c.end_page === cit.end_page_number &&
            c.quote === cit.cited_text
          );
          if (!dup) {
            entry.citations.push({
              start_page: cit.start_page_number ?? null,
              end_page: cit.end_page_number ?? null,
              quote: cit.cited_text || ''
            });
          }
        }
      }
    }
    const answer = textParts.join('\n').trim();

    // Fallback: if no structured citations, scan answer text for filename mentions
    if (sourceMap.size === 0) {
      for (const doc of docs) {
        const base = doc.filename.replace(/\.pdf$/i, '');
        if (answer.includes(base)) {
          sourceMap.set(doc.filename, { filename: doc.filename, citations: [] });
        }
      }
    }

    res.json({
      answer,
      sources: Array.from(sourceMap.values()),
      usage: response.usage,
      today_cents_after: todayRagCostCents()
    });
  } catch (err) {
    console.error('[ask] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/usage/daily', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);
    const rows = db.prepare(`
      SELECT date(timestamp) AS day, feature,
             COALESCE(SUM(cost_cents), 0) AS c,
             COUNT(*) AS n
      FROM api_usage
      WHERE date(timestamp) >= date('now', ?)
      GROUP BY date(timestamp), feature
      ORDER BY day DESC, feature
    `).all(`-${days - 1} days`);

    const byDay = {};
    for (const r of rows) {
      if (!byDay[r.day]) byDay[r.day] = { date: r.day, total_cents: 0, query_count: 0, by_feature: {} };
      byDay[r.day].by_feature[r.feature] = { cost_cents: r.c, query_count: r.n };
      byDay[r.day].total_cents += r.c;
      byDay[r.day].query_count += r.n;
    }
    const daily = Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date));
    res.json({ days, daily });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
