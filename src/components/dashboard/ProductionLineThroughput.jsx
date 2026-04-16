import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, Clock, Gauge } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// How many minutes ago is considered "active" for a batch
const ACTIVE_WINDOW_MINUTES = 480; // 8-hour shift

function computeLineStats(batches, recipes, lineCapacities) {
  const now = Date.now();
  const activeStatuses = ["started", "on_hold", "pending_qc", "in_review"];

  // Group active batches by production line
  const byLine = {};
  for (const batch of batches) {
    if (!activeStatuses.includes(batch.status)) continue;
    const line = batch.production_line ?? "?";
    if (!byLine[line]) byLine[line] = [];
    byLine[line].push(batch);
  }

  return Object.entries(byLine).map(([line, lineBatches]) => {
    const lineNum = Number(line);
    const capacity = lineCapacities.find(c => c.line_number === lineNum);

    // Sum planned quantity for all active batches on this line
    const totalPlanned = lineBatches.reduce((s, b) => s + (b.quantity || 0), 0);

    // Materials consumed: sum actual_qty across all material_usage entries
    const totalMaterialConsumed = lineBatches.reduce((s, b) => {
      const used = (b.material_usage || []).reduce((ms, m) => ms + (m.actual_qty || 0), 0);
      return s + used;
    }, 0);

    // Materials expected (from recipe): sum expected_qty across all material_usage entries
    const totalMaterialExpected = lineBatches.reduce((s, b) => {
      const expected = (b.material_usage || []).reduce((ms, m) => ms + (m.expected_qty || 0), 0);
      return s + expected;
    }, 0);

    // Throughput rate: actual / expected (1.0 = on track, <1.0 = behind, >1.0 = ahead)
    const consumptionRate = totalMaterialExpected > 0
      ? totalMaterialConsumed / totalMaterialExpected
      : null;

    // Variance percentage (negative = behind)
    const variancePct = consumptionRate != null
      ? Math.round((consumptionRate - 1) * 100)
      : null;

    // Determine status
    let status = "on_track";
    if (consumptionRate === null) status = "no_data";
    else if (consumptionRate < 0.8) status = "behind";
    else if (consumptionRate < 0.95) status = "slow";
    else status = "on_track";

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
      totalMaterialConsumed,
      totalMaterialExpected,
      consumptionRate,
      variancePct,
      status,
      batches: lineBatches,
    };
  }).sort((a, b) => a.line - b.line);
}

const STATUS_CONFIG = {
  behind:   { color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    bar: "bg-red-500",    icon: AlertTriangle, label: "Behind" },
  slow:     { color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30",  bar: "bg-amber-400",  icon: Clock,          label: "Slow" },
  on_track: { color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30",  bar: "bg-green-500",  icon: CheckCircle2,   label: "On Track" },
  no_data:  { color: "text-zinc-400",   bg: "bg-zinc-800",      border: "border-zinc-700",      bar: "bg-zinc-600",   icon: Gauge,          label: "No Data" },
};

function ThroughputBar({ rate, status }) {
  const cfg = STATUS_CONFIG[status];
  const pct = rate != null ? Math.min(Math.max(rate * 100, 0), 130) : 0;
  const displayPct = Math.min(pct, 100); // cap bar at 100% visually

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

export default function ProductionLineThroughput({ batches = [], recipes = [] }) {
  const { data: lineCapacities = [] } = useQuery({
    queryKey: ["line_capacity"],
    queryFn: () => base44.entities.ProductionLineCapacity.list(),
    staleTime: 60000,
  });

  const lines = useMemo(
    () => computeLineStats(batches, recipes, lineCapacities),
    [batches, recipes, lineCapacities]
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
          <span className="text-xs text-zinc-500">Material consumption rate vs. plan</span>
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
                      {line.consumptionRate != null
                        ? `${Math.round(line.consumptionRate * 100)}%`
                        : "—"}
                    </span>
                    {line.variancePct != null && line.variancePct !== 0 && (
                      <span className={`ml-1 text-xs ${line.variancePct < 0 ? "text-red-400" : "text-green-400"}`}>
                        ({line.variancePct > 0 ? "+" : ""}{line.variancePct}%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <ThroughputBar rate={line.consumptionRate} status={line.status} />

                {/* Detail Row */}
                <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                  <span>
                    {line.totalMaterialConsumed.toFixed(1)} consumed / {line.totalMaterialExpected.toFixed(1)} expected
                  </span>
                  <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>

                {/* Behind warning */}
                {line.status === "behind" && (
                  <div className="mt-2 text-xs text-red-300 bg-red-900/20 border border-red-700/30 rounded px-2 py-1">
                    ⚠ This line is significantly behind scheduled material consumption — review active batches
                  </div>
                )}
                {line.status === "slow" && (
                  <div className="mt-2 text-xs text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded px-2 py-1">
                    ↙ Consumption pace is below target — monitor for delays
                  </div>
                )}
              </div>
            </Link>
          );
        })}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 pt-1 border-t border-zinc-800 text-xs text-zinc-500">
          <span>Bar shows actual vs. expected material use.</span>
          <span className="text-red-400">Red &lt;80%</span>
          <span className="text-amber-400">Amber 80–95%</span>
          <span className="text-green-400">Green ≥95%</span>
        </div>
      </CardContent>
    </Card>
  );
}