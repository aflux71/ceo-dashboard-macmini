import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ── Category Detection (must match demandEngine.js) ────────────────────────
function categorize(name: string): string {
  const n = (name || '').toLowerCase();
  const rules: [RegExp, string][] = [
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

// ── Parse date string to month index (0-11) ────────────────────────────────
function getMonthIndex(dateStr: string): number {
  // Handle formats: "2025-03-15", "2025-03-15T00:00:00Z", etc.
  const match = dateStr?.match(/(\d{4})-(\d{2})/);
  if (!match) return -1;
  return parseInt(match[2], 10) - 1; // 0-indexed
}

function getYear(dateStr: string): number {
  const match = dateStr?.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const startTime = Date.now();

    // ── Step 1: Load existing DemandSummary records ──────────────────────
    const existingSummaries = await base44.asServiceRole.entities.DemandSummary.list();
    const summaryMap: Record<string, any> = {};
    const summaryIdMap: Record<string, string> = {}; // sku → record id for updates
    
    for (const s of existingSummaries) {
      summaryMap[s.sku] = {
        sku: s.sku,
        product: s.product,
        category: s.category,
        monthly: JSON.parse(s.monthly || '[0,0,0,0,0,0,0,0,0,0,0,0]'),
        byChannel: JSON.parse(s.byChannel || '{"online":0,"pos":0}'),
        byLocation: JSON.parse(s.byLocation || '{}'),
        totalQty: s.totalQty || 0,
        totalRevenue: s.totalRevenue || 0,
        dataMonths: s.dataMonths || 12,
        periodStart: s.periodStart || '2025-01-01',
        periodEnd: s.periodEnd || '2025-12-31',
      };
      summaryIdMap[s.sku] = s.id;
    }

    console.log(`Loaded ${existingSummaries.length} existing DemandSummary records`);

    // ── Step 2: Load ALL ShopifySaleRecord records ───────────────────────
    // Base44 list() may have pagination limits, so we fetch all
    const saleRecords = await base44.asServiceRole.entities.ShopifySaleRecord.list();
    console.log(`Loaded ${saleRecords.length} ShopifySaleRecord records`);

    if (saleRecords.length === 0) {
      return Response.json({
        message: 'No ShopifySaleRecord records found. Summaries unchanged.',
        existing_summaries: existingSummaries.length,
        elapsed_ms: Date.now() - startTime,
      });
    }

    // ── Step 3: Aggregate ShopifySaleRecord by SKU ───────────────────────
    // Build a separate sync layer so we can merge cleanly with baseline
    const syncData: Record<string, {
      sku: string;
      product: string;
      monthly: number[];
      byChannel: { online: number; pos: number };
      byLocation: Record<string, number>;
      totalQty: number;
      minDate: string;
      maxDate: string;
    }> = {};

    for (const record of saleRecords) {
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
          monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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

    console.log(`Aggregated ${Object.keys(syncData).length} SKUs from ShopifySaleRecord`);

    // ── Step 4: Merge sync data into summaries ───────────────────────────
    // Strategy: For SKUs that exist in baseline (summaryMap), ADD sync data
    // For new SKUs only in sync, create fresh summary
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const [sku, sync] of Object.entries(syncData)) {
      const existing = summaryMap[sku];

      if (existing) {
        // Merge: baseline monthly stays, sync data adds on top
        // But we need to avoid double-counting if sync covers same period as baseline
        // Since baseline is 2025 and sync should be 2026+, they shouldn't overlap
        // If they DO overlap (backfill ran for 2025 dates), sync overwrites for those months
        
        const syncYear = getYear(sync.minDate);
        const baselineEndYear = getYear(existing.periodEnd);
        
        if (syncYear > baselineEndYear) {
          // Clean merge — sync is newer period, just add to totals
          // Monthly array: we ADD sync months (they're different calendar years but same month indices)
          // For forecasting purposes, we want the LATEST year's data to dominate
          // So we REPLACE the monthly values with sync data where sync has data
          const mergedMonthly = [...existing.monthly];
          for (let i = 0; i < 12; i++) {
            if (sync.monthly[i] > 0) {
              // Use the average of both years for better forecasting
              if (mergedMonthly[i] > 0) {
                mergedMonthly[i] = Math.round((mergedMonthly[i] + sync.monthly[i]) / 2);
              } else {
                mergedMonthly[i] = sync.monthly[i];
              }
            }
          }

          const mergedChannel = {
            online: existing.byChannel.online + sync.byChannel.online,
            pos: existing.byChannel.pos + sync.byChannel.pos,
          };

          const mergedLocation = { ...existing.byLocation };
          for (const [loc, qty] of Object.entries(sync.byLocation)) {
            mergedLocation[loc] = (mergedLocation[loc] || 0) + qty;
          }

          const totalQty = existing.totalQty + sync.totalQty;
          const periodEnd = sync.maxDate > existing.periodEnd ? sync.maxDate : existing.periodEnd;
          
          // Calculate months span for avgMonthly
          const startDate = new Date(existing.periodStart);
          const endDate = new Date(periodEnd);
          const monthsSpan = Math.max(1, 
            (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
            (endDate.getMonth() - startDate.getMonth()) + 1
          );

          const updateData = {
            product: sync.product || existing.product,
            category: categorize(sync.product || existing.product),
            monthly: JSON.stringify(mergedMonthly),
            byChannel: JSON.stringify(mergedChannel),
            byLocation: JSON.stringify(mergedLocation),
            totalQty,
            avgMonthly: Math.round((totalQty / monthsSpan) * 10) / 10,
            totalRevenue: existing.totalRevenue, // Sync doesn't have revenue
            dataMonths: monthsSpan,
            periodEnd,
            updatedAt: now,
          };

          await base44.asServiceRole.entities.DemandSummary.update(
            summaryIdMap[sku],
            updateData
          );
          updated++;
        } else {
          // Sync overlaps with baseline period — update monthly totals
          // This handles the case where backfill ran for 2025 dates
          // In this case, sync data should be additive (more records found)
          const mergedMonthly = [...existing.monthly];
          for (let i = 0; i < 12; i++) {
            if (sync.monthly[i] > 0) {
              mergedMonthly[i] = Math.max(mergedMonthly[i], sync.monthly[i]);
            }
          }

          const totalQty = mergedMonthly.reduce((s, v) => s + v, 0);
          const dataMonths = existing.dataMonths || 12;

          await base44.asServiceRole.entities.DemandSummary.update(
            summaryIdMap[sku],
            {
              monthly: JSON.stringify(mergedMonthly),
              totalQty,
              avgMonthly: Math.round((totalQty / dataMonths) * 10) / 10,
              category: categorize(existing.product),
              updatedAt: now,
            }
          );
          updated++;
        }
      } else {
        // New SKU not in baseline — create fresh summary
        const monthsSpan = Math.max(1, (() => {
          const start = new Date(sync.minDate);
          const end = new Date(sync.maxDate);
          return (end.getFullYear() - start.getFullYear()) * 12 + 
                 (end.getMonth() - start.getMonth()) + 1;
        })());

        await base44.asServiceRole.entities.DemandSummary.create({
          sku,
          product: sync.product,
          category: categorize(sync.product),
          monthly: JSON.stringify(sync.monthly),
          byChannel: JSON.stringify(sync.byChannel),
          byLocation: JSON.stringify(sync.byLocation),
          totalQty: sync.totalQty,
          avgMonthly: Math.round((sync.totalQty / monthsSpan) * 10) / 10,
          totalRevenue: 0,
          dataMonths: monthsSpan,
          periodStart: sync.minDate.split('T')[0],
          periodEnd: sync.maxDate.split('T')[0],
          updatedAt: now,
        });
        created++;
      }
    }

    const elapsed = Date.now() - startTime;

    return Response.json({
      success: true,
      message: `Rebuild complete: ${updated} updated, ${created} created from ${saleRecords.length} sale records`,
      existing_summaries: existingSummaries.length,
      sale_records_processed: saleRecords.length,
      unique_skus_in_sync: Object.keys(syncData).length,
      summaries_updated: updated,
      summaries_created: created,
      elapsed_ms: elapsed,
    });

  } catch (error) {
    console.error('rebuildDemandSummaries error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
