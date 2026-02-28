import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Generate all snapshots
    const [overview, production, inventory, financials, alerts] = await Promise.all([
      generateSnapshot(base44, 'overview'),
      generateSnapshot(base44, 'production'),
      generateSnapshot(base44, 'inventory'),
      generateSnapshot(base44, 'financials'),
      generateSnapshot(base44, 'alerts'),
    ]);

    // Save snapshots to AppSettings
    const snapshots = [
      { type: 'overview', data: overview },
      { type: 'production', data: production },
      { type: 'inventory', data: inventory },
      { type: 'financials', data: financials },
      { type: 'alerts', data: alerts },
    ];

    for (const snapshot of snapshots) {
      const existing = await base44.entities.AppSettings.filter({
        key: `kpi_snapshot_${snapshot.type}`
      });

      const data = {
        ...snapshot.data,
        mode: 'cached',
        cached_at: new Date().toISOString(),
      };

      if (existing.length > 0) {
        await base44.entities.AppSettings.update(existing[0].id, {
          value: JSON.stringify(data),
        });
      } else {
        await base44.entities.AppSettings.create({
          key: `kpi_snapshot_${snapshot.type}`,
          value: JSON.stringify(data),
          description: `Cached KPI snapshot for ${snapshot.type}`,
        });
      }
    }

    return Response.json({
      success: true,
      message: 'KPI snapshots generated and cached',
      snapshotsCreated: snapshots.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function generateSnapshot(base44, type) {
  if (type === 'overview') {
    const [production, inventory, financials, alerts] = await Promise.all([
      generateSnapshot(base44, 'production'),
      generateSnapshot(base44, 'inventory'),
      generateSnapshot(base44, 'financials'),
      generateSnapshot(base44, 'alerts'),
    ]);
    return { production, inventory, financials, alerts };
  }

  if (type === 'production') {
    const batches = await base44.entities.Batch.list('-updated_date', 100);
    const suggestions = await base44.entities.ForecastSuggestion.filter({ status: { $in: ['scheduled', 'in_progress'] } });

    const totalBatches = batches.length;
    const completedBatches = batches.filter(b => b.status === 'approved' || b.status === 'added_to_inventory').length;
    const onHold = batches.filter(b => b.status === 'on_hold').length;
    const inProgress = batches.filter(b => b.status === 'started' || b.status === 'pending_qc').length;

    const lineUtilization = ((inProgress / 2) * 100).toFixed(1);

    const completedWithTimes = batches
      .filter(b => b.approved_date && b.production_date)
      .map(b => {
        const start = new Date(b.production_date);
        const end = new Date(b.approved_date);
        return (end - start) / (1000 * 60 * 60);
      });
    const avgBatchHours = completedWithTimes.length > 0
      ? (completedWithTimes.reduce((a, b) => a + b, 0) / completedWithTimes.length).toFixed(1)
      : 'N/A';

    return {
      totalBatches,
      completedBatches,
      completionRate: totalBatches > 0 ? ((completedBatches / totalBatches) * 100).toFixed(1) + '%' : '0%',
      inProgress,
      onHold,
      lineUtilization: lineUtilization + '%',
      avgBatchHours,
      scheduledItems: suggestions.length,
    };
  }

  if (type === 'inventory') {
    const inventory = await base44.entities.Inventory.list();
    const lowStock = inventory.filter(i => i.quantity <= i.reorder_point);
    const criticalStock = inventory.filter(i => i.quantity <= (i.reorder_point * 0.5));
    const totalValue = inventory.reduce((sum, i) => sum + ((i.quantity || 0) * (i.cost_per_unit || 0)), 0);

    return {
      totalSku: inventory.length,
      lowStockCount: lowStock.length,
      criticalStockCount: criticalStock.length,
      totalInventoryValue: totalValue.toFixed(2),
      lowStockItems: lowStock.slice(0, 10).map(i => ({
        sku: i.sku,
        name: i.name,
        current: i.quantity,
        reorderPoint: i.reorder_point,
        status: i.quantity <= (i.reorder_point * 0.5) ? 'critical' : 'low'
      })),
    };
  }

  if (type === 'financials') {
    const [batches, purchaseOrders] = await Promise.all([
      base44.entities.Batch.list('-updated_date', 100),
      base44.entities.PurchaseOrder.list('-order_date', 50),
    ]);

    const totalPoCost = purchaseOrders
      .filter(po => po.status !== 'cancelled')
      .reduce((sum, po) => sum + (po.total || 0), 0);

    const batchesWithCost = batches.filter(b => b.status === 'approved' || b.status === 'added_to_inventory');
    const avgCostPerBatch = batchesWithCost.length > 0
      ? (totalPoCost / batchesWithCost.length).toFixed(2)
      : '0.00';

    const openPos = purchaseOrders.filter(po => po.status === 'draft' || po.status === 'submitted' || po.status === 'confirmed');

    return {
      totalPoValue: totalPoCost.toFixed(2),
      avgCostPerBatch,
      openPoCount: openPos.length,
      openPoValue: openPos.reduce((sum, po) => sum + (po.total || 0), 0).toFixed(2),
      completedBatches: batchesWithCost.length,
    };
  }

  if (type === 'alerts') {
    const [batches, inventory, repairs, requisitions] = await Promise.all([
      base44.entities.Batch.filter({ status: 'on_hold' }),
      base44.entities.Inventory.list(),
      base44.entities.EquipmentRepair.filter({ status: 'new_submission' }).catch(() => []),
      base44.entities.PurchaseRequisition.filter({ status: 'pending' }).catch(() => []),
    ]);

    const lowStock = inventory.filter(i => i.quantity <= i.reorder_point);
    const criticalStock = inventory.filter(i => i.quantity <= (i.reorder_point * 0.5));

    return {
      alerts: [
        {
          type: 'production',
          severity: batches.length > 0 ? 'warning' : 'info',
          count: batches.length,
          message: `${batches.length} batches on hold`,
        },
        {
          type: 'inventory_critical',
          severity: criticalStock.length > 0 ? 'critical' : 'info',
          count: criticalStock.length,
          message: `${criticalStock.length} SKUs at critical stock levels`,
        },
        {
          type: 'inventory_low',
          severity: lowStock.length > 0 ? 'warning' : 'info',
          count: lowStock.length,
          message: `${lowStock.length} SKUs below reorder point`,
        },
        {
          type: 'equipment',
          severity: repairs.length > 0 ? 'warning' : 'info',
          count: repairs.length,
          message: `${repairs.length} equipment repairs pending`,
        },
        {
          type: 'requisitions',
          severity: requisitions.length > 0 ? 'warning' : 'info',
          count: requisitions.length,
          message: `${requisitions.length} purchase requisitions pending approval`,
        },
      ],
    };
  }
}