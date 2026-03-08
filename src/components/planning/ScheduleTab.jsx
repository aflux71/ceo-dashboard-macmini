import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { CalendarDays, Loader2, ArrowRight, ArrowLeft, Trash2, ChevronLeft, ChevronRight, BarChart3, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STAGE_CONFIG = {
  batching: { label: "Batching", bg: "bg-blue-500/20", border: "border-blue-500/30", text: "text-blue-400", dot: "bg-blue-500", fill: "bg-blue-500" },
  qc_hold: { label: "QC Hold", bg: "bg-amber-500/20", border: "border-amber-500/30", text: "text-amber-400", dot: "bg-amber-500", fill: "bg-amber-500" },
  filling: { label: "Filling", bg: "bg-green-500/20", border: "border-green-500/30", text: "text-green-400", dot: "bg-green-500", fill: "bg-green-500" },
  complete: { label: "Complete", bg: "bg-zinc-700/40", border: "border-zinc-600/30", text: "text-zinc-400", dot: "bg-zinc-500", fill: "bg-zinc-500" },
};

function addDays(dateStr, days) { if (!dateStr) return ""; const d = new Date(dateStr + "T12:00:00"); d.setDate(d.getDate() + days); return d.toISOString().split("T")[0]; }
function formatDate(dateStr) { if (!dateStr) return "—"; return new Date(dateStr + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }); }
function getMonday(d) { const date = new Date(d + "T12:00:00"); const day = date.getDay(); const diff = day === 0 ? -6 : 1 - day; date.setDate(date.getDate() + diff); return date.toISOString().split("T")[0]; }
function generateDays(startDate, count) { const days = []; for (let i = 0; i < count; i++) days.push(addDays(startDate, i)); return days; }
function batchStage(b) { const s = b.status; if (s === "added_to_inventory") return "complete"; if (s === "approved") return "filling"; if (s === "pending_qc" || s === "on_hold") return "qc_hold"; return "batching"; }
function parseBatchDates(b) { const batchDate = b.production_date ? b.production_date.split("T")[0] : null; let qcDate = null, fillDate = null; const notes = b.notes || ""; const qcM = notes.match(/QC hold date:\s*(\d{4}-\d{2}-\d{2})/); if (qcM) qcDate = qcM[1]; const fM = notes.match(/Fill date:\s*(\d{4}-\d{2}-\d{2})/); if (fM) fillDate = fM[1]; if (batchDate && !qcDate) qcDate = addDays(batchDate, 3); if (qcDate && !fillDate) fillDate = addDays(qcDate, 1); return { batchDate, qcDate, fillDate }; }
function parseBatchLine(b) { const l = b.production_line; if (l === 1) return "Line 1"; if (l === 2) return "Line 2"; if (l === 3) return "Melter 1"; if (l === 4) return "Melter 2"; return `Line ${l || "?"}`; }

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ScheduleTab() {
  const queryClient = useQueryClient();
  const [view, setView] = useState("calendar");
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date().toISOString().split("T")[0]));
  const [filter, setFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState("all");
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [schedDeleteConfirm, setSchedDeleteConfirm] = useState(null);
  const { data: batches = [], isLoading } = useQuery({ queryKey: ["planning_schedule_batches"], queryFn: () => base44.entities.Batch.list("-created_date", 500) });

  const invalidateAll = () => { ["planning_schedule_batches","planning_batches","planning_batch_queue_manual","planning_batch_queue_forecasts","planning_wip_inhouse_batches"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] })); };

  const advanceStageMutation = useMutation({ mutationFn: ({ id, newStatus }) => base44.entities.Batch.update(id, { status: newStatus }), onSuccess: () => { invalidateAll(); toast.success("Stage updated"); setSelectedBatch(null); }, onError: (err) => toast.error(`Failed: ${err?.message}`) });
  const returnToQueueMutation = useMutation({ mutationFn: async (batch) => { await base44.entities.Batch.delete(batch.id); try { const prs = await base44.entities.ProductionRequest.filter({ sku: batch.sku, status: "in_production" }); if (prs.length > 0) await base44.entities.ProductionRequest.update(prs[0].id, { status: "approved" }); } catch {} }, onSuccess: () => { invalidateAll(); toast.success("Returned to Batch Queue"); setSelectedBatch(null); }, onError: (err) => toast.error(`Failed: ${err?.message}`) });
  const deleteScheduledMutation = useMutation({ mutationFn: async (batch) => { await base44.entities.Batch.delete(batch.id); try { const prs = await base44.entities.ProductionRequest.filter({ sku: batch.sku, status: "in_production" }); if (prs.length > 0) await base44.entities.ProductionRequest.update(prs[0].id, { status: "approved" }); } catch {} }, onSuccess: () => { invalidateAll(); toast.success("Batch deleted"); setSchedDeleteConfirm(null); setSelectedBatch(null); }, onError: (err) => toast.error(`Failed: ${err?.message}`) });

  const enriched = useMemo(() => batches.filter((b) => b.status && b.status !== "added_to_inventory" || filter === "all").map((b) => ({ ...b, stage: batchStage(b), dates: parseBatchDates(b), lineLabel: parseBatchLine(b) })), [batches, filter]);
  const filtered = useMemo(() => { let items = enriched; if (filter === "this_week") { const wS = getMonday(new Date().toISOString().split("T")[0]); items = items.filter((b) => b.dates.batchDate && b.dates.batchDate >= wS && b.dates.batchDate < addDays(wS, 7)); } else if (filter === "next_week") { const wS = addDays(getMonday(new Date().toISOString().split("T")[0]), 7); items = items.filter((b) => b.dates.batchDate && b.dates.batchDate >= wS && b.dates.batchDate < addDays(wS, 7)); } if (lineFilter !== "all") items = items.filter((b) => String(b.production_line) === lineFilter); return items; }, [enriched, filter, lineFilter]);
  const weekDays = useMemo(() => generateDays(weekStart, 7), [weekStart]);
  const ganttDays = useMemo(() => generateDays(new Date().toISOString().split("T")[0], 30), []);
  const batchesByDate = useMemo(() => { const map = {}; filtered.forEach((b) => { const { batchDate, qcDate, fillDate } = b.dates; if (batchDate) { if (!map[batchDate]) map[batchDate] = []; map[batchDate].push({ ...b, displayStage: "batching" }); } if (qcDate && qcDate !== batchDate) { if (!map[qcDate]) map[qcDate] = []; map[qcDate].push({ ...b, displayStage: "qc_hold" }); } if (fillDate && fillDate !== qcDate) { if (!map[fillDate]) map[fillDate] = []; map[fillDate].push({ ...b, displayStage: "filling" }); } }); return map; }, [filtered]);
  const nextStage = (batch) => { const s = batchStage(batch); if (s === "batching") return { label: "Move to QC Hold", status: "pending_qc" }; if (s === "qc_hold") return { label: "Move to Filling", status: "approved" }; if (s === "filling") return { label: "Mark Complete", status: "added_to_inventory" }; return null; };
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-xs">{Object.entries(STAGE_CONFIG).map(([key, cfg]) => <span key={key} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm ${cfg.fill}`}></span><span className="text-zinc-400">{cfg.label}</span></span>)}</div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[{ key: "all", label: "All" }, { key: "this_week", label: "This Week" }, { key: "next_week", label: "Next Week" }].map((btn) => <button key={btn.key} onClick={() => setFilter(btn.key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === btn.key ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"}`}>{btn.label}</button>)}
          <Select value={lineFilter} onValueChange={setLineFilter}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm w-32"><SelectValue /></SelectTrigger><SelectContent>{[{ key: "all", label: "All Lines" }, { key: "1", label: "Line 1" }, { key: "2", label: "Line 2" }, { key: "3", label: "Melter 1" }, { key: "4", label: "Melter 2" }].map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="flex items-center gap-2">
          {view === "calendar" && <div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="w-4 h-4" /></Button><span className="text-xs text-zinc-400 w-40 text-center">{formatDate(weekStart)} — {formatDate(addDays(weekStart, 6))}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="w-4 h-4" /></Button></div>}
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setView("calendar")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "calendar" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}><Calendar className="w-3.5 h-3.5" />Calendar</button>
            <button onClick={() => setView("gantt")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "gantt" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}><BarChart3 className="w-3.5 h-3.5" />Gantt</button>
          </div>
        </div>
      </div>

      {isLoading ? <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-12 flex items-center justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></CardContent></Card>
      : filtered.length === 0 ? <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-12"><div className="flex flex-col items-center text-center"><div className="p-3 rounded-xl bg-zinc-800 mb-4"><CalendarDays className="w-8 h-8 text-zinc-600" /></div><p className="text-zinc-400 text-sm">No scheduled batches.</p></div></CardContent></Card>
      : view === "calendar" ? (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-0"><div className="grid grid-cols-7 divide-x divide-zinc-800">
          {weekDays.map((day, di) => { const isToday = day === today; const dayBatches = batchesByDate[day] || []; return (
            <div key={day} className="min-h-[160px]">
              <div className={`px-2 py-2 text-center border-b border-zinc-800 ${isToday ? "bg-green-500/10" : ""}`}><div className={`text-xs font-medium ${isToday ? "text-green-400" : "text-zinc-500"}`}>{DAY_NAMES[di]}</div><div className={`text-sm font-semibold ${isToday ? "text-green-400" : "text-zinc-300"}`}>{new Date(day + "T12:00:00").getDate()}</div></div>
              <div className="p-1 space-y-1">{dayBatches.map((b, bi) => { const cfg = STAGE_CONFIG[b.displayStage] || STAGE_CONFIG.batching; return <button key={`${b.id}-${b.displayStage}-${bi}`} onClick={() => setSelectedBatch(b)} className={`w-full text-left px-1.5 py-1 rounded text-xs ${cfg.bg} ${cfg.border} border ${cfg.text} hover:brightness-125 transition-all`}><div className="font-medium truncate">{b.batch_id || b.sku}</div>{b.product_name && <div className="truncate opacity-75 text-[10px]">{b.product_name}</div>}<div className="truncate opacity-75">{cfg.label}</div></button>; })}</div>
            </div>); })}
        </div></CardContent></Card>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-0 overflow-x-auto"><div className="min-w-[900px]">
          <div className="flex border-b border-zinc-800"><div className="w-48 shrink-0 px-3 py-2 text-xs text-zinc-500 font-medium border-r border-zinc-800">Batch</div><div className="flex flex-1">{ganttDays.map((day) => { const isToday = day === today; const d = new Date(day + "T12:00:00"); return <div key={day} className={`flex-1 min-w-[24px] px-0.5 py-2 text-center border-r border-zinc-800/50 ${isToday ? "bg-green-500/5" : ""}`}><div className={`text-[9px] ${isToday ? "text-green-400" : "text-zinc-600"}`}>{d.getDate() === 1 || day === ganttDays[0] ? d.toLocaleString("en", { month: "short" }) : ""}</div><div className={`text-[10px] font-medium ${isToday ? "text-green-400" : "text-zinc-500"}`}>{d.getDate()}</div></div>; })}</div></div>
          {filtered.map((b) => { const { batchDate, qcDate, fillDate } = b.dates; const totalDays = ganttDays.length; const dayIndex = (d) => { if (!d) return -1; return Math.round((new Date(d) - new Date(ganttDays[0])) / 86400000); }; const bI = dayIndex(batchDate), qI = dayIndex(qcDate), fI = dayIndex(fillDate); return (
            <div key={b.id} className="flex border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
              <button onClick={() => setSelectedBatch(b)} className="w-48 shrink-0 px-3 py-2 text-left border-r border-zinc-800 hover:bg-zinc-800/50"><div className="text-xs font-medium text-zinc-200 truncate">{b.product_name}</div><div className="text-[10px] text-zinc-500 font-mono truncate">{b.batch_id || b.sku}</div></button>
              <div className="flex flex-1 relative items-center py-1">
                {bI >= 0 && bI < totalDays && qI > bI && <div className="absolute h-5 rounded-l bg-blue-500/60 border border-blue-500/30" style={{ left: `${(bI / totalDays) * 100}%`, width: `${(Math.min(qI, totalDays) - bI) / totalDays * 100}%` }} />}
                {qI >= 0 && qI < totalDays && fI > qI && <div className="absolute h-5 bg-amber-500/60 border-y border-amber-500/30" style={{ left: `${(qI / totalDays) * 100}%`, width: `${(Math.min(fI, totalDays) - qI) / totalDays * 100}%` }} />}
                {fI >= 0 && fI < totalDays && <div className="absolute h-5 rounded-r bg-green-500/60 border border-green-500/30" style={{ left: `${(fI / totalDays) * 100}%`, width: `${Math.max(1 / totalDays * 100, 3)}%` }} />}
              </div>
            </div>); })}
        </div></CardContent></Card>
      )}

      <Dialog open={!!selectedBatch} onOpenChange={(open) => !open && setSelectedBatch(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          {selectedBatch && (() => { const b = selectedBatch; const stage = batchStage(b); const cfg = STAGE_CONFIG[stage]; const { batchDate, qcDate, fillDate } = parseBatchDates(b); const next = nextStage(b); return (<>
            <DialogHeader><DialogTitle className="flex items-center gap-2">{b.batch_id || b.product_name}<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.text}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>{cfg.label}</span></DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-zinc-500 text-xs">Product</span><p className="text-zinc-200">{b.product_name}</p></div>
                <div><span className="text-zinc-500 text-xs">SKU</span><p className="text-zinc-200 font-mono">{b.sku}</p></div>
                <div><span className="text-zinc-500 text-xs">Quantity</span><p className="text-zinc-200">{b.quantity?.toLocaleString()}</p></div>
                <div><span className="text-zinc-500 text-xs">Line</span><p className="text-zinc-200">{parseBatchLine(b)}</p></div>
                <div><span className="text-zinc-500 text-xs">Operator</span><p className="text-zinc-200">{b.operator || "—"}</p></div>
                <div><span className="text-zinc-500 text-xs">Status</span><p className="text-zinc-200">{b.status}</p></div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/50 text-xs text-zinc-400"><CalendarDays className="w-4 h-4 text-zinc-500 shrink-0" /><span><span className="text-blue-400">Batch</span> {formatDate(batchDate)}<span className="text-zinc-600 mx-1.5">→</span><span className="text-amber-400">QC</span> {formatDate(qcDate)}<span className="text-zinc-600 mx-1.5">→</span><span className="text-green-400">Fill</span> {formatDate(fillDate)}</span></div>
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <div className="flex items-center gap-2 mr-auto">
                <Button variant="outline" size="sm" onClick={() => returnToQueueMutation.mutate(b)} disabled={returnToQueueMutation.isPending || deleteScheduledMutation.isPending} className="border-zinc-700 text-zinc-400 hover:text-zinc-200">{returnToQueueMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ArrowLeft className="w-4 h-4 mr-1.5" />}Return to Queue</Button>
                <Button variant="outline" size="sm" onClick={() => setSchedDeleteConfirm(b)} disabled={returnToQueueMutation.isPending || deleteScheduledMutation.isPending} className="border-red-500/30 text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4 mr-1.5" />Delete</Button>
              </div>
              {next && <Button onClick={() => advanceStageMutation.mutate({ id: b.id, newStatus: next.status })} disabled={advanceStageMutation.isPending} className={next.status === "pending_qc" ? "bg-amber-600 hover:bg-amber-700 text-white" : next.status === "approved" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-zinc-600 hover:bg-zinc-700 text-white"}>{advanceStageMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}{next.label}</Button>}
              <Button variant="outline" onClick={() => setSelectedBatch(null)} className="border-zinc-700">Close</Button>
            </DialogFooter>
          </>); })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!schedDeleteConfirm} onOpenChange={(open) => { if (!open) setSchedDeleteConfirm(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle>Delete Scheduled Batch</DialogTitle></DialogHeader>
          {schedDeleteConfirm && <div className="space-y-3 py-2"><p className="text-sm text-zinc-400">Delete batch <span className="text-zinc-200 font-mono">{schedDeleteConfirm.batch_id}</span> for <span className="text-zinc-200">{schedDeleteConfirm.product_name}</span>?</p><p className="text-xs text-zinc-500">The batch will be removed and the request returned to queue.</p></div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedDeleteConfirm(null)} className="border-zinc-700">Cancel</Button>
            <Button onClick={() => deleteScheduledMutation.mutate(schedDeleteConfirm)} disabled={deleteScheduledMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{deleteScheduledMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}Delete Batch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}