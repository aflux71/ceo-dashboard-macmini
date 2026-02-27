import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Save,
  FolderOpen,
  AlertTriangle,
  Package,
  Calendar,
  TrendingUp,
  Send,
  ShoppingBag,
  Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import StatsCard from "@/components/dashboard/StatsCard";
import CSVUploader from "@/components/forecast/CSVUploader";
import EventsManager from "@/components/forecast/EventsManager";
import ConfigPanel from "@/components/forecast/ConfigPanel";
import ForecastResults from "@/components/forecast/ForecastResults";
import ExclusionsManager from "@/components/forecast/ExclusionsManager";
import PushToRunPlanner from "@/components/forecast/PushToRunPlanner";
import { calculateCompleteForecast } from "@/components/forecast/ForecastCalculations";
import { useForecast } from "@/components/forecast/ForecastContext";

export default function Forecasting() {
  // Use persistent context for forecast data
  const {
    activeWorkspace, setActiveWorkspace,
    retailData, setRetailData,
    onlineData, setOnlineData,
    inventorySnapshot, setInventorySnapshot,
    events, setEvents,
    exclusions, setExclusions,
    config, setConfig,
    resetWorkspace
  } = useForecast();

  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyDateRange, setShopifyDateRange] = useState(null);
  const [forecastGenerated, setForecastGenerated] = useState(false);
  const [forecastResults, setForecastResults] = useState([]);
  const [activeTab, setActiveTab] = useState("data");

  const queryClient = useQueryClient();

  const { data: workspaces = [] } = useQuery({
    queryKey: ['forecast_workspaces'],
    queryFn: () => base44.entities.ForecastWorkspace.list('-updated_date'),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const user = await base44.auth.me();
      if (activeWorkspace?.id) {
        return await base44.entities.ForecastWorkspace.update(activeWorkspace.id, {
          ...data,
          saved_by: user.full_name || user.email
        });
      }
      return await base44.entities.ForecastWorkspace.create({
        ...data,
        saved_by: user.full_name || user.email
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['forecast_workspaces'] });
      setShowSaveModal(false);
      setActiveWorkspace(result);
      setSaveName("");
      setSaveNotes("");
      toast.success('Workspace saved successfully');
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast.error('Failed to save: ' + (error?.message || 'Unknown error'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (workspaceId) => {
      return await base44.entities.ForecastWorkspace.delete(workspaceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast_workspaces'] });
      toast.success('Workspace deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete: ' + (error?.message || 'Unknown error'));
    }
  });

  const handleReset = () => {
    if (confirm('Clear all workspace data? This cannot be undone.')) {
      resetWorkspace();
      toast.success('Workspace cleared');
    }
  };

  // Load workspace data
  const loadWorkspace = (workspace) => {
    setActiveWorkspace(workspace);
    
    // Parse sales data
    let loadedRetail = [];
    let loadedOnline = [];
    let loadedInventory = [];
    
    if (workspace.sales_data) {
      try {
        loadedRetail = workspace.sales_data.retail?.[0] ? JSON.parse(workspace.sales_data.retail[0]) : [];
        loadedOnline = workspace.sales_data.online?.[0] ? JSON.parse(workspace.sales_data.online[0]) : [];
      } catch {
        loadedRetail = [];
        loadedOnline = [];
      }
    }
    
    if (workspace.inventory_data) {
      try {
        loadedInventory = workspace.inventory_data?.[0] ? JSON.parse(workspace.inventory_data[0]) : [];
      } catch {
        loadedInventory = [];
      }
    }
    
    // Set all state
    setRetailData(loadedRetail.length > 0 ? loadedRetail : null);
    setOnlineData(loadedOnline.length > 0 ? loadedOnline : null);
    setInventorySnapshot(loadedInventory.length > 0 ? loadedInventory : null);
    
    if (workspace.config) {
      setConfig(workspace.config);
    }
    
    if (workspace.events) {
      setEvents(workspace.events || []);
    }
    
    if (workspace.exclusions) {
      setExclusions(workspace.exclusions || []);
    }
    
    setForecastGenerated(false);
    setForecastResults([]);
    setShowLoadModal(false);
    toast.success('Workspace loaded — click Generate Forecast to run results');
  };

  // Handle CSV uploads
  const handleDataLoaded = (data, type) => {
    if (type === 'retail') setRetailData(data);
    if (type === 'online') setOnlineData(data);
    if (type === 'inventory') setInventorySnapshot(data);
  };

  // Load sales data from Shopify entities
  const handleLoadShopify = async () => {
    setShopifyLoading(true);
    try {
      const records = await base44.entities.ShopifySaleRecord.list();
      const retail = [];
      const online = [];

      records.forEach(r => {
        const qty = parseFloat(r.quantity) || 0;
        if (qty <= 0) return; // skip zero/negative rows
        const formatted = {
          day: r.order_date,
          sku: String(r.sku || '').trim(),
          product: r.product_name,
          location: r.location_name,
          qty
        };
        if (!formatted.sku || !formatted.day) return; // skip malformed rows
        if (r.channel === 'pos') retail.push(formatted);
        else online.push(formatted); // treat anything non-pos as online
      });

      setRetailData(retail.length > 0 ? retail : null);
      setOnlineData(online.length > 0 ? online : null);

      // Calculate date range
      const dates = records.map(r => r.order_date).filter(Boolean).sort();
      if (dates.length > 0) {
        setShopifyDateRange({ from: dates[0], to: dates[dates.length - 1] });
      }

      toast.success(`Loaded ${retail.length} retail + ${online.length} online records from Shopify`);
    } catch (err) {
      console.error('Shopify load error:', err);
      toast.error('Failed to load Shopify data: ' + (err?.message || 'Unknown error'));
    } finally {
      setShopifyLoading(false);
    }
  };

  // Use current inventory if no snapshot uploaded
  const effectiveInventory = React.useMemo(() => {
    return inventorySnapshot || inventory.map(i => ({
      sku: i.sku,
      product: i.name,
      quantity: i.quantity,
      unit: i.unit
    }));
  }, [inventorySnapshot, inventory]);

  // Handle stock level change from expanded row
  const handleStockChange = (sku, newValue) => {
    if (inventorySnapshot) {
      // Update inventory snapshot
      const updated = inventorySnapshot.map(item => 
        item.sku === sku ? { ...item, quantity: newValue } : item
      );
      setInventorySnapshot(updated);
    } else {
      // Create a snapshot from current inventory with the update
      const snapshot = inventory.map(i => ({
        sku: i.sku,
        product: i.name,
        quantity: i.sku === sku ? newValue : i.quantity,
        unit: i.unit
      }));
      setInventorySnapshot(snapshot);
    }
  };

  // Auto-save timer ref
  const autoSaveTimer = React.useRef(null);
  const [autoSaveStatus, setAutoSaveStatus] = React.useState(null);

  // Auto-save effect
  React.useEffect(() => {
    if (!activeWorkspace?.id) return;
    if (!retailData && !onlineData) return;

    // Clear existing timer
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    setAutoSaveStatus('pending');

    // Set new timer for 3 seconds
    autoSaveTimer.current = setTimeout(() => {
      setAutoSaveStatus('saving');
      saveMutation.mutate({
        name: activeWorkspace.name,
        version: "6.6",
        config,
        sales_data: {
          retail: retailData ? [JSON.stringify(retailData)] : [],
          online: onlineData ? [JSON.stringify(onlineData)] : []
        },
        inventory_data: inventorySnapshot ? [JSON.stringify(inventorySnapshot)] : [],
        events,
        exclusions,
        results: {},
        notes: activeWorkspace.notes || ''
      }, {
        onSuccess: () => setAutoSaveStatus('saved'),
        onError: () => setAutoSaveStatus('error')
      });
    }, 3000);

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [config, events, exclusions, inventorySnapshot, retailData, onlineData]);

  // Determine if we have sales data loaded
  const hasData = !!(retailData?.length || onlineData?.length);

  // Handle Generate Forecast button
  const handleGenerateForecast = () => {
    if (!hasData) {
      toast.error('Load sales data first (Shopify or CSV) before generating a forecast.');
      return;
    }
    const results = calculateCompleteForecast(
      { retail: retailData, online: onlineData },
      effectiveInventory,
      events,
      config,
      exclusions
    );
    setForecastResults(results);
    setForecastGenerated(true);
    setActiveTab("results");
    if (results.length === 0) {
      toast.warning('No SKUs found — check that your data has valid SKUs and quantities.');
    } else {
      toast.success(`Forecast generated: ${results.length} SKUs`);
    }
  };

  // Get all unique SKUs for event manager
  const availableSkus = React.useMemo(() => {
    const skus = new Set();
    const skuMap = {};
    
    (retailData || []).forEach(r => {
      if (!skus.has(r.sku)) {
        skus.add(r.sku);
        skuMap[r.sku] = { sku: r.sku, product: r.product };
      }
    });
    
    (onlineData || []).forEach(r => {
      if (!skus.has(r.sku)) {
        skus.add(r.sku);
        skuMap[r.sku] = { sku: r.sku, product: r.product };
      }
    });
    
    effectiveInventory.forEach(i => {
      if (!skus.has(i.sku)) {
        skus.add(i.sku);
        skuMap[i.sku] = { sku: i.sku, product: i.product || i.name };
      }
    });
    
    return Object.values(skuMap);
  }, [retailData, onlineData, effectiveInventory]);

  // Handle save
  const handleSave = () => {
    saveMutation.mutate({
      name: saveName || activeWorkspace?.name || `Forecast ${new Date().toLocaleDateString()}`,
      version: "6.6",
      config,
      sales_data: {
        retail: retailData ? [JSON.stringify(retailData)] : [],
        online: onlineData ? [JSON.stringify(onlineData)] : []
      },
      inventory_data: inventorySnapshot ? [JSON.stringify(inventorySnapshot)] : [],
      events,
      exclusions,
      results: {},
      notes: saveNotes
    });
  };

  // Stats
  const criticalItems = forecastResults.filter(r => r.urgency === 'critical');
  const eventItems = forecastResults.filter(r => r.urgency === 'event');
  const soonItems = forecastResults.filter(r => r.urgency === 'soon');
  const totalOrderQty = forecastResults.reduce((sum, r) => sum + r.orderQty, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Demand Forecasting</h1>
          <p className="text-zinc-500 text-sm mt-1 flex items-center gap-2">
            {activeWorkspace ? `Workspace: ${activeWorkspace.name}` : 'Production planning and demand forecasting v6.6'}
            {autoSaveStatus === 'pending' && <span className="text-xs text-zinc-600">• Unsaved changes</span>}
            {autoSaveStatus === 'saving' && <span className="text-xs text-orange-400">• Saving...</span>}
            {autoSaveStatus === 'saved' && <span className="text-xs text-green-400">• Saved</span>}
            {autoSaveStatus === 'error' && <span className="text-xs text-red-400">• Save failed</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
           <Button variant="outline" onClick={() => setShowLoadModal(true)}>
             <FolderOpen className="w-4 h-4 mr-2" />
             Load
           </Button>
           {forecastGenerated && (
             <Button variant="outline" onClick={() => setShowPushModal(true)}>
               <Send className="w-4 h-4 mr-2" />
               Push to Planner
             </Button>
           )}
           <Button
             onClick={handleGenerateForecast}
             disabled={!hasData}
             className="bg-orange-500 hover:bg-orange-600 text-white font-semibold"
           >
             <TrendingUp className="w-4 h-4 mr-2" />
             {forecastGenerated ? 'Regenerate' : 'Generate Forecast'}
           </Button>
           <Button 
             onClick={() => {
               setSaveName(activeWorkspace?.name || '');
               setSaveNotes(activeWorkspace?.notes || '');
               setShowSaveModal(true);
             }} 
             variant="outline"
           >
             <Save className="w-4 h-4 mr-2" />
             Save Workspace
           </Button>
           <Button variant="outline" onClick={handleReset} className="text-red-400 hover:text-red-300">
             Reset
           </Button>
         </div>
      </div>

      {/* Stats Dashboard */}
      {forecastGenerated && forecastResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard
            title="Critical Items"
            value={criticalItems.length}
            subtitle="Immediate action needed"
            icon={AlertTriangle}
          />
          <StatsCard
            title="Event Orders"
            value={eventItems.length}
            subtitle="Store/wholesale events"
            icon={Calendar}
          />
          <StatsCard
            title="Order Soon"
            value={soonItems.length}
            subtitle="1-3 months coverage"
            icon={TrendingUp}
          />
          <StatsCard
            title="Total Order Qty"
            value={totalOrderQty.toLocaleString()}
            subtitle="Units to produce"
            icon={Package}
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-zinc-800">
          <TabsTrigger value="data">Data Import</TabsTrigger>
          <TabsTrigger value="config">Settings</TabsTrigger>
          <TabsTrigger value="exclusions">Exclusions</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="results">Results {forecastGenerated && <span className="ml-1 text-xs text-green-400">({forecastResults.length})</span>}</TabsTrigger>
        </TabsList>

        {/* Data Import Tab */}
        <TabsContent value="data" className="space-y-4">
          {/* Shopify Import */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-green-400" />
                    Load from Shopify
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    Pull retail (POS) and online sales directly from synced Shopify data
                  </p>
                </div>
                <Button
                  onClick={handleLoadShopify}
                  disabled={shopifyLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {shopifyLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                  ) : (
                    <><ShoppingBag className="w-4 h-4 mr-2" />Load from Shopify</>
                  )}
                </Button>
              </div>
              {shopifyDateRange && (
                <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-zinc-400 bg-zinc-800/50 rounded px-3 py-2 border border-zinc-700">
                  <span>
                    Shopify data loaded: <span className="text-zinc-200">{shopifyDateRange.from}</span> to <span className="text-zinc-200">{shopifyDateRange.to}</span>
                    {retailData && <span className="ml-3 text-orange-400">{retailData.length} retail rows</span>}
                    {onlineData && <span className="ml-3 text-blue-400">{onlineData.length} online rows</span>}
                  </span>
                  <Button
                    onClick={handleGenerateForecast}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-semibold"
                    size="sm"
                  >
                    <TrendingUp className="w-4 h-4 mr-1.5" />
                    Generate Forecast
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* CSV Upload Fallback */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-6">
              <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wide font-medium">Or upload CSV files manually</p>
              <div className="grid md:grid-cols-3 gap-4">
                <CSVUploader
                  type="retail"
                  label="Retail Sales (by location)"
                  onDataLoaded={handleDataLoaded}
                />
                <CSVUploader
                  type="online"
                  label="Online Sales"
                  onDataLoaded={handleDataLoaded}
                />
                <CSVUploader
                  type="inventory"
                  label="Inventory Snapshot (optional)"
                  onDataLoaded={handleDataLoaded}
                />
              </div>

              <div className="mt-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <p className="text-sm text-zinc-400">
                  <strong className="text-zinc-300">Required columns:</strong> Day/Date, Product SKU/SKU, Product/Title, Net quantity/Qty
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Optional: Location (for retail data)
                </p>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="config">
          <ConfigPanel config={config} onChange={setConfig} />
        </TabsContent>

        {/* Exclusions Tab */}
        <TabsContent value="exclusions">
          <ExclusionsManager
            exclusions={exclusions}
            onExclusionsChange={setExclusions}
            availableSkus={availableSkus.map(s => s.sku)}
          />
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events">
          <EventsManager
            events={events}
            onEventsChange={setEvents}
            availableSkus={availableSkus}
          />
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results">
          {!forecastGenerated ? (
            <div className="flex flex-col items-center justify-center py-24 gap-6">
              <TrendingUp className="w-16 h-16 text-zinc-700" />
              <div className="text-center">
                <p className="text-zinc-300 text-lg font-medium">No forecast generated yet</p>
                <p className="text-zinc-500 text-sm mt-1">
                  {hasData ? 'Click the button below to run the forecast.' : 'Load sales data first, then generate your forecast.'}
                </p>
              </div>
              <Button
                onClick={handleGenerateForecast}
                disabled={!hasData}
                className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 text-base font-semibold"
              >
                <TrendingUp className="w-5 h-5 mr-2" />
                {hasData ? 'Generate Forecast' : 'Load Data First'}
              </Button>
            </div>
          ) : (
            <ForecastResults results={forecastResults} onStockChange={handleStockChange} config={config} />
          )}
        </TabsContent>
      </Tabs>

      {/* Load Modal */}
      <Dialog open={showLoadModal} onOpenChange={setShowLoadModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
          <DialogHeader>
            <DialogTitle>Load Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {workspaces.length === 0 ? (
              <p className="text-center text-zinc-500 py-8">No saved workspaces</p>
            ) : (
              workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 hover:border-orange-500/50 transition-colors"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div 
                      onClick={() => loadWorkspace(ws)}
                      className="flex-1 cursor-pointer"
                    >
                      <p className="font-semibold text-zinc-100">{ws.name}</p>
                      {ws.notes && <p className="text-sm text-zinc-500 mt-1">{ws.notes}</p>}
                      <p className="text-xs text-zinc-500 mt-2">
                        {new Date(ws.updated_date).toLocaleDateString()} • v{ws.version || '6.6'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${ws.name}"?`)) {
                          deleteMutation.mutate(ws.id);
                        }
                      }}
                      className="text-zinc-500 hover:text-red-400 p-2"
                      title="Delete workspace"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>Save Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Workspace Name</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g., February 2026 Forecast"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="Any notes about this forecast..."
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveModal(false)}>Cancel</Button>
            <Button 
              onClick={handleSave} 
              className="bg-orange-500 hover:bg-orange-600"
              disabled={saveMutation.isPending || (!saveName && !activeWorkspace?.name)}
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push to Run Planner Modal */}
      <PushToRunPlanner
        open={showPushModal}
        onOpenChange={setShowPushModal}
        results={forecastResults}
        workspaceId={activeWorkspace?.id}
        workspaceName={activeWorkspace?.name || saveName}
      />
    </div>
  );
}