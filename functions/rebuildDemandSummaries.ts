import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Category detection
function categorize(name) {
  const n = (name || '').toLowerCase();
  const rules = [
    [/bath bomb|(?<!\w)bomb(?!\w)/, 'Bath Bombs'],
    [/shower puck|shower steamer/, 'Bath Bombs'],
    [/glycerine|soap bar|bathing bar|pet wash bar|exfoliat.*bar/, 'Soap Bars'],
    [/shampoo bar/, 'Shampoo Bars'],
    [/body wash|one\s?wash|little ones wash/, 'Body Wash'],
    [/hand soap|liquid soap|foaming soap/, 'Liquid Soap'],
    [/conditioner/, 'Conditioner'],
    [/shampoo/, 'Shampoo'],
    [/body spritz|pillow spray|air mist|room fresh|linen water/, 'Sprays & Mists'],
    [/lip balm|kissable/, 'Lip Balm'],
    [/foot balm|foot cream/, 'Foot Care'],
    [/cuticle|nail/, 'Cuticle Cream'],
    [/roll.on|deodorant/, 'Roll-ons'],
    [/sachet|dryer bag/, 'Sachets'],
    [/serum/, 'Serums'],
    [/laundry|cleaner|dish soap|all purpose|handrub|sanitiz/, 'Cleaners & Laundry'],
    [/detangler|hair|enriching pro/, 'Hair Care'],
    [/beard oil/, 'Body Oil'],
    [/essential oil|oil blend|black spruce|grapefruit essential/, 'Essential Oils'],
    [/massage|body oil/, 'Body Oil'],
    [/salt|soak/, 'Bath Salts'],
    [/scrub/, 'Scrubs'],
    [/butter|lotion|just shea/, 'Lotions & Butters'],
    [/bubble bath/, 'Bubble Bath'],
    [/facial cleanser/, 'Creams & Balms'],
    [/aches and pains|muscle|comfort|pain relief/, 'Creams & Balms'],
    [/cream|healing|balm|gel/, 'Creams & Balms'],
    [/chocolate|sparkling|ice cream|honey|tea|coffee|popcorn|shortbread|jelly|fudge|jam|floret|lemonade/, 'Food & Beverage'],
    [/gift|basket|(?<!\w)set(?!\w)|(?<!\w)box(?!\w)|sweet touch|dreams|collection|ritual|bliss|bundle/, 'Gift Sets'],
    [/3\+1|body care set/, 'Gift Sets'],
    [/refill|pouch/, 'Refills'],
    [/candle|wax|tealight/, 'Candles'],
    [/guest size|sample/, 'Samples'],
  ];
  for (const [pattern, category] of rules) {
    if (pattern.test(n)) return category;
  }
  return 'Other';
}

function getMonthIndex(dateStr) {
  const match = dateStr?.match(/(\d{4})-(\d{2})/);
  if (!match) return -1;
  return parseInt(match[2], 10) - 1;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const skipFrom = body.skip_from || 0;
    const pageSize = 200;
    const maxPages = body.max_pages || 150; // ~30K records per invocation
    const startTime = Date.now();

    // If this is a fresh rebuild (skip_from=0), check if we should clear existing
    const isFreshStart = skipFrom === 0 && !body.append_mode;

    // Aggregation map — if continuing from previous chunk, load temp file
    let syncData = {};
    
    if (body.append_mode && body.existing_aggregation) {
      syncData = body.existing_aggregation;
    }

    // Paginate through ShopifySaleRecord
    let totalLoaded = 0;
    let page = 0;
    let hasMore = true;
    
    while (page < maxPages && hasMore) {
      const skip = skipFrom + (page * pageSize);
      const batch = await base44.asServiceRole.entities.ShopifySaleRecord.list(
        'created_date', pageSize, skip
      );
      
      if (!batch || batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const record of batch) {
        const sku = record.sku?.trim();
        if (!sku) continue;
        const qty = record.quantity || 0;
        if (qty <= 0) continue;
        const dateStr = record.order_date || '';
        const monthIdx = getMonthIndex(dateStr);
        if (monthIdx < 0) continue;

        const channel = record.channel || (record.location_id ? 'pos' : 'online');
        const location = record.location_name || (channel === 'online' ? 'Online' : 'Unknown');

        if (!syncData[sku]) {
          syncData[sku] = {
            sku,
            product: record.product_name || sku,
            monthly: [0,0,0,0,0,0,0,0,0,0,0,0],
            byChannel: { online: 0, pos: 0 },
            byLocation: {},
            totalQty: 0,
            minDate: dateStr,
            maxDate: dateStr,
          };
        }

        const s = syncData[sku];
        s.monthly[monthIdx] += qty;
        s.totalQty += qty;
        s.byChannel[channel === 'pos' ? 'pos' : 'online'] += qty;
        s.byLocation[location] = (s.byLocation[location] || 0) + qty;
        if (dateStr < s.minDate) s.minDate = dateStr;
        if (dateStr > s.maxDate) s.maxDate = dateStr;
      }

      totalLoaded += batch.length;
      
      if (batch.length < pageSize) {
        hasMore = false;
      }
      page++;
    }

    const nextSkip = skipFrom + totalLoaded;
    console.log(`Loaded ${totalLoaded} records (skip_from=${skipFrom}, total so far in aggregation: ${Object.keys(syncData).length} SKUs)`);

    // If there's more data to process, return partial result for chaining
    if (hasMore) {
      return Response.json({
        success: true,
        partial: true,
        message: `Processed ${totalLoaded} records (from offset ${skipFrom}). More data remains.`,
        next_skip_from: nextSkip,
        unique_skus_so_far: Object.keys(syncData).length,
        records_loaded: totalLoaded,
        aggregation: syncData,
      });
    }

    // All data loaded — now write DemandSummary records
    console.log(`All data loaded. ${Object.keys(syncData).length} unique SKUs. Writing summaries...`);

    // Delete existing summaries
    if (isFreshStart || !body.append_mode) {
      const existing = await base44.asServiceRole.entities.DemandSummary.list('-created_date', 200, 0);
      let allExisting = [...existing];
      let offset = 200;
      while (existing.length === 200) {
        const more = await base44.asServiceRole.entities.DemandSummary.list('-created_date', 200, offset);
        allExisting = allExisting.concat(more);
        if (more.length < 200) break;
        offset += 200;
      }
      
      console.log(`Deleting ${allExisting.length} existing DemandSummary records...`);
      for (let i = 0; i < allExisting.length; i += 10) {
        const batch = allExisting.slice(i, i + 10);
        await Promise.all(batch.map(r => base44.asServiceRole.entities.DemandSummary.delete(r.id)));
      }
    }

    // Build final summaries
    const now = new Date().toISOString();
    const allFinal = Object.values(syncData).map(s => {
      const monthsSpan = Math.max(1, (() => {
        const start = new Date(s.minDate);
        const end = new Date(s.maxDate);
        return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
      })());
      
      return {
        sku: s.sku,
        product: s.product,
        category: categorize(s.product),
        monthly: JSON.stringify(s.monthly),
        byChannel: JSON.stringify(s.byChannel),
        byLocation: JSON.stringify(s.byLocation),
        totalQty: s.totalQty,
        avgMonthly: Math.round((s.totalQty / monthsSpan) * 10) / 10,
        totalRevenue: 0,
        dataMonths: monthsSpan,
        periodStart: (s.minDate || '').split('T')[0],
        periodEnd: (s.maxDate || '').split('T')[0],
        updatedAt: now,
      };
    });

    // Bulk create in batches
    let created = 0;
    for (let i = 0; i < allFinal.length; i += 20) {
      const batch = allFinal.slice(i, i + 20);
      await base44.asServiceRole.entities.DemandSummary.bulkCreate(batch);
      created += batch.length;
    }

    const elapsed = Date.now() - startTime;

    // Log sync
    await base44.asServiceRole.entities.SyncLog.create({
      sync_type: 'demand_summaries',
      status: 'success',
      records_processed: nextSkip,
      records_created: created,
      records_updated: created,
      duration_seconds: Math.round(elapsed / 1000),
      triggered_by: user.email,
      notes: `Full rebuild: ${created} summaries from ${nextSkip} sale records, ${Object.keys(syncData).length} unique SKUs`,
    });

    return Response.json({
      success: true,
      partial: false,
      message: `Rebuild complete: ${created} summaries from ${nextSkip} sale records`,
      sale_records_processed: nextSkip,
      unique_skus: Object.keys(syncData).length,
      summaries_created: created,
      elapsed_ms: elapsed,
    });

  } catch (error) {
    console.error('rebuildDemandSummaries error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});