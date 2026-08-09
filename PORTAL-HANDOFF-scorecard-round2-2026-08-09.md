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
- `/api/scorecard` — the mini API endpoint the portal page reads. Needs its own change
  first, see §2a.

The same three changes shipped on `ceo.html` must land on the portal scorecard page, so
a store manager and Robert see identical figures for the same store and window.

1. **Add "Last 7 days"** as a window alongside the existing ones.
2. **Remove YTD dollar values.** YTD survives only as a **percentage vs target**.
3. **Target displays on a monthly basis**, not the selected window's basis.

### 2a. ✅ The mini side is DONE — the API can serve all three changes

The portal reads `GET /api/scorecard?store=<name>&as_of=YYYY-MM-DD` (Bearer auth) from the
mini. **This was the blocker; it has been cleared** (mini commits `e01854d`, `744d71f`,
live on 2026-08-09). No further mini work is needed before the portal work starts.

**`periods.last7` now exists** — 7 complete days ending `as_of`, e.g.
`2026-08-02 .. 2026-08-08`. Server-computed and identical by construction to
`resolvePeriod('7d')` on the CEO side. **Take the window from the server; do not
hand-roll a 7-day range in the portal** — that is exactly the bug found and fixed on the
mini this round (see §3).

**`month_target` now exists**, at the top level of the response (a sibling of `periods`,
not inside one), and is what change 3 needs:

```json
"month_target": { "month": "2026-08", "target": 145373,
                  "days_with_target": 31, "days_in_month": 31, "partial": false }
```

Use this, **not `periods.mtd.target`** — `mtd.target` covers only the elapsed days, so it
grows through the month, which is the behaviour change 3 exists to remove. Honour
`partial: true` by marking the figure, never presenting it as a complete month.

**`periods.ytd` still returns `net_sales` dollars.** That is deliberate — removing the
field server-side would have broken the live portal before your deploy lands. Change 2 is
satisfied by the portal **not displaying** it. Once the portal ships, the field can be
retired on the mini.

> ⚠️ **Heads-up: AOV values changed on 2026-08-09 and will look different.**
> `/api/scorecard` had been computing a raw `net ÷ transactions` average, which is not
> the house definition. It now uses
> `Σ(net_sales − aov_excluded_net) / Σ(orders − aov_excluded_orders)` — the first 5
> sub-$15 transactions per store per day are excluded — matching `ceo.html`.
> Manager-visible AOV rises by **$1.14–$5.29** depending on store. Before the fix,
> **Stratford ($37.57 vs $42.86) and Bracebridge ($36.42 vs $41.26) read as FAILING the
> $40 floor on the portal while PASSING on Robert's dashboard**, same store, same week.
> If a manager asks why their AOV jumped, that is the reason. `transactions` is unchanged
> and is still the full order count.

### 2b. Field names and conventions to code against

Each period object from `/api/scorecard` currently carries:

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
- [x] `/api/scorecard` gains a `last7` period + `month_target` — DONE on the mini
      2026-08-09 (`e01854d`, `744d71f`), live. Nothing to coordinate; just consume it.
- [ ] `https://neob-store-portal.pages.dev/scorecard` shows Last 7 days, matching the
      §2c figures exactly
- [ ] No YTD dollar figure anywhere on the portal scorecard; YTD % vs target present
- [ ] Month target from top-level `month_target` (NOT `periods.mtd.target`), matching
      §2c, Bracebridge marked partial
- [ ] Both target bases labelled as in §2d
- [ ] Partial target / partial LY render as "n/a", never `$0` or a variance
- [ ] No window arithmetic in the portal — every window requested by name
