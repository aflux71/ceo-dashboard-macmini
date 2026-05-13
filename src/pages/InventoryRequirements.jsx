import React, { useState, useEffect, useMemo } from "react";
import { Loader2, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { generatePlan, categorize } from "@/components/demand/demandEngine";
import {
  DEFAULT_WORKSPACE,
  formatNumber,
} from "@/components/demand/demandHelpers";
import baselineData from "@/data/baseline-2025.json";
import { buildAliasMap, consolidateDemandBySKU } from "@/utils/skuAliasResolver";
import InventoryRequirementsTable from "@/components/demand/InventoryRequirementsTable";

// Same baseline → summary mapping as DemandPlanner
const baselineToSummaries = (data) =>
  data.skus.map((s) => ({
    sku: s.sku,
    product: s.product,
    category: categorize(s.product),
    totalQty: s.totalQty,
    avgMonthly: s.avgMonthly,
    monthly: s.monthly,
    byChannel: s.byChannel,
    byLocation: s.byLocation,
    totalRevenue: s.totalRevenue,
    dataMonths: data.period.months,
    periodStart: data.period.start,
    periodEnd: data.period.end,
    updatedAt: data.generatedAt,
  }));

const fetchAll = async (entity, sort = "-created_date") => {
  const results = [];
  const pageSize = 100;
  let skip = 0;
  while (true) {
    const batch = await entity.list(sort, pageSize, skip);
    results.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
  }
  return results;
};

const loadMasterExclusions = async (baseList = []) => {
  const merged = new Set(baseList.map(String));
  try {
    const masterExclusions = await base44.entities.MasterExclusion.list();
    masterExclusions.forEach((m) => {
      if (m.sku && (m.scope === "all" || m.scope === "demand_planner")) {
        merged.add(String(m.sku));
      }
    });
  } catch {}
  return [...merged];
};

const applyWorkspaceShape = (ws) => ({
  name: ws.name || "Default",
  mode: ws.mode || "forecast",
  forecastMonths: ws.forecastMonths || 3,
  growthPct: ws.growthPct || 0,
  safetyPct: ws.safetyPct ?? 20,
  minMonthlyVelocity: ws.minMonthlyVelocity ?? 0,
  targetLevels: typeof ws.targetLevels === "string" ? JSON.parse(ws.targetLevels || "{}") : ws.targetLevels || {},
  inventoryOverrides: typeof ws.inventoryOverrides === "string" ? JSON.parse(ws.inventoryOverrides || "{}") : ws.inventoryOverrides || {},
  exclusionList: typeof ws.exclusionList === "string" ? JSON.parse(ws.exclusionList || "[]") : ws.exclusionList || [],
  categorySeasonalMultipliers: typeof ws.categorySeasonalMultipliers === "string" ? JSON.parse(ws.categorySeasonalMultipliers || "{}") : ws.categorySeasonalMultipliers || {},
});

export default function InventoryRequirements() {
  const [summaries, setSummaries] = useState([]);
  const [inventory, setInventory] = useState({});
  const [events, setEvents] = useState([]);
  const [workspace, setWorkspace] = useState({ ...DEFAULT_WORKSPACE, minMonthlyVelocity: 0 });
  const [plannerSKUs, setPlannerSKUs] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [forecastMonths, setForecastMonths] = useState(3);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Summaries
        let loadedSummaries = [];
        try {
          loadedSummaries = await fetchAll(base44.entities.DemandSummary);
        } catch {}
        if (!loadedSummaries || loadedSummaries.length === 0) {
          loadedSummaries = baselineToSummaries(baselineData);
        } else {
          loadedSummaries = loadedSummaries.map((s) => ({
            ...s,
            monthly: typeof s.monthly === "string" ? JSON.parse(s.monthly) : s.monthly,
            byChannel: typeof s.byChannel === "string" ? JSON.parse(s.byChannel) : s.byChannel,
            byLocation: typeof s.byLocation === "string" ? JSON.parse(s.byLocation) : s.byLocation,
            category: s.category || categorize(s.product),
          }));
        }

        // Apply SKU aliases
        try {
          const aliases = await fetchAll(base44.entities.SKUAlias);
          const aliasMap = buildAliasMap(aliases);
          if (aliasMap.size > 0) {
            loadedSummaries = consolidateDemandBySKU(loadedSummaries, aliasMap);
          }
        } catch {}
        setSummaries(loadedSummaries);

        // Inventory
        const inventoryMap = {};
        try {
          const inv = await base44.entities.Inventory.filter({ type: "finished_product", location: "neob HQ" });
          const invToUse = inv.length > 0 ? inv : await base44.entities.Inventory.filter({ type: "finished_product" });
          invToUse.forEach((item) => {
            if (item.sku) inventoryMap[item.sku] = (inventoryMap[item.sku] || 0) + (item.quantity || 0);
            if (item.supplier_sku && item.supplier_sku !== item.sku) {
              inventoryMap[item.supplier_sku] = (inventoryMap[item.supplier_sku] || 0) + (item.quantity || 0);
            }
          });
        } catch {}
        setInventory(inventoryMap);

        // Events
        try {
          const loadedEvents = await fetchAll(base44.entities.DemandEvent);
          setEvents(loadedEvents);
        } catch {}

        // Workspace — load default + merge exclusions (read-only)
        let loadedWorkspaces = [];
        try {
          loadedWorkspaces = await fetchAll(base44.entities.DemandConfig);
        } catch {}
        const defaultWs = loadedWorkspaces.find((w) => w.isDefault);
        if (defaultWs) {
          const baseList = typeof defaultWs.exclusionList === "string"
            ? JSON.parse(defaultWs.exclusionList || "[]")
            : defaultWs.exclusionList || [];
          const mergedList = await loadMasterExclusions(baseList);
          setWorkspace({ ...applyWorkspaceShape(defaultWs), exclusionList: mergedList });
        } else {
          const mergedList = await loadMasterExclusions([]);
          setWorkspace((prev) => ({ ...prev, exclusionList: mergedList }));
        }

        // Planner SKUs
        try {
          const suggestions = await base44.entities.ForecastSuggestion.filter({
            status: { $in: ["suggested", "scheduled", "on_hold", "in_progress"] },
          });
          setPlannerSKUs(new Set(suggestions.map((s) => s.sku)));
        } catch {}
      } catch (err) {
        console.error("Failed to load inventory requirements data:", err);
        setSummaries(baselineToSummaries(baselineData));
      }
      setLoading(false);
    })();
  }, []);

  const plan = useMemo(() => {
    if (summaries.length === 0) return null;
    const exclusionSet = new Set(workspace.exclusionList || []);
    const filteredSummaries = summaries.filter((s) => !exclusionSet.has(s.sku));
    const wsWithMonths = { ...workspace, forecastMonths };
    return generatePlan(filteredSummaries, inventory, wsWithMonths, events);
  }, [summaries, inventory, workspace, events, forecastMonths]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-400" />
            Inventory Requirements
          </h1>
          <p className="text-sm text-zinc-500">
            {plan ? `${plan.summary.totalSKUs} SKUs · ${formatNumber(plan.summary.totalNeed)} units needed` : "Loading plan..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400 uppercase tracking-wider">Forecast</label>
          <select
            value={forecastMonths}
            onChange={(e) => setForecastMonths(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-orange-500"
          >
            {[1, 2, 3, 4, 5, 6].map((m) => (
              <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>
      </div>

      <InventoryRequirementsTable
        plan={plan}
        plannerSKUs={plannerSKUs}
        workspace={{ ...workspace, forecastMonths }}
      />
    </div>
  );
}