import db from './database.js';

// ── Net-sales query layer (Phase 2) ──────────────────────────────────────────
// Read helpers over the daily_sales table (Phase 1). Nothing here is wired into
// a live endpoint yet — the CEO dashboard is repointed behind PARALLEL endpoints
// (Chunk 2/3) and only flipped after side-by-side validation.
//
// ROLLUP RULES (must match Shopify; never average stored percentages):
//   gross_margin_pct = Σ gross_profit / Σ(net_sales − no_cost_net)   [cost-bearing base]
//   AOV (retail)     = Σ(net_sales − aov_excluded_net) / Σ(orders − aov_excluded_orders)
//
// Dates are Toronto calendar days (YYYY-MM-DD), inclusive [from, to].

// Store classification.
// RETAIL + FESTIVALS + ONLINE_DTC are firm. Festivals is revenue/GP ONLY (no AOV,
// no bundle/ops KPIs). ONLINE_DTC = web + genuine fulfillment warehouses.
export const RETAIL_STORES = ['Queen Street', 'Flower Farm', 'Elora', 'Stratford', 'Bracebridge'];
export const FESTIVALS = 'Festivals & Events';
export const ONLINE_DTC_MEMBERS = ['Online/DTC', 'Ecommerce Warehouse', '3PL-Online Orders', 'Walkers Market Warehouse'];

// PENDING — NOT yet classified. 'neob HQ' ($242K, 2025-01-01→2026-07-15) coexists
// with all 5 retail stores, so it is NOT a clean rename; it may be a renamed/merged
// retail store, a flagship, or a wholesale channel — Robert maps this before Chunk 4
// (LY), because mis-bucketing corrupts per-store year-over-year. Surfaced as its own
// row meanwhile so nothing is silently folded. 'Unattributed' is a tiny catch-all.
export const PENDING_REVIEW = ['neob HQ', 'Unattributed', 'Retail (unattributed)'];

const AGG_COLS = `
  ROUND(SUM(net_sales), 2)          AS net_sales,
  ROUND(SUM(discounts), 2)          AS discounts,
  ROUND(SUM(cogs), 2)               AS cogs,
  ROUND(SUM(no_cost_net), 2)        AS no_cost_net,
  ROUND(SUM(gross_profit), 2)       AS gross_profit,
  SUM(net_items)                    AS net_items,
  SUM(orders)                       AS orders,
  SUM(aov_excluded_orders)          AS aov_excluded_orders,
  ROUND(SUM(aov_excluded_net), 2)   AS aov_excluded_net
`;

// Derive margin (+ null-safe zeros) on a summed row. Mutates and returns it.
function derive(r) {
  r.net_sales = r.net_sales || 0;
  r.discounts = r.discounts || 0;
  r.cogs = r.cogs || 0;
  r.no_cost_net = r.no_cost_net || 0;
  r.gross_profit = r.gross_profit || 0;
  r.net_items = r.net_items || 0;
  r.orders = r.orders || 0;
  r.aov_excluded_orders = r.aov_excluded_orders || 0;
  r.aov_excluded_net = r.aov_excluded_net || 0;
  const costBearing = r.net_sales - r.no_cost_net;
  r.cost_bearing_net = Math.round(costBearing * 100) / 100;
  r.gross_margin_pct = costBearing > 0 ? Math.round((r.gross_profit / costBearing) * 1000) / 10 : null;
  return r;
}

// AOV for a retail row: exclude the first-5 sub-$15 txns already captured per day.
function aovOf(r) {
  const denom = r.orders - r.aov_excluded_orders;
  return denom > 0 ? Math.round(((r.net_sales - r.aov_excluded_net) / denom) * 100) / 100 : null;
}

// Sum daily_sales for a store set over [from, to]. `stores` empty/undefined = all.
function aggregate(from, to, stores) {
  if (stores && stores.length) {
    const ph = stores.map(() => '?').join(',');
    return derive(db.prepare(
      `SELECT ${AGG_COLS} FROM daily_sales WHERE sale_date >= ? AND sale_date <= ? AND store_name IN (${ph})`
    ).get(from, to, ...stores));
  }
  return derive(db.prepare(
    `SELECT ${AGG_COLS} FROM daily_sales WHERE sale_date >= ? AND sale_date <= ?`
  ).get(from, to));
}

// Company-wide totals over ALL real sales in the window (retail + Festivals +
// Online/DTC + pending). AOV is retail-only by definition.
export function netSalesCompany(from, to) {
  const total = aggregate(from, to, null);
  total.aov_retail = aovOf(aggregate(from, to, RETAIL_STORES));
  return total;
}

// Per-store rows for the store table: 5 retail (with AOV), Festivals (rev/GP only),
// one Online/DTC rollup, and — until mapped — a visible 'neob HQ (unmapped)' row.
export function netSalesByStore(from, to) {
  const rows = [];
  for (const s of RETAIL_STORES) {
    const a = aggregate(from, to, [s]);
    if (!a.orders && !a.net_sales) continue;
    a.store_name = s; a.aov = aovOf(a); a.channel = 'retail';
    rows.push(a);
  }
  const f = aggregate(from, to, [FESTIVALS]);
  if (f.orders || f.net_sales) { f.store_name = FESTIVALS; f.aov = null; f.channel = 'festivals'; rows.push(f); }

  const o = aggregate(from, to, ONLINE_DTC_MEMBERS);
  if (o.orders || o.net_sales) { o.store_name = 'Online/DTC'; o.aov = null; o.channel = 'online'; rows.push(o); }

  const p = aggregate(from, to, PENDING_REVIEW);
  if (p.orders || p.net_sales) { p.store_name = 'neob HQ (unmapped)'; p.aov = null; p.channel = 'pending'; rows.push(p); }

  return rows.sort((a, b) => (b.net_sales || 0) - (a.net_sales || 0));
}
