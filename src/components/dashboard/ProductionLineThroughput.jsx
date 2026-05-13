import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, Clock, Gauge } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Days in the rolling window used to compare against line capacity
const CAPACITY_WINDOW_DAYS = 7;
const WORKING_DAYS_PER_WEEK = 5;

function computeLineStats(batches, lineCapacities) {
  // Active or in-flight batches that are consuming line time
  const activeStatuses = ["draft", "started", "on_hold", "pending_qc", "in_review", "approved"];

  // Only look at the rolling window (default 7 days back from now)
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - CAPACITY_WINDOW_DAYS);

  // Group active batches by production line
  const byLine = {};
  for (const batch of batches) {
    if (!activeStatuses.includes(batch.status)) continue;
    const dateStr = batch.production_date || batch.batch_date || batch.created_date;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d) && d < windowStart) continue;
    }
    const line = batch.production_line ?? "?";
    if (!byLine[line]) byLine[line] = [];
    byLine[line].push(batch);
  }

  // Include configured lines even if they have zero batches
  const allLineKeys = new Set([
    ...Object.keys(byLine),
    ...lineCapacities.filter(c => c.active !== false).map(c => String(c.line_number)),
  ]);

  return Array.from(allLineKeys).map((line) => {
    const lineNum = Number(line);
    const lineBatches = byLine[line] || [];
    const capacity = lineCapacities.find(c => c.line_number === lineNum);

    // Total planned units for the window
    const totalPlanned = lineBatches.reduce((s, b) => s + (b.quantity || 0), 0);

    // Weekly capacity = daily capacity × working days
    const dailyCap = capacity?.daily_capacity_units || 0;
    const weeklyCapacity = dailyCap * WORKING_DAYS_PER_WEEK;

    // Utilization rate: planned units / weekly capacity
    const utilizationRate = weeklyCapacity > 0
      ? totalPlanned / weeklyCapacity
      : null;

    const utilPct = utilizationRate != null
      ? Math.round(utilizationRate * 100)
      : null;

    // Determine status (utilization buckets)
    let status = "no_data";
    if (utilizationRate === null) status = "no_data";
    else if (utilizationRate >= 1.05) status = "over";       // overloaded
    else if (utilizationRate >= 0.75) status = "on_track";   // healthy use
    else if (utilizationRate >= 0.4)  status = "slow";       // under-used
    else status = "behind";                                   // very low

    // Count batches by sub-status
    const started = lineBatches.filter(b => b.status === "started").length;
    const onHold = lineBatches.filter(b => b.status === "on_hold").length;

    return {
      line: lineNum,
      lineName: capacity?.line_name || `Line ${line}`,
      batchCount: lineBatches.length,
      started,
      onHold,
      totalPlanned,
      weeklyCapacity,
      dailyCapacity: dailyCap,
      utilizationRate,
      utilPct,
      status,
      batches: lineBatches,
    };
  }).sort((a, b) => a.line - b.line);
}

const STATUS_CONFIG = {
  behind:   { color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    bar: "bg-red-500",    icon: AlertTriangle, label: "Under-utilized" },
  slow:     { color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30",  bar: "bg-amber-400",  icon: Clock,          label: "Capacity Available" },
  on_track: { color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30",  bar: "bg-green-500",  icon: CheckCircle2,   label: "Well Utilized" },
  over:     { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", bar: "bg-orange-500", icon: AlertTriangle,  label: "Overloaded" },
  no_data:  { color: "text-zinc-400",   bg: "bg-zinc-800",      border: "border-zinc-700",      bar: "bg-zinc-600",   icon: Gauge,          label: "No Capacity Set" },
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
          <span className="text-xs text-zinc-500">Capacity utilization (last 7 days)</span>
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

                {/* Progress Bar */}
                <ThroughputBar rate={line.utilizationRate} status={line.status} />

                {/* Detail Row */}
                <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                  <span>
                    {line.totalPlanned.toLocaleString()} units planned /{" "}
                    {line.weeklyCapacity > 0
                      ? `${line.weeklyCapacity.toLocaleString()} capacity (${line.dailyCapacity}/day × ${WORKING_DAYS_PER_WEEK})`
                      : "no capacity configured"}
                  </span>
                  <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>

                {/* Status warnings */}
                {line.status === "no_data" && (
                  <div className="mt-2 text-xs text-zinc-400 bg-zinc-800/40 border border-zinc-700/40 rounded px-2 py-1">
                    No daily capacity configured — set <strong>daily_capacity_units</strong> in Line Capacity settings
                  </div>
                )}
                {line.status === "behind" && line.weeklyCapacity > 0 && (
                  <div className="mt-2 text-xs text-red-300 bg-red-900/20 border border-red-700/30 rounded px-2 py-1">
                    ⚠ Line is significantly under-utilized — consider scheduling more production
                  </div>
                )}
                {line.status === "over" && (
                  <div className="mt-2 text-xs text-orange-300 bg-orange-900/20 border border-orange-700/30 rounded px-2 py-1">
                    ⚠ Planned production exceeds weekly capacity — reschedule or extend lead times
                  </div>
                )}
              </div>
            </Link>
          );
        })}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 pt-1 border-t border-zinc-800 text-xs text-zinc-500">
          <span>Planned units ÷ weekly capacity:</span>
          <span className="text-red-400">&lt;40% under-used</span>
          <span className="text-amber-400">40–75% available</span>
          <span className="text-green-400">75–105% well utilized</span>
          <span className="text-orange-400">&gt;105% overloaded</span>
        </div>
      </CardContent>
    </Card>
  );
}