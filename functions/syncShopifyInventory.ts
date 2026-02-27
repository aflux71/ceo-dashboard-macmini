import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    const headers = { 'X-Shopify-Access-Token': token };

    // Fetch all products with pagination
    let allVariants = [];
    let url = 'https://09c7e1.myshopify.com/admin/api/2026-01/products.json?limit=250&fields=id,title,status,variants';

    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const body = await res.text();
        return Response.json({ error: `Shopify API error: ${res.status}`, detail: body }, { status: 500 });
      }

      const data = await res.json();
      for (const product of data.products) {
        if (product.status !== 'active') continue;
        for (const variant of product.variants) {
          if (!variant.sku || !variant.sku.trim()) continue;
          allVariants.push({
            sku: variant.sku.trim(),
            name: product.title + (variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
            quantity: variant.inventory_quantity ?? 0,
          });
        }
      }

      // Handle pagination via Link header
      const linkHeader = res.headers.get('Link');
      url = null;
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) url = match[1];
      }
    }

    // Get existing inventory records
    const existingInventory = await base44.asServiceRole.entities.Inventory.list();
    const inventoryBySku = {};
    for (const item of existingInventory) {
      if (item.sku) inventoryBySku[item.sku.trim()] = item;
    }

    const now = new Date().toISOString();
    let updated = 0;
    let created = 0;

    for (const variant of allVariants) {
      const existing = inventoryBySku[variant.sku];
      if (existing) {
        await base44.asServiceRole.entities.Inventory.update(existing.id, {
          name: variant.name,
          quantity: variant.quantity,
          last_shopify_sync: now,
        });
        updated++;
      } else {
        await base44.asServiceRole.entities.Inventory.create({
          sku: variant.sku,
          name: variant.name,
          quantity: variant.quantity,
          type: 'finished_product',
          unit: 'units',
          last_shopify_sync: now,
        });
        created++;
      }
    }

    return Response.json({
      success: true,
      total_synced: allVariants.length,
      updated,
      created,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});