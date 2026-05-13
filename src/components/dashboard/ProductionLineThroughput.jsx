import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, Clock, Gauge } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Lines run Mon–Fri. Window = last 5 working days (rolling 7-day calendar window).
const WINDOW_CALENDAR_DAYS = 7;

function computeLineStats(batches, lineCapacities) {
  // Consider batches that represent planned/in-progress/completed work in the window
  const countedStatuses = [
    "draft", "started", "on_hold", "pending_qc",
    "in_review", "approved", "added_to_inventory",
  ];

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - WINDOW_CALENDAR_DAYS);

  // Group batches by line, filtered by window + status; track active dates per line
  const byLine = {};
  const datesByLine = {};
  for (const batch of batches) {
    if (!countedStatuses.includes(batch.status)) continue;
    const dateStr = batch.production_date || batch.batch_date || batch.created_date;
    let dayKey = null;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d) && d < windowStart) continue;
      if (!isNaN(d)) {
        const dow = d.getDay(); // 0 Sun ... 6 Sat — only count weekdays
        if (dow >= 1 && dow <= 5) {
          dayKey = d.toISOString().slice(0, 10);
        }
      }
    }
    const line = batch.production_line ?? "?";
    if (!byLine[line]) byLine[line] = [];
    byLine[line].push(batch);
    if (dayKey) {
      if (!datesByLine[line]) datesByLine[line] = new Set();
      datesByLine[line].add(dayKey);
    }
  }

  // Show every active configured line, even with zero batches
  const allLineKeys = new Set([
    ...Object.keys(byLine),
    ...lineCapacities.filter(c => c.active !== false).map(c => String(c.line_number)),
  ]);

  return Array.from(allLineKeys).map((line) => {
    const lineNum = Number(line);
    const lineBatches = byLine[line] || [];
    const capacity = lineCapacities.find(c => c.line_number === lineNum);

    // Planned = sum of batch.quantity (operator-planned target)
    const totalPlanned = lineBatches.reduce((s, b) => s + (b.quantity || 0), 0);

    // Actually produced = actual_yield_units when set, else labeled_qty, else 0 for in-progress
    const totalProduced = lineBatches.reduce((s, b) => {
      const yieldQty = b.actual_yield_units ?? b.labeled_qty ?? 0;
      return s + (yieldQty || 0);
    }, 0);

    // Utilization = produced / planned
    const utilizationRate = totalPlanned > 0 ? totalProduced / totalPlanned : null;
    const utilPct = utilizationRate != null ? Math.round(utilizationRate * 100) : null;

    let status = "no_data";
    if (utilizationRate === null) status = "no_plan";
    else if (utilizationRate >= 1.05) status = "over";
    else if (utilizationRate >= 0.75) status = "on_track";
    else if (utilizationRate >= 0.4)  status = "slow";
    else status = "behind";

    const started = lineBatches.filter(b => b.status === "started").length;
    const onHold = lineBatches.filter(b => b.status === "on_hold").length;

    // Days utilized: how many of the last 5 working days had production activity
    const daysUsed = Math.min(5, (datesByLine[line]?.size) || 0);
    const daysRate = daysUsed / 5;
    let daysStatus = "behind";
    if (daysRate >= 1) daysStatus = "on_track";
    else if (daysRate >= 0.6) daysStatus = "slow";
    else if (daysRate > 0) daysStatus = "behind";
    else daysStatus = "no_plan";

    return {
      line: lineNum,
      lineName: capacity?.line_name || `Line ${line}`,
      batchCount: lineBatches.length,
      started,
      onHold,
      totalPlanned,
      totalProduced,
      utilizationRate,
      utilPct,
      status,
      daysUsed,
      daysRate,
      daysStatus,
      batches: lineBatches,
    };
  }).sort((a, b) => a.line - b.line);
}

const STATUS_CONFIG = {
  behind:   { color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    bar: "bg-red-500",    icon: AlertTriangle, label: "Behind Plan" },
  slow:     { color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30",  bar: "bg-amber-400",  icon: Clock,          label: "Lagging" },
  on_track: { color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30",  bar: "bg-green-500",  icon: CheckCircle2,   label: "On Plan" },
  over:     { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", bar: "bg-orange-500", icon: AlertTriangle,  label: "Over Plan" },
  no_plan:  { color: "text-zinc-400",   bg: "bg-zinc-800",      border: "border-zinc-700",      bar: "bg-zinc-600",   icon: Gauge,          label: "No Plan" },
  no_data:  { color: "text-zinc-400",   bg: "bg-zinc-800",      border: "border-zinc-700",      bar: "bg-zinc-600",   icon: Gauge,          label: "No Data" },
};

function ThroughputBar({ rate, status }) {
  const cfg = STATUS_CONFIG[status];
  // Scale bar 0..130% so an overloaded line shows past the 100% marker
  const pct = rate != null ? Math.min(Math.max(rate * 100, 0), 130) : 0;
  const displayPct = (pct / 130) * 100;

  return (
    <div className="relative mt-2">
      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
      {/* 100% target marker */}
      <div className="absolute top-0 bottom-0 w-px bg-zinc-500/60" style={{ left: "calc(100% * 100/130)" }} />
    </div>
  );
}

export default function ProductionLineThroughput({ batches = [] }) {
  const { data: lineCapacities = [] } = useQuery({
    queryKey: ["line_capacity"],
    queryFn: () => base44.entities.ProductionLineCapacity.list(),
    staleTime: 60000,
  });

  const lines = useMemo(
    () => computeLineStats(batches, lineCapacities),
    [batches, lineCapacities]
  );

  if (lines.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-400" />
            Production Line Throughput
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-500 text-sm py-4 text-center">No active batches on any production line</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-400" />
            Production Line Throughput
          </CardTitle>
          <span className="text-xs text-zinc-500">Produced vs planned (last 5 working days)</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {lines.map((line) => {
          const cfg = STATUS_CONFIG[line.status];
          const Icon = cfg.icon;
          const isBehind = line.status === "behind" || line.status === "slow";

          return (
            <Link key={line.line} to={createPageUrl("ProductionPlanning")} className="block">
              <div className={`p-4 rounded-lg border transition-all hover:opacity-90 ${cfg.bg} ${cfg.border} ${isBehind ? "animate-pulse-subtle" : ""}`}>
                {/* Line Header */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                    <span className={`font-semibold text-sm ${cfg.color}`}>{line.lineName}</span>
                    <span className="text-xs text-zinc-500">
                      {line.batchCount} batch{line.batchCount !== 1 ? "es" : ""}
                      {line.started > 0 && <span className="ml-1 text-blue-400">• {line.started} running</span>}
                      {line.onHold > 0 && <span className="ml-1 text-amber-400">• {line.onHold} on hold</span>}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${cfg.color}`}>
                      {line.utilPct != null ? `${line.utilPct}%` : "—"}
                    </span>
                  </div>
                </div>

                {/* Progress Bar — Produced vs Planned */}
                <ThroughputBar rate={line.utilizationRate} status={line.status} />

                {/* Detail Row */}
                <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                  <span>
                    {line.totalProduced.toLocaleString()} produced / {line.totalPlanned.toLocaleString()} planned
                  </span>
                  <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>

                {/* Days Utilized Bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="text-zinc-500">Days utilized</span>
                    <span className={`font-semibold ${STATUS_CONFIG[line.daysStatus].color}`}>
                      {line.daysUsed} / 5 days
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${STATUS_CONFIG[line.daysStatus].bar}`}
                      style={{ width: `${(line.daysUsed / 5) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Status warnings */}
                {line.status === "no_plan" && (
                  <div className="mt-2 text-xs text-zinc-400 bg-zinc-800/40 border border-zinc-700/40 rounded px-2 py-1">
                    No batches planned on this line in the last 5 working days
                  </div>
                )}
                {line.status === "behind" && (
                  <div className="mt-2 text-xs text-red-300 bg-red-900/20 border border-red-700/30 rounded px-2 py-1">
                    ⚠ Production is significantly behind plan — review active batches
                  </div>
                )}
                {line.status === "over" && (
                  <div className="mt-2 text-xs text-orange-300 bg-orange-900/20 border border-orange-700/30 rounded px-2 py-1">
                    ✓ Producing above plan — confirm yields and update targets
                  </div>
                )}
              </div>
            </Link>
          );
        })}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 pt-1 border-t border-zinc-800 text-xs text-zinc-500">
          <span>Actually produced ÷ planned (5 working days):</span>
          <span className="text-red-400">&lt;40% behind</span>
          <span className="text-amber-400">40–75% lagging</span>
          <span className="text-green-400">75–105% on plan</span>
          <span className="text-orange-400">&gt;105% over plan</span>
        </div>
      </CardContent>
    </Card>
  );
}