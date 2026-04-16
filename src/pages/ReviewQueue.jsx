import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, DollarSign, PackageX, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { calculateBatchCost } from "@/components/recipes/BatchCostCalculator";
import { useFloorPin } from "@/components/auth/FloorPinContext";

export default function ReviewQueue() {
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [rejectionReason, setRejectionReason] = useState({});
  const [yieldOverride, setYieldOverride] = useState({}); // { [batchId]: { qty, notes } }
  const queryClient = useQueryClient();
  const { floorUser, hasPermission } = useFloorPin();

  const [dashUser, setDashUser] = useState(null);
  useEffect(() => {
    base44.auth.me().then(setDashUser).catch(() => {});
  }, []);

  const QC_ROLES = ['owner', 'admin', 'production_lead', 'qc'];
  // Allow if floor PIN user has QC+ role OR the logged-in dashboard user has QC+ role
  const canEditQty = QC_ROLES.includes(floorUser?.role) || QC_ROLES.includes(dashUser?.role);

  // Check cost view permission
  const canViewCosts = hasPermission?.("view_costs") || 
    floorUser?.role === "owner" || 
    floorUser?.role === "admin";

  // Fetch pending QC batches (batching QC step)
  const { data: qcBatches = [] } = useQuery({
    queryKey: ["pendingQcBatches"],
    queryFn: async () => {
      const result = await base44.entities.Batch.filter({ status: "pending_qc" });
      return result || [];
    }
  });

  // Fetch in-review batches (final product review step)
  const { data: reviewBatches = [] } = useQuery({
    queryKey: ["inReviewBatches"],
    queryFn: async () => {
      const result = await base44.entities.Batch.filter({ status: "in_review" });
      return result || [];
    }
  });

  const [activeTab, setActiveTab] = useState("review"); // "qc" | "review"
  const batches = activeTab === "qc" ? qcBatches : reviewBatches;

  // Fetch recipes and inventory for cost calculation
  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  // Helper to get batch cost
  const getBatchCost = (batch) => {
    const recipe = recipes.find(r => r.id === batch.recipe_id || r.sku === batch.sku);
    if (!recipe) return null;
    return calculateBatchCost(recipe, inventory);
  };

  // Approve mutation — for pending_qc: move to approved (→ filling); for in_review: move to added_to_inventory
  const approveMutation = useMutation({
    mutationFn: ({ batchId, currentStatus }) =>
      base44.entities.Batch.update(batchId, {
        status: currentStatus === "in_review" ? "added_to_inventory" : "approved",
        approved_date: new Date().toISOString()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingQcBatches"] });
      queryClient.invalidateQueries({ queryKey: ["inReviewBatches"] });
      queryClient.invalidateQueries({ queryKey: ["planning_wip_inhouse_batches"] });
      toast.success("Batch approved");
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ batchId, reason }) =>
      base44.entities.Batch.update(batchId, {
        status: "rejected",
        rejection_reason: reason
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingQcBatches"] });
      queryClient.invalidateQueries({ queryKey: ["inReviewBatches"] });
      toast.success("Batch rejected");
      setRejectionReason({});
    }
  });

  // Qty override mutation
  const overrideMutation = useMutation({
    mutationFn: async ({ batch_id, actual_yield_units, deviation_notes, apply_material_override }) => {
      const res = await base44.functions.invoke('adjustProductionQty', {
        batch_id,
        actual_yield_units,
        deviation_notes,
        apply_material_override,
      });
      return res.data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['pendingQcBatches'] });
      setYieldOverride(prev => { const n = { ...prev }; delete n[vars.batch_id]; return n; });
      toast.success(vars.apply_material_override
        ? 'Quantity overridden and raw materials adjusted'
        : 'Quantity saved — no material adjustment');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err?.message || 'Override failed');
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Review Queue</h1>
          <p className="text-sm text-zinc-400 mt-1">QC hold for batching · Final review for finished products</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg px-4 py-2 text-center">
            <p className="text-xs text-amber-400 font-medium">QC Hold</p>
            <span className="text-2xl font-bold text-amber-400">{qcBatches.length}</span>
          </div>
          <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg px-4 py-2 text-center">
            <p className="text-xs text-purple-400 font-medium">Final Review</p>
            <span className="text-2xl font-bold text-purple-400">{reviewBatches.length}</span>
          </div>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab("review")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "review" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"}`}
        >
          Final Product Review ({reviewBatches.length})
        </button>
        <button
          onClick={() => setActiveTab("qc")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "qc" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"}`}
        >
          Batching QC Hold ({qcBatches.length})
        </button>
      </div>

      {/* Queue Items */}
      <div className="space-y-3">
        {batches.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6 text-center text-zinc-500">
              No batches pending QC review
            </CardContent>
          </Card>
        ) : (
          batches.map((batch) => {
            const isExpanded = expandedBatch === batch.id;
            const allQcPassed = batch.qc_results?.every(r => r.passed) ?? false;

            return (
              <div
                key={batch.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
              >
                {/* Summary */}
                <button
                  onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}
                  className="w-full p-6 flex items-center justify-between hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded text-sm font-mono font-semibold">
                        {batch.batch_id}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        allQcPassed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {allQcPassed ? 'QC Passed' : 'QC Issues'}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-100">{batch.product_name}</h3>
                    <p className="text-sm text-zinc-400 mt-1">
                      Qty: <span className="font-semibold text-zinc-200">{batch.quantity} units</span>
                      {' '} • SKU: <span className="font-mono text-zinc-300">{batch.sku}</span>
                      {canViewCosts && (() => {
                        const cost = getBatchCost(batch);
                        if (cost && cost.totalCost > 0) {
                          return (
                            <span className="ml-2">
                              • <DollarSign className="w-3 h-3 inline text-green-400" />
                              <span className="text-green-400 font-medium">${cost.totalCost.toFixed(2)}</span>
                              <span className="text-zinc-500 text-xs ml-1">(${cost.costPerUnit.toFixed(3)}/unit)</span>
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </p>
                  </div>
                  
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-zinc-400" />
                  )}
                </button>

                {/* Details */}
                {isExpanded && (
                  <div className="bg-zinc-800/30 border-t border-zinc-800 p-6 space-y-6">
                    {/* QC Results */}
                    {batch.qc_results && batch.qc_results.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-300 mb-3">QC Checkpoints</h4>
                        <div className="space-y-2">
                          {batch.qc_results.map((qc, idx) => (
                            <div
                              key={idx}
                              className={`p-3 rounded border ${
                                qc.passed
                                  ? 'bg-green-950/20 border-green-800/30'
                                  : 'bg-red-950/20 border-red-800/30'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-sm text-zinc-200">{qc.checkpoint}</p>
                                  <p className="text-xs text-zinc-400 mt-1">{qc.criteria}</p>
                                </div>
                                {qc.passed ? (
                                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                )}
                              </div>
                              {qc.notes && (
                                <p className="text-xs text-zinc-300 mt-2 ml-3 border-l border-zinc-700 pl-3">
                                  {qc.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Material Usage */}
                    {batch.material_usage && batch.material_usage.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-300 mb-3">Material Variance</h4>
                        <div className="space-y-2 text-xs">
                          {batch.material_usage.map((mat, idx) => (
                            <div key={idx} className="flex justify-between p-2 bg-zinc-800/30 rounded">
                              <span className="text-zinc-300">{mat.material_name}</span>
                              <div className="flex gap-4 font-mono text-right">
                                <span className="text-zinc-500">{mat.expected_qty} {mat.unit}</span>
                                <span className={mat.variance > 0 ? 'text-orange-400' : 'text-green-400'}>
                                  {mat.actual_qty} {mat.unit}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Qty Override Section — QC+ only */}
                    {canEditQty && (
                      <div className="border border-amber-500/30 bg-amber-950/10 rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <PackageX className="w-4 h-4 text-amber-400" />
                          <h4 className="text-sm font-semibold text-amber-300">Production Quantity Override</h4>
                        </div>
                        <p className="text-xs text-zinc-400">Use this section to record actual yield when production loss or failure occurred. Notes are required.</p>
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">
                              Actual Yield (units) <span className="text-zinc-500">— planned: {batch.quantity}</span>
                              {batch.actual_yield_units != null && (
                                <span className="ml-2 text-amber-400">Current override: {batch.actual_yield_units}</span>
                              )}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              placeholder={String(batch.quantity)}
                              value={yieldOverride[batch.batch_id]?.qty ?? ''}
                              onChange={(e) => setYieldOverride(prev => ({
                                ...prev,
                                [batch.batch_id]: { ...prev[batch.batch_id], qty: e.target.value }
                              }))}
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">
                              Deviation Notes <span className="text-red-400">*</span>
                            </label>
                            <Textarea
                              placeholder="Required: explain reason for quantity change (e.g. production loss, failed units, fill error)..."
                              value={yieldOverride[batch.batch_id]?.notes ?? ''}
                              onChange={(e) => setYieldOverride(prev => ({
                                ...prev,
                                [batch.batch_id]: { ...prev[batch.batch_id], notes: e.target.value }
                              }))}
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 text-xs min-h-[60px]"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              overrideMutation.isPending ||
                              !yieldOverride[batch.batch_id]?.qty ||
                              !yieldOverride[batch.batch_id]?.notes?.trim()
                            }
                            onClick={() => overrideMutation.mutate({
                              batch_id: batch.batch_id,
                              actual_yield_units: Number(yieldOverride[batch.batch_id]?.qty),
                              deviation_notes: yieldOverride[batch.batch_id]?.notes,
                              apply_material_override: false,
                            })}
                            className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 text-xs"
                          >
                            Save Qty Only
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              overrideMutation.isPending ||
                              !yieldOverride[batch.batch_id]?.qty ||
                              !yieldOverride[batch.batch_id]?.notes?.trim()
                            }
                            onClick={() => overrideMutation.mutate({
                              batch_id: batch.batch_id,
                              actual_yield_units: Number(yieldOverride[batch.batch_id]?.qty),
                              deviation_notes: yieldOverride[batch.batch_id]?.notes,
                              apply_material_override: true,
                            })}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1"
                          >
                            <AlertCircle className="w-3 h-3" />
                            Override + Adjust Raw Materials
                          </Button>
                        </div>
                        {batch.qty_override_by && (
                          <p className="text-xs text-zinc-500">
                            Last override by <span className="text-zinc-300">{batch.qty_override_by}</span>
                            {batch.qty_override_at && ` on ${new Date(batch.qty_override_at).toLocaleString()}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-zinc-800">
                      <Button
                        onClick={() => approveMutation.mutate({ batchId: batch.id, currentStatus: batch.status })}
                        disabled={approveMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 gap-2 flex-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {batch.status === "in_review" ? "Approve & Add to Inventory" : "Approve → Move to Filling"}
                      </Button>
                      
                      <div className="flex-1">
                        <div className="flex gap-2">
                          <Textarea
                            placeholder="Rejection reason..."
                            value={rejectionReason[batch.id] || ''}
                            onChange={(e) =>
                              setRejectionReason({
                                ...rejectionReason,
                                [batch.id]: e.target.value
                              })
                            }
                            className="text-xs bg-zinc-800 border-zinc-700 min-h-[40px]"
                          />
                          <Button
                            onClick={() =>
                              rejectMutation.mutate({
                                batchId: batch.id,
                                reason: rejectionReason[batch.id] || 'No reason provided'
                              })
                            }
                            disabled={rejectMutation.isPending}
                            variant="outline"
                            className="border-red-800/30 text-red-400 hover:bg-red-950/20"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}