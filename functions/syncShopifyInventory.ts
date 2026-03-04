import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  const startTime = Date.now();
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

    // Step 1: Find neob HQ location
    const locRes = await fetch(`https://${store}/admin/api/2026-01/locations.json`, { headers });
    const locData = await locRes.json();
    const locations = locData.locations || [];

    const hqLocation = locations.find(l => l.name === 'neob HQ')
      || locations.find(l => l.name?.toLowerCase().includes('neob hq'))
      || locations.find(l => l.name?.toLowerCase().includes('hq'));

    const locationLog = locations.map(l => ({ id: l.id, name: l.name, active: l.active }));

    if (!hqLocation) {
      return Response.json({
        error: 'Could not find neob HQ location in Shopify',
        available_locations: locationLog,
      }, { status: 400 });
    }

    const hqLocationId = hqLocation.id;

    // Step 2: Fetch all active product variants
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

    // Step 3: Fetch inventory levels at neob HQ
    const inventoryItemIds = allVariants.map(v => v.inventory_item_id);
    const quantityMap = {};

    for (let i = 0; i < inventoryItemIds.length; i += 50) {
      const batch = inventoryItemIds.slice(i, i + 50);
      const levelsUrl = `https://${store}/admin/api/2026-01/inventory_levels.json?inventory_item_ids=${batch.join(',')}&location_ids=${hqLocationId}&limit=250`;
      const res = await fetch(levelsUrl, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      for (const level of data.inventory_levels || []) {
        const id = String(level.inventory_item_id);
        if (String(level.location_id) === String(hqLocationId)) {
          quantityMap[id] = (level.available || 0);
        }
      }
    }

    // Step 4: Get existing inventory records
    const existingInventory = await base44.asServiceRole.entities.Inventory.list();
    const inventoryBySku = {};
    for (const item of existingInventory) {
      if (item.sku) inventoryBySku[item.sku.trim()] = item;
    }

    const now = new Date().toISOString();
    let updated = 0;
    let created = 0;

    // Separate into creates and updates
    const toCreate = [];
    const toUpdate = [];

    let skipped = 0;
    for (const variant of allVariants) {
      const quantity = quantityMap[variant.inventory_item_id] ?? 0;
      const existing = inventoryBySku[variant.sku];

      if (existing) {
        // Only update if quantity or name actually changed
        if (existing.quantity !== quantity || existing.name !== variant.name) {
          toUpdate.push({ id: existing.id, quantity, name: variant.name });
        } else {
          skipped++;
        }
      } else {
        toCreate.push({
          sku: variant.sku,
          name: variant.name,
          quantity,
          type: 'finished_product',
          unit: 'units',
          location: 'neob HQ',
          last_shopify_sync: now,
        });
      }
    }

    // Bulk create new items in chunks of 20
    for (let i = 0; i < toCreate.length; i += 20) {
      const chunk = toCreate.slice(i, i + 20);
      await base44.asServiceRole.entities.Inventory.bulkCreate(chunk);
      created += chunk.length;
      if (i + 20 < toCreate.length) await sleep(500);
    }

    // Update existing items one at a time with retry logic
    for (const item of toUpdate) {
      let retries = 3;
      while (retries > 0) {
        try {
          await base44.asServiceRole.entities.Inventory.update(item.id, {
            name: item.name,
            quantity: item.quantity,
            location: 'neob HQ',
            last_shopify_sync: now,
          });
          updated++;
          break;
        } catch (e) {
          retries--;
          if (retries === 0) {
            console.error(`Failed to update ${item.id} after 3 retries: ${e.message}`);
          } else {
            // Back off longer on rate limit
            await sleep(2000);
          }
        }
      }
      await sleep(500);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    // Log the sync
    await base44.asServiceRole.entities.SyncLog.create({
      sync_type: 'shopify_inventory',
      status: 'success',
      records_processed: allVariants.length,
      records_created: created,
      records_updated: updated,
      duration_seconds: duration,
      triggered_by: user.email,
      notes: `Synced from neob HQ (location ${hqLocationId})`,
    });

    return Response.json({
      success: true,
      hq_location: { id: hqLocationId, name: hqLocation.name },
      total_synced: allVariants.length,
      updated,
      created,
      duration_seconds: duration,
    });

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    // Try to log the error too
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.SyncLog.create({
        sync_type: 'shopify_inventory',
        status: 'error',
        duration_seconds: duration,
        notes: error.message,
      });
    } catch {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});