import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Check,
  X,
  AlertCircle,
  Package,
  Clock,
  User,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Badge from "@/components/ui/Badge";

export default function KioskQCReview({ user, onComplete }) {
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  const queryClient = useQueryClient();

  const { data: pendingBatches = [], isLoading } = useQuery({
    queryKey: ['pendingBatches'],
    queryFn: () => base44.entities.Batch.filter({ status: 'pending_qc' }),
  });

  const approveMutation = useMutation({
    mutationFn: async (batchId) => {
      return base44.entities.Batch.update(batchId, {
        status: 'approved',
        approved_by: user.name,
        approved_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingBatches'] });
      toast.success("Batch approved!");
      setSelectedBatch(null);
    },
    onError: (error) => {
      toast.error("Failed to approve: " + error.message);
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ batchId, reason }) => {
      return base44.entities.Batch.update(batchId, {
        status: 'rejected',
        rejection_reason: reason,
        approved_by: user.name,
        approved_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingBatches'] });
      toast.success("Batch rejected");
      setSelectedBatch(null);
      setShowRejectModal(false);
      setRejectionReason("");
    },
    onError: (error) => {
      toast.error("Failed to reject: " + error.message);
    }
  });

  const handleApprove = () => {
    if (selectedBatch) {
      approveMutation.mutate(selectedBatch.id);
    }
  };

  const handleReject = () => {
    if (selectedBatch && rejectionReason.trim()) {
      rejectMutation.mutate({ batchId: selectedBatch.id, reason: rejectionReason });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading batches...</div>
      </div>
    );
  }

  if (pendingBatches.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-100 mb-2">All Caught Up!</h2>
          <p className="text-zinc-500">No batches are pending QC review</p>
          <Button
            onClick={onComplete}
            className="mt-6 bg-orange-500 hover:bg-orange-600"
          >
            Back to Menu
          </Button>
        </div>
      </div>
    );
  }

  // Batch Detail View
  if (selectedBatch) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-6 border-b border-zinc-800">
            <div>
              <p className="text-sm text-zinc-500">Batch ID</p>
              <p className="text-2xl font-bold font-mono text-orange-400">{selectedBatch.batch_id}</p>
            </div>
            <Badge variant="amber" className="text-lg px-4 py-2">Pending QC</Badge>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-zinc-500">Product</p>
                <p className="text-lg text-zinc-100 font-medium">{selectedBatch.product_name}</p>
                <p className="text-sm font-mono text-zinc-400">{selectedBatch.sku}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Quantity</p>
                <p className="text-lg text-zinc-100">{selectedBatch.quantity} units</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Production Line</p>
                <p className="text-lg text-zinc-100">Line {selectedBatch.production_line}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-zinc-500">Operator</p>
                <p className="text-lg text-zinc-100">{selectedBatch.operator}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Production Date</p>
                <p className="text-lg text-zinc-100">
                  {new Date(selectedBatch.production_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Material Usage */}
          {selectedBatch.material_usage && selectedBatch.material_usage.length > 0 && (
            <div className="mb-6">
              <p className="text-sm text-zinc-500 mb-3">Material Usage</p>
              <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                {selectedBatch.material_usage.map((mat, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">{mat.material_name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-zinc-400">
                        {mat.actual_qty} {mat.unit}
                      </span>
                      <span className={`w-16 text-right font-mono ${
                        Math.abs(mat.variance_percent) > 5 ? 'text-red-400' :
                        Math.abs(mat.variance_percent) > 2 ? 'text-amber-400' :
                        'text-green-400'
                      }`}>
                        {mat.variance_percent > 0 ? '+' : ''}{mat.variance_percent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* QC Results */}
          {selectedBatch.qc_results && selectedBatch.qc_results.length > 0 && (
            <div className="mb-6">
              <p className="text-sm text-zinc-500 mb-3">In-Process QC Results</p>
              <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                {selectedBatch.qc_results.map((qc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="text-zinc-300">{qc.checkpoint}</p>
                      {qc.value && <p className="text-xs text-zinc-500">{qc.value}</p>}
                    </div>
                    {qc.passed === true && <Badge variant="green">Pass</Badge>}
                    {qc.passed === false && <Badge variant="red">Fail</Badge>}
                    {qc.passed === null && <Badge variant="default">Pending</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {selectedBatch.notes && (
            <div className="mb-6">
              <p className="text-sm text-zinc-500 mb-2">Production Notes</p>
              <div className="bg-zinc-800/50 rounded-xl p-4">
                <p className="text-zinc-300">{selectedBatch.notes}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          {!showRejectModal ? (
            <div className="flex gap-4 pt-6 border-t border-zinc-800">
              <Button
                variant="outline"
                onClick={() => setSelectedBatch(null)}
                className="flex-1 h-14 text-lg"
              >
                Back to List
              </Button>
              <Button
                onClick={() => setShowRejectModal(true)}
                className="flex-1 h-14 text-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
              >
                <X className="w-5 h-5 mr-2" />
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                className="flex-1 h-14 text-lg bg-green-600 hover:bg-green-700"
              >
                <Check className="w-5 h-5 mr-2" />
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </Button>
            </div>
          ) : (
            <div className="pt-6 border-t border-zinc-800 space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 font-semibold mb-2">Rejection Reason</p>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className="bg-zinc-800 border-zinc-700 h-24"
                />
              </div>
              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectionReason("");
                  }}
                  className="flex-1 h-14 text-lg"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={!rejectionReason.trim() || rejectMutation.isPending}
                  className="flex-1 h-14 text-lg bg-red-600 hover:bg-red-700"
                >
                  {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Batch List View
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-zinc-100">Pending QC Review</h2>
        <p className="text-zinc-500">{pendingBatches.length} batch(es) awaiting review</p>
      </div>

      <div className="space-y-4">
        {pendingBatches.map((batch) => (
          <button
            key={batch.id}
            onClick={() => setSelectedBatch(batch)}
            className="w-full p-5 bg-zinc-900 border border-zinc-800 rounded-2xl text-left hover:border-zinc-700 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Clock className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <p className="font-mono text-lg text-orange-400 font-bold">{batch.batch_id}</p>
                  <p className="text-zinc-200 font-medium">{batch.product_name}</p>
                  <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Package className="w-4 h-4" />
                      {batch.quantity} units
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {batch.operator}
                    </span>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-zinc-600" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}