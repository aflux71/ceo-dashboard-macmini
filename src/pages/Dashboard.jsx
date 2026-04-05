import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Factory,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle,
  TrendingUp,
  ShoppingCart,
  ArrowRight,
  FileText,
  AlertOctagon,
  LogOut
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatsCard from "@/components/dashboard/StatsCard";
import UrgentItemsList from "@/components/dashboard/UrgentItemsList";
import RequisitionAlerts from "@/components/dashboard/RequisitionAlerts";
import SyncLogMini from "@/components/dashboard/SyncLogMini";
import Badge from "@/components/ui/Badge";
import PinLoginScreen from "@/components/auth/PinLoginScreen";
import SKUMappingAlert from "@/components/dashboard/SKUMappingAlert.jsx";

export default function Dashboard() {
  const [showPinScreen, setShowPinScreen] = useState(false);

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: () => base44.entities.Batch.list('-created_date', 100),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['purchase_orders'],
    queryFn: () => base44.entities.PurchaseOrder.list('-created_date', 50),
  });

  const { data: requisitions = [] } = useQuery({
    queryKey: ['purchase_requisitions'],
    queryFn: () => base44.entities.PurchaseRequisition.list('-created_date', 50),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: scheduledItems = [] } = useQuery({
    queryKey: ['forecast-suggestions-all'],
    queryFn: () => base44.entities.ForecastSuggestion.filter({
      status: { $in: ['suggested', 'scheduled', 'on_hold', 'in_progress'] }
    })
  });

  // Calculate issue alerts (missing recipes)
  const issueCount = useMemo(() => {
    const recipeSKUs = new Set(recipes.map(r => r.sku));
    return scheduledItems.filter(item => !recipeSKUs.has(item.sku)).length;
  }, [recipes, scheduledItems]);

  // Calculate stats
  const pendingBatches = batches.filter(b => b.status === 'pending' || b.status === 'pending_qc');
  const approvedToday = batches.filter(b => {
    if (b.status !== 'approved') return false;
    const today = new Date().toDateString();
    return new Date(b.approved_date || b.updated_date).toDateString() === today;
  });

  const lowStockItems = inventory.filter(i => {
    if (i.type !== 'finished_product') return false;
    if (!i.reorder_point) return false;
    return i.quantity <= i.reorder_point;
  }).map(i => ({
    sku: i.sku,
    name: i.name,
    quantity: i.quantity,
    reorder_point: i.reorder_point,
    days_until_stockout: i.quantity > 0 ? Math.ceil(i.quantity / (i.reorder_point / 30)) : 0
  })).sort((a, b) => a.days_until_stockout - b.days_until_stockout);

  const openPOs = purchaseOrders.filter(po => 
    po.status !== 'received' && po.status !== 'cancelled'
  );

  const recentBatches = batches.slice(0, 5);

  if (showPinScreen) {
    return <PinLoginScreen onClose={() => setShowPinScreen(false)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Operations Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Overview of production, inventory, and orders
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            onClick={() => setShowPinScreen(true)}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Switch User
          </Button>
          <Link to={createPageUrl("ProductionPlanning")}>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Factory className="w-4 h-4 mr-2" />
              New Batch
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Pending Review"
          value={pendingBatches.length}
          subtitle="Batches awaiting approval"
          icon={Clock}
        />
        <StatsCard
          title="Approved Today"
          value={approvedToday.length}
          subtitle="Batches completed"
          icon={CheckCircle}
        />
        <StatsCard
          title="Low Stock Items"
          value={lowStockItems.length}
          subtitle={lowStockItems.length > 0 ? "Need attention" : "All good"}
          icon={AlertTriangle}
        />
        <StatsCard
          title="Open P.O.s"
          value={openPOs.length}
          subtitle="Awaiting delivery"
          icon={ShoppingCart}
        />
        {/* Issue Alerts Tile */}
        <Link to={createPageUrl("IssueAlerts")}>
          <Card className={`bg-zinc-900 border-zinc-800 hover:border-red-500/50 transition-colors cursor-pointer ${issueCount > 0 ? 'border-red-500/30 bg-red-500/5' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-red-400">Issue Alerts</p>
                  <p className={`text-2xl font-bold ${issueCount > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                    {issueCount}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {issueCount > 0 ? "Needs attention" : "All clear"}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${issueCount > 0 ? 'bg-red-500/20' : 'bg-zinc-800'}`}>
                  <AlertOctagon className={`w-5 h-5 ${issueCount > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* SKU Mapping Alerts */}
      <SKUMappingAlert />

      {/* Requisition Alerts */}
      <RequisitionAlerts requisitions={requisitions} />

      {/* Urgent Items Alert */}
      {lowStockItems.length > 0 && (
        <UrgentItemsList
          items={lowStockItems}
          title="Critical Inventory Alerts"
        />
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Batches */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold text-zinc-100">
              Recent Batches
            </CardTitle>
            <Link to={createPageUrl("BatchHistory")}>
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentBatches.length === 0 ? (
                <p className="text-zinc-500 text-sm py-4 text-center">No batches recorded yet</p>
              ) : (
                recentBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-800"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-orange-400">
                          {batch.batch_id}
                        </span>
                        <Badge variant={
                          batch.status === 'approved' ? 'green' :
                          batch.status === 'rejected' ? 'red' :
                          batch.status === 'pending_qc' ? 'amber' : 'default'
                        }>
                          {batch.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-400 truncate mt-1">
                        {batch.product_name} • {batch.quantity} units
                      </p>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {new Date(batch.production_date || batch.created_date).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Open Purchase Orders */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold text-zinc-100">
              Open Purchase Orders
            </CardTitle>
            <Link to={createPageUrl("PurchaseOrders")}>
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {openPOs.length === 0 ? (
                <p className="text-zinc-500 text-sm py-4 text-center">No open purchase orders</p>
              ) : (
                openPOs.slice(0, 5).map((po) => (
                  <div
                    key={po.id}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-800"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-zinc-200">
                          {po.po_number}
                        </span>
                        <Badge variant={
                          po.status === 'confirmed' ? 'blue' :
                          po.status === 'shipped' ? 'cyan' :
                          po.status === 'submitted' ? 'amber' : 'default'
                        }>
                          {po.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-400 truncate mt-1">
                        {po.supplier} • {po.items?.length || 0} items
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-200">
                        ${po.total?.toLocaleString() || '0'}
                      </p>
                      {po.expected_date && (
                        <p className="text-xs text-zinc-500">
                          ETA: {new Date(po.expected_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Log */}
      <SyncLogMini />

      {/* Quick Actions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-zinc-100">
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link to={createPageUrl("ProductionPlanning")}>
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-800 hover:border-orange-500/30 transition-colors cursor-pointer text-center">
                <Factory className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-200">Start Production</p>
              </div>
            </Link>
            <Link to={createPageUrl("Inventory")}>
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-800 hover:border-orange-500/30 transition-colors cursor-pointer text-center">
                <Package className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-200">Check Inventory</p>
              </div>
            </Link>
            <Link to={createPageUrl("PurchaseRequisitions")}>
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-800 hover:border-orange-500/30 transition-colors cursor-pointer text-center">
                <FileText className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-200">Requisitions</p>
              </div>
            </Link>
            <Link to={createPageUrl("BatchHistory")}>
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-800 hover:border-orange-500/30 transition-colors cursor-pointer text-center">
                <TrendingUp className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-200">View Reports</p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}