# RESUME — Round 2 dashboard fixes (all six items shipped)

**Session date:** 2026-08-09
**Branch:** `round2-dashboard-fixes` @ `1ad53d9`, pushed to `macmini`
**`main`** @ `8fb2d35`, pushed to `macmini`. **`origin` untouched** (`3ba19ff`) — different repo.
**Spec:** `neob-dashboard-fixes-BUILD-2.md` (corrected in-place this session)
**Predecessor:** `RESUME_ceo-dashboard-fixes-2026-08-07.md`

> ## ⛔ READ PART 7 FIRST
> A major correction landed late in this session. **The gift sets never stopped selling
> and no revenue was lost** — Shopify Analytics shows 32 bundles selling, 100% POS. The
> Jun 15 "cliff" is an **attribution gap**, not a sales stoppage.
> **PART 4 is entirely withdrawn.** Part 1's item-3 row and Part 5's Melissa items are
> superseded. The reasoning error behind it is documented in Part 7 and is the most
> useful thing in this document.

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
| **3** Bundles + Loyalty | Loyalty tile moved to `retail_total` (was `total`, which included Online's auto-enrolled 93%) — **still correct**. The bundle half is **superseded**: the "root cause" it cited was wrong, and the none-state was replaced by an attribution-gap state in `11e1605`. See Part 7 |
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

# PART 4 — ⛔ SUPERSEDED AND WRONG — "the gift-set loss, now measured"

> **There was no loss. See PART 7.** Every figure in this section is withdrawn. It is
> kept because the *shape* of the error is instructive: the analysis was careful,
> seasonality-controlled, and confidently wrong, because it measured a number derived
> from the same blind source as the claim it was testing.
>
> `$0.00` post-cutover is not zero sales — it is **zero attributable** sales. The
> gift-set lines vanished from `order_line_items` because Shopify Bundles stopped
> emitting them, not because nothing sold. Every derived figure below inherits that.
>
> The +2.7% YoY top line flagged as an "unresolved tension" below was in fact **the
> data telling us the premise was wrong**, and it was rationalised away instead.

Backfilling `order_discounts` made this answerable for the first time.

| | Value | Status |
|---|---|---|
| Gift-set line revenue, Apr 1 – Jun 14 (75 d) | $34,685.52 = $462/day | ⛔ withdrawn |
| Gift-set line revenue, Jun 16 – Aug 8 (54 d) | $0.00 | ⛔ means *unattributable*, not zero |
| Not rung up since the cutover | ~$24,900 | ⛔ withdrawn — no revenue was lost |

~~**$462/day supersedes the earlier ~$570/day**~~ — both withdrawn.

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
1. ~~The $24,900 vs +2.7% tension~~ — **VOID (Part 7).** There was no loss; the +2.7%
   was the data contradicting the premise. Nothing to commission.
2. ~~Send the Melissa handover~~ — **DO NOT SEND.**
   `MELISSA-HANDOVER-gift-set-bundles-2026-08-09.md` is built on the withdrawn premise.
   Delete it or mark it void; there is nothing for Melissa to rebuild.
2b. **Real bundle attribution** — the actual outstanding work. See Part 7.
3. **Dead endpoints** — `/api/stats`, `/api/stats/ceo`, `STORE_LOCATIONS` still present,
   still carrying the Round 1 skew bug. Deletion not authorised.

### Needs Melissa (Shopify Admin — we hold no `write_products`)
4. ~~The 33 gift sets — un-bundle / duplicate / retire~~ — **VOID (Part 7).** The
   bundles sell fine on POS; only our attribution was broken. **No Shopify change is
   needed and nothing is owed to Melissa.**
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

---

# PART 7 — ⛔ MAJOR CORRECTION (2026-08-09, late session)

## The gift sets never stopped selling. There was no lost revenue.

Shopify's own bundle Analytics (ShopifyQL) shows **32 bundles with sales in the last 30
days, 100% Point of Sale channel, zero online.** They have been selling in stores the
whole time.

**2026-06-15 is the date the gift sets were CONVERTED to Shopify Bundles — not the date
they stopped selling.** DTC stayed visible only because it runs on five *ordinary*
products (`GS0000`–`GS0005`, `requiresComponents = false`) that do emit SKUs.

### What actually broke: attribution, not sales

Shopify Bundles records **component** line items on an order and **never the bundle
parent** — *"SKUs are listed for individual items in orders, not for the bundle SKU."*
Our dashboard attributes by bundle SKU, which Shopify never emits. The metric went to
zero on the conversion date and stayed there.

### ⚠️ The reasoning error — the part worth keeping

Four checks "independently confirmed" the stoppage: **SKU, product_id, product title, and
a tag-agnostic title sweep.** All four query `orders` / `order_line_items` — the one
table where the bundle parent **structurally cannot appear**.

**That is one source queried four ways, not four independent confirmations.** Their
agreement was guaranteed by construction and carried zero information. Compounding it,
the mechanism was *written down in the Aug 7 report itself* ("the order records component
line items — component SKUs and product_ids, no bundle line, no `GS####` SKU") and the
opposite conclusion was drawn from it anyway. If the bundle SKU never appears in orders,
its absence from orders cannot be evidence of anything.

Two signals were rationalised away rather than followed:
- **Retail net was UP 2.7% YoY** over the "loss" window (Part 4). Recorded as an
  "unresolved tension"; it was the data saying the premise was wrong.
- **Five GS-SKU sales appeared in July**, after the supposed stoppage. Explained away as
  DTC SKUs sold in-store — true, but it should have prompted the question of *why only
  the non-Bundle SKUs were visible.* That is the whole mechanism, sitting in plain view.

### RULE ADOPTED (now in the BUILD-2 pre-flight)

> **When confirming that something did NOT happen, at least one check must come from a
> DIFFERENT SYSTEM — not a different query against the same one.**

One look at Shopify's own Analytics would have settled this in a minute.

### Withdrawn

`$570/day` · `$462/day` · `~$24,900` · `~$30,000` · `"unsellable at POS"` ·
`"Shopify Bundles does not support POS"` · the entire "recapture / did Mix & Match absorb
it" analysis (Part 4) · `MELISSA-HANDOVER-gift-set-bundles-2026-08-09.md` — **do not
send it; there is nothing for Melissa to rebuild.**

Still true and still useful: all 33 live POS products are `requiresComponents = true`;
the 33 pre-conversion products were deleted (404); the Mix & Match promo is real and now
captured in `order_discounts`.

### Fixed immediately (commit `11e1605`)

`ceo.html` was live and stating *"No POS bundle sales since Jun 15 · verified, not a data
error"* — the most confident wrong statement on the page. Now renders an **attribution
gap**: tile `n/a` (neutral, was "None" in red), store cells `n/a` with a gray dot, and a
footnote that says bundles ARE selling, cites the 32 / 100% POS figure, explains the
component-SKU mechanism, and records that the earlier "verified" reading was one source
read four ways.

### ✅ Real bundle attribution — DONE and reconciled exactly (2026-08-09)

Shipped in `70aec79` (module + schema) and `47877e1` (nightly, backfill, metric).
Live in production after reload.

**`bundleComponents` does not exist** at API 2024-10 or 2025-01 — introspected both. The
field that does carry the bundle parent is **`LineItem.lineItemGroup`**
(id / title / productId / variantId / variantSku / quantity), one group per bundle
purchased, shared by its component lines. It is absent from the REST 2023-10 order
payload the main sync reads, which is exactly why every REST-side check was blind to it.

Implemented as `server/sync/bundle_attribution.js` writing `order_bundles`, running
**alongside** the REST order sync (the `net_sales.js` pattern) rather than converting the
whole order sync to GraphQL for one field.

**THE LAST GAP WAS UNITS vs ORDERS.** Counts sat ~11% below Shopify until the exact
ShopifyQL figures arrived: `bundles_ordered` counts bundle **units**; I was counting
distinct **orders**. On 2026-07-10..2026-08-08:

| Bundle | Shopify | Ours (units) |
|---|---|---|
| Botanical Bliss Glorious | 44 | **44** |
| Body Care Glorious | 41 | **41** |
| Lavatory Luxury Glorious | 28 | **28** |
| The Complete Ritual Glorious | 23 | **23** |
| The Top Tour | 22 | **22** |
| Distinct products | 32 | **32** |

Reporting one figure while labelling it the other was the entire discrepancy, so the
endpoint now returns **both**, named for what they are: `bundle_units` (matches Shopify)
and `bundle_orders` (share of baskets — what a penetration % needs).

**The false cliff is gone.** Retail penetration by month, bridging the legacy SKU match
(pre-conversion) with `order_bundles` (post):

```
2026-05  5.2%    2026-06  4.7%    2026-07  4.0%    2026-08  3.9%
```

July and August previously read **0.0%**.

**Backfill run** from 2026-01-01: 434 pages, 43,306 orders, **902 rows**, 6.5 min, zero
errors. Earliest row **2026-06-15** — exactly the conversion date, with zero rows in the
10,000 orders scanned before it, confirming `lineItemGroup` simply does not exist
pre-conversion. Verified backup taken first.

**Nightly**: `syncOrderBundlesTrailing(3)` at 3:15 AM Toronto — between orders (3:00) and
net-sales (3:30) so the mirror is populated first. Confirmed armed in the production
launchd log.

### Three things caught in verification, not review

1. **`scheduler.js` holds no `db` import**, but the first error handler called
   `db.prepare()`. Passed `node --check`; would have thrown a `ReferenceError` *only when
   a sync failed* — turning a recoverable error into a crash in the one path that matters.
2. **9 rows stored a location contradicting `orders.location_name`** — GraphQL
   `physicalLocation` is null for web/draft orders. The resolver now prefers the mirror;
   re-ran, zero disagreements.
3. **13 rows carry numeric SKUs**, all 2026-06-15..22: the DTC gift sets were *also*
   briefly converted to Bundles during the June change and reverted. Outside every
   reporting window; 889 of 902 rows carry proper `GS####`.

### The zero-state is deliberately inverted

`ceo.html` once asserted *"verified, not a data error."* It now says a zero means
**attribution has probably broken — check Shopify Analytics before concluding anything.**
Given this metric's history, a zero should prompt suspicion of our own code first.

### What made this verifiable

The acceptance criterion came from a **different system** (Shopify's own Analytics), not
another query against our orders table. That is the only reason the units-vs-orders error
surfaced instead of shipping. It is the rule now in the BUILD-2 pre-flight, and it is the
single most useful thing to carry out of this session.
