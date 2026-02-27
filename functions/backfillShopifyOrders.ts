import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const token = Deno.env.get('SHOPIFY_TOKEN');
    if (!token) {
      return Response.json({ error: 'Missing SHOPIFY_TOKEN secret' }, { status: 500 });
    }

    const payload = await req.json();
    const startDate = payload.start_date;
    const endDate = payload.end_date;

    // Validate date format
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return Response.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      return Response.json({ error: 'start_date must be before or equal to end_date' }, { status: 400 });
    }

    const headers = { 'X-Shopify-Access-Token': token };

    // Fetch locations once with retry
    let locationsRes;
    let backoffMs = 3000;
    for (let attempt = 0; attempt <= 5; attempt++) {
      locationsRes = await fetch(
        'https://09c7e1.myshopify.com/admin/api/2026-01/locations.json',
        { headers }
      );

      if (locationsRes.status === 429) {
        if (attempt < 5) {
          console.log(`Rate limited on locations fetch, waiting ${backoffMs}ms (attempt ${attempt + 1})`);
          await delay(backoffMs);
          backoffMs *= 2;
          continue;
        } else {
          return Response.json({ error: 'Rate limit exceeded while fetching locations' }, { status: 429 });
        }
      }
      break;
    }

    const locationsData = await locationsRes.json();
    const locationMap = {};
    for (const location of locationsData.locations) {
      locationMap[location.id] = location.name;
    }

    // Wait before starting backfill
    await delay(5000);

    // Get existing records to prevent duplicates
    const existingRecords = await base44.asServiceRole.entities.ShopifySaleRecord.list();
    const existingSet = new Set(existingRecords.map(r => `${r.order_id}#${r.sku}`));

    let totalDaysProcessed = 0;
    let totalOrders = 0;
    let totalRecordsCreated = 0;

    // Loop through each day
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const createdAtMin = new Date(currentDate);
      createdAtMin.setUTCHours(0, 0, 0, 0);
      const createdAtMax = new Date(currentDate);
      createdAtMax.setUTCHours(23, 59, 59, 999);

      let ordersThisDay = 0;

      // Fetch orders for this day
      let url = `https://09c7e1.myshopify.com/admin/api/2026-01/orders.json?status=any&created_at_min=${createdAtMin.toISOString()}&created_at_max=${createdAtMax.toISOString()}&limit=250&fields=id,created_at,line_items,location_id`;

      while (url) {
        let res;
        let backoffMs = 2000;
        const maxRetries = 5;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          res = await fetch(url, { headers });

          if (res.status === 429) {
            if (attempt < maxRetries) {
              console.log(`Rate limited on ${dateStr}, waiting ${backoffMs}ms (attempt ${attempt + 1})`);
              await delay(backoffMs);
              backoffMs *= 2;
              continue;
            } else {
              return Response.json({ error: 'Rate limit exceeded after retries' }, { status: 429 });
            }
          }

          if (!res.ok) {
            const body = await res.text();
            return Response.json({ error: `Shopify API error on ${dateStr}: ${res.status}`, detail: body }, { status: 500 });
          }

          break;
        }

        const data = await res.json();
        for (const order of data.orders) {
          ordersThisDay++;
          for (const lineItem of order.line_items) {
            if (!lineItem.sku || !lineItem.sku.trim()) continue;

            const key = `${order.id}#${lineItem.sku.trim()}`;
            if (existingSet.has(key)) continue;

            await base44.asServiceRole.entities.ShopifySaleRecord.create({
              order_id: String(order.id),
              sku: lineItem.sku.trim(),
              product_name: lineItem.title,
              quantity: lineItem.quantity,
              order_date: order.created_at,
              location_id: String(order.location_id || ''),
              location_name: locationMap[order.location_id] || 'Unknown',
            });

            existingSet.add(key);
            totalRecordsCreated++;
          }
        }

        // Pagination
        const linkHeader = res.headers.get('Link');
        url = null;
        if (linkHeader) {
          const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (match) url = match[1];
          if (url) await delay(3000); // Delay between paginated requests
        }
      }

      totalOrders += ordersThisDay;
      totalDaysProcessed++;

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);

      // Delay between days
      if (currentDate <= end) {
        await delay(5000);
      }
    }

    return Response.json({
      success: true,
      start_date: startDate,
      end_date: endDate,
      total_days_processed: totalDaysProcessed,
      total_orders: totalOrders,
      total_records_created: totalRecordsCreated,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});