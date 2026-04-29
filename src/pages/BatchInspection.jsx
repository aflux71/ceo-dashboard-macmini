import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Phone, ClipboardCheck, CheckCircle2, XCircle, Loader2, ArrowLeft, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Badge from "@/components/ui/Badge";
import BatchSelector from "@/components/inspection/BatchSelector";
import PhotoUploader from "@/components/inspection/PhotoUploader";

export default function BatchInspection() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null); // 'pass' | 'fail'
  const [inspector, setInspector] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["inspection_batches"],
    queryFn: () =>
      base44.entities.Batch.filter({ status: { $in: ["pending_qc", "on_hold"] } }, "-production_date", 100),
  });

  const submitMutation = useMutation({
    mutationFn: async ({ batch, passed }) => {
      const now = new Date().toISOString();
      const newQcResult = {
        checkpoint: "QC Inspection",
        criteria: "Visual / functional inspection",
        method: "On-floor inspection",
        passed,
        notes: notes + (photos.length > 0 ? `\n\nDefect photos: ${photos.join(", ")}` : ""),
        checked_by: inspector,
        checked_at: now,
      };
      const updated = {
        qc_results: [...(batch.qc_results || []), newQcResult],
        status: passed ? "approved" : "rejected",
      };
      if (!passed) {
        updated.rejection_reason = notes || "Failed QC inspection";
      } else {
        updated.approved_by = inspector;
        updated.approved_date = now;
      }
      return base44.entities.Batch.update(batch.id, updated);
    },
    onSuccess: (_, vars) => {
      toast.success(
        vars.passed
          ? `Batch ${vars.batch.batch_id} approved`
          : `Batch ${vars.batch.batch_id} rejected`
      );
      queryClient.invalidateQueries({ queryKey: ["inspection_batches"] });
      queryClient.invalidateQueries({ queryKey: ["shopfloor_batches"] });
      reset();
    },
    onError: (err) => toast.error(`Failed: ${err?.message || "unknown"}`),
  });

  const reset = () => {
    setSelected(null);
    setResult(null);
    setNotes("");
    setPhotos([]);
  };

  const canSubmit = selected && result && inspector.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (result === "fail" && photos.length === 0) {
      if (!confirm("No defect photos attached. Submit anyway?")) return;
    }
    submitMutation.mutate({ batch: selected, passed: result === "pass" });
  };

  return (
    <div className="max-w-3xl mx-auto pb-20 sm:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
          <Phone className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">Batch Inspection</h1>
          <p className="text-sm text-zinc-500">Log QC results & defect photos</p>
        </div>
      </div>

      {!selected ? (
        // ── Step 1: Pick a batch ───────────────────────────────────────────
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
              Awaiting QC ({batches.length})
            </h2>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
          </div>
          <BatchSelector
            batches={batches}
            selectedId={null}
            onSelect={setSelected}
          />
        </div>
      ) : (
        // ── Step 2: Inspect ────────────────────────────────────────────────
        <div className="space-y-5">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-orange-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to list
          </button>

          {/* Batch summary card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="text-xs font-mono text-zinc-500 mb-1">{selected.batch_id}</div>
                <h3 className="text-base font-semibold text-zinc-100 leading-tight">
                  {selected.product_name}
                </h3>
              </div>
              <Badge variant="amber">QC Hold</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm pt-3 border-t border-zinc-800">
              <div>
                <div className="text-xs text-zinc-500">SKU</div>
                <div className="text-zinc-200 font-mono text-xs">{selected.sku}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Quantity</div>
                <div className="text-zinc-200">{selected.quantity?.toLocaleString()} units</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Operator</div>
                <div className="text-zinc-200">{selected.operator || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Production Date</div>
                <div className="text-zinc-200">
                  {selected.production_date ? new Date(selected.production_date).toLocaleDateString() : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Result toggle */}
          <div>
            <Label className="text-zinc-400 text-xs mb-2 block">Inspection Result</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setResult("pass")}
                type="button"
                className={`flex items-center justify-center gap-2 py-4 rounded-lg border-2 font-semibold transition-all ${
                  result === "pass"
                    ? "bg-green-500/15 border-green-500 text-green-400"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                Pass
              </button>
              <button
                onClick={() => setResult("fail")}
                type="button"
                className={`flex items-center justify-center gap-2 py-4 rounded-lg border-2 font-semibold transition-all ${
                  result === "fail"
                    ? "bg-red-500/15 border-red-500 text-red-400"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <XCircle className="w-5 h-5" />
                Fail
              </button>
            </div>
          </div>

          {/* Inspector */}
          <div>
            <Label className="text-zinc-400 text-xs mb-1.5 block">Inspector Name *</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                placeholder="Your name"
                className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-100 h-11"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-zinc-400 text-xs mb-1.5 block">
              Notes {result === "fail" && <span className="text-red-400">(describe defects)</span>}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={result === "fail" ? "Describe the issues found…" : "Optional comments…"}
              rows={3}
              className="bg-zinc-900 border-zinc-800 text-zinc-100 resize-none"
            />
          </div>

          {/* Photos */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <PhotoUploader photos={photos} onChange={setPhotos} />
          </div>

          {/* Submit (sticky on mobile) */}
          <div className="fixed sm:static bottom-0 left-0 right-0 bg-zinc-950 sm:bg-transparent border-t sm:border-0 border-zinc-800 p-4 sm:p-0 z-30">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitMutation.isPending}
              className={`w-full h-12 font-semibold text-white ${
                result === "fail"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <ClipboardCheck className="w-5 h-5 mr-2" />
              )}
              {result === "fail"
                ? "Submit & Reject Batch"
                : result === "pass"
                ? "Submit & Approve Batch"
                : "Select Pass or Fail"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}