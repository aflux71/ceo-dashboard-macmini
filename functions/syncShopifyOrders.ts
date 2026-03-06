import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const store = Deno.env.get('SHOPIFY_STORE');
    const token = Deno.env.get('SHOPIFY_TOKEN');

    if (!store || !token) {
      return Response.json({ error: 'Missing SHOPIFY_STORE or SHOPIFY_TOKEN secrets' }, { status: 500 });
    }

    // Parse optional date parameter (YYYY-MM-DD) or default to yesterday
    const body = await req.json().catch(() => ({}));
    let targetDate = body.date;
    
    if (!targetDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = yesterday.toISOString().split('T')[0];
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return Response.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    // Build time range for the entire day in UTC
    const createdAtMin = `${targetDate}T00:00:00Z`;
    const createdAtMax = `${targetDate}T23:59:59Z`;

    // Fetch all locations for name lookup
    const locRes = await fetch(`https://${store}/admin/api/2026-01/locations.json`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const locData = await locRes.json();
    const locationMap = {};
    for (const loc of locData.locations || []) {
      locationMap[loc.id] = loc.name;
    }

    // Fetch all orders for the target day
    let orders = [];
    let url = `https://${store}/admin/api/2026-01/orders.json?status=any&limit=250&created_at_min=${createdAtMin}&created_at_max=${createdAtMax}&fields=id,created_at,location_id,line_items`;

    while (url) {
      const res = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': token }
      });
      const data = await res.json();
      orders = orders.concat(data.orders || []);

      const linkHeader = res.headers.get('Link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
    }

    // Get existing records keyed by order_id + sku
    const existingRecords = await base44.asServiceRole.entities.ShopifySaleRecord.list();
    const existingMap = {};
    for (const record of existingRecords) {
      const key = `${record.order_id}__${record.sku}`;
      existingMap[key] = record;
    }

    let created = 0;

    // Process each order and create records for line items with SKUs
    for (const order of orders) {
      const orderId = String(order.id);
      const orderDate = targetDate; // Use target date consistently
      const locationId = order.location_id ? String(order.location_id) : null;
      const locationName = locationId ? (locationMap[order.location_id] || null) : null;
      const channel = locationId ? 'pos' : 'online';

      for (const item of order.line_items || []) {
        if (!item.sku) continue;

        const key = `${orderId}__${item.sku}`;
        
        // Skip if record already exists
        if (existingMap[key]) {
          continue;
        }

        // Create new record
        const variantTitle = item.variant_title && item.variant_title !== 'Default Title'
          ? item.variant_title
          : null;
        const productName = variantTitle ? `${item.title} - ${variantTitle}` : item.title;

        await base44.asServiceRole.entities.ShopifySaleRecord.create({
          order_id: orderId,
          sku: item.sku,
          product_name: productName,
          quantity: item.quantity,
          order_date: orderDate,
          location_id: locationId,
          location_name: locationName,
          channel: channel,
        });
        created++;
      }
    }

    // Log the sync
    await base44.asServiceRole.entities.SyncLog.create({
      sync_type: 'shopify_orders',
      status: 'success',
      records_processed: orders.length,
      records_created: created,
      triggered_by: user.email,
      notes: `Synced ${targetDate}: ${orders.length} orders, ${created} records created`,
      date_range_start: targetDate,
      date_range_end: targetDate,
    });

    return Response.json({
      message: `Synced ${targetDate}: ${orders.length} orders, ${created} records created`,
      date: targetDate,
      orders_processed: orders.length,
      records_created: created,
    });
  } catch (error) {
    // Try to log the error
    try {
      const base44err = createClientFromRequest(req);
      await base44err.asServiceRole.entities.SyncLog.create({
        sync_type: 'shopify_orders',
        status: 'error',
        notes: error.message,
      });
    } catch {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});