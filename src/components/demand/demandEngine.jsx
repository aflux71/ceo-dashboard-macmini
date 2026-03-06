import { categorize } from "./demandHelpers";

function classifyUrgency(monthsCover) {
  if (monthsCover < 1) return "CRITICAL";
  if (monthsCover < 2) return "LOW";
  if (monthsCover < 3) return "WATCH";
  return "OK";
}

/**
 * Calculate weighted average monthly demand.
 * Weights last 3 months of actual data 2x vs older months.
 * Falls back to simple avg if less than 4 months of data.
 */
function calcWeightedAvgMonthly(monthly, dataMonths) {
  if (!Array.isArray(monthly) || monthly.length !== 12) return 0;
  
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  
  // Get months with data, ordered from most recent backwards
  const monthsWithData = [];
  for (let i = 0; i < 12; i++) {
    // Walk backwards from current month
    const idx = (currentMonth - i + 12) % 12;
    if (monthly[idx] > 0) {
      monthsWithData.push({ idx, qty: monthly[idx], recency: i });
    }
  }
  
  if (monthsWithData.length === 0) return 0;
  
  // If less than 4 months of data, use simple average
  if (monthsWithData.length < 4) {
    const total = monthsWithData.reduce((s, m) => s + m.qty, 0);
    return Math.round((total / monthsWithData.length) * 10) / 10;
  }
  
  // Weighted: recent 3 months get 2x weight
  let weightedSum = 0;
  let totalWeight = 0;
  for (const m of monthsWithData) {
    const weight = m.recency < 3 ? 2 : 1;
    weightedSum += m.qty * weight;
    totalWeight += weight;
  }
  
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/**
 * Get seasonal multiplier for a future month based on historical monthly data.
 * If a month historically sells 2x the average, multiplier = 2.0
 */
function getSeasonalMultiplier(monthly, targetMonth) {
  if (!Array.isArray(monthly) || monthly.length !== 12) return 1;
  
  const monthsWithData = monthly.filter(v => v > 0);
  if (monthsWithData.length < 3) return 1; // Not enough data for seasonal patterns
  
  const avg = monthsWithData.reduce((s, v) => s + v, 0) / monthsWithData.length;
  if (avg <= 0) return 1;
  
  const targetQty = monthly[targetMonth];
  if (targetQty <= 0) return 1; // No historical data for this month
  
  return targetQty / avg;
}

export function generatePlan(summaries, inventoryMap, workspace, events = []) {
  const {
    mode = "forecast",
    forecastMonths = 4,
    growthPct = 0,
    safetyPct = 20,
    targetLevels = {},
    inventoryOverrides = {},
    useSeasonality = true,
    useWeightedVelocity = true,
  } = workspace;

  const now = new Date();
  const growth = 1 + (growthPct / 100);
  const safety = 1 + (safetyPct / 100);

  // Build event demand map
  const eventDemandMap = {};
  (events || []).forEach(ev => {
    (ev.items || []).forEach(item => {
      if (item.sku) {
        eventDemandMap[item.sku] = (eventDemandMap[item.sku] || 0) + (item.qty || 0);
      }
    });
  });

  const items = (summaries || []).map(s => {
    const totalQty = s.totalQty || 0;
    const totalRevenue = s.totalRevenue || 0;

    const onHand = inventoryOverrides[s.sku] != null
      ? inventoryOverrides[s.sku]
      : (inventoryMap[s.sku] || 0);

    let monthly = s.monthly;
    if (typeof monthly === "string") { try { monthly = JSON.parse(monthly); } catch { monthly = []; } }
    if (!Array.isArray(monthly)) monthly = [];

    let byChannel = s.byChannel;
    if (typeof byChannel === "string") { try { byChannel = JSON.parse(byChannel); } catch { byChannel = {}; } }

    let byLocation = s.byLocation;
    if (typeof byLocation === "string") { try { byLocation = JSON.parse(byLocation); } catch { byLocation = {}; } }

    // Calculate velocity — use weighted if enabled, else simple
    const simpleAvg = s.avgMonthly || 0;
    const weightedAvg = useWeightedVelocity ? calcWeightedAvgMonthly(monthly, s.dataMonths) : simpleAvg;
    const avgMonthly = Math.max(weightedAvg, simpleAvg); // Use the higher of the two to avoid underforecasting

    // Forecast
    let forecastTotal = 0;
    const forecastByMonth = [];

    if (mode === "forecast") {
      for (let i = 0; i < forecastMonths; i++) {
        const monthIdx = (now.getMonth() + i) % 12;
        let demand = Math.round(avgMonthly * growth);
        
        // Apply seasonal multiplier if enabled and enough data
        if (useSeasonality && monthly.length === 12) {
          const seasonal = getSeasonalMultiplier(monthly, monthIdx);
          if (seasonal > 0) {
            demand = Math.round(avgMonthly * growth * seasonal);
          }
        }
        
        forecastByMonth.push({ month: monthIdx, demand });
        forecastTotal += demand;
      }
    } else {
      const target = targetLevels[s.sku] != null ? targetLevels[s.sku] : avgMonthly * forecastMonths;
      forecastTotal = target;
    }

    const eventQty = eventDemandMap[s.sku] || 0;
    const grossNeed = Math.round((forecastTotal + eventQty) * safety);
    const productionNeed = Math.max(0, grossNeed - onHand);

    const monthsCover = avgMonthly > 0
      ? Math.round((onHand / avgMonthly) * 10) / 10
      : 99;

    const urgency = classifyUrgency(monthsCover);

    return {
      sku: s.sku,
      product: s.product || s.sku,
      category: s.category || categorize(s.product),
      avgMonthly,
      totalQty,
      totalRevenue,
      monthly,
      byChannel: byChannel || {},
      byLocation: byLocation || {},
      onHand,
      forecastTotal,
      forecastByMonth,
      eventQty,
      grossNeed,
      productionNeed,
      monthsCover,
      urgency,
      dataMonths: s.dataMonths,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
    };
  });

  // Summary stats
  const totalSKUs = items.length;
  const totalNeed = items.reduce((sum, i) => sum + i.productionNeed, 0);
  const critical = items.filter(i => i.urgency === "CRITICAL").length;
  const low = items.filter(i => i.urgency === "LOW").length;
  const watch = items.filter(i => i.urgency === "WATCH").length;
  const ok = items.filter(i => i.urgency === "OK").length;
  const avgCoverRaw = items.length > 0
    ? items.reduce((sum, i) => sum + Math.min(i.monthsCover, 12), 0) / items.length
    : 0;
  const avgCover = Math.round(avgCoverRaw * 10) / 10;
  const eventItems = items.filter(i => i.eventQty > 0).length;
  const eventQty = items.reduce((sum, i) => sum + i.eventQty, 0);

  const catMap = {};
  items.forEach(i => {
    if (!catMap[i.category]) catMap[i.category] = { category: i.category, totalNeed: 0, skuCount: 0 };
    catMap[i.category].totalNeed += i.productionNeed;
    catMap[i.category].skuCount += 1;
  });
  const categories = Object.values(catMap).sort((a, b) => b.totalNeed - a.totalNeed);

  return {
    items,
    categories,
    summary: { totalSKUs, totalNeed, critical, low, watch, ok, avgCover, eventItems, eventQty },
  };
}

export function sortPlanItems(items, sortBy) {
  const urgencyOrder = { CRITICAL: 0, LOW: 1, WATCH: 2, OK: 3 };
  const arr = [...items];
  switch (sortBy) {
    case "urgency":
      return arr.sort((a, b) => {
        const ud = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        return ud !== 0 ? ud : b.productionNeed - a.productionNeed;
      });
    case "need":    return arr.sort((a, b) => b.productionNeed - a.productionNeed);
    case "demand":  return arr.sort((a, b) => b.avgMonthly - a.avgMonthly);
    case "name":    return arr.sort((a, b) => a.product.localeCompare(b.product));
    case "sku":     return arr.sort((a, b) => a.sku.localeCompare(b.sku));
    case "cover":   return arr.sort((a, b) => a.monthsCover - b.monthsCover);
    default:        return arr;
  }
}

export { categorize };