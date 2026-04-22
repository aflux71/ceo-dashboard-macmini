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
const MERGED_KEY = 'demand_rebuild_merged';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const is429 = e.message?.includes('Rate limit') || e.message?.includes('429');
      if (is429 && attempt < maxAttempts - 1) {
        const delay = Math.pow(2, attempt + 1) * 1500;
        console.log(`Rate limited, retrying in ${delay}ms`);
        await sleep(delay);
      } else {
        throw e;
      }
    }
  }
}

async function readSetting(base44, key) {
  const rows = await withRetry(() => base44.asServiceRole.entities.AppSettings.filter({ key }));
  if (!rows || rows.length === 0) return null;
  try { return JSON.parse(rows[0].value); } catch { return rows[0].value; }
}

async function writeSetting(base44, key, value, description) {
  const rows = await withRetry(() => base44.asServiceRole.entities.AppSettings.filter({ key }));
  const strVal = JSON.stringify(value);
  if (rows && rows.length > 0) {
    await withRetry(() => base44.asServiceRole.entities.AppSettings.update(rows[0].id, { value: strVal }));
  } else {
    await withRetry(() => base44.asServiceRole.entities.AppSettings.create({ key, value: strVal, description: description || key }));
  }
}

// Build month list to process
function buildMonthList() {
  const now = new Date();
  const months = [];
  // All of 2025
  for (let m = 1; m <= 12; m++) months.push({ year: 2025, month: m });
  // Current year up to now
  if (now.getFullYear() > 2025) {
    for (let m = 1; m <= now.getMonth() + 1; m++) {
      months.push({ year: now.getFullYear(), month: m });
    }
  }
  return months;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // ── status ────────────────────────────────────────────────────────────
    if (body.action === 'status') {
      const status = await readSetting(base44, STATUS_KEY);
      return Response.json(status || { state: null });
    }

    // ── reset ─────────────────────────────────────────────────────────────
    if (body.action === 'reset') {
      await writeSetting(base44, STATUS_KEY, { state: null });
      await writeSetting(base44, MERGED_KEY, {});
      return Response.json({ success: true });
    }

    // ── step: process ONE month ───────────────────────────────────────────
    // Called repeatedly by the frontend until monthIndex >= months.length
    if (body.action === 'step') {
      const months = buildMonthList();
      const monthIndex = body.monthIndex ?? 0;

      if (monthIndex >= months.length) {
        return Response.json({ done: false, monthIndex, needsFinalize: true });
      }

      const { year, month } = months[monthIndex];
      const monthStr = String(month).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      console.log(`Processing month ${year}-${monthStr}`);

      // Page through records for this month
      const allRecords = [];
      let skip = 0;
      const pageSize = 100;
      while (true) {
        const batch = await withRetry(() =>
          base44.asServiceRole.entities.ShopifySaleRecord.filter(
            { order_date: { $gte: startDate, $lt: endDate } },
            '-order_date', pageSize, skip
          )
        );
        if (!batch || batch.length === 0) break;
        allRecords.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
        await sleep(200);
      }

      // Dedup exact line items
      const seenLineItems = new Set();
      const deduped = [];
      for (const r of allRecords) {
        const key = `${r.order_id || r.id}|${r.sku || ''}|${r.location_name || ''}`;
        if (seenLineItems.has(key)) continue;
        seenLineItems.add(key);
        deduped.push(r);
      }

      // Prefer API over CSV
      const apiDateKeys = new Set();
      for (const r of deduped) {
        if (r.order_id && !r.order_id.startsWith('CSV-')) {
          apiDateKeys.add(`${r.sku}|${(r.order_date || '').substring(0, 10)}|${r.location_name || 'Unknown'}`);
        }
      }
      const final = [];
      for (const r of deduped) {
        if (r.order_id && r.order_id.startsWith('CSV-')) {
          const key = `${r.sku}|${(r.order_date || '').substring(0, 10)}|${r.location_name || 'Unknown'}`;
          if (apiDateKeys.has(key)) continue;
        }
        final.push(r);
      }

      // Load existing merged data
      const merged = (await readSetting(base44, MERGED_KEY)) || {};

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
            byLocation: {}, totalQty: 0,
            periodStart: `${year}-${monthStr}-01`,
            periodEnd: `${year}-${monthStr}-28`,
          };
        }
        const m = merged[sku];
        m.monthly[monthIdx] += r.quantity;
        m.totalQty += r.quantity;
        if (channel === 'pos') m.byChannel.pos += r.quantity;
        else m.byChannel.online += r.quantity;
        m.byLocation[location] = (m.byLocation[location] || 0) + r.quantity;
        const dateKey = `${year}-${monthStr}`;
        if (dateKey < m.periodStart.substring(0, 7)) m.periodStart = `${dateKey}-01`;
        if (dateKey > m.periodEnd.substring(0, 7)) m.periodEnd = `${dateKey}-28`;
      }

      // Save merged back
      await writeSetting(base44, MERGED_KEY, merged);

      // Update status
      await writeSetting(base44, STATUS_KEY, {
        state: 'running', phase: 'aggregating',
        current: monthIndex + 1, total: months.length,
        detail: `Aggregated ${year}-${monthStr} (${final.length} records)`,
        startedAt: body.startedAt || new Date().toISOString(),
        startedBy: user.email,
      });

      return Response.json({
        done: false,
        monthIndex: monthIndex + 1,
        total: months.length,
        recordCount: final.length,
        skuCount: Object.keys(merged).length,
      });
    }

    // ── finalize: delete old + write new summaries ────────────────────────
    if (body.action === 'finalize') {
      const merged = (await readSetting(base44, MERGED_KEY)) || {};
      const skuCount = Object.keys(merged).length;

      console.log(`Finalizing: ${skuCount} SKUs`);

      // Compute dataMonths per SKU
      for (const m of Object.values(merged)) {
        const start = new Date(m.periodStart);
        const end = new Date(m.periodEnd);
        m.dataMonths = Math.max(1,
          (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
        );
      }

      // Delete old records — in batches of 20
      await writeSetting(base44, STATUS_KEY, {
        state: 'running', phase: 'deleting', current: 0, total: skuCount,
        detail: 'Clearing old summaries...', startedBy: user.email,
      });

      let deleted = 0;
      while (true) {
        const batch = await withRetry(() =>
          base44.asServiceRole.entities.DemandSummary.list('-created_date', 20, 0)
        );
        if (!batch || batch.length === 0) break;
        for (const r of batch) {
          await withRetry(() => base44.asServiceRole.entities.DemandSummary.delete(r.id));
          await sleep(100);
        }
        deleted += batch.length;
        await sleep(300);
      }

      // Write new records in batches of 10
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
      const BATCH_SIZE = 10;
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        await withRetry(() => base44.asServiceRole.entities.DemandSummary.bulkCreate(batch));
        created += batch.length;
        await sleep(400);
      }

      // SyncLog
      try {
        await base44.asServiceRole.entities.SyncLog.create({
          sync_type: 'demand_summaries', status: 'success',
          records_processed: body.totalUnique || created,
          records_created: created,
          triggered_by: user.email,
          notes: `Rebuild complete: ${deleted} deleted, ${created} new summaries`,
        });
      } catch (e) { console.warn('SyncLog failed:', e.message); }

      // Clear merged data to free AppSettings space
      await writeSetting(base44, MERGED_KEY, {});

      const finalStatus = {
        state: 'done', phase: 'complete',
        created, deleted,
        completedAt: new Date().toISOString(), startedBy: user.email,
      };
      await writeSetting(base44, STATUS_KEY, finalStatus);

      return Response.json({ success: true, created, deleted });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    console.error('Function error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});