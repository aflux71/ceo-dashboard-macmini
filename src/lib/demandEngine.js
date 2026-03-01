// ============================================================================
// neōb Demand Engine — Pure calculation functions
// No UI dependencies. Designed for future AI/ML integration.
// ============================================================================

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Category Detection ─────────────────────────────────────────────────────
export const categorize = (name) => {
  const n = (name || "").toLowerCase();
  const rules = [
    [/bath bomb|(?<!\w)bomb(?!\w)/, "Bath Bombs"],
    [/glycerine|soap bar|bathing bar/, "Soap Bars"],
    [/shampoo bar/, "Shampoo Bars"],
    [/body wash|one\s?wash/, "Body Wash"],
    [/hand soap|liquid soap|foaming soap/, "Liquid Soap"],
    [/conditioner/, "Conditioner"],
    [/shampoo/, "Shampoo"],
    [/body spritz|pillow spray|air mist|room fresh|linen water/, "Sprays & Mists"],
    [/lip balm|kissable/, "Lip Balm"],
    [/foot balm|foot cream/, "Foot Care"],
    [/cuticle|nail/, "Cuticle Cream"],
    [/roll.on/, "Roll-ons"],
    [/sachet/, "Sachets"],
    [/serum/, "Serums"],
    [/laundry|cleaner|dish soap|all purpose/, "Cleaners & Laundry"],
    [/detangler|hair/, "Hair Care"],
    [/essential oil|oil blend/, "Essential Oils"],
    [/massage|body oil/, "Body Oil"],
    [/salt|soak/, "Bath Salts"],
    [/scrub/, "Scrubs"],
    [/butter|lotion/, "Lotions & Butters"],
    [/bubble bath/, "Bubble Bath"],
    [/cream|healing|balm|gel/, "Creams & Balms"],
    [/chocolate|sparkling|ice cream|honey|tea/, "Food & Beverage"],
    [/gift|basket|(?<!\w)set(?!\w)|(?<!\w)box(?!\w)|(?<!\w)pack(?!\w)/, "Gift Sets"],
    [/refill|pouch/, "Refills"],
    [/candle|wax/, "Candles"],
  ];
  for (const [pattern, category] of rules) {
    if (pattern.test(n)) return category;
  }
  return "Other";
};

// ── Urgency Classification ─────────────────────────────────────────────────
export const classifyUrgency = (monthsCover) => {
  if (monthsCover < 1) return "CRITICAL";
  if (monthsCover < 2) return "LOW";
  if (monthsCover < 3) return "WATCH";
  return "OK";
};

export const URGENCY_ORDER = { CRITICAL: 0, LOW: 1, WATCH: 2, OK: 3 };

// ── Forecast Calculation ───────────────────────────────────────────────────
/**
 * Calculate demand forecast for a single SKU.
 * 
 * @param {Object} sku - SKU summary data
 * @param {number[]} sku.monthly - Array of 12 monthly sales totals
 * @param {number} sku.avgMonthly - Average monthly sales
 * @param {Object} config - Workspace configuration
 * @param {number} config.forecastMonths - Number of months to forecast
 * @param {number} config.growthPct - Growth adjustment percentage
 * @param {number} config.safetyPct - Safety stock percentage
 * @param {number} onHand - Current on-hand inventory
 * @param {number} eventDemand - Additional demand from events/POs
 * @returns {Object} Forecast result
 */
export const forecastSKU = (sku, config, onHand, eventDemand = 0) => {
  const now = new Date();
  const curMonth = now.getMonth();
  const growth = 1 + (config.growthPct / 100);
  const safetyMult = 1 + (config.safetyPct / 100);
  
  const forecastByMonth = [];
  let forecastTotal = 0;
  
  for (let i = 0; i < config.forecastMonths; i++) {
    const mIdx = (curMonth + i) % 12;
    const hist = sku.monthly[mIdx];
    // Use historical month if available, else fall back to average
    const baseDemand = hist > 0 ? hist : sku.avgMonthly;
    const demand = Math.round(baseDemand * growth);
    forecastByMonth.push({ month: MONTHS[mIdx], monthIdx: mIdx, demand });
    forecastTotal += demand;
  }
  
  const withSafety = Math.round(forecastTotal * safetyMult);
  const productionNeed = Math.max(0, withSafety + eventDemand - onHand);
  const monthsCover = sku.avgMonthly > 0
    ? Math.round((onHand / sku.avgMonthly) * 10) / 10
    : onHand > 0 ? 99 : 0;
  const urgency = classifyUrgency(monthsCover);
  
  // Weeks of stock (for warehouse planning)
  const weeksOfStock = sku.avgMonthly > 0
    ? Math.round((onHand / (sku.avgMonthly / 4.33)) * 10) / 10
    : onHand > 0 ? 99 : 0;
  
  return {
    forecastByMonth,
    forecastTotal,
    productionNeed,
    eventDemand,
    monthsCover,
    weeksOfStock,
    urgency,
    onHand,
  };
};

/**
 * Calculate level-based production need for a single SKU.
 */
export const levelSKU = (sku, targetLevel, onHand) => {
  const productionNeed = Math.max(0, targetLevel - onHand);
  const monthsCover = sku.avgMonthly > 0
    ? Math.round((onHand / sku.avgMonthly) * 10) / 10
    : onHand > 0 ? 99 : 0;
  return {
    targetLevel,
    productionNeed,
    monthsCover,
    weeksOfStock: sku.avgMonthly > 0
      ? Math.round((onHand / (sku.avgMonthly / 4.33)) * 10) / 10
      : onHand > 0 ? 99 : 0,
    urgency: classifyUrgency(monthsCover),
    onHand,
  };
};

// ── Full Plan Generation ───────────────────────────────────────────────────
/**
 * Generate the complete demand plan from summary data.
 * 
 * @param {Object[]} summaries - Array of DemandSummary records
 * @param {Object} inventory - {sku: onHandQty} from Shopify HQ
 * @param {Object} workspace - DemandConfig workspace settings
 * @param {Object[]} events - Array of DemandEvent records
 * @returns {Object} Complete plan with items, summary, categories
 */
export const generatePlan = (summaries, inventory, workspace, events = []) => {
  const exclusionSet = new Set(
    (typeof workspace.exclusionList === 'string' 
      ? JSON.parse(workspace.exclusionList || '[]') 
      : workspace.exclusionList || [])
  );
  
  // Calculate event demand per SKU
  const eventDemandBySKU = {};
  const eventDetailsBySKU = {};
  events.filter(e => e.status !== 'fulfilled').forEach(ev => {
    const items = typeof ev.items === 'string' ? JSON.parse(ev.items || '[]') : ev.items || [];
    items.forEach(item => {
      if (!eventDemandBySKU[item.sku]) {
        eventDemandBySKU[item.sku] = 0;
        eventDetailsBySKU[item.sku] = [];
      }
      eventDemandBySKU[item.sku] += item.qty;
      eventDetailsBySKU[item.sku].push({ event: ev.name, qty: item.qty, due: ev.dueDate });
    });
  });
  
  // Build plan items
  const items = summaries
    .filter(s => !exclusionSet.has(s.sku))
    .filter(s => s.avgMonthly >= workspace.minMonthlyVelocity || eventDemandBySKU[s.sku] > 0)
    .map(s => {
      const monthly = typeof s.monthly === 'string' ? JSON.parse(s.monthly) : s.monthly;
      const byChannel = typeof s.byChannel === 'string' ? JSON.parse(s.byChannel) : s.byChannel;
      const byLocation = typeof s.byLocation === 'string' ? JSON.parse(s.byLocation) : s.byLocation;
      
      const skuData = { ...s, monthly, byChannel, byLocation };
      const onHand = workspace.inventoryOverrides?.[s.sku] ?? inventory[s.sku] ?? 0;
      const eventQty = eventDemandBySKU[s.sku] || 0;
      
      let calc;
      if (workspace.mode === 'level') {
        const target = workspace.targetLevels?.[s.sku] || Math.round(s.avgMonthly * 3);
        calc = levelSKU(skuData, target, onHand);
      } else {
        calc = forecastSKU(skuData, workspace, onHand, eventQty);
      }
      
      return {
        ...skuData,
        ...calc,
        eventDetails: eventDetailsBySKU[s.sku] || [],
        hasEvent: eventQty > 0,
      };
    });
  
  // Category summary
  const catSummary = {};
  items.forEach(item => {
    if (!catSummary[item.category]) {
      catSummary[item.category] = { category: item.category, skuCount: 0, totalNeed: 0, totalOnHand: 0, totalForecast: 0 };
    }
    const c = catSummary[item.category];
    c.skuCount++;
    c.totalNeed += item.productionNeed;
    c.totalOnHand += item.onHand;
    if (item.forecastTotal) c.totalForecast += item.forecastTotal;
  });
  
  // Overall summary
  const overallSummary = {
    totalSKUs: items.length,
    totalNeed: items.reduce((s, i) => s + i.productionNeed, 0),
    critical: items.filter(i => i.urgency === 'CRITICAL').length,
    low: items.filter(i => i.urgency === 'LOW').length,
    watch: items.filter(i => i.urgency === 'WATCH').length,
    ok: items.filter(i => i.urgency === 'OK').length,
    avgCover: items.length > 0 ? Math.round(items.reduce((s, i) => s + i.monthsCover, 0) / items.length * 10) / 10 : 0,
    eventItems: Object.keys(eventDemandBySKU).length,
    eventQty: Object.values(eventDemandBySKU).reduce((s, v) => s + v, 0),
  };
  
  return {
    items,
    categories: Object.values(catSummary).sort((a, b) => b.totalNeed - a.totalNeed),
    summary: overallSummary,
    generatedAt: new Date().toISOString(),
  };
};

// ── Sorting ────────────────────────────────────────────────────────────────
export const sortPlanItems = (items, sortBy) => {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case 'urgency':
        if (URGENCY_ORDER[a.urgency] !== URGENCY_ORDER[b.urgency])
          return URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
        return b.productionNeed - a.productionNeed;
      case 'need': return b.productionNeed - a.productionNeed;
      case 'demand': return b.avgMonthly - a.avgMonthly;
      case 'name': return a.product.localeCompare(b.product);
      case 'sku': return a.sku.localeCompare(b.sku);
      case 'cover': return a.monthsCover - b.monthsCover;
      default: return 0;
    }
  });
};

// ── AI Integration Hook ────────────────────────────────────────────────────
// Future: These functions will call Claude API for intelligent analysis
/**
 * Placeholder for AI-powered demand analysis.
 * When implemented, this will:
 * - Detect seasonal anomalies
 * - Suggest optimal production batches
 * - Identify trending/declining products
 * - Recommend safety stock levels per SKU
 * 
 * @param {Object[]} summaries - DemandSummary data
 * @param {Object} plan - Generated plan from generatePlan()
 * @returns {Object} AI insights
 */
export const analyzeWithAI = async (summaries, plan) => {
  // TODO: Implement Claude API call
  // For now, return basic rule-based insights
  const insights = [];
  
  plan.items.forEach(item => {
    // Detect seasonal items (high variance in monthly data)
    const avg = item.avgMonthly;
    if (avg > 0) {
      const variance = item.monthly.reduce((s, m) => s + Math.pow(m - avg, 2), 0) / 12;
      const cv = Math.sqrt(variance) / avg; // coefficient of variation
      if (cv > 0.8) {
        const peakMonth = item.monthly.indexOf(Math.max(...item.monthly));
        insights.push({
          type: 'seasonal',
          sku: item.sku,
          product: item.product,
          message: `Highly seasonal — peaks in ${MONTHS[peakMonth]}. Consider pre-building inventory.`,
          severity: 'info',
        });
      }
    }
    
    // Detect items with zero stock and high demand
    if (item.onHand === 0 && item.avgMonthly > 20) {
      insights.push({
        type: 'stockout_risk',
        sku: item.sku,
        product: item.product,
        message: `Zero stock with ${item.avgMonthly}/mo demand. Immediate production needed.`,
        severity: 'critical',
      });
    }
  });
  
  return { insights, generatedAt: new Date().toISOString() };
};

export default {
  categorize,
  classifyUrgency,
  forecastSKU,
  levelSKU,
  generatePlan,
  sortPlanItems,
  analyzeWithAI,
  MONTHS,
  URGENCY_ORDER,
};
