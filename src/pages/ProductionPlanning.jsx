import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Factory, ClipboardList, FlaskConical, Layers, CalendarDays, Hammer, Truck,
  FileText, Plus, Minus, Search, ArrowRight, ArrowLeft, Package, Loader2,
  Check, X, ShoppingCart, AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, Calculator, Clock, BarChart3, Calendar, Eye, EyeOff, Timer,
  Send, Building2, MapPin, RotateCcw, ExternalLink, Pencil, Trash2, Copy
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/Badge";

const placeholderTabs = [];
const colorMap = {};

const urgencyConfig = {
  critical: { variant: "red", label: "Critical" },
  soon:     { variant: "amber", label: "Soon" },
  ok:       { variant: "green", label: "OK" },
};

const emptyForm = {
  product_name: "",
  sku: "",
  quantity: "",
  reason: "",
  urgency: "ok",
};

// ─── Requests Tab ──────────────────────────────────────────────────────────────

function RequestsTab() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null); // null = create mode, id = edit mode
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const { data: forecastItems = [], isLoading: loadingForecasts } = useQuery({
    queryKey: ["planning_forecast_suggestions"],
    queryFn: () => base44.entities.ForecastSuggestion.filter(
      { status: "suggested" },
      "-created_date"
    ),
  });

  const { data: manualItems = [], isLoading: loadingManual } = useQuery({
    queryKey: ["planning_production_requests"],
    queryFn: async () => {
      try {
        return await base44.entities.ProductionRequest.filter(
          { status: { $in: ["pending", "material_check"] } },
          "-created_date"
        );
      } catch {
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ProductionRequest.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] }); toast.success("Request created"); setDialogOpen(false); setForm(emptyForm); },
    onError: (err) => toast.error(`Failed to create request: ${err?.response?.data?.message || err?.message || String(err)}`),
  });

  const sendForecastMutation = useMutation({
    mutationFn: (item) => base44.entities.ForecastSuggestion.update(item.id, { status: "material_check" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_forecast_suggestions"] }); queryClient.invalidateQueries({ queryKey: ["planning_material_check_forecasts"] }); toast.success("Sent to Material Check"); },
    onError: () => toast.error("Failed to send to Material Check"),
  });
  const sendManualMutation = useMutation({
    mutationFn: (item) => base44.entities.ProductionRequest.update(item.id, { status: "material_check" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] }); queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] }); toast.success("Sent to Material Check"); },
    onError: () => toast.error("Failed to send to Material Check"),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionRequest.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] }); toast.success("Request updated"); setDialogOpen(false); setForm(emptyForm); setEditingId(null); },
    onError: (err) => toast.error(`Failed to update: ${err?.response?.data?.message || err?.message || String(err)}`),
  });
  const deleteMutation = useMutation({
    mutationFn: ({ id, type }) => type === "forecast" ? base44.entities.ForecastSuggestion.delete(id) : base44.entities.ProductionRequest.delete(id),
    onSuccess: (_, { type }) => { if (type === "forecast") queryClient.invalidateQueries({ queryKey: ["planning_forecast_suggestions"] }); else queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] }); toast.success("Request deleted"); setDeleteConfirmId(null); },
    onError: (err) => toast.error(`Failed to delete: ${err?.message || String(err)}`),
  });

  const allItems = useMemo(() => {
    const forecast = forecastItems.map((item) => {
      const qty = item.order_qty || item.forecast_qty || item.suggested_qty || 0;
      return {
        id: item.id,
        type: "forecast",
        sku: item.sku,
        product_name: item.product_name,
        quantity: qty,
        urgency: item.urgency === "event" ? "soon" : item.urgency || "ok",
        source: "Forecast",
        reason: item.notes || `Forecast suggests ${qty} units`,
        on_hand: item.on_hand,
        created: item.created_date,
        _raw: item,
      };
    });

    const manual = manualItems
      .filter((item) => item.status === "pending")
      .map((item) => ({
        id: item.id,
        type: "manual",
        sku: item.sku,
        product_name: item.product_name,
        quantity: item.quantity_needed || item.quantity || 0,
        urgency: item.urgency || "ok",
        source: "Manual",
        reason: item.reason || "",
        on_hand: null,
        created: item.created_date,
        _raw: item,
      }));

    return [...forecast, ...manual];
  }, [forecastItems, manualItems]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (filter !== "all") {
      items = items.filter((i) => i.urgency === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.sku?.toLowerCase().includes(q) ||
          i.product_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [allItems, filter, search]);

  const counts = useMemo(() => ({
    all: allItems.length,
    critical: allItems.filter((i) => i.urgency === "critical").length,
    soon: allItems.filter((i) => i.urgency === "soon").length,
    ok: allItems.filter((i) => i.urgency === "ok").length,
  }), [allItems]);

  const isLoading = loadingForecasts || loadingManual;

  const handleSave = () => {
    if (!form.product_name || !form.sku || !form.quantity) {
      toast.error("Product name, SKU, and quantity are required");
      return;
    }
    const payload = {
      product_name: form.product_name,
      sku: form.sku,
      quantity_needed: Number(form.quantity),
      reason: form.reason,
      urgency: form.urgency,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ ...payload, status: "pending" });
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      product_name: item.product_name || "",
      sku: item.sku || "",
      quantity: String(item.quantity || ""),
      reason: item.reason || "",
      urgency: item.urgency || "ok",
    });
    setDialogOpen(true);
  };

  const handleSend = (item) => {
    if (item.type === "forecast") {
      sendForecastMutation.mutate(item._raw);
    } else {
      sendManualMutation.mutate(item._raw);
    }
  };

  const filterButtons = [
    { key: "all", label: "All", count: counts.all },
    { key: "critical", label: "Critical", count: counts.critical },
    { key: "soon", label: "Soon", count: counts.soon },
    { key: "ok", label: "OK", count: counts.ok },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${filter === btn.key
                  ? btn.key === "critical"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : btn.key === "soon"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : btn.key === "ok"
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                }
              `}
            >
              {btn.label}
              {btn.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  filter === btn.key ? "bg-white/10" : "bg-zinc-700"
                }`}>
                  {btn.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search SKU or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56 bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
            />
          </div>
          <Button
            onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}
            className="bg-orange-500 hover:bg-orange-600 text-white h-9"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Request
          </Button>
        </div>
      </div>

      {/* Request Cards */}
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 rounded-xl bg-zinc-800 mb-4">
                <ClipboardList className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 text-sm">
                {allItems.length === 0
                  ? "No pending requests. Forecast suggestions and manual requests will appear here."
                  : "No requests match the current filter."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((item) => {
            const urg = urgencyConfig[item.urgency] || urgencyConfig.ok;
            const isSending =
              (item.type === "forecast" && sendForecastMutation.isPending) ||
              (item.type === "manual" && sendManualMutation.isPending);

            return (
              <Card
                key={`${item.type}-${item.id}`}
                className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs font-mono text-zinc-500">
                          {item.sku}
                        </span>
                        <Badge variant={urg.variant}>{urg.label}</Badge>
                        <Badge variant={item.type === "forecast" ? "blue" : "purple"}>
                          {item.source}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-medium text-zinc-100 truncate">
                        {item.product_name}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" />
                          <span className="text-zinc-300 font-medium">
                            {item.quantity?.toLocaleString()}
                          </span>{" "}
                          units needed
                        </span>
                        {item.on_hand != null && (
                          <span>
                            On hand:{" "}
                            <span className="text-zinc-300">
                              {item.on_hand?.toLocaleString()}
                            </span>
                          </span>
                        )}
                      </div>
                      {item.reason && (
                        <p className="text-xs text-zinc-500 mt-1.5 line-clamp-1">
                          {item.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.type === "manual" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                          title="Edit request"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(item)}
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Delete request"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSend(item)}
                        disabled={isSending}
                        className="border-zinc-700 hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-400"
                        title="Send to Material Check"
                      >
                        {isSending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Factory className="w-4 h-4 mr-1.5" />
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setForm(emptyForm); setEditingId(null); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Production Request" : "New Production Request"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Product Name *</Label>
                <Input
                  placeholder="e.g. Lavender Body Lotion"
                  value={form.product_name}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">SKU *</Label>
                <Input
                  placeholder="e.g. LBL-250ML"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Quantity Needed *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Urgency</Label>
                <Select
                  value={form.urgency}
                  onValueChange={(val) => setForm({ ...form, urgency: val })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="soon">Soon</SelectItem>
                    <SelectItem value="ok">OK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Reason</Label>
              <Textarea
                placeholder="Why is this production needed?"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDialogOpen(false); setForm(emptyForm); setEditingId(null); }}
              className="border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={editingId ? updateMutation.isPending : createMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {(editingId ? updateMutation.isPending : createMutation.isPending) ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : editingId ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {editingId ? "Save Changes" : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 py-2">
            Are you sure you want to delete this production request? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              className="border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteMutation.mutate({ id: deleteConfirmId.id, type: deleteConfirmId.type })}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Material Check Tab ────────────────────────────────────────────────────────

function MaterialCheckTab() {
  const queryClient = useQueryClient();
  // Track which cards have been "checked" — keyed by `type-id`
  const [checkedItems, setCheckedItems] = useState({});
  const [mcEditDialogOpen, setMcEditDialogOpen] = useState(false);
  const [mcEditingId, setMcEditingId] = useState(null);
  const [mcEditForm, setMcEditForm] = useState(emptyForm);
  const [mcDeleteConfirmId, setMcDeleteConfirmId] = useState(null);

  // Items in material_check status from both sources
  const { data: mcForecasts = [], isLoading: loadingMcF } = useQuery({
    queryKey: ["planning_material_check_forecasts"],
    queryFn: () => base44.entities.ForecastSuggestion.filter(
      { status: "material_check" },
      "-created_date"
    ),
  });

  const { data: mcManual = [], isLoading: loadingMcM } = useQuery({
    queryKey: ["planning_material_check_manual"],
    queryFn: async () => {
      try {
        return await base44.entities.ProductionRequest.filter(
          { status: "material_check" },
          "-created_date"
        );
      } catch {
        return [];
      }
    },
  });

  // Recipes & Inventory for material calculations
  const { data: recipes = [] } = useQuery({
    queryKey: ["planning_recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["planning_inventory"],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const approveForecastMutation = useMutation({
    mutationFn: async ({ item, production_type }) => {
      const pr = await base44.entities.ProductionRequest.create({ sku: item.sku, product_name: item.product_name, quantity_needed: item.order_qty || item.forecast_qty || item.suggested_qty || 0, status: "approved", production_type, source: "forecast", urgency: item.urgency });
      await base44.entities.ForecastSuggestion.update(item.id, { status: "in_production" });
      return pr;
    },
    onSuccess: () => { ["planning_material_check_forecasts","planning_forecast_suggestions","planning_batch_queue_manual","planning_production_requests"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] })); toast.success("Approved — moved to Batch Queue"); },
    onError: (err) => toast.error(`Failed to approve: ${err?.response?.data?.message || err?.message || String(err)}`),
  });
  const approveManualMutation = useMutation({
    mutationFn: ({ id, production_type }) => base44.entities.ProductionRequest.update(id, { status: "approved", production_type }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] }); queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] }); toast.success("Approved — moved to Batch Queue"); },
    onError: (err) => toast.error(`Failed to approve: ${err?.response?.data?.message || err?.message || String(err)}`),
  });
  const returnForecastMutation = useMutation({
    mutationFn: (id) => base44.entities.ForecastSuggestion.update(id, { status: "suggested" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_material_check_forecasts"] }); queryClient.invalidateQueries({ queryKey: ["planning_forecast_suggestions"] }); toast.success("Returned to Requests"); },
    onError: () => toast.error("Failed to return"),
  });
  const returnManualMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductionRequest.update(id, { status: "pending" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] }); queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] }); toast.success("Returned to Requests"); },
    onError: () => toast.error("Failed to return"),
  });
  const mcUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionRequest.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] }); toast.success("Request updated"); setMcEditDialogOpen(false); setMcEditForm(emptyForm); setMcEditingId(null); },
    onError: (err) => toast.error(`Failed to update: ${err?.response?.data?.message || err?.message || String(err)}`),
  });
  const mcDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductionRequest.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] }); queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] }); toast.success("Request deleted"); setMcDeleteConfirmId(null); },
    onError: (err) => toast.error(`Failed to delete: ${err?.response?.data?.message || err?.message || String(err)}`),
  });

  // Normalize items
  const allItems = useMemo(() => {
    const forecast = mcForecasts.map((item) => ({
      id: item.id,
      type: "forecast",
      sku: item.sku,
      product_name: item.product_name,
      quantity: item.order_qty || item.forecast_qty || item.suggested_qty || 0,
      urgency: item.urgency === "event" ? "soon" : item.urgency || "ok",
      source: "Forecast",
      _raw: item,
    }));

    const manual = mcManual.map((item) => ({
      id: item.id,
      type: "manual",
      sku: item.sku,
      product_name: item.product_name,
      quantity: item.quantity_needed || item.quantity || 0,
      urgency: item.urgency || "ok",
      source: "Manual",
      _raw: item,
    }));

    return [...forecast, ...manual];
  }, [mcForecasts, mcManual]);

  const isLoading = loadingMcF || loadingMcM;

  // Build inventory lookup map
  const inventoryMap = useMemo(() => {
    const map = {};
    inventory.forEach((item) => {
      if (item.sku) map[item.sku.toLowerCase()] = item;
    });
    return map;
  }, [inventory]);

  // Find recipe by product SKU
  const findRecipe = (sku) => {
    if (!sku) return null;
    return recipes.find(
      (r) => r.sku?.toLowerCase() === sku.toLowerCase() && r.active !== false
    );
  };

  // Calculate material requirements for an item
  const checkMaterials = (item) => {
    const recipe = findRecipe(item.sku);
    if (!recipe) return null;

    const batchSize = recipe.batch_size || 1;
    const multiplier = Math.ceil(item.quantity / batchSize);
    const batchesNeeded = multiplier;

    const ingredients = (recipe.ingredients || []).map((ing) => {
      const required = (ing.qty || 0) * multiplier;
      const invItem = inventoryMap[ing.sku?.toLowerCase()];
      const onHand = invItem ? invItem.quantity || 0 : 0;
      const sufficient = onHand >= required;
      const shortfall = sufficient ? 0 : required - onHand;

      return {
        name: ing.material || ing.sku,
        sku: ing.sku,
        unit: ing.unit || "",
        required: Math.round(required * 100) / 100,
        onHand: Math.round(onHand * 100) / 100,
        sufficient,
        shortfall: Math.round(shortfall * 100) / 100,
      };
    });

    const packaging = (recipe.packaging || []).map((pkg) => {
      const required = (pkg.qty_per_unit || 0) * item.quantity;
      const invItem = inventoryMap[pkg.sku?.toLowerCase()];
      const onHand = invItem ? invItem.quantity || 0 : 0;
      const sufficient = onHand >= required;
      const shortfall = sufficient ? 0 : required - onHand;

      return {
        name: pkg.name || pkg.sku,
        sku: pkg.sku,
        unit: "pcs",
        required: Math.round(required * 100) / 100,
        onHand: Math.round(onHand * 100) / 100,
        sufficient,
        shortfall: Math.round(shortfall * 100) / 100,
      };
    });

    const allMaterials = [...ingredients, ...packaging];
    const shortCount = allMaterials.filter((m) => !m.sufficient).length;

    return { recipe, batchesNeeded, batchSize, ingredients, packaging, allMaterials, shortCount };
  };

  const handleCheck = (item) => {
    const key = `${item.type}-${item.id}`;
    const result = checkMaterials(item);
    setCheckedItems((prev) => ({ ...prev, [key]: result }));
  };

  const handleApprove = (item, productionType) => {
    if (item.type === "forecast") {
      approveForecastMutation.mutate({ item, production_type: productionType });
    } else {
      approveManualMutation.mutate({ id: item.id, production_type: productionType });
    }
  };

  const handleReturn = (item) => {
    if (item.type === "forecast") {
      returnForecastMutation.mutate(item.id);
    } else {
      returnManualMutation.mutate(item.id);
    }
  };

  const handleCreatePO = (item, materialResult) => {
    // Approve as "buy" first
    handleApprove(item, "buy");
    // Create purchase requisitions for short items
    const shortItems = materialResult.allMaterials.filter((m) => !m.sufficient);
    shortItems.forEach((mat) => {
      base44.entities.PurchaseRequisition.create({
        item_sku: mat.sku,
        item_name: mat.name,
        current_qty: mat.onHand,
        suggested_qty: mat.shortfall,
        urgency: item.urgency || "ok",
        notes: `Auto-created from Production Planning for ${item.product_name} (${item.sku})`,
        status: "pending",
        requested_at: new Date().toISOString(),
      }).catch(() => {});
    });
    toast.success(`${shortItems.length} purchase requisition(s) created`);
    queryClient.invalidateQueries({ queryKey: ["purchase_requisitions"] });
  };

  const handleMcEdit = (item) => {
    setMcEditingId(item.id);
    setMcEditForm({
      product_name: item.product_name || "",
      sku: item.sku || "",
      quantity: String(item.quantity || ""),
      reason: item._raw?.reason || "",
      urgency: item.urgency || "ok",
    });
    setMcEditDialogOpen(true);
  };

  const handleMcSave = () => {
    if (!mcEditForm.product_name || !mcEditForm.sku || !mcEditForm.quantity) {
      toast.error("Product name, SKU, and quantity are required");
      return;
    }
    mcUpdateMutation.mutate({
      id: mcEditingId,
      data: {
        product_name: mcEditForm.product_name,
        sku: mcEditForm.sku,
        quantity_needed: Number(mcEditForm.quantity),
        reason: mcEditForm.reason,
        urgency: mcEditForm.urgency,
      },
    });
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </CardContent>
        </Card>
      ) : allItems.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 rounded-xl bg-zinc-800 mb-4">
                <FlaskConical className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 text-sm">
                No items awaiting material check. Send requests from the Requests tab to begin.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allItems.map((item) => {
            const key = `${item.type}-${item.id}`;
            const urg = urgencyConfig[item.urgency] || urgencyConfig.ok;
            const materialResult = checkedItems[key];
            const hasRecipe = !!findRecipe(item.sku);

            return (
              <Card
                key={key}
                className="bg-zinc-900 border-zinc-800"
              >
                <CardContent className="p-5">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-zinc-500">{item.sku}</span>
                        <Badge variant={urg.variant}>{urg.label}</Badge>
                        <Badge variant={item.type === "forecast" ? "blue" : "purple"}>
                          {item.source}
                        </Badge>
                      </div>
                      <h3 className="text-base font-medium text-zinc-100">{item.product_name}</h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        <span className="text-zinc-300 font-medium">{item.quantity?.toLocaleString()}</span> units requested
                        {materialResult && (
                          <span className="text-zinc-600 mx-1.5">·</span>
                        )}
                        {materialResult && (
                          <span className="text-zinc-400">
                            {materialResult.batchesNeeded} batch{materialResult.batchesNeeded !== 1 ? "es" : ""} of {materialResult.batchSize}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.type === "manual" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMcEdit(item)}
                            className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                            title="Edit request"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMcDeleteConfirmId(item.id)}
                            className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                            title="Delete request"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {!materialResult && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCheck(item)}
                          disabled={!hasRecipe}
                          className="border-zinc-700 hover:border-purple-500/50 hover:bg-purple-500/10 hover:text-purple-400"
                          title={hasRecipe ? "Check Materials" : "No recipe found for this SKU"}
                        >
                          <FlaskConical className="w-4 h-4 mr-1.5" />
                          Check Materials
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReturn(item)}
                        className="text-zinc-500 hover:text-zinc-300"
                        title="Return to Requests"
                      >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Return
                      </Button>
                    </div>
                  </div>

                  {/* No recipe warning */}
                  {!hasRecipe && !materialResult && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      No recipe found for SKU "{item.sku}". Create a recipe first or approve manually.
                    </div>
                  )}

                  {/* Material check found no recipe */}
                  {materialResult === null && checkedItems.hasOwnProperty(key) && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      <X className="w-4 h-4 shrink-0" />
                      Could not find an active recipe for this SKU.
                    </div>
                  )}

                  {/* Material Breakdown */}
                  {materialResult && materialResult.allMaterials.length > 0 && (
                    <div className="space-y-3">
                      {/* Status Banner */}
                      {materialResult.shortCount === 0 ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          All materials available
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          {materialResult.shortCount} ingredient{materialResult.shortCount !== 1 ? "s" : ""} short
                        </div>
                      )}

                      {/* Ingredients Table */}
                      <div className="rounded-lg border border-zinc-800 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-zinc-800 hover:bg-transparent">
                              <TableHead className="text-zinc-500 text-xs font-medium">Ingredient</TableHead>
                              <TableHead className="text-zinc-500 text-xs font-medium text-right">Required</TableHead>
                              <TableHead className="text-zinc-500 text-xs font-medium text-right">On Hand</TableHead>
                              <TableHead className="text-zinc-500 text-xs font-medium text-center w-24">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {materialResult.allMaterials.map((mat, idx) => (
                              <TableRow key={idx} className="border-zinc-800">
                                <TableCell className="text-sm text-zinc-200">
                                  <div>
                                    {mat.name}
                                    {mat.sku && (
                                      <span className="text-xs text-zinc-600 ml-2 font-mono">{mat.sku}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-zinc-300 text-right font-mono">
                                  {mat.required.toLocaleString()} {mat.unit}
                                </TableCell>
                                <TableCell className="text-sm text-zinc-300 text-right font-mono">
                                  {mat.onHand.toLocaleString()} {mat.unit}
                                </TableCell>
                                <TableCell className="text-center">
                                  {mat.sufficient ? (
                                    <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
                                      <Check className="w-3.5 h-3.5" />
                                      OK
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                                      <X className="w-3.5 h-3.5" />
                                      −{mat.shortfall.toLocaleString()}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(item, "make")}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Hammer className="w-4 h-4 mr-1.5" />
                          Approve — Make
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(item, "copacked")}
                          className="bg-cyan-600 hover:bg-cyan-700 text-white"
                        >
                          <Truck className="w-4 h-4 mr-1.5" />
                          Approve — Co-pack
                        </Button>
                        {materialResult.shortCount > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCreatePO(item, materialResult)}
                            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                          >
                            <ShoppingCart className="w-4 h-4 mr-1.5" />
                            Create PO ({materialResult.shortCount} item{materialResult.shortCount !== 1 ? "s" : ""})
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action buttons when no recipe but still want to approve manually */}
                  {!materialResult && !hasRecipe && (
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(item, "make")}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Hammer className="w-4 h-4 mr-1.5" />
                        Approve — Make
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(item, "copacked")}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white"
                      >
                        <Truck className="w-4 h-4 mr-1.5" />
                        Approve — Co-pack
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={mcEditDialogOpen} onOpenChange={(open) => { if (!open) { setMcEditDialogOpen(false); setMcEditForm(emptyForm); setMcEditingId(null); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Edit Production Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Product Name *</Label>
                <Input
                  placeholder="e.g. Lavender Body Lotion"
                  value={mcEditForm.product_name}
                  onChange={(e) => setMcEditForm({ ...mcEditForm, product_name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">SKU *</Label>
                <Input
                  placeholder="e.g. LBL-250ML"
                  value={mcEditForm.sku}
                  onChange={(e) => setMcEditForm({ ...mcEditForm, sku: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Quantity Needed *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={mcEditForm.quantity}
                  onChange={(e) => setMcEditForm({ ...mcEditForm, quantity: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Urgency</Label>
                <Select
                  value={mcEditForm.urgency}
                  onValueChange={(val) => setMcEditForm({ ...mcEditForm, urgency: val })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="soon">Soon</SelectItem>
                    <SelectItem value="ok">OK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Reason</Label>
              <Textarea
                placeholder="Why is this production needed?"
                value={mcEditForm.reason}
                onChange={(e) => setMcEditForm({ ...mcEditForm, reason: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMcEditDialogOpen(false); setMcEditForm(emptyForm); setMcEditingId(null); }} className="border-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleMcSave} disabled={mcUpdateMutation.isPending} className="bg-orange-500 hover:bg-orange-600 text-white">
              {mcUpdateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!mcDeleteConfirmId} onOpenChange={(open) => { if (!open) setMcDeleteConfirmId(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 py-2">
            Are you sure you want to delete this production request? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMcDeleteConfirmId(null)} className="border-zinc-700">Cancel</Button>
            <Button onClick={() => mcDeleteMutation.mutate(mcDeleteConfirmId)} disabled={mcDeleteMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {mcDeleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Batch Queue Tab ───────────────────────────────────────────────────────────

function addDays(dateStr, days) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const defaultSchedule = {
  batch_date: new Date().toISOString().split("T")[0],
  operator: "",
  production_line: "1",
  batch_size: "",
  qc_override: false,
  qc_date_override: "",
  qc_notes: "",
  fill_date: "",
  fill_operator: "",
  fill_line: "1",
};

function BatchQueueTab() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [schedules, setSchedules] = useState({});
  const [calcTarget, setCalcTarget] = useState({});
  const [bqEditDialogOpen, setBqEditDialogOpen] = useState(false);
  const [bqEditingId, setBqEditingId] = useState(null);
  const [bqEditForm, setBqEditForm] = useState(emptyForm);
  const [bqDeleteConfirmId, setBqDeleteConfirmId] = useState(null);

  // Approved items with production_type = 'make' from both sources
  const { data: bqForecasts = [], isLoading: loadingBqF } = useQuery({
    queryKey: ["planning_batch_queue_forecasts"],
    queryFn: () => base44.entities.ForecastSuggestion.filter(
      { status: "approved", production_type: "make" },
      "-created_date"
    ),
  });

  const { data: bqManual = [], isLoading: loadingBqM } = useQuery({
    queryKey: ["planning_batch_queue_manual"],
    queryFn: async () => {
      try {
        return await base44.entities.ProductionRequest.filter(
          { status: "approved", production_type: "make" },
          "-created_date"
        );
      } catch {
        return [];
      }
    },
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["planning_recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["planning_batches"],
    queryFn: () => base44.entities.Batch.list("-created_date", 500),
  });

  const scheduleForecastMutation = useMutation({
    mutationFn: async ({ item, batchData }) => { const batch = await base44.entities.Batch.create(batchData); await base44.entities.ForecastSuggestion.update(item.id, { status: "in_production", scheduled_batch_id: batch.id }); return batch; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_forecasts"] }); queryClient.invalidateQueries({ queryKey: ["planning_batches"] }); toast.success("Batch scheduled"); },
    onError: () => toast.error("Failed to schedule batch"),
  });
  const scheduleManualMutation = useMutation({
    mutationFn: async ({ item, batchData }) => { const batch = await base44.entities.Batch.create(batchData); await base44.entities.ProductionRequest.update(item.id, { status: "in_production", batch_id: batch.id }); return batch; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] }); queryClient.invalidateQueries({ queryKey: ["planning_batches"] }); toast.success("Batch scheduled"); },
    onError: () => toast.error("Failed to schedule batch"),
  });
  const bqUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionRequest.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] }); toast.success("Request updated"); setBqEditDialogOpen(false); setBqEditForm(emptyForm); setBqEditingId(null); },
    onError: (err) => toast.error(`Failed to update: ${err?.response?.data?.message || err?.message || String(err)}`),
  });
  const bqDeleteMutation = useMutation({
    mutationFn: async (item) => { const rel = batches.filter((b) => b.sku === item.sku && b.product_name === item.product_name && ["pending", "draft"].includes(b.status)); await Promise.all(rel.map((b) => base44.entities.Batch.delete(b.id).catch(() => {}))); await base44.entities.ProductionRequest.delete(item.id); },
    onSuccess: () => { ["planning_batch_queue_manual","planning_batches","planning_production_requests"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] })); toast.success("Request and batches deleted"); setBqDeleteConfirmId(null); },
    onError: (err) => toast.error(`Failed to delete: ${err?.response?.data?.message || err?.message || String(err)}`),
  });

  const findRecipe = useCallback((sku) => {
    if (!sku) return null;
    return recipes.find(
      (r) => r.sku?.toLowerCase() === sku.toLowerCase() && r.active !== false
    );
  }, [recipes]);

  const generateBatchId = useCallback((sku) => {
    const prefix = sku?.substring(0, 3)?.toUpperCase() || "BAT";
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const count = batches.filter(
      (b) => b.batch_id?.startsWith(`${prefix}-${date}`)
    ).length + 1;
    return `${prefix}-${date}-${count}`;
  }, [batches]);

  // Normalize items
  const allItems = useMemo(() => {
    const forecast = bqForecasts.map((item) => ({
      id: item.id,
      type: "forecast",
      sku: item.sku,
      product_name: item.product_name,
      quantity: item.order_qty || item.forecast_qty || item.suggested_qty || 0,
      urgency: item.urgency === "event" ? "soon" : item.urgency || "ok",
      source: "Forecast",
      _raw: item,
    }));

    const manual = bqManual.map((item) => ({
      id: item.id,
      type: "manual",
      sku: item.sku,
      product_name: item.product_name,
      quantity: item.quantity_needed || item.quantity || 0,
      urgency: item.urgency || "ok",
      source: "Manual",
      _raw: item,
    }));

    return [...forecast, ...manual];
  }, [bqForecasts, bqManual]);

  const isLoading = loadingBqF || loadingBqM;

  const toggleExpand = (item) => {
    const key = `${item.type}-${item.id}`;
    if (expandedId === key) {
      setExpandedId(null);
      return;
    }
    setExpandedId(key);
    // Initialize schedule form if not already set
    if (!schedules[key]) {
      const recipe = findRecipe(item.sku);
      const batchSize = recipe?.batch_size || item.quantity;
      const qcDays = recipe?.qc_hold_time_days || 3;
      const batchDate = new Date().toISOString().split("T")[0];
      const qcDate = addDays(batchDate, qcDays);
      const fillDate = addDays(qcDate, 1);
      setSchedules((prev) => ({
        ...prev,
        [key]: {
          ...defaultSchedule,
          batch_date: batchDate,
          batch_size: String(batchSize),
          qc_date_override: "",
          fill_date: fillDate,
          _qcDays: qcDays,
          _recipeBatchSize: recipe?.batch_size || null,
        },
      }));
    }
  };

  const updateSchedule = (key, field, value) => {
    setSchedules((prev) => {
      const current = prev[key] || { ...defaultSchedule };
      const updated = { ...current, [field]: value };

      // Auto-recalculate QC date when batch_date changes (unless overridden)
      if (field === "batch_date" && !updated.qc_override) {
        const qcDays = updated._qcDays || 3;
        updated.fill_date = addDays(addDays(value, qcDays), 1);
      }

      return { ...prev, [key]: updated };
    });
  };

  const getQcDate = (key) => {
    const sched = schedules[key];
    if (!sched) return "";
    if (sched.qc_override && sched.qc_date_override) return sched.qc_date_override;
    return addDays(sched.batch_date, sched._qcDays || 3);
  };

  const handleSchedule = (item) => {
    const key = `${item.type}-${item.id}`;
    const sched = schedules[key];
    if (!sched) return;

    if (!sched.batch_date || !sched.operator) {
      toast.error("Batch date and operator are required");
      return;
    }

    const recipe = findRecipe(item.sku);
    const qcDate = getQcDate(key);

    const batchData = {
      batch_id: generateBatchId(item.sku),
      recipe_id: recipe?.id || "",
      sku: item.sku,
      product_name: item.product_name,
      quantity: Number(sched.batch_size) || item.quantity,
      production_line: Number(sched.production_line) || 1,
      operator: sched.operator,
      production_date: new Date(sched.batch_date).toISOString(),
      status: "pending",
      notes: [
        `QC hold date: ${qcDate}`,
        sched.qc_notes ? `QC notes: ${sched.qc_notes}` : "",
        `Fill date: ${sched.fill_date}`,
        sched.fill_operator ? `Fill operator: ${sched.fill_operator}` : "",
        sched.fill_line ? `Fill line: ${sched.fill_line}` : "",
      ].filter(Boolean).join(" | "),
    };

    if (item.type === "forecast") {
      scheduleForecastMutation.mutate({ item: item._raw, batchData });
    } else {
      scheduleManualMutation.mutate({ item: item._raw, batchData });
    }
  };

  // Batch size calculator — scale recipe ingredients to target units
  const getScaledIngredients = (item, targetUnits) => {
    const recipe = findRecipe(item.sku);
    if (!recipe || !targetUnits) return null;
    const batchSize = recipe.batch_size || 1;
    const multiplier = targetUnits / batchSize;
    return (recipe.ingredients || []).map((ing) => ({
      name: ing.material || ing.sku,
      unit: ing.unit || "",
      qty: Math.round((ing.qty || 0) * multiplier * 100) / 100,
    }));
  };

  const isScheduling = scheduleForecastMutation.isPending || scheduleManualMutation.isPending;

  const handleBqEdit = (item) => {
    setBqEditingId(item.id);
    setBqEditForm({
      product_name: item.product_name || "",
      sku: item.sku || "",
      quantity: String(item.quantity || ""),
      reason: item._raw?.reason || "",
      urgency: item.urgency || "ok",
    });
    setBqEditDialogOpen(true);
  };

  const handleBqSave = () => {
    if (!bqEditForm.product_name || !bqEditForm.sku || !bqEditForm.quantity) {
      toast.error("Product name, SKU, and quantity are required");
      return;
    }
    bqUpdateMutation.mutate({
      id: bqEditingId,
      data: {
        product_name: bqEditForm.product_name,
        sku: bqEditForm.sku,
        quantity_needed: Number(bqEditForm.quantity),
        reason: bqEditForm.reason,
        urgency: bqEditForm.urgency,
      },
    });
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </CardContent>
        </Card>
      ) : allItems.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 rounded-xl bg-zinc-800 mb-4">
                <Layers className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 text-sm">
                No approved batches in queue. Approve items from Material Check to begin scheduling.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        allItems.map((item) => {
          const key = `${item.type}-${item.id}`;
          const urg = urgencyConfig[item.urgency] || urgencyConfig.ok;
          const isExpanded = expandedId === key;
          const sched = schedules[key] || defaultSchedule;
          const recipe = findRecipe(item.sku);
          const qcDate = getQcDate(key);
          const calcKey = key;
          const calcUnits = calcTarget[calcKey] || "";
          const scaledIngredients = getScaledIngredients(item, Number(calcUnits));

          return (
            <Card key={key} className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                {/* Collapsed Header */}
                <div className="flex items-center p-4">
                  <button
                    onClick={() => toggleExpand(item)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-zinc-500">{item.sku}</span>
                      <Badge variant={urg.variant}>{urg.label}</Badge>
                      <Badge variant={item.type === "forecast" ? "blue" : "purple"}>
                        {item.source}
                      </Badge>
                    </div>
                    <span className="text-sm font-medium text-zinc-100 truncate">
                      {item.product_name}
                    </span>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {item.quantity?.toLocaleString()} units
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {item.type === "manual" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBqEdit(item)}
                          className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                          title="Edit request"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setBqDeleteConfirmId(item)}
                          className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          title="Delete request and batches"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    <button onClick={() => toggleExpand(item)}>
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-500 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded Scheduling Form */}
                {isExpanded && (
                  <div className="px-4 pb-5 space-y-5 border-t border-zinc-800">
                    {/* Recipe info banner */}
                    {recipe ? (
                      <div className="flex items-center gap-2 mt-4 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        Recipe: {recipe.name} — batch size {recipe.batch_size || "N/A"}
                        {recipe.batch_size && (
                          <span className="text-zinc-500 ml-1">
                            ({Math.ceil(item.quantity / recipe.batch_size)} batch{Math.ceil(item.quantity / recipe.batch_size) !== 1 ? "es" : ""} needed)
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-4 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        No recipe found for this SKU — enter batch size manually.
                      </div>
                    )}

                    {/* ── BATCHING SECTION ── */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Factory className="w-3.5 h-3.5" />
                        Batching
                      </h4>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Batch Date *</Label>
                          <Input
                            type="date"
                            value={sched.batch_date}
                            onChange={(e) => updateSchedule(key, "batch_date", e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Operator *</Label>
                          <Input
                            placeholder="Operator name"
                            value={sched.operator}
                            onChange={(e) => updateSchedule(key, "operator", e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Production Line</Label>
                          <Select
                            value={sched.production_line}
                            onValueChange={(val) => updateSchedule(key, "production_line", val)}
                          >
                            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Line 1</SelectItem>
                              <SelectItem value="2">Line 2</SelectItem>
                              <SelectItem value="3">Melter 1</SelectItem>
                              <SelectItem value="4">Melter 2</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">
                            Batch Size
                            {sched._recipeBatchSize && (
                              <span className="text-zinc-600 ml-1">
                                (recipe: {sched._recipeBatchSize})
                              </span>
                            )}
                          </Label>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 border-zinc-700 shrink-0"
                              onClick={() => updateSchedule(key, "batch_size", String(Math.max(1, (Number(sched.batch_size) || 0) - (sched._recipeBatchSize || 10))))}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <Input
                              type="number"
                              value={sched.batch_size}
                              onChange={(e) => updateSchedule(key, "batch_size", e.target.value)}
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm text-center"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 border-zinc-700 shrink-0"
                              onClick={() => updateSchedule(key, "batch_size", String((Number(sched.batch_size) || 0) + (sched._recipeBatchSize || 10)))}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          {sched._recipeBatchSize && sched.batch_size && (
                            <p className="text-xs text-zinc-600">
                              {sched.batch_size > 0 ? (
                                <>
                                  {((Number(sched.batch_size) / sched._recipeBatchSize) * 100).toFixed(0)}% of recipe
                                  {Number(sched.batch_size) !== sched._recipeBatchSize && (
                                    <span className={Number(sched.batch_size) > sched._recipeBatchSize ? " text-amber-500" : " text-zinc-500"}>
                                      {" "}({Number(sched.batch_size) > sched._recipeBatchSize ? "+" : ""}{((Number(sched.batch_size) - sched._recipeBatchSize) / sched._recipeBatchSize * 100).toFixed(0)}%)
                                    </span>
                                  )}
                                </>
                              ) : null}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── QC HOLD SECTION ── */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        QC Hold
                      </h4>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">
                            QC Date
                            <span className="text-zinc-600 ml-1">
                              (batch + {sched._qcDays || 3}d)
                            </span>
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={sched.qc_override ? sched.qc_date_override : qcDate}
                              disabled={!sched.qc_override}
                              onChange={(e) => updateSchedule(key, "qc_date_override", e.target.value)}
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm disabled:opacity-60"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const willOverride = !sched.qc_override;
                                updateSchedule(key, "qc_override", willOverride);
                                if (willOverride) {
                                  updateSchedule(key, "qc_date_override", qcDate);
                                }
                              }}
                              className={`text-xs shrink-0 ${sched.qc_override ? "text-orange-400" : "text-zinc-500"}`}
                            >
                              {sched.qc_override ? "Auto" : "Override"}
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5 lg:col-span-2">
                          <Label className="text-zinc-400 text-xs">QC Notes</Label>
                          <Input
                            placeholder="QC hold notes..."
                            value={sched.qc_notes}
                            onChange={(e) => updateSchedule(key, "qc_notes", e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── FILLING SECTION ── */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        Filling
                      </h4>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">
                            Fill Date
                            <span className="text-zinc-600 ml-1">(after QC)</span>
                          </Label>
                          <Input
                            type="date"
                            value={sched.fill_date}
                            min={qcDate}
                            onChange={(e) => updateSchedule(key, "fill_date", e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Fill Operator</Label>
                          <Input
                            placeholder="Operator name"
                            value={sched.fill_operator}
                            onChange={(e) => updateSchedule(key, "fill_operator", e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Fill Line</Label>
                          <Select
                            value={sched.fill_line}
                            onValueChange={(val) => updateSchedule(key, "fill_line", val)}
                          >
                            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Fill Line 1</SelectItem>
                              <SelectItem value="2">Fill Line 2</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Timeline summary */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 text-xs text-zinc-400">
                      <CalendarDays className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span>
                        Batch <span className="text-zinc-200">{formatDate(sched.batch_date)}</span>
                        <span className="text-zinc-600 mx-2">→</span>
                        QC Hold <span className="text-zinc-200">{formatDate(qcDate)}</span>
                        <span className="text-zinc-600 mx-2">→</span>
                        Fill <span className="text-zinc-200">{formatDate(sched.fill_date)}</span>
                      </span>
                    </div>

                    {/* ── BATCH SIZE CALCULATOR ── */}
                    {recipe && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Calculator className="w-3.5 h-3.5" />
                          Batch Size Calculator
                        </h4>
                        <div className="rounded-lg border border-zinc-800 p-3 space-y-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-zinc-400 text-xs shrink-0">Target units:</Label>
                            <Input
                              type="number"
                              placeholder={String(item.quantity)}
                              value={calcUnits}
                              onChange={(e) =>
                                setCalcTarget((prev) => ({ ...prev, [calcKey]: e.target.value }))
                              }
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm w-32"
                            />
                            {calcUnits && recipe.batch_size && (
                              <span className="text-xs text-zinc-500">
                                = {(Number(calcUnits) / recipe.batch_size).toFixed(1)} batches
                              </span>
                            )}
                          </div>
                          {scaledIngredients && scaledIngredients.length > 0 && (
                            <div className="rounded-lg border border-zinc-800 overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-zinc-800 hover:bg-transparent">
                                    <TableHead className="text-zinc-500 text-xs font-medium">Ingredient</TableHead>
                                    <TableHead className="text-zinc-500 text-xs font-medium text-right">Scaled Qty</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {scaledIngredients.map((ing, i) => (
                                    <TableRow key={i} className="border-zinc-800">
                                      <TableCell className="text-sm text-zinc-200 py-1.5">{ing.name}</TableCell>
                                      <TableCell className="text-sm text-zinc-300 text-right font-mono py-1.5">
                                        {ing.qty.toLocaleString()} {ing.unit}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Schedule button */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        onClick={() => handleSchedule(item)}
                        disabled={isScheduling}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {isScheduling ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <CalendarDays className="w-4 h-4 mr-2" />
                        )}
                        Schedule Batch
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(null)}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        Collapse
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Edit Dialog */}
      <Dialog open={bqEditDialogOpen} onOpenChange={(open) => { if (!open) { setBqEditDialogOpen(false); setBqEditForm(emptyForm); setBqEditingId(null); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Edit Production Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Product Name *</Label>
                <Input
                  placeholder="e.g. Lavender Body Lotion"
                  value={bqEditForm.product_name}
                  onChange={(e) => setBqEditForm({ ...bqEditForm, product_name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">SKU *</Label>
                <Input
                  placeholder="e.g. LBL-250ML"
                  value={bqEditForm.sku}
                  onChange={(e) => setBqEditForm({ ...bqEditForm, sku: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Quantity Needed *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={bqEditForm.quantity}
                  onChange={(e) => setBqEditForm({ ...bqEditForm, quantity: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Urgency</Label>
                <Select
                  value={bqEditForm.urgency}
                  onValueChange={(val) => setBqEditForm({ ...bqEditForm, urgency: val })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="soon">Soon</SelectItem>
                    <SelectItem value="ok">OK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Reason</Label>
              <Textarea
                placeholder="Why is this production needed?"
                value={bqEditForm.reason}
                onChange={(e) => setBqEditForm({ ...bqEditForm, reason: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBqEditDialogOpen(false); setBqEditForm(emptyForm); setBqEditingId(null); }} className="border-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleBqSave} disabled={bqUpdateMutation.isPending} className="bg-orange-500 hover:bg-orange-600 text-white">
              {bqUpdateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!bqDeleteConfirmId} onOpenChange={(open) => { if (!open) setBqDeleteConfirmId(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Request & Batches</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 py-2">
            This will delete the production request and any associated pending/draft batch entities. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBqDeleteConfirmId(null)} className="border-zinc-700">Cancel</Button>
            <Button
              onClick={() => bqDeleteMutation.mutate(bqDeleteConfirmId)}
              disabled={bqDeleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {bqDeleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import RecipeSheetsTab from "@/components/planning/RecipeSheetsTab";
import WipCopackTab from "@/components/planning/WipCopackTab";
import WipInHouseTab from "@/components/planning/WipInHouseTab";
import ScheduleTab from "@/components/planning/ScheduleTab";

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductionPlanning() {
  // Counts for tab badges
  const { data: suggestedItems = [] } = useQuery({
    queryKey: ["planning_forecast_suggestions"],
    queryFn: () => base44.entities.ForecastSuggestion.filter(
      { status: "suggested" },
      "-created_date"
    ),
  });

  const { data: manualPending = [] } = useQuery({
    queryKey: ["planning_production_requests"],
    queryFn: async () => {
      try {
        return await base44.entities.ProductionRequest.filter(
          { status: { $in: ["pending", "material_check"] } },
          "-created_date"
        );
      } catch {
        return [];
      }
    },
  });

  const { data: mcForecasts = [] } = useQuery({
    queryKey: ["planning_material_check_forecasts"],
    queryFn: () => base44.entities.ForecastSuggestion.filter(
      { status: "material_check" },
      "-created_date"
    ),
  });

  const { data: mcManual = [] } = useQuery({
    queryKey: ["planning_material_check_manual"],
    queryFn: async () => {
      try {
        return await base44.entities.ProductionRequest.filter(
          { status: "material_check" },
          "-created_date"
        );
      } catch {
        return [];
      }
    },
  });

  const { data: bqForecasts = [] } = useQuery({
    queryKey: ["planning_batch_queue_forecasts"],
    queryFn: () => base44.entities.ForecastSuggestion.filter(
      { status: "approved", production_type: "make" },
      "-created_date"
    ),
  });

  const { data: bqManual = [] } = useQuery({
    queryKey: ["planning_batch_queue_manual"],
    queryFn: async () => {
      try {
        return await base44.entities.ProductionRequest.filter(
          { status: "approved", production_type: "make" },
          "-created_date"
        );
      } catch {
        return [];
      }
    },
  });

  const requestCount = suggestedItems.length +
    manualPending.filter((i) => i.status === "pending").length;

  const materialCheckCount = mcForecasts.length + mcManual.length;

  const batchQueueCount = bqForecasts.length + bqManual.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Factory className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Production Planning</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              End-to-end production workflow — from request to finished goods
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList className="bg-zinc-800 flex-wrap h-auto gap-1 p-1">
          {/* Requests tab */}
          <TabsTrigger
            value="requests"
            className="flex items-center gap-2 data-[state=active]:bg-zinc-700"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Requests</span>
            {requestCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-orange-500/20 text-orange-400 font-medium min-w-[1.25rem] text-center">
                {requestCount}
              </span>
            )}
          </TabsTrigger>

          {/* Material Check tab */}
          <TabsTrigger
            value="material-check"
            className="flex items-center gap-2 data-[state=active]:bg-zinc-700"
          >
            <FlaskConical className="w-4 h-4" />
            <span className="hidden sm:inline">Material Check</span>
            {materialCheckCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-400 font-medium min-w-[1.25rem] text-center">
                {materialCheckCount}
              </span>
            )}
          </TabsTrigger>

          {/* Batch Queue tab */}
          <TabsTrigger
            value="batch-queue"
            className="flex items-center gap-2 data-[state=active]:bg-zinc-700"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Batch Queue</span>
            {batchQueueCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400 font-medium min-w-[1.25rem] text-center">
                {batchQueueCount}
              </span>
            )}
          </TabsTrigger>

          {/* Schedule tab */}
          <TabsTrigger
            value="schedule"
            className="flex items-center gap-2 data-[state=active]:bg-zinc-700"
          >
            <CalendarDays className="w-4 h-4" />
            <span className="hidden sm:inline">Schedule</span>
          </TabsTrigger>

          {/* WIP In-House tab */}
          <TabsTrigger
            value="wip-inhouse"
            className="flex items-center gap-2 data-[state=active]:bg-zinc-700"
          >
            <Hammer className="w-4 h-4" />
            <span className="hidden sm:inline">WIP In-House</span>
          </TabsTrigger>

          {/* WIP Co-pack tab */}
          <TabsTrigger
            value="wip-copack"
            className="flex items-center gap-2 data-[state=active]:bg-zinc-700"
          >
            <Truck className="w-4 h-4" />
            <span className="hidden sm:inline">WIP Co-pack</span>
          </TabsTrigger>

          {/* Recipe Sheets tab */}
          <TabsTrigger
            value="recipe-sheets"
            className="flex items-center gap-2 data-[state=active]:bg-zinc-700"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Recipe Sheets</span>
          </TabsTrigger>

          {/* Remaining placeholder tabs */}
          {placeholderTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 data-[state=active]:bg-zinc-700"
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Requests tab */}
        <TabsContent value="requests" className="space-y-4">
          <RequestsTab />
        </TabsContent>

        {/* Material Check tab */}
        <TabsContent value="material-check" className="space-y-4">
          <MaterialCheckTab />
        </TabsContent>

        {/* Batch Queue tab */}
        <TabsContent value="batch-queue" className="space-y-4">
          <BatchQueueTab />
        </TabsContent>

        {/* Schedule tab */}
        <TabsContent value="schedule" className="space-y-4">
          <ScheduleTab />
        </TabsContent>

        {/* WIP In-House tab */}
        <TabsContent value="wip-inhouse" className="space-y-4">
          <WipInHouseTab />
        </TabsContent>

        {/* WIP Co-pack tab */}
        <TabsContent value="wip-copack" className="space-y-4">
          <WipCopackTab />
        </TabsContent>

        {/* Recipe Sheets tab */}
        <TabsContent value="recipe-sheets" className="space-y-4">
          <RecipeSheetsTab />
        </TabsContent>

        {/* Placeholder tabs */}
        {placeholderTabs.map((tab) => {
          const Icon = tab.icon;
          const colors = colorMap[tab.color];
          return (
            <TabsContent key={tab.id} value={tab.id} className="space-y-4">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-8">
                  <div className="flex flex-col items-center text-center max-w-lg mx-auto py-8">
                    <div className={`p-4 rounded-2xl ${colors.iconBg} border ${colors.border} mb-6`}>
                      <Icon className={`w-10 h-10 ${colors.text}`} />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-100 mb-2">
                      {tab.label}
                    </h2>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border} mb-4`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></span>
                      Coming Soon
                    </div>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      {tab.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}