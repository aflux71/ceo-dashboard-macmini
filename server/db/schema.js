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

    CREATE TABLE IF NOT EXISTS bundle_products (
      sku TEXT PRIMARY KEY,
      product_id TEXT,
      title TEXT,
      norm_title TEXT,
      is_pos INTEGER DEFAULT 0,
      is_dtc INTEGER DEFAULT 0,
      first_seen TEXT,
      last_seen TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bundle_product_id ON bundle_products(product_id);
    CREATE INDEX IF NOT EXISTS idx_bundle_norm_title ON bundle_products(norm_title);

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

    -- Accumulator of every product ever tagged as a bundle. Keyed by SKU
    -- (stable across the monthly bundle reset, which recreates products with
    -- new IDs and nulls deleted products' line-item product_ids). Refreshed
    -- each sync from currently-tagged products; rows are never removed, so
    -- historical orders stay attributable after a reset.
    CREATE TABLE IF NOT EXISTS bundle_products (
      sku TEXT PRIMARY KEY,
      product_id TEXT,
      title TEXT,
      norm_title TEXT,
      is_pos INTEGER DEFAULT 0,
      is_dtc INTEGER DEFAULT 0,
      first_seen TEXT,
      last_seen TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bundle_product_id ON bundle_products(product_id);
    CREATE INDEX IF NOT EXISTS idx_bundle_norm_title ON bundle_products(norm_title);
  `);
}

// Idempotent schema for the net-sales migration (Phase 1). Additive only —
// creates the reconstruction target table and a data-quality companion; touches
// nothing existing. Safe to call on every sync. One row per store per day.
//
// Net-sales model (reconciled to the penny against Shopify Analytics, 2026-07-18):
//   net_sales        = full net = gross(Σ price*qty, pre-tax, ex gift cards)
//                      − discounts − returns (returns attributed to processed date/location).
//   no_cost_net      = net of sold items whose variant unitCost is null (Shopify's profit
//                      report EXCLUDES these). Symmetric on returns of no-cost items.
//   cost_bearing_net = net_sales − no_cost_net   (Shopify's profit-report net).
//   gross_profit     = cost_bearing_net − cogs.
//   gross_margin_pct = gross_profit / cost_bearing_net   (null if base ≤ 0).
// Computing margin on cost_bearing_net (NOT net_sales) is what matches Shopify's 39.0%;
// net_sales − cogs would overstate it (assigns no-cost items zero cost).
export function ensureDailySalesSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_sales (
      store_name           TEXT NOT NULL,       -- normalized display name
      sale_date            TEXT NOT NULL,       -- YYYY-MM-DD, America/Toronto
      net_sales            REAL,                -- FULL net (headline revenue)
      discounts            REAL,
      cogs                 REAL,
      no_cost_net          REAL DEFAULT 0,      -- net of items with no recorded cost (data quality)
      gross_profit         REAL,                -- (net_sales − no_cost_net) − cogs
      gross_margin_pct     REAL,                -- gross_profit / (net_sales − no_cost_net)
      net_items            INTEGER,             -- units sold − units returned (processed date)
      orders               INTEGER,             -- full order count (for AOV/reporting)
      aov_excluded_orders  INTEGER DEFAULT 0,   -- 0..5 sub-$15-NET txns dropped from AOV that day
      aov_excluded_net     REAL    DEFAULT 0,   -- net of those excluded txns
      source               TEXT,                -- 'orders_reconstruct' | 'backfill'
      synced_at            TEXT,
      PRIMARY KEY (store_name, sale_date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_sales_date ON daily_sales(sale_date);

    -- SKUs sold with no cost recorded in Shopify — so they can be fixed there.
    -- Accumulates across the backfill window; refreshed each sync.
    CREATE TABLE IF NOT EXISTS missing_cost_items (
      sku               TEXT PRIMARY KEY,
      title             TEXT,
      last_seen_date    TEXT,        -- most recent sale_date it appeared with null cost
      last_seen_store   TEXT,
      total_no_cost_net REAL DEFAULT 0,  -- accumulated net sold with no cost
      updated_at        TEXT
    );
  `);
}
