# RESUME — CEO Dashboard Fixes + Bundle Detection Rebuild

**Session date:** 2026-08-07
**Branch:** merged to `main`, pushed to `macmini/main` (`1a7d15a`)
**Companion doc:** `neob-dashboard-fixes-DONE.md` — **§4 and §0 bundle conclusions are now WRONG, see Part 2**

---

# PART 1 — What shipped (done, merged, pushed, verified)

Four commits on `main`, pushed to `macmini` (`git@github.com:aflux71/ceo-dashboard-macmini.git`).
NOT pushed to `origin` (`neob-operations-suite_truth`) — different repo, left alone.

```
1a7d15a  Record post-deletion verification (§2.3)
1112e51  Delete dead /api/revenue/ytd + getStoreRevenue; investigate unattributed gap
8abf232  Fix ceo-net window inconsistency; verify AOV bands + month-boundary
876ff21  CEO dashboard: inclusive Toronto-date windows, yesterday anchor, AOV bands, loyalty
```

| Area | Change |
|---|---|
| **Date windows** | `resolvePeriod()` returns inclusive Toronto dates; all windows end **yesterday**; `90d` added; unknown periods → HTTP 400 |
| **Lexicographic skew** | `created_at` is Toronto-local **with offset**; was compared against UTC `Z` strings as TEXT → 4–5h skew + dropped final day. Now `substr(created_at,1,10) BETWEEN ? AND ?` |
| **ceo-net** | Hero tiles were ending *today* → disagreed with store table by $17,986.54. Fixed, now match exactly |
| **AOV** | Target 55→45, `aov_floor` 40, three-band logic. Calculation itself untouched |
| **Loyalty** | Period-scoped, `signup_rate_pct`, Online/DTC flagged non-comparable + excluded from `retail_total`. ~30s timeout → 5.3s cold / 0.11s warm |
| **Staleness** | `data_through` / `data_stale` + red banner when `daily_sales` doesn't reach window end |
| **Dead code** | Deleted `/api/revenue/ytd` + `getStoreRevenue()` (81 lines) |

**Still uncommitted in the working tree (NOT mine, do not commit):** `server/public/staff.html`
and manager-code/login-log hunks in `server/routes/api.js`. Every commit used a filtered
patch to exclude them — see Part 4 for the technique.

---

# PART 2 — ⚠️ THE BUNDLE CONCLUSION WAS WRONG

`neob-dashboard-fixes-DONE.md` §0/§4 states retail bundle sales stopped 2026-06-15 and
frames it as a merchandising problem for Melissa. **That is incorrect. Do not act on it.**

**Bundles ARE selling.** Robert confirmed they were recreated using the **Shopify Bundles
app**, and the plugin managing SKUs changed. The dashboard reads 0% because the matcher
can no longer see them — a detection failure, not a sales failure.

### What actually happens now

The Bundles app **expands a bundle into its component line items at the POS**. A bundle
sale arrives as N separate product lines, each with the *component's* SKU and product_id,
each carrying an identical per-unit discount. **There is no bundle line, no `GS####` SKU,
and no bundle `product_id` anywhere on the order.**

Live example — order **183214**, 2026-08-07, POS:

```
Lemongrass Body Wash 500ml      sku="10031"   pid=8228822974689  disc=0.00
Massuet Lavender Foot Balm      sku="205210"  pid=8228828643553  disc=0.00
Bath Bomb Peach Creamsicle      sku="2974"    pid=8228807442657  disc=0.55
Bath Bomb Niagara Lavender      sku="2867"    pid=8228807311585  disc=0.55
Italian Lemon Bath Bomb         sku="L2720"   pid=8228807049441  disc=0.55
Key Lime Bath Bomb              sku="K2718"   pid=8228807147745  disc=0.55
```

Four bath bombs, identical $0.55 discount = one bundle. Invisible to a SKU-keyed matcher.

### Where the bundle identity actually lives

In the order's **`discount_applications`**, which the sync does not store. Sample of 244
POS orders from 2026-08-01:

| Orders | type \| title |
|---|---|
| 23 | `manual \| Discount` |
| **10** | **`automatic \| Bath Bomb Mix & Match`** ← the bundle |
| 9 | `discount_code \| (untitled)` |
| 4 | `manual \| Vintage Elite 20%` |
| 1 each | Staff, custom set, 2 small soaps for price of 1 large, … |

**10 / 244 = 4.1%** — squarely in the historical 5.2% range. Strong corroboration.

### Why every previous check missed it

All four methods keyed off the bundle *product*, which never appears on the order:

| Method | Result | Why it failed |
|---|---|---|
| SKU (`GS####`) | last 2026-06-15 | bundle product not on the order |
| `product_id` | never matched | same |
| Product title | last 2026-06-15 | components carry component titles |
| Tag-agnostic title sweep | 73/19,127 = 0.38% | same |

The Jun 15 cutoff was **the day bundles were migrated to the Bundles app**, not the day
sales stopped.

### Also corrected: the "two groups of 33"

DONE doc §4 claims 33 SKU-less duplicates created Jun 12–15 that never sold. Wrong.
`synced_at` proves they are **previous-cycle products deleted from Shopify**, still in the
local `products` table because the product sync never prunes deletions:

| Group | Count | Last seen by sync |
|---|---|---|
| POS live (= Robert's 33) | 33 | 2026-08-07 |
| POS stale (deleted) | 33 | 2026-06-15 |
| DTC live (= Robert's 5) | 5 | 2026-08-07 |
| DTC stale (deleted) | 10 | 2026-06-22 |

They were never SKU-less — I inferred that from absence in `bundle_products`, but that
table is SKU-keyed and overwrites `product_id` on each reset, so old IDs vanish from it.
Consequence: the `PID:` synthetic-key fallback added in `shopify.js` addresses a case that
doesn't exist (**0 synthetic rows**). Harmless, but not load-bearing.

### Confirmed tag/SKU inventory (from Shopify, Robert-verified)

- **POS — 33 products**, tags `neob-bundle-pos` + `In Store Gift Set`, SKUs `GS0006`–`GS0041`
- **DTC — 5 products**, tags `neob-bundle-dtc` + `Online Gift Set`, SKUs `GS0000`–`GS0005`
- Accumulator holds exactly 33 POS SKUs, all `GS####` — **1:1 with Shopify, nothing missing**
- Tag matching in `shopify.js:134` is correct and OR's both tags. **The tags are not the problem.**

---

# PART 3 — NEXT SESSION: what to do

### Step 0 — Confirm the mechanism with Robert
- Is **"Bath Bomb Mix & Match"** the only bundle promotion, or are there others?
- Do the 33 `GS####` gift-set products still sell as scannable products, or are they now
  purely Bundles-app definitions?
- What are the current bundle promo names? (Needed for the allow-list in Step 2.)

### Step 1 — Decide the detection strategy

**Option A — discount-title matching (cheap, works on REST 2023-10):**
Store `discount_applications` (type + title) on orders; flag `is_bundle_pos` when an
`automatic` discount title matches a known bundle promo. Fast, no API upgrade.
Risk: manual discounts named ad-hoc ("custom set") are missed; needs an allow-list.

**Option B — GraphQL bundle components (correct, more work):**
REST **2023-10 cannot see bundle structure at all** — verified: line-item fields contain no
bundle/component/parent field and `properties` is empty on every sampled line.
Shopify exposes this only via GraphQL `LineItem.components` / bundle parent, **2024-01+**.
Requires bumping `SHOPIFY_URL` API version (`shopify.js:9`) and moving order sync to GraphQL.

**Recommendation:** A now for a working number, B later for correctness. Do NOT ship a
number without telling Robert which definition it uses.

### Step 2 — Implement
- Schema: add `discount_titles TEXT` (or a `order_discounts` table) — `server/db/schema.js`
- Sync: capture `o.discount_applications` in `insertOrders()` — `shopify.js:~222`
- Detection: extend `detectBundles()` — `shopify.js:~205`
- Backfill: re-sync orders from 2026-06-15 to populate history
- **Backfill is a DB write — confirm with Robert first**

### Step 3 — Revert the "None" zero-state
`ceo.html` currently renders **"None / No POS bundle sales since Jun 15"**. Once detection
works this must go back to a real percentage. Search `bundleNoneNote`, `bundleRetailNone`,
`pos_last_sale_date` in `ceo.html`, and `pos_last_sale_date` in `api.js`.

### Step 4 — Correct the pushed doc
`neob-dashboard-fixes-DONE.md` §0/§4 must be rewritten. **Melissa should not be sent the
current handover** — it says gift sets stopped selling, which is false.

---

# PART 4 — Working notes (environment + gotchas)

| Thing | Value |
|---|---|
| Repo | `/Users/neoboperations/neob/production-assistant` |
| DB | `data/neob.db` (SQLite, 181,959 orders) |
| App | port **3001**, `launchd` **not pm2** |
| Reload | `sudo launchctl kickstart -k system/com.neob.production` (Robert must run — no password) |
| Stale pm2 | `pm2` reports `neob-production` "online" but it holds no port. Consider `pm2 delete` |
| Backups | `_bak/<file>.<epoch>` convention |
| Shopify API | `shopify.js:9`, version **2023-10**, env `SHOPIFY_STORE_URL` / `SHOPIFY_ACCESS_TOKEN` |

### Critical gotchas

1. **`orders.created_at` is Toronto-local WITH offset, NOT UTC.** Verified three ways on
   both sides of DST. `substr(created_at,1,10)` **is** the Toronto date. Never use
   `date(created_at,'-4 hours')` — hardcodes EDT, breaks in November.
2. **No index on `created_at`** — only the PK autoindex. All these queries full-scan
   (~19ms/182k rows). An expression index on `substr(created_at,1,10)` is an open
   opportunity (needs a DB write, not done).
3. **`products` table is never pruned** — it accumulates deleted Shopify products. Always
   filter on `synced_at` when asking "what exists in Shopify right now".
4. **Loyalty numbers drift** — live Shopify search on `created_at` + *current* tag state, so
   a closed period changes slightly on re-query. Don't reconcile to the cent.
5. **Committing:** never `git add -A`. `api.js` carries Robert's unrelated manager-code work.
   Stage only your hunks:
   ```
   git diff server/routes/api.js > /tmp/full.patch
   # drop hunks containing: newManagerCode, rotate-manager, login-log, manager_code
   git apply --cached /tmp/mine.patch
   git show :server/routes/api.js > /tmp/staged.js && node --check /tmp/staged.js
   ```
6. **Two remotes** — `macmini` (tracked by `main`) and `origin` (`neob-operations-suite_truth`).
   Push to `macmini`. Memory note: don't pull `origin main` onto the mac mini.

### Open items from §9 of the DONE doc (unchanged)

- Loyalty <5s target NOT met (5.3s cold / 0.11s warm) — accepted by Robert
- AOV dots don't match spec prediction; Bracebridge $39.97 is 3¢ under the floor
- Refunds via `shopify_draft_order` / app `3890849` lose store attribution (86% of them);
  $573 YTD, needs a Shopify-side decision
- Still dead, not removed: `/api/stats`, `/api/stats/ceo`, `STORE_LOCATIONS` (`api.js:469`)

---

## One-line restart prompt

> Read `RESUME_ceo-dashboard-fixes-2026-08-07.md`. Part 1 shipped. Part 2 says bundle
> detection is broken because the Shopify Bundles app expands bundles into component line
> items — the bundle identity is in `discount_applications` (`automatic | Bath Bomb Mix &
> Match`, 4.1% of POS orders), which we don't store. Continue at Part 3 Step 0.
