// Calculates suggested order quantities for a store using:
//   1. Manual Par: Inventory.reorder_point - Inventory.quantity (HQ stock)
//   2. Seasonality: current month sales vs avg monthly sales for that store
//
// Inputs:
//   demandSummary: a DemandSummary record { byLocation, monthly, avgMonthly }
//   storeName:     the active store name (must match a key in byLocation)
//
// Returns: { multiplier, isPeak, currentMonthQty, storeMonthlyAvg }

const PEAK_THRESHOLD = 1.2; // 20% above avg = peak
const PEAK_MULTIPLIER = 1.5;
const SLOW_THRESHOLD = 0.6; // 40% below avg = slow
const SLOW_MULTIPLIER = 0.75;

function parseJSON(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Returns YYYY-MM for current month
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Looks up sales for a specific store in DemandSummary.byLocation.
// byLocation is { "store name": total_units_in_period }.
function getStoreShareOfSales(demandSummary, storeName) {
  const byLocation = parseJSON(demandSummary?.byLocation, {});
  const total = Object.values(byLocation).reduce((a, b) => a + (Number(b) || 0), 0);
  if (total <= 0) return 0;
  const storeQty = Number(byLocation[storeName] || 0);
  return storeQty / total;
}

// Estimates whether the current month is a "peak" period for this SKU overall,
// based on the monthly history vs the average. Returns a multiplier to apply to
// the base suggested quantity.
export function getSeasonalMultiplier(demandSummary) {
  if (!demandSummary) return { multiplier: 1, isPeak: false, isSlow: false };

  const monthly = parseJSON(demandSummary.monthly, {});
  const avgMonthly = Number(demandSummary.avgMonthly) || 0;
  if (avgMonthly <= 0) return { multiplier: 1, isPeak: false, isSlow: false };

  // monthly can be either { "2026-04": 2, ... } or [7, 11, 4, ...]
  let currentMonthQty = 0;
  if (Array.isArray(monthly)) {
    currentMonthQty = Number(monthly[new Date().getMonth()]) || 0;
  } else {
    currentMonthQty = Number(monthly[currentMonthKey()]) || 0;
    // Fallback: use the most recent month with data if current is empty
    if (currentMonthQty === 0) {
      const sortedKeys = Object.keys(monthly).sort().reverse();
      if (sortedKeys.length > 0) currentMonthQty = Number(monthly[sortedKeys[0]]) || 0;
    }
  }

  const ratio = currentMonthQty / avgMonthly;
  if (ratio >= PEAK_THRESHOLD) {
    return { multiplier: PEAK_MULTIPLIER, isPeak: true, isSlow: false, ratio };
  }
  if (ratio <= SLOW_THRESHOLD) {
    return { multiplier: SLOW_MULTIPLIER, isPeak: false, isSlow: true, ratio };
  }
  return { multiplier: 1, isPeak: false, isSlow: false, ratio };
}

// Main entry: combines manual par + seasonality to suggest an order qty for one product.
//
// Inputs:
//   reorderPoint:  Inventory.reorder_point (manual par target)
//   currentStock:  current HQ stock (or store-specific if available)
//   demandSummary: DemandSummary record for this SKU (optional)
//   storeName:     store placing the order (used to scale by historical share)
//
// Returns: { suggested, isPeak, isSlow, basePar, seasonal }
export function calculateSuggestedQty({ reorderPoint, currentStock, demandSummary, storeName }) {
  const par = Number(reorderPoint) || 0;
  const stock = Number(currentStock) || 0;

  // Base par-driven gap (how far below par are we, HQ-wide)
  const baseGap = Math.max(0, par - stock);

  // If we have store-level history, scale the suggestion by this store's
  // historical share of total sales for the SKU. That way, a small store
  // doesn't get suggested the same qty as a flagship store.
  let storeShare = 1;
  if (demandSummary && storeName) {
    const share = getStoreShareOfSales(demandSummary, storeName);
    // Only apply share if we have meaningful history; otherwise default to 1
    if (share > 0) storeShare = share;
  }

  const seasonal = getSeasonalMultiplier(demandSummary);

  const raw = baseGap * storeShare * seasonal.multiplier;
  const suggested = Math.max(0, Math.round(raw));

  return {
    suggested,
    isPeak: seasonal.isPeak,
    isSlow: seasonal.isSlow,
    basePar: par,
    storeShare,
    seasonalMultiplier: seasonal.multiplier
  };
}