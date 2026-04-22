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

function buildMonthList() {
  const now = new Date();
  const months = [];
  for (let m = 1; m <= 12; m++) months.push({ year: 2025, month: m });
  if (now.getFullYear() > 2025) {
    for (let m = 1; m <= now.getMonth() + 1; m++) {
      months.push({ year: now.getFullYear(), month: m });
    }
  }
  return months;
}

function mergeRecord(merged, r, monthIdx, year, monthStr) {
  const sku = r.sku?.trim();
  if (!sku || (r.quantity || 0) <= 0) return;
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

    // ── step: fetch ONE PAGE (100 records) for a given month ──────────────
    // Frontend calls this in a loop, incrementing pageSkip until monthDone=true
    if (body.action === 'step') {
      const months = buildMonthList();
      const monthIndex = body.monthIndex ?? 0;
      const pageSkip = body.pageSkip ?? 0;
      const PAGE_SIZE = 100;

      if (monthIndex >= months.length) {
        return Response.json({ monthDone: true, monthIndex, allDone: true });
      }

      const { year, month } = months[monthIndex];
      const monthStr = String(month).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      console.log(`Step: ${year}-${monthStr} skip=${pageSkip}`);

      // Fetch one page
      const page = await withRetry(() =>
        base44.asServiceRole.entities.ShopifySaleRecord.filter(
          { order_date: { $gte: startDate, $lt: endDate } },
          '-order_date', PAGE_SIZE, pageSkip
        )
      );

      const records = page || [];

      // Dedup & API-over-CSV preference for this page
      const seenLineItems = new Set();
      const deduped = [];
      for (const r of records) {
        const key = `${r.order_id || r.id}|${r.sku || ''}|${r.location_name || ''}`;
        if (seenLineItems.has(key)) continue;
        seenLineItems.add(key);
        deduped.push(r);
      }

      // Track API keys in this page for CSV suppression
      const apiDateKeys = new Set();
      for (const r of deduped) {
        if (r.order_id && !r.order_id.startsWith('CSV-')) {
          apiDateKeys.add(`${r.sku}|${(r.order_date || '').substring(0, 10)}|${r.location_name || 'Unknown'}`);
        }
      }
      const final = deduped.filter(r => {
        if (r.order_id?.startsWith('CSV-')) {
          return !apiDateKeys.has(`${r.sku}|${(r.order_date || '').substring(0, 10)}|${r.location_name || 'Unknown'}`);
        }
        return true;
      });

      // Load merged, update, save
      const merged = (await readSetting(base44, MERGED_KEY)) || {};
      const monthIdx = month - 1;
      for (const r of final) {
        mergeRecord(merged, r, monthIdx, year, monthStr);
      }
      await writeSetting(base44, MERGED_KEY, merged);

      const monthDone = records.length < PAGE_SIZE;
      const nextSkip = pageSkip + PAGE_SIZE;

      // Update status
      await writeSetting(base44, STATUS_KEY, {
        state: 'running', phase: 'aggregating',
        monthIndex: monthDone ? monthIndex + 1 : monthIndex,
        pageSkip: monthDone ? 0 : nextSkip,
        totalMonths: months.length,
        detail: `${year}-${monthStr} — page ${Math.floor(pageSkip / PAGE_SIZE) + 1} (${records.length} records)`,
        startedAt: body.startedAt || new Date().toISOString(),
        startedBy: user.email,
      });

      return Response.json({
        monthDone,
        monthIndex: monthDone ? monthIndex + 1 : monthIndex,
        pageSkip: monthDone ? 0 : nextSkip,
        totalMonths: months.length,
        recordCount: records.length,
        skuCount: Object.keys(merged).length,
        allDone: monthDone && (monthIndex + 1 >= months.length),
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

      // Delete old records
      let deleted = 0;
      while (true) {
        const batch = await withRetry(() =>
          base44.asServiceRole.entities.DemandSummary.list('-created_date', 20, 0)
        );
        if (!batch || batch.length === 0) break;
        for (const r of batch) {
          await withRetry(() => base44.asServiceRole.entities.DemandSummary.delete(r.id));
          await sleep(80);
        }
        deleted += batch.length;
        await sleep(200);
      }

      // Write new records
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
        await withRetry(() => base44.asServiceRole.entities.DemandSummary.bulkCreate(batch));
        created += batch.length;
        await sleep(300);
      }

      try {
        await base44.asServiceRole.entities.SyncLog.create({
          sync_type: 'demand_summaries', status: 'success',
          records_processed: created, records_created: created,
          triggered_by: user.email,
          notes: `Rebuild complete: ${deleted} deleted, ${created} summaries written`,
        });
      } catch (e) { console.warn('SyncLog failed:', e.message); }

      await writeSetting(base44, MERGED_KEY, {});

      const finalStatus = {
        state: 'done', phase: 'complete', created, deleted,
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