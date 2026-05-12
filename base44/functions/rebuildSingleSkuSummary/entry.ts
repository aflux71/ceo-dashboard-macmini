import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Rebuild DemandSummary for a single SKU from ShopifySaleRecord data.
 * Usage: POST { sku: "000000972420" }
 */

function categorize(name) {
  const n = (name || '').toLowerCase();
  if (/roll.on|deodorant/.test(n)) return 'Roll-ons';
  if (/bath bomb/.test(n)) return 'Bath Bombs';
  if (/soap bar|bathing bar/.test(n)) return 'Soap Bars';
  if (/shampoo bar/.test(n)) return 'Shampoo Bars';
  if (/body wash|one\s?wash/.test(n)) return 'Body Wash';
  if (/hand soap|liquid soap|foaming soap/.test(n)) return 'Liquid Soap';
  if (/conditioner/.test(n)) return 'Conditioner';
  if (/shampoo/.test(n)) return 'Shampoo';
  if (/body spritz|pillow spray|air mist/.test(n)) return 'Sprays & Mists';
  if (/lip balm|kissable/.test(n)) return 'Lip Balm';
  if (/foot balm/.test(n)) return 'Foot Care';
  if (/butter|lotion/.test(n)) return 'Lotions & Butters';
  return 'Other';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const sku = (body.sku || '').trim();
    if (!sku) return Response.json({ error: 'sku required' }, { status: 400 });

    // Fetch all sale records for this SKU
    const records = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.ShopifySaleRecord.filter(
        { sku }, '-order_date', 100, skip
      );
      if (!batch || batch.length === 0) break;
      records.push(...batch);
      if (batch.length < 100) break;
      skip += 100;
    }

    if (records.length === 0) {
      return Response.json({ error: `No sale records for SKU ${sku}` }, { status: 404 });
    }

    // Aggregate
    let totalQty = 0;
    const monthly = {};
    const byChannel = {};
    const byLocation = {};
    let periodStart = records[0].order_date;
    let periodEnd = records[0].order_date;
    let productName = '';

    for (const r of records) {
      const qty = Number(r.quantity) || 0;
      totalQty += qty;
      const monthKey = (r.order_date || '').substring(0, 7);
      monthly[monthKey] = (monthly[monthKey] || 0) + qty;
      if (r.channel) byChannel[r.channel] = (byChannel[r.channel] || 0) + qty;
      if (r.location_name) byLocation[r.location_name] = (byLocation[r.location_name] || 0) + qty;
      if (r.order_date < periodStart) periodStart = r.order_date;
      if (r.order_date > periodEnd) periodEnd = r.order_date;
      if (r.product_name) productName = r.product_name;
    }

    const dataMonths = Math.max(1, Object.keys(monthly).length);

    // Delete existing summary for this SKU
    const existing = await base44.asServiceRole.entities.DemandSummary.filter({ sku });
    for (const e of (existing || [])) {
      await base44.asServiceRole.entities.DemandSummary.delete(e.id);
    }

    const created = await base44.asServiceRole.entities.DemandSummary.create({
      sku,
      product: productName,
      category: categorize(productName),
      monthly: JSON.stringify(monthly),
      byChannel: JSON.stringify(byChannel),
      byLocation: JSON.stringify(byLocation),
      totalQty,
      avgMonthly: Math.round((totalQty / dataMonths) * 10) / 10,
      totalRevenue: 0,
      dataMonths,
      periodStart: periodStart || '',
      periodEnd: periodEnd || '',
      updatedAt: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      sku,
      product: productName,
      totalQty,
      avgMonthly: Math.round((totalQty / dataMonths) * 10) / 10,
      dataMonths,
      monthly,
      byChannel,
      byLocation,
      periodStart,
      periodEnd,
      sale_records_processed: records.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});