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

    const headers = { 'X-Shopify-Access-Token': token };

    // Step 1: Fetch all active product variants
    let allVariants = [];
    let url = `https://${store}/admin/api/2026-01/products.json?limit=250&fields=id,title,status,variants`;

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
            inventory_item_id: String(variant.inventory_item_id),
            name: product.title + (variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
          });
        }
      }

      const linkHeader = res.headers.get('Link');
      url = null;
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) url = match[1];
      }
    }

    // Step 2: Fetch inventory levels for all inventory_item_ids (batched in groups of 50)
    const inventoryItemIds = allVariants.map(v => v.inventory_item_id);
    const quantityMap = {}; // inventory_item_id -> total quantity across all locations

    for (let i = 0; i < inventoryItemIds.length; i += 50) {
      const batch = inventoryItemIds.slice(i, i + 50);
      const levelsUrl = `https://${store}/admin/api/2026-01/inventory_levels.json?inventory_item_ids=${batch.join(',')}&limit=250`;
      const res = await fetch(levelsUrl, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      for (const level of data.inventory_levels || []) {
        const id = String(level.inventory_item_id);
        quantityMap[id] = (quantityMap[id] || 0) + (level.available || 0);
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
      const quantity = quantityMap[variant.inventory_item_id] ?? 0;
      const existing = inventoryBySku[variant.sku];

      if (existing) {
        await base44.asServiceRole.entities.Inventory.update(existing.id, {
          name: variant.name,
          quantity,
          last_shopify_sync: now,
        });
        updated++;
      } else {
        await base44.asServiceRole.entities.Inventory.create({
          sku: variant.sku,
          name: variant.name,
          quantity,
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