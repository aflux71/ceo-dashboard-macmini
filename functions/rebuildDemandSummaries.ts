import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
    const phase = body.phase || 'aggregate';

    // ── Phase: aggregate ──────────────────────────────────────────────────
    // Load one month of ShopifySaleRecord, deduplicate, aggregate by SKU
    if (phase === 'aggregate') {
      const year = body.year || 2025;
      const month = body.month;
      if (!month) return Response.json({ error: 'month required (1-12)' }, { status: 400 });

      const monthStr = String(month).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      console.log(`Aggregating ${year}-${monthStr}`);

      // Page through all records for this month
      const allRecords = [];
      let skip = 0;
      const pageSize = 200;
      while (true) {
        const batch = await base44.asServiceRole.entities.ShopifySaleRecord.filter(
          { order_date: { $gte: startDate, $lt: endDate } },
          '-order_date', pageSize, skip
        );
        if (!batch || batch.length === 0) break;
        allRecords.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
      }

      // ── Deduplication ──────────────────────────────────────────────────
      // 1. Remove exact duplicate line items (same order_id + sku + location)
      //    This catches CSV records imported twice. Different SKUs in the same order are NOT duplicates.
      const seenLineItems = new Set();
      const deduped = [];
      for (const r of allRecords) {
        const oid = r.order_id || r.id;
        const sku = r.sku || '';
        const loc = r.location_name || '';
        const key = `${oid}|${sku}|${loc}`;
        if (seenLineItems.has(key)) continue;
        seenLineItems.add(key);
        deduped.push(r);
      }
      const dupesRemoved = allRecords.length - deduped.length;

      // 2. For dates where both CSV and API records exist for same SKU+location,
      //    prefer API records (they're transaction-level, CSV is daily aggregate)
      const apiDateKeys = new Set();
      for (const r of deduped) {
        if (r.order_id && !r.order_id.startsWith('CSV-')) {
          // API record — mark this sku+date(day)+location combo
          const dateDay = (r.order_date || '').substring(0, 10);
          const loc = r.location_name || 'Unknown';
          apiDateKeys.add(`${r.sku}|${dateDay}|${loc}`);
        }
      }
      // Filter out CSV records that overlap with API records
      const final = [];
      let csvOverlapRemoved = 0;
      for (const r of deduped) {
        if (r.order_id && r.order_id.startsWith('CSV-')) {
          const dateDay = (r.order_date || '').substring(0, 10);
          const loc = r.location_name || 'Unknown';
          const key = `${r.sku}|${dateDay}|${loc}`;
          if (apiDateKeys.has(key)) {
            csvOverlapRemoved++;
            continue; // Skip CSV record, API records cover this
          }
        }
        final.push(r);
      }

      // ── Aggregate by SKU ───────────────────────────────────────────────
      const skuData = {};
      for (const r of final) {
        const sku = r.sku?.trim();
        if (!sku) continue;
        const qty = r.quantity || 0;
        if (qty <= 0) continue;

        const channel = r.channel || (r.location_id ? 'pos' : 'online');
        const location = r.location_name || (channel === 'online' ? 'Online' : 'Unknown');

        if (!skuData[sku]) {
          skuData[sku] = {
            sku,
            product: r.product_name || sku,
            qty: 0,
            online: 0,
            pos: 0,
            locations: {},
          };
        }
        const s = skuData[sku];
        s.qty += qty;
        if (channel === 'pos') s.pos += qty; else s.online += qty;
        s.locations[location] = (s.locations[location] || 0) + qty;
      }

      console.log(`${year}-${monthStr}: ${allRecords.length} raw -> ${dupesRemoved} exact dupes removed -> ${csvOverlapRemoved} CSV overlaps removed -> ${final.length} unique records -> ${Object.keys(skuData).length} SKUs`);

      return Response.json({
        success: true,
        year, month,
        raw_records: allRecords.length,
        dupes_removed: dupesRemoved,
        csv_overlap_removed: csvOverlapRemoved,
        unique_records: final.length,
        unique_skus: Object.keys(skuData).length,
        aggregation: skuData,
      });
    }

    // ── Phase: write ──────────────────────────────────────────────────────
    // Receives merged aggregation from frontend, clears DemandSummary, writes new
    if (phase === 'write') {
      const aggregation = body.aggregation;
      if (!aggregation || typeof aggregation !== 'object') {
        return Response.json({ error: 'aggregation object required' }, { status: 400 });
      }

      // Delete all existing DemandSummary records with rate limit handling
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let deleted = 0;
      while (true) {
        let batch;
        try {
          batch = await base44.asServiceRole.entities.DemandSummary.list('-created_date', 20, 0);
        } catch (e) {
          console.log('Rate limited on list, waiting 3s...');
          await sleep(3000);
          continue;
        }
        if (!batch || batch.length === 0) break;
        for (const r of batch) {
          try {
            await base44.asServiceRole.entities.DemandSummary.delete(r.id);
          } catch (e) {
            console.log('Rate limited on delete, waiting 2s...');
            await sleep(2000);
            await base44.asServiceRole.entities.DemandSummary.delete(r.id);
          }
        }
        deleted += batch.length;
        console.log(`Deleted ${deleted} existing summaries...`);
        await sleep(1000);
      }

      // Build final records
      const now = new Date().toISOString();
      const records = Object.values(aggregation).map(s => {
        const dataMonths = Math.max(1, s.dataMonths || 1);
        return {
          sku: s.sku,
          product: s.product,
          category: categorize(s.product),
          monthly: typeof s.monthly === 'string' ? s.monthly : JSON.stringify(s.monthly),
          byChannel: typeof s.byChannel === 'string' ? s.byChannel : JSON.stringify(s.byChannel),
          byLocation: typeof s.byLocation === 'string' ? s.byLocation : JSON.stringify(s.byLocation),
          totalQty: s.totalQty,
          avgMonthly: Math.round((s.totalQty / dataMonths) * 10) / 10,
          totalRevenue: 0,
          dataMonths,
          periodStart: s.periodStart || '',
          periodEnd: s.periodEnd || '',
          updatedAt: now,
        };
      });

      // Bulk create in batches of 10 with retry
      let created = 0;
      for (let i = 0; i < records.length; i += 10) {
        const batch = records.slice(i, i + 10);
        try {
          await base44.asServiceRole.entities.DemandSummary.bulkCreate(batch);
        } catch (e) {
          console.log('Rate limited on create, waiting 3s...');
          await sleep(3000);
          await base44.asServiceRole.entities.DemandSummary.bulkCreate(batch);
        }
        created += batch.length;
        console.log(`Created ${created}/${records.length}`);
        await sleep(500);
      }

      await base44.asServiceRole.entities.SyncLog.create({
        sync_type: 'demand_summaries',
        status: 'success',
        records_created: created,
        records_updated: deleted,
        triggered_by: user.email,
        notes: `Full rebuild: ${deleted} old deleted, ${created} new created`,
      });

      return Response.json({ success: true, deleted, created });
    }

    return Response.json({ error: 'Invalid phase' }, { status: 400 });
  } catch (error) {
    console.error('rebuildDemandSummaries error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});