import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Merge two specific Inventory items into one.
 * Payload: { keep_id: string, remove_id: string }
 * - Sums quantities
 * - Merges lot_numbers arrays
 * - Copies over non-null fields from the removed item if keeper is missing them
 * - Adds an alias note to keeper.notes
 * - Updates Recipe ingredients/packaging that reference the removed SKU
 * - Creates a SKUAlias record so analytics/forecasting still resolves the old SKU
 * - Deletes the removed Inventory item
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { keep_id, remove_id } = await req.json();
        if (!keep_id || !remove_id || keep_id === remove_id) {
            return Response.json({ error: 'Invalid payload: keep_id and remove_id required and must differ' }, { status: 400 });
        }

        const [keeper, removed] = await Promise.all([
            base44.entities.Inventory.get(keep_id),
            base44.entities.Inventory.get(remove_id),
        ]);

        if (!keeper || !removed) {
            return Response.json({ error: 'One or both items not found' }, { status: 404 });
        }

        // Build merged record
        const mergedQty = (Number(keeper.quantity) || 0) + (Number(removed.quantity) || 0);
        const mergedLots = [...(keeper.lot_numbers || []), ...(removed.lot_numbers || [])];

        const fillIfMissing = (k, r) => (k === undefined || k === null || k === '' || k === 0 ? r : k);
        const updateData = {
            quantity: mergedQty,
            lot_numbers: mergedLots,
            // Preserve keeper's identity but fill gaps from removed
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

        await base44.asServiceRole.entities.Inventory.update(keep_id, updateData);

        // Update Recipe ingredients / packaging that reference the removed SKU
        let recipesUpdated = 0;
        const recipes = await base44.asServiceRole.entities.Recipe.filter({});
        for (const recipe of recipes) {
            let changed = false;
            const newIngredients = (recipe.ingredients || []).map(ing => {
                if (ing.sku === removed.sku) {
                    changed = true;
                    return { ...ing, sku: keeper.sku, material: keeper.name };
                }
                return ing;
            });
            const newPackaging = (recipe.packaging || []).map(pkg => {
                if (pkg.sku === removed.sku) {
                    changed = true;
                    return { ...pkg, sku: keeper.sku, name: keeper.name };
                }
                return pkg;
            });
            if (changed) {
                await base44.asServiceRole.entities.Recipe.update(recipe.id, {
                    ingredients: newIngredients,
                    packaging: newPackaging,
                });
                recipesUpdated++;
            }
        }

        // Create SKUAlias so the removed SKU still resolves in demand/forecast pipelines
        try {
            await base44.asServiceRole.entities.SKUAlias.create({
                primary_sku: keeper.sku,
                alias_sku: removed.sku,
                product_name: keeper.name,
                reason: `Merged duplicate: ${removed.name}`,
                status: 'approved',
                reviewed_by: user.full_name || user.email,
                reviewed_at: new Date().toISOString(),
            });
        } catch (e) {
            // Non-fatal if alias already exists
            console.warn('SKUAlias create failed (likely already exists):', e.message);
        }

        // Delete the removed Inventory record
        await base44.asServiceRole.entities.Inventory.delete(remove_id);

        return Response.json({
            success: true,
            message: `Merged ${removed.sku} into ${keeper.sku}. ${recipesUpdated} recipe(s) updated.`,
            kept_sku: keeper.sku,
            removed_sku: removed.sku,
            merged_quantity: mergedQty,
            recipes_updated: recipesUpdated,
        });
    } catch (error) {
        console.error('mergeTwoInventoryItems error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});