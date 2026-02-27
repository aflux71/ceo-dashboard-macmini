import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Use service role for automated checks
    const inventory = await base44.asServiceRole.entities.Inventory.filter({});
    const requisitions = await base44.asServiceRole.entities.PurchaseRequisition.filter({ status: "pending" });
    
    // Get SKUs that already have pending requisitions
    const pendingSkus = new Set(requisitions.map(r => r.item_sku));
    
    // Find low stock items without pending requisitions
    const lowStockItems = inventory.filter(item => {
      if (!item.reorder_point || item.quantity > item.reorder_point) return false;
      if (pendingSkus.has(item.sku)) return false;
      // Only raw materials and packaging
      if (item.type !== 'raw_material' && item.type !== 'packaging') return false;
      return true;
    });

    const created = [];
    
    for (const item of lowStockItems) {
      // Determine urgency based on stock level
      let urgency = "medium";
      if (item.quantity <= 0) {
        urgency = "critical";
      } else if (item.quantity <= item.reorder_point * 0.25) {
        urgency = "critical";
      } else if (item.quantity <= item.reorder_point * 0.5) {
        urgency = "high";
      }

      const requisition = await base44.asServiceRole.entities.PurchaseRequisition.create({
        item_sku: item.sku,
        item_name: item.name,
        current_qty: item.quantity,
        suggested_qty: item.reorder_qty || Math.ceil(item.reorder_point * 2),
        urgency: urgency,
        status: "pending",
        requested_by: "System (Auto)",
        requested_at: new Date().toISOString(),
        notes: `Auto-created: Stock (${item.quantity}) below reorder point (${item.reorder_point})`
      });
      
      created.push({
        sku: item.sku,
        name: item.name,
        urgency: urgency
      });
    }

    return Response.json({
      success: true,
      checked: inventory.length,
      lowStockFound: lowStockItems.length,
      requisitionsCreated: created.length,
      created: created
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});