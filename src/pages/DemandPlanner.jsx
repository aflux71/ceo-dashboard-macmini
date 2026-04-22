import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Table, Calendar, Database, Settings,
  Plus, Trash2, Save, Copy, X, Check, Loader2, Upload, ArrowRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Papa from "papaparse";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { generatePlan, categorize } from "@/components/demand/demandEngine";
import {
  DEFAULT_WORKSPACE,
  buildInventoryMap,
  formatNumber,
} from "@/components/demand/demandHelpers";
import baselineData from "@/data/baseline-2025.json";
import DashboardTab from "@/components/demand/DashboardTab";
import PlanTable from "@/components/demand/PlanTable";
import { buildAliasMap, consolidateDemandBySKU } from "@/utils/skuAliasResolver";
import SKUDetail from "@/components/demand/SKUDetail";
import EventsTab from "@/components/demand/EventsTab";
import DataTab from "@/components/demand/DataTab";
import SKUMappingSettings from "@/components/demand/SKUMappingSettings";
import PlanningAssistant from "@/components/ai/PlanningAssistant";

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Main Component ───────────────────────────────────────────────────────────
export default function DemandPlanner() {
  // Data state
  const [summaries, setSummaries] = useState([]);
  const [inventory, setInventory] = useState({});
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Workspace state
  const [workspace, setWorkspace] = useState({ ...DEFAULT_WORKSPACE, minMonthlyVelocity: 0 });
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);

  // UI state — check URL for tab param
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get("tab") || "dashboard";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [detailItem, setDetailItem] = useState(null);
  const [initialUrgencyFilter, setInitialUrgencyFilter] = useState(null);
  const [pushConfirmItems, setPushConfirmItems] = useState(null);
  const [isPushing, setIsPushing] = useState(false);

  // Planner SKUs (ForecastSuggestion)
  const [plannerSKUs, setPlannerSKUs] = useState(new Set());

  // Data stats for Data tab
  const [shopifyRecordCount, setShopifyRecordCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);

  // ── Load data on mount ────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  const fetchAll = async (entity, sort = '-created_date') => {
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

  // Merges all three exclusion sources into one unified system default list
  const mergeAllExclusions = async (baseList = [], loadedWorkspaces = []) => {
    const merged = new Set(baseList.map(String));
    // 1. Load default_exclusion_list from AppSettings
    try {
      const defSettings = await base44.entities.AppSettings.filter({ key: "default_exclusion_list" });
      if (defSettings.length > 0) {
        JSON.parse(defSettings[0].value || "[]").forEach((s) => merged.add(String(s)));
      }
    } catch {}
    // 2. Load "Master Exclusion List" workspace exclusions
    const masterWs = loadedWorkspaces.find((w) => w.name === "Master Exclusion List");
    if (masterWs) {
      const masterList = typeof masterWs.exclusionList === "string"
        ? JSON.parse(masterWs.exclusionList || "[]")
        : masterWs.exclusionList || [];
      masterList.forEach((s) => merged.add(String(s)));
    }
    return [...merged];
  };

  const loadData = async () => {
   setLoading(true);
   try {
     // 1. Try loading DemandSummary entities first
     let loadedSummaries = [];
     try {
       loadedSummaries = await fetchAll(base44.entities.DemandSummary);
     } catch (e) {
       // Entity may not exist yet
     }

     // 2. If empty, seed from baseline
     if (!loadedSummaries || loadedSummaries.length === 0) {
       loadedSummaries = baselineToSummaries(baselineData);
     } else {
       // Parse JSON fields from stored entities
       loadedSummaries = loadedSummaries.map((s) => ({
         ...s,
         monthly: typeof s.monthly === "string" ? JSON.parse(s.monthly) : s.monthly,
         byChannel: typeof s.byChannel === "string" ? JSON.parse(s.byChannel) : s.byChannel,
         byLocation: typeof s.byLocation === "string" ? JSON.parse(s.byLocation) : s.byLocation,
         category: s.category || categorize(s.product),
       }));
     }

     // 2.5. Load SKU aliases and consolidate demand for merged SKUs
     let aliasMap = new Map();
     try {
       const aliases = await fetchAll(base44.entities.SKUAlias);
       aliasMap = buildAliasMap(aliases);
       if (aliasMap.size > 0) {
         loadedSummaries = consolidateDemandBySKU(loadedSummaries, aliasMap);
       }
     } catch (e) {
       // SKUAlias entity may not exist
     }

     setSummaries(loadedSummaries);

      // 3. Load finished product inventory
      let inventoryMap = {};
      try {
        const inv = await base44.entities.Inventory.filter({ type: "finished_product", location: "neob HQ" });
        const invToUse = inv.length > 0 ? inv : await base44.entities.Inventory.filter({ type: "finished_product" });
        invToUse.forEach((item) => {
          if (item.sku) {
            inventoryMap[item.sku] = (inventoryMap[item.sku] || 0) + (item.quantity || 0);
          }
          if (item.supplier_sku && item.supplier_sku !== item.sku) {
            inventoryMap[item.supplier_sku] = (inventoryMap[item.supplier_sku] || 0) + (item.quantity || 0);
          }
        });
      } catch (e) {}
      setInventory(inventoryMap);

      // 4. Load events
      let loadedEvents = [];
      try {
        loadedEvents = await fetchAll(base44.entities.DemandEvent);
      } catch (e) {}
      setEvents(loadedEvents);

      // 5. Load workspaces
      let loadedWorkspaces = [];
      try {
        loadedWorkspaces = await fetchAll(base44.entities.DemandConfig);
      } catch (e) {}
      setWorkspaces(loadedWorkspaces);

      // Apply default workspace — always merge all three exclusion sources
      const defaultWs = loadedWorkspaces.find((w) => w.isDefault);
      if (defaultWs) {
        const baseList = typeof defaultWs.exclusionList === "string"
          ? JSON.parse(defaultWs.exclusionList || "[]")
          : defaultWs.exclusionList || [];
        const mergedList = await mergeAllExclusions(baseList, loadedWorkspaces);
        applyWorkspace({ ...defaultWs, exclusionList: mergedList });
      } else {
        const mergedList = await mergeAllExclusions([], loadedWorkspaces);
        if (mergedList.length > 0) {
          setWorkspace((prev) => ({ ...prev, exclusionList: mergedList }));
        }
      }

      // 6. Load planner SKUs (active ForecastSuggestions)
      try {
        const suggestions = await base44.entities.ForecastSuggestion.filter({
          status: { $in: ['suggested', 'scheduled', 'on_hold', 'in_progress'] }
        });
        setPlannerSKUs(new Set(suggestions.map(s => s.sku)));
      } catch {}

      // 7. Last rebuild date + shopify stats
      try {
        const syncLogs = await base44.entities.SyncLog.filter({ sync_type: "demand_summaries" }, "-created_date", 1);
        if (syncLogs.length > 0) {
          setLastSync(syncLogs[0].created_date);
          setShopifyRecordCount(syncLogs[0].records_processed || 0);
        } else if (loadedSummaries.length > 0) {
          const latest = loadedSummaries.reduce((best, s) => {
            const d = s.updatedAt || s.updated_date || "";
            return d > best ? d : best;
          }, "");
          if (latest) setLastSync(latest);
        }
      } catch (e) {}
    } catch (err) {
      console.error("Failed to load demand data:", err);
      setSummaries(baselineToSummaries(baselineData));
    }
    setLoading(false);
  };

  // ── Workspace management ──────────────────────────────────────────────────
  const applyWorkspace = (ws) => {
    setActiveWorkspaceId(ws.id);
    setWorkspace({
      name: ws.name || "Default",
      mode: ws.mode || "forecast",
      forecastMonths: ws.forecastMonths || 3,
      growthPct: ws.growthPct || 0,
      safetyPct: ws.safetyPct ?? 20,
      minMonthlyVelocity: ws.minMonthlyVelocity ?? 0,
      targetLevels: typeof ws.targetLevels === "string" ? JSON.parse(ws.targetLevels || "{}") : ws.targetLevels || {},
      inventoryOverrides: typeof ws.inventoryOverrides === "string" ? JSON.parse(ws.inventoryOverrides || "{}") : ws.inventoryOverrides || {},
      exclusionList: typeof ws.exclusionList === "string" ? JSON.parse(ws.exclusionList || "[]") : ws.exclusionList || [],
      isDefault: ws.isDefault || false,
    });
  };

  const handleWorkspaceChange = useCallback((changes) => {
    setWorkspace((prev) => ({ ...prev, ...changes }));
  }, []);

  const buildPayload = (ws) => ({
    ...ws,
    targetLevels: JSON.stringify(ws.targetLevels),
    inventoryOverrides: JSON.stringify(ws.inventoryOverrides),
    exclusionList: JSON.stringify(ws.exclusionList),
  });

  const saveWorkspace = async (wsOverride) => {
    const ws = wsOverride || workspace;
    const payload = buildPayload(ws);
    try {
      if (activeWorkspaceId) {
        await base44.entities.DemandConfig.update(activeWorkspaceId, payload);
        setWorkspaces((prev) => prev.map((w) => w.id === activeWorkspaceId ? { ...w, ...payload } : w));
        toast.success("Workspace saved");
      } else {
        const created = await base44.entities.DemandConfig.create(payload);
        setActiveWorkspaceId(created.id);
        setWorkspaces((prev) => [...prev, created]);
        toast.success("Workspace created");
      }
    } catch (err) {
      toast.error("Failed to save workspace");
    }
  };

  // Auto-save exclusion changes to DemandConfig
  const persistExclusions = async (newList) => {
    try {
      if (activeWorkspaceId) {
        await base44.entities.DemandConfig.update(activeWorkspaceId, {
          exclusionList: JSON.stringify(newList),
        });
      } else {
        const payload = buildPayload({ ...workspace, exclusionList: newList });
        const created = await base44.entities.DemandConfig.create(payload);
        setActiveWorkspaceId(created.id);
        setWorkspaces((prev) => [...prev, created]);
      }
    } catch (err) {
      console.error("Failed to persist exclusions:", err);
    }
  };

  const duplicateWorkspace = async () => {
    const payload = {
      ...workspace,
      name: `${workspace.name} (Copy)`,
      isDefault: false,
      targetLevels: JSON.stringify(workspace.targetLevels),
      inventoryOverrides: JSON.stringify(workspace.inventoryOverrides),
      exclusionList: JSON.stringify(workspace.exclusionList),
    };
    try {
      const created = await base44.entities.DemandConfig.create(payload);
      setWorkspaces((prev) => [...prev, created]);
      applyWorkspace(created);
      toast.success("Workspace duplicated");
    } catch (err) {
      toast.error("Failed to duplicate workspace");
    }
  };

  const deleteWorkspace = async (id) => {
    try {
      await base44.entities.DemandConfig.delete(id);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(null);
        setWorkspace({ ...DEFAULT_WORKSPACE });
      }
      toast.success("Workspace deleted");
    } catch (err) {
      toast.error("Failed to delete workspace");
    }
  };

  // ── Generate plan ─────────────────────────────────────────────────────────
  const plan = useMemo(() => {
    if (summaries.length === 0) return null;
    const exclusionSet = new Set(workspace.exclusionList || []);
    const filteredSummaries = summaries.filter((s) => !exclusionSet.has(s.sku));
    return generatePlan(filteredSummaries, inventory, workspace, events);
  }, [summaries, inventory, workspace, events]);

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleAddEvent = async (eventData) => {
    try {
      const user = await base44.auth.me();
      const created = await base44.entities.DemandEvent.create({
        ...eventData,
        createdBy: user?.email || "unknown",
      });
      setEvents((prev) => [...prev, created]);
      toast.success("Event created");
    } catch (err) {
      const localEvent = { ...eventData, id: `local-${Date.now()}` };
      setEvents((prev) => [...prev, localEvent]);
      toast.success("Event added (local)");
    }
  };

  const handleUpdateEvent = async (id, data) => {
    try {
      await base44.entities.DemandEvent.update(id, data);
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)));
      toast.success("Event updated");
    } catch (err) {
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)));
    }
  };

  const handleDeleteEvent = async (id) => {
    try {
      await base44.entities.DemandEvent.delete(id);
    } catch (e) {}
    setEvents((prev) => prev.filter((e) => e.id !== id));
    toast.success("Event deleted");
  };

  // ── Push to planning ──────────────────────────────────────────────────────
  const handlePushToPlanning = (items) => {
    const toCreate = items.filter((i) => i.productionNeed > 0);
    if (toCreate.length === 0) {
      toast.info("No production needed for selected items");
      return;
    }
    setPushConfirmItems(toCreate);
  };

  const executePush = async () => {
    if (!pushConfirmItems || pushConfirmItems.length === 0) return;
    setIsPushing(true);
    try {
      for (const item of pushConfirmItems) {
        await base44.entities.ForecastSuggestion.create({
          sku: item.sku,
          product_name: item.product,
          suggested_qty: item.productionNeed,
          urgency: item.urgency === "CRITICAL" ? "critical" : item.urgency === "LOW" ? "critical" : item.urgency === "WATCH" ? "soon" : "ok",
          status: "suggested",
          on_hand: item.onHand,
          forecast_qty: item.forecastTotal || 0,
          notes: `Demand Planner: avg/mo ${Math.round(item.avgMonthly)}, ${item.monthsCover} mo cover, mode: ${workspace.mode}`,
        });
      }
      toast.success(`${pushConfirmItems.length} item${pushConfirmItems.length > 1 ? "s" : ""} pushed to Planning`);
      setPlannerSKUs(prev => {
        const next = new Set(prev);
        pushConfirmItems.forEach(i => next.add(i.sku));
        return next;
      });
      setPushConfirmItems(null);
    } catch (err) {
      console.error("Push to planning failed:", err);
      toast.error(`Failed to push to planning: ${err.message}`);
    }
    setIsPushing(false);
  };

  // ── Exclusion management ──────────────────────────────────────────────────
  const handleExclude = (sku) => {
    setWorkspace((prev) => {
      const newList = [...new Set([...prev.exclusionList, sku])];
      persistExclusions(newList);
      return { ...prev, exclusionList: newList };
    });
    toast.success(`SKU ${sku} excluded`);
  };

  const handleBulkExclude = (skus) => {
    setWorkspace((prev) => {
      const newList = [...new Set([...prev.exclusionList, ...skus])];
      persistExclusions(newList);
      return { ...prev, exclusionList: newList };
    });
    toast.success(`${skus.length} SKUs excluded`);
  };

  const handleRemoveExclusion = (sku) => {
    setWorkspace((prev) => {
      const newList = prev.exclusionList.filter((s) => s !== sku);
      persistExclusions(newList);
      return { ...prev, exclusionList: newList };
    });
  };

  // ── Inventory override ────────────────────────────────────────────────────
  const handleOverrideInventory = (sku, qty) => {
    setWorkspace((prev) => ({
      ...prev,
      inventoryOverrides: { ...prev.inventoryOverrides, [sku]: qty },
    }));
    toast.success(`On-hand override set for SKU ${sku}: ${qty}`);
  };

  // ── SKU alias re-run ─────────────────────────────────────────────────────
  const handleRerunAliases = async () => {
    try {
      const aliases = await fetchAll(base44.entities.SKUAlias);
      const aliasMap = buildAliasMap(aliases);
      if (aliasMap.size === 0) {
        toast.info("No SKU aliases found. Add aliases in the SKU Deduplication page first.");
        return;
      }
      setSummaries((prev) => consolidateDemandBySKU(prev, aliasMap));
      toast.success(`Alias consolidation applied (${aliasMap.size} alias mappings)`);
    } catch (err) {
      toast.error("Failed to run alias consolidation: " + err.message);
    }
  };



  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Demand Planner</h1>
          <p className="text-sm text-zinc-500">
            {plan ? `${plan.summary.totalSKUs} SKUs · ${formatNumber(plan.summary.totalNeed)} units needed` : "Loading plan..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {workspaces.length > 0 && (
            <select
              value={activeWorkspaceId || ""}
              onChange={(e) => {
                const ws = workspaces.find((w) => w.id === e.target.value);
                if (ws) applyWorkspace(ws);
              }}
              className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded px-2 py-1.5"
            >
              <option value="">Default</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={saveWorkspace}
            className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded transition-colors"
          >
            <Save className="w-3 h-3" /> Save
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
            <BarChart3 className="w-3.5 h-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="plan" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
            <Table className="w-3.5 h-3.5" /> Full Plan
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
            <Calendar className="w-3.5 h-3.5" /> Events
            {events.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] rounded-full">
                {events.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
            <Database className="w-3.5 h-3.5" /> Data
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
            <Settings className="w-3.5 h-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab
            plan={plan}
            plannerSKUs={plannerSKUs}
            onViewDetail={setDetailItem}
            onPushToPlanning={handlePushToPlanning}
            onExclude={handleExclude}
            onViewUrgencyList={(urgency) => {
              setInitialUrgencyFilter(urgency);
              setActiveTab("plan");
            }}
          />
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <PlanTable
            plan={plan}
            plannerSKUs={plannerSKUs}
            workspace={workspace}
            onWorkspaceChange={handleWorkspaceChange}
            onViewDetail={setDetailItem}
            onPushToPlanning={handlePushToPlanning}
            initialUrgencyFilter={initialUrgencyFilter}
            onClearUrgencyFilter={() => setInitialUrgencyFilter(null)}
          />
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <EventsTab
            events={events}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            summaries={summaries}
          />
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <DataTab
            baselineInfo={baselineData}
            summaryCount={summaries.length}
            inventoryCount={Object.keys(inventory).length}
            shopifyRecordCount={shopifyRecordCount}
            lastSync={lastSync}
            onRebuildComplete={async (status) => {
              // Reload summaries and update last sync when background job finishes
              const updated = await fetchAll(base44.entities.DemandSummary).catch(() => []);
              if (updated?.length > 0) {
                const parsed = updated.map((s) => ({
                  ...s,
                  monthly: typeof s.monthly === "string" ? JSON.parse(s.monthly) : s.monthly,
                  byChannel: typeof s.byChannel === "string" ? JSON.parse(s.byChannel) : s.byChannel,
                  byLocation: typeof s.byLocation === "string" ? JSON.parse(s.byLocation) : s.byLocation,
                  category: s.category || categorize(s.product),
                }));
                const aliases = await fetchAll(base44.entities.SKUAlias).catch(() => []);
                const aliasMap = buildAliasMap(aliases);
                setSummaries(aliasMap.size > 0 ? consolidateDemandBySKU(parsed, aliasMap) : parsed);
                setShopifyRecordCount(status?.totalUnique || updated.length);
              }
              setLastSync(status?.completedAt || new Date().toISOString());
            }}
            onRerunAliases={handleRerunAliases}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <div className="space-y-6">
            <SKUMappingSettings />
            <SettingsPanel
              workspace={workspace}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onWorkspaceChange={handleWorkspaceChange}
              onSave={saveWorkspace}
              onDuplicate={duplicateWorkspace}
              onDelete={deleteWorkspace}
              onApply={applyWorkspace}
              onRemoveExclusion={handleRemoveExclusion}
              summaries={summaries}
              onExclude={handleExclude}
              onBulkExclude={handleBulkExclude}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* SKU Detail slide-in */}
      {detailItem && (
        <SKUDetail
          item={detailItem}
          workspace={workspace}
          onClose={() => setDetailItem(null)}
          onPushToPlanning={handlePushToPlanning}
          onOverrideInventory={handleOverrideInventory}
        />
      )}

      {/* AI Planning Assistant */}
      <PlanningAssistant
        demandSummaries={summaries}
        forecastSuggestions={plan?.items || []}
        inventory={inventory}
      />

      {/* Push to Planning Confirmation Dialog */}
      <Dialog open={!!pushConfirmItems} onOpenChange={(open) => { if (!open) setPushConfirmItems(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-orange-400" />
              Confirm Push to Planning
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-zinc-400">
              Push <span className="text-zinc-100 font-semibold">{pushConfirmItems?.length || 0}</span> item{(pushConfirmItems?.length || 0) !== 1 ? "s" : ""} to Production Planning?
            </p>
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {pushConfirmItems?.map((item) => (
                <div key={item.sku} className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg text-xs">
                  <div className="min-w-0">
                    <span className="font-mono text-zinc-500">{item.sku}</span>
                    <span className="text-zinc-300 ml-2 truncate">{item.product}</span>
                  </div>
                  <span className="text-orange-400 font-semibold shrink-0 ml-2">
                    {formatNumber(item.productionNeed)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs">
              <span className="text-zinc-500">Total units</span>
              <span className="text-orange-400 font-bold text-sm">
                {formatNumber(pushConfirmItems?.reduce((s, i) => s + (i.productionNeed || 0), 0) || 0)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushConfirmItems(null)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={executePush}
              disabled={isPushing}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isPushing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              {isPushing ? "Pushing..." : "Confirm Push"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({
  workspace,
  workspaces,
  activeWorkspaceId,
  onWorkspaceChange,
  onSave,
  onDuplicate,
  onDelete,
  onApply,
  onRemoveExclusion,
  summaries,
  onExclude,
  onBulkExclude,
}) {
  const [exclusionSearch, setExclusionSearch] = useState("");
  const exclusionCsvRef = React.useRef(null);

  const handleExclusionCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const skus = result.data.flatMap((row) => {
          const sku = String(row.SKU || row.sku || row.Sku || "").trim();
          return sku ? [sku] : [];
        });
        if (skus.length > 0) onBulkExclude(skus);
      },
    });
    e.target.value = "";
  };

  const exclusionResults = useMemo(() => {
    if (!exclusionSearch.trim()) return [];
    const q = exclusionSearch.toLowerCase();
    return summaries
      .filter((s) =>
        (s.product?.toLowerCase().includes(q) || s.sku?.toLowerCase().includes(q)) &&
        !workspace.exclusionList.includes(s.sku)
      )
      .slice(0, 10);
  }, [exclusionSearch, summaries, workspace.exclusionList]);

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Current workspace */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-orange-400" />
            Current Workspace
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase mb-1">Name</label>
              <Input
                value={workspace.name}
                onChange={(e) => onWorkspaceChange({ name: e.target.value })}
                className="h-8 bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase mb-1">Min Monthly Velocity</label>
              <Input
                type="number"
                value={workspace.minMonthlyVelocity}
                onChange={(e) => onWorkspaceChange({ minMonthlyVelocity: Number(e.target.value) })}
                className="h-8 bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onSave()} className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded transition-colors">
              <Save className="w-3 h-3" /> {activeWorkspaceId ? "Save Changes" : "Save as New"}
            </button>
            {activeWorkspaceId && (
              <button onClick={onDuplicate} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs rounded transition-colors">
                <Copy className="w-3 h-3" /> Duplicate
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Saved workspaces */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Saved Workspaces</h3>
          {workspaces.length === 0 ? (
            <p className="text-xs text-zinc-500">No saved workspaces yet. Configure settings above and click "Save as New".</p>
          ) : (
            <div className="space-y-2">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    activeWorkspaceId === ws.id
                      ? "bg-orange-500/5 border-orange-500/20"
                      : "bg-zinc-800/50 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div>
                    <span className="text-sm text-zinc-200">{ws.name}</span>
                    <span className="text-xs text-zinc-500 ml-2">{ws.mode} · {ws.forecastMonths || 3}mo</span>
                    {activeWorkspaceId === ws.id && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">Active</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onApply(ws)}
                      className="px-2 py-1 text-xs text-zinc-400 hover:text-orange-400 hover:bg-zinc-700 rounded"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => onDelete(ws.id)}
                      className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Default Exclusion List (unified — merges all sources on load) */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              System Default Exclusion List
              <span className="text-xs text-zinc-500 font-normal">
                ({workspace.exclusionList.length} SKUs excluded)
              </span>
            </h3>
            <div>
              <input type="file" accept=".csv" ref={exclusionCsvRef} onChange={handleExclusionCSV} className="hidden" />
              <button
                onClick={() => exclusionCsvRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] rounded transition-colors"
              >
                <Upload className="w-3 h-3" /> Upload CSV
              </button>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 mb-3">
            All exclusion sources (Default list, Master Exclusion List workspace) are merged into this single system-wide list on load.
          </p>

          <div className="relative mb-3">
            <Input
              placeholder="Search product name or SKU to exclude..."
              value={exclusionSearch}
              onChange={(e) => setExclusionSearch(e.target.value)}
              className="h-8 bg-zinc-800 border-zinc-700 text-sm pr-8"
            />
            {exclusionSearch && (
              <button
                onClick={() => setExclusionSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {exclusionResults.length > 0 && (
            <div className="mb-3 border border-zinc-700 rounded-lg overflow-hidden">
              {exclusionResults.map((s) => (
                <div
                  key={s.sku}
                  className="flex items-center justify-between px-3 py-2 hover:bg-zinc-800/80 cursor-pointer border-b border-zinc-800 last:border-b-0"
                  onClick={() => { onExclude(s.sku); setExclusionSearch(""); }}
                >
                  <div>
                    <span className="text-xs text-zinc-200">{s.product}</span>
                    <span className="text-[10px] text-zinc-500 ml-2 font-mono">SKU {s.sku}</span>
                  </div>
                  <span className="text-[10px] text-orange-400 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Exclude
                  </span>
                </div>
              ))}
            </div>
          )}
          {exclusionSearch && exclusionResults.length === 0 && (
            <p className="text-xs text-zinc-500 mb-3">No matching SKUs found.</p>
          )}

          {workspace.exclusionList.length === 0 ? (
            <p className="text-xs text-zinc-500">No SKUs excluded. Search above or use the ⊘ button on any Dashboard card.</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {workspace.exclusionList.map((sku) => {
                const summary = summaries.find((s) => s.sku === sku);
                return (
                  <div key={sku} className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 rounded text-xs">
                    <span className="text-zinc-300">
                      <span className="font-mono text-zinc-500">SKU {sku}</span>
                      {summary && ` — ${summary.product}`}
                    </span>
                    <button
                      onClick={() => onRemoveExclusion(sku)}
                      className="text-zinc-500 hover:text-green-400"
                      title="Re-include"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}