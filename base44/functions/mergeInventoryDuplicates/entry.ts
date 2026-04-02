import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

  // Fetch all inventory
  const allItems = await base44.asServiceRole.entities.Inventory.list('-created_date', 2000);

  // Group by normalized SKU
  const groups = {};
  for (const item of allItems) {
    const key = (item.sku || '').trim().toLowerCase();
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  // Only process groups with duplicates
  const dupGroups = Object.values(groups).filter(g => g.length >= 2);

  if (dupGroups.length === 0) {
    return Response.json({ success: true, message: 'No duplicate SKUs found.', mergedGroups: 0, deletedRecords: 0 });
  }

  let mergedCount = 0;
  let deletedCount = 0;

  // Process in batches of 10 to avoid overload
  const BATCH_SIZE = 10;
  for (let i = 0; i < dupGroups.length; i += BATCH_SIZE) {
    const batch = dupGroups.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (items) => {
      // Keep the record with most filled fields
      items.sort((a, b) => {
        const scoreA = Object.values(a).filter(v => v !== null && v !== undefined && v !== '').length;
        const scoreB = Object.values(b).filter(v => v !== null && v !== undefined && v !== '').length;
        return scoreB - scoreA;
      });

      const primary = items[0];
      const duplicates = items.slice(1);

      const totalExtraQty = duplicates.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);

      const allLots = [...(primary.lot_numbers || [])];
      for (const dup of duplicates) {
        for (const lot of (dup.lot_numbers || [])) {
          allLots.push(lot);
        }
      }

      // Update primary
      await base44.asServiceRole.entities.Inventory.update(primary.id, {
        quantity: (Number(primary.quantity) || 0) + totalExtraQty,
        ...(allLots.length > 0 ? { lot_numbers: allLots } : {}),
      });

      // Delete duplicates in parallel
      await Promise.all(duplicates.map(dup => base44.asServiceRole.entities.Inventory.delete(dup.id)));

      mergedCount++;
      deletedCount += duplicates.length;
    }));
  }

  return Response.json({
    success: true,
    message: `Merged ${mergedCount} duplicate SKU groups, deleted ${deletedCount} duplicate records.`,
    mergedGroups: mergedCount,
    deletedRecords: deletedCount,
  });
});