// Syncs Inventory.cost_per_unit from the most recent received Purchase Order
// for each material SKU. Keeps profit analysis accurate without manual entry.
//
// Logic:
//   - Pull all POs with status 'received' or 'shipped' (latest cost is most accurate)
//   - For each SKU in items[], find the MOST RECENT PO (by received_date or order_date)
//     where that SKU appears with a unit_cost > 0
//   - Update Inventory.cost_per_unit ONLY if the value has changed (avoid noisy writes)
//
// Returns: { updated, skipped, missing, errors, summary }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow admin-only invocation OR scheduled (no-user) invocation from automations.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const startedAt = new Date().toISOString();

    // 1. Fetch all received / shipped POs (cost data is reliable once shipped)
    const pos = await base44.asServiceRole.entities.PurchaseOrder.filter({
      status: { $in: ['received', 'shipped'] }
    });

    // 2. Build a map: sku -> { unit_cost, po_number, date }
    //    Always keep the latest by date (received_date preferred, fallback to order_date)
    const latestCostBySku = new Map();
    for (const po of pos) {
      const poDate = po.received_date || po.order_date || po.created_date;
      if (!poDate) continue;
      const items = po.items || [];
      for (const item of items) {
        const sku = (item.sku || '').trim();
        const unitCost = Number(item.unit_cost);
        if (!sku || !unitCost || unitCost <= 0) continue;

        const existing = latestCostBySku.get(sku);
        if (!existing || new Date(poDate) > new Date(existing.date)) {
          latestCostBySku.set(sku, {
            unit_cost: unitCost,
            po_number: po.po_number,
            date: poDate,
            currency: po.currency || 'CAD',
          });
        }
      }
    }

    console.log(`Found latest costs for ${latestCostBySku.size} SKUs across ${pos.length} POs`);

    // 3. Fetch all Inventory items and update where cost differs
    const inventory = await base44.asServiceRole.entities.Inventory.list('-updated_date', 5000);

    const results = {
      updated: [],
      skipped_unchanged: 0,
      skipped_no_po_data: 0,
      errors: [],
    };

    for (const inv of inventory) {
      const sku = (inv.sku || '').trim();
      if (!sku) continue;

      const latest = latestCostBySku.get(sku);
      if (!latest) {
        results.skipped_no_po_data++;
        continue;
      }

      const current = Number(inv.cost_per_unit) || 0;
      // Round to 4 decimals for comparison to avoid float noise
      const newCost = Math.round(latest.unit_cost * 10000) / 10000;
      if (Math.abs(current - newCost) < 0.0001) {
        results.skipped_unchanged++;
        continue;
      }

      try {
        await base44.asServiceRole.entities.Inventory.update(inv.id, {
          cost_per_unit: newCost,
          currency: latest.currency,
        });
        results.updated.push({
          sku,
          name: inv.name,
          old_cost: current,
          new_cost: newCost,
          source_po: latest.po_number,
          source_date: latest.date,
          delta: Math.round((newCost - current) * 100) / 100,
        });
      } catch (err) {
        results.errors.push({ sku, error: err.message });
      }
    }

    const finishedAt = new Date().toISOString();

    const summary = {
      started_at: startedAt,
      finished_at: finishedAt,
      pos_scanned: pos.length,
      skus_with_po_data: latestCostBySku.size,
      inventory_items_checked: inventory.length,
      updated_count: results.updated.length,
      unchanged_count: results.skipped_unchanged,
      no_po_data_count: results.skipped_no_po_data,
      error_count: results.errors.length,
    };

    console.log('Cost sync summary:', summary);

    return Response.json({
      success: true,
      summary,
      updated: results.updated,
      errors: results.errors,
    });
  } catch (error) {
    console.error('syncCostsFromPurchaseOrders failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});