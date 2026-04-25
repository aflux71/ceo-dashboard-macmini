import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, MapPin, Package, User, Wrench, Clock, CheckCircle2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";

const STAGE_CONFIG = {
  batching:     { label: "Batching",     variant: "blue",   bg: "bg-blue-500/10",   border: "border-blue-500/20",   text: "text-blue-400" },
  qc_hold:      { label: "QC Hold",      variant: "amber",  bg: "bg-amber-500/10",  border: "border-amber-500/20",  text: "text-amber-400" },
  filling:      { label: "Filling",      variant: "green",  bg: "bg-green-500/10",  border: "border-green-500/20",  text: "text-green-400" },
  review_queue: { label: "Review Queue", variant: "purple", bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400" },
  complete:     { label: "Complete",     variant: "default",bg: "bg-zinc-800/40",   border: "border-zinc-700/30",   text: "text-zinc-400" },
  scheduled:    { label: "Scheduled",    variant: "cyan",   bg: "bg-cyan-500/10",   border: "border-cyan-500/20",   text: "text-cyan-400" },
};

const TASK_TYPE_CONFIG = {
  cleaning:      { label: "Cleaning",      variant: "blue" },
  setup:         { label: "Setup",          variant: "orange" },
  maintenance:   { label: "Maintenance",    variant: "amber" },
  break:         { label: "Break",          variant: "default" },
  training:      { label: "Training",       variant: "purple" },
  administrative:{ label: "Administrative", variant: "cyan" },
  other:         { label: "Other",          variant: "default" },
};

function batchStage(b) {
  const s = b.status;
  if (s === "added_to_inventory") return "complete";
  if (s === "in_review") return "review_queue";
  if (s === "approved") return "filling";
  if (s === "pending_qc" || s === "on_hold") return "qc_hold";
  return "batching";
}

function parseBatchLine(b) {
  const l = b.production_line;
  if (l === 1) return "Line 1"; if (l === 2) return "Line 2";
  if (l === 3) return "Melter 1"; if (l === 4) return "Melter 2";
  return l ? `Line ${l}` : "—";
}

function BatchCard({ batch, inventory, labels }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const stage = batchStage(batch);
  const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG.batching;
  const lineLabel = parseBatchLine(batch);

  const today = new Date().toISOString().split("T")[0];
  const batchDate = batch.production_date ? batch.production_date.split("T")[0] : null;
  const isOverdue = stage === "batching" && batchDate && batchDate < today;

  // Find bin locations for ingredients from inventory
  const ingredientBins = (batch._recipe?.ingredients || [])
    .map((ing) => {
      const inv = inventory.find((i) => i.sku?.toLowerCase() === ing.sku?.toLowerCase());
      return inv?.location ? { name: ing.material || ing.sku, bin: inv.location, sku: ing.sku } : null;
    })
    .filter(Boolean);

  // Labels bin locations
  const labelBins = labels
    .filter((l) => l.product_sku === batch.sku && l.bin_location)
    .map((l) => ({ name: l.name, bin: l.bin_location }));

  const advanceMutation = useMutation({
    mutationFn: ({ id, newStatus }) => base44.entities.Batch.update(id, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopfloor_batches"] });
      toast.success("Stage updated");
    },
    onError: (err) => toast.error(`Failed: ${err?.message}`),
  });

  const nextAction = () => {
    if (stage === "batching") return { label: "→ QC Hold", status: "pending_qc" };
    if (stage === "qc_hold") return { label: "→ Filling", status: "approved" };
    if (stage === "filling") return { label: "→ Review", status: "in_review" };
    return null;
  };
  const next = nextAction();

  return (
    <div className={`rounded-lg border ${cfg.border} ${isOverdue ? "border-red-500/40" : ""} bg-zinc-900 overflow-hidden`}>
      {/* Header */}
      <div className={`px-3 py-2 ${cfg.bg} flex items-center justify-between gap-2`}>
        <span className={`text-xs font-mono truncate ${cfg.text}`}>{batch.batch_id}</span>
        <div className="flex items-center gap-1 shrink-0">
          {isOverdue && <Badge variant="red">Overdue</Badge>}
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-2">
        <p className="text-sm font-medium text-zinc-100 leading-tight">{batch.product_name}</p>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div className="flex items-center gap-1 text-zinc-500">
            <Package className="w-3 h-3" />
            <span className="text-zinc-300">{batch.quantity?.toLocaleString()} units</span>
          </div>
          <div className="flex items-center gap-1 text-zinc-500">
            <span>{lineLabel}</span>
          </div>
          <div className="flex items-center gap-1 text-zinc-500 col-span-2">
            <User className="w-3 h-3" />
            <span className="text-zinc-300">{batch.operator || "Unassigned"}</span>
          </div>
        </div>

        {/* Bin locations toggle */}
        {(ingredientBins.length > 0 || labelBins.length > 0) && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-400 transition-colors"
          >
            <MapPin className="w-3 h-3" />
            Bin Locations
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        {expanded && (
          <div className="space-y-1 pt-1 border-t border-zinc-800">
            {ingredientBins.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 truncate">{b.name}</span>
                <span className="text-orange-400 font-mono shrink-0 ml-2">{b.bin}</span>
              </div>
            ))}
            {labelBins.map((b, i) => (
              <div key={`lbl-${i}`} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 truncate">🏷 {b.name}</span>
                <span className="text-orange-400 font-mono shrink-0 ml-2">{b.bin}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        {next && stage !== "complete" && stage !== "review_queue" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => advanceMutation.mutate({ id: batch.id, newStatus: next.status })}
            disabled={advanceMutation.isPending}
            className="w-full text-xs h-7 border-zinc-700 hover:border-orange-500/40 hover:text-orange-400 hover:bg-orange-500/5"
          >
            {advanceMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ArrowRight className="w-3 h-3 mr-1" />}
            {next.label}
          </Button>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onComplete }) {
  const tcfg = TASK_TYPE_CONFIG[task.task_type] || TASK_TYPE_CONFIG.other;
  const statusVariant = task.status === "completed" ? "green" : task.status === "in_progress" ? "blue" : "default";

  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-3 h-3 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-300">{task.task_name}</span>
        </div>
        <Badge variant={tcfg.variant}>{tcfg.label}</Badge>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        {task.start_time && task.end_time && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {task.start_time}–{task.end_time}
          </span>
        )}
        {task.operator && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {task.operator}
          </span>
        )}
      </div>
      <Badge variant={statusVariant}>{task.status}</Badge>
      {task.status !== "completed" && (
        <button
          onClick={() => onComplete(task)}
          className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors mt-1"
        >
          <CheckCircle2 className="w-3 h-3" />
          Mark Complete
        </button>
      )}
    </div>
  );
}

export default function ShopFloorDayColumn({ date, dayLabel, isToday, batches, tasks, inventory, labels, onAddTask, onCompleteTask }) {
  const batchCount = batches.length;
  const taskCount = tasks.length;

  return (
    <div className={`min-w-[220px] flex flex-col rounded-xl border ${isToday ? "border-orange-500/30 bg-orange-500/5" : "border-zinc-800 bg-zinc-900/30"}`}>
      {/* Day Header */}
      <div className={`px-3 py-3 border-b ${isToday ? "border-orange-500/20" : "border-zinc-800"}`}>
        <div className={`text-sm font-bold ${isToday ? "text-orange-400" : "text-zinc-200"}`}>{dayLabel}</div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {batchCount} batch{batchCount !== 1 ? "es" : ""} · {taskCount} task{taskCount !== 1 ? "s" : ""}
        </div>
        {isToday && <div className="text-xs text-orange-400/70 mt-0.5 font-medium">TODAY</div>}
      </div>

      {/* Content */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
        {/* Batches */}
        {batches.map((batch) => (
          <BatchCard key={batch.id} batch={batch} inventory={inventory} labels={labels} />
        ))}

        {/* Tasks */}
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onComplete={onCompleteTask} />
        ))}

        {/* Empty state */}
        {batchCount === 0 && taskCount === 0 && (
          <div className="text-center py-6 text-zinc-600 text-xs">No items</div>
        )}

        {/* Add task button */}
        <button
          onClick={() => onAddTask(date)}
          className="w-full text-xs text-zinc-600 hover:text-zinc-400 border border-dashed border-zinc-800 hover:border-zinc-600 rounded-lg py-2 transition-colors"
        >
          + Add Task
        </button>
      </div>
    </div>
  );
}