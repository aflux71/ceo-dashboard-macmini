import express from 'express';
import db from '../db/database.js';

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
    const prods = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'active'").get();
    const inv = db.prepare('SELECT COALESCE(SUM(available),0) AS u FROM inventory').get();
    const unf = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE fulfillment_status IS NULL OR fulfillment_status = 'partial'").get();
    const lastSync = db.prepare("SELECT created_at FROM sync_log WHERE status='success' ORDER BY id DESC LIMIT 1").get();

    const dayOfYear = Math.ceil((Date.now() - new Date(new Date().getFullYear(),0,1)) / 86400000);
    const annualRunRate = Math.round((sYTD.rev / dayOfYear) * 365);

    res.json({
      rev_30d: Math.round(s30.rev * 100) / 100,
      orders_30d: s30.cnt,
      aov_30d: s30.cnt > 0 ? Math.round(s30.rev / s30.cnt * 100) / 100 : 0,
      rev_ytd: Math.round(sYTD.rev * 100) / 100,
      orders_ytd: sYTD.cnt,
      aov_ytd: sYTD.cnt > 0 ? Math.round(sYTD.rev / sYTD.cnt * 100) / 100 : 0,
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
    const prods = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'active'").get();
    const inv = db.prepare('SELECT COALESCE(SUM(available),0) AS u FROM inventory').get();
    const unf = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE fulfillment_status IS NULL OR fulfillment_status = 'partial'").get();
    const lastSync = db.prepare("SELECT created_at FROM sync_log WHERE status='success' ORDER BY id DESC LIMIT 1").get();

    const dayOfYear = Math.ceil((Date.now() - new Date(new Date().getFullYear(),0,1)) / 86400000);
    const annualRunRate = Math.round((sYTD.rev / dayOfYear) * 365);

    res.json({
      rev_30d: Math.round(s30.rev * 100) / 100,
      orders_30d: s30.cnt,
      aov_30d: s30.cnt > 0 ? Math.round(s30.rev / s30.cnt * 100) / 100 : 0,
      rev_ytd: Math.round(sYTD.rev * 100) / 100,
      orders_ytd: sYTD.cnt,
      aov_ytd: sYTD.cnt > 0 ? Math.round(sYTD.rev / sYTD.cnt * 100) / 100 : 0,
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

export default router;
