# Portal handoff — Round 2 scorecard changes + one urgent question

**Written 2026-08-09 on the mini (`neobs-mac-mini:~/neob/production-assistant`).**
**For a session on the other Mac** (`robertachal@Roberts-Mac-mini`), where the Cloudflare
Pages portal source lives at `~/Downloads/neob-store-portal-v4`.

Confirmed from this side: that source is **not** on the mini — no
`~/Downloads/neob-store-portal-v4`, no `wrangler.toml`/`.json`/`.jsonc` anywhere under `~`,
no directory matching `*portal*`. So the portal half of Round 2 item 2 could not be done
here and is deferred to you.

**Read §1 first. It is not a display bug and it may invalidate a whole feature.**

---

## 1. ⚠️ HIGH PRIORITY — does the entry form pre-fill the revenue field?

**The question:** does the store portal's daily entry form pre-fill, default, or
auto-suggest the **revenue** field from Shopify data (`daily_sales.net_sales`, a sync, or
any API call) — rather than requiring the staff member to type an independent number?

### Evidence from the mini

| Month | Entries | Median entered ÷ `daily_sales.net_sales` | Median ÷ gross | Exactly = net (±0.05%) |
|---|---|---|---|---|
| 2026-05 | 2 | 1.3901 | 1.2098 | 0 / 2 |
| 2026-07 | 4 | 0.5585 | 0.4950 | 0 / 4 |
| **2026-08** | **37** | **1.0000** | 0.8849 | **28 / 37 (76%)** |

28 August store-days match `daily_sales.net_sales` to within 0.05%. A human reading a POS
close-out total does not hit the reconstructed Shopify net figure to four decimal places,
28 times.

### Why this contradicts the record

Every document on the mini says staff enter **gross**, and that Phase 4 (net entry) has
**not** started:

- `NET_SALES_REFERENCE.md:143` — "Phase 4 — store portal net entry: not started (staff
  still enter gross vs held targets)."
- `RESUME_net-sales-migration-2026-07-19.md:269` — "staff enter gross … CEO-net vs
  portal-gross basis mismatch is latent/intentional, resolved in Phase 4."

The May and July samples are consistent with staff typing an independent number (ratios of
1.39 and 0.56 — noisy, sometimes wrong, which is exactly what a reconciliation check is
*for*). August is not. Something appears to have changed in or around August.

### Why it matters more than it looks

`portal-totals.html` exists to surface the **Gap** between what staff entered and Shopify
net — `NEOB-PORTAL-TOTALS-BUILD-SPEC.md:80` calls it "the section that matters most",
amber above 5%, red above 15%.

**If the form pre-fills from net, the Gap column is comparing a value to itself.** It is
not a reconciliation check at all — it reads ~0 by construction, and it has been reporting
"no discrepancies" for 76% of August entries because it cannot report anything else. A
green Gap column would be evidence of nothing.

**The fix, if confirmed, is a product decision — not a display change.** For the check to
mean anything, the staff member must enter a number derived independently of Shopify
(their POS close-out), and only then should the two be compared. Options to put to Robert:

- **A** — Remove the pre-fill; staff type the POS total unaided. Restores the check.
  Costs staff a little time and will surface real discrepancies (that is the point).
- **B** — Keep the pre-fill for speed, and **delete the Gap column**, because it is
  measuring nothing. Honest, but abandons the reconciliation.
- **C** — Pre-fill, but record both the pre-filled value and any staff edit, and compare
  only *edited* entries. Keeps speed and a partial check; more work.

**Do not "fix" this by adjusting thresholds or formatting on the mini side.** Report what
the form actually does and let Robert choose.

### What to report back

1. Does the revenue field pre-fill / default / auto-suggest? From which source?
2. Since when — a commit date or deploy would explain the May/July vs August split.
3. Same question for the **transactions** field.
4. Is the pre-filled value editable, and is an edit distinguishable from an accepted default?

---

## 2. Scorecard changes (Round 2 item 2) — the portal half

**Target surface: `https://neob-store-portal.pages.dev/scorecard`** — the manager
scorecard page in the Cloudflare Pages app (source: `~/Downloads/neob-store-portal-v4`
on `robertachal@Roberts-Mac-mini`). Reached in the portal after manager-code entry; the
manager code is per-store and rotated from the mini's Staff page.

Do not confuse it with two similarly-named things on the mini:
- `ceo.html` — Robert's all-stores scorecard. The same three changes are **already
  shipped** there; this task is to mirror them.
- the mini's `/api/scorecard` — a *different* endpoint that the portal **does not call**.
  See §2a: the portal has its own scorecard API.

The same three changes shipped on `ceo.html` must land on the portal scorecard page, so
a store manager and Robert see identical figures for the same store and window.

1. **Add "Last 7 days"** as a window alongside the existing ones.
2. **Remove YTD dollar values.** YTD survives only as a **percentage vs target**.
3. **Target displays on a monthly basis**, not the selected window's basis.

### 2a. ⚠️ ARCHITECTURE — the portal has its OWN scorecard API. Read this first.

**An earlier draft of this document said the portal reads the mini's
`GET /api/scorecard`. That was wrong.** It was inferred from the endpoint's name and the
Phase 0 notes without checking the deployed client. Corrected 2026-08-09 after inspecting
the live bundle. **The three changes below must be made in the portal's own Pages
Function, not only in the React view** — changing the view alone will not work, because
the data it renders never comes from the mini.

The deployed bundle (`/assets/index-*.js`) calls a **relative** path:

```js
await fetch("/api/scorecard", { headers: { Authorization: `Bearer ${sessionToken}` } })
```

which resolves to `https://neob-store-portal.pages.dev/api/scorecard` — a **Cloudflare
Pages Function in this repo**, not the mini. There is a companion
`POST /api/scorecard-auth` for the manager-code gate.

Verified four ways on 2026-08-09:

| Check | Result |
|---|---|
| Portal host serves its own `/api/scorecard` | yes — 401 with its own message |
| Mini's error shape | `{"error":"Unauthorized"}` |
| Portal's error shape | `{"error":"Your session has expired. Please sign in again."}` |
| Mini's `Bearer neob-portal-sync-2026` sent to the portal | **rejected** — not a proxy |
| Mini reachable from Cloudflare | **no** — `app.listen(PORT, '127.0.0.1')`, localhost only |

The mini is bound to loopback, so a Pages Function **cannot** reach it even server-side.
The two scorecards are independent implementations over different data stores.

**Consequences for this work:**

1. **Implement all three changes in the Pages Function** (`functions/api/scorecard*`, or
   wherever it lives in `neob-store-portal-v4`) as well as the view.
2. **First, establish where its numbers come from.** Likely D1. One thing to check before
   any cosmetic work: D1's `daily_entries` currently holds **2 rows, spanning 2026-03-07
   to 2026-05-28**. If the scorecard is built on that table it is reading almost nothing,
   and that is a bigger problem than the window selector.
3. **AOV needs checking there too.** On the mini, `/api/scorecard` had been computing a
   raw `net ÷ transactions` average instead of the house definition
   `Σ(net_sales − aov_excluded_net) / Σ(orders − aov_excluded_orders)` (first 5 sub-$15
   transactions per store per day excluded). That was fixed on the mini (`744d71f`) so it
   now matches `ceo.html`. **The portal's AOV is a third implementation and its definition
   is unknown from here — verify it against `ceo.html` and report what you find.**
4. **"Both surfaces agree" may not hold for ANY metric today,** not just AOV, since the
   two are computed from different sources. Worth a reconciliation pass on net, txns and
   target before assuming only the window selector is missing.

**What exists on the mini, unconsumed.** `periods.last7` (7 complete days ending `as_of`)
and a top-level `month_target` were added on 2026-08-09 (`e01854d`) and are live. Nothing
calls them today. They are the reference implementation for the conventions in §2b, and
are ready if the portal is ever repointed at the mini — which would need the mini exposed
beyond loopback, a separate decision.

```json
"month_target": { "month": "2026-08", "target": 145373,
                  "days_with_target": 31, "days_in_month": 31, "partial": false }
```

Note for whichever backend serves it: use a **full-calendar-month** target, not a
month-to-date sum. An MTD sum grows through the month, which is exactly the behaviour
change 3 exists to remove. Honour a `partial` flag by marking the figure, never
presenting an incomplete month as complete.

### 2b. Field names and conventions to code against

**These are the MINI's field names, shown as the reference implementation.** The portal's
own Pages Function may use different names — check it. What must carry across is the
**conventions** in the table below, not the identifiers.

Each period object from the mini's `/api/scorecard` carries:

```
label, start, end, net_sales, transactions, aov,
target, target_variance_pct, ly_net_sales, ly_variance_pct, ly_dates
target_partial?  ly_partial?      // present only when true
```

Conventions that must not be re-derived in the portal:

| Thing | Rule |
|---|---|
| Window end | **Yesterday**, Toronto, inclusive. Never today — a partial day drags every average down. |
| "Last 7 days" | **7 complete days ending yesterday** = `as_of − 6 … as_of`. On the mini this is `resolvePeriod('7d')`. |
| LY | **Day-of-week matched, −364 days** (52 weeks), so Saturday compares to Saturday. Not same-calendar-date. |
| Money | **NET** — `net_sales = selling price − discounts − taxes − refunds`, shipping excluded, gift cards excluded both ways. Settled 2026-08-09. |
| Partial target | If some days in the range have no `kpi_targets` row, `target_partial: true` and `target_variance_pct` is **null**. Never variance a partial target. |
| Partial LY | If the LY window predates the store's first sale, `ly_partial: true` and `ly_variance_pct` is **null**. Render "n/a", never `$0`. |

### 2c. Numbers to verify against (mini, live, 2026-08-09)

If the portal shows anything different for the same store and window, one of the two is
wrong. Windows end **2026-08-08** (yesterday).

**Last 7 days — 2026-08-02 → 2026-08-08**

| Store | Net | AOV |
|---|---|---|
| Flower Farm | $32,753.25 | $46.66 |
| Queen Street | $30,583.43 | $38.80 |
| Elora | $10,195.02 | $35.85 |
| Stratford | $8,414.72 | $42.86 |
| Bracebridge | $6,992.57 | $41.26 |

**Last 30 days — 2026-07-10 → 2026-08-08**

| Store | Net | AOV |
|---|---|---|
| Flower Farm | $172,183.57 | $43.72 |
| Queen Street | $132,856.57 | $39.28 |
| Elora | $40,996.54 | $35.64 |
| Stratford | $37,392.11 | $39.21 |
| Bracebridge | $27,236.39 | $39.09 |

**YTD — 2026-01-01 → 2026-08-08** (dollars listed here **for verification only** — they
must NOT be displayed on the scorecard after change 2)

| Store | Net | AOV |
|---|---|---|
| Flower Farm | $599,965.63 | $45.04 |
| Queen Street | $561,552.05 | $41.00 |
| Elora | $158,005.74 | $39.43 |
| Stratford | $135,872.08 | $41.55 |
| Bracebridge | $73,372.40 | $39.98 |

**Month target — August 2026, from `kpi_targets` (`GET /api/targets/monthly`)**

| Store | Target | Note |
|---|---|---|
| Queen Street | $145,373 | 31/31 days |
| Flower Farm | $133,913 | 31/31 days |
| Elora | $54,582 | 31/31 days |
| Stratford | $40,971 | 31/31 days |
| Bracebridge | **$29,611** | **30/31 — 2026-08-27 has no target row.** Mark it partial; do not present as a complete month |
| Online/DTC | $31,304 | 31/31 days |

Note `kpi_targets` currently **ends 2026-08-31** — September onward has no rows for any
store. Melissa's to publish; do not generate targets from the portal.

### 2d. Two target bases coexist — label, do not unify

- **Month Target** comes from `kpi_targets` (the per-day plan), which **begins 2026-05-27**.
- **YTD vs Target** uses the **annual** plan target.

There is no daily plan before 2026-05-27 because none was ever set. **Do not backfill it**
(decision, Robert, 2026-08-09): a retrospective daily plan would make every historical
attainment figure reflect numbers invented after the fact. `ceo.html` labels these
"Month Target (daily plan)" and "YTD vs Annual Target" and footnotes both — mirror that
wording so the two surfaces read the same.

Also note targets are **held at their dollar numbers as net**, not rescaled (Phase 3,
basis LOCKED). The ~64% 2026 pace is **intentional**. Do not "correct" attainment for a
net-vs-gross gap; that is a settled decision, not a bug.

---

## 3. One bug to not repeat

`/api/revenue/by-store-net` on the mini never used the shared `resolvePeriod()` helper. It
hand-rolled its window, handled only `ytd` and explicit ranges, and **silently fell back to
30 days for everything else** — so `?period=7d` returned 30 days of data labelled `"7d"`.
Fixed this round (`4936626`); unknown periods now return 400 rather than substituting a
different window.

The portal is a consumer of named periods, so it was directly exposed. **Ask the API for a
window by name and render what comes back — never compute a window locally and assume it
matches.** If a window you need does not exist server-side, add it server-side.

---

## 4. Checklist

- [ ] **§1 answered** — does the entry form pre-fill revenue? From what? Since when?
- [ ] **§2a understood** — the changes go in the portal's OWN Pages Function
      (`/api/scorecard` + `/api/scorecard-auth` on the portal host), not only the view.
      The mini's endpoint of the same name is **not** what the portal calls.
- [ ] **Data source of the portal scorecard identified and reported** — and specifically,
      whether D1 `daily_entries` (2 rows, 2026-03-07 → 2026-05-28) is behind it
- [ ] `https://neob-store-portal.pages.dev/scorecard` shows Last 7 days = 7 complete days
      ending yesterday
- [ ] **Reconciliation pass** — net, transactions, AOV and target compared against
      `ceo.html` for the same store and window, differences reported. Do not assume only
      the window selector differs; the two are independent implementations
- [ ] No YTD dollar figure anywhere on the portal scorecard; YTD % vs target present
- [ ] Month target on a full-calendar-month basis (NOT month-to-date), partial months
      marked
- [ ] Both target bases labelled as in §2d
- [ ] Partial target / partial LY render as "n/a", never `$0` or a variance
- [ ] No window arithmetic in the client — the window comes from whichever API serves it
