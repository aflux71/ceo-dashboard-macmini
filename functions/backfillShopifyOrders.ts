import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const token = Deno.env.get('SHOPIFY_TOKEN');
    const store = Deno.env.get('SHOPIFY_STORE');
    if (!token || !store) {
      return Response.json({ error: 'Missing SHOPIFY_TOKEN or SHOPIFY_STORE secret' }, { status: 500 });
    }

    const payload = await req.json();
    const startDate = payload.start_date;
    const endDate = payload.end_date;
    const skipDedup = payload.skip_dedup || false;

    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return Response.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      return Response.json({ error: 'start_date must be before or equal to end_date' }, { status: 400 });
    }

    const headers = { 'X-Shopify-Access-Token': token };

    // Fetch locations once
    let locationsRes;
    let backoffMs = 3000;
    for (let attempt = 0; attempt <= 5; attempt++) {
      locationsRes = await fetch(
        `https://${store}/admin/api/2026-01/locations.json`,
        { headers }
      );
      if (locationsRes.status === 429) {
        if (attempt < 5) {
          console.log(`Rate limited on locations fetch, waiting ${backoffMs}ms`);
          await delay(backoffMs);
          backoffMs *= 2;
          continue;
        }
        return Response.json({ error: 'Rate limit exceeded while fetching locations' }, { status: 429 });
      }
      break;
    }
    const locationsData = await locationsRes.json();
    const locationMap = {};
    for (const location of locationsData.locations || []) {
      locationMap[location.id] = location.name;
    }

    // Build existing record set using pagination with retry
    const existingSet = new Set();
    const PAGE_SIZE = 200;
    let page = 0;
    while (true) {
      let batch;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          batch = await base44.asServiceRole.entities.ShopifySaleRecord.list(
            '-created_date', PAGE_SIZE, page * PAGE_SIZE
          );
          break;
        } catch (e) {
          if (attempt < 2) {
            console.log(`Dedup page ${page} failed, retrying in ${3000 * (attempt + 1)}ms...`);
            await delay(3000 * (attempt + 1));
          } else {
            throw e;
          }
        }
      }
      if (!batch || batch.length === 0) break;
      for (const r of batch) {
        existingSet.add(`${r.order_id}#${r.sku}`);
      }
      if (batch.length < PAGE_SIZE) break;
      page++;
      await delay(500);
    }
    console.log(`Loaded ${existingSet.size} existing records for dedup`);

    await delay(2000);

    let totalDaysProcessed = 0;
    let totalOrders = 0;
    let totalRecordsCreated = 0;

    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const createdAtMin = new Date(currentDate);
      createdAtMin.setUTCHours(0, 0, 0, 0);
      const createdAtMax = new Date(currentDate);
      createdAtMax.setUTCHours(23, 59, 59, 999);

      let ordersThisDay = 0;
      let url = `https://${store}/admin/api/2026-01/orders.json?status=any&created_at_min=${createdAtMin.toISOString()}&created_at_max=${createdAtMax.toISOString()}&limit=250&fields=id,created_at,line_items,location_id`;

      while (url) {
        let res;
        let retryMs = 2000;
        for (let attempt = 0; attempt <= 5; attempt++) {
          res = await fetch(url, { headers });
          if (res.status === 429) {
            if (attempt < 5) {
              console.log(`Rate limited on ${dateStr}, waiting ${retryMs}ms`);
              await delay(retryMs);
              retryMs *= 2;
              continue;
            }
            return Response.json({
              error: 'Rate limit exceeded after retries',
              progress: { totalDaysProcessed, totalOrders, totalRecordsCreated }
            }, { status: 429 });
          }
          if (!res.ok) {
            const body = await res.text();
            return Response.json({ error: `Shopify API error on ${dateStr}: ${res.status}`, detail: body }, { status: 500 });
          }
          break;
        }

        const data = await res.json();
        const recordsToCreate = [];

        for (const order of data.orders || []) {
          ordersThisDay++;
          for (const lineItem of order.line_items || []) {
            if (!lineItem.sku || !lineItem.sku.trim()) continue;
            const sku = lineItem.sku.trim();
            const key = `${order.id}#${sku}`;
            if (existingSet.has(key)) continue;

            const locationId = order.location_id ? String(order.location_id) : null;
            const locationName = locationId ? (locationMap[order.location_id] || null) : null;
            const channel = locationId ? 'pos' : 'online';
            const variantTitle = lineItem.variant_title && lineItem.variant_title !== 'Default Title'
              ? lineItem.variant_title : null;
            const productName = variantTitle ? `${lineItem.title} - ${variantTitle}` : lineItem.title;

            recordsToCreate.push({
              order_id: String(order.id),
              sku,
              product_name: productName,
              quantity: lineItem.quantity,
              order_date: order.created_at,
              location_id: locationId,
              location_name: locationName,
              channel,
            });
            existingSet.add(key);
          }
        }

        // Bulk create in batches of 10 with retry
        for (let i = 0; i < recordsToCreate.length; i += 10) {
          const batch = recordsToCreate.slice(i, i + 10);
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await base44.asServiceRole.entities.ShopifySaleRecord.bulkCreate(batch);
              totalRecordsCreated += batch.length;
              break;
            } catch (e) {
              if (attempt < 2) {
                console.log(`Bulk create failed, retrying in ${2000 * (attempt + 1)}ms...`);
                await delay(2000 * (attempt + 1));
              } else {
                throw e;
              }
            }
          }
          await delay(1000);
        }

        // Pagination
        const linkHeader = res.headers.get('Link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
        if (url) await delay(2000);
      }

      totalOrders += ordersThisDay;
      totalDaysProcessed++;
      console.log(`${dateStr}: ${ordersThisDay} orders, running total: ${totalRecordsCreated} created`);

      currentDate.setDate(currentDate.getDate() + 1);
      if (currentDate <= end) await delay(3000);
    }

    // Log the sync
    await base44.asServiceRole.entities.SyncLog.create({
      sync_type: 'shopify_orders',
      status: 'success',
      records_processed: totalOrders,
      records_created: totalRecordsCreated,
      triggered_by: user.email,
      notes: `Backfill ${startDate} to ${endDate}: ${totalDaysProcessed} days, ${totalOrders} orders, ${totalRecordsCreated} records`,
      date_range_start: startDate,
      date_range_end: endDate,
    });

    return Response.json({
      success: true,
      start_date: startDate,
      end_date: endDate,
      total_days_processed: totalDaysProcessed,
      total_orders: totalOrders,
      total_records_created: totalRecordsCreated,
    });

  } catch (error) {
    console.error('backfillShopifyOrders error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});