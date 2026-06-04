import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Iterates all approved SKUAlias records and merges the underlying Inventory pairs
 * (primary_sku keeper, alias_sku removed). Mirrors the logic in mergeTwoInventoryItems
 * so it stays a single self-contained function (no local imports allowed).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const fillIfMissing = (k, r) => (k === undefined || k === null || k === '' || k === 0 ? r : k);

    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit) || 25; // process in chunks to avoid rate limits
    const skip = Number(body?.skip) || 0;

    const aliases = await base44.asServiceRole.entities.SKUAlias.filter({ status: 'approved' });
    const batch = aliases.slice(skip, skip + limit);

    // Fetch recipes ONCE up front; keep a mutable in-memory copy as we patch them.
    let allRecipes = await base44.asServiceRole.entities.Recipe.filter({});

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    let merged = 0;
    let skippedNoPair = 0;
    let skippedSameRecord = 0;
    let failed = 0;
    const details = [];

    for (const alias of batch) {
      try {
        const [keeperItems, removedItems] = await Promise.all([
          base44.asServiceRole.entities.Inventory.filter({ sku: alias.primary_sku }),
          base44.asServiceRole.entities.Inventory.filter({ sku: alias.alias_sku }),
        ]);
        const keeper = keeperItems?.[0];
        const removed = removedItems?.[0];

        if (!keeper || !removed) {
          skippedNoPair++;
          continue;
        }
        if (keeper.id === removed.id) {
          skippedSameRecord++;
          continue;
        }

        const mergedQty = (Number(keeper.quantity) || 0) + (Number(removed.quantity) || 0);
        const mergedLots = [...(keeper.lot_numbers || []), ...(removed.lot_numbers || [])];

        const updateData = {
          quantity: mergedQty,
          lot_numbers: mergedLots,
          material_type: fillIfMissing(keeper.material_type, removed.material_type),
          supplier: fillIfMissing(keeper.supplier, removed.supplier),
          supplier_sku: fillIfMissing(keeper.supplier_sku, removed.supplier_sku),
          cost_per_unit: fillIfMissing(keeper.cost_per_unit, removed.cost_per_unit),
          lead_time_days: fillIfMissing(keeper.lead_time_days, removed.lead_time_days),
          location: fillIfMissing(keeper.location, removed.location),
          reorder_point: fillIfMissing(keeper.reorder_point, removed.reorder_point),
          reorder_qty: fillIfMissing(keeper.reorder_qty, removed.reorder_qty),
          component_photo: fillIfMissing(keeper.component_photo, removed.component_photo),
          notes: [keeper.notes, `Merged from ${removed.sku} (${removed.name}) on ${new Date().toISOString().slice(0, 10)}`]
            .filter(Boolean).join(' | '),
        };

        await base44.asServiceRole.entities.Inventory.update(keeper.id, updateData);

        // Update Recipe ingredients / packaging referencing the removed SKU
        // (use the in-memory recipe list to avoid re-fetching on every iteration)
        for (let i = 0; i < allRecipes.length; i++) {
          const recipe = allRecipes[i];
          let changed = false;
          const newIngredients = (recipe.ingredients || []).map(ing => {
            if (ing.sku === removed.sku) { changed = true; return { ...ing, sku: keeper.sku, material: keeper.name }; }
            return ing;
          });
          const newPackaging = (recipe.packaging || []).map(pkg => {
            if (pkg.sku === removed.sku) { changed = true; return { ...pkg, sku: keeper.sku, name: keeper.name }; }
            return pkg;
          });
          if (changed) {
            await base44.asServiceRole.entities.Recipe.update(recipe.id, {
              ingredients: newIngredients,
              packaging: newPackaging,
            });
            allRecipes[i] = { ...recipe, ingredients: newIngredients, packaging: newPackaging };
          }
        }

        await base44.asServiceRole.entities.Inventory.delete(removed.id);
        merged++;
        details.push({ primary_sku: keeper.sku, alias_sku: removed.sku, merged_quantity: mergedQty });
        await sleep(800); // throttle hard after a real merge
      } catch (err) {
        failed++;
        details.push({ primary_sku: alias.primary_sku, alias_sku: alias.alias_sku, error: err.message });
        if (err?.message?.includes('Rate limit')) await sleep(5000);
      }
      await sleep(100); // base throttle between every iteration
    }

    const next_skip = skip + batch.length;
    const has_more = next_skip < aliases.length;
    return Response.json({
      success: true,
      total_approved_aliases: aliases.length,
      processed_this_run: batch.length,
      next_skip,
      has_more,
      merged,
      skipped_no_pair: skippedNoPair,
      skipped_same_record: skippedSameRecord,
      failed,
      details,
    });
  } catch (error) {
    console.error('mergeAllApprovedAliasInventory error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});