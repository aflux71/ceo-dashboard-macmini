/**
 * SKU Alias Resolver
 * Resolves merged SKUs to their canonical counterparts
 * Consolidates demand data when aliases are detected
 */

/**
 * Resolves a SKU to its canonical SKU by checking the SKUAlias entity
 * @param {string} sku - The SKU to resolve
 * @param {Map} aliasMap - Map of sku -> canonical_sku from SKUAlias records
 * @returns {string} The canonical SKU
 */
export const resolveCanonicalSKU = (sku, aliasMap) => {
  return aliasMap.get(sku) || sku;
};

/**
 * Builds a map of alias SKUs to canonical SKUs from SKUAlias records
 * @param {Object[]} aliases - Array of SKUAlias records
 * @returns {Map} Map of alias_sku -> canonical_sku
 */
export const buildAliasMap = (aliases = []) => {
  const map = new Map();
  aliases.forEach(alias => {
    // Only approved aliases should hide/consolidate SKUs
    if (alias.status !== "approved") return;
    // SKUDeduplication page stores the canonical SKU in `primary_sku`
    const canonical = alias.primary_sku || alias.canonical_sku;
    if (alias.alias_sku && canonical) {
      map.set(alias.alias_sku, canonical);
    }
  });
  return map;
};

/**
 * Consolidates demand summaries by merging alias SKUs into canonical SKUs
 * Keeps the newest timestamp and sums all demand data
 * @param {Object[]} summaries - Array of DemandSummary records
 * @param {Map} aliasMap - Map of alias_sku -> canonical_sku
 * @returns {Object[]} Consolidated summaries
 */
export const consolidateDemandBySKU = (summaries, aliasMap) => {
  if (aliasMap.size === 0) return summaries;

  const consolidated = {};

  summaries.forEach(summary => {
    const canonicalSKU = resolveCanonicalSKU(summary.sku, aliasMap);
    
    if (!consolidated[canonicalSKU]) {
      // Initialize with first occurrence of canonical SKU
      consolidated[canonicalSKU] = {
        sku: canonicalSKU,
        product: summary.product,
        category: summary.category,
        monthly: Array.isArray(summary.monthly) ? [...summary.monthly] : JSON.parse(summary.monthly || '[]'),
        byChannel: summary.byChannel ? (typeof summary.byChannel === 'string' ? JSON.parse(summary.byChannel) : summary.byChannel) : { online: 0, pos: 0 },
        byLocation: summary.byLocation ? (typeof summary.byLocation === 'string' ? JSON.parse(summary.byLocation) : summary.byLocation) : {},
        totalQty: summary.totalQty || 0,
        dataMonths: summary.dataMonths || 0,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        totalRevenue: summary.totalRevenue || 0,
        updatedAt: summary.updatedAt || summary.updated_date || '',
        id: summary.id,
        created_date: summary.created_date,
        updated_date: summary.updated_date,
      };
    } else {
      // Merge into existing canonical entry
      const existing = consolidated[canonicalSKU];
      
      // Use newer timestamp
      if (summary.updated_date && (!existing.updated_date || summary.updated_date > existing.updated_date)) {
        existing.updated_date = summary.updated_date;
        existing.updatedAt = summary.updatedAt || summary.updated_date;
      }
      if (summary.updated_date && (!existing.periodEnd || summary.periodEnd > existing.periodEnd)) {
        existing.periodEnd = summary.periodEnd;
      }
      if (summary.periodStart && (!existing.periodStart || summary.periodStart < existing.periodStart)) {
        existing.periodStart = summary.periodStart;
      }

      // Sum monthly demand
      const incomingMonthly = Array.isArray(summary.monthly) ? summary.monthly : JSON.parse(summary.monthly || '[]');
      incomingMonthly.forEach((val, idx) => {
        existing.monthly[idx] = (existing.monthly[idx] || 0) + val;
      });

      // Sum by channel
      const incomingByChannel = summary.byChannel ? (typeof summary.byChannel === 'string' ? JSON.parse(summary.byChannel) : summary.byChannel) : { online: 0, pos: 0 };
      existing.byChannel.online = (existing.byChannel.online || 0) + (incomingByChannel.online || 0);
      existing.byChannel.pos = (existing.byChannel.pos || 0) + (incomingByChannel.pos || 0);

      // Sum by location
      const incomingByLocation = summary.byLocation ? (typeof summary.byLocation === 'string' ? JSON.parse(summary.byLocation) : summary.byLocation) : {};
      Object.entries(incomingByLocation).forEach(([loc, qty]) => {
        existing.byLocation[loc] = (existing.byLocation[loc] || 0) + qty;
      });

      // Sum totals
      existing.totalQty += summary.totalQty || 0;
      existing.totalRevenue += summary.totalRevenue || 0;
      existing.dataMonths = Math.max(existing.dataMonths, summary.dataMonths || 0);
    }
  });

  // Recalculate avgMonthly for consolidated entries
  return Object.values(consolidated).map(summary => ({
    ...summary,
    avgMonthly: summary.dataMonths > 0 ? Math.round((summary.totalQty / summary.dataMonths) * 10) / 10 : 0,
  }));
};

export default {
  resolveCanonicalSKU,
  buildAliasMap,
  consolidateDemandBySKU,
};