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
      created_at TEXT,
      updated_at TEXT,
      synced_at TEXT
    );

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
