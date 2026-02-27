import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Delay utility for rate limiting
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

    const headers = { 'X-Shopify-Access-Token': token };

    // Fetch all active product variants with SKUs from Shopify
    const allVariants = [];
    let url = 'https://09c7e1.myshopify.com/admin/api/2026-01/products.json?limit=250&fields=id,title,status,variants';
    let retries = 0;
    const maxRetries = 3;

    while (url) {
      let res;
      let backoffMs = 1000;

      // Retry logic for rate limiting
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        res = await fetch(url, { headers });
        
        if (res.status === 429) {
          // Rate limit hit
          if (attempt < maxRetries) {
            console.log(`Rate limited, waiting ${backoffMs}ms before retry...`);
            await delay(backoffMs);
            backoffMs *= 2; // Exponential backoff
            continue;
          } else {
            return Response.json({ error: 'Shopify rate limit exceeded after retries' }, { status: 429 });
          }
        }

        if (!res.ok) {
          const body = await res.text();
          return Response.json({ error: `Shopify API error: ${res.status}`, detail: body }, { status: 500 });
        }

        break; // Success
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

      // Paginate via Link header
      const linkHeader = res.headers.get('Link');
      url = null;
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) url = match[1];
      }

      // Throttle between page requests
      if (url) {
        await delay(2000);
      }
    }

    // Load existing Inventory records, index by SKU
    const existingInventory = await base44.asServiceRole.entities.Inventory.list();
    const inventoryBySku = {};
    for (const item of existingInventory) {
      if (item.sku) inventoryBySku[item.sku.trim()] = item;
    }

    const now = new Date().toISOString();
    let updated = 0;
    let created = 0;

    // Batch process in groups of 10 to reduce request volume
    for (let i = 0; i < allVariants.length; i += 10) {
      const batch = allVariants.slice(i, i + 10);
      
      for (const variant of batch) {
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
      
      // Throttle between batches
      if (i + 10 < allVariants.length) {
        await delay(1000);
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