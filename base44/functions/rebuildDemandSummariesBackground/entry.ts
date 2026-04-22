import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

const STATUS_KEY = 'demand_rebuild_status';

async function writeStatus(base44, status) {
  try {
    const existing = await base44.asServiceRole.entities.AppSettings.filter({ key: STATUS_KEY });
    const value = JSON.stringify(status);
    if (existing.length > 0) {
      await base44.asServiceRole.entities.AppSettings.update(existing[0].id, { value });
    } else {
      await base44.asServiceRole.entities.AppSettings.create({
        key: STATUS_KEY,
        value,
        description: 'Background demand rebuild job status',
      });
    }
  } catch (e) {
    console.warn('writeStatus failed:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // ── status check ──────────────────────────────────────────────────────
    if (body.action === 'status') {
      const existing = await base44.asServiceRole.entities.AppSettings.filter({ key: STATUS_KEY });
      if (existing.length === 0) return Response.json({ status: null });
      return Response.json(JSON.parse(existing[0].value || 'null'));
    }

    // ── start rebuild ─────────────────────────────────────────────────────
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1; // current month (partial data ok)

    const months = [];
    for (let m = 1; m <= 12; m++) months.push({ year: 2025, month: m });
    if (endYear > 2025) {
      for (let m = 1; m <= endMonth; m++) months.push({ year: endYear, month: m });
    }

    // Mark as running immediately
    await writeStatus(base44, {
      state: 'running',
      phase: 'aggregating',
      current: 0,
      total: months.length,
      detail: 'Starting...',
      startedAt: new Date().toISOString(),
      startedBy: user.email,
    });

    // Return immediately so the HTTP request doesn't time out — do work in background
    const doRebuild = async () => {
      try {
        const merged = {};
        let totalRaw = 0, totalDupes = 0, totalOverlap = 0, totalUnique = 0;

        // ── Phase 1: Aggregate month by month ──
        for (let mi = 0; mi < months.length; mi++) {
          const { year, month } = months[mi];
          const monthStr = String(month).padStart(2, '0');
          await writeStatus(base44, {
            state: 'running',
            phase: 'aggregating',
            current: mi + 1,
            total: months.length,
            detail: `Aggregating ${year}-${monthStr}`,
            startedAt: new Date().toISOString(),
            startedBy: user.email,
          });

          const startDate = `${year}-${monthStr}-01`;
          const nextMonth = month === 12 ? 1 : month + 1;
          const nextYear = month === 12 ? year + 1 : year;
          const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

          // Page through records
          const allRecords = [];
          let skip = 0;
          const pageSize = 200;
          while (true) {
            let batch;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                batch = await base44.asServiceRole.entities.ShopifySaleRecord.filter(
                  { order_date: { $gte: startDate, $lt: endDate } },
                  '-order_date', pageSize, skip
                );
                break;
              } catch (e) {
                if (attempt < 2) await sleep(3000 * (attempt + 1));
                else throw e;
              }
            }
            if (!batch || batch.length === 0) break;
            allRecords.push(...batch);
            if (batch.length < pageSize) break;
            skip += pageSize;
            await sleep(200);
          }

          // Dedup: exact line items
          const seenLineItems = new Set();
          const deduped = [];
          for (const r of allRecords) {
            const key = `${r.order_id || r.id}|${r.sku || ''}|${r.location_name || ''}`;
            if (seenLineItems.has(key)) continue;
            seenLineItems.add(key);
            deduped.push(r);
          }
          const dupesRemoved = allRecords.length - deduped.length;

          // Dedup: prefer API over CSV for same SKU+day+location
          const apiDateKeys = new Set();
          for (const r of deduped) {
            if (r.order_id && !r.order_id.startsWith('CSV-')) {
              apiDateKeys.add(`${r.sku}|${(r.order_date || '').substring(0, 10)}|${r.location_name || 'Unknown'}`);
            }
          }
          const final = [];
          let csvOverlapRemoved = 0;
          for (const r of deduped) {
            if (r.order_id && r.order_id.startsWith('CSV-')) {
              const key = `${r.sku}|${(r.order_date || '').substring(0, 10)}|${r.location_name || 'Unknown'}`;
              if (apiDateKeys.has(key)) { csvOverlapRemoved++; continue; }
            }
            final.push(r);
          }

          totalRaw += allRecords.length;
          totalDupes += dupesRemoved;
          totalOverlap += csvOverlapRemoved;
          totalUnique += final.length;

          const monthIdx = month - 1;
          for (const r of final) {
            const sku = r.sku?.trim();
            if (!sku || (r.quantity || 0) <= 0) continue;
            const channel = r.channel || (r.location_id ? 'pos' : 'online');
            const location = r.location_name || (channel === 'online' ? 'Online' : 'Unknown');
            if (!merged[sku]) {
              merged[sku] = {
                sku, product: r.product_name || sku,
                monthly: [0,0,0,0,0,0,0,0,0,0,0,0],
                byChannel: { online: 0, pos: 0 },
                byLocation: {},
                totalQty: 0,
                periodStart: `${year}-${monthStr}-01`,
                periodEnd: `${year}-${monthStr}-28`,
              };
            }
            const m = merged[sku];
            m.monthly[monthIdx] += r.quantity;
            m.totalQty += r.quantity;
            if (channel === 'pos') m.byChannel.pos += r.quantity; else m.byChannel.online += r.quantity;
            m.byLocation[location] = (m.byLocation[location] || 0) + r.quantity;
            const dateKey = `${year}-${monthStr}`;
            if (dateKey < m.periodStart.substring(0, 7)) m.periodStart = `${dateKey}-01`;
            if (dateKey > m.periodEnd.substring(0, 7)) m.periodEnd = `${dateKey}-28`;
          }

          if (mi < months.length - 1) await sleep(1500);
        }

        // Compute dataMonths per SKU
        for (const m of Object.values(merged)) {
          const start = new Date(m.periodStart);
          const end = new Date(m.periodEnd);
          m.dataMonths = Math.max(1,
            (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
          );
        }

        const skuCount = Object.keys(merged).length;

        // ── Phase 2: Delete old records ──
        await writeStatus(base44, {
          state: 'running', phase: 'deleting', current: 0, total: skuCount,
          detail: 'Clearing old summaries...', startedBy: user.email,
        });

        let deleted = 0;
        while (true) {
          let batch;
          try {
            batch = await base44.asServiceRole.entities.DemandSummary.list('-created_date', 50, 0);
          } catch (e) { await sleep(3000); continue; }
          if (!batch || batch.length === 0) break;
          for (const r of batch) {
            try { await base44.asServiceRole.entities.DemandSummary.delete(r.id); }
            catch (e) { await sleep(2000); await base44.asServiceRole.entities.DemandSummary.delete(r.id); }
          }
          deleted += batch.length;
          await writeStatus(base44, {
            state: 'running', phase: 'deleting', current: deleted, total: deleted,
            detail: `Deleted ${deleted} old records...`, startedBy: user.email,
          });
          await sleep(1000);
        }

        // ── Phase 3: Write new records ──
        const nowISO = new Date().toISOString();
        const records = Object.values(merged).map(s => {
          const dataMonths = Math.max(1, s.dataMonths || 1);
          return {
            sku: s.sku, product: s.product, category: categorize(s.product),
            monthly: JSON.stringify(s.monthly),
            byChannel: JSON.stringify(s.byChannel),
            byLocation: JSON.stringify(s.byLocation),
            totalQty: s.totalQty,
            avgMonthly: Math.round((s.totalQty / dataMonths) * 10) / 10,
            totalRevenue: 0, dataMonths,
            periodStart: s.periodStart || '', periodEnd: s.periodEnd || '',
            updatedAt: nowISO,
          };
        });

        let created = 0;
        for (let i = 0; i < records.length; i += 10) {
          const batch = records.slice(i, i + 10);
          try { await base44.asServiceRole.entities.DemandSummary.bulkCreate(batch); }
          catch (e) { await sleep(3000); await base44.asServiceRole.entities.DemandSummary.bulkCreate(batch); }
          created += batch.length;
          await writeStatus(base44, {
            state: 'running', phase: 'writing', current: created, total: records.length,
            detail: `Writing ${created}/${records.length} summaries...`, startedBy: user.email,
          });
          await sleep(500);
        }

        // Write SyncLog
        try {
          await base44.asServiceRole.entities.SyncLog.create({
            sync_type: 'demand_summaries', status: 'success',
            records_processed: totalUnique, records_created: created,
            triggered_by: user.email,
            notes: `Background rebuild: ${deleted} deleted, ${created} new (${totalRaw} raw, ${totalDupes} dupes, ${totalOverlap} overlaps)`,
          });
        } catch (e) {}

        // Mark done
        await writeStatus(base44, {
          state: 'done',
          phase: 'complete',
          created,
          deleted,
          totalUnique,
          completedAt: new Date().toISOString(),
          startedBy: user.email,
        });

        console.log(`Background rebuild complete: ${created} summaries written`);
      } catch (err) {
        console.error('Background rebuild failed:', err.message);
        await writeStatus(base44, {
          state: 'error',
          error: err.message,
          failedAt: new Date().toISOString(),
        });
      }
    };

    // Fire and forget
    doRebuild();

    return Response.json({ success: true, message: 'Rebuild started in background' });
  } catch (error) {
    console.error('rebuildDemandSummariesBackground error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});