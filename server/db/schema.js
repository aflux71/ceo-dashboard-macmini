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
      sale_date            TEXT NOT NULL,       -- YYYY-MM-DD, America/Toronto (DST-aware, IANA tz)
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
  `);

  // Migration: earlier version created missing_cost_items as a SKU-keyed TABLE.
  // Re-key to a per-(item,day,store) ledger so no-SKU custom lines don't collide
  // on NULL and re-runs don't double-count. Only drop it if it's still a table.
  const mci = db.prepare(
    `SELECT type FROM sqlite_master WHERE name = 'missing_cost_items'`
  ).get();
  if (mci && mci.type === 'table') db.exec(`DROP TABLE missing_cost_items`);

  db.exec(`
    -- One row per (item, sale_date, store) of net sold with NO recorded cost.
    -- item_key is a surrogate: the variant id when present, else 'custom:<title>'
    -- for cashier-entered custom POS lines (no variant/SKU). Range-delete +
    -- reinsert on each sync keeps totals idempotent.
    CREATE TABLE IF NOT EXISTS missing_cost_ledger (
      item_key     TEXT NOT NULL,     -- variant_id, or 'custom:<norm title>'
      sale_date    TEXT NOT NULL,
      store_name   TEXT NOT NULL,
      variant_id   TEXT,              -- null for custom lines
      sku          TEXT,
      title        TEXT,
      is_fixable   INTEGER DEFAULT 0, -- 1 = real variant w/ missing cost (fixable in Shopify)
                                      -- 0 = inherently-costless custom line
      no_cost_net  REAL DEFAULT 0,
      PRIMARY KEY (item_key, sale_date, store_name)
    );
    CREATE INDEX IF NOT EXISTS idx_mcl_date ON missing_cost_ledger(sale_date);

    -- Rolled-up view: one row per item with accumulated no-cost net. Always
    -- consistent with the ledger (no separate write path to drift).
    DROP VIEW IF EXISTS missing_cost_items;
    CREATE VIEW missing_cost_items AS
      SELECT item_key,
             MAX(variant_id)                 AS variant_id,
             MAX(sku)                         AS sku,
             MAX(title)                       AS title,
             MAX(is_fixable)                  AS is_fixable,
             MAX(sale_date)                   AS last_seen_date,
             COUNT(DISTINCT sale_date)        AS days_seen,
             ROUND(SUM(no_cost_net), 2)       AS total_no_cost_net
        FROM missing_cost_ledger
       GROUP BY item_key;
  `);
}

// ── Admin edit audit (Round 2 item 5) ────────────────────────────────────────
// Admin corrections to daily entries OVERWRITE the value, but every change is
// audited. The audit row and the value change are written in ONE transaction —
// a failed audit must roll the edit back, so a value can never change without a
// record of who changed it, when, and from what.
//
// The trail is append-only: a correction to a correction adds a row, it never
// updates or deletes one. That is what makes the ORIGINAL staff-entered value
// recoverable — replay the chain for a (entry_date, store_name, field) and the
// oldest row's old_value is what the staff member actually submitted.
//
// Lazily called (like ensureBundleSchema / ensureDailySalesSchema) because
// initSchema() is not wired into boot. Idempotent.
export function ensureEntryEditsSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_entry_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      store_name TEXT NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      edited_by TEXT NOT NULL,
      edited_at TEXT DEFAULT (datetime('now')),
      reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_entry_edits_lookup
      ON daily_entry_edits(entry_date, store_name);
  `);
}

// ── Order discounts (Round 2 item 6) ─────────────────────────────────────────
// One row per entry in an order's `discount_applications`. Captured because the
// in-store "Bath Bomb Mix & Match" promo is a real bundle that lives ONLY here:
// Shopify's Bundles app records component line items, so a bundle sale carries
// no bundle SKU and no bundle product_id and is invisible to a SKU-keyed matcher.
//
// A TABLE rather than a `discount_titles TEXT` column on `orders` (the spec
// allowed either) because the field is genuinely multi-valued — an order can
// carry several discounts — and because the long tail is large and messy
// (measured 2026-08-09: 80+ distinct titles over 5 days, mostly one-off manual
// entries like staff names and receipt numbers). Rows let the allow-list be
// changed without re-syncing, and let the tail be audited rather than guessed at.
//
// `norm_title` is the matching key: lowercased/trimmed title, falling back to
// code for discount_code rows. Indexed, because the participation rate filters
// on it over the full order history.
export function ensureOrderDiscountsSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_discounts (
      order_id          TEXT NOT NULL,
      idx               INTEGER NOT NULL,   -- position within discount_applications
      type              TEXT,               -- manual | discount_code | automatic | script
      title             TEXT,               -- title (manual/automatic) or code (discount_code)
      norm_title        TEXT,               -- lowercased match key
      code              TEXT,
      value             REAL,
      value_type        TEXT,               -- percentage | fixed_amount
      allocation_method TEXT,
      target_selection  TEXT,
      target_type       TEXT,
      synced_at         TEXT,
      PRIMARY KEY (order_id, idx)
    );
    CREATE INDEX IF NOT EXISTS idx_order_discounts_norm ON order_discounts(norm_title);
    CREATE INDEX IF NOT EXISTS idx_order_discounts_order ON order_discounts(order_id);
  `);
}

// ── Bundle attribution (Round 2 follow-up, 2026-08-09) ───────────────────────
// REAL bundle attribution, replacing the SKU match that silently broke.
//
// Shopify Bundles records COMPONENT line items on an order and never the bundle
// parent as a line — "SKUs are listed for individual items in orders, not for
// the bundle SKU". Matching orders on the GS#### SKU therefore found nothing
// from the 2026-06-15 conversion onward, and the metric read 0% while the
// bundles were in fact selling (Shopify Analytics: 32 bundles, 100% POS).
//
// The parent IS available — as `LineItem.lineItemGroup` on the GraphQL Admin
// API (2024-10), which the REST 2023-10 order payload does not carry. That is
// why every REST-side check missed it. One lineItemGroup per bundle purchased:
// its component line items all share the group, and the group holds the bundle
// title, productId, variantId and variantSku (the GS#### we key on).
//
// One row per (order, bundle instance). Written by the sync so there is a
// single source of truth in our DB rather than a read-time ShopifyQL call.
export function ensureOrderBundlesSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_bundles (
      order_id          TEXT NOT NULL,
      group_id          TEXT NOT NULL,   -- lineItemGroup id: one per bundle instance
      bundle_sku        TEXT,            -- variantSku, e.g. GS0006
      bundle_title      TEXT,
      bundle_product_id TEXT,
      quantity          INTEGER,         -- bundles purchased in this group
      component_lines   INTEGER,         -- line items belonging to the group
      order_date        TEXT,            -- YYYY-MM-DD, America/Toronto
      location_name     TEXT,            -- normalized to our store names
      source_name       TEXT,            -- pos | web | ...
      synced_at         TEXT,
      PRIMARY KEY (order_id, group_id)
    );
    CREATE INDEX IF NOT EXISTS idx_order_bundles_date  ON order_bundles(order_date);
    CREATE INDEX IF NOT EXISTS idx_order_bundles_sku   ON order_bundles(bundle_sku);
    CREATE INDEX IF NOT EXISTS idx_order_bundles_store ON order_bundles(location_name, order_date);
  `);
}
