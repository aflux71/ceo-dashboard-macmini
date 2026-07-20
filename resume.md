# Resume — neōb CEO Dashboard / Net-Sales Migration

_Last updated: 2026-07-19. Everything below is **LIVE** and backed up to `macmini`._

## TL;DR
Migrated revenue reporting from gross `total_price` → **net sales** (reconciled to Shopify to the
penny). Phase 1 (sync + nightly jobs) and Phase 2 (dashboard flipped to net + GP) are **done and
live**. Added a live **missing-cost checklist** to get COGS entered. Full technical detail is in
**`NET_SALES_REFERENCE.md`** — read that for architecture/formulas.

## Live right now
- **CEO dashboard** (`server/public/ceo.html`) shows **net** sales (gross kept secondary), GP,
  margin, discounts, day-of-week-matched LY, Festivals & Events, sub-$15 AOV rule. All operational
  widgets intact (bundle/loyalty/SKUs/inventory/API/$6M hero). Nav link **⚑ Data Quality**.
- **`/data-quality.html`** — live missing-cost checklist: 40 fixable real SKUs, each deep-linked to
  its Shopify variant cost field; auto-shrinks as costs are entered (re-checks Shopify per load).
  U-pick/Field-Entry service lines already marked $0-cost.
- **Nightly sync** (`server/scheduler.js`): net-sales 3:30 AM (30-day trailing) + Sun 4:00 AM
  (90-day), alongside the untouched orders sync at 3:00 AM.
- **daily_sales** backfilled 2025-01-01 → today (3,503 rows, zero gaps).

## Ops (mini)
- Served by **launchd `com.neob.production`** (NOT pm2), from local disk. Reload after code changes:
  `sudo launchctl kickstart -k system/com.neob.production`. Static HTML changes go live without reload.
- Logs: `~/Library/Logs/neob-production.log` / `.err`. DB: `data/neob.db`.
- Data-quality "mark $0-cost" and other admin writes are admin-pin gated (`X-Admin-Pin`).

## Git / backups
- **Backups go to `macmini`** (`ceo-dashboard-macmini`, SSH) — canonical mirror, currently at the
  latest commit. **Do NOT push to `origin`** (`neob-operations-suite_truth`) — separate
  operations-suite repo, fully divergent history; pushing would merge an unrelated codebase onto the
  mini or clobber their work.
- Untracked in the repo: this `resume.md`, `RESUME_net-sales-migration-2026-07-19.md` (detailed
  session log), and old `*.backup-*` files.
- Rollback the dashboard flip (if ever needed): `git checkout <pre-flip> -- server/public/ceo.html`
  + reload. `/ceo-net-preview.html` remains as a fallback net view.

## Key facts / caveats
- **Targets are HELD at their numbers as NET** (not rescaled) — annual `STORE_TARGETS_2026`
  (hardcoded in ceo.html) + $4.2M/$5.1M/$6M path + $350k monthly. Net actuals vs held numbers →
  ~64% 2026 pace **by design**. Daily `kpi_targets` (portal-only) also held; portal unchanged.
- **GP/margin YoY is approximate** — earlier years had more missing costs (higher `no_cost_net`);
  net-sales YoY is exact.
- **no_cost_net = 14.8% of net** cumulatively; ~$121k of that is the 40 fixable SKUs (→ ~12.6% once
  costed). The rest is no-variant lines: genuine services (acknowledged) + **gift baskets** (real
  COGS, no single variant — needs a separate bundle-costing approach).
- Reconstruction basis = **Shopify parity** (no source exclusions; incl. Matrixify — 0 in window).
- **2024 not backfilled** (LY works for 2026-vs-2025; LY-of-LY on 2025 dates is out of range).
- Bracebridge: established location since 2024 with a winter sales gap (first 2025 sale 2025-02-27),
  not a new store — flagged "partial LY (no comparable 2025)" in YoY.

## Parked — need a decision from Robert before building
1. **Phase 4 — store portal net entry.** Staff currently enter gross vs held targets. Options:
   (a) portal shows actual net from daily_sales (needs the separate `neob-store-portal` Cloudflare
   repo + an intraday sync for same-day freshness); (b) staff type net; (c) keep gross, reconcile
   overnight. The staff-facing portal source is NOT in this repo.
2. **Gift-basket / bundle costing** — the ~$564k no-variant bucket (gift baskets have real COGS but
   no variant to attach it to). Separate from the variant-cost checklist.
3. **Optional:** re-run the backfill to retroactively apply newly-entered costs to past days
   (`reconstructRange('2025-01-01', today)` — idempotent, ~80 min); optional `kpi_targets` basis-note
   stamp.

## How to run the backfill / re-sync (reference)
- Re-run any range (idempotent): in `server/sync/net_sales.js` → `reconstructRange(from, to)` or
  `reconstructDay(date)`. Full backfill = `reconstructRange('2025-01-01', <today>, 'backfill')`.
- Endpoints: `GET /api/stats/ceo-net`, `GET /api/revenue/by-store-net[?period=30d|ytd|&date_from&date_to]`,
  `GET /api/data-quality/missing-costs`, `POST /api/data-quality/missing-costs/ack` (admin-pin).
