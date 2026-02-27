import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all labels that need reordering
    const labels = await base44.asServiceRole.entities.Label.list();
    const lowStockLabels = labels.filter(l => 
      l.active !== false && 
      l.current_quantity <= l.reorder_point &&
      l.supplier_id
    );

    if (lowStockLabels.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'No labels need reordering',
        orders_created: 0 
      });
    }

    // Group labels by supplier
    const labelsBySupplier = {};
    for (const label of lowStockLabels) {
      if (!labelsBySupplier[label.supplier_id]) {
        labelsBySupplier[label.supplier_id] = {
          supplier_id: label.supplier_id,
          supplier_name: label.supplier_name,
          labels: []
        };
      }
      labelsBySupplier[label.supplier_id].labels.push(label);
    }

    // Check for existing pending POs to avoid duplicates
    const existingPOs = await base44.asServiceRole.entities.LabelPurchaseOrder.filter({
      status: { $in: ['pending_approval', 'approved', 'submitted'] }
    });

    const existingLabelIds = new Set();
    existingPOs.forEach(po => {
      po.items?.forEach(item => {
        if (item.label_id) existingLabelIds.add(item.label_id);
      });
    });

    // Generate PO number
    const allPOs = await base44.asServiceRole.entities.LabelPurchaseOrder.list();
    const year = new Date().getFullYear();
    const poCount = allPOs.filter(po => po.po_number?.startsWith(`LPO-${year}`)).length;

    const ordersCreated = [];

    for (const supplierId of Object.keys(labelsBySupplier)) {
      const supplierData = labelsBySupplier[supplierId];
      
      // Filter out labels that already have pending orders
      const labelsToOrder = supplierData.labels.filter(l => !existingLabelIds.has(l.id));
      
      if (labelsToOrder.length === 0) continue;

      // Calculate lead time (use max lead time from labels or default 14 days)
      const maxLeadTime = Math.max(...labelsToOrder.map(l => l.lead_time_days || 14));
      const expectedDelivery = new Date();
      expectedDelivery.setDate(expectedDelivery.getDate() + maxLeadTime);

      // Build order items
      const items = labelsToOrder.map(label => ({
        label_id: label.id,
        label_name: label.name,
        label_sku: label.sku,
        quantity: label.reorder_qty || Math.max(100, (label.reorder_point - label.current_quantity) * 2),
        unit_cost: label.cost_per_unit || 0,
        total_cost: (label.reorder_qty || Math.max(100, (label.reorder_point - label.current_quantity) * 2)) * (label.cost_per_unit || 0)
      }));

      const subtotal = items.reduce((sum, item) => sum + item.total_cost, 0);
      const poNumber = `LPO-${year}-${String(poCount + ordersCreated.length + 1).padStart(3, '0')}`;

      const newPO = await base44.asServiceRole.entities.LabelPurchaseOrder.create({
        po_number: poNumber,
        supplier_id: supplierId,
        supplier_name: supplierData.supplier_name,
        status: 'pending_approval',
        items,
        subtotal,
        total: subtotal,
        expected_delivery_date: expectedDelivery.toISOString().split('T')[0],
        auto_generated: true,
        generation_reason: `Low stock alert: ${labelsToOrder.length} label(s) below reorder point`
      });

      ordersCreated.push(newPO);
    }

    return Response.json({
      success: true,
      message: `Created ${ordersCreated.length} purchase order(s)`,
      orders_created: ordersCreated.length,
      orders: ordersCreated
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});