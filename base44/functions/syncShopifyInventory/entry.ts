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
          // Use barcode as SKU if available (matches ShopifySaleRecord format from POS),
          // otherwise fall back to Shopify variant SKU
          const barcode = variant.barcode ? variant.barcode.trim() : null;
          const variantSku = variant.sku.trim();
          allVariants.push({
            sku: barcode || variantSku,
            variant_sku: variantSku,
            barcode: barcode,
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
      if (!res.ok) {
        console.error(`Inventory levels fetch failed: ${res.status} for batch starting at ${i}`);
        continue;
      }
      const data = await res.json();
      for (const level of data.inventory_levels || []) {
        const id = String(level.inventory_item_id);
        if (String(level.location_id) === String(hqLocationId)) {
          quantityMap[id] = (level.available || 0);
        }
      }
      // Respect Shopify rate limits
      if (i + 50 < inventoryItemIds.length) await sleep(500);
    }
    console.log(`Fetched inventory levels for ${Object.keys(quantityMap).length} items at neob HQ (location ${hqLocationId})`);
    console.log(`Total variants: ${allVariants.length}, Items with levels: ${Object.keys(quantityMap).length}`);

    // Step 4: Get ALL existing inventory records (paginated)
    const existingInventory = [];
    let invSkip = 0;
    const invPageSize = 200;
    while (true) {
      const batch = await base44.asServiceRole.entities.Inventory.list('-created_date', invPageSize, invSkip);
      if (!batch || batch.length === 0) break;
      existingInventory.push(...batch);
      if (batch.length < invPageSize) break;
      invSkip += invPageSize;
      await sleep(300);
    }
    console.log(`Loaded ${existingInventory.length} existing inventory records`);
    
    // Build lookup maps by both barcode and variant SKU
    const inventoryBySku = {};
    for (const item of existingInventory) {
      if (item.sku) inventoryBySku[item.sku.trim()] = item;
      // Also index by supplier_sku if present (used to store variant_sku)
      if (item.supplier_sku) inventoryBySku[item.supplier_sku.trim()] = item;
    }

    // Step 5: Load approved SKU mappings for alias resolution
    const skuMappings = [];
    let mapSkip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.SKUMapping.filter(
        { status: 'approved' }, '-created_date', 100, mapSkip
      );
      if (!batch || batch.length === 0) break;
      skuMappings.push(...batch);
      if (batch.length < 100) break;
      mapSkip += 100;
    }
    // Build lookup: old_sku -> new_sku and new_sku -> old_sku (bidirectional)
    const skuAliasMap = {};
    for (const m of skuMappings) {
      if (m.old_sku) skuAliasMap[m.old_sku.trim()] = m.new_sku?.trim();
      if (m.new_sku) skuAliasMap[m.new_sku.trim()] = m.old_sku?.trim();
    }
    console.log(`Loaded ${skuMappings.length} approved SKU mappings`);

    const now = new Date().toISOString();
    let updated = 0;
    let created = 0;
    let migrated = 0;

    // Separate into creates and updates
    const toCreate = [];
    const toUpdate = [];

    let skipped = 0;
    for (const variant of allVariants) {
      const quantity = quantityMap[variant.inventory_item_id] ?? 0;
      // Look up by barcode SKU first, then variant SKU, then check SKU alias mappings
      let existing = inventoryBySku[variant.sku] || inventoryBySku[variant.variant_sku];
      
      // If not found directly, check approved SKU mappings (alias table)
      if (!existing) {
        const aliasedSku = skuAliasMap[variant.sku] || skuAliasMap[variant.variant_sku];
        if (aliasedSku) {
          existing = inventoryBySku[aliasedSku];
          if (existing) {
            console.log(`SKU alias match: ${variant.sku} -> ${aliasedSku} (record ${existing.id})`);
          }
        }
      }

      if (existing) {
        // Check if SKU needs migration from variant_sku to barcode
        const needsSkuMigration = variant.barcode && existing.sku !== variant.barcode;
        const needsUpdate = existing.quantity !== quantity || existing.name !== variant.name || needsSkuMigration;
        
        if (needsUpdate) {
          const updateData = { id: existing.id, quantity, name: variant.name };
          if (needsSkuMigration) {
            updateData.sku = variant.barcode;
            updateData.supplier_sku = variant.variant_sku;
            migrated++;
          }
          toUpdate.push(updateData);
        } else {
          skipped++;
        }
      } else {
        toCreate.push({
          sku: variant.sku,
          supplier_sku: variant.variant_sku !== variant.sku ? variant.variant_sku : undefined,
          name: variant.name,
          quantity,
          type: 'finished_product',
          unit: 'units',
          location: 'neob HQ',
          last_shopify_sync: now,
        });
      }
    }
    console.log(`To create: ${toCreate.length}, To update: ${toUpdate.length}, Skipped: ${skipped}, SKU migrations: ${migrated}`);

    // Bulk create new items in chunks of 20
    for (let i = 0; i < toCreate.length; i += 20) {
      const chunk = toCreate.slice(i, i + 20);
      await base44.asServiceRole.entities.Inventory.bulkCreate(chunk);
      created += chunk.length;
      if (i + 20 < toCreate.length) await sleep(500);
    }

    // Update existing items with retry logic and batched timing
    let updateErrors = 0;
    for (let ui = 0; ui < toUpdate.length; ui++) {
      const item = toUpdate[ui];
      let retries = 3;
      while (retries > 0) {
        try {
          const updatePayload = {
            name: item.name,
            quantity: item.quantity,
            location: 'neob HQ',
            last_shopify_sync: now,
          };
          if (item.sku) updatePayload.sku = item.sku;
          if (item.supplier_sku) updatePayload.supplier_sku = item.supplier_sku;
          
          await base44.asServiceRole.entities.Inventory.update(item.id, updatePayload);
          updated++;
          break;
        } catch (e) {
          retries--;
          if (retries === 0) {
            console.error(`Failed to update ${item.id}: ${e.message}`);
            updateErrors++;
          } else {
            await sleep(e.status === 429 ? 3000 : 1000);
          }
        }
      }
      // Smaller delay, but pause longer every 20 items to avoid rate limits
      if ((ui + 1) % 20 === 0) {
        await sleep(1000);
      } else {
        await sleep(100);
      }
    }
    if (updateErrors > 0) console.log(`${updateErrors} update errors`);

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
      notes: `Synced from neob HQ (location ${hqLocationId}). ${skipped} unchanged, ${migrated} SKU migrations.`,
    });

    return Response.json({
      success: true,
      hq_location: { id: hqLocationId, name: hqLocation.name },
      total_variants: allVariants.length,
      updated,
      created,
      skipped,
      migrated,
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