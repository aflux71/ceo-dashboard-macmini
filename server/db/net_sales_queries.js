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
// Online/DTC = web + genuine fulfillment/online locations. 'neob HQ' is the old
// online-sales location (now also a 3PL-overflow / store-transfer warehouse); its
// ~$242K is real online revenue (web + wholesale/manual-invoice draft orders,
// verified as genuine external-customer sales), so it belongs here. Internal $0
// transfer entries add $0 to net (they only affect order count), so net/GP/margin
// are not inflated by folding neob HQ in.
export const ONLINE_DTC_MEMBERS = ['Online/DTC', 'neob HQ', '3PL-Online Orders', 'Ecommerce Warehouse', 'Walkers Market Warehouse'];

// Not shown as store rows (kept only in the company total): a tiny unresolved
// catch-all. ~$1.5K over 18 months.
export const NON_STORE = ['Unattributed', 'Retail (unattributed)'];

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

// ── Day-of-week-matched LY (Phase 2, Chunk 4) ────────────────────────────────
// Shopify's "Previous year (match day of week)" shifts the whole window back
// 364 days (= 52 weeks exactly), so each weekday lines up with the same weekday
// LY (this Saturday vs last year's corresponding Saturday), NOT the same calendar
// date. Pure whole-day label arithmetic — DST/timezone irrelevant to the shift.
const LY_SHIFT_DAYS = 364;
export function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);   // noon UTC avoids any edge rounding
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const pctDelta = (cur, ly) =>
  (ly && ly !== 0) ? Math.round(((cur - ly) / Math.abs(ly)) * 1000) / 10 : null;

// Company totals with DoW-matched LY comparison + deltas.
export function netSalesCompanyYoY(from, to) {
  const current = netSalesCompany(from, to);
  const ly_from = shiftDate(from, -LY_SHIFT_DAYS);
  const ly_to = shiftDate(to, -LY_SHIFT_DAYS);
  const ly = netSalesCompany(ly_from, ly_to);
  return {
    current, ly, ly_window: [ly_from, ly_to],
    delta_pct: {
      net_sales: pctDelta(current.net_sales, ly.net_sales),
      gross_profit: pctDelta(current.gross_profit, ly.gross_profit),
      discounts: pctDelta(current.discounts, ly.discounts),
      orders: pctDelta(current.orders, ly.orders),
      aov_retail: pctDelta(current.aov_retail, ly.aov_retail)
    }
  };
}

// Members backing a displayed store row (for first-sale + like-for-like sums).
function membersFor(channel, storeName) {
  if (channel === 'online') return ONLINE_DTC_MEMBERS;
  if (channel === 'festivals') return [FESTIVALS];
  return [storeName];
}
function firstSaleDate(stores) {
  const ph = stores.map(() => '?').join(',');
  return db.prepare(`SELECT MIN(sale_date) AS f FROM daily_sales WHERE store_name IN (${ph})`).get(...stores).f || null;
}

// Per-store rows with DoW-matched LY. For a store whose LY window predates its
// first sale (opened mid-2025 / tiny base — e.g. Bracebridge opened 2025-02-27,
// Festivals ramped from ~nothing), the RAW YoY is a presence/base artifact, so we
// also compute a LIKE-FOR-LIKE delta over the shared period where both years had
// the store live, and flag ly_partial so the UI shows the honest number.
export function netSalesByStoreYoY(from, to) {
  const cur = netSalesByStore(from, to);
  const ly_from = shiftDate(from, -LY_SHIFT_DAYS);
  const ly_to = shiftDate(to, -LY_SHIFT_DAYS);
  const lyRows = new Map(netSalesByStore(ly_from, ly_to).map(r => [r.store_name, r]));

  return {
    ly_window: [ly_from, ly_to],
    stores: cur.map(r => {
      const ly = lyRows.get(r.store_name);
      const lyNet = ly ? ly.net_sales : 0;
      const members = membersFor(r.channel, r.store_name);
      const first = firstSaleDate(members);
      const partial = first ? (ly_from < first) : true;

      let ll_from = null, ll_net_sales = null, ll_ly_net_sales = null, ll_net_delta_pct = null;
      if (partial && first) {
        // first cur date whose LY (date−364) is on/after the store's first sale
        ll_from = shiftDate(first, LY_SHIFT_DAYS);
        if (ll_from < from) ll_from = from;
        if (ll_from <= to) {
          const c = aggregate(ll_from, to, members);
          const l = aggregate(shiftDate(ll_from, -LY_SHIFT_DAYS), ly_to, members);
          ll_net_sales = c.net_sales; ll_ly_net_sales = l.net_sales;
          ll_net_delta_pct = pctDelta(c.net_sales, l.net_sales);
        }
      }
      return {
        ...r,
        ly_net_sales: lyNet,
        ly_gross_profit: ly ? ly.gross_profit : 0,
        net_delta_pct: pctDelta(r.net_sales, lyNet),
        gp_delta_pct: pctDelta(r.gross_profit, ly ? ly.gross_profit : 0),
        ly_partial: partial,
        first_sale: first,
        ll_from, ll_net_sales, ll_ly_net_sales, ll_net_delta_pct
      };
    })
  };
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

  // NON_STORE (Unattributed) is intentionally not shown as a row; it remains in
  // netSalesCompany's total, so store rows may sum to slightly under company net.
  return rows.sort((a, b) => (b.net_sales || 0) - (a.net_sales || 0));
}
