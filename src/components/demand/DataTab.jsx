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

const TOTAL_MONTHS = 16;

// Merge a page of records into the in-memory SKU map
function mergeRecords(merged, records, monthLabel) {
  if (!records || records.length === 0) return;
  const [yearStr, monthStr] = monthLabel.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const monthIdx = month - 1; // 0-based index for monthly[12] array

  // Track API keys to suppress CSV duplicates
  const apiKeys = new Set();
  for (const r of records) {
    if (r.order_id && !r.order_id.startsWith('CSV-') && r.sku) {
      apiKeys.add(`${r.sku}|${(r.order_date || '').substring(0, 10)}|${r.location_name || ''}`);
    }
  }

  // Dedup within page
  const seen = new Set();
  for (const r of records) {
    const sku = r.sku?.trim();
    if (!sku || (r.quantity || 0) <= 0) continue;

    const lineKey = `${r.order_id}|${sku}|${r.location_name || ''}`;
    if (seen.has(lineKey)) continue;
    seen.add(lineKey);

    // Suppress CSV if API version exists
    if (r.order_id?.startsWith('CSV-')) {
      const apiKey = `${sku}|${(r.order_date || '').substring(0, 10)}|${r.location_name || ''}`;
      if (apiKeys.has(apiKey)) continue;
    }

    const channel = r.channel || 'online';
    const location = r.location_name || (channel === 'pos' ? 'Unknown' : 'Online');
    const dateKey = `${year}-${monthStr}`;

    if (!merged[sku]) {
      merged[sku] = {
        sku, product: r.product_name || sku,
        monthly: [0,0,0,0,0,0,0,0,0,0,0,0],
        byChannel: { online: 0, pos: 0 },
        byLocation: {}, totalQty: 0,
        periodStart: `${dateKey}-01`,
        periodEnd: `${dateKey}-28`,
        dataMonths: 0,
      };
    }

    const m = merged[sku];
    m.monthly[monthIdx] += r.quantity;
    m.totalQty += r.quantity;
    if (channel === 'pos') m.byChannel.pos += r.quantity;
    else m.byChannel.online += r.quantity;
    m.byLocation[location] = (m.byLocation[location] || 0) + r.quantity;
    if (dateKey < m.periodStart.substring(0, 7)) m.periodStart = `${dateKey}-01`;
    if (dateKey > m.periodEnd.substring(0, 7)) m.periodEnd = `${dateKey}-28`;
  }
}

function computeDataMonths(merged) {
  for (const m of Object.values(merged)) {
    const start = new Date(m.periodStart);
    const end = new Date(m.periodEnd);
    m.dataMonths = Math.max(1,
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
    );
  }
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
  const [jobStatus, setJobStatus] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [progress, setProgress] = useState({ monthIndex: 0, totalMonths: TOTAL_MONTHS, detail: '', skuCount: 0, phase: 'idle' });

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await base44.functions.invoke("rebuildDemandSummariesBackground", { action: "status" });
      setJobStatus(res.data);
    } catch (e) {}
  };

  const handleReset = async () => {
    try {
      await base44.functions.invoke("rebuildDemandSummariesBackground", { action: "reset" });
    } catch (e) {}
    setJobStatus(null);
    setIsRunning(false);
    setErrorMsg(null);
    setProgress({ monthIndex: 0, totalMonths: TOTAL_MONTHS, detail: '', skuCount: 0, phase: 'idle' });
  };

  const handleStartRebuild = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    setProgress({ monthIndex: 0, totalMonths: TOTAL_MONTHS, detail: 'Starting…', skuCount: 0, phase: 'aggregating' });

    const startedAt = new Date().toISOString();

    // In-memory merged SKU map — lives in the browser, no AppSettings writes
    const merged = {};

    let monthIndex = 0;
    let pageSkip = 0;
    let totalMonths = TOTAL_MONTHS;
    let pageCount = 0;

    try {
      // ── Phase 1: page through all months ──────────────────────────────
      while (true) {
        const res = await base44.functions.invoke("rebuildDemandSummariesBackground", {
          action: "step",
          monthIndex,
          pageSkip,
          startedAt,
        });

        if (res.data?.error) throw new Error(res.data.error);
        const data = res.data;

        // Merge returned records into local map
        if (data.records?.length > 0) {
          mergeRecords(merged, data.records, data.monthLabel);
        }

        pageCount++;
        monthIndex = data.monthIndex;
        pageSkip = data.pageSkip ?? 0;
        totalMonths = data.totalMonths || TOTAL_MONTHS;
        const skuCount = Object.keys(merged).length;

        setProgress({
          monthIndex,
          totalMonths,
          skuCount,
          phase: 'aggregating',
          detail: `${data.monthLabel} — page ${pageCount} (${data.records?.length ?? 0} records this page)`,
        });

        if (data.allDone) break;

        // Small pause to avoid hammering the API
        await new Promise(r => setTimeout(r, 150));
      }

      // ── Phase 2: finalize — send merged map to backend for DB write ───
      computeDataMonths(merged);
      const skuCount = Object.keys(merged).length;

      setProgress(prev => ({
        ...prev,
        phase: 'finalizing',
        detail: `Writing ${skuCount} summaries to database…`,
      }));

      const finalRes = await base44.functions.invoke("rebuildDemandSummariesBackground", {
        action: "finalize",
        merged,
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

  const isDone = !isRunning && jobStatus?.state === 'done';
  const isError = !isRunning && (jobStatus?.state === 'error' || !!errorMsg);
  const progressPct = isRunning
    ? progress.phase === 'finalizing'
      ? 98
      : Math.min(95, Math.round(((progress.monthIndex || 0) / (progress.totalMonths || TOTAL_MONTHS)) * 95))
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
              <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Loaded</Badge>
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
                  <span className="font-medium">
                    {progress.phase === 'finalizing' ? 'Writing to database…' : 'Aggregating…'}
                  </span>
                </div>
                <span className="text-zinc-400">
                  {progress.phase === 'aggregating'
                    ? `Month ${progress.monthIndex}/${progress.totalMonths} · ${formatNumber(progress.skuCount)} SKUs`
                    : `${formatNumber(progress.skuCount)} SKUs`}
                </span>
              </div>
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-[10px] text-zinc-500">{progress.detail}</p>
              <p className="text-[10px] text-zinc-600">Keep this tab open — do not navigate away.</p>
            </div>
          )}

          {/* Done */}
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

          {/* Error */}
          {isError && (
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
              {isRunning
                ? `${progress.phase === 'finalizing' ? 'Writing…' : `Month ${progress.monthIndex}/${progress.totalMonths}…`}`
                : "Rebuild from ShopifySaleRecord"}
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
            Data is aggregated in your browser — keep this tab open. Typically 5–15 minutes.
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
              Merges duplicate SKUs using your SKU Alias records.
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
            Each backend call fetches 100 records and returns them. Your browser accumulates all the data,
            then sends the final merged map to the backend in one shot to write to the database. This avoids
            AppSettings bloat and rate limits entirely.
          </p>
          <p>
            Inventory on-hand values are pulled from Shopify "neob HQ". You can override individual SKUs
            in Settings or the SKU Detail panel.
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