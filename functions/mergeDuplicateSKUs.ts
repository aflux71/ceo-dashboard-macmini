import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// v3 - merge duplicate short-SKU demand summaries into barcode-based records
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Load all finished_product inventory to build supplier_sku -> barcode_sku mapping
    const allInventory = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Inventory.filter(
        { type: "finished_product" }, '-created_date', 100, skip
      );
      allInventory.push(...batch);
      if (batch.length < 100) break;
      skip += 100;
      await sleep(500);
    }

    const shortToLong = {};
    for (const inv of allInventory) {
      if (inv.supplier_sku && inv.sku && inv.supplier_sku !== inv.sku) {
        shortToLong[inv.supplier_sku] = inv.sku;
      }
    }
    console.log(`Built ${Object.keys(shortToLong).length} supplier_sku -> barcode mappings`);

    // 2. Load all DemandSummary records
    const allSummaries = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.DemandSummary.list('-created_date', 100, skip);
      allSummaries.push(...batch);
      if (batch.length < 100) break;
      skip += 100;
      await sleep(500);
    }
    console.log(`Loaded ${allSummaries.length} DemandSummary records`);

    // 3. Group summaries by SKU
    const bySku = {};
    for (const s of allSummaries) {
      bySku[s.sku] = s;
    }

    // 4. Find duplicates
    const merges = [];
    const toDelete = [];
    const mappingsToCreate = [];

    for (const [shortSku, longSku] of Object.entries(shortToLong)) {
      const shortRec = bySku[shortSku];
      const longRec = bySku[longSku];

      if (shortRec && longRec) {
        // Both exist — merge short sales data into long record
        const parse = (v) => typeof v === 'string' ? JSON.parse(v) : (v || {});
        const sM = parse(shortRec.monthly) || [];
        const lM = parse(longRec.monthly) || [];
        const sC = parse(shortRec.byChannel);
        const lC = parse(longRec.byChannel);
        const sL = parse(shortRec.byLocation);
        const lL = parse(longRec.byLocation);

        const mergedMonthly = lM.map((v, i) => (v || 0) + (sM[i] || 0));
        const mergedByChannel = { ...lC };
        for (const [k, v] of Object.entries(sC)) mergedByChannel[k] = (mergedByChannel[k] || 0) + v;
        const mergedByLocation = { ...lL };
        for (const [k, v] of Object.entries(sL)) mergedByLocation[k] = (mergedByLocation[k] || 0) + v;

        const totalQty = (longRec.totalQty || 0) + (shortRec.totalQty || 0);
        const dataMonths = Math.max(longRec.dataMonths || 1, shortRec.dataMonths || 1);

        merges.push({
          id: longRec.id,
          shortSku,
          longSku,
          product: longRec.product,
          update: {
            monthly: JSON.stringify(mergedMonthly),
            byChannel: JSON.stringify(mergedByChannel),
            byLocation: JSON.stringify(mergedByLocation),
            totalQty,
            avgMonthly: Math.round((totalQty / dataMonths) * 10) / 10,
            dataMonths,
            periodStart: shortRec.periodStart < (longRec.periodStart || '9999') ? shortRec.periodStart : longRec.periodStart,
            periodEnd: shortRec.periodEnd > (longRec.periodEnd || '') ? shortRec.periodEnd : longRec.periodEnd,
            totalRevenue: (longRec.totalRevenue || 0) + (shortRec.totalRevenue || 0),
            updatedAt: new Date().toISOString(),
          },
        });
        toDelete.push({ id: shortRec.id, sku: shortSku });
        mappingsToCreate.push({ old_sku: shortSku, new_sku: longSku, product: longRec.product });
      } else if (shortRec && !longRec) {
        // Only short exists — just rename SKU
        merges.push({
          id: shortRec.id,
          shortSku,
          longSku,
          product: shortRec.product,
          update: { sku: longSku },
        });
        mappingsToCreate.push({ old_sku: shortSku, new_sku: longSku, product: shortRec.product });
      }
    }

    console.log(`Found ${merges.length} merges, ${toDelete.length} deletes`);

    // 5. Execute updates (one at a time with delays)
    let updated = 0;
    for (const m of merges) {
      await base44.asServiceRole.entities.DemandSummary.update(m.id, m.update);
      updated++;
      await sleep(400);
      if (updated % 10 === 0) {
        console.log(`Updated ${updated}/${merges.length}`);
        await sleep(3000);
      }
    }

    // 6. Delete old short-SKU records
    let deleted = 0;
    for (const d of toDelete) {
      await base44.asServiceRole.entities.DemandSummary.delete(d.id);
      deleted++;
      await sleep(400);
      if (deleted % 10 === 0) {
        console.log(`Deleted ${deleted}/${toDelete.length}`);
        await sleep(3000);
      }
    }

    // 7. Auto-create approved SKU mappings
    let mappings = 0;
    for (const m of mappingsToCreate) {
      try {
        const existing = await base44.asServiceRole.entities.SKUMapping.filter({
          old_sku: m.old_sku, new_sku: m.new_sku
        });
        if (existing.length === 0) {
          await base44.asServiceRole.entities.SKUMapping.create({
            old_sku: m.old_sku,
            new_sku: m.new_sku,
            product_name: m.product,
            status: "approved",
            detected_by: "auto",
            approved_by: user.email,
            approved_date: new Date().toISOString(),
            notes: "Auto-detected from supplier_sku during duplicate merge",
          });
          mappings++;
        }
        await sleep(400);
      } catch (e) {
        console.log(`Mapping fail: ${e.message}`);
      }
    }

    // 8. Log sync
    try {
      await base44.asServiceRole.entities.SyncLog.create({
        sync_type: "demand_summaries",
        status: "success",
        records_processed: merges.length,
        records_updated: updated,
        notes: `Merged ${updated} duplicate SKUs, deleted ${deleted} short-SKU records, created ${mappings} SKU mappings`,
        triggered_by: user.email,
      });
    } catch (e) { /* ok */ }

    return Response.json({
      success: true,
      merges_performed: updated,
      records_deleted: deleted,
      mappings_created: mappings,
      details: merges.map(m => ({
        short_sku: m.shortSku,
        barcode_sku: m.longSku,
        product: m.product,
        action: toDelete.find(d => d.sku === m.shortSku) ? 'merged_and_deleted' : 'renamed',
      })),
    });
  } catch (error) {
    console.error("Merge error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});