import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Cross-references DemandSummary records against Inventory to find:
 *  - SKUs that have demand/sales but NO inventory record
 *  - Useful to spot products that appear in Shopify orders but aren't tracked locally
 *
 * Fast version: uses existing DemandSummary (no full ShopifySaleRecord scan).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Load all inventory (finished + private brand)
    const allInventory = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Inventory.filter(
        { type: { $in: ['finished_product', 'private_brand'] } },
        '-created_date', 100, skip
      );
      if (!batch || batch.length === 0) break;
      allInventory.push(...batch);
      if (batch.length < 100) break;
      skip += 100;
    }
    const invSkus = new Set();
    const invSupplierSkus = new Set();
    for (const i of allInventory) {
      if (i.sku) invSkus.add(i.sku.trim().toLowerCase());
      if (i.supplier_sku) invSupplierSkus.add(i.supplier_sku.trim().toLowerCase());
    }

    // 2. Load SKU aliases
    const aliases = await base44.asServiceRole.entities.SKUAlias.filter({ status: 'approved' });
    const aliasMap = new Map();
    for (const a of (aliases || [])) {
      if (a.alias_sku) aliasMap.set(a.alias_sku.trim().toLowerCase(), (a.primary_sku || '').toLowerCase());
    }

    // 3. Load master exclusions (to skip known-hidden SKUs)
    const exclusions = await base44.asServiceRole.entities.MasterExclusion.list();
    const excludedSkus = new Set((exclusions || []).map(e => (e.sku || '').trim().toLowerCase()));

    // 4. Load all DemandSummary
    const summaries = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.DemandSummary.list('-totalQty', 100, skip);
      if (!batch || batch.length === 0) break;
      summaries.push(...batch);
      if (batch.length < 100) break;
      skip += 100;
    }

    // 5. Find missing
    const missing = [];
    for (const s of summaries) {
      const rawSku = (s.sku || '').trim();
      if (!rawSku) continue;
      const key = rawSku.toLowerCase();
      const canonical = aliasMap.get(key) || key;
      if (excludedSkus.has(canonical) || excludedSkus.has(key)) continue;
      if (invSkus.has(canonical) || invSkus.has(key)) continue;
      if (invSupplierSkus.has(canonical) || invSupplierSkus.has(key)) continue;

      missing.push({
        sku: rawSku,
        product: s.product,
        category: s.category,
        totalQty: s.totalQty || 0,
        avgMonthly: s.avgMonthly || 0,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
      });
    }
    missing.sort((a, b) => (b.totalQty || 0) - (a.totalQty || 0));

    return Response.json({
      total_inventory: allInventory.length,
      total_demand_summaries: summaries.length,
      missing_count: missing.length,
      missing,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});