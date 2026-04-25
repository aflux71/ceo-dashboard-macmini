import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Factory, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ShopFloorDayColumn from "@/components/shopfloor/ShopFloorDayColumn";
import AddTaskDialog from "@/components/shopfloor/AddTaskDialog";

// ── Date helpers ────────────────────────────────────────────────────────────
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
function getMonday(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}
function formatDayLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
}
function generateDays(startDate, count) {
  return Array.from({ length: count }, (_, i) => addDays(startDate, i));
}

// ── Batch stage/date helpers ────────────────────────────────────────────────
function batchStage(b) {
  const s = b.status;
  if (s === "added_to_inventory") return "complete";
  if (s === "in_review") return "review_queue";
  if (s === "approved") return "filling";
  if (s === "pending_qc" || s === "on_hold") return "qc_hold";
  return "batching";
}

function parseBatchDates(b) {
  const batchDate = b.production_date ? b.production_date.split("T")[0] : null;
  let qcDate = null, fillDate = null;
  const notes = b.notes || "";
  const qcM = notes.match(/QC hold date:\s*(\d{4}-\d{2}-\d{2})/);
  if (qcM) qcDate = qcM[1];
  const fM = notes.match(/Fill date:\s*(\d{4}-\d{2}-\d{2})/);
  if (fM) fillDate = fM[1];
  if (batchDate && !qcDate) qcDate = addDays(batchDate, 3);
  if (qcDate && !fillDate) fillDate = addDays(qcDate, 1);
  return { batchDate, qcDate, fillDate };
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ShopFloorView() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const [weekStart, setWeekStart] = useState(() => getMonday(today));
  const [numDays, setNumDays] = useState(5);
  const [addTaskDialog, setAddTaskDialog] = useState(null); // date string or null
  const [lineFilter, setLineFilter] = useState("all");
  const [hideWeekends, setHideWeekends] = useState(false);

  const days = useMemo(() => {
    if (!hideWeekends) return generateDays(weekStart, numDays);
    // Generate enough days to collect numDays weekdays
    const result = [];
    let i = 0;
    while (result.length < numDays) {
      const d = addDays(weekStart, i++);
      const dow = new Date(d + "T12:00:00").getDay();
      if (dow !== 0 && dow !== 6) result.push(d);
      if (i > 30) break; // safety
    }
    return result;
  }, [weekStart, numDays, hideWeekends]);

  // ── Data fetching ────────────────────────────────────────────────────────
  const { data: batches = [], isLoading: loadingBatches, refetch: refetchBatches } = useQuery({
    queryKey: ["shopfloor_batches"],
    queryFn: () => base44.entities.Batch.list("-created_date", 500),
  });

  const { data: tasks = [], isLoading: loadingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ["shopfloor_tasks"],
    queryFn: () => base44.entities.ShopFloorTask.list("-task_date", 200),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["shopfloor_inventory"],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const { data: labels = [] } = useQuery({
    queryKey: ["shopfloor_labels"],
    queryFn: () => base44.entities.Label.list(),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["shopfloor_recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  // ── Recipe map for bin lookups ──────────────────────────────────────────
  const recipeMap = useMemo(() => {
    const map = {};
    recipes.forEach((r) => { if (r.sku) map[r.sku.toLowerCase()] = r; });
    return map;
  }, [recipes]);

  // ── Enrich batches with recipe + dates ─────────────────────────────────
  const enrichedBatches = useMemo(() => {
    return batches
      .filter((b) => { const pt = b.production_type; return !pt || pt === "make"; })
      .filter((b) => b.status !== "added_to_inventory")
      .map((b) => ({
        ...b,
        stage: batchStage(b),
        dates: parseBatchDates(b),
        _recipe: recipeMap[b.sku?.toLowerCase()] || null,
      }));
  }, [batches, recipeMap]);

  // ── Group batches by day ─────────────────────────────────────────────────
  const batchesByDay = useMemo(() => {
    const map = {};
    days.forEach((d) => { map[d] = []; });

    enrichedBatches.forEach((b) => {
      const { batchDate, qcDate, fillDate } = b.dates;
      const stage = b.stage;

      // Show batch on its relevant active date based on current stage
      let activeDate = null;
      if (stage === "batching") activeDate = batchDate;
      else if (stage === "qc_hold") activeDate = qcDate;
      else if (stage === "filling") activeDate = fillDate;
      else if (stage === "review_queue") activeDate = fillDate || qcDate || batchDate;

      if (activeDate && map[activeDate] !== undefined) {
        // Line filter
        if (lineFilter !== "all" && String(b.production_line) !== lineFilter) return;
        map[activeDate].push(b);
      }
    });

    return map;
  }, [enrichedBatches, days, lineFilter]);

  // ── Group tasks by day ───────────────────────────────────────────────────
  const tasksByDay = useMemo(() => {
    const map = {};
    days.forEach((d) => { map[d] = []; });
    tasks.forEach((t) => {
      if (t.task_date && map[t.task_date] !== undefined) {
        if (lineFilter !== "all" && t.production_line && String(t.production_line) !== lineFilter) return;
        map[t.task_date].push(t);
      }
    });
    return map;
  }, [tasks, days, lineFilter]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const createTaskMutation = useMutation({
    mutationFn: (data) => base44.entities.ShopFloorTask.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopfloor_tasks"] });
      toast.success("Task added");
      setAddTaskDialog(null);
    },
    onError: (err) => toast.error(`Failed: ${err?.message}`),
  });

  const completeTaskMutation = useMutation({
    mutationFn: (task) => base44.entities.ShopFloorTask.update(task.id, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopfloor_tasks"] });
      toast.success("Task completed");
    },
    onError: (err) => toast.error(`Failed: ${err?.message}`),
  });

  const isLoading = loadingBatches || loadingTasks;

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = enrichedBatches.filter((b) => b.stage !== "complete");
    const todayBatches = batchesByDay[today] || [];
    const overdue = active.filter((b) => {
      const { batchDate } = b.dates;
      return b.stage === "batching" && batchDate && batchDate < today;
    });
    return { total: active.length, todayCount: todayBatches.length, overdue: overdue.length };
  }, [enrichedBatches, batchesByDay, today]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Factory className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Shop Floor View</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Daily production schedule — batches &amp; floor tasks</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { refetchBatches(); refetchTasks(); }}
          className="text-zinc-400 hover:text-zinc-200 self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 hover:border-orange-500/20 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Active Batches</p>
          <p className="text-2xl font-bold text-orange-500 mt-1">{stats.total}</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 hover:border-blue-500/20 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Due Today</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{stats.todayCount}</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 hover:border-red-500/20 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Overdue</p>
          <p className={`text-2xl font-bold mt-1 ${stats.overdue > 0 ? "text-red-400" : "text-zinc-600"}`}>{stats.overdue}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Week nav */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-200" onClick={() => setWeekStart(addDays(weekStart, -numDays))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <button
            onClick={() => setWeekStart(getMonday(today))}
            className="text-xs text-zinc-400 hover:text-orange-400 px-2 py-1 rounded hover:bg-orange-500/10 transition-colors"
          >
            Today
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-200" onClick={() => setWeekStart(addDays(weekStart, numDays))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Days shown */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            {[3, 5, 7].map((n) => (
              <button
                key={n}
                onClick={() => setNumDays(n)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${numDays === n ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                {n}d
              </button>
            ))}
          </div>

          {/* Hide weekends toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-zinc-400">Hide Weekends</span>
            <div
              onClick={() => setHideWeekends((h) => !h)}
              className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${hideWeekends ? "bg-orange-500" : "bg-zinc-700"}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ${hideWeekends ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
          </label>

          {/* Line filter */}
          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lines</SelectItem>
              <SelectItem value="1">Line 1</SelectItem>
              <SelectItem value="2">Line 2</SelectItem>
              <SelectItem value="3">Melter 1</SelectItem>
              <SelectItem value="4">Melter 2</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Day Columns */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {days.map((date) => (
            <div key={date} className="flex-shrink-0 w-[260px]">
              <ShopFloorDayColumn
                date={date}
                dayLabel={formatDayLabel(date)}
                isToday={date === today}
                batches={batchesByDay[date] || []}
                tasks={tasksByDay[date] || []}
                inventory={inventory}
                labels={labels}
                onAddTask={(d) => setAddTaskDialog(d)}
                onCompleteTask={(task) => completeTaskMutation.mutate(task)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add Task Dialog */}
      <AddTaskDialog
        open={!!addTaskDialog}
        onClose={() => setAddTaskDialog(null)}
        onSave={(data) => createTaskMutation.mutate(data)}
        defaultDate={addTaskDialog}
        isLoading={createTaskMutation.isPending}
      />
    </div>
  );
}