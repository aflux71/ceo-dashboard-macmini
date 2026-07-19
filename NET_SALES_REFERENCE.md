# Net-Sales Reporting — Feature Reference

**Status:** Phase 1 (sync) + Phase 2 (dashboard) **LIVE** since 2026-07-19.
Reconciled to Shopify Analytics **to the penny** (2026-07-18: net $13,776.95 / GP $5,108.84 /
GM 39.0% across 6 POS locations; 07-17 cross-checked exact).

Revenue reporting moved off gross `SUM(total_price)` (tax + shipping + no COGS) onto **net sales**
reconstructed from Shopify orders/refunds/costs, with gross profit, discounts, day-of-week-matched
year-over-year, and a **Festivals & Events** location. Built **Path B** (reconstruct from the
existing token's read scopes) because the token lacks `read_reports`/ShopifyQL.

---

## Components

| File | Role |
|---|---|
| `server/db/schema.js` → `ensureDailySalesSchema()` | Creates `daily_sales`, `missing_cost_ledger`, and the `missing_cost_items` view (additive, idempotent). |
| `server/sync/net_sales.js` | Reconstruction engine: `reconstructRange()`, `reconstructDay()`, `runNetSalesSync()`. Streaming aggregation, cost cache, DST-aware Toronto day bucketing. |
| `server/db/net_sales_queries.js` | Read/query layer: `netSalesCompany[YoY]`, `netSalesByStore[YoY]`, store classification, rollup math. |
| `server/routes/api.js` | Endpoints `/api/stats/ceo-net`, `/api/revenue/by-store-net`. |
| `server/scheduler.js` | Nightly 3:30 AM (30-day) + Sunday 4:00 AM (90-day) net-sales sync, alongside the untouched orders sync. |
| `server/public/ceo.html` | CEO dashboard — flipped to net (live). |
| `server/public/ceo-net-preview.html` | Standalone net preview (kept as a fallback / validation surface). |

---

## Definitions & formulas (match Shopify exactly)

- **gross** = Σ(line `price` × `quantity`), pre-tax, excluding gift-card lines. Shop is
  `taxes_included=false`, so `price` is already pre-tax.
- **discounts** = Σ `line_item.discount_allocations` (order- and line-level).
- **returns (sales reversals)** = Σ `refund_line_items.subtotal`, attributed to the **date the
  refund was PROCESSED** and the **refund line's location** (not the original order date/location).
- **net_sales** = gross − discounts − returns  *(the headline revenue)*.
- **no_cost_net** = net of items whose variant `inventoryItem.unitCost` is null. Shopify's PROFIT
  report excludes these; symmetric on returns of no-cost items.
- **cost_bearing_net** = net_sales − no_cost_net  *(Shopify's profit-report net)*.
- **cogs** = Σ(unitCost × qty sold) − Σ(unitCost × qty returned).
- **gross_profit** = cost_bearing_net − cogs.
- **gross_margin_pct** = gross_profit / cost_bearing_net  *(null if base ≤ 0)*.
- **AOV** (retail stores only) = `Σ(net_sales − aov_excluded_net) / Σ(orders − aov_excluded_orders)`.
  The **first 5 sub-$15-NET transactions per store per calendar day** are excluded from AOV only
  (they still count fully toward net/GP/COGS). Festivals & Events and Online/DTC have **no AOV**.
- **LY (year-over-year)** = the window shifted back **364 days** (52 weeks) so weekdays align —
  Shopify's "Previous year (match day of week)".

**Rollup rule (critical):** aggregate margin as `Σ gross_profit / Σ(net_sales − no_cost_net)` and
AOV as the formula above — **never average stored percentages** across rows/days.

---

## Store classification (`net_sales_queries.js`)

- **Retail (5)** — Queen Street, Flower Farm, Elora, Stratford, Bracebridge. AOV applies.
- **Festivals & Events** — revenue/GP only; excluded from AOV, bundle %, per-store ops KPIs.
- **Online/DTC (rollup)** — web + **neob HQ** (old online-sales location) + 3PL-Online Orders +
  Ecommerce Warehouse (+ Walkers Market, no sales). No AOV.
- **Unattributed** — company total only; not shown as a store row (~$1.5K over 18 mo).

---

## Data model

`daily_sales` — one row per store per day (PK `store_name, sale_date`; `sale_date` = Toronto YYYY-MM-DD):
`net_sales, discounts, cogs, no_cost_net, gross_profit, gross_margin_pct, net_items, orders,
aov_excluded_orders, aov_excluded_net, source ('backfill'|'orders_reconstruct'), synced_at`.

`missing_cost_ledger` (PK `item_key, sale_date, store_name`) + `missing_cost_items` view —
data-quality accumulator of SKUs sold with no cost recorded. `is_fixable=1` = real variant missing
cost (set it in Shopify); `is_fixable=0` = inherently-costless custom POS line.

---

## Endpoints

- `GET /api/stats/ceo-net` — net tiles for 30d + YTD (net primary, gross as `rev_*` secondary),
  net GP/margin/AOV, net annual run rate, DoW-matched LY + deltas, operational fields
  (`active_products`, `inventory_units`, `unfulfilled`, `last_sync`).
- `GET /api/revenue/by-store-net?period=30d|ytd` or `?date_from=&date_to=` — per-store net rows
  (retail + Festivals + Online/DTC rollup) with DoW-matched LY, partial-LY-aware `vs_ly_pct`, and
  back-compat aliases (`location_name`, `period_revenue`, `ly_revenue`, `total`, `ytd_total`, …).

**Partial LY (no comparable 2025):** for a store with no comparable sales in the matched LY window
(seasonal gap, e.g. Bracebridge; or ramped from ~nothing, e.g. Festivals), raw YoY is a presence
artifact — the API also returns a **like-for-like** delta over the shared period and flags
`ly_partial` (UI shows `*`).

---

## Sync & backfill

- **Nightly (3:30 AM Toronto)** recomputes a **30-day trailing window** so refunds processed after
  a day's first sync re-land on the correct day (idempotent range-delete + reinsert).
- **Weekly (Sun 4:00 AM)** recomputes **90 days** for late returns.
- Both are additive alongside the existing orders sync (untouched). Retry policy mirrors it.
- **Backfill:** `reconstructRange('2025-01-01', today, 'backfill')` — 112,861 orders → 3,503 rows,
  565 days, zero gaps. Streaming (bounded memory); costs via GraphQL `inventoryItem.unitCost`,
  cached per run.
- Re-run any range with `reconstructRange(from, to)` / `reconstructDay(date)` — idempotent.

---

## Known items & caveats

- **GP/margin YoY is approximate** — earlier years had more missing costs (higher `no_cost_net`),
  which understates their GP and inflates the YoY gain. **Net-sales YoY is exact.**
- **Data quality:** `no_cost_net` runs ~6–13% of monthly POS net. Set costs in Shopify for the top
  offenders (e.g. `2584` Ice cream, `3018` Shea Butter Soap Bar, `3028` Nail & Cuticle) to sharpen GP.
- **$0 orders are kept** (Shopify counts them in order count — filtering would break parity). They
  add $0 to net, so revenue is unaffected.
- **Basis = Shopify parity:** reconstruction has **no source exclusions** (includes Matrixify;
  0 Matrixify orders exist in the 2025+ window anyway).
- **2024 not backfilled** — LY works for 2026-vs-2025; LY-of-LY on 2025 dates is out of range.
- **Targets are HELD at their numbers as NET** (not rescaled). Annual `STORE_TARGETS_2026`
  (hardcoded in `ceo.html`) + the $4.2M/$5.1M/$6M path + $350k monthly are held; net actuals vs held
  numbers → ~64% 2026 pace **by design**. Daily `kpi_targets` (portal-only) are also held — the
  store portal is unchanged. The CEO-net vs portal-gross basis mismatch is resolved in **Phase 4**.

---

## Operations

- **Prod is served by launchd** `com.neob.production` (NOT pm2), from the local working tree on
  disk (`express.static`). It does **not** pull from GitHub.
- **Deploy a code change:** `sudo launchctl kickstart -k system/com.neob.production`.
- **Logs:** `~/Library/Logs/neob-production.log` (stdout) / `.err`.
- **Backup remotes:** `origin` (HTTPS, neob-operations-suite_truth) · `macmini` (SSH,
  ceo-dashboard-macmini). Access is Tailscale-only.
- **Rollback the flip:** `git checkout main -- server/public/ceo.html` + reload daemon. The
  `/ceo-net-preview.html` page remains as a fallback net view.

---

## Phase status

- **Phase 1 — net-sales sync + nightly jobs:** ✅ done & live.
- **Phase 2 — dashboard flip to net + GP:** ✅ done & live (merge `212ac05`).
- **Phase 3 — net targets:** N/A — basis locked/held, no writes.
- **Phase 4 — store portal net entry:** not started (staff still enter gross vs held targets).

Key commits: `875e6a8` (schema) · `d1a835a` (sync module) · `9dabe73` (streaming backfill) ·
`66c49bf` (scheduler) · `4355afb`/`4071e60`/`3b23e9c`/`6247f72` (query layer, endpoints, LY, preview) ·
`212ac05` (dashboard flip merge).
