import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { calculateBatchCost } from "@/components/recipes/BatchCostCalculator";
import { useFloorPin } from "@/components/auth/FloorPinContext";

export default function ReviewQueue() {
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [rejectionReason, setRejectionReason] = useState({});
  const queryClient = useQueryClient();
  const { floorUser, hasPermission } = useFloorPin();

  // Check cost view permission
  const canViewCosts = hasPermission?.("view_costs") || 
    floorUser?.role === "owner" || 
    floorUser?.role === "admin";

  // Fetch pending QC batches
  const { data: batches = [] } = useQuery({
    queryKey: ["pendingQcBatches"],
    queryFn: async () => {
      const result = await base44.entities.Batch.filter({ status: "pending_qc" });
      return result || [];
    }
  });

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

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (batchId) =>
      base44.entities.Batch.update(batchId, {
        status: "approved",
        approved_date: new Date().toISOString()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingQcBatches"] });
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
      toast.success("Batch rejected");
      setRejectionReason({});
    }
  });

  const pendingCount = batches.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">QC Review Queue</h1>
          <p className="text-sm text-zinc-400 mt-1">Review and approve batches pending quality control</p>
        </div>
        <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg px-4 py-2">
          <span className="text-2xl font-bold text-amber-400">{pendingCount}</span>
        </div>
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

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-zinc-800">
                      <Button
                        onClick={() => approveMutation.mutate(batch.id)}
                        disabled={approveMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 gap-2 flex-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve Batch
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