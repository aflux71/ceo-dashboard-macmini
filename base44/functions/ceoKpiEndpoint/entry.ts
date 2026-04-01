import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        },
      });
    }

    // API Key Authentication
    const authHeader = req.headers.get('authorization') || '';
    const apiKey = authHeader.replace('Bearer ', '').trim();
    const expectedKey = Deno.env.get('CEO_API_KEY');

    if (!apiKey || apiKey !== expectedKey) {
      return Response.json(
        { error: 'Unauthorized' },
        { 
          status: 401,
          headers: { 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint') || 'overview';
    const mode = url.searchParams.get('mode') || 'realtime'; // 'realtime' or 'cached'

    let data = {};

    if (endpoint === 'overview') {
      data = await getOverviewKpis(base44, mode);
    } else if (endpoint === 'production') {
      data = await getProductionKpis(base44, mode);
    } else if (endpoint === 'inventory') {
      data = await getInventoryKpis(base44, mode);
    } else if (endpoint === 'financials') {
      data = await getFinancialKpis(base44, mode);
    } else if (endpoint === 'alerts') {
      data = await getAlerts(base44, mode);
    }

    return Response.json(data, {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { 
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      }
    );
  }
});

async function getOverviewKpis(base44, mode) {
  if (mode === 'cached') {
    return await getSnapshot(base44, 'overview');
  }

  const [batches, inventory, purchaseOrders] = await Promise.all([
    base44.entities.Batch.list('-updated_date', 100),
    base44.entities.Inventory.list(),
    base44.entities.PurchaseOrder.list('-order_date', 50),
  ]);

  const production = getProductionKpis(base44, 'realtime');
  const inventory_alerts = getInventoryKpis(base44, 'realtime');
  const financials = getFinancialKpis(base44, 'realtime');

  return {
    timestamp: new Date().toISOString(),
    mode: 'realtime',
    production: await production,
    inventory_alerts: await inventory_alerts,
    financials: await financials,
  };
}

async function getProductionKpis(base44, mode) {
  if (mode === 'cached') {
    return await getSnapshot(base44, 'production');
  }

  const batches = await base44.entities.Batch.list('-updated_date', 100);
  const recipes = await base44.entities.Recipe.list();
  const suggestions = await base44.entities.ForecastSuggestion.filter({ status: { $in: ['scheduled', 'in_progress'] } });

  const totalBatches = batches.length;
  const completedBatches = batches.filter(b => b.status === 'approved' || b.status === 'added_to_inventory').length;
  const onHold = batches.filter(b => b.status === 'on_hold').length;
  const inProgress = batches.filter(b => b.status === 'started' || b.status === 'pending_qc').length;

  // Calculate line utilization (batches in progress / 2 lines)
  const lineUtilization = ((inProgress / 2) * 100).toFixed(1);

  // Average batch completion time
  const completedWithTimes = batches
    .filter(b => b.approved_date && b.production_date)
    .map(b => {
      const start = new Date(b.production_date);
      const end = new Date(b.approved_date);
      return (end - start) / (1000 * 60 * 60); // hours
    });
  const avgBatchHours = completedWithTimes.length > 0
    ? (completedWithTimes.reduce((a, b) => a + b, 0) / completedWithTimes.length).toFixed(1)
    : 'N/A';

  return {
    timestamp: new Date().toISOString(),
    mode: 'realtime',
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

async function getInventoryKpis(base44, mode) {
  if (mode === 'cached') {
    return await getSnapshot(base44, 'inventory');
  }

  const inventory = await base44.entities.Inventory.list();
  
  const lowStock = inventory.filter(i => i.quantity <= i.reorder_point);
  const criticalStock = inventory.filter(i => i.quantity <= (i.reorder_point * 0.5));
  
  const totalSku = inventory.length;
  const totalValue = inventory.reduce((sum, i) => sum + ((i.quantity || 0) * (i.cost_per_unit || 0)), 0);

  return {
    timestamp: new Date().toISOString(),
    mode: 'realtime',
    totalSku,
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

async function getFinancialKpis(base44, mode) {
  if (mode === 'cached') {
    return await getSnapshot(base44, 'financials');
  }

  const [batches, purchaseOrders] = await Promise.all([
    base44.entities.Batch.list('-updated_date', 100),
    base44.entities.PurchaseOrder.list('-order_date', 50),
  ]);

  // Calculate total cost from purchase orders
  const totalPoCost = purchaseOrders
    .filter(po => po.status !== 'cancelled')
    .reduce((sum, po) => sum + (po.total || 0), 0);

  // Calculate average cost per batch
  const batchesWithCost = batches.filter(b => b.status === 'approved' || b.status === 'added_to_inventory');
  const avgCostPerBatch = batchesWithCost.length > 0
    ? (totalPoCost / batchesWithCost.length).toFixed(2)
    : '0.00';

  // Open POs
  const openPos = purchaseOrders.filter(po => po.status === 'draft' || po.status === 'submitted' || po.status === 'confirmed');

  return {
    timestamp: new Date().toISOString(),
    mode: 'realtime',
    totalPoValue: totalPoCost.toFixed(2),
    avgCostPerBatch,
    openPoCount: openPos.length,
    openPoValue: openPos.reduce((sum, po) => sum + (po.total || 0), 0).toFixed(2),
    completedBatches: batchesWithCost.length,
  };
}

async function getAlerts(base44, mode) {
  if (mode === 'cached') {
    return await getSnapshot(base44, 'alerts');
  }

  const [batches, inventory, repairs, requisitions] = await Promise.all([
    base44.entities.Batch.filter({ status: 'on_hold' }),
    base44.entities.Inventory.list(),
    base44.entities.EquipmentRepair.filter({ status: 'new_submission' }).catch(() => []),
    base44.entities.PurchaseRequisition.filter({ status: 'pending' }).catch(() => []),
  ]);

  const lowStock = inventory.filter(i => i.quantity <= i.reorder_point);
  const criticalStock = inventory.filter(i => i.quantity <= (i.reorder_point * 0.5));

  return {
    timestamp: new Date().toISOString(),
    mode: 'realtime',
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

async function getSnapshot(base44, snapshotType) {
  try {
    const settings = await base44.entities.AppSettings.filter({
      key: `kpi_snapshot_${snapshotType}`
    });
    if (settings.length > 0) {
      return JSON.parse(settings[0].value);
    }
  } catch (e) {
    // Fall back to real-time if snapshot not found
  }
  return { error: 'Snapshot not available', fallback: 'Use realtime mode' };
}