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

// Phase 1: Aggregate one month of data and return aggregation
// Phase 2: Write aggregated summaries to DemandSummary entity
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const phase = body.phase || 'aggregate';
    
    if (phase === 'aggregate') {
      // Aggregate records for a specific year-month
      const year = body.year || 2025;
      const month = body.month; // 1-12
      if (!month) {
        return Response.json({ error: 'month is required (1-12)' }, { status: 400 });
      }
      
      const monthStr = String(month).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
      
      console.log(`Aggregating ${year}-${monthStr}: filtering order_date >= ${startDate} and < ${endDate}`);
      
      // Load all records for this month via pagination with retry
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const retryFetch = async (fn, retries = 5) => {
        for (let i = 0; i < retries; i++) {
          try { return await fn(); } catch (e) {
            if (e.status === 429 && i < retries - 1) {
              const wait = Math.min(2000 * Math.pow(2, i), 30000);
              console.log(`Rate limited, waiting ${wait}ms (retry ${i+1}/${retries})`);
              await sleep(wait);
            } else throw e;
          }
        }
      };
      
      const syncData = {};
      let totalLoaded = 0;
      let skip = 0;
      const pageSize = 200;
      
      while (true) {
        const batch = await retryFetch(() => 
          base44.asServiceRole.entities.ShopifySaleRecord.filter(
            { order_date: { $gte: startDate, $lt: endDate } },
            '-order_date', pageSize, skip
          )
        );
        
        if (!batch || batch.length === 0) break;
        
        for (const record of batch) {
          const sku = record.sku?.trim();
          if (!sku) continue;
          const qty = record.quantity || 0;
          if (qty <= 0) continue;
          
          const channel = record.channel || (record.location_id ? 'pos' : 'online');
          const location = record.location_name || (channel === 'online' ? 'Online' : 'Unknown');
          
          if (!syncData[sku]) {
            syncData[sku] = {
              sku,
              product: record.product_name || sku,
              qty: 0,
              online: 0,
              pos: 0,
              locations: {},
              minDate: record.order_date,
              maxDate: record.order_date,
            };
          }
          
          const s = syncData[sku];
          s.qty += qty;
          if (channel === 'pos') s.pos += qty; else s.online += qty;
          s.locations[location] = (s.locations[location] || 0) + qty;
          if (record.order_date < s.minDate) s.minDate = record.order_date;
          if (record.order_date > s.maxDate) s.maxDate = record.order_date;
        }
        
        totalLoaded += batch.length;
        if (batch.length < pageSize) break;
        skip += pageSize;
      }
      
      console.log(`${year}-${monthStr}: ${totalLoaded} records, ${Object.keys(syncData).length} unique SKUs`);
      
      return Response.json({
        success: true,
        year,
        month,
        records_loaded: totalLoaded,
        unique_skus: Object.keys(syncData).length,
        aggregation: syncData,
      });
    }
    
    if (phase === 'write') {
      // Receive merged aggregation from frontend and write to DemandSummary
      const aggregation = body.aggregation;
      if (!aggregation || typeof aggregation !== 'object') {
        return Response.json({ error: 'aggregation object is required' }, { status: 400 });
      }
      
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const retryOp = async (fn, retries = 5) => {
        for (let i = 0; i < retries; i++) {
          try { return await fn(); } catch (e) {
            if (e.status === 429 && i < retries - 1) {
              await sleep(Math.min(2000 * Math.pow(2, i), 30000));
            } else throw e;
          }
        }
      };
      
      const clearExisting = body.clear_existing !== false;
      
      if (clearExisting) {
        // Delete all existing DemandSummary records
        let deleted = 0;
        while (true) {
          const batch = await retryOp(() => base44.asServiceRole.entities.DemandSummary.list('-created_date', 200, 0));
          if (!batch || batch.length === 0) break;
          for (const r of batch) {
            await retryOp(() => base44.asServiceRole.entities.DemandSummary.delete(r.id));
          }
          deleted += batch.length;
          console.log(`Deleted ${deleted} existing summaries...`);
          await sleep(500);
        }
      }
      
      // Build final records from aggregation
      const now = new Date().toISOString();
      const allFinal = Object.values(aggregation).map(s => {
        const monthsSpan = Math.max(1, s.dataMonths || 1);
        return {
          sku: s.sku,
          product: s.product,
          category: categorize(s.product),
          monthly: typeof s.monthly === 'string' ? s.monthly : JSON.stringify(s.monthly),
          byChannel: typeof s.byChannel === 'string' ? s.byChannel : JSON.stringify(s.byChannel),
          byLocation: typeof s.byLocation === 'string' ? s.byLocation : JSON.stringify(s.byLocation),
          totalQty: s.totalQty,
          avgMonthly: Math.round((s.totalQty / monthsSpan) * 10) / 10,
          totalRevenue: 0,
          dataMonths: monthsSpan,
          periodStart: s.periodStart || '',
          periodEnd: s.periodEnd || '',
          updatedAt: now,
        };
      });
      
      // Bulk create in batches of 20
      let created = 0;
      for (let i = 0; i < allFinal.length; i += 20) {
        const batch = allFinal.slice(i, i + 20);
        await retryOp(() => base44.asServiceRole.entities.DemandSummary.bulkCreate(batch));
        created += batch.length;
        console.log(`Created ${created}/${allFinal.length} summaries`);
        await sleep(200);
      }
      
      // Log sync
      await base44.asServiceRole.entities.SyncLog.create({
        sync_type: 'demand_summaries',
        status: 'success',
        records_created: created,
        triggered_by: user.email,
        notes: `Full rebuild: ${created} summaries written`,
      });
      
      return Response.json({
        success: true,
        summaries_created: created,
      });
    }
    
    return Response.json({ error: 'Invalid phase. Use "aggregate" or "write".' }, { status: 400 });
    
  } catch (error) {
    console.error('rebuildDemandSummaries error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});