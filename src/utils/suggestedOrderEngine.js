// Suggested order quantity engine.
//
// Priority for the "base gap" (how many units a store needs):
//   1. Manual Par: Inventory.reorder_point - storeShelfStock (most accurate)
//   2. Forecast:   DemandSummary.avgMonthly * storeShare       (when par is missing)
//
// Then a seasonal multiplier (peak/slow) is applied based on the SKU's
// historical monthly pattern.

const PEAK_THRESHOLD = 1.2;
const PEAK_MULTIPLIER = 1.5;
const SLOW_THRESHOLD = 0.6;
const SLOW_MULTIPLIER = 0.75;

// Tag used by syncShopifyInventory to embed per-location stock in Inventory.notes
const STOCK_TAG_RE = /<!--SHOPIFY_STOCK:([\s\S]*?):END-->/;

function parseJSON(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Extracts the per-location stock map embedded in Inventory.notes by the Shopify sync.
// Returns { "neob Queen Street": 12, "neob HQ": 80, ... } or {} if none present.
export function parseStockByLocation(notes) {
  if (!notes) return {};
  const match = String(notes).match(STOCK_TAG_RE);
  if (!match) return {};
  const data = parseJSON(match[1], null);
  return data?.byLocation || {};
}

function getStoreShareOfSales(demandSummary, storeName) {
  const byLocation = parseJSON(demandSummary?.byLocation, {});
  const total = Object.values(byLocation).reduce((a, b) => a + (Number(b) || 0), 0);
  if (total <= 0) return 0;
  return (Number(byLocation[storeName]) || 0) / total;
}

export function getSeasonalMultiplier(demandSummary) {
  if (!demandSummary) return { multiplier: 1, isPeak: false, isSlow: false };
  const monthly = parseJSON(demandSummary.monthly, {});
  const avgMonthly = Number(demandSummary.avgMonthly) || 0;
  if (avgMonthly <= 0) return { multiplier: 1, isPeak: false, isSlow: false };

  let currentMonthQty = 0;
  if (Array.isArray(monthly)) {
    currentMonthQty = Number(monthly[new Date().getMonth()]) || 0;
  } else {
    currentMonthQty = Number(monthly[currentMonthKey()]) || 0;
    if (currentMonthQty === 0) {
      const sortedKeys = Object.keys(monthly).sort().reverse();
      if (sortedKeys.length > 0) currentMonthQty = Number(monthly[sortedKeys[0]]) || 0;
    }
  }

  const ratio = currentMonthQty / avgMonthly;
  if (ratio >= PEAK_THRESHOLD) return { multiplier: PEAK_MULTIPLIER, isPeak: true, isSlow: false, ratio };
  if (ratio <= SLOW_THRESHOLD) return { multiplier: SLOW_MULTIPLIER, isPeak: false, isSlow: true, ratio };
  return { multiplier: 1, isPeak: false, isSlow: false, ratio };
}

// Main entry.
//
// Inputs:
//   reorderPoint:       Inventory.reorder_point (manual par target, optional)
//   currentStock:       HQ stock (used for fallback context)
//   storeShelfStock:    On-shelf qty at the ordering store, from Shopify per-location sync (optional)
//   demandSummary:      DemandSummary record for this SKU (optional)
//   storeName:          store placing the order
//
// Returns: { suggested, isPeak, isSlow, basis: 'par' | 'forecast' | 'none', ... }
export function calculateSuggestedQty({
  reorderPoint,
  currentStock,
  storeShelfStock,
  demandSummary,
  storeName,
}) {
  const par = Number(reorderPoint) || 0;
  const shelf = Number(storeShelfStock) || 0;
  const hasShelf = typeof storeShelfStock === "number";

  // Store's share of total SKU sales (used to scale par and forecast for this store)
  let storeShare = 1;
  if (demandSummary && storeName) {
    const share = getStoreShareOfSales(demandSummary, storeName);
    if (share > 0) storeShare = share;
  }

  // ---- Base gap calculation ----
  let baseGap = 0;
  let basis = 'none';

  if (par > 0) {
    // Par-based: prefer store shelf stock if we have it; otherwise use HQ stock context
    const stockForPar = hasShelf ? shelf : (Number(currentStock) || 0);
    baseGap = Math.max(0, par - stockForPar);
    // Only scale par by storeShare when par is HQ-level (no shelf stock).
    if (!hasShelf) baseGap = baseGap * storeShare;
    basis = 'par';
  } else if (demandSummary?.avgMonthly) {
    // Forecast-based fill-in: one month of demand for this store, minus what's on shelf
    const forecastedMonthly = Number(demandSummary.avgMonthly) * storeShare;
    baseGap = Math.max(0, forecastedMonthly - shelf);
    basis = 'forecast';
  }

  const seasonal = getSeasonalMultiplier(demandSummary);
  const suggested = Math.max(0, Math.round(baseGap * seasonal.multiplier));

  return {
    suggested,
    isPeak: seasonal.isPeak,
    isSlow: seasonal.isSlow,
    basis,
    basePar: par,
    storeShare,
    storeShelfStock: hasShelf ? shelf : null,
    seasonalMultiplier: seasonal.multiplier,
  };
}