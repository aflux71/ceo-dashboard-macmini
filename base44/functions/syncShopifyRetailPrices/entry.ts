// Syncs retail_price on Inventory items from Shopify product variant prices.
// Matches by SKU (barcode preferred, then variant SKU, then approved SKU aliases),
// only updates finished_product inventory items, and only writes when the price
// actually changes.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);

    // Allow admin invocation OR scheduled (no-user) invocation from automations.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const store = Deno.env.get('SHOPIFY_STORE');
    const token = Deno.env.get('SHOPIFY_TOKEN');
    if (!store || !token) {
      return Response.json({ error: 'Missing SHOPIFY_STORE or SHOPIFY_TOKEN secrets' }, { status: 500 });
    }

    const headers = { 'X-Shopify-Access-Token': token };

    // 1. Fetch all active product variants with prices (paginated)
    const variants = [];
    let url = `https://${store}/admin/api/2026-01/products.json?limit=250&fields=id,title,status,variants`;

    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const body = await res.text();
        return Response.json({ error: `Shopify API error: ${res.status}`, detail: body }, { status: 500 });
      }
      const data = await res.json();
      for (const product of data.products || []) {
        if (product.status !== 'active') continue;
        for (const variant of product.variants || []) {
          const price = Number(variant.price);
          if (!price || price <= 0) continue;

          const variantSku = variant.sku ? variant.sku.trim() : null;
          const barcode = variant.barcode ? variant.barcode.trim() : null;
          if (!variantSku && !barcode) continue;

          variants.push({
            sku: barcode || variantSku,
            variant_sku: variantSku,
            barcode,
            price,
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
    console.log(`Fetched ${variants.length} priced variants from Shopify`);

    // 2. Build latest-price-by-sku map (last write wins if duplicates)
    const priceBySku = new Map();
    for (const v of variants) {
      if (v.barcode) priceBySku.set(v.barcode, v.price);
      if (v.variant_sku) priceBySku.set(v.variant_sku, v.price);
    }

    // 3. Load only finished_product inventory items
    const inventory = await base44.asServiceRole.entities.Inventory.filter(
      { type: 'finished_product' }, '-updated_date', 5000
    );
    console.log(`Loaded ${inventory.length} finished_product inventory items`);

    // 4. Load approved SKU aliases for fallback matching
    const skuMappings = await base44.asServiceRole.entities.SKUMapping.filter(
      { status: 'approved' }, '-created_date', 1000
    );
    const skuAliasMap = {};
    for (const m of skuMappings) {
      if (m.old_sku) skuAliasMap[m.old_sku.trim()] = m.new_sku?.trim();
      if (m.new_sku) skuAliasMap[m.new_sku.trim()] = m.old_sku?.trim();
    }

    // 5. Identify items that need updating
    const results = { updated: [], unchanged: 0, no_shopify_match: 0, errors: [] };
    const toUpdate = [];

    for (const inv of inventory) {
      const sku = (inv.sku || '').trim();
      const supplierSku = (inv.supplier_sku || '').trim();
      if (!sku && !supplierSku) continue;

      let shopifyPrice =
        priceBySku.get(sku) ??
        priceBySku.get(supplierSku) ??
        priceBySku.get(skuAliasMap[sku]) ??
        priceBySku.get(skuAliasMap[supplierSku]);

      if (!shopifyPrice) {
        results.no_shopify_match++;
        continue;
      }

      const current = Number(inv.retail_price) || 0;
      const newPrice = Math.round(shopifyPrice * 100) / 100;
      if (Math.abs(current - newPrice) < 0.01) {
        results.unchanged++;
        continue;
      }
      toUpdate.push({ inv, sku: sku || supplierSku, current, newPrice });
    }

    // 6. Run updates serially with retry on rate limits
    for (let ui = 0; ui < toUpdate.length; ui++) {
      const { inv, sku, current, newPrice } = toUpdate[ui];
      let retries = 3;
      while (retries > 0) {
        try {
          await base44.asServiceRole.entities.Inventory.update(inv.id, { retail_price: newPrice });
          results.updated.push({
            sku,
            name: inv.name,
            old_price: current,
            new_price: newPrice,
            delta: Math.round((newPrice - current) * 100) / 100,
          });
          break;
        } catch (err) {
          retries--;
          const isRateLimit = err.status === 429 || /rate limit/i.test(err.message || '');
          if (retries === 0) {
            results.errors.push({ sku, error: err.message });
          } else {
            await sleep(isRateLimit ? 3000 : 1000);
          }
        }
      }
      // Throttle: pause longer every 20 to stay under Base44 rate limits
      if ((ui + 1) % 20 === 0) await sleep(1000);
      else await sleep(100);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    const summary = {
      started_at: new Date(startTime).toISOString(),
      duration_seconds: duration,
      shopify_variants_scanned: variants.length,
      inventory_items_checked: inventory.length,
      updated_count: results.updated.length,
      unchanged_count: results.unchanged,
      no_shopify_match_count: results.no_shopify_match,
      error_count: results.errors.length,
    };

    // Log to SyncLog for audit trail
    try {
      await base44.asServiceRole.entities.SyncLog.create({
        sync_type: 'shopify_retail_prices',
        status: results.errors.length === 0 ? 'success' : 'partial',
        records_processed: inventory.length,
        records_updated: results.updated.length,
        duration_seconds: duration,
        triggered_by: user?.email || 'scheduled',
        notes: `${results.updated.length} prices updated, ${results.unchanged} unchanged, ${results.no_shopify_match} no Shopify match`,
      });
    } catch (e) {
      console.error('SyncLog write failed:', e.message);
    }

    console.log('Price sync summary:', summary);

    return Response.json({
      success: true,
      summary,
      updated: results.updated,
      errors: results.errors,
    });
  } catch (error) {
    console.error('syncShopifyRetailPrices failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});