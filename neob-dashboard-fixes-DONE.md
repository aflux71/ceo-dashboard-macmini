# neōb CEO Dashboard Fixes — Completion Report

**Date:** 2026-08-07
**Branch:** `ceo-dashboard-fixes-aug7` (off `main`)
**Spec:** `neob-dashboard-fixes-BUILD.md` (supplied in-conversation; never existed on disk)
**Files changed:** `server/public/ceo.html`, `server/routes/api.js`, `server/sync/shopify.js`
**Backups:** `_bak/{api.js,ceo.html,shopify.js}.1786131093`

> `server/public/staff.html` also shows as modified. That is **pre-existing uncommitted
> work** (manager codes / login log), unrelated to this task and untouched by it.

---

## 0. ROOT CAUSE — lexicographic timestamp skew

**This is the largest correctness win in the change, and it was not in the spec.**

`orders.created_at` is stored as Toronto local time **with an offset**
(`2026-07-08T00:44:13-04:00`). Every windowed query compared it against UTC `Z`
instants (`2026-07-01T04:00:00.000Z`) — and SQLite compares TEXT
**lexicographically**, character by character. It never parsed either side as a time.

Two independent errors resulted, on every windowed number on the dashboard:

1. **A 4–5 hour boundary skew.** `'2026-07-08T00:44:13-04:00'` vs
   `'2026-07-08T04:44:13.000Z'` are the *same instant*, but compare as `00 < 04`.
   Every window silently started and ended in the wrong place by the UTC offset.
2. **An exclusive upper bound.** `created_at < to` combined with the above meant the
   final day of every range was dropped entirely. A same-day query
   (`date_from=date_to=2026-06-15`) returned **nothing at all**.

**This is the root cause of the discrepancies in the spec's own figures.** The spec
quotes May as 6,079 retail orders and July as 11,083. Those are the *skewed* numbers.
Corrected: **6,310** and **11,455**. Reproducing the old comparison returns 11,083 for
July **exactly**, confirming the mechanism.

Fixed by comparing on the Toronto calendar date —
`substr(created_at,1,10) BETWEEN ? AND ?` — inclusive at both ends, across all six
windowed queries plus `/stats/ceo-net`. Because `created_at` is already Toronto-local,
`substr(...,1,10)` *is* the Toronto calendar date, so this is both correct and simpler
than converting instants.

Anyone touching date filtering in this codebase should read §0.1 before assuming
`created_at` is UTC. It is not.

---

## 0.1 Merge gate — timezone verification

### `orders.created_at` is stored in **Toronto local time with an explicit
### offset**, not UTC. The `substr()` change is correct.

Three-way count, run on both sides of the DST boundary:

| Date | (a) `substr(created_at,1,10)` | (b) `date(created_at,'localtime')` | (c) UTC-boundary range |
|---|---|---|---|
| 2026-08-05 (EDT) | **293** | **293** | **293** |
| 2025-11-20 (EST) | **127** | **127** | **127** |

**All three agree exactly.** Nothing was wrong; nothing needed changing on this axis.

Four independent confirmations:

1. **Raw values carry the offset:** `2026-08-05T08:11:48-04:00`, `2025-11-20T10:08:22-05:00`.
   UTC storage would have no offset at all.
2. **The exact failure case that was raised** — late-evening sales — do *not* roll forward:
   `2026-08-06T23:36:18-04:00` → `substr` = `2026-08-06`, `localtime` = `2026-08-06`.
   Under UTC storage this 23:36 sale would land on the 7th.
3. **Offsets switch on 2025-03-09 and 2025-11-01** — precisely Toronto's DST transitions.
4. **Retail sales peak 11:00–16:00** in the stored hour field, i.e. real store hours in
   local time. Under UTC storage the peak would sit at 15:00–20:00.

Corroborated by the schema itself: `daily_sales.sale_date` is commented
`-- YYYY-MM-DD, America/Toronto`. Toronto dates are already the codebase's canonical key.

`date(created_at,'-4 hours')` was **not** used anywhere — it would hardcode EDT and break
in November, as flagged.

---

## 0.2 Merge gate — index verification

### **Full table scan, both before and after. No regression.**

```
NEW (substr BETWEEN):   SCAN orders  |  USE TEMP B-TREE FOR GROUP BY
OLD (raw created_at):   SCAN orders  |  USE TEMP B-TREE FOR GROUP BY
```

Plans are byte-identical. `orders` carries exactly one index — `sqlite_autoindex_orders_1`,
the primary key on `id`. **There was never an index on `created_at` to lose.** The
observation that `substr()` is non-sargable is correct in general; here it is
non-sargable against nothing. Cost: ~19 ms per scan over 181,959 rows.

*Open opportunity (not done — requires a DB write):* an expression index on
`substr(created_at,1,10)` would make these six queries sargable for the first time,
i.e. strictly better than the pre-existing code. Awaiting go-ahead.

---

## 1. What changed, and where

### `server/sync/shopify.js`

| Change | Location |
|---|---|
| `BUNDLE_TAG_POS/DTC` → `BUNDLE_TAGS_POS/DTC` arrays, OR-matched with `In Store Gift Set` / `Online Gift Set` | `~L130` |
| SKU-less tagged products no longer dropped: upserted under synthetic `PID:<id>` key so `product_id` matching works; `bySku` filters these out so they can't fake a SKU match | `noSku` path, formerly `L165` |
| `getLoyaltySignups(window)` accepts a date window; six locations run **concurrently**; 5-minute in-process cache | `~L433` |
| `countCustomersWithTier()` replaces two paginated searches per store with one pass | new |
| Removed dead `countCustomers()` and `BON_TIER_CLAUSE` | — |

### `server/routes/api.js`

| Change | Effect |
|---|---|
| `resolvePeriod()` rewritten: returns **inclusive Toronto date strings**; all named windows end **yesterday**; added `90d`; unknown periods throw HTTP 400 listing valid values | items 1b, 1c, 2 |
| Six range comparisons → `substr(created_at,1,10) BETWEEN ? AND ?` | 1b |
| `by-store-net`: `toTorontoDate()` replaces `torontoDay(new Date(x))`; named windows end yesterday | 1b, 2 |
| `by-store-net`: returns `data_through` + `data_stale` | staleness signal |
| `/bundles/penetration`: returns `pos_last_sale_date`; echoes `custom` when explicit dates given | 1c, 1.4 |
| `/stats/loyalty-signups`: accepts `date_from`/`date_to`; joins retail-orders denominator; returns `orders`, `signup_rate_pct`, `comparable`, `enrolment`, and a retail-only `retail_total` | item 4 |
| `/stats/ceo-net`: 30d/YTD windows now end **yesterday** (were ending today, disagreeing with the store table by $17,986.54); secondary gross figures moved off the §0 skew | item 2 |
| Three catch blocks honour `err.status` | — |

### `server/public/ceo.html`

| Change | Effect |
|---|---|
| `getPeriodDates()` rewritten on UTC-anchored Toronto dates; every window ends yesterday; `noCompleteDays` flag | item 2 |
| Bundle tile renders **"None" / "No POS bundle sales since Jun 15 · verified, not a data error"**; store cells show `none`, not `0.0%`; red footnote citing the three independent confirmations | item 1.4 |
| `KPI_TARGETS.aov: 55 → 45`, added `aov_floor: 40`; three-band logic in both table and tile; subtitle `Target: $45 · Floor: $40` | item 3 |
| Removed dead `aov` / `aovFromOrders` | item 3 |
| Loyalty scoped to selected period; renders `1,293 · 26%`; Online marked `‡` and excluded from retail comparison; health dot unchanged | item 4 |
| Staleness banner when `data_through < window end` | new risk |

**The AOV calculation itself was not touched**, per constraint. Nor was the loyalty health
dot (`conversion_pct` / `first_timers`).

---

## 2. Acceptance results (live API, actual responses)

Item #1's original criterion — "non-zero bundle_orders for all five retail stores,
Jul 1–31" — is **void and was not ticked**. It is unmeetable: the sales do not exist.
Replaced with (a)/(b)/(c) below.

| # | Check | Result |
|---|---|---|
| a | May 1–31 retail | `orders 6310, bundle 327, ` **`5.2%`** ✅ · DTC `5.3%` (in the 4–6% band) ✅ |
| b | Single day `2026-06-15` | `orders 183, bundle 10, 5.5%`, 5 stores ✅ — previously returned `stores:[]` |
| c | Jun halves sum to whole | 3,822 + 5,647 = **9,469** = whole month ✅ exact |
| 1c | `period=90d` | `2026-05-09 → 2026-08-06`, **90 days**, labelled `90d` ✅ |
| 1c | `period=45d` / `bogus` | **HTTP 400** + valid-period list ✅ |
| 2 | Default 30d ends yesterday | `2026-07-08 → 2026-08-06` ✅ |
| 4 | Loyalty rate | retail **2,949 / 11,455 = 25.7%**; per-store 21.9–34.8% ✅ |
| 4 | `conversion_pct` / `first_timers` | unchanged, 98.6% total ✅ |
| 4 | Loyalty < 5 s | ⚠️ **5.3 s cold**, 0.11 s warm — **NOT MET**, see §5 |
| 3 | AOV dots: "four amber, Elora red" | ⚠️ **Logic correct, spec's predicted colours do NOT reproduce** — see §2.1 |
| 2 | MTD on the 1st / YTD on Jan 1 | ✅ verified by forced-clock test — see §2.2 |
| — | Staleness flag fires | `to=2026-08-07` → `data_through: 2026-08-06, data_stale: true` ✅ |
| — | Bad input doesn't crash server | 400/500 JSON returned, next request `HTTP 200` ✅ |
| — | Hero tiles agree with store table | ✅ after the `ceo-net` fix (§8); previously off by $17,986.54 |

### 2.1 AOV bands — live values, both windows

The three-band logic is implemented and behaves exactly as specified
(green ≥ $45, amber ≥ $40, red < $40). **But the spec's predicted outcome — "four amber,
Elora red" — does not reproduce on live data in either window.** Reporting what the code
actually returns, not the prediction:

**Default view (30d, `2026-07-08 → 2026-08-06`) — what Robert sees on opening the page:**

| Store | AOV | OLD (target 55, amber @ 41.25) | NEW (45 / 40) |
|---|---|---|---|
| Flower Farm | $43.38 | amber | **amber** |
| Queen Street | $39.49 | red | **red** |
| Elora | $35.11 | red | **red** |
| Stratford | $39.06 | red | **red** |
| Bracebridge | $39.12 | red | **red** |
| Festivals & Events / Online/DTC | — | gray | **gray** |

**YTD (`2026-01-01 → 2026-08-06`) — closest to the spec's §3 table:**

| Store | AOV | OLD | NEW | Spec predicted |
|---|---|---|---|---|
| Flower Farm | $45.09 | amber | **green** | amber ← **mismatch** |
| Stratford | $41.56 | amber | **amber** | amber ✅ |
| Queen Street | $41.03 | red | **amber** | amber ✅ |
| Bracebridge | $39.97 | red | **red** | amber ← **mismatch (by 3¢)** |
| Elora | $39.39 | red | **red** | red ✅ |

Two reasons the prediction misses:

1. **The spec's §3 numbers are from a different/older window.** It lists Flower Farm as
   `203,558.85 / 5,007 orders = $40.65`; live YTD is **13,566 orders / $45.09**. Flower
   Farm has since crossed $45 → green. Bracebridge sits at **$39.97 — three cents under
   the $40 floor** → red, not amber.
2. **The spec predicted against YTD, but the table defaults to 30d.** On 30d most stores
   genuinely sit in the $39s, so four dots are still red.

**This does not mean the change failed.** Its stated purpose was to stop painting red over
a metric that is up 8% YoY *for the wrong reason*. That is achieved: dots now mean "below
the real $40 program floor" instead of "below 75% of a stale gross-basis $55 target." On
30d the stores really are below $40, so red is the honest answer. Queen Street moving
red → amber on YTD is the change working exactly as intended.

⚠️ **Worth Robert's attention:** Bracebridge at **$39.97** will flip amber on a few cents
of movement, and Flower Farm at **$45.09** will flip back to amber just as easily. Do not
read either dot as a stable signal this month.

### 2.2 MTD on the 1st / YTD on Jan 1 — forced-clock test

This branch cannot occur naturally until 2026-09-01, so `getPeriodDates` was extracted
from `ceo.html` verbatim (not retyped) and run against a stubbed clock:

```
MTD @ 2026-09-01 00:05 Toronto   from=2026-09-01 to=2026-08-31 noCompleteDays=true
                                 label="Month to date — no complete days yet"
MTD @ 2026-09-02 09:00 Toronto   from=2026-09-01 to=2026-09-01 noCompleteDays=false
                                 label="Sep 1 – Sep 1"
YTD @ 2027-01-01 00:05 Toronto   from=2027-01-01 to=2026-12-31 noCompleteDays=true
                                 label="Year to date — no complete days yet"
YTD @ 2027-01-02 09:00 Toronto   from=2027-01-01 to=2027-01-01 noCompleteDays=false
                                 label="Jan 1 – Jan 1"
```

Correct on all four: `from > to` is detected rather than clamped, so no previous-month day
is ever shown labelled "MTD" and no 2026 figure appears labelled "YTD" on Jan 1. The
frontend also skips the API call entirely for an inverted window and renders `—`. Both
recover to a normal one-day window on the 2nd.

Jun 1–15 returned **190** bundle orders, not the spec's "~180". The extra 10 are Jun 15's,
which the old exclusive bound dropped: 180 + 10 = 190. The fix explains the delta exactly.

### Sample response — `/api/bundles/penetration?date_from=2026-05-01&date_to=2026-05-31`

```json
{
  "period": "custom", "from": "2026-05-01", "to": "2026-05-31",
  "target_pct": 10, "data_since": "2026-05-01",
  "label": "Packaged Bundle %", "pos_last_sale_date": "2026-06-15",
  "retail_total": { "orders": 6310, "bundle_orders": 327, "bundle_pos_pct": 5.2 },
  "dtc":          { "orders": 228,  "bundle_orders": 12,  "bundle_dtc_pct": 5.3 }
}
```

### Sample response — `/api/stats/loyalty-signups?date_from=2026-07-01&date_to=2026-07-31`

```
Queen Street   rate=21.9  comparable=True   staff-ask
Flower Farm    rate=25.5  comparable=True   staff-ask
Elora          rate=26.7  comparable=True   staff-ask
Stratford      rate=34.8  comparable=True   staff-ask
Bracebridge    rate=32.7  comparable=True   staff-ask
Online         rate=84.8  comparable=False  auto-at-checkout

retail_total: {"first_timers":2982,"signups":2949,"orders":11455,"signup_rate_pct":25.7}
all_total   : {"signups":3167,"orders":11712,"signup_rate_pct":27.0}
```

---

## 3. What shifted under you (before/after)

**Company net_sales for explicit month windows: nothing moved.** Net sales read
`daily_sales.sale_date`, which was already inclusive on both ends
(`sale_date >= ? AND sale_date <= ?`). The `substr` change touches `orders.created_at` only.

| Month | Before | After |
|---|---|---|
| May | $287,940.40 | $287,940.40 |
| June | $439,978.97 | $439,978.97 |
| July | $520,775.58 | $520,775.58 |

**Default windows did move — because they now end yesterday:**

| Window | Before | After | Δ |
|---|---|---|---|
| 30d | $449,394.99 / 11,371 ord | $467,381.53 / 11,867 ord | **+$17,986.54 (+4.0%)** |
| YTD | $1,733,588.12 / 42,021 ord | $1,733,588.12 / 42,021 ord | none |

The 30d rise comes **entirely from gaining a complete Jul 8 at the start**, not from
dropping today: Aug 7 has no `daily_sales` row yet, which is also why YTD is unchanged.

**Order counts in `/bundles/penetration` — the old exclusive bound dropped each month's
last day:**

| Month | Before | After | Δ |
|---|---|---|---|
| May | 6,079 | 6,310 | +231 |
| June | 9,153 | 9,469 | +316 |
| July | 11,083 | 11,455 | +372 |

July's "before" figure of **11,083 matches the spec's quoted number exactly**, confirming
the old behaviour was faithfully reproduced before being changed.

---

## 4. HANDOVER FOR MELISSA — retail gift sets stopped selling

**This is a merchandising issue, not a dashboard bug.** The metric is working correctly;
the sales stopped. Robert is taking this to Melissa.

### The finding

**Last sale of any POS-tagged bundle, by any identifier: `2026-06-15T15:36:30-04:00`.**

Confirmed three independent ways, all agreeing exactly:

| Match method | May | June | After Jun 15 |
|---|---|---|---|
| SKU (production code) | 327 | 190 | **0** |
| `product_id` | — | — | **0** |
| Product title | 327 | 190 | **0** |

A fourth, deliberately maximal sweep — **ignoring tags entirely**, matching any retail line
item whose title contains gift / set / bundle / collection / box — returned **73 orders out
of 19,127 (0.38%)** since Jun 15, against a **5.2% May baseline**. Those 73 are hand-typed
register entries (`sachet bundle`, `Bundle bag`, `Bundle 5 for 50`), plus 11 `neob Gift
Card` false positives. There is no hidden population of bundle sales.

Ruled out as explanations:

- **Not a data-quality cliff.** Retail NULL-SKU rate is stable across the boundary
  (5.5% → 5.8% → 6.2% → 5.7% → 3.7%); distinct SKUs hold at ~300.
- **Not delisted products.** All 66 POS-tagged products are `active`.
- **Not a tag mismatch.** `shopify.js` uses `neob-bundle-pos`; the DB contains
  `neob-bundle-pos`. Exact match. The plural (`neob-bundles-pos`) theory in spec §0 is
  wrong — that was never the bug.
- **Not a secondary-tag gap.** Correspondence is 1:1 both channels (see §6).

### The likely mechanism — duplicate products created at the cutoff

66 products carry `neob-bundle-pos`, in **two groups of 33**:

| Group | SKUs | In accumulator | Last updated | Sales |
|---|---|---|---|---|
| A — original | Yes (`GS0006`, `GS0024`…) | Yes | 2026-08-06 | stopped Jun 15 |
| B — duplicates | **None** | No (SKU-less) | **Jun 12–15, 2026** | **never sold, 0 orders** |

Group B carries **duplicate titles of Group A**, created right at the cutoff date:

```
9457744019681  Aches and Pains Collection          2026-06-14T11:11:34-04:00
9416058962145  Body Care Glorious Collection       2026-06-14T13:29:09-04:00
9416065351905  Body Care Lemongrass Collection     2026-06-15T00:05:28-04:00
9416047231201  Body Care Massuet Collection        2026-06-14T17:54:38-04:00
9416062107873  Body Care Rose Geranium Collection  2026-06-12T15:43:42-04:00
9415838957793  Botanical Bliss Glorious Collection 2026-06-14T17:50:57-04:00
9415860453601  Botanical Bliss Lemongrass Coll.    2026-06-14T10:17:11-04:00
9415797899489  Botanical Bliss Massuet Collection  2026-06-14T13:34:08-04:00
```

**Reading:** during the June bundle reset the collections were re-created as new product
records **without SKUs**, right as the originals stopped selling. Neither group has sold
since. The most likely explanation is that the gift sets came off the POS floor around
Jun 15 and were never re-listed in a sellable state.

### Questions for Melissa

1. Are the gift sets physically on the shelf in the five stores today?
2. If yes, what do staff ring them up as? (Currently the only bundle-ish register entries
   are free-text like `Bundle 5 for 50` with **no SKU**, which cannot be attributed.)
3. Should Group B (the 33 SKU-less duplicates) be deleted, or given SKUs and published?

**Until a bundle product has a SKU, its sales cannot be attributed reliably** — the
accumulator is SKU-keyed precisely so attribution survives the monthly product reset.

---

## 5. Where the spec was wrong

| Spec claim | Reality |
|---|---|
| §0 — "POS matching stopped; the `-pos`/`-dtc` split wasn't applied to the POS half" | **Wrong.** Matching is correct. POS *selling* stopped. Verified 4 ways. Implementing §1 as written would have produced a no-op and buried the finding. |
| §0 — tag may be plural `neob-bundles-pos` | **Wrong.** Code and DB both use singular `neob-bundle-pos`. Exact match. |
| §1.4 — "tags may not be carried into the DB" | **Not applicable.** `products.tags` is populated (134/508 non-blank; 81 mention bundle/gift set). No sync change needed for tags. |
| §1 — "match on tag, OR-ing the secondary tag, will fix the zero" | Added as insurance, but it is **not** the fix and is not presented as one. Correspondence is already 1:1. |
| §4.4 — "This endpoint times out; **index it**" | **Wrong diagnosis.** There is no DB query to index — it is 12 sequential paginated Shopify GraphQL calls. Fixed with concurrency + single-pass counting + caching instead. |
| §1 acceptance — "non-zero bundle orders, all five stores, July" | **Unmeetable.** Not ticked. Replaced with (a)/(b)/(c). |
| Quoted figures (May 6,079 / Jun 1–15 ~180 / Jul 11,083) | Produced by the buggy exclusive+skewed comparison. Corrected figures are 6,310 / 190 / 11,455. July's 11,083 reproduced exactly, confirming the diagnosis. |

---

## 6. Secondary-tag audit (requested)

Cross-tab of primary vs secondary tags, both channels:

| Side | Both tags | Primary only | Secondary only |
|---|---|---|---|
| POS (`neob-bundle-pos` / `In Store Gift Set`) | 66 | 0 | **0** |
| DTC (`neob-bundle-dtc` / `Online Gift Set`) | 15 | 0 | **0** |

Zero cross-channel contamination (no product carries `neob-bundle-pos` + `Online Gift Set`
or the reverse). **There is no gap today** — DTC is not undercounting. The OR-match was
added purely as insurance against a product losing one tag in the Shopify admin, and the
"did any secondary-only product sell after Jun 15" question is moot: there are none.

---

## 7. New risk found and addressed — silent short windows

Because every window now **ends on yesterday**, but `daily_sales` only gains yesterday's
row when the **3:30 AM** net-sales sync runs (`scheduler.js:66`), a failed or not-yet-run
sync would silently truncate every figure on the page.

Quantified on the current 30d window: a missed Aug 6 sync would silently drop
**$15,367.26 and 347 orders (3.3%)** with no visible indication.

**Fix:** `by-store-net` now returns `data_through` (max `sale_date`) and `data_stale`. The
dashboard renders a red banner above the hero when `data_through < window end`:

> ⚠ Sales data only reaches 2026-08-06, but this window ends 2026-08-07. Every figure
> below is missing its most recent day(s) — the 3:30 AM net-sales sync has not run or failed.

Verified live: `to=2026-08-07` → `data_stale: true`; normal 30d → `data_stale: false`.

---

## 8. Also fixed along the way (not in the spec)

- **Lexicographic timestamp skew — promoted to §0**, as it is the root cause of the
  spec's own discrepant figures and the largest correctness win in this change.
- **Hero KPI tiles vs store table disagreed by $17,986.54.** `/stats/ceo-net` never got
  the yesterday-anchor: it read $449,394.99 / AOV $40.65 for "30 days" while the store
  table below it read $467,381.53 / $40.49 for the same label. Its secondary gross
  figures also carried the §0 skew. Both fixed; the two now agree.
- **`by-store-net` off-by-one.** `torontoDay(new Date('2026-08-06'))` parses as UTC midnight
  = Aug 5 in Toronto, shifting date-only windows back a day. Replaced with `toTorontoDate()`.
- **Frontend day arithmetic** moved off browser-local midnight to UTC-anchored Toronto dates
  — DST-proof and correct for a viewer outside Toronto.
- **LY windows** now compare complete-to-complete. Previously `to` was today (incomplete)
  while `ly_to` was a complete day. Server-side `netSalesCompanyYoY` derives LY from the
  same corrected window (364-day DoW-matched shift), so it inherits the fix.
- **Loyalty numerator/denominator race** removed — one paginated pass means `signups` can
  never exceed `first_timers`.
- **`err.status` honoured** in three catch blocks (`by-store`, `bundles/penetration`,
  `by-store-net`), so bad input returns 400 rather than 500.

---

## 8.1 Spec item #5 — the unattributed gap, investigated

Originally report-only. Investigated on request, specifically to test whether returns and
exchanges were the cause. **They are.**

### The gap is two separate things

**1. The gap existing at all is by design, not a bug.** `net_sales_queries.js:29` defines
`NON_STORE = ['Unattributed', 'Retail (unattributed)']`, and line 193 comments that it is
*"intentionally not shown as a row; it remains in netSalesCompany's total, so store rows
may sum to slightly under company net."* The store table deliberately omits it while
company totals include it.

Current size — **$573.34 YTD out of $1,733,588.12 (0.03%)**. The spec's "$26" was the same
bucket over a smaller window. All eleven `daily_sales` buckets sum to the company total
exactly, so nothing is lost, only unattributed:

| Bucket | YTD net |
|---|---|
| Flower Farm / Queen St / Elora / Stratford / Bracebridge | (five retail stores) |
| neob HQ · 3PL-Online Orders · Ecommerce Warehouse · Online/DTC · Festivals & Events | (non-retail) |
| **Unattributed** | **$573.34** ← the gap |

**2. What lands in that bucket is overwhelmingly refunds.** An order becomes
`Unattributed` when `locationName()` (`shopify.js:71-76`) finds no known `location_id`
*and* `source_name` is neither `web` nor `pos`. Two channels do this: `shopify_draft_order`
and app `3890849`. Within those channels, refund status is decisive:

| Channel | Refunded → unattributed | Not refunded → unattributed |
|---|---|---|
| `3890849` | **7 / 7 = 100%** | 1 / 188 = 0.5% |
| `shopify_draft_order` | **5 / 7 = 71%** | 3 / 961 = 0.3% |
| **Combined** | **12 / 14 = 86%** | **4 / 1,149 = 0.35%** |

A refunded order in these channels loses its location roughly **245× more often** than a
non-refunded one. Refunds elsewhere are fine — 441 of 453 refunded orders company-wide
(97.3%) are correctly attributed.

### What this is NOT

- **Not a returns-accounting error.** Returns are recorded and netted: `daily_sales`
  carries negative `net_sales` / `net_items` on the expected days for Ecommerce Warehouse
  (−$1,631.74), 3PL-Online Orders (−$430.33) and neob HQ (−$358.11).
- **Not caused by any change in this branch.** The behaviour predates it.
- **Not `Retail (unattributed)`** — that POS-without-location bucket has **0 orders**, so
  no in-store sale is losing its location.

### Recommendation (not actioned)

Small in money, but it means **refunds and exchanges processed as draft orders are
systematically invisible in per-store numbers** — a store's refunds may not be debited
against it. Worth deciding: (a) map `shopify_draft_order` / `3890849` refunds back to the
originating order's location, or (b) surface `Unattributed` as its own visible row so it
stops being silent. Sample is small (14 refunded orders across both channels), so confirm
the mechanism in Shopify before building either.

---

## 9. Left undone — explicit list

1. **Item #5 (unattributed net sales) — INVESTIGATED, see §8.1.** Root cause identified
   (refunds via `shopify_draft_order` / app `3890849` lose their location; the gap itself is
   by design). No code change made: the recommendation needs a Shopify-side decision first.
2. **Loyalty <5 s target NOT met.** 5.3 s cold (down from ~30 s timeout / 6.3 s intermediate),
   0.11 s warm via the 5-minute cache. The residual is pagination latency: Flower Farm alone
   is 1,302 customers = 6 pages with 300 ms inter-page sleeps. Halving the sleep would save
   ~0.75 s but raises rate-limit risk with six concurrent locations. Not done.
3. **Double `renderDashboard` call left in place** (`ceo.html:~1837`). The spec called it a
   workaround for the timeout, but it is the right pattern for a live external call: render
   fast local data immediately, fill loyalty in when it lands. Removing it was not requested.
4. **Expression index on `substr(created_at,1,10)`** — would make the six rewritten queries
   sargable for the first time. Requires a DB write; awaiting go-ahead.
5. **`/api/revenue/ytd` and `getStoreRevenue()` — DELETED** (81 lines). Both were dead:
   `/api/revenue/ytd` had no caller anywhere in the repo, and `getStoreRevenue()` was
   called only from inside it. They were the last carriers of the §0 skew on the
   `api.js` surface. ceo.html's YTD comes from `by-store-net?period=ytd`, which is fixed.
   The eight endpoints ceo.html actually calls — `bundles/penetration`,
   `revenue/by-store-net`, `stats/ceo-net`, `stats/loyalty-signups`, `sync/status`,
   `tasks`, `usage/mtd`, `usage/today` — are now all skew-free.
   Still present and also dead: the legacy `/api/stats` and `/api/stats/ceo` gross
   endpoints, and the `STORE_LOCATIONS` constant (`api.js:469`), which was **already
   unreferenced on `main`** before this branch. Not removed — not in scope.
6. **One rolling operational query left as-is** — `ceo-net`'s "unfulfilled in the last 14
   days" (`api.js:~307`) still uses an ISO cutoff. It is a rolling health count, not a
   reporting window, so the 4–5h boundary skew is immaterial and item #2's rule does not
   apply to it.
7. **Frontend `lyFrom`/`lyTo`** (`ceo.html:~1132`) are computed and never read — vestigial.
   Left consistent with the corrected dates rather than deleted, as removal was not in scope.
8. **Stale pm2 entry.** `pm2` reports `neob-production` (pid 53843, started Jul 21) as
   "online", but it holds no port. The live app is pid 22469 under **launchd**
   (`/Library/LaunchDaemons/com.neob.production.plist`). Suggest `pm2 delete neob-production`
   so it stops misreporting. Not done — outside scope.
9. **Bundle `target_pct` still 10.** Left alone deliberately; the spec says the real program
   goal is 35–40% and neither is close. That is a target-setting conversation, not code.

---

## 10. Operational notes

- **Process manager is `launchd`, not pm2.** Reload with:
  `sudo launchctl kickstart -k system/com.neob.production`
- **A reload is outstanding** for two changes made after the last restart:
  1. `by-store-net` catch block (`err.status` → 400 instead of 500 on an invalid date).
  2. `/stats/ceo-net` yesterday-anchor + de-skewed gross figures. **Until this reload,
     the hero tiles still read $449,394.99 / AOV $40.65 while the store table reads
     $467,381.53 / $40.49.** After it they agree.

  Everything else in this report was verified against the running service. The §2.1 AOV
  values were read from `by-store-net`, which is unaffected by the pending reload.
- `ceo.html` is static — a browser hard-refresh is enough.
- Nothing was committed or pushed. Branch `ceo-dashboard-fixes-aug7` holds the work.
