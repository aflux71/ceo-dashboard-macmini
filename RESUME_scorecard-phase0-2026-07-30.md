# RESUME — Scorecard Phase 0 (session 2026-07-30)

Session log / handoff for tomorrow. Pairs with the top-level `resume.md` (bumped to 2026-07-30) and
memory `project-scorecard-api`. Full spec: `NEOB-SCORECARD-PHASE0-MINI-SPEC.md`.

## Status: ✅ DONE & LIVE

Phase 0 store-scoped scorecard **read** API shipped and deployed. All spec success criteria met.

- **Commits on `macmini/main`:** `e94963d` (the API) + `ee43adb` (resume.md update). Linear history
  on top of `c58deb8`. Nothing pushed to `origin`.
- **Live** on prod (launchd `com.neob.production`, port 3001) and through the tunnel
  (`https://api.neobniagara.ca/api/scorecard`).

## What shipped

Additive to `server/routes/api.js` (inserted before `export default router;`), read-only, no new deps.

- `GET /api/scorecard/stores` → `{stores:[Bracebridge,Elora,Flower Farm,Queen Street,Stratford]}`
- `GET /api/scorecard?store=<exact>&as_of=YYYY-MM-DD` → day/WTD/MTD/YTD, each with net_sales,
  transactions, aov, target(+variance), ly_net_sales(+variance), ly_dates, and optional
  `target_partial`/`ly_partial` flags.
- Both Bearer `neob-portal-sync-2026` (reuse `checkPortalAuth`). Fail-closed: bad/no key → 401;
  unknown/absent store & `Online/DTC` & bad `as_of` → 400.

## Step 0 findings (verified against the DB, don't re-investigate)

- `daily_sales` cols: `sale_date`, `store_name`, `net_sales` (headline net), `orders` (txns for AOV),
  `discounts`, `cogs`, `gross_profit`. **No gross/total_price column** here.
- `daily_sales` has **11** distinct `store_name` (incl. back-office buckets: 3PL-Online Orders,
  Ecommerce Warehouse, Festivals & Events, Unattributed, neob HQ). Served set is the **5 physical**
  stores only, derived from `kpi_targets` ∩ physical. `Online/DTC` exists but is excluded (raw-location
  mapping unresolved) → 400.
- Each physical store maps to exactly ONE `store_name`, no variant spellings (`Elora` correct; `Eiora`
  = 0 rows).
- `kpi_targets` cols: `store_name`, `target_date`, `revenue_target`. **Coverage 2026-05-27 → 08-31 only**
  → every YTD is `target_partial` today; Bracebridge YTD is also `ly_partial` (its data starts
  2025-02-27, before the LY-YTD window start 2025-01-02).
- daily_sales spans 2025-01-01 → 2026-07-29 → full-YTD LY works for stores present since Jan 2025.

## Key decisions (from Robert, already applied)

- Net = `daily_sales.net_sales` (Shopify net), NOT staff-entered `daily_kpi`.
- LY = **day-of-week matched, D−364d**; `ly_dates` returns the resolved LY range.
- Week starts **Monday**; `as_of` defaults to Toronto-yesterday; date math UTC-anchored (DST-immune).
- **Partial → null variance, never a partial variance:** partial target coverage → sum + `target_partial`
  + `target_variance_pct:null`; no target rows → `target:null`; LY range before store's first row →
  `ly_partial` + `ly_variance_pct:null`.

## Verification done

- Auth 401 (no/bad key), 400 (unknown store, Online/DTC, absent store, bad as_of=2026-02-31).
- All 5 stores return sane 4-period payloads; historical `as_of=2026-06-30` works.
- Hand-reconciled 3 figures vs direct SQL (exact match): QS MTD 129618.18/3329, QS MTD@2026-06-30
  118178.12/2999, QS YTD-LY 540981.21. LY DOW-match matches the spec example (2026-07-29 → 2025-07-30).
- `ceo.html`, `tasks.html`, `data-quality.html` all still 200 after prod reload.

## ⚠️ Deploy gotchas (learned this session)

- **Prod reload needs Robert's sudo:** `sudo launchctl kickstart -k system/com.neob.production` — I
  can't run it (no terminal for password). Ask Robert to run it via `!` in-session.
- **Do NOT `git pull origin main` on the mac mini.** `origin` (neob-operations-suite_truth) is a fully
  divergent frontend repo. The spec's Step 6 pull dragged in 100+ Base44/React files; had to
  `git reset --hard e94963d` + `git push --force-with-lease macmini main` to keep only Phase 0.
  Push target is **`macmini`** only.

## Next / tomorrow

1. **Phase 1 = portal scorecard UI** — separate repo (Cloudflare `neob-store-portal`), NOT this repo.
   Spec: `NEOB-SCORECARD-PHASE1-PORTAL-SPEC.md`. The portal Worker calls this API server-side with the
   Bearer key (never exposed to browser); use `/api/scorecard/stores` to validate its store mapping so
   the list isn't hardcoded twice.
2. **Parked decisions (need Robert):** staff net entry vs actual-net display (Phase 4 in resume.md);
   `Online/DTC` raw-location mapping (currently out of scope / 400); whether staff portal entry survives.
3. Optional: labels currently generic (`Day`/`Week-to-date`/…) not the spec's `"Yesterday"` — revisit
   only if the UI wants it.

## Re-verify quickly tomorrow
```bash
KEY="neob-portal-sync-2026"
curl -s -H "Authorization: Bearer $KEY" http://localhost:3001/api/scorecard/stores
curl -s -G -H "Authorization: Bearer $KEY" --data-urlencode "store=Queen Street" \
  http://localhost:3001/api/scorecard | python3 -m json.tool
curl -s -H "Authorization: Bearer $KEY" https://api.neobniagara.ca/api/scorecard/stores   # tunnel
```
