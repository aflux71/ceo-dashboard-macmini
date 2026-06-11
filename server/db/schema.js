import db from './database.js';

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT,
      vendor TEXT,
      product_type TEXT,
      status TEXT,
      tags TEXT,
      created_at TEXT,
      updated_at TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      title TEXT,
      sku TEXT,
      inventory_quantity INTEGER,
      location_id TEXT,
      updated_at TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT,
      email TEXT,
      financial_status TEXT,
      fulfillment_status TEXT,
      total_price TEXT,
      currency TEXT,
      location_id TEXT,
      location_name TEXT,
      source_name TEXT,
      tags TEXT,
      is_bundle_pos INTEGER DEFAULT 0,
      is_bundle_dtc INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_line_items (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      product_id TEXT,
      variant_id TEXT,
      title TEXT,
      sku TEXT,
      quantity INTEGER,
      price TEXT,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_oli_order ON order_line_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_oli_product ON order_line_items(product_id);

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT,
      status TEXT,
      records_synced INTEGER,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('Database schema initialized');
}

// Idempotent migration for Phase 1 bundle capture. Safe to call on every sync:
// guarded ALTERs only fire on columns/tables that don't yet exist. Needed
// because initSchema() is not wired into boot — the live `orders` table was
// created/altered manually, so additive changes must be applied at runtime.
export function ensureBundleSchema() {
  const cols = db.prepare(`PRAGMA table_info(orders)`).all().map(c => c.name);
  if (!cols.includes('tags')) {
    db.exec(`ALTER TABLE orders ADD COLUMN tags TEXT`);
  }
  if (!cols.includes('is_bundle_pos')) {
    db.exec(`ALTER TABLE orders ADD COLUMN is_bundle_pos INTEGER DEFAULT 0`);
  }
  if (!cols.includes('is_bundle_dtc')) {
    db.exec(`ALTER TABLE orders ADD COLUMN is_bundle_dtc INTEGER DEFAULT 0`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_line_items (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      product_id TEXT,
      variant_id TEXT,
      title TEXT,
      sku TEXT,
      quantity INTEGER,
      price TEXT,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_oli_order ON order_line_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_oli_product ON order_line_items(product_id);
  `);
}
