# RESUME — CEO Dashboard Fixes + Bundle Detection Rebuild

**Session date:** 2026-08-07
**Branch:** merged to `main`, pushed to `macmini/main` (`1a7d15a`)
**Companion doc:** `neob-dashboard-fixes-DONE.md` — **§4's CAUSE is wrong; see Part 2 for the root cause**

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

# PART 2 — ⚠️ ROOT CAUSE: Shopify Bundles does not support POS

`neob-dashboard-fixes-DONE.md` §0/§4 correctly observe that the 33 in-store gift sets
stopped selling on 2026-06-15, but blame merchandising ("came off the floor, never
re-listed"). The observation is right; **the cause is wrong.**

**ROOT CAUSE (confirmed via GraphQL + Shopify docs): Shopify Bundles does not support POS.**
There are two separate issues; do not conflate them.

### Issue 1 — REAL sales stop, NOT fixable in code

On ~2026-06-15 the 33 in-store gift sets were **rebuilt as Shopify Bundles**. Verified via
`admin/api/2024-10` GraphQL — every one has `requiresComponents = true`, 4–5 components:

```
GS0006  requiresComponents=true  components=4   Botanical Bliss Glorious Collection
GS0009  requiresComponents=true  components=5   The Complete Ritual Massuet Collection
GS0041  requiresComponents=true  components=5   Culinary Treats For Two Collection  ...
```

**Shopify Bundles supports Online Store and Headless only — POS is unsupported** (Shopify
documentation). Converting them made them **unsellable in stores**: they are `active` and
`published_scope: global`, but POS cannot transact a bundle. Since Jun 15 they have sold
**once**, on Jun 15 itself.

**So the 0% is real.** An earlier correction in this session said "bundles ARE selling —
detection failure, not sales failure"; that was wrong for *these* products. Impact:

| Period | Orders w/ gift set | Revenue |
|---|---|---|
| 2026-04 | 50 | $3,115.42 |
| 2026-05 | 327 | $20,803.84 |
| 2026-06 (to the 15th) | 190 | $11,363.75 |
| **60 days pre-conversion** | **550** | **$34,228.76 (~$570/day)** |

Fix is operational: un-bundle back to ordinary products carrying their `GS####` SKUs, or
accept that in-store gift sets are a different SKU set from online.

### Issue 2 — REAL detection gap, IS fixable in code

Separately, something *is* selling in-store as a bundle and is uncounted: the automatic
discount **`automatic | Bath Bomb Mix & Match`**, on **10 of 244 sampled POS orders =
4.1%**. It lives in `discount_applications`, which the sync does not store.

### DTC is fine — do not "fix" it

The 5 DTC gift sets are `requiresComponents = false` — ordinary products, not Bundles-app
bundles. They sell normally and match by SKU. The 5.3% DTC figure is correct.

### Also true regardless: Bundles hides the bundle SKU on every channel

Shopify docs: *"SKUs are listed for individual items in orders, not for the bundle SKU."*
For any Bundles-app product, on any channel, the order records **component** line items —
component SKUs and product_ids, **no bundle line, no `GS####` SKU, no bundle product_id.**

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
| SKU (`GS####`) | last 2026-06-15 | bundle product never appears on the order |
| `product_id` | never matched | same |
| Product title | last 2026-06-15 | components carry component titles |
| Tag-agnostic title sweep | 73/19,127 = 0.38% | same |

Jun 15 was **the day the gift sets were converted to Shopify Bundles** — which both stopped
them selling on POS (Issue 1) and hid the bundle SKU from any order that does happen
(Issue 2). Both effects start on the same date, which is why the earlier single-cause
readings each looked self-consistent.

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

# PART 2A — Shopify investigation (2026-08-07, read-only, NO writes made)

Commissioned to find out whether the fix is a simple re-publish/restock rather than
un-bundling. **It is not** — and the working "Group A / Group B" model was inverted.

### Credentials: we CANNOT fix this in Shopify — it is Melissa's task

`/oauth/access_scopes.json` returns 0 scopes (doesn't report for this token type), so
capability was probed directly with a **non-existent product ID** (nothing modifiable):

```
mutation productUpdate(id:"gid://shopify/Product/1")
  -> "Access denied for productUpdate field. Required access: `write_products` access scope."
```

| Scope | Held |
|---|---|
| `write_products` | **NO** — cannot un-bundle, re-publish or edit anything |
| `read_publications` | **NO** — cannot read per-channel publication |
| `read_products`, `locations`, `inventory` | yes |

**Any remediation must be done by Melissa in the Shopify Admin.**

### ⚠️ There is only ONE live group of 33, and it IS the bundles

| Model assumed | Reality |
|---|---|
| "Group A" = original SKU'd gift sets, still active | **Deleted from Shopify.** 8 of 33 IDs sampled → all **HTTP 404** |
| "Group B" = `requiresComponents=true`, separate | **These ARE the live 33**, and they hold the `GS####` SKUs |

Shopify returns **33** live POS-bundle-tagged products (not 66). All `ACTIVE`, **all 33
`requiresComponents=true`**. The other 33 exist only as unpruned rows in the local
`products` table. **There is no Group A left to re-publish or restock** — the June
conversion replaced the originals rather than sitting alongside them.

### What the live 33 look like

- **Channels: unreadable** (no `read_publications`). REST says `published_scope: global` for
  all 33, but that is a coarse legacy field, **not** proof of POS-channel publication.
  **Melissa must confirm in Admin.**
- **Inventory: location record only at `neob HQ`; none at any of the 5 stores (0/33).**
  Nuance — Bundles-app products hold no stock of their own (`available` = 0); inventory
  derives from components, and the component-derived `inventoryQuantity` is healthy
  (GS0006 462, GS0009 328, GS0007 209). So stock is not the primary blocker, but the
  HQ-only location assignment is worth checking.
- **Price range $39.80–$84.97.** No before/after comparison possible — the deleted
  products' prices were never stored locally.

Cheapest → dearest: GS0034 $39.80 · GS0008/GS0033 $39.95 · GS0006/GS0007 $44.20 ·
GS0041 $44.62 · GS0023/GS0024 $49.15 · GS0032 $49.42 · GS0017/GS0021 $49.85 ·
GS0019/GS0020 $52.40 · GS0022/GS0027 $54.10 · GS0015 $56.75 · GS0038 $59.38 ·
GS0028/GS0031 $62.75 · GS0026 $63.75 · GS0039/GS0040 $64.60 · GS0016 $68.75 ·
GS0013/GS0025 $69.55 · GS0014 $74.50 · GS0029/GS0030 $74.83 · GS0009/GS0012 $79.02 ·
GS0035 $84.80 · GS0010/GS0011 $84.97

### DTC — confirmed load-bearing, DO NOT TOUCH

A **separate set of 5** products (not the 33), all `requiresComponents = false` — ordinary
products, which is why they still match by SKU:

| SKU | Gift set | Last sold | Orders since Jun 15 |
|---|---|---|---|
| GS0001 | Lavender Harvest Collection | **2026-08-05** | 9 |
| GS0000 | Ultimate Pain Relief Collection | 2026-07-28 | 13 |
| GS0003 | Botanical Bliss Lavender Edition | 2026-07-07 | 3 |
| GS0005 | The Lavender Ritual | 2026-06-27 | 1 |
| GS0002 | Lavender Body Care Set | 2026-06-22 | 5 |

### Title match: 1:1, exact

33 live titles vs 33 deleted titles → **33 matched, 0 live-only, 0 deleted-only.** Every
gift set was recreated under an identical title. No orphans in either direction.

### Options for Melissa

| Option | Action | Trade-off |
|---|---|---|
| **A — Un-bundle** (recommended if in-store gift sets matter) | Convert the 33 back to ordinary products with their `GS####` SKUs; stock at the 5 store locations | Restores in-store sales **and** SKU-based tracking. Loses Bundles-app component inventory linkage |
| **B — Duplicate** | Keep the 33 bundles for online; create parallel POS-only products | Both channels work; doubles catalogue maintenance, re-splits the SKU set |
| **C — Accept** | Retire in-store gift sets; dashboard measures the Mix & Match promo instead | No Shopify work; ~$570/day of bundle revenue stays gone |

**Two things Melissa must confirm in Admin first (we cannot read them):**
1. Are the 33 actually published to the **POS** channel?
2. Is the **HQ-only inventory location** deliberate?

---

# PART 3 — NEXT SESSION: what to do

### Step 0 — Decisions for Robert (business first, then code)

**The operational decision comes first — it changes what we should measure. See PART 2A
for the full Shopify investigation: we hold NO `write_products` scope, so all remediation
is Melissa's to execute in the Admin.**
- Do the 33 gift sets need to sell in-store again? If yes they must be **un-bundled** back
  to ordinary products with their `GS####` SKUs. Shopify Bundles cannot be sold on POS,
  full stop. No dashboard change makes those sales appear. Note there is **no surviving
  pre-conversion product set to restore** — those 33 are deleted (HTTP 404).
- If in-store gift sets are being retired in favour of the Mix & Match promo, then
  "Packaged Bundle % · Retail" should be **redefined** to measure the promo, not the SKUs.

**Then, for whichever definition wins:**
- Is **"Bath Bomb Mix & Match"** the only in-store bundle promo, or are there others?
  (Needed for the allow-list in Step 2. `manual | custom set` and
  `manual | 2 small soaps for price of 1 large` also appeared — ad-hoc, probably ignore.)
- Should online Bundles-app sales be counted too? If yes that needs Step 1 Option B, since
  bundle SKUs never appear on any order.

### Step 1 — Decide the detection strategy

**Option A — discount-title matching (cheap, works on REST 2023-10):**
Store `discount_applications` (type + title) on orders; flag `is_bundle_pos` when an
`automatic` discount title matches a known bundle promo. Fast, no API upgrade.
Risk: manual discounts named ad-hoc ("custom set") are missed; needs an allow-list.

**Option B — GraphQL bundle components (correct, more work):**
REST **2023-10 cannot see bundle structure at all** — verified: line-item fields contain no
bundle/component/parent field and `properties` is empty on every sampled line.
Shopify exposes this only via GraphQL, **2024-01+**. **The current token already works on
`admin/api/2024-10` GraphQL** (verified this session — `requiresComponents` /
`productVariantComponents` both return data), so no new scope or credential is needed;
it is a code change only: bump `SHOPIFY_URL` (`shopify.js:9`) and move order sync to GraphQL.
Only worth doing if ONLINE bundle sales must be counted — it does nothing for POS, where
Bundles-app products cannot be sold at all.

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

> Read `RESUME_ceo-dashboard-fixes-2026-08-07.md`. Part 1 shipped and is merged/pushed.
> Part 2: root cause is that the 33 in-store gift sets were rebuilt as Shopify Bundles on
> 2026-06-15 (`requiresComponents=true`), and **Shopify Bundles does not support POS** — so
> they are genuinely unsellable in stores (~$570/day of prior bundle revenue). That part is
> operational, not code. Separately there IS a code-fixable gap: the in-store
> `automatic | Bath Bomb Mix & Match` discount (4.1% of POS orders) lives in
> `discount_applications`, which we don't store. DTC is fine, don't touch it.
> Continue at Part 3 Step 0 — the business decision comes before any code.
