# RESUME — Round 2 dashboard fixes (all six items shipped)

**Session date:** 2026-08-09
**Branch:** `round2-dashboard-fixes` @ `1ad53d9`, pushed to `macmini`
**`main`** @ `8fb2d35`, pushed to `macmini`. **`origin` untouched** (`3ba19ff`) — different repo.
**Spec:** `neob-dashboard-fixes-BUILD-2.md` (corrected in-place this session)
**Predecessor:** `RESUME_ceo-dashboard-fixes-2026-08-07.md`

---

# PART 1 — What shipped

All six spec items are done, live on port 3001, and pushed. Reloads were run by Robert.

```
1ad53d9  Melissa handover + BUILD-2 corrections; restate gift-set loss as measured
610b875  Targeted order_discounts backfill tool (item 6)
1bcfa99  Correct the tgt basis wording: targets are held as NET, not gross (item 4)
5bd74cf  Capture in-store promo discounts + participation rate (item 6)
bb6e73d  Audited admin edits to daily entries (item 5) + bind /login-log LIMIT
53ca590  Portal handoff spec: scorecard round 2 + urgent pre-fill question
d27f152  Record the settled net-sales definition; shipping exclusion is intentional
f38bfa3  Docs: shipping open question; ugrep/NUL pre-flight note
3d0c21c  Daily breakdown: last-year column, DOW-matched net, basis labelled (item 4)
02ac43c  Scorecard: loyalty on retail basis, bundle none-state cites root cause (item 3)
4936626  CEO scorecard shape + fix by-store-net silently ignoring ?period (item 2)
1796632  Staff page: clickable store portal link (item 1)
8fb2d35  Manager codes + portal sign-in log (recovered from working tree)  <- on main
```

| Item | Outcome |
|---|---|
| **1** Portal URL | `PORTAL_URL` const at `staff.html:325`; new-tab anchor in Store Access Codes header. Hidden unless the const parses as http(s), so a blanked value can't ship a dead link to staff |
| **2** Scorecard shape (ceo.html) | Last-7-days by name; YTD dollars removed everywhere (survives as % vs target); target on a monthly basis from `kpi_targets`. **Also fixed a real bug** — see Part 2 |
| **2** Portal half | **DEFERRED** — Pages source is not on this machine. Spec written: `PORTAL-HANDOFF-scorecard-round2-2026-08-09.md` |
| **3** Bundles + Loyalty | Loyalty tile moved to `retail_total` (was `total`, which included Online's auto-enrolled 93%); bundle none-state now cites the root cause |
| **4** LY in daily breakdown | DOW-matched (−364d) net per store-day, `ly n/a` where a store didn't exist, `% vs LY` on submitted days only |
| **5** Admin edits + audit | `daily_entry_edits`, edit route, value+audit in one transaction, ✎ markers. 30/30 acceptance |
| **6** Promo capture | `order_discounts` + participation rate + targeted backfill. Backfill RUN: 72,991 rows |

**New DB objects:** `order_discounts` (72,991 rows, history to Jan 2024).
`daily_entry_edits` **not yet created** — it is lazy and self-creates on the first
admin edit or first audit read.

---

# PART 2 — Bugs and wrong premises found (the useful part)

### `/api/revenue/by-store-net` silently ignored `?period`

It never used `resolvePeriod()`. It hand-rolled its window, handled only `ytd` and
explicit ranges, and **fell through to a silent 30-day default for everything else** —
`?period=7d` returned 30 days of data labelled `"7d"`. Invisible because `ceo.html`
always sent explicit dates; the portal scorecard asks *by name*, so this would have
broken "both surfaces agree" the moment the portal half landed. Fixed in `4936626`.

**Sweep of all 56 routes** (requested, not fixed): 3 use `resolvePeriod`, 22 hand-roll,
31 have no window. Remaining silent-substitution cases are all `portal-totals` and all
on *closed* two/three-value toggles (`mtd|wtd`, `month|week`, `day|week|month`) — a typo
yields a documented default, not a mislabelled window. Two worth more attention:

- **`/api/stats` (160) and `/api/stats/ceo` (221) carry the Round 1 skew bug** — they
  compare `new Date().toISOString()` (UTC) as TEXT against Toronto-local `created_at`.
  **Both are dead** (zero callers). Deleting beats fixing.
- **`portalHistoryRows` (1757)** doesn't validate `from`/`to` and defaults to
  `29d → today` (today, not yesterday) — a third window convention in the file.

### The AOV window-parity worry was unfounded

`aovOf()` takes numerator and denominator from the **same `daily_sales` row** under one
`sale_date` predicate. A window mismatch is structurally impossible, not merely absent.
Proven side-by-side anyway: 5 stores × 7d and 30d, **every order-count delta zero**.
Queen Street's $39.28 is genuinely under the $40 floor. Close as **resolved — no defect**.

### My own bug, caught in verification not review

First cut of item 4 compared `actual` against LY summed over **all elapsed days** while
`actual` only exists on **submitted** days — 2 of 7. Footer printed a fictional **−74%**
(Queen Street $7,912 vs $30,344). Now LY sums only days with a submission: **−35%**,
company **−9.9%**. The three spot-checks passed *while this was broken* — cell-level
checks could never have caught a footer aggregation error.

### Two premises in queued tasks were wrong

- **"Fix the NUL bytes in `net_sales.js`."** Only one is in a comment. The other is
  executable — `const k = store + '\0' + date;`, a deliberate collision-proof cell-key
  separator. I made the edit, caught it in the diff, reverted. **Do not clean these.**
- **"Targets are gross, so attainment is understated."** My own §2 analysis said this;
  it was wrong. `NET_SALES_REFERENCE.md:115` and `RESUME_net-sales-migration:265` both
  record that targets are **HELD at their dollar numbers as NET**, basis LOCKED
  2026-07-19, ~64% pace **intentional**. Do not "correct" attainment for a net-vs-gross
  gap. My item-4 footnote wording was fixed accordingly in `1bcfa99`.

---

# PART 3 — Settled definitions and decisions (do not re-litigate)

**Net sales (Robert, 2026-08-09) — every money figure on every surface:**

```
net_sales = selling price − discounts − taxes − refunds
Shipping EXCLUDED.  Gift cards EXCLUDED both directions.
```

Recorded in three places so a reader can't miss it: `net_sales.js` header,
`NET_SALES_REFERENCE.md` §Definitions, `neob-dashboard-fixes-DONE.md` §9.0.

- **Shipping** — `shipping_lines` is never read. Reviewed and confirmed **correct as-is**;
  matches Shopify's own Net Sales analytic. Adding it is a regression, not a fix.
- **Taxes** — excluded *by construction* (`taxes_included: false`), not by subtraction.
- **Refunds** — subtracted on the date **processed**, at the **refund line's** location.

**Targets: held as net, not rescaled.** ~13% harder on purpose. Do NOT backfill
`kpi_targets` to Jan 1 — the daily plan legitimately begins **2026-05-27**, and inventing
a retrospective plan would make every historical attainment figure reflect numbers made
up after the fact. Two bases coexist deliberately and are labelled in the UI:
**"Month Target (daily plan)"** vs **"YTD vs Annual Target"**.

**Money-figure audit:** every actual, LY figure and staff entry on every surface is
already NET. The single exception is `kpi_targets`, which propagates to four places
(Month Target, YTD vs Annual Target, daily-breakdown `tgt` + footer, scorecard
`target_variance_pct`).

---

# PART 4 — The gift-set loss, now measured

Backfilling `order_discounts` made this answerable for the first time.

| | Value |
|---|---|
| Gift-set line revenue, Apr 1 – Jun 14 (75 d) | **$34,685.52 = $462/day** |
| Gift-set line revenue, Jun 16 – Aug 8 (54 d) | **$0.00** |
| Not rung up since the cutover | **~$24,900** |

**$462/day supersedes the earlier ~$570/day**, which counted the whole basket of any
order containing a gift set rather than the gift-set lines themselves.

**Mix & Match did NOT absorb the demand.** Seasonality-controlled, YoY same window:

| Window | 2025 | 2026 | Change |
|---|---|---|---|
| Pre-cutover Apr 1 – Jun 14 | 3.47% | 3.69% | +6% |
| Post-cutover Jun 16 – Aug 8 | 3.00% | 3.15% | +5% |

Post-cutover growth matches the pre-existing trend — no jump at the changeover. **The
naive pre/post reading of −21% is seasonality** (the rate falls every summer as tourist
volume climbs; 7.8% Dec → 2.9% Jul) and must not be used.

**⚠️ Unresolved tension — do not quote $24,900 as a bottom-line loss.** Over the same
window total in-store net was **UP 2.7% YoY** ($756,320 → $776,663), basket $35.72 →
$39.00. Defensible statement: *"we lost a $460/day product line and cannot yet say how
much of that basket left the store versus converted to something else."* Settling it
needs basket-level analysis of what gift-set buyers bought instead — not done.

---

# PART 5 — Open items

### Needs Robert
1. **The $24,900 vs +2.7% tension** — commission the basket-level analysis, or accept the
   hedged framing.
2. **Send the Melissa handover** — `MELISSA-HANDOVER-gift-set-bundles-2026-08-09.md` is
   ready and now carries the measured figures plus the caveat.
3. **Dead endpoints** — `/api/stats`, `/api/stats/ceo`, `STORE_LOCATIONS` still present,
   still carrying the Round 1 skew bug. Deletion not authorised.

### Needs Melissa (Shopify Admin — we hold no `write_products`)
4. **The 33 gift sets** — un-bundle / duplicate / retire. Component stock is already in
   the stores, so option A needs no restock.
5. **`kpi_targets` ends 2026-08-31** — no daily plan for ANY store from September.
   Plus Bracebridge is missing **2026-08-27** (30/31 days for August).

### Needs the other Mac (`robertachal@Roberts-Mac-mini`, `~/Downloads/neob-store-portal-v4`)
6. **Portal pre-fill question — HIGH.** 28 of 37 August store-days match
   `daily_sales.net_sales` within 0.05% (median ratio 1.0000), while every doc says staff
   enter *gross* and Phase 4 is not started. If the form pre-fills, **the Gap column is
   comparing a value to itself** and has been reading ~0 by construction. Fix is a product
   decision, not a display change. Full brief in the handoff spec §1.
7. **Portal scorecard half of item 2** — needs a `last7` period added to `/api/scorecard`
   on the mini FIRST (it has none, and returns YTD dollars). Coordinate; do not hand-roll
   a window in the portal.

---

# PART 6 — Working notes

| Thing | Value |
|---|---|
| Repo | `/Users/neoboperations/neob/production-assistant` |
| DB | `data/neob.db` (182,933 orders; `order_discounts` 72,991 rows) |
| App | port **3001**, `launchd` **not pm2** |
| Reload | `sudo launchctl kickstart -k system/com.neob.production` (Robert only — needs password) |
| Remotes | push **`macmini` only**; never pull `origin main` onto the mini |

### Gotchas learned this session

1. **`grep` here is `ugrep`** — it **silently** skips files it classifies as binary and
   prints nothing. `server/sync/net_sales.js` (2 deliberate NUL bytes) is the known case.
   **Use `-a`** when a search of a file you know exists comes back empty. Three of my
   greps returned false negatives before I caught this.
2. **`NEOB_DB_PATH`** (added to `database.js`, defaults to production, unset in `.env`)
   lets data-writing features be tested against a copy. Used for every item 5/6 test —
   verified 0 file handles on production during the runs.
3. **Back up with the SQLite backup API, not `cp`** — there is a live ~7.7 MB WAL, so a
   file copy is a stale snapshot. `src.backup(dest)` then verify `integrity_check` + row
   counts. Two verified backups taken this session (see `data/neob.db.backup-pre-*`).
4. **`order_line_items` is empty before 2026-01** (0% coverage through 2025-11, 17% in
   Dec, 100% from Jan). Any SKU-based historical analysis is capped at 2026-01.
   `order_discounts` has no such limit — it came from the order payload.
5. **Backfill pacing decays.** Costed at ~15 min from 3 bare fetches; actual **95.2 min**
   for 732 pages, because throughput falls with pagination depth (2,451 → ~1,900
   orders/min) and the estimate excluded per-page write cost. Cost future backfills from a
   steady-state sample *with* writes attached.
6. **Robert's uncommitted work** was recovered to `main` in `8fb2d35` — it had been
   running in production untracked since Round 1. `staff.html`/`api.js` are now clean.

### Verification approach that paid off

Executing the **real** `buildStoreRows` / `renderGrid` out of the HTML against live API
data, rather than mocking. Caught the column/cell alignment and the edit markers. And a
staged blob that differed from the working tree (shell escaping ate a regex's backslashes,
staging `/^https?:///i` — a syntax error) was caught only because the staged content was
diffed rather than assumed. **Diff what you stage.**
