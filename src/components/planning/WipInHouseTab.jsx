import React, { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ArrowRight, Loader2, CheckCircle2, Eye, EyeOff, Timer, Trash2, Printer, FileText, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import Badge from "@/components/ui/Badge";
import RecipeBatchSheet from "@/components/recipes/RecipeBatchSheet";
import BatchTraveller from "@/components/recipes/BatchTraveller";

const STAGE_CONFIG = {
  batching:  { label: "Batching",  bg: "bg-blue-500/20",  border: "border-blue-500/30",  text: "text-blue-400",  dot: "bg-blue-500",  fill: "bg-blue-500" },
  qc_hold:   { label: "QC Hold",   bg: "bg-amber-500/20", border: "border-amber-500/30", text: "text-amber-400", dot: "bg-amber-500", fill: "bg-amber-500" },
  filling:   { label: "Filling",   bg: "bg-green-500/20", border: "border-green-500/30", text: "text-green-400", dot: "bg-green-500", fill: "bg-green-500" },
  complete:  { label: "Complete",  bg: "bg-zinc-700/40",  border: "border-zinc-600/30",  text: "text-zinc-400",  dot: "bg-zinc-500",  fill: "bg-zinc-500" },
};

const KANBAN_COLUMNS = [
  { key: "batching", label: "Batching", cfg: STAGE_CONFIG.batching },
  { key: "qc_hold",  label: "QC Hold",  cfg: STAGE_CONFIG.qc_hold },
  { key: "filling",  label: "Filling",  cfg: STAGE_CONFIG.filling },
  { key: "complete", label: "Complete", cfg: STAGE_CONFIG.complete },
];

function addDays(dateStr, days) { if (!dateStr) return ""; const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split("T")[0]; }
function formatDate(dateStr) { if (!dateStr) return "—"; return new Date(dateStr + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }); }
function getMonday(d) { const date = new Date(d); const day = date.getDay(); const diff = day === 0 ? -6 : 1 - day; date.setDate(date.getDate() + diff); return date.toISOString().split("T")[0]; }

function batchStage(batch) {
  const s = batch.status;
  if (s === "added_to_inventory") return "complete";
  if (s === "approved") return "filling";
  if (s === "pending_qc" || s === "on_hold") return "qc_hold";
  return "batching";
}

function parseBatchDates(batch) {
  const batchDate = batch.production_date ? batch.production_date.split("T")[0] : null;
  let qcDate = null, fillDate = null;
  const notes = batch.notes || "";
  const qcMatch = notes.match(/QC hold date:\s*(\d{4}-\d{2}-\d{2})/);
  if (qcMatch) qcDate = qcMatch[1];
  const fillMatch = notes.match(/Fill date:\s*(\d{4}-\d{2}-\d{2})/);
  if (fillMatch) fillDate = fillMatch[1];
  if (batchDate && !qcDate) qcDate = addDays(batchDate, 3);
  if (qcDate && !fillDate) fillDate = addDays(qcDate, 1);
  return { batchDate, qcDate, fillDate };
}

function parseBatchLine(batch) {
  const line = batch.production_line;
  if (line === 1) return "Line 1"; if (line === 2) return "Line 2";
  if (line === 3) return "Melter 1"; if (line === 4) return "Melter 2";
  return `Line ${line || "?"}`;
}

export default function WipInHouseTab() {
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [yieldDialog, setYieldDialog] = useState(null);
  const [yieldUnits, setYieldUnits] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [printBatch, setPrintBatch] = useState(null);
  const [printRecipe, setPrintRecipe] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [printType, setPrintType] = useState("traveller"); // "traveller" | "batch_sheet"
  const printRef = useRef(null);

  const { data: batches = [], isLoading } = useQuery({ queryKey: ["planning_wip_inhouse_batches"], queryFn: () => base44.entities.Batch.list("-created_date", 500) });

  const inHouseBatches = useMemo(() => batches.filter((b) => { const pt = b.production_type; return !pt || pt === "make"; }), [batches]);

  const enriched = useMemo(() => inHouseBatches.map((b) => ({ ...b, stage: batchStage(b), dates: parseBatchDates(b), lineLabel: parseBatchLine(b) })), [inHouseBatches]);

  const today = new Date().toISOString().split("T")[0];
  const thisWeekEnd = addDays(getMonday(today), 7);

  const stats = useMemo(() => {
    const active = enriched.filter((b) => b.stage !== "complete");
    return {
      inProgress: active.length,
      overdue: active.filter((b) => b.stage === "batching" && b.dates.batchDate && b.dates.batchDate < today).length,
      completingThisWeek: enriched.filter((b) => { const fd = b.dates.fillDate; return fd && fd >= today && fd < thisWeekEnd && b.stage !== "complete"; }).length,
    };
  }, [enriched, today, thisWeekEnd]);

  const columns = useMemo(() => {
    const map = { batching: [], qc_hold: [], filling: [], complete: [] };
    enriched.forEach((b) => {
      if (b.stage === "complete") {
        if (showCompleted) { const updatedAt = b.updated_date || b.created_date; if (updatedAt && (Date.now() - new Date(updatedAt).getTime()) / 3600000 <= 24) map.complete.push(b); }
      } else { map[b.stage]?.push(b); }
    });
    return map;
  }, [enriched, showCompleted]);

  const advanceMutation = useMutation({
    mutationFn: ({ id, newStatus, extraFields }) => base44.entities.Batch.update(id, { status: newStatus, ...extraFields }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_wip_inhouse_batches"] }); queryClient.invalidateQueries({ queryKey: ["planning_schedule_batches"] }); queryClient.invalidateQueries({ queryKey: ["planning_batches"] }); toast.success("Stage updated"); },
    onError: (err) => toast.error(`Failed to update: ${err?.message || String(err)}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Batch.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_wip_inhouse_batches"] }); queryClient.invalidateQueries({ queryKey: ["planning_schedule_batches"] }); queryClient.invalidateQueries({ queryKey: ["planning_batches"] }); toast.success("Batch deleted"); setDeleteConfirm(null); },
    onError: (err) => toast.error(`Failed to delete: ${err?.message || String(err)}`),
  });

  const handleAdvance = (batch) => {
    const stage = batchStage(batch);
    if (stage === "batching") advanceMutation.mutate({ id: batch.id, newStatus: "pending_qc", extraFields: {} });
    else if (stage === "qc_hold") advanceMutation.mutate({ id: batch.id, newStatus: "approved", extraFields: {} });
    else if (stage === "filling") { setYieldDialog(batch); setYieldUnits(String(batch.quantity || "")); }
  };

  const handleComplete = () => {
    if (!yieldDialog) return;
    advanceMutation.mutate({ id: yieldDialog.id, newStatus: "added_to_inventory", extraFields: { actual_yield_units: Number(yieldUnits) || 0 } }, {
      onSuccess: () => {
        base44.entities.ReviewQueue?.create?.({ batch_id: yieldDialog.batch_id || yieldDialog.id, sku: yieldDialog.sku, product_name: yieldDialog.product_name, quantity: Number(yieldUnits) || 0, planned_quantity: yieldDialog.quantity, status: "pending", created_at: new Date().toISOString() }).catch(() => {});
        setYieldDialog(null); setYieldUnits("");
      },
    });
  };

  const daysUntilNext = (batch) => {
    const stage = batchStage(batch);
    const { qcDate, fillDate } = parseBatchDates(batch);
    let targetDate = stage === "batching" ? qcDate : fillDate;
    if (!targetDate) return null;
    return Math.ceil((new Date(targetDate) - new Date(today)) / 86400000);
  };

  const nextAction = (stage) => { if (stage === "batching") return "Move to QC Hold"; if (stage === "qc_hold") return "Move to Filling"; if (stage === "filling") return "Mark Complete"; return null; };

  const handlePrintBatchSheet = async (batch) => {
    setPrintLoading(true);
    setPrintBatch(batch);
    setPrintRecipe(null);
    try {
      const recipes = await base44.entities.Recipe.filter({ sku: batch.sku });
      setPrintRecipe(recipes[0] || null);
    } catch {
      setPrintRecipe(null);
    }
    setPrintLoading(false);
  };

  const doPrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(`<!DOCTYPE html><html><head><title>Print</title><style>
      @page { margin: 0.5in; size: letter; }
      body { margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 12px; color: #111; background: white; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style></head><body>${printContent.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-orange-500/30 transition-colors"><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">In Progress</p><p className="text-2xl font-bold text-orange-500 mt-1">{stats.inProgress}</p><p className="text-xs text-zinc-500 mt-0.5">active batches</p></div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-red-500/30 transition-colors"><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Overdue</p><p className={`text-2xl font-bold mt-1 ${stats.overdue > 0 ? "text-red-400" : "text-zinc-600"}`}>{stats.overdue}</p><p className="text-xs text-zinc-500 mt-0.5">past batch date, still batching</p></div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-green-500/30 transition-colors"><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Completing This Week</p><p className="text-2xl font-bold text-green-400 mt-1">{stats.completingThisWeek}</p><p className="text-xs text-zinc-500 mt-0.5">fill date this week</p></div>
      </div>

      <div className="flex items-center justify-end">
        <button onClick={() => setShowCompleted(!showCompleted)} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          {showCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showCompleted ? "Hide Completed" : "Show Completed (24h)"}
        </button>
      </div>

      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-12 flex items-center justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {KANBAN_COLUMNS.map((col) => {
            const items = columns[col.key] || [];
            if (col.key === "complete" && !showCompleted) return null;
            return (
              <div key={col.key} className="space-y-2">
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${col.cfg.bg} border ${col.cfg.border}`}>
                  <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${col.cfg.dot}`}></span><span className={`text-sm font-medium ${col.cfg.text}`}>{col.label}</span></div>
                  <span className={`text-xs font-medium ${col.cfg.text}`}>{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-zinc-800 text-center"><p className="text-xs text-zinc-600">No batches</p></div>
                ) : (
                  <div className="space-y-2">
                    {items.map((b) => {
                      const { batchDate, fillDate } = b.dates;
                      const daysLeft = daysUntilNext(b);
                      const action = nextAction(b.stage);
                      const isOverdue = b.stage === "batching" && batchDate && batchDate < today;
                      return (
                        <Card key={b.id} className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors ${isOverdue ? "border-red-500/30" : ""} ${b.stage === "complete" ? "opacity-75" : ""}`}>
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono text-zinc-400 truncate">{b.batch_id}</span>
                              {b.stage === "complete" && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
                              {isOverdue && <Badge variant="red">Overdue</Badge>}
                            </div>
                            <h4 className="text-sm font-medium text-zinc-100 truncate">{b.product_name}</h4>
                            <div className="space-y-1 text-xs text-zinc-500">
                              <div className="flex justify-between"><span>SKU</span><span className="text-zinc-300 font-mono">{b.sku}</span></div>
                              <div className="flex justify-between"><span>Batch Size</span><span className="text-zinc-300">{b.quantity?.toLocaleString()}</span></div>
                              <div className="flex justify-between"><span>Line</span><span className="text-zinc-300">{b.lineLabel}</span></div>
                              <div className="flex justify-between"><span>Operator</span><span className="text-zinc-300">{b.operator || "—"}</span></div>
                              <div className="flex justify-between"><span>Dates</span><span className="text-zinc-400">{formatDate(batchDate).replace(/, \d{4}/, "")} → {formatDate(fillDate).replace(/, \d{4}/, "")}</span></div>
                            </div>
                            {daysLeft !== null && b.stage !== "complete" && <div className={`flex items-center gap-1 text-xs ${daysLeft < 0 ? "text-red-400" : daysLeft === 0 ? "text-amber-400" : "text-zinc-500"}`}><Timer className="w-3 h-3" />{daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d to next stage`}</div>}
                            {b.stage === "complete" && b.actual_yield_units != null && <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800"><span className="text-zinc-500">Yield</span><span className={`font-medium ${b.actual_yield_units >= b.quantity ? "text-green-400" : "text-amber-400"}`}>{b.actual_yield_units?.toLocaleString()} / {b.quantity?.toLocaleString()}<span className="text-zinc-600 ml-1">({b.quantity ? Math.round((b.actual_yield_units / b.quantity) * 100) : 0}%)</span></span></div>}
                            {b.stage !== "complete" && (
                              <div className="flex items-center gap-1.5 mt-1">
                                {action && <Button size="sm" variant="outline" onClick={() => handleAdvance(b)} disabled={advanceMutation.isPending} className={`flex-1 text-xs ${b.stage === "batching" ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : b.stage === "qc_hold" ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"}`}>{advanceMutation.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <ArrowRight className="w-3 h-3 mr-1.5" />}{action}</Button>}
                                <Button size="sm" variant="ghost" onClick={() => handlePrintBatchSheet(b)} className="h-8 w-8 p-0 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 shrink-0" title="Print batch sheet"><Printer className="w-3.5 h-3.5" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(b)} className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 shrink-0" title="Delete batch"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!yieldDialog} onOpenChange={(open) => { if (!open) { setYieldDialog(null); setYieldUnits(""); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          {yieldDialog && (
            <>
              <DialogHeader><DialogTitle>Mark Complete — Yield</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="text-sm text-zinc-400"><span className="text-zinc-200 font-medium">{yieldDialog.product_name}</span><span className="text-zinc-600 mx-1.5">·</span><span className="font-mono text-zinc-500">{yieldDialog.batch_id}</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Planned Units</Label><Input value={yieldDialog.quantity?.toLocaleString() || "0"} disabled className="bg-zinc-800 border-zinc-700 text-zinc-400 h-9 text-sm" /></div>
                  <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Actual Units Produced *</Label><Input type="number" value={yieldUnits} onChange={(e) => setYieldUnits(e.target.value)} placeholder="0" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" autoFocus /></div>
                </div>
                {yieldUnits && yieldDialog.quantity && <div className={`text-xs font-medium ${Number(yieldUnits) >= yieldDialog.quantity ? "text-green-400" : "text-amber-400"}`}>Yield: {Math.round((Number(yieldUnits) / yieldDialog.quantity) * 100)}%{Number(yieldUnits) < yieldDialog.quantity && <span className="text-zinc-500 ml-1">({(yieldDialog.quantity - Number(yieldUnits)).toLocaleString()} under target)</span>}</div>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setYieldDialog(null); setYieldUnits(""); }} className="border-zinc-700">Cancel</Button>
                <Button onClick={handleComplete} disabled={advanceMutation.isPending || !yieldUnits} className="bg-green-600 hover:bg-green-700 text-white">{advanceMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}Mark Complete</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={!!printBatch} onOpenChange={(open) => { if (!open) { setPrintBatch(null); setPrintRecipe(null); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Print — {printBatch?.batch_id}
            </DialogTitle>
          </DialogHeader>

          {/* Type toggle */}
          <div className="flex gap-2 border-b border-zinc-800 pb-3">
            <button
              onClick={() => setPrintType("traveller")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${printType === "traveller" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"}`}
            >
              <FileText className="w-4 h-4" /> Traveller Card
            </button>
            <button
              onClick={() => setPrintType("batch_sheet")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${printType === "batch_sheet" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"}`}
            >
              <ClipboardList className="w-4 h-4" /> Full Batch Sheet
            </button>
          </div>

          <div className="py-2">
            {printLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
            ) : printType === "traveller" ? (
              <div ref={printRef}>
                <BatchTraveller batch={printBatch} recipe={printRecipe} />
              </div>
            ) : !printRecipe ? (
              <div className="text-center py-8 text-zinc-400">
                <p className="text-sm">No recipe found for SKU <span className="font-mono text-zinc-300">{printBatch?.sku}</span>.</p>
                <p className="text-xs text-zinc-500 mt-1">A recipe must exist to print a full batch sheet.</p>
              </div>
            ) : (
              <div ref={printRef}>
                <RecipeBatchSheet recipes={[{ ...printRecipe, _batchInfo: printBatch }]} showVerifyCheckboxes={true} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPrintBatch(null); setPrintRecipe(null); }} className="border-zinc-700">Close</Button>
            {(printType === "traveller" || printRecipe) && (
              <Button onClick={doPrint} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle>Delete Batch</DialogTitle></DialogHeader>
          {deleteConfirm && (
            <div className="py-2">
              <p className="text-sm text-zinc-400 mb-2">
                Are you sure you want to delete batch <span className="text-zinc-200 font-mono">{deleteConfirm.batch_id}</span>?
              </p>
              <p className="text-sm text-zinc-500">{deleteConfirm.product_name} — {deleteConfirm.quantity?.toLocaleString()} units</p>
              <p className="text-xs text-red-400/70 mt-2">This action cannot be undone.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-zinc-700">Cancel</Button>
            <Button onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}