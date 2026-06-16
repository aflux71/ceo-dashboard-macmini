import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Map of Shopify location name -> canonical Base44 store name used in the portal & DemandSummary.byLocation.
// Keys are matched case-insensitively against the Shopify location.name.
const LOCATION_MAP = {
  'neob hq': 'neob HQ',
  'neob e-commerce': 'neob E-Commerce',
  'ecommerce warehouse': 'neob E-Commerce',
  'neob bracebridge': 'neob Bracebridge',
  'neob elora': 'neob Elora',
  'neob flower farm': 'neob Flower Farm',
  'neob queen street': 'neob Queen Street',
  'neob stratford': 'neob Stratford',
};

// The "primary" location whose quantity goes into Inventory.quantity (used as HQ stock).
const PRIMARY_LOCATION = 'neob HQ';

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

    // Step 1: Fetch ALL locations and map them to canonical names
    const locRes = await fetch(`https://${store}/admin/api/2026-01/locations.json`, { headers });
    const locData = await locRes.json();
    const locations = locData.locations || [];

    // locationIdToName: shopify location id -> canonical Base44 store name
    const locationIdToName = {};
    const matchedLocations = [];
    for (const loc of locations) {
      const key = (loc.name || '').trim().toLowerCase();
      const canonical = LOCATION_MAP[key];
      if (canonical) {
        locationIdToName[String(loc.id)] = canonical;
        matchedLocations.push({ id: loc.id, shopify_name: loc.name, canonical });
      }
    }

    const hqEntry = matchedLocations.find(l => l.canonical === PRIMARY_LOCATION);
    if (!hqEntry) {
      return Response.json({
        error: `Could not find "${PRIMARY_LOCATION}" location in Shopify`,
        available_locations: locations.map(l => ({ id: l.id, name: l.name })),
      }, { status: 400 });
    }
    const allLocationIds = Object.keys(locationIdToName);

    // Step 2: Fetch all active product variants
    const allVariants = [];
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

    // Step 3: Fetch inventory levels for ALL mapped locations
    // levelsByItem: inventory_item_id -> { [canonical location name]: qty }
    const levelsByItem = {};
    const inventoryItemIds = allVariants.map(v => v.inventory_item_id);
    const locationIdsParam = allLocationIds.join(',');

    for (let i = 0; i < inventoryItemIds.length; i += 50) {
      const batch = inventoryItemIds.slice(i, i + 50);
      const levelsUrl = `https://${store}/admin/api/2026-01/inventory_levels.json?inventory_item_ids=${batch.join(',')}&location_ids=${locationIdsParam}&limit=250`;
      const res = await fetch(levelsUrl, { headers });
      if (!res.ok) {
        console.error(`Inventory levels fetch failed: ${res.status} for batch starting at ${i}`);
        continue;
      }
      const data = await res.json();
      for (const level of data.inventory_levels || []) {
        const itemId = String(level.inventory_item_id);
        const locName = locationIdToName[String(level.location_id)];
        if (!locName) continue;
        if (!levelsByItem[itemId]) levelsByItem[itemId] = {};
        levelsByItem[itemId][locName] = Number(level.available) || 0;
      }
      if (i + 50 < inventoryItemIds.length) await sleep(500);
    }
    console.log(`Fetched per-location inventory for ${Object.keys(levelsByItem).length} items across ${allLocationIds.length} locations`);

    // Step 4: Load existing Inventory records
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
    const inventoryBySku = {};
    for (const item of existingInventory) {
      if (item.sku) inventoryBySku[item.sku.trim()] = item;
      if (item.supplier_sku) inventoryBySku[item.supplier_sku.trim()] = item;
    }

    // Step 5: Load approved SKU mappings
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
    const skuAliasMap = {};
    for (const m of skuMappings) {
      if (m.old_sku) skuAliasMap[m.old_sku.trim()] = m.new_sku?.trim();
      if (m.new_sku) skuAliasMap[m.new_sku.trim()] = m.old_sku?.trim();
    }

    const now = new Date().toISOString();
    let updated = 0;
    let created = 0;
    let migrated = 0;
    const toCreate = [];
    const toUpdate = [];
    let skipped = 0;

    // Helper to merge per-location stock into Inventory.notes (preserves any user notes)
    const STOCK_TAG_START = '<!--SHOPIFY_STOCK:';
    const STOCK_TAG_END = ':END-->';
    const buildNotes = (existingNotes, perLocation) => {
      const userNotes = (existingNotes || '').replace(
        new RegExp(`${STOCK_TAG_START}[\\s\\S]*?${STOCK_TAG_END}`),
        ''
      ).trim();
      const payload = JSON.stringify({ updatedAt: now, byLocation: perLocation });
      return `${userNotes ? userNotes + '\n\n' : ''}${STOCK_TAG_START}${payload}${STOCK_TAG_END}`;
    };

    for (const variant of allVariants) {
      const perLocation = levelsByItem[variant.inventory_item_id] || {};
      const primaryQty = Number(perLocation[PRIMARY_LOCATION] || 0);

      let existing = inventoryBySku[variant.sku] || inventoryBySku[variant.variant_sku];
      if (!existing) {
        const aliasedSku = skuAliasMap[variant.sku] || skuAliasMap[variant.variant_sku];
        if (aliasedSku) existing = inventoryBySku[aliasedSku];
      }

      if (existing) {
        const needsSkuMigration = variant.barcode && existing.sku !== variant.barcode;
        const newNotes = buildNotes(existing.notes, perLocation);
        const needsUpdate =
          existing.quantity !== primaryQty ||
          existing.name !== variant.name ||
          existing.notes !== newNotes ||
          needsSkuMigration;

        if (needsUpdate) {
          const updateData = {
            id: existing.id,
            quantity: primaryQty,
            name: variant.name,
            notes: newNotes,
          };
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
          quantity: primaryQty,
          type: 'finished_product',
          unit: 'units',
          location: PRIMARY_LOCATION,
          notes: buildNotes('', perLocation),
          last_shopify_sync: now,
        });
      }
    }

    // Bulk create
    for (let i = 0; i < toCreate.length; i += 20) {
      const chunk = toCreate.slice(i, i + 20);
      await base44.asServiceRole.entities.Inventory.bulkCreate(chunk);
      created += chunk.length;
      if (i + 20 < toCreate.length) await sleep(500);
    }

    // Updates with retry — slower throttle to avoid 429s, with a time budget so we
    // can complete in repeat passes if there's too much to do in one go.
    let updateErrors = 0;
    const TIME_BUDGET_MS = 50_000; // leave room before the 60s edge timeout
    let deferred = 0;
    for (let ui = 0; ui < toUpdate.length; ui++) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        deferred = toUpdate.length - ui;
        break;
      }
      const item = toUpdate[ui];
      let retries = 4;
      let backoff = 1500;
      while (retries > 0) {
        try {
          const payload = {
            name: item.name,
            quantity: item.quantity,
            notes: item.notes,
            location: PRIMARY_LOCATION,
            last_shopify_sync: now,
          };
          if (item.sku) payload.sku = item.sku;
          if (item.supplier_sku) payload.supplier_sku = item.supplier_sku;
          await base44.asServiceRole.entities.Inventory.update(item.id, payload);
          updated++;
          break;
        } catch (e) {
          retries--;
          if (retries === 0) {
            console.error(`Failed to update ${item.id}: ${e.message}`);
            updateErrors++;
          } else {
            await sleep(backoff);
            backoff = Math.min(backoff * 2, 8000);
          }
        }
      }
      await sleep(350); // steady throttle
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    await base44.asServiceRole.entities.SyncLog.create({
      sync_type: 'shopify_inventory',
      status: 'success',
      records_processed: allVariants.length,
      records_created: created,
      records_updated: updated,
      duration_seconds: duration,
      triggered_by: user.email,
      notes: `Synced ${matchedLocations.length} locations: ${matchedLocations.map(l => l.canonical).join(', ')}. ${skipped} unchanged, ${migrated} SKU migrations, ${updateErrors} errors, ${deferred} deferred (rerun to finish).`,
    });

    return Response.json({
      success: true,
      matched_locations: matchedLocations,
      total_variants: allVariants.length,
      updated,
      created,
      skipped,
      migrated,
      deferred,
      duration_seconds: duration,
    });

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
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