import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const QC_ROLES = ['owner', 'admin', 'production_lead', 'qc'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!QC_ROLES.includes(user.role)) {
    return Response.json({ error: 'Forbidden: QC role or higher required' }, { status: 403 });
  }

  const body = await req.json();
  const { batch_id, actual_yield_units, deviation_notes, apply_material_override } = body;

  if (!batch_id || actual_yield_units == null) {
    return Response.json({ error: 'batch_id and actual_yield_units are required' }, { status: 400 });
  }
  if (!deviation_notes || deviation_notes.trim().length === 0) {
    return Response.json({ error: 'deviation_notes are required for quantity overrides' }, { status: 400 });
  }

  const batches = await base44.asServiceRole.entities.Batch.filter({ batch_id });
  if (!batches || batches.length === 0) {
    return Response.json({ error: 'Batch not found' }, { status: 404 });
  }
  const batch = batches[0];
  const originalQty = batch.quantity;

  await base44.asServiceRole.entities.Batch.update(batch.id, {
    actual_yield_units,
    deviation_notes: deviation_notes.trim(),
    qty_override_by: user.full_name || user.email,
    qty_override_at: new Date().toISOString(),
  });

  if (apply_material_override && batch.recipe_id) {
    const recipes = await base44.asServiceRole.entities.Recipe.filter({ id: batch.recipe_id });
    const recipe = recipes && recipes[0];

    if (recipe && recipe.ingredients && originalQty > 0) {
      const batchSize = recipe.batch_size || originalQty;
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.sku) continue;
        const invItems = await base44.asServiceRole.entities.Inventory.filter({ sku: ingredient.sku });
        if (!invItems || invItems.length === 0) continue;
        const invItem = invItems[0];
        const originalDeduction = ingredient.qty * (originalQty / batchSize);
        const newDeduction = ingredient.qty * (actual_yield_units / batchSize);
        const difference = newDeduction - originalDeduction;
        const newQty = Math.max(0, (invItem.quantity || 0) - difference);
        await base44.asServiceRole.entities.Inventory.update(invItem.id, { quantity: newQty });
      }
    }
  }

  try {
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'qty_override',
      entity: 'Batch',
      entity_id: batch.id,
      performed_by: user.full_name || user.email,
      details: JSON.stringify({
        batch_id,
        original_qty: originalQty,
        actual_yield_units,
        deviation_notes,
        material_adjusted: !!apply_material_override,
      }),
      timestamp: new Date().toISOString(),
    });
  } catch (_e) {
    // audit log failure should not break the operation
  }

  return Response.json({
    success: true,
    message: apply_material_override
      ? 'Quantity overridden and raw materials adjusted'
      : 'Quantity overridden (no material adjustment)',
  });
});