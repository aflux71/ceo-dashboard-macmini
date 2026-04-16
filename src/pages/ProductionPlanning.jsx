import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Factory, ClipboardList, FlaskConical, Layers, CalendarDays, Hammer, Truck,
  FileText, Plus, Minus, Search, ArrowRight, ArrowLeft, Package, Loader2,
  Check, X, ShoppingCart, AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, Calculator, Clock, BarChart3, Calendar, Eye, EyeOff, Timer,
  Send, Building2, MapPin, RotateCcw, ExternalLink, Pencil, Trash2, Copy, Beaker, Link2
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

const urgencyConfig = { critical: { variant: "red", label: "Critical" }, soon: { variant: "amber", label: "Soon" }, ok: { variant: "green", label: "OK" } };
const emptyForm = { product_name: "", sku: "", quantity: "", reason: "", urgency: "ok" };

// ─── Product Search Combobox ────────────────────────────────────────────────────

function ProductSearchCombobox({ form, setForm, recipes }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const seen = new Set();
    return recipes
      .filter((r) => r.sku && r.name && r.active !== false)
      .filter((r) => {
        const key = r.sku.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (r) => r.name?.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q)
    );
  }, [options, query]);

  const handleSelect = (recipe) => {
    setForm((f) => ({ ...f, product_name: recipe.name, sku: recipe.sku }));
    setQuery("");
    setOpen(false);
  };

  const handleQueryChange = (val) => {
    setQuery(val);
    setForm((f) => ({ ...f, product_name: val }));
    setOpen(true);
  };

  return (
    <div className="space-y-3" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Select from existing recipes or enter manually below</span>
      </div>
      {/* Search existing */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <Input
          placeholder="Search existing recipes by name or SKU..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setOpen(true)}
          className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100"
        />
        {open && query.trim() && (
          <div className="absolute z-50 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-zinc-500 text-center">
                No existing recipes match — fill in the fields below to add manually
              </div>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-700 transition-colors flex items-center gap-3"
                >
                  <span className="font-mono text-xs text-orange-400 shrink-0">{r.sku}</span>
                  <span className="text-sm text-zinc-200 truncate">{r.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {/* Manual fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs">Product Name *</Label>
          <Input
            placeholder="e.g. Lavender Body Lotion"
            value={form.product_name}
            onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
            className="bg-zinc-800 border-zinc-700 text-zinc-100"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs">SKU *</Label>
          <Input
            placeholder="e.g. LBL-250ML"
            value={form.sku}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            className="bg-zinc-800 border-zinc-700 text-zinc-100"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Requests Tab ──────────────────────────────────────────────────────────────

function RequestsTab() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null); // null = create mode, id = edit mode
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const { data: requestRecipes = [] } = useQuery({
    queryKey: ["planning_recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

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
            <ProductSearchCombobox form={form} setForm={setForm} recipes={requestRecipes} />
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
  const [linkRecipeDialog, setLinkRecipeDialog] = useState(null); // { sku, product_name }
  const [linkRecipeSearch, setLinkRecipeSearch] = useState("");
  const [linkSelectedRecipe, setLinkSelectedRecipe] = useState(null);
  const [linkingRecipe, setLinkingRecipe] = useState(false);
  const [locallyLinkedSkus, setLocallyLinkedSkus] = useState({}); // { sku: recipeName }

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

  const createCopackOrder = async (item) => {
    await base44.entities.CopackOrder.create({
      product_name: item.product_name,
      sku: item.sku,
      quantity: item.order_qty || item.forecast_qty || item.suggested_qty || item.quantity_needed || item.quantity || 0,
      co_packer_name: "",
      status: "draft",
      notes: `Auto-created from Production Planning approval`,
    });
  };

  const approveForecastMutation = useMutation({
    mutationFn: async ({ item, production_type }) => {
      const pr = await base44.entities.ProductionRequest.create({ sku: item.sku, product_name: item.product_name, quantity_needed: item.order_qty || item.forecast_qty || item.suggested_qty || 0, status: "approved", production_type, source: "forecast", urgency: item.urgency });
      await base44.entities.ForecastSuggestion.update(item.id, { status: "in_production" });
      if (production_type === "copacked") await createCopackOrder(item);
      return pr;
    },
    onSuccess: (_, { production_type }) => {
      ["planning_material_check_forecasts","planning_forecast_suggestions","planning_batch_queue_manual","planning_production_requests","planning_copack_orders"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(production_type === "copacked" ? "Approved — Co-pack order created in WIP Co-pack" : "Approved — moved to Batch Queue");
    },
    onError: (err) => toast.error(`Failed to approve: ${err?.response?.data?.message || err?.message || String(err)}`),
  });
  const approveManualMutation = useMutation({
    mutationFn: async ({ id, production_type, item }) => {
      await base44.entities.ProductionRequest.update(id, { status: "approved", production_type });
      if (production_type === "copacked") await createCopackOrder(item._raw || item);
    },
    onSuccess: (_, { production_type }) => {
      ["planning_material_check_manual","planning_batch_queue_manual","planning_copack_orders"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(production_type === "copacked" ? "Approved — Co-pack order created in WIP Co-pack" : "Approved — moved to Batch Queue");
    },
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
      approveForecastMutation.mutate({ item: item._raw, production_type: productionType });
    } else {
      approveManualMutation.mutate({ id: item.id, production_type: productionType, item });
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

  const filteredLinkRecipes = useMemo(() => {
    if (!linkRecipeSearch.trim()) return recipes;
    const q = linkRecipeSearch.toLowerCase();
    return recipes.filter(r => r.sku?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q));
  }, [recipes, linkRecipeSearch]);

  const handleLinkRecipe = async () => {
    if (!linkSelectedRecipe || !linkRecipeDialog) return;
    setLinkingRecipe(true);
    try {
      // Update the recipe SKU to match the item's SKU (remap recipe to this SKU)
      await base44.entities.Recipe.update(linkSelectedRecipe.id, { sku: linkRecipeDialog.sku });
      toast.success(`Recipe "${linkSelectedRecipe.name}" linked to SKU ${linkRecipeDialog.sku}`);
      setLocallyLinkedSkus(prev => ({ ...prev, [linkRecipeDialog.sku]: linkSelectedRecipe.name }));
      queryClient.invalidateQueries({ queryKey: ["planning_recipes"] });
      setLinkRecipeDialog(null);
      setLinkRecipeSearch("");
      setLinkSelectedRecipe(null);
    } catch (err) {
      toast.error(`Failed to link recipe: ${err?.message || String(err)}`);
    }
    setLinkingRecipe(false);
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

                  {/* Recipe linked confirmation */}
                  {locallyLinkedSkus[item.sku] && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Recipe linked: <span className="font-medium">{locallyLinkedSkus[item.sku]}</span>
                    </div>
                  )}

                  {/* No recipe warning */}
                  {!hasRecipe && !materialResult && !locallyLinkedSkus[item.sku] && (
                    <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        No recipe found for SKU "{item.sku}". Link an existing recipe or create one first.
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => { setLinkRecipeDialog({ sku: item.sku, product_name: item.product_name }); setLinkRecipeSearch(""); setLinkSelectedRecipe(null); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          Link Recipe
                        </button>
                        <a
                          href="/Recipes"
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors"
                        >
                          <Beaker className="w-3.5 h-3.5" />
                          Create
                        </a>
                      </div>
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

      {/* Link Recipe Dialog */}
      <Dialog open={!!linkRecipeDialog} onOpenChange={(open) => { if (!open) { setLinkRecipeDialog(null); setLinkRecipeSearch(""); setLinkSelectedRecipe(null); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-400" />
              Link Recipe to SKU
            </DialogTitle>
          </DialogHeader>
          {linkRecipeDialog && (
            <div className="space-y-4 py-1">
              <div className="p-3 bg-zinc-800 rounded-lg text-sm space-y-1">
                <p><span className="text-zinc-500">SKU:</span> <span className="font-mono text-orange-400">{linkRecipeDialog.sku}</span></p>
                <p><span className="text-zinc-500">Product:</span> <span className="text-zinc-300">{linkRecipeDialog.product_name}</span></p>
                <p className="text-xs text-zinc-500 mt-1">Select a recipe to link to this SKU. The recipe's SKU will be updated to match.</p>
              </div>
              <Input
                placeholder="Search by recipe name or SKU..."
                value={linkRecipeSearch}
                onChange={(e) => setLinkRecipeSearch(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                autoFocus
              />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filteredLinkRecipes.length === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-4">No recipes found</p>
                )}
                {filteredLinkRecipes.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setLinkSelectedRecipe(r)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      linkSelectedRecipe?.id === r.id
                        ? "bg-blue-500/20 border border-blue-500/40 text-blue-300"
                        : "hover:bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    <span className="font-mono text-xs text-orange-400 mr-2">{r.sku}</span>
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkRecipeDialog(null); setLinkRecipeSearch(""); setLinkSelectedRecipe(null); }} className="border-zinc-700">Cancel</Button>
            <Button
              onClick={handleLinkRecipe}
              disabled={!linkSelectedRecipe || linkingRecipe}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {linkingRecipe ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              Link Recipe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import BatchQueueTab from "@/components/planning/BatchQueueTab";
import RecipeSheetsTab from "@/components/planning/RecipeSheetsTab";
import WipCopackTab from "@/components/planning/WipCopackTab";
import WipInHouseTab from "@/components/planning/WipInHouseTab";
import ScheduleTab from "@/components/planning/ScheduleTab";
import PlanningAssistant from "@/components/ai/PlanningAssistant";

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
      {/* AI Planning Assistant */}
      <PlanningAssistant
        forecastSuggestions={[...suggestedItems, ...mcForecasts]}
      />

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