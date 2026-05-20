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

export default router;
