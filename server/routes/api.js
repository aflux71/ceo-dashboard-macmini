import express from 'express';
import { randomInt } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db/database.js';
import { loadKnowledge, getLoadedDocs, getKnowledgeStatus } from '../knowledge.js';
import { logUsage } from '../usage.js';
import { getLoyaltySignups } from '../sync/shopify.js';
import { netSalesCompany, netSalesByStore, netSalesCompanyYoY, netSalesByStoreYoY } from '../db/net_sales_queries.js';

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


// (Removed a duplicate /stats/ceo handler here — Express matched the first
//  registration above, so this second copy was dead code. Phase 2 will add
//  net-sales fields to that single handler via the net_sales_queries layer.)

// ── Toronto calendar-day helpers for daily_sales period bounds ────
// daily_sales.sale_date is a Toronto (DST-aware) YYYY-MM-DD; period windows
// must be expressed as those date strings, inclusive on both ends.
const _NET_TZ = 'America/Toronto';
const _netDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: _NET_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const torontoDay = (d = new Date()) => _netDayFmt.format(d);
const torontoDaysAgo = (n) => torontoDay(new Date(Date.now() - n * 86400000));

// ── /api/stats/ceo-net ────────────────────────────────────────────
// PARALLEL net-sales CEO tiles (Phase 2). Sourced from daily_sales via the
// net_sales_queries layer. NOT yet wired into the frontend — the live gross
// /stats/ceo above is untouched. Once validated side-by-side vs Shopify, the
// dashboard flips to this. Net = primary; gross kept as a secondary field for
// the transition. Margin/AOV use the cost-bearing / excluded-txn rollups.
router.get('/stats/ceo-net', (req, res) => {
  try {
    const today = torontoDay();
    const start30 = torontoDaysAgo(29);                 // 30-day inclusive window
    const startYTD = `${today.slice(0, 4)}-01-01`;

    const y30 = netSalesCompanyYoY(start30, today);
    const yYTD = netSalesCompanyYoY(startYTD, today);
    const c30 = y30.current;
    const cYTD = yYTD.current;

    // Gross (secondary, same basis as the live /stats/ceo) for transition display.
    const grossSince = (iso) => db.prepare(
      'SELECT COALESCE(SUM(CAST(total_price AS REAL)),0) AS rev FROM orders WHERE created_at >= ?'
    ).get(iso).rev;
    const rev30 = grossSince(new Date(Date.now() - 30 * 86400000).toISOString());
    const revYTD = grossSince(new Date(new Date().getFullYear(), 0, 1).toISOString());

    const dayOfYear = Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / 86400000);

    // Operational tiles (reused from the live endpoint's queries).
    const prods = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status='active'").get();
    const inv = db.prepare('SELECT COALESCE(SUM(available),0) AS u FROM inventory').get();
    const unf = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE fulfillment_status IS NULL AND created_at >= ?")
      .get(new Date(Date.now() - 14 * 86400000).toISOString());
    const lastSync = db.prepare("SELECT created_at FROM sync_log WHERE status='success' ORDER BY id DESC LIMIT 1").get();

    res.json({
      // primary: NET (from daily_sales)
      net_30d: c30.net_sales, discounts_30d: c30.discounts, gp_30d: c30.gross_profit,
      gm_30d: c30.gross_margin_pct, orders_30d: c30.orders, aov_30d: c30.aov_retail,
      no_cost_net_30d: c30.no_cost_net,
      net_ytd: cYTD.net_sales, discounts_ytd: cYTD.discounts, gp_ytd: cYTD.gross_profit,
      gm_ytd: cYTD.gross_margin_pct, orders_ytd: cYTD.orders, aov_ytd: cYTD.aov_retail,
      no_cost_net_ytd: cYTD.no_cost_net,
      annual_run_rate_net: Math.round((cYTD.net_sales / dayOfYear) * 365),
      // day-of-week-matched LY (364-day shift) + deltas
      net_30d_ly: y30.ly.net_sales, gp_30d_ly: y30.ly.gross_profit,
      net_30d_delta_pct: y30.delta_pct.net_sales, gp_30d_delta_pct: y30.delta_pct.gross_profit,
      net_ytd_ly: yYTD.ly.net_sales, gp_ytd_ly: yYTD.ly.gross_profit,
      net_ytd_delta_pct: yYTD.delta_pct.net_sales, gp_ytd_delta_pct: yYTD.delta_pct.gross_profit,
      ly_windows: { d30: y30.ly_window, ytd: yYTD.ly_window },
      // secondary: GROSS (transition only)
      rev_30d: Math.round(rev30 * 100) / 100,
      rev_ytd: Math.round(revYTD * 100) / 100,
      // operational
      active_products: prods.c, inventory_units: inv.u, unfulfilled: unf.c,
      last_sync: lastSync?.created_at || null, day_of_year: dayOfYear,
      windows: { d30: [start30, today], ytd: [startYTD, today] }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── /api/revenue/by-store-net ─────────────────────────────────────
// PARALLEL net-sales store table (Phase 2). period = '30d' | 'ytd' (Toronto days).
router.get('/revenue/by-store-net', (req, res) => {
  try {
    const today = torontoDay();
    const { period, date_from, date_to } = req.query;
    let from, to;
    if (date_from && date_to) {            // arbitrary range (from the dashboard period selector)
      from = torontoDay(new Date(date_from));
      to = torontoDay(new Date(date_to));
    } else if (period === 'ytd') {
      from = `${today.slice(0, 4)}-01-01`; to = today;
    } else {
      from = torontoDaysAgo(29); to = today;
    }
    const byStore = netSalesByStoreYoY(from, to);
    // Back-compat aliases so the existing store-table renderer maps cleanly; the
    // partial-aware vs_ly_pct is the like-for-like delta when a store's LY is partial.
    const stores = byStore.stores.map(s => ({
      ...s,
      location_name: s.store_name,
      revenue: s.net_sales,
      period_revenue: s.net_sales,
      ly_revenue: s.ly_net_sales,
      vs_ly_pct: s.ly_partial ? s.ll_net_delta_pct : s.net_delta_pct
    }));
    const co = netSalesCompanyYoY(from, to);
    const asTotal = (c) => ({ revenue: c.net_sales, orders: c.orders, aov: c.aov_retail });
    res.json({
      period: period || 'custom', from, to, ly_window: byStore.ly_window, stores, company: co,
      // back-compat aliases for the existing store-table renderer (net-based):
      total: asTotal(co.current),
      ytd_total: asTotal(co.current), ly_total: asTotal(co.ly), vs_ly_pct: co.delta_pct.net_sales
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── /api/stats/loyalty-signups ────────────────────────────────────
// BON loyalty signups by signup-location, via the Shopify Admin GraphQL API.
// Live query (tags live on customers, not the local mirror). data_since
// 2026-06-09 (location tags started fresh that date). Requires read_customers.
router.get('/stats/loyalty-signups', async (req, res) => {
  try {
    res.json(await getLoyaltySignups());
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

// POST /api/store-access/:id/rotate-shift — rotate the per-store SHIFT code
router.post('/store-access/:id/rotate-shift', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const code = 'S' + randomInt(10000, 100000); // e.g. S48213 — distinct from store code
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]; // +30 days
    await d1Query(
      'UPDATE store_access SET shift_code = ?, shift_code_expires_at = ? WHERE id = ?',
      [code, expiresAt, req.params.id]
    );
    res.json({ ok: true, shift_code: code, shift_code_expires_at: expiresAt });
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

// ── Data quality: missing product costs ──────────────────────────
// Live checklist to get COGS entered in Shopify (no_cost_net distorts GP/margin).
// FIXABLE = real variants with no unitCost, deep-linked straight to their cost
// field; auto-shrinks as costs land (re-checked live against Shopify each load).
// INTENTIONALLY COSTLESS = no-variant custom lines + human-acknowledged services
// (U-pick / farm admissions) — flagged so they stop sitting on the fix-list.
function ensureCostAckSchema() {
  db.exec(`CREATE TABLE IF NOT EXISTS cost_acknowledged (
    item_key TEXT PRIMARY KEY, note TEXT, acknowledged_at TEXT DEFAULT (datetime('now'))
  );`);
}

// Current unitCost + product id per variant, batched via Admin GraphQL. Best-effort.
async function shopifyVariantCosts(variantIds) {
  const out = new Map();
  if (!variantIds.length) return out;
  const url = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`;
  const headers = { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN, 'Content-Type': 'application/json' };
  for (let i = 0; i < variantIds.length; i += 100) {
    const ids = variantIds.slice(i, i + 100).map(v => `gid://shopify/ProductVariant/${v}`);
    const q = `query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id sku title inventoryItem{ unitCost{ amount } } product{ id title } } } }`;
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query: q, variables: { ids } }) });
    const j = await r.json();
    for (const n of (j.data?.nodes || [])) {
      if (!n?.id) continue;
      const vid = n.id.split('/').pop();
      out.set(vid, {
        cost: n.inventoryItem?.unitCost?.amount != null ? parseFloat(n.inventoryItem.unitCost.amount) : null,
        product_id: n.product?.id ? n.product.id.split('/').pop() : null,
        product_title: n.product?.title || null,
        sku: n.sku || null, title: n.title || null
      });
    }
  }
  return out;
}

router.get('/data-quality/missing-costs', async (req, res) => {
  try {
    ensureCostAckSchema();
    const store = process.env.SHOPIFY_STORE_URL;
    const tot = db.prepare('SELECT ROUND(SUM(net_sales),2) net, ROUND(SUM(no_cost_net),2) no_cost FROM daily_sales').get();

    const cands = db.prepare(`
      SELECT variant_id, MAX(sku) sku, MAX(title) title, ROUND(SUM(no_cost_net),2) no_cost_net,
             COUNT(DISTINCT sale_date) days, MAX(sale_date) last_seen,
             GROUP_CONCAT(DISTINCT store_name) locations
      FROM missing_cost_ledger WHERE is_fixable = 1 AND variant_id IS NOT NULL
      GROUP BY variant_id ORDER BY SUM(no_cost_net) DESC`).all();

    const vids = cands.map(c => c.variant_id);
    const unitsMap = new Map();
    if (vids.length) {
      const ph = vids.map(() => '?').join(',');
      for (const r of db.prepare(`SELECT variant_id, SUM(quantity) units, MAX(product_id) product_id FROM order_line_items WHERE variant_id IN (${ph}) GROUP BY variant_id`).all(...vids))
        unitsMap.set(r.variant_id, r);
    }

    const ack = new Set(db.prepare('SELECT item_key FROM cost_acknowledged').all().map(r => r.item_key));
    let live = new Map();
    try { live = await shopifyVariantCosts(vids); } catch (e) { /* fall back to ledger data */ }

    const fixable = [], nowCosted = [], acknowledged = [];
    for (const c of cands) {
      const l = live.get(c.variant_id);
      const u = unitsMap.get(c.variant_id) || {};
      const product_id = l?.product_id || u.product_id || null;
      const row = {
        variant_id: c.variant_id, sku: l?.sku || c.sku,
        title: l?.product_title || c.title || l?.title,   // product name, not "Default Title"
        variant_title: l?.title || null, no_cost_net: c.no_cost_net,
        units: u.units || null, days: c.days, last_seen: c.last_seen, locations: c.locations,
        product_id,
        admin_link: product_id
          ? `https://${store}/admin/products/${product_id}/variants/${c.variant_id}`
          : `https://${store}/admin/products?selectedView=all&query=${encodeURIComponent(c.sku || c.title || '')}`,
        current_cost: l ? l.cost : undefined
      };
      if (ack.has(c.variant_id)) acknowledged.push(row);
      else if (l && l.cost != null) nowCosted.push(row);   // cost now set in Shopify → off the fix-list
      else fixable.push(row);
    }

    const costlessLines = db.prepare(`
      SELECT item_key, MAX(title) title, ROUND(SUM(no_cost_net),2) no_cost_net, COUNT(DISTINCT sale_date) days
      FROM missing_cost_ledger WHERE is_fixable = 0 GROUP BY item_key ORDER BY SUM(no_cost_net) DESC`).all();

    const fixableSum = Math.round(fixable.reduce((s, r) => s + r.no_cost_net, 0) * 100) / 100;
    const pct = (x) => tot.net ? Math.round((x / tot.net) * 1000) / 10 : 0;
    res.json({
      window: 'cumulative (2025-01-01 → latest daily_sales)',
      live_check: live.size > 0,
      headline: {
        net: tot.net, no_cost_net: tot.no_cost,
        no_cost_pct: pct(tot.no_cost),
        projected_pct_after_fixable: pct(tot.no_cost - fixableSum),
        fixable_no_cost: fixableSum, fixable_count: fixable.length,
        now_costed_count: nowCosted.length,
        costless_count: costlessLines.length + acknowledged.length
      },
      fixable, now_costed: nowCosted, acknowledged, intentionally_costless: costlessLines
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mark a variant as intentionally $0-cost (or undo). Admin-pin gated.
router.post('/data-quality/missing-costs/ack', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    ensureCostAckSchema();
    const { item_key, note, undo } = req.body || {};
    if (!item_key) return res.status(400).json({ error: 'item_key required' });
    if (undo) db.prepare('DELETE FROM cost_acknowledged WHERE item_key = ?').run(String(item_key));
    else db.prepare(`INSERT INTO cost_acknowledged (item_key, note) VALUES (?, ?)
                     ON CONFLICT(item_key) DO UPDATE SET note = excluded.note`).run(String(item_key), note || null);
    res.json({ ok: true, item_key: String(item_key), acknowledged: !undo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════
// PORTAL TOTALS — admin-only reporting over staff submissions
// Reads: daily_kpi (staff-submitted), kpi_targets, daily_sales (reconciled
// Shopify net). READ-ONLY — every handler is a SELECT. PIN-gated via
// checkAdminPin (X-Admin-Pin header). See NEOB-PORTAL-TOTALS-BUILD-SPEC.md.
// ──────────────────────────────────────────────────────────────────
// Canonical portal stores (same set the portal/targets use).
const PORTAL_STORES = ADMIN_STORES; // ['Queen Street','Flower Farm','Elora','Stratford','Bracebridge','Online/DTC']

// Mapping canonical store -> daily_sales channel names for Shopify-net
// reconciliation. The 5 physical stores map 1:1; Online/DTC is split across
// three fulfilment channels in daily_sales, so we sum them.
const SHOPIFY_CHANNELS = {
  'Queen Street': ['Queen Street'],
  'Flower Farm': ['Flower Farm'],
  'Elora': ['Elora'],
  'Stratford': ['Stratford'],
  'Bracebridge': ['Bracebridge'],
  'Online/DTC': ['Online/DTC', '3PL-Online Orders', 'Ecommerce Warehouse'],
};

// Pure date-string math (UTC midnight, DST-safe — date-only arithmetic).
function ptAddDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
// Monday-start week containing dateStr.
function ptWeekStart(dateStr) {
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return ptAddDays(dateStr, -((dow + 6) % 7));
}
function ptMonthStart(dateStr) { return dateStr.slice(0, 7) + '-01'; }
function ptMonthEnd(dateStr) {
  const d = new Date(dateStr.slice(0, 7) + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0); // last day of the original month
  return d.toISOString().slice(0, 10);
}

// Sum reconciled Shopify net + orders for a canonical store over [from,to] inclusive.
function shopifyNetFor(store, from, to) {
  const chans = SHOPIFY_CHANNELS[store] || [store];
  const ph = chans.map(() => '?').join(',');
  return db.prepare(
    `SELECT COALESCE(SUM(net_sales),0) AS net, COALESCE(SUM(orders),0) AS orders
       FROM daily_sales WHERE store_name IN (${ph}) AND sale_date >= ? AND sale_date <= ?`
  ).get(...chans, from, to);
}
// Sum submitted revenue + transactions from daily_kpi for a store over [from,to].
function submittedFor(store, from, to) {
  return db.prepare(
    `SELECT SUM(revenue) AS revenue, SUM(transactions) AS transactions, COUNT(*) AS days
       FROM daily_kpi WHERE store_name = ? AND entry_date >= ? AND entry_date <= ?`
  ).get(store, from, to);
}
// Sum revenue target from kpi_targets for a store over [from,to] (elapsed days only).
function targetFor(store, from, to) {
  return db.prepare(
    `SELECT COALESCE(SUM(revenue_target),0) AS target
       FROM kpi_targets WHERE store_name = ? AND target_date >= ? AND target_date <= ?`
  ).get(store, from, to).target;
}
const pctVar = (actual, target) => (target > 0 ? ((actual - target) / target) * 100 : null);
const pctGap = (submitted, shopify) => (shopify > 0 ? ((submitted - shopify) / shopify) * 100 : null);

// GET /api/portal-totals/today
router.get('/portal-totals/today', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const today = torontoDay();
    const kpiStmt = db.prepare(
      'SELECT revenue, submitted_at, transactions, aov, staff_name FROM daily_kpi WHERE store_name = ? AND entry_date = ?'
    );
    const tgtStmt = db.prepare(
      'SELECT revenue_target FROM kpi_targets WHERE store_name = ? AND target_date = ?'
    );
    const stores = PORTAL_STORES.map((store) => {
      const k = kpiStmt.get(store, today);
      const t = tgtStmt.get(store, today);
      const sh = shopifyNetFor(store, today, today);
      return {
        store,
        submitted: k ? k.revenue : null,
        submitted_at: k ? k.submitted_at : null,
        transactions: k ? k.transactions : null,
        aov: k ? k.aov : null,
        target: t ? t.revenue_target : null,
        shopify_net: sh.net,
      };
    });
    const reported = stores.filter((s) => s.submitted !== null);
    const lastSubmission = reported
      .map((s) => s.submitted_at)
      .filter(Boolean)
      .sort()
      .pop() || null;
    res.json({
      date: today,
      reported_count: reported.length,
      store_count: stores.length,
      last_submission_at: lastSubmission,
      stores,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/portal-totals/running?period=wtd|mtd
router.get('/portal-totals/running', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const period = req.query.period === 'mtd' ? 'mtd' : 'wtd';
    const today = torontoDay();
    const start = period === 'mtd' ? ptMonthStart(today) : ptWeekStart(today);

    const rows = PORTAL_STORES.map((store) => {
      const sub = submittedFor(store, start, today);
      const submitted = sub.revenue; // null if no submissions
      const target = targetFor(store, start, today);
      const sh = shopifyNetFor(store, start, today);
      const subVal = submitted || 0;
      return {
        store,
        submitted,                    // null when nothing submitted
        target,
        shopify_net: sh.net,
        variance_dollars: submitted === null ? null : subVal - target,
        variance_pct: submitted === null ? null : pctVar(subVal, target),
      };
    });

    // All-stores total.
    const totSubmittedRaw = rows.reduce((a, r) => a + (r.submitted || 0), 0);
    const anySubmitted = rows.some((r) => r.submitted !== null);
    const totTarget = rows.reduce((a, r) => a + (r.target || 0), 0);
    const totShopify = rows.reduce((a, r) => a + (r.shopify_net || 0), 0);
    const total = {
      store: 'All Stores',
      submitted: anySubmitted ? totSubmittedRaw : null,
      target: totTarget,
      shopify_net: totShopify,
      variance_dollars: anySubmitted ? totSubmittedRaw - totTarget : null,
      variance_pct: anySubmitted ? pctVar(totSubmittedRaw, totTarget) : null,
    };

    res.json({ period, period_start: start, through: today, stores: rows, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Shared builder for history / export.
function portalHistoryRows(query) {
  const today = torontoDay();
  const from = (query.from && String(query.from)) || torontoDaysAgo(29);
  const to = (query.to && String(query.to)) || today;
  const store = query.store && PORTAL_STORES.includes(String(query.store)) ? String(query.store) : null;

  const params = [from, to];
  let sql = 'SELECT store_name, entry_date, revenue, transactions, aov, staff_name, submitted_at FROM daily_kpi WHERE entry_date >= ? AND entry_date <= ?';
  if (store) { sql += ' AND store_name = ?'; params.push(store); }
  sql += ' ORDER BY entry_date DESC, store_name LIMIT 500';
  const kpiRows = db.prepare(sql).all(...params);

  const tgtStmt = db.prepare('SELECT revenue_target FROM kpi_targets WHERE store_name = ? AND target_date = ?');
  return kpiRows.map((r) => {
    const t = tgtStmt.get(r.store_name, r.entry_date);
    const target = t ? t.revenue_target : null;
    const sh = shopifyNetFor(r.store_name, r.entry_date, r.entry_date);
    return {
      date: r.entry_date,
      store: r.store_name,
      submitted: r.revenue,
      submitted_by: r.staff_name,
      submitted_at: r.submitted_at,
      target,
      variance_pct: target ? pctVar(r.revenue, target) : null,
      shopify_net: sh.net,
      gap_dollars: r.revenue - sh.net,
      gap_pct: pctGap(r.revenue, sh.net),
      transactions: r.transactions,
      aov: r.aov,
    };
  });
}

// GET /api/portal-totals/history?store=&from=&to=
router.get('/portal-totals/history', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    res.json({ rows: portalHistoryRows(req.query) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/portal-totals/rollup?grain=week|month&store=
router.get('/portal-totals/rollup', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const grain = req.query.grain === 'month' ? 'month' : 'week';
    const store = req.query.store && PORTAL_STORES.includes(String(req.query.store)) ? String(req.query.store) : null;
    const stores = store ? [store] : PORTAL_STORES;
    const today = torontoDay();

    // Build period buckets oldest -> newest.
    const buckets = [];
    if (grain === 'week') {
      const thisMonday = ptWeekStart(today);
      for (let i = 11; i >= 0; i--) {
        const start = ptAddDays(thisMonday, -7 * i);
        const end = ptAddDays(start, 6);
        buckets.push({ label: start, start, end });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const anchor = new Date(ptMonthStart(today) + 'T00:00:00Z');
        anchor.setUTCMonth(anchor.getUTCMonth() - i);
        const start = anchor.toISOString().slice(0, 10);
        buckets.push({ label: start.slice(0, 7), start, end: ptMonthEnd(start) });
      }
    }

    const subStmt = db.prepare(
      `SELECT SUM(revenue) AS revenue, SUM(transactions) AS transactions
         FROM daily_kpi WHERE store_name IN (${stores.map(() => '?').join(',')})
         AND entry_date >= ? AND entry_date <= ?`
    );

    const rows = buckets.map((b) => {
      const sub = subStmt.get(...stores, b.start, b.end);
      const target = stores.reduce((a, s) => a + targetFor(s, b.start, b.end), 0);
      const shopify = stores.reduce((a, s) => a + shopifyNetFor(s, b.start, b.end).net, 0);
      const submitted = sub.revenue; // null if none
      const txns = sub.transactions || 0;
      return {
        period: b.label,
        start: b.start,
        end: b.end,
        submitted,
        target,
        variance_pct: submitted === null ? null : pctVar(submitted, target),
        shopify_net: shopify,
        transactions: txns,
        aov: txns > 0 && submitted ? submitted / txns : null,
      };
    });

    res.json({ grain, store: store || 'All Stores', rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/portal-totals/period?view=week|month&offset=0&store=
// Primary feed for portal-totals.html: per-store daily grid of target + actual
// + submitter name for one week (Mon–Sun) or one calendar month. offset shifts
// the window (0=current, -1=previous, +1=next). Includes elapsed-only running
// totals per store and an all-stores total.
router.get('/portal-totals/period', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const view = req.query.view === 'month' ? 'month' : (req.query.view === 'day' ? 'day' : 'week');
    let offset = parseInt(req.query.offset, 10);
    if (!Number.isFinite(offset)) offset = 0;
    const store = req.query.store && PORTAL_STORES.includes(String(req.query.store)) ? String(req.query.store) : null;
    const stores = store ? [store] : PORTAL_STORES;
    const today = torontoDay();

    // Resolve window bounds + label.
    let start, end, label;
    if (view === 'day') {
      start = ptAddDays(today, offset);
      end = start;
      label = start;
    } else if (view === 'week') {
      start = ptAddDays(ptWeekStart(today), offset * 7);
      end = ptAddDays(start, 6);
      label = `${start} – ${end}`;
    } else {
      const anchor = new Date(ptMonthStart(today) + 'T00:00:00Z');
      anchor.setUTCMonth(anchor.getUTCMonth() + offset);
      start = anchor.toISOString().slice(0, 10);
      end = ptMonthEnd(start);
      label = start.slice(0, 7);
    }

    // All days in the window with an elapsed flag.
    const days = [];
    for (let d = start; d <= end; d = ptAddDays(d, 1)) days.push({ date: d, is_elapsed: d <= today });

    // Pull targets + submissions for the window in two scans, then assemble.
    const inStores = stores.map(() => '?').join(',');
    const tgtRows = db.prepare(
      `SELECT store_name, target_date, revenue_target FROM kpi_targets
        WHERE store_name IN (${inStores}) AND target_date >= ? AND target_date <= ?`
    ).all(...stores, start, end);
    const kpiRows = db.prepare(
      `SELECT store_name, entry_date, revenue, transactions, aov, staff_name, submitted_at FROM daily_kpi
        WHERE store_name IN (${inStores}) AND entry_date >= ? AND entry_date <= ?`
    ).all(...stores, start, end);

    const tgtMap = new Map();  // store|date -> target
    for (const t of tgtRows) tgtMap.set(t.store_name + '|' + t.target_date, t.revenue_target);
    const kpiMap = new Map();  // store|date -> row
    for (const k of kpiRows) kpiMap.set(k.store_name + '|' + k.entry_date, k);

    const rows = [];       // every store-day cell that has a target or an actual
    const summary = [];
    let totTargetElapsed = 0, totTargetFull = 0, totActual = 0, totAnyActual = false;

    for (const s of stores) {
      let tgtElapsed = 0, tgtFull = 0, actual = 0, anyActual = false, daysSubmitted = 0;
      for (const day of days) {
        const key = s + '|' + day.date;
        const target = tgtMap.has(key) ? tgtMap.get(key) : null;
        const k = kpiMap.get(key);
        if (target === null && !k) continue;
        rows.push({
          date: day.date,
          store: s,
          is_elapsed: day.is_elapsed,
          target,
          actual: k ? k.revenue : null,
          submitted_by: k ? k.staff_name : null,
          submitted_at: k ? k.submitted_at : null,
          transactions: k ? k.transactions : null,
          aov: k ? k.aov : null,
        });
        if (target !== null) { tgtFull += target; if (day.is_elapsed) tgtElapsed += target; }
        if (k) { actual += k.revenue; anyActual = true; daysSubmitted++; }
      }
      const actualVal = anyActual ? actual : null;
      summary.push({
        store: s,
        target_elapsed: tgtElapsed,
        target_full: tgtFull,
        actual: actualVal,
        days_submitted: daysSubmitted,
        variance_dollars: anyActual ? actual - tgtElapsed : null,
        variance_pct: anyActual ? pctVar(actual, tgtElapsed) : null,
      });
      totTargetElapsed += tgtElapsed; totTargetFull += tgtFull;
      if (anyActual) { totActual += actual; totAnyActual = true; }
    }

    const total = {
      store: 'All Stores',
      target_elapsed: totTargetElapsed,
      target_full: totTargetFull,
      actual: totAnyActual ? totActual : null,
      variance_dollars: totAnyActual ? totActual - totTargetElapsed : null,
      variance_pct: totAnyActual ? pctVar(totActual, totTargetElapsed) : null,
    };

    res.json({ view, offset, period_start: start, period_end: end, label, today, days, stores, rows, summary, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/portal-totals/export?store=&from=&to=  -> CSV attachment
router.get('/portal-totals/export', (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const rows = portalHistoryRows(req.query);
    const headers = ['Date', 'Store', 'Staff Entered', 'Target', 'Variance %', 'Shopify Net', 'Gap $', 'Gap %', 'Transactions', 'AOV'];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const round2 = (v) => (v === null || v === undefined ? '' : Math.round(v * 100) / 100);
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        r.date, esc(r.store), round2(r.submitted), round2(r.target), round2(r.variance_pct),
        round2(r.shopify_net), round2(r.gap_dollars), round2(r.gap_pct), r.transactions ?? '', round2(r.aov),
      ].join(','));
    }
    const csv = lines.join('\r\n') + '\r\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="portal-totals-${torontoDay()}.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
