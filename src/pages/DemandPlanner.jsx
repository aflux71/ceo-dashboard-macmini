import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Table, Calendar, Database, Settings,
  Plus, Trash2, Save, Copy, X, Check, Loader2, Upload,
} from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { generatePlan, categorize } from "@/lib/demandEngine";
import {
  DEFAULT_WORKSPACE,
  buildInventoryMap,
  formatNumber,
} from "@/lib/demandHelpers";
import baselineData from "@/data/baseline-2025.json";
import DashboardTab from "@/components/demand/DashboardTab";
import PlanTable from "@/components/demand/PlanTable";
import SKUDetail from "@/components/demand/SKUDetail";
import EventsTab from "@/components/demand/EventsTab";
import DataTab from "@/components/demand/DataTab";

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
  const [workspace, setWorkspace] = useState({ ...DEFAULT_WORKSPACE });
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);

  // UI state
  const [activeTab, setActiveTab] = useState("dashboard");
  const [detailItem, setDetailItem] = useState(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  // Data stats for Data tab
  const [shopifyRecordCount, setShopifyRecordCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);

  // ── Load data on mount ────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Try loading DemandSummary entities first
      let loadedSummaries = [];
      try {
        loadedSummaries = await base44.entities.DemandSummary.list();
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
      setSummaries(loadedSummaries);

      // 3. Load finished product inventory
      let inventoryMap = {};
      try {
        const inv = await base44.entities.Inventory.filter({ type: "finished_product" });
        inv.forEach((item) => {
          if (item.sku) {
            inventoryMap[item.sku] = (inventoryMap[item.sku] || 0) + (item.quantity || 0);
          }
        });
      } catch (e) {
        // No inventory data available
      }
      setInventory(inventoryMap);

      // 4. Load events
      let loadedEvents = [];
      try {
        loadedEvents = await base44.entities.DemandEvent.list();
      } catch (e) {
        // Entity may not exist
      }
      setEvents(loadedEvents);

      // 5. Load workspaces
      let loadedWorkspaces = [];
      try {
        loadedWorkspaces = await base44.entities.DemandConfig.list();
      } catch (e) {
        // Entity may not exist
      }
      setWorkspaces(loadedWorkspaces);

      // Apply default workspace if found
      const defaultWs = loadedWorkspaces.find((w) => w.isDefault);
      if (defaultWs) {
        applyWorkspace(defaultWs);
      }

      // 6. Shopify stats
      try {
        const records = await base44.entities.ShopifySaleRecord.list("-date", 1);
        setShopifyRecordCount(records.length > 0 ? records.length : 0);
        if (records.length > 0) setLastSync(records[0].date);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error("Failed to load demand data:", err);
      // Fall back to baseline
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
      minMonthlyVelocity: ws.minMonthlyVelocity ?? 5,
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
    if (!activeWorkspaceId) return;
    try {
      await base44.entities.DemandConfig.update(activeWorkspaceId, {
        exclusionList: JSON.stringify(newList),
      });
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
      // Store locally if entity doesn't exist
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
    } catch (e) {
      // ignore
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
    toast.success("Event deleted");
  };

  // ── Push to planning ──────────────────────────────────────────────────────
  const handlePushToPlanning = async (items) => {
    const toCreate = items.filter((i) => i.productionNeed > 0);
    if (toCreate.length === 0) {
      toast.info("No production needed for selected items");
      return;
    }
    try {
      for (const item of toCreate) {
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
      toast.success(`${toCreate.length} item${toCreate.length > 1 ? "s" : ""} pushed to Planning`);
    } catch (err) {
      console.error("Push to planning failed:", err);
      toast.error(`Failed to push to planning: ${err.message}`);
    }
  };

  // ── Exclusion management ──────────────────────────────────────────────────
  const handleExclude = (sku) => {
    setWorkspace((prev) => ({
      ...prev,
      exclusionList: [...new Set([...prev.exclusionList, sku])],
    }));
    toast.success(`SKU ${sku} excluded`);
  };

  const handleRemoveExclusion = (sku) => {
    setWorkspace((prev) => ({
      ...prev,
      exclusionList: prev.exclusionList.filter((s) => s !== sku),
    }));
  };

  // ── Inventory override ────────────────────────────────────────────────────
  const handleOverrideInventory = (sku, qty) => {
    setWorkspace((prev) => ({
      ...prev,
      inventoryOverrides: { ...prev.inventoryOverrides, [sku]: qty },
    }));
    toast.success(`On-hand override set for SKU ${sku}: ${qty}`);
  };

  // ── Rebuild summaries ─────────────────────────────────────────────────────
  const handleRebuild = async () => {
    setIsRebuilding(true);
    try {
      // Re-seed from baseline
      const fresh = baselineToSummaries(baselineData);

      // Try to merge with Shopify records
      try {
        const records = await base44.entities.ShopifySaleRecord.list();
        // For now, baseline is the primary source
        // Future: merge records from after 2025 into summaries
        setShopifyRecordCount(records.length);
      } catch (e) {
        // ignore
      }

      // Try to persist to DemandSummary entity
      try {
        await base44.entities.DemandSummary.bulkCreate(
          fresh.map((s) => ({
            ...s,
            monthly: JSON.stringify(s.monthly),
            byChannel: JSON.stringify(s.byChannel),
            byLocation: JSON.stringify(s.byLocation),
          }))
        );
      } catch (e) {
        // Entity may not exist yet
      }

      setSummaries(fresh);
      setLastSync(new Date().toISOString().split("T")[0]);
      toast.success("Summaries rebuilt from baseline data");
    } catch (err) {
      toast.error("Rebuild failed");
    }
    setIsRebuilding(false);
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
          {/* Workspace selector */}
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
            onViewDetail={setDetailItem}
            onPushToPlanning={handlePushToPlanning}
            onExclude={handleExclude}
          />
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <PlanTable
            plan={plan}
            workspace={workspace}
            onWorkspaceChange={handleWorkspaceChange}
            onViewDetail={setDetailItem}
            onPushToPlanning={handlePushToPlanning}
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
            isRebuilding={isRebuilding}
            onRebuild={handleRebuild}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
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
          />
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
    </div>
  );
}

// ── Settings Panel (inline) ──────────────────────────────────────────────────
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
}) {
  const [exclusionSearch, setExclusionSearch] = useState("");

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
          <div className="flex gap-2">
            <button onClick={onSave} className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded transition-colors">
              <Save className="w-3 h-3" /> Save Workspace
            </button>
            <button onClick={onDuplicate} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs rounded transition-colors">
              <Copy className="w-3 h-3" /> Duplicate
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Saved workspaces */}
      {workspaces.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Saved Workspaces</h3>
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
          </CardContent>
        </Card>
      )}

      {/* Exclusion list */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
            Exclusion List
            <span className="text-xs text-zinc-500 font-normal">
              ({workspace.exclusionList.length} SKUs excluded)
            </span>
          </h3>

          {/* Search to add */}
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

          {/* Search results */}
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

          {/* Current exclusion list */}
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