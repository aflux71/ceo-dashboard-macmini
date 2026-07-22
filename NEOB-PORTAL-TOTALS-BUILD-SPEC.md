# neōb CEO Dashboard — Portal Totals Page Build Spec

Build on the M3 Mac mini (`neobs-mac-mini`, `100.68.55.123`) at `/Users/neoboperations/neob/production-assistant/`. This is a live production system serving the CEO Dashboard (`ceo.html`), Task Board (`tasks.html`), Data Quality (`data-quality.html`) and the Portal Sync API. **Do not break what exists.**

## Architecture context

- **Backend:** Node.js Express + better-sqlite3, port 3001 via PM2 (process `neob-production`)
- **Database:** `data/neob.db` (SQLite). Tables include `orders`, `products`, `inventory`, `locations`, `sync_log`, `tasks`, `daily_kpi`, `kpi_targets`, `daily_sales`, `admin_users`
- **API routes:** `server/routes/api.js` — single file, all routes mounted at `/api/*`, ends with `export default router;`
- **Static pages:** `server/public/` — served at `/<filename>.html`
- **Tunnel:** `api.neobniagara.ca` → named tunnel `neob-dashboard` → `localhost:3001`
- **Store portal:** a SEPARATE Cloudflare Pages app (`neob-store-portal`) backed by D1. It pushes staff submissions to this mini via the portal-sync endpoint (Bearer `neob-portal-sync-2026`).

## What you're building

One admin-only page, `/portal-totals.html`, plus backing API endpoints. It answers: **what did staff actually submit, how does that track against target, and how does it compare to reconciled Shopify sales?**

---

## Step 0 — Investigate before you build (do not skip)

I am not certain how portal submissions currently land on the mini. Before writing anything, determine and report back:

1. Does the portal-sync endpoint write staff submissions into `daily_kpi`, or somewhere else? Read the existing route handler.
2. What are the actual columns on `daily_kpi`? Run `PRAGMA table_info(daily_kpi);`
3. Is there a column distinguishing data origin (portal vs Shopify vs manual)? If not, say so — it changes the design.
4. Same for `kpi_targets` and `daily_sales`: `PRAGMA table_info(...)` on each.
5. How many `daily_kpi` rows exist, and what's the date range? `SELECT COUNT(*), MIN(...), MAX(...) FROM daily_kpi;`

**If portal submissions are not reaching `daily_kpi` at all, stop and tell me.** There is no point building a reporting page on an empty table — we'd need to wire the sync first.

Report findings, then continue.

---

## Step 1 — API endpoints

Append to `server/routes/api.js` **before** the `export default router;` line. Follow the existing prepared-statement pattern used by the `tasks` routes.

All endpoints require header `X-Admin-Pin` matching an active `admin_users` row. Reuse the existing `checkAdminPin(req, res)` helper if it exists; if it doesn't, implement it in the same shape as `checkPortalAuth`.

**`GET /api/portal-totals/today`**
Per store, for today: submitted revenue (or null if nothing submitted), submission timestamp, today's target from `kpi_targets`, and today's Shopify net sales from `daily_sales`. Return all six stores whether or not they've submitted.

**`GET /api/portal-totals/running?period=wtd|mtd`**
Per store plus an all-stores total:
- cumulative submitted revenue for the period
- cumulative target for **elapsed days only** — sum `kpi_targets` from period start through today, NOT through end of period. Getting this wrong makes every store look like it's failing mid-week.
- cumulative Shopify net sales for the same elapsed range
- variance $ and % against target
- Week starts Monday.

**`GET /api/portal-totals/history?store=&from=&to=`**
Row per store-day: date, store, submitted revenue, target, variance %, Shopify net sales, gap between submitted and Shopify ($ and %), transactions, AOV. Default range: last 30 days. Cap at 500 rows.

**`GET /api/portal-totals/rollup?grain=week|month&store=`**
Week grain: last 12 weeks. Month grain: last 6 months. Each row: period label, submitted revenue, target, variance %, Shopify net sales, transactions, average AOV.

**`GET /api/portal-totals/export?...`**
Same filters as history, returns CSV with a `Content-Disposition: attachment` header.

Exclusions: apply the same rules the rest of the dashboard uses when reading `orders`/`daily_sales` — exclude Matrixify App and `source_id` 3890849.

---

## Step 2 — Build `portal-totals.html`

Match `ceo.html` exactly: light theme, DM Serif Display + DM Sans + DM Mono, lavender accent `#6B5B8F`, same surface and border colours, same card and table styling.

- **Header:** same nav as `ceo.html`, with a new "Portal" link added to the right of the existing links
- **Admin PIN gate:** full-page overlay until a valid PIN is entered, POSTing to `/api/admin-auth/login`, storing the name in `sessionStorage` — identical to the gate on `targets.html`

**Section 1 — Today**
Six status cards, one per store. Each shows store name, submitted revenue (or "Not submitted" in grey), today's target beneath it in small type, and a status dot: green submitted, amber not submitted after 8pm, grey otherwise. Above the cards, one line: "4 of 6 stores reported" plus the most recent submission time.

**Section 2 — Running totals**
Two blocks, "Week to Date" and "Month to Date". Each has a card per store plus All Stores, showing cumulative submitted revenue, cumulative elapsed target, and variance $ / % — green at or above target, red below.

**Section 3 — Staff entry vs Shopify**
This is the section that matters most. A table, last 30 days, one row per store-day: Date, Store, Staff entered, Shopify net, Gap $, Gap %. Sort by absolute gap descending by default so the worst mismatches surface first. Highlight any row where the gap exceeds 5% in amber, 15% in red.

A short note above it: "Staff-entered figures are same-day and unreconciled. Persistent gaps in one direction usually mean an entry-model mismatch, not staff error."

**Section 4 — History**
Filterable, sortable table from `/api/portal-totals/history`. Filters: store dropdown, date from/to. Sortable by clicking any column header. Pagination at 50 rows. "Export CSV" button hitting the export endpoint with the current filters.

**Section 5 — Roll-ups**
Weekly (12 weeks) and monthly (6 months) tables, with a store filter. Include a bar chart of revenue per period with target drawn as a line overlay. Use whatever charting approach `ceo.html` already uses — do not add a new library.

Laptop-first. Mobile responsiveness not required.

---

## Step 3 — Nav links

Add the "Portal" link to the nav in `ceo.html`, `tasks.html`, and any other admin pages that share the header. Nav links only — change nothing else on those pages.

## Step 4 — Deploy and test

```bash
cd ~/neob/production-assistant
source ~/.zprofile
pm2 restart neob-production

# Verify — replace 9271 with a valid admin PIN
curl -s -H "X-Admin-Pin: 9271" http://localhost:3001/api/portal-totals/today
curl -s -H "X-Admin-Pin: 9271" "http://localhost:3001/api/portal-totals/running?period=wtd"
curl -s http://localhost:3001/api/portal-totals/today   # should 401
```

Confirm `ceo.html` still loads and its running totals and per-store actuals are unchanged.

## Step 5 — Commit

```bash
cd ~/neob/production-assistant
git add -A
git commit -m "Portal Totals page: staff submission running totals, target variance, Shopify reconciliation"
git pull --no-rebase origin main
git push
```

---

## Implementation rules

1. **Match existing code style.** Follow the prepared-statement pattern already in `api.js`.
2. **No new dependencies.** Built-in `fetch`, `better-sqlite3`, existing charting. Do not `npm install`.
3. **Single HTML file, no build step.** Plain HTML/CSS/vanilla JS, matching `tasks.html`.
4. **Read-only.** Every endpoint here is a SELECT. This page must not write to any table.
5. **Do not touch** `ceo.html`'s task panels, period selector, or store table logic — nav link only.
6. **Test each layer before moving on.** Endpoints return sane JSON via curl before you build any UI against them.
7. **If you hit unknown territory, stop and ask.** Especially anything in Step 0 that contradicts this spec.

## Success criteria

- `http://100.68.55.123:3001/portal-totals.html` loads, gates on PIN, and shows today's six stores with real submitted values
- Week-to-date targets count only elapsed days
- The staff-vs-Shopify table surfaces real gaps with correct percentages
- CSV export opens cleanly in Excel
- `ceo.html`, `tasks.html` and `data-quality.html` all still work, with the new nav link present
- `git status` clean after the final commit
