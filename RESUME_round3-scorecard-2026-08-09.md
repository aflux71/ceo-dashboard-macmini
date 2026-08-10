# Round 3 — scorecard daily breakdown, loyalty scoping, pm2 ghost

**2026-08-09, on the mini (`neobs-mac-mini:~/neob/production-assistant`).**
Branch `round3-scorecard-days-loyalty`, 2 commits ahead of `main`.

**⚠️ NOT YET RELOADED at the time of writing.** `api.js` and `shopify.js` changes
are committed but the launchd service still runs the previous code. Reload:
`sudo launchctl kickstart -k system/com.neob.production` (Robert only).

---

## What shipped

### 1. `periods.days[]` on `/api/scorecard`

Seven complete Toronto days ending `as_of`, oldest first. Each entry: `date`,
`net_sales`, `target`, `target_variance_pct`, `aov`.

The window comes from `last7Start`, written **once** and shared with
`periods.last7`. Each day is built by calling `_scBuildPeriod` with
`start === end === date` — the same function `periods.day` uses. That makes both
acceptance properties identities rather than coincidences:

| Store | `sum(days[].net_sales)` | `last7.net_sales` |
|---|---|---|
| Flower Farm | 32,753.25 | 32,753.25 |
| Queen Street | 30,583.43 | 30,583.43 |
| Elora | 10,195.02 | 10,195.02 |
| Stratford | 8,414.72 | 8,414.72 |
| Bracebridge | 6,992.57 | 6,992.57 |

Exact on the **raw float sum**, no rounding tolerance. `days[6]` matches
`periods.day` on every field (Flower Farm: $7,875.33, target $4,909, AOV $39.91,
Sat 2026-08-08).

A closed day reports `null`, not `0` — the aggregate query COALESCEs a missing
row to 0, which would publish "closed" as "$0 of sales". Its **target is kept**
(kpi_targets may plan a day the store did not trade) but variance is nulled:
variance against an absent actual is unknown, not −100%. Exercised with
Bracebridge `as_of=2026-06-05`, which straddles the missing Jun 3–4.

### 2. Per-window loyalty, retail basis

Each period carries `loyalty { signups, first_timers, orders, signup_rate_pct,
basis, reason }`. Online is never folded in — it enrols automatically at checkout
while a store has to ask, so combining them flatters every store it is compared
against. Windows opening before the 2026-06-09 tag rollout (i.e. YTD) are
withheld with a reason rather than reported as a low number the store did not
earn. Loyalty is the only part of this endpoint that leaves the database, so it
**fails soft**: a Shopify outage nulls loyalty rather than 500-ing net sales
against target.

### Not done, deliberately

- **No bundle metrics.** POS attribution emits component SKUs only; they would
  render empty for every store until the `bundleComponents` fix lands.
- **LY fields left in the payload.** `ceo.html` still reads them. The portal
  simply stops rendering them — a view change, not a contract change.

---

## The bug this round actually found

`/api/stats/loyalty-signups` has **never** honoured its date window. The Shopify
customers search accepts `created_at:` and silently discards it:

```
tag only                          1350
tag AND created_at 2026-08-08     1350   <- ignored
tag AND created_at 2019-01-01     1350   <- absurd window, still everything
tag AND customer_date 2026-08-08    24   <- actually filters
```

Caught because `/api/scorecard` divided cumulative signups by a **windowed**
order count and published **666.7%** as a single-day rate. A rate above 100% is
impossible, which is the only reason eight months of silence broke.

Fixed in `8f5ec17` by switching to `customer_date`, verified self-consistent:
seven per-day counts for 2026-08-02..08 sum to 117; the range query returns 117.
Side effect: ~10× faster (one page instead of six).

### What moves on `ceo.html` after the reload

Window `2026-07-10 … 2026-08-08` (its 30d default). **Denominator unchanged at
10,632 orders — only the numerator was ever wrong.**

| Store | Signups before → after | Rate before → after |
|---|---|---|
| Bracebridge | 248 → 150 | 31.5% → **19.1%** |
| Elora | 315 → 193 | 25.2% → **15.5%** |
| Flower Farm | 1,340 → 522 | 33.0% → **12.9%** |
| Queen Street | 824 → 467 | 23.6% → **13.4%** |
| Stratford | 351 → 178 | 33.4% → **16.9%** |
| **Retail total** | **3,078 → 1,510** | **29.0% → 14.2%** |

The distortion scales inversely with window length — ~2× at 30 days, ~11× at 7
days — because the broken query returned cumulative-since-June regardless.
Flower Farm moves most (2.6×) as it has the largest tagged base to over-count.

**Nobody's loyalty performance changed.** The old figure counted every signup
since June 9 against one month of transactions.

### The lesson, now a rule

Round 1's loyalty acceptance printed **one** window's response and eyeballed it.
The API agreed with itself because it was only ever asked once. This was the
third silent-ignore in this codebase — see **`ACCEPTANCE.md` § Silent-ignore
rule**, which now names all three and requires two assertions (differential
window, absurd window) on every filtered endpoint. Runnable:
`node server/tools/assert_window_honoured.mjs [baseUrl]`.

One nuance worth preserving, because the tidy version of this story is wrong: the
Round 1 drift note (25.7% → 25.8% on re-query) reads like a missed smoking gun
but is **not** one. Late tagging genuinely does pull past-window customers in even
with a working date filter, since tag state is current while the date is fixed.
That explanation was sound then and remains sound. The gap was the single-window
test, not the rationalisation.

---

## Environment changes

**pm2 ghost removed.** PID 53843 had run a second copy of `server/index.js` from
2026-07-21 20:22 until tonight. Round 1 §9.7 called it cosmetic; it was not —
`server/index.js` calls `startScheduler()` on boot, so it double-ran every
nightly sync:

```
2026-07-20   1 run     2026-07-22   2 runs
2026-07-21   1 run     ...          2 runs   (19 nights)
             ^ ghost starts 20:22
```

77 paired runs, **zero** errors and **zero** disagreements on `records_synced` —
the syncs are idempotent upserts, so data converged. The cost was duplicated
Shopify calls and two concurrent SQLite writers nightly, a lock-contention risk
that happens not to have bitten.

Removed with `pm2 delete neob-production && pm2 save --force`. **The `--force`
matters**: plain `pm2 save` refuses to write when no processes remain, leaving
`neob-production` in `~/.pm2/dump.pm2` for `pm2.neoboperations.plist` in
`~/Library/LaunchAgents` to resurrect on boot. Dump verified empty afterwards.

**`main` fast-forwarded to `9501931`** — it was 24 commits behind live code,
including `e01854d` (`last7`). Branching off `main`, as originally planned this
session, would have deleted a feature that was in production. `main` now
describes what is actually running.

---

## Open / next

1. **Reload pending** — both anchors and both assertions re-run after kickstart.
2. **Verify the ghost stays gone**: tomorrow morning, `net_sales` for 2026-08-10
   must show **one** row, not two.
3. **Cited line numbers drift.** `STORE_LOCATIONS` is cited as `api.js:469` in
   two docs; it is at **467**.
4. **Unchanged from Round 2:** `kpi_targets` ends 2026-08-31 (no plan for any
   store from September); Bracebridge missing 2026-08-27; portal pre-fill
   question still open; dead endpoints still present.
