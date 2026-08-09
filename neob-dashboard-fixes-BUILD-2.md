# neōb CEO Dashboard + Portal — Build Spec, Round 2

**Written 2026-08-09. For Claude Code on the mini (`~/neob/production-assistant`).**
Follows `neob-dashboard-fixes-BUILD.md` / `-DONE.md` (Round 1, shipped and merged).

Six work items. **Ordered by risk, lowest first** — do them in order. Items 1–3 are
read-only or additive; item 5 is the only one that writes user data; item 6 changes the
sync and needs a backfill decision.

---

## 0. Corrections to the task list this spec came from

The task list circulating for this round contains a stale diagnosis. Do not act on it:

| Stale claim | Reality |
|---|---|
| "POS bundle % reads 0.0% because of a Shopify tagging/sync break (`neob-bundle-pos` tag)" | **Wrong.** The tag matches correctly in code and DB — verified four independent ways. The 33 in-store gift sets were rebuilt as Shopify Bundles on 2026-06-15, and Shopify Bundles does not support POS. They are unsellable in stores. No sync fix will ever make this non-zero. |
| "Sequence that fix before surfacing bundles" | Would defer indefinitely. The fix is a Shopify Admin change owned by Melissa, not code. |
| "Loyalty needs period-scoping plus the endpoint times out" | **Already done and merged in Round 1.** Period-scoped; 30s timeout → 5.3s cold / 0.11s warm. Not a blocker. |

See `RESUME_ceo-dashboard-fixes-2026-08-07.md`, Parts 2 and 2A, for the verified root cause.
(Previously cited as `claude/neob-bundle-root-cause-2026-08-07.md` — that is a doc in the
claude.ai project, not a path in this repo.)

---

## Environment — carry these forward

Established in Round 1. Getting any of these wrong reintroduces a fixed bug.

- **`orders.created_at` is stored in Toronto local time with an explicit offset**, not UTC.
  Toronto-date comparison via `substr(created_at,1,10)` is correct. Do **not** "fix" it to
  UTC boundaries, and never use `date(created_at,'-4 hours')` — it hardcodes EDT.
- **`daily_sales.sale_date`** is already `YYYY-MM-DD` America/Toronto and inclusive both ends.
- **All windows end yesterday**, inclusive, Toronto. `resolvePeriod()` is the single source
  of truth — new endpoints must use it, not build their own windows.
- **No index on `orders.created_at`.** Full scan ~19ms over 182k rows. Acceptable; don't add
  an index as part of this work.
- **Process manager is `launchd`, not pm2.** Reload:
  `sudo launchctl kickstart -k system/com.neob.production` — requires Robert's password, so
  **an agent cannot run it**. Make edits, stop, ask.
- **Back up to `_bak/`** before editing.
- **Two remotes** (`origin`, `macmini`) — **push `macmini` only, and never pull `origin main`
  onto the mini.** `origin` is `neob-operations-suite_truth`, a different repo; `main` tracks
  `macmini`. (An earlier draft of this line said "push both" — that was wrong.)
- **Never `git add -A`.** Stage only files you changed.
- **Confirming a NEGATIVE requires a second SYSTEM, not a second query.** When concluding
  that something did *not* happen — no sales, no rows, no traffic — at least one check
  must come from a **different system** than the one you are querying. Several queries
  against the same store are not independent confirmations; if that store structurally
  cannot hold the evidence, they will all agree and all be wrong.
  **This cost us a full day on 2026-08-09.** "Retail bundle sales stopped 2026-06-15" was
  called *verified* on the strength of four checks — SKU, product_id, title, and a
  tag-agnostic title sweep — every one of which read `orders` / `order_line_items`, the
  one table where a Shopify Bundles parent never appears. Shopify's own Analytics showed
  32 bundles selling, 100% POS, the whole time. One look at a different system would have
  settled it in a minute. See `RESUME_round2-dashboard-fixes-2026-08-09.md` Part 7.
- **`grep` here is `ugrep`, and it silently skips files it classifies as binary.**
  If a search of a file you know exists returns nothing, re-run it with **`-a`** before
  concluding the string isn't there. `server/sync/net_sales.js` is the known case: it
  contains two deliberate NUL bytes (a `store\0date` cell-key separator and the comment
  documenting it), so plain `grep` reports **no matches** for strings that are plainly
  in the file. Those NULs are **functional — do not "clean" them**; replacing the
  separator weakens the collision guarantee it was chosen for.

---

## 1. Clickable portal URL on the Staff page — `staff.html`

Trivial. The portal URL is displayed as plain text; make it an anchor opening in a new tab
(`target="_blank" rel="noopener"`).

**Acceptance:** click opens the portal in a new tab; the Staff page keeps its session.

---

## 2. Scorecard shape — apply the SAME changes in two places

One decision, two implementations. Spec it once, verify both.

**Changes:**
1. **Add "Last 7 days"** as a window alongside the existing ones.
2. **Remove YTD dollar values.** YTD stays as a **percentage vs target only**.
3. **Target displays on a monthly basis**, not the window's basis.

**Where:**
- `ceo.html` — the all-stores scorecard. Keep **% vs target** and **AOV**.
- The portal scorecard (Pages app) — the store-manager view.

**Rules:**
- "Last 7 days" = 7 **complete** days ending yesterday, Toronto. Use `resolvePeriod('7d')`;
  do not recompute it in the frontend.
- Both surfaces must agree exactly for the same store and window. A manager comparing their
  scorecard to what Robert sees must find the same number.

**Acceptance:**
- Last-7-days on both surfaces returns identical figures for the same store.
- No YTD dollar figure appears anywhere on either scorecard; YTD % vs target does.
- The monthly target shown matches `kpi_targets` for the current month.

---

## 3. Bundles + Loyalty on the scorecard — `ceo.html`

**Loyalty:** the server work is done. Surface `signup_rate_pct` from
`/api/stats/loyalty-signups` as `count · rate`. Use **`retail_total`** (excludes Online),
not `all_total`. Online is `comparable: false` / `auto-at-checkout` — if it appears at all it
must carry the `‡` marker and its footnote. Never rank stores against Online.

**Bundles:** stays on the scorecard, rendered with the honest state already built in Round 1 —
**"None · No POS bundle sales since Jun 15 · verified, not a data error"**, not `0.0%`.
Link the footnote to the fact that this is a Shopify product issue under review, so nobody
re-opens it as a dashboard bug a third time.

**Do not** tune `target_pct` (still 10) to make the number look reachable. That's a
target-setting conversation.

**Acceptance:** loyalty rate matches the API's `retail_total`; bundles show the explicit
none-state, not a zero.

---

## 4. Last-year sales in the daily breakdown — mini admin

Code is straightforward; **the LY data source at daily/per-store grain is the real question.**

`netSalesCompanyYoY` (`net_sales_queries.js:~102`) already does a **364-day DOW-matched
shift**. That's the existing convention and the scorecard uses it — reuse it rather than
inventing a second LY definition.

**Before writing code, confirm and report:**
1. Does a per-store, per-day LY series exist at the grain the breakdown needs, or only
   aggregated? If only aggregated, say so and stop — that's a data question, not a UI one.
2. Confirm 364-day DOW-matched is what's wanted here. Same-calendar-date is a defensible
   alternative and `kpi_targets` uses it (per `NEOB_ADMIN_BUILD_PROMPT.md`). **The two
   conventions coexisting in this codebase is a trap** — state which one the breakdown uses,
   in the UI, so nobody compares across them by accident.

**Acceptance:** LY column populates per store per day; the LY convention is labelled on the
page; a spot-check of three store-days matches a direct DB query.

---

## 5. Admin edits to the daily breakdown — mini admin ⚠️ WRITES USER DATA

**Decision made: admin edits overwrite, but every change is audited.** Build both halves —
an edit route without the audit table is not acceptable.

**Schema — new table:**
```sql
CREATE TABLE IF NOT EXISTS daily_entry_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  store_name TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  edited_by TEXT NOT NULL,
  edited_at TEXT DEFAULT (datetime('now')),
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_entry_edits_lookup
  ON daily_entry_edits(entry_date, store_name);
```

**Route:** follow the existing `checkAdminPin` pattern from the admin pages — do not invent a
new auth scheme. Same prepared-statement style as the `tasks` routes.

**Rules:**
1. Every write records old value, new value, admin name, timestamp. **Write the audit row and
   the value change in a single transaction** — a failed audit must roll back the edit.
2. An edited cell renders a visible marker; hover/click shows who changed it, when, from what.
3. `reason` is optional but captured if given.
4. **Never delete or overwrite the audit trail.** Corrections to corrections append.
5. Edits apply to admin-correctable actuals only. Do not allow editing derived or
   synced-from-Shopify figures — if a synced figure is wrong, the sync is wrong.

**Acceptance:**
- Edit a value → new value shows, marker appears, `daily_entry_edits` has a complete row.
- Edit the same cell twice → two audit rows, full chain reconstructable.
- Force the audit insert to fail → the value change rolls back.
- Non-admin PIN → 401, no write.
- The original staff-entered value is always recoverable from the audit chain.

---

## 6. Capture in-store promotional discounts — sync change

**The measurement fix for the bundle gap.** The automatic **Bath Bomb Mix & Match** discount
runs on ~4.1% of POS orders but lives in Shopify's `discount_applications`, which the sync
does not store. Today it is invisible.

1. Extend the sync to persist `discount_applications` per order (title/code, type,
   value, allocation).
2. Expose a POS promo-participation rate: orders carrying the Mix & Match discount ÷ retail
   orders, using the same denominator convention as the loyalty rate (all retail transactions).
3. **Backfill is a decision, not an assumption** — report how far back Shopify will serve
   `discount_applications` and what a backfill would cost in API calls before running one.
   Do not backfill unprompted.

**Acceptance:** promo rate reconciles against a manual Shopify report for one month; no
regression in existing sync timings; the 3:30 AM nightly still completes clean.

---

## Carried-over open item from Round 1

**AOV numerator/denominator window parity was never confirmed.** `net_sales` reads
`daily_sales.sale_date`; `orders` reads `orders.created_at`. If those cover different windows,
AOV is structurally wrong by roughly a day's worth of denominator — which would explain four
stores reading red rather than the predicted amber. **Verify before item 2 ships**, since the
scorecard surfaces AOV: print both date ranges and row counts side by side for one store, one
explicit window.

---

## Verification checklist

- [ ] Portal URL on Staff page opens in a new tab
- [ ] Last-7-days identical on `ceo.html` and the portal for the same store
- [ ] No YTD dollar figure on either scorecard; YTD % vs target present
- [ ] Monthly target matches `kpi_targets`
- [ ] Loyalty rate on the scorecard matches API `retail_total`, Online excluded
- [ ] Bundles render the none-state, not `0.0%`
- [ ] AOV numerator and denominator cover the same window — proven, not asserted
- [ ] LY column populated, convention labelled on the page
- [ ] Admin edit writes value + audit row in one transaction; rollback verified
- [ ] Edited cells visibly marked; edit chain reconstructable
- [ ] Non-admin PIN rejected with 401 and no write
- [ ] Mix & Match promo rate reconciles to a manual Shopify report
- [ ] 3:30 AM nightly sync still completes clean
- [ ] Dashboard still renders if any single endpoint fails
