import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Database, RefreshCw, Package, ShoppingCart, GitMerge,
  AlertCircle, Loader2, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { formatNumber } from "@/components/demand/demandHelpers";
import { base44 } from "@/api/base44Client";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DataTab({
  baselineInfo,
  summaryCount,
  inventoryCount,
  shopifyRecordCount,
  lastSync,
  onRebuildComplete,
  onRerunAliases,
}) {
  const [jobStatus, setJobStatus] = useState(null); // null = unknown, object = status
  const [isStarting, setIsStarting] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const pollRef = useRef(null);

  // Poll job status on mount and keep polling while running
  useEffect(() => {
    checkStatus();
    return () => clearInterval(pollRef.current);
  }, []);

  const checkStatus = async () => {
    try {
      const res = await base44.functions.invoke("rebuildDemandSummariesBackground", { action: "status" });
      const status = res.data;
      setJobStatus(status);
      if (status?.state === 'running') {
        startPolling();
      } else if (status?.state === 'done') {
        stopPolling();
        // Notify parent to refresh summaries
        if (onRebuildComplete) onRebuildComplete(status);
      }
    } catch (e) {
      // Function may not exist yet or network error
      setJobStatus(null);
    }
  };

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await base44.functions.invoke("rebuildDemandSummariesBackground", { action: "status" });
        const status = res.data;
        setJobStatus(status);
        if (status?.state !== 'running') {
          stopPolling();
          if (status?.state === 'done' && onRebuildComplete) {
            onRebuildComplete(status);
          }
        }
      } catch (e) {}
    }, 4000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleStartRebuild = async () => {
    setIsStarting(true);
    try {
      await base44.functions.invoke("rebuildDemandSummariesBackground", { action: "start" });
      // Immediately check status and start polling
      await checkStatus();
      startPolling();
    } catch (e) {
      alert("Failed to start rebuild: " + e.message);
    }
    setIsStarting(false);
  };

  const handleRerun = async () => {
    setIsRerunning(true);
    await onRerunAliases();
    setIsRerunning(false);
  };

  const isRunning = jobStatus?.state === 'running';
  const isDone = jobStatus?.state === 'done';
  const isError = jobStatus?.state === 'error';

  const progressPct = isRunning && jobStatus.total > 0
    ? Math.round((jobStatus.current / jobStatus.total) * 100)
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

          {/* Job status banner */}
          {isRunning && (
            <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-orange-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-medium capitalize">{jobStatus.phase}…</span>
                </div>
                <span className="text-zinc-400">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-[10px] text-zinc-500">{jobStatus.detail}</p>
              <p className="text-[10px] text-zinc-600">Running server-side — safe to close this tab</p>
            </div>
          )}

          {isDone && (
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

          {isError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-red-400 text-xs font-medium">
                <XCircle className="w-4 h-4" />
                Rebuild failed: {jobStatus.error}
              </div>
            </div>
          )}

          {/* Start button */}
          <button
            onClick={handleStartRebuild}
            disabled={isRunning || isStarting}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded transition-colors"
          >
            {isRunning || isStarting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            {isRunning ? "Rebuilding in background…" : isStarting ? "Starting…" : "Rebuild from ShopifySaleRecord"}
          </button>
          <p className="text-[10px] text-zinc-500 mt-2">
            Runs entirely server-side — you can close this tab and come back. Progress updates every 4 seconds.
          </p>

          {/* Re-run aliases */}
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <button
              onClick={handleRerun}
              disabled={isRerunning}
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
            Demand summaries are built from ShopifySaleRecord data. The rebuild process
            deduplicates overlapping CSV and API imports, aggregates by SKU per month, and writes clean
            DemandSummary records for the forecasting engine.
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