import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
// v2: aggressive rate limiting
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

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
    }

    // Build mapping: supplier_sku (short) -> barcode sku (long)
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
    }
    console.log(`Loaded ${allSummaries.length} DemandSummary records`);

    // 3. Group summaries by SKU
    const bySku = {};
    for (const s of allSummaries) {
      bySku[s.sku] = s;
    }

    // 4. Find duplicates: short SKU that has a matching barcode SKU in DemandSummary
    const merges = [];
    const toDelete = [];
    const mappingsCreated = [];

    for (const [shortSku, longSku] of Object.entries(shortToLong)) {
      const shortRecord = bySku[shortSku];
      const longRecord = bySku[longSku];

      if (shortRecord && longRecord) {
        // Both exist — merge short into long
        const shortMonthly = typeof shortRecord.monthly === 'string' ? JSON.parse(shortRecord.monthly) : (shortRecord.monthly || []);
        const longMonthly = typeof longRecord.monthly === 'string' ? JSON.parse(longRecord.monthly) : (longRecord.monthly || []);
        const shortByChannel = typeof shortRecord.byChannel === 'string' ? JSON.parse(shortRecord.byChannel) : (shortRecord.byChannel || {});
        const longByChannel = typeof longRecord.byChannel === 'string' ? JSON.parse(longRecord.byChannel) : (longRecord.byChannel || {});
        const shortByLocation = typeof shortRecord.byLocation === 'string' ? JSON.parse(shortRecord.byLocation) : (shortRecord.byLocation || {});
        const longByLocation = typeof longRecord.byLocation === 'string' ? JSON.parse(longRecord.byLocation) : (longRecord.byLocation || {});

        // Merge monthly arrays (sum element-wise)
        const mergedMonthly = longMonthly.map((v, i) => (v || 0) + (shortMonthly[i] || 0));

        // Merge channels
        const mergedByChannel = { ...longByChannel };
        for (const [ch, qty] of Object.entries(shortByChannel)) {
          mergedByChannel[ch] = (mergedByChannel[ch] || 0) + qty;
        }

        // Merge locations
        const mergedByLocation = { ...longByLocation };
        for (const [loc, qty] of Object.entries(shortByLocation)) {
          mergedByLocation[loc] = (mergedByLocation[loc] || 0) + qty;
        }

        const mergedTotalQty = (longRecord.totalQty || 0) + (shortRecord.totalQty || 0);
        const mergedDataMonths = Math.max(longRecord.dataMonths || 1, shortRecord.dataMonths || 1);
        const mergedAvgMonthly = Math.round((mergedTotalQty / mergedDataMonths) * 10) / 10;

        // Use the wider date range
        const periodStart = (shortRecord.periodStart && shortRecord.periodStart < (longRecord.periodStart || '9999'))
          ? shortRecord.periodStart : longRecord.periodStart;
        const periodEnd = (shortRecord.periodEnd && shortRecord.periodEnd > (longRecord.periodEnd || '0000'))
          ? shortRecord.periodEnd : longRecord.periodEnd;

        merges.push({
          longId: longRecord.id,
          shortSku,
          longSku,
          product: longRecord.product,
          update: {
            monthly: JSON.stringify(mergedMonthly),
            byChannel: JSON.stringify(mergedByChannel),
            byLocation: JSON.stringify(mergedByLocation),
            totalQty: mergedTotalQty,
            avgMonthly: mergedAvgMonthly,
            dataMonths: mergedDataMonths,
            periodStart,
            periodEnd,
            totalRevenue: (longRecord.totalRevenue || 0) + (shortRecord.totalRevenue || 0),
            updatedAt: new Date().toISOString(),
          },
        });
        toDelete.push({ id: shortRecord.id, sku: shortSku, product: shortRecord.product });
        mappingsCreated.push({ old_sku: shortSku, new_sku: longSku, product: longRecord.product });
      } else if (shortRecord && !longRecord) {
        // Only short SKU exists — rename it to the barcode SKU
        merges.push({
          longId: shortRecord.id,
          shortSku,
          longSku,
          product: shortRecord.product,
          update: { sku: longSku },
        });
        mappingsCreated.push({ old_sku: shortSku, new_sku: longSku, product: shortRecord.product });
      }
    }

    console.log(`Found ${merges.length} merges, ${toDelete.length} records to delete`);

    // 5. Execute merges (with aggressive rate limiting)
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let mergeCount = 0;
    for (const merge of merges) {
      await base44.asServiceRole.entities.DemandSummary.update(merge.longId, merge.update);
      mergeCount++;
      await sleep(300);
      if (mergeCount % 10 === 0) {
        console.log(`Merged ${mergeCount}/${merges.length}`);
        await sleep(2000);
      }
    }

    // 6. Delete short-SKU duplicates
    let deleteCount = 0;
    for (const del of toDelete) {
      await base44.asServiceRole.entities.DemandSummary.delete(del.id);
      deleteCount++;
      await sleep(300);
      if (deleteCount % 10 === 0) {
        console.log(`Deleted ${deleteCount}/${toDelete.length}`);
        await sleep(2000);
      }
    }

    // 7. Auto-create approved SKU mappings for future syncs
    let mappingCount = 0;
    for (const m of mappingsCreated) {
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
            notes: "Auto-detected from supplier_sku match during duplicate merge",
          });
          mappingCount++;
        }
        await sleep(300);
      } catch (e) {
        console.log(`Failed to create mapping ${m.old_sku} -> ${m.new_sku}: ${e.message}`);
      }
    }

    // 8. Log
    try {
      await base44.asServiceRole.entities.SyncLog.create({
        sync_type: "demand_summaries",
        status: "success",
        records_processed: merges.length,
        records_updated: mergeCount,
        notes: `Merged ${mergeCount} duplicate SKUs, deleted ${deleteCount} short-SKU records, created ${mappingCount} SKU mappings`,
        triggered_by: user.email,
      });
    } catch (e) { /* ignore */ }

    return Response.json({
      success: true,
      merges_performed: mergeCount,
      records_deleted: deleteCount,
      mappings_created: mappingCount,
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