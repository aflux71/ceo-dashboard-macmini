# Round 3 — scorecard daily breakdown, loyalty scoping, pm2 ghost

**2026-08-09, on the mini (`neobs-mac-mini:~/neob/production-assistant`).**
Branch `round3-scorecard-days-loyalty`, pushed to `macmini`, 3 commits ahead of
`main`.

**✅ SHIPPED AND LIVE.** Reloaded 2026-08-09 22:34 via
`sudo launchctl kickstart -k system/com.neob.production`. Serving as **PID 5917**
(was 417). All post-reload checks green — see § Post-reload verification.

| | |
|---|---|
| Commits | `5463f32` scorecard days[] + loyalty · `8f5ec17` loyalty scoping fix · `c73e06c` acceptance rule |
| Remote | `macmini` only — **never** push or pull `origin` here (different repo) |
| Backups | `_bak/api.js.1786325846`, `_bak/shopify.js.1786326167` |

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

- **No bundle metrics on the scorecard.** Deferred pending the `bundleComponents`
  fix. (Note: POS attribution itself now works — see § ceo.html below.)
- **LY fields left in the payload.** `ceo.html` still reads them. The portal
  simply stops rendering them — a view change, not a contract change.

---

## The bug this round actually found

`/api/stats/loyalty-signups` had **never** honoured its date window. The Shopify
customers search accepts `created_at:` and silently discards it:

```
tag only                          1350
tag AND created_at 2026-08-08     1350   <- ignored
tag AND created_at 2019-01-01     1350   <- absurd window, still everything
tag AND customer_date 2026-08-08    24   <- actually filters
```

Caught because `/api/scorecard` divided cumulative signups by a **windowed**
order count and published **666.7%** as a single-day rate. A rate above 100% is
impossible, which is the only reason months of silence broke.

Fixed in `8f5ec17` by switching to `customer_date`, verified self-consistent:
seven per-day counts for 2026-08-02..08 sum to 117; the range query returns 117.
Side effect: ~10× faster (one page instead of six).

### What moved on `ceo.html` — predicted, then confirmed live

Window `2026-07-10 … 2026-08-08` (its 30d default). **Denominator unchanged at
10,632 orders — only the numerator was ever wrong.** Post-reload figures match
the pre-reload prediction exactly:

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
Flower Farm moved most (2.6×) as it has the largest tagged base to over-count.

**Nobody's loyalty performance changed.** The old figure counted every signup
since June 9 against one month of transactions. If anyone asks why the number
halved overnight, that is the sentence to give them.

### The lesson, now a rule

Round 1's loyalty acceptance printed **one** window's response and eyeballed it.
The API agreed with itself because it was only ever asked once. This was the
third silent-ignore in this codebase — see **`ACCEPTANCE.md` § Silent-ignore
rule**, which names all three (`customersCount(query:)`, `by-store-net ?period`,
`customers created_at`) and requires two assertions on every filtered endpoint:

1. **Differential window** — two windows, same day, must return different results
2. **Absurd window** — a range that cannot contain data (2019) must return zero

Runnable and exit-coded so it can gate a reload:
`node server/tools/assert_window_honoured.mjs [baseUrl]`. Add a row to its
`ENDPOINTS` table per new filtered endpoint; `measure()` must return a count or
sum, **never a rate** (two windows can share a rate by coincidence).

One nuance worth preserving, because the tidy version of this story is wrong: the
Round 1 drift note (25.7% → 25.8% on re-query) reads like a missed smoking gun
but is **not** one. Late tagging genuinely does pull past-window customers in even
with a working date filter, since tag state is current while the date is fixed.
That explanation was sound then and remains sound. The gap was the single-window
test, not the rationalisation.

---

## Post-reload verification (2026-08-09 22:34, PID 5917)

```
service        PID 5917 on 127.0.0.1:3001, launchd com.neob.production
node on tree   exactly 1 process

(a) sum 32753.25 == last7 32753.25 : PASS
(b) days[6] === periods.day        : PASS
    loyalty last7: {"signups":117,"first_timers":117,"orders":730,
                    "signup_rate_pct":16,"basis":"retail","reason":null}

/api/stats/loyalty-signups   (retail signups)
  1. differential window  2026-08-08..2026-08-08 = 67
                          2026-07-10..2026-08-08 = 1510
     must DIFFER          PASS
  2. absurd window        2019-01-01..2019-01-02 = 0
     must be ZERO         PASS
ALL ASSERTIONS PASS                                    exit=0

ceo.html 30d retail rate: 14.2%  (predicted 14.2% — MATCH)
```

The same assertions run against the pre-reload service returned
`3078 / 3078 / 3078` and `2 ASSERTION(S) FAILED`. Same script, same day, two code
paths — that contrast is the clearest artefact this round produced.

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
matters**: plain `pm2 save` refuses to write when no processes remain
(`PM2 is not managing any process, skipping save...`), leaving `neob-production`
in `~/.pm2/dump.pm2` for `pm2.neoboperations.plist` in `~/Library/LaunchAgents`
to resurrect on boot. Dump verified empty afterwards.

**`main` fast-forwarded to `9501931`** — it was 24 commits behind live code,
including `e01854d` (`last7`). Branching off `main`, as originally planned this
session, would have deleted a feature that was in production. `main` now
describes what is actually running.

---

## ceo.html bundle footnote — no change needed

Reported as still reading *"No POS bundle sales since Jun 15 · verified, not a
data error"*. It does not. Verified:

- Served bytes and `server/public/ceo.html` have **identical sha256** — no stale
  file in play.
- The only surviving occurrence is inside a `//` comment at `ceo.html:1489`
  recording the history. Zero live occurrences.
- The none-state string has read `'Not attributable since ' + …` since
  `11e1605` / `47877e1` (this morning).
- **The gap itself is closed**, so no footnote renders at all: 430 retail bundle
  orders / 485 units / **4.0%** over 30d, `pos_last_sale_date` = 2026-08-09.

It was a cached page. A hard refresh (Cmd+Shift+R) shows 4.0%.

---

## Open / next

1. **Verify the ghost stays gone.** Tomorrow morning, `net_sales` for 2026-08-10
   must show **one** row, not two:
   ```bash
   sqlite3 -readonly ~/neob/production-assistant/data/neob.db \
     "SELECT substr(created_at,1,10) night, COUNT(*) runs FROM sync_log
       WHERE entity='net_sales' AND created_at >= '2026-08-09' GROUP BY night;"
   ```
2. **Merge `round3` to `main`** once it has run a full day clean. It is a clean
   fast-forward.
3. **Portal work is unblocked** — `periods.days[]` is the daily breakdown the
   portal scorecard needed. Do not re-derive the 7-day window client-side; take
   it from the server (see the comment above `last7` in `api.js`).
4. **Extend the assertion table.** Only `/api/stats/loyalty-signups` is covered
   so far. `by-store-net`, `bundles/penetration` and `promos/participation` all
   filter and all deserve rows.
5. **Cited line numbers drift.** `STORE_LOCATIONS` is cited as `api.js:469` in
   two docs; it is at **467**.
6. **Stale copies in a served directory.** `server/public/ceo.html.backup-20260602`
   and `ceo.html.backup-loyalty-20260624` are reachable over HTTP. Neither holds
   the false footnote, but they should move to `_bak/`.
7. **Unchanged from Round 2:** `kpi_targets` ends 2026-08-31 (no plan for any
   store from September); Bracebridge missing 2026-08-27; portal pre-fill
   question still open; dead endpoints (`/api/stats`, `/api/stats/ceo`,
   `STORE_LOCATIONS`) still present, deletion not authorised.
