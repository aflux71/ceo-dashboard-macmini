import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Database, RefreshCw, Package, ShoppingCart, GitMerge,
  AlertCircle, Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import { formatNumber } from "@/components/demand/demandHelpers";
import { base44 } from "@/api/base44Client";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Build month list (mirrors server)
function buildMonthList() {
  const now = new Date();
  const months = [];
  for (let m = 1; m <= 12; m++) months.push({ year: 2025, month: m });
  if (now.getFullYear() > 2025) {
    for (let m = 1; m <= now.getMonth() + 1; m++) {
      months.push({ year: now.getFullYear(), month: m });
    }
  }
  return months;
}

const TOTAL_MONTHS = buildMonthList().length;

export default function DataTab({
  baselineInfo,
  summaryCount,
  inventoryCount,
  shopifyRecordCount,
  lastSync,
  onRebuildComplete,
  onRerunAliases,
}) {
  const [jobStatus, setJobStatus] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: TOTAL_MONTHS, phase: '', detail: '' });

  // Check persisted status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await base44.functions.invoke("rebuildDemandSummariesBackground", { action: "status" });
      setJobStatus(res.data);
    } catch (e) {
      setJobStatus(null);
    }
  };

  const handleReset = async () => {
    try {
      await base44.functions.invoke("rebuildDemandSummariesBackground", { action: "reset" });
    } catch (e) {}
    setJobStatus(null);
    setIsRunning(false);
    setErrorMsg(null);
    setProgress({ current: 0, total: TOTAL_MONTHS, phase: '', detail: '' });
  };

  // Step-by-step rebuild driven from the frontend
  const handleStartRebuild = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    setProgress({ current: 0, total: TOTAL_MONTHS, phase: 'aggregating', detail: 'Starting...' });

    const startedAt = new Date().toISOString();
    let monthIndex = 0;
    let totalUnique = 0;

    try {
      // Phase 1: step through each month
      while (monthIndex < TOTAL_MONTHS) {
        const res = await base44.functions.invoke("rebuildDemandSummariesBackground", {
          action: "step",
          monthIndex,
          startedAt,
        });

        if (res.data?.error) throw new Error(res.data.error);

        monthIndex = res.data.monthIndex;
        totalUnique += (res.data.recordCount || 0);

        setProgress({
          current: monthIndex,
          total: TOTAL_MONTHS,
          phase: 'aggregating',
          detail: res.data.detail || `Month ${monthIndex}/${TOTAL_MONTHS}`,
        });
      }

      // Phase 2: finalize (delete old + write new)
      setProgress({ current: TOTAL_MONTHS, total: TOTAL_MONTHS, phase: 'finalizing', detail: 'Writing summaries...' });

      const finalRes = await base44.functions.invoke("rebuildDemandSummariesBackground", {
        action: "finalize",
        totalUnique,
      });

      if (finalRes.data?.error) throw new Error(finalRes.data.error);

      const doneStatus = {
        state: 'done',
        created: finalRes.data.created,
        deleted: finalRes.data.deleted,
        completedAt: new Date().toISOString(),
      };
      setJobStatus(doneStatus);

      if (onRebuildComplete) onRebuildComplete(doneStatus);

    } catch (e) {
      console.error("Rebuild error:", e);
      setErrorMsg(e.message);
      setJobStatus({ state: 'error', error: e.message });
    }

    setIsRunning(false);
  };

  const handleRerun = async () => {
    setIsRerunning(true);
    await onRerunAliases();
    setIsRerunning(false);
  };

  const isDone = jobStatus?.state === 'done';
  const isError = jobStatus?.state === 'error' || !!errorMsg;
  const progressPct = isRunning
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Baseline */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-orange-400" />
            Baseline Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <DataField label="Status">
              <Badge variant="green" className="text-xs">Loaded</Badge>
            </DataField>
            <DataField label="Period">
              <span className="text-sm text-zinc-200">
                {baselineInfo?.period?.start} — {baselineInfo?.period?.end}
              </span>
            </DataField>
            <DataField label="SKU Count">
              <span className="text-sm text-zinc-200">{formatNumber(baselineInfo?.skuCount)}</span>
            </DataField>
            <DataField label="Total Units">
              <span className="text-sm text-zinc-200">{formatNumber(baselineInfo?.totalUnits)}</span>
            </DataField>
          </div>
        </CardContent>
      </Card>

      {/* Demand Summaries */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-blue-400" />
            Demand Summaries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <DataField label="Active Summaries">
              <span className="text-sm text-zinc-200">{formatNumber(summaryCount)}</span>
            </DataField>
            <DataField label="Unique Records">
              <span className="text-sm text-zinc-200">{formatNumber(shopifyRecordCount)}</span>
            </DataField>
            <DataField label="Last Rebuild">
              <span className="text-sm text-zinc-200">{formatDate(lastSync)}</span>
            </DataField>
            <DataField label="Source">
              <span className="text-sm text-zinc-200">ShopifySaleRecord</span>
            </DataField>
          </div>

          {/* Running progress */}
          {isRunning && (
            <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-orange-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-medium capitalize">{progress.phase}…</span>
                </div>
                <span className="text-zinc-400">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-[10px] text-zinc-500">{progress.detail}</p>
              <p className="text-[10px] text-zinc-600">Keep this tab open — do not navigate away.</p>
            </div>
          )}

          {/* Done */}
          {!isRunning && isDone && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-green-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Rebuild complete — {formatNumber(jobStatus.created)} summaries written
              </div>
              {jobStatus.completedAt && (
                <p className="text-[10px] text-zinc-500 mt-1">Finished {formatDate(jobStatus.completedAt)}</p>
              )}
            </div>
          )}

          {/* Error */}
          {!isRunning && isError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-red-400 text-xs font-medium">
                <XCircle className="w-4 h-4" />
                Rebuild failed: {errorMsg || jobStatus?.error}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleStartRebuild}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded transition-colors"
            >
              {isRunning
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              {isRunning ? `Rebuilding… ${progress.current}/${progress.total} months` : "Rebuild from ShopifySaleRecord"}
            </button>
            {(isError) && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium rounded transition-colors"
              >
                Reset
              </button>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 mt-2">
            Processes one month at a time — keep this tab open. Typically takes 3–8 minutes for a full rebuild.
          </p>

          {/* Re-run aliases */}
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <button
              onClick={handleRerun}
              disabled={isRerunning || isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-200 text-sm font-medium rounded transition-colors"
            >
              {isRerunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
              {isRerunning ? "Running..." : "Re-run SKU Alias Consolidation"}
            </button>
            <p className="text-[10px] text-zinc-500 mt-2">
              Merges duplicate SKUs using your SKU Alias records. Run this after adding new aliases without a full rebuild.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Inventory */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-green-400" />
            Inventory Source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <DataField label="Source">
              <span className="text-sm text-zinc-200">Shopify — neob HQ</span>
            </DataField>
            <DataField label="SKUs with Stock">
              <span className="text-sm text-zinc-200">{formatNumber(inventoryCount)}</span>
            </DataField>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="flex items-start gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <AlertCircle className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
        <div className="text-xs text-zinc-500">
          <p className="mb-1">
            Demand summaries are built from ShopifySaleRecord data. The rebuild processes one month at a time
            to stay within API limits, deduplicates overlapping CSV/API imports, and writes clean DemandSummary records.
          </p>
          <p>
            Inventory on-hand values are pulled from the Shopify "neob HQ" location. You can override
            individual SKUs in the Settings or SKU Detail panel.
          </p>
        </div>
      </div>
    </div>
  );
}

function DataField({ label, children }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">{label}</p>
      {children}
    </div>
  );
}