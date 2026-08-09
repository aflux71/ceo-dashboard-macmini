# In-store gift sets have been unsellable since June 15 — action needed in Shopify Admin

**To:** Melissa
**From:** Robert / dashboard team
**Date:** 2026-08-09
**Status:** investigation complete, read-only. **No changes have been made in Shopify.**

---

## The short version

On **2026-06-15** the 33 in-store gift sets were rebuilt as **Shopify Bundles**
(the Bundles app). **Shopify Bundles cannot be sold on POS** — the feature supports
Online Store and Headless only.

The result: since June 15 the in-store gift sets have been **impossible to ring up in
stores**. They look fine in Admin — all 33 are `Active` — but a POS terminal cannot
transact a bundle. They have sold **once** since that date, on June 15 itself.

Measured impact: **$462/day** of gift-set sales, now gone.

| Period | Gift-set line revenue (POS) | Per day |
|---|---|---|
| Apr 1 – Jun 14 2026 (75 days, pre-conversion) | **$34,685.52** | **$462/day** |
| Jun 16 – Aug 8 2026 (54 days, post-conversion) | **$0.00** | $0/day |

That is **~$24,900 of gift-set revenue not rung up** in the 54 days since the change.

These figures are **measured, not estimated**. An earlier version of this note said
~$570/day; that counted the *whole basket* of any order containing a gift set. $462/day
is the gift-set line items themselves, which is the amount actually attributable to the
product line. The lower figure is the one to quote.

**One important caveat — please do not repeat the $24,900 as a bottom-line loss.**
Over the same post-conversion window, total in-store net sales were **up 2.7%
year-over-year** ($756,320 → $776,663), with average basket up from $35.72 to $39.00.
So the gift-set line revenue is definitely gone, and we have confirmed nothing else
replaced it directly — but we cannot show that $24,900 fell straight off the bottom
line. Some of that spend appears to have gone to other products. The defensible
statement is: *we have lost a $460/day product line, and we cannot yet say how much of
that basket left the store versus converted to something else.*

We also specifically tested whether the in-store "Bath Bomb Mix & Match" promo picked
up the slack. **It did not.** Year-over-year on the same calendar window its
participation grew 5%, against 6% growth in the window *before* the conversion — the
same underlying trend, with no jump at the changeover.

This is a real sales loss, not a reporting glitch — earlier notes that framed it as a
merchandising or tracking problem were wrong.

**The online (DTC) gift sets are unaffected and must not be changed.** They were never
converted to bundles and are selling normally.

---

## Why it needs you specifically

Our API credentials are **read-only for products**. We verified this directly:

| Permission | Held? |
|---|---|
| Read products, inventory, locations | Yes |
| **Edit products (`write_products`)** | **No** |
| **Read sales-channel publication (`read_publications`)** | **No** |

We can see the problem but cannot fix it, and we cannot see which sales channels the
products are published to. **All remediation has to be done by you in the Shopify Admin.**

---

## Two things only you can confirm

We can't read either of these with our access. Please check before deciding anything:

1. **Are the 33 in-store gift sets actually published to the POS sales channel?**
   Our fallback read says `published_scope: global` for all 33, but that's a coarse
   legacy field, not proof. If they're *not* on POS, that's a second, separate problem
   stacked on top of the bundle issue.

2. **Is the HQ-only inventory location deliberate?**
   All 33 bundle products have an inventory record at **neob HQ only** — none at
   Bracebridge, Elora, Flower Farm, Queen Street, or Stratford. (Bundle products hold
   no stock of their own, so this may be cosmetic — see the good news below.)

---

## Good news: the stock is already in the stores

We checked the components behind every one of the 33 sets against the five store
locations. **All 33 sets are buildable from stock already on hand at at least one
store**, and no component is missing store inventory records.

Sample of buildable units per store (limited by the scarcest component):

| Gift set | Bracebridge | Elora | Flower Farm | Queen St | Stratford |
|---|---|---|---|---|---|
| GS0006 Botanical Bliss Glorious Collection | 13 | 37 | 52 | 27 | 44 |
| GS0009 The Complete Ritual Massuet Collection | 5 | — | 37 | 42 | 8 |
| GS0017 | 30 | — | 37 | 57 | 54 |
| GS0024 | 0 | 2 | 64 | 68 | 8 |
| GS0033 | 17 | 38 | 81 | 42 | 26 |
| GS0039 | 10 | 7 | 21 | 23 | 11 |

**So this is not a restocking job.** The only blocker is the bundle format itself.

(Aside, unrelated to gift sets: several shared components are showing negative stock at
Elora — one is at **−310**. Worth a separate look at some point.)

---

## One thing that is *not* recoverable

The original, pre-conversion gift set products were **deleted**, not left alongside the
new ones. We checked all 33 original product IDs — every one returns "not found" in
Shopify. Every gift set was recreated under an identical title as a brand-new product
carrying the same `GS####` SKU.

**There is no earlier version to restore or re-publish.** Whatever is done has to be
done to the current 33 products.

---

## Your options

| | Action | Trade-off |
|---|---|---|
| **A — Un-bundle** *(recommended if in-store gift sets matter)* | Convert the 33 back to ordinary products keeping their `GS####` SKUs; stock them at the 5 store locations | Restores in-store sales **and** SKU-level reporting. Loses the Bundles app's automatic component-inventory linkage — stock has to be managed on the gift set itself |
| **B — Duplicate** | Keep the 33 bundles for online; create parallel POS-only products for stores | Both channels work, but the catalogue doubles and the SKU set splits again |
| **C — Accept** | Retire in-store gift sets; measure the "Bath Bomb Mix & Match" promo instead | No Shopify work; the $462/day stays gone |

**Our recommendation: A.** Stock is already in place, so the sets could be sellable again
the same day the conversion is reversed.

---

## If you choose A, what we need from you

- Confirm the 33 are published to the **POS** channel once converted.
- Keep the **`GS####` SKUs exactly as they are** — our reporting keys off them, and
  changing them breaks the history.
- Keep the **`neob-bundle-pos`** and **`In Store Gift Set`** tags on all 33. Both are used.
- Tell us the date you make the change so we can mark the break in the dashboard.

---

## Please don't touch: the 5 online gift sets

These are a separate set of products, working correctly. They were never bundled.

| SKU | Title | Status | Last sold |
|---|---|---|---|
| GS0001 | Lavender Harvest Collection | Active | 2026-08-07 |
| GS0000 | Ultimate Pain Relief Collection | Active | 2026-07-28 |
| GS0003 | Botanical Bliss Lavender Edition | Active | 2026-07-07 |
| GS0005 | The Lavender Ritual | Active | 2026-06-27 |
| GS0002 | Lavender Body Care Set | **Archived** | 2026-06-22 |

One question here: **GS0002 was archived recently — was that intentional?** If not, it's
a quick unarchive.

---

## Separate, smaller item — for information only

There *is* an in-store bundle promo that works today: the automatic discount
**"Bath Bomb Mix & Match"**, appearing on about **4% of POS orders**. Our dashboard
currently doesn't count it, which is a fix on our side, not yours.

One question for you: **is "Bath Bomb Mix & Match" the only in-store bundle promo?**
We also see occasional manual discounts named "custom set" and "2 small soaps for price
of 1 large" — we're assuming those are ad-hoc and shouldn't be counted as bundles.
Tell us if that's wrong.

---

## Summary of what we need back

1. Are the 33 published to the **POS** channel? (yes/no)
2. Is **HQ-only inventory** on the gift sets deliberate? (yes/no)
3. Which option — **A, B, or C**?
4. Was **GS0002** archived on purpose?
5. Is **"Bath Bomb Mix & Match"** the only in-store bundle promo?
