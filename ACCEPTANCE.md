# Standing acceptance checklist

Rules that apply to every change, not to one round. Added to when a bug class
turns out to be a repeat rather than a one-off.

---

## Silent-ignore rule

**An upstream API can accept a filter, return 200, and quietly discard it.
Verifying that a parameter is ACCEPTED proves nothing. You must verify it is
APPLIED.**

This has now happened three times in this codebase:

| # | Where | What was ignored | How it surfaced |
|---|---|---|---|
| 1 | `customersCount(query:)` — Shopify GraphQL | the entire `query:` argument | Loyalty counts refused to move; worked around by paginating the `customers` connection instead |
| 2 | `/api/revenue/by-store-net` — ours | `?period` | Fixed in Round 2 (`4936626`); the endpoint had never used the shared `resolvePeriod()` helper, so `?period=7d` returned 30 days labelled "7d" |
| 3 | `customers(query:)` — Shopify GraphQL | `created_at:` alongside a `tag:` filter | Found 2026-08-09 (`8f5ec17`); every "period-scoped" loyalty figure since Round 1 was cumulative-since-June. Use `customer_date:` instead |

Note the shape they share: **all three returned a plausible number.** #1 and #3
came back 200 with no warning. #2 was our own code. None of them could be caught
by reading the response and asking "does this look right?" — it always did.

### The two assertions

Every endpoint that filters — by date window, store, period, channel, anything —
carries both of these in its acceptance set:

1. **Differential window.** Two different windows, queried the **same day**, must
   return **different** results. Identical results mean the filter is inert.
2. **Absurd window.** A range that cannot contain data (2019 — years before the
   business existed) must return **zero**. A non-zero answer means you are
   looking at everything, not at the window you asked for.

Both are one-liners. Neither requires knowing the right answer in advance, which
is the whole point: the broken loyalty numbers looked entirely reasonable for
months, and a check that compares an API to itself will never say otherwise.

Runnable: `node server/tools/assert_window_honoured.mjs [baseUrl]` — exits 1 on
failure, so it can gate a reload. Add a row to its `ENDPOINTS` table when you
ship a new filtered endpoint. `measure` must return a count or a sum, never a
rate: two windows can share a rate by coincidence, so a rate cannot prove the
filter moved.

### Why single-window sampling is not acceptance

Round 1's loyalty acceptance (`neob-dashboard-fixes-DONE.md:298`) printed one
window's response and eyeballed it. Rates came back 21.9–34.8% — plausible, and
wrong. **The API agreed with itself, because it was only ever asked once.**

Run against the pre-fix code, the two assertions fail exactly as designed:

```
1. differential window  2026-08-08..2026-08-08 = 3078
                        2026-07-10..2026-08-08 = 3078
   must DIFFER          FAIL   <- window is inert
2. absurd window        2019-01-01..2019-01-02 = 3078
   must be ZERO         FAIL   <- data from before the business existed
```

---

## Per-endpoint acceptance sets

### `/api/stats/loyalty-signups`
- [x] Differential window — two windows same day must differ
- [x] Absurd window (2019) must return zero
- Counts are **not** a fixed snapshot: tag state is current while the date is
  fixed, so a late-tagged customer legitimately enters a closed window on
  re-query. Do not reconcile to the decimal against an earlier reading. (This
  drift is real and was **not** the bug — see `neob-dashboard-fixes-DONE.md:330`.)

### `/api/scorecard`
- [x] `sum(periods.days[].net_sales) === periods.last7.net_sales`, exact
- [x] `periods.days[6] === periods.day`, field for field
- Both hold by construction: one shared `last7Start`, and each day built by the
  same `_scBuildPeriod` the aggregate uses. If either ever fails, the window
  logic has been re-derived somewhere it shouldn't have been.
- A closed day reports `null`, never `0` — the aggregate COALESCEs a missing row
  to 0, which would publish "closed" as "$0 of sales".

---

## Environment invariants

- **One process serves this tree.** `com.neob.production` (launchd), port 3001.
  A pm2 entry for `neob-production` ran a *second* copy from 2026-07-21 to
  2026-08-09, double-running every nightly sync for 19 nights. Removed with
  `pm2 delete neob-production && pm2 save --force` — plain `pm2 save` refuses to
  write when no processes remain, leaving the stale entry to resurrect on boot.
  If `ps` ever shows two `server/index.js` on this tree again, that is a bug.
- **`main` must describe what is running.** Round 2 shipped 24 commits that sat
  unmerged while live, including `last7` — branching off `main` would have
  deleted a feature that was in production.
- **`grep` here is `ugrep`** and silently skips files it deems binary. Use `-a`
  when a search of a file you know exists comes back empty.
