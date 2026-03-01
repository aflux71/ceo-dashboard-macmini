import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Factory,
  ClipboardList,
  FlaskConical,
  Layers,
  CalendarDays,
  Hammer,
  Truck,
  FileText,
  Plus,
  Minus,
  Search,
  ArrowRight,
  ArrowLeft,
  Package,
  Loader2,
  Check,
  X,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Clock,
  BarChart3,
  Calendar,
  Eye,
  EyeOff,
  Timer,
  Send,
  Building2,
  MapPin,
  RotateCcw,
  ExternalLink,
  Printer,
  CheckSquare,
  Square,
  Pencil,
  Trash2
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

const colorMap = {
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-400", iconBg: "bg-orange-500/15", dot: "bg-orange-500" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400", iconBg: "bg-purple-500/15", dot: "bg-purple-500" },
  blue:   { bg: "bg-blue-500/10",   border: "border-blue-500/20",   text: "text-blue-400",   iconBg: "bg-blue-500/15",   dot: "bg-blue-500" },
  green:  { bg: "bg-green-500/10",  border: "border-green-500/20",  text: "text-green-400",  iconBg: "bg-green-500/15",  dot: "bg-green-500" },
  amber:  { bg: "bg-amber-500/10",  border: "border-amber-500/20",  text: "text-amber-400",  iconBg: "bg-amber-500/15",  dot: "bg-amber-500" },
  cyan:   { bg: "bg-cyan-500/10",   border: "border-cyan-500/20",   text: "text-cyan-400",   iconBg: "bg-cyan-500/15",   dot: "bg-cyan-500" },
  red:    { bg: "bg-red-500/10",    border: "border-red-500/20",    text: "text-red-400",    iconBg: "bg-red-500/15",    dot: "bg-red-500" },
};

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
    mutationFn: async (data) => {
      console.log("Creating ProductionRequest with:", data);
      const result = await base44.entities.ProductionRequest.create(data);
      console.log("ProductionRequest created:", result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] });
      toast.success("Request created");
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err) => {
      console.error("ProductionRequest create failed:", err);
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to create request: ${msg}`);
    },
  });

  const sendForecastMutation = useMutation({
    mutationFn: (item) =>
      base44.entities.ForecastSuggestion.update(item.id, { status: "material_check" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_forecast_suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["planning_material_check_forecasts"] });
      toast.success("Sent to Material Check");
    },
    onError: () => toast.error("Failed to send to Material Check"),
  });

  const sendManualMutation = useMutation({
    mutationFn: (item) =>
      base44.entities.ProductionRequest.update(item.id, { status: "material_check" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] });
      queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] });
      toast.success("Sent to Material Check");
    },
    onError: () => toast.error("Failed to send to Material Check"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] });
      toast.success("Request updated");
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to update: ${msg}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, type }) => type === "forecast" ? base44.entities.ForecastSuggestion.delete(id) : base44.entities.ProductionRequest.delete(id),
    onSuccess: (_, { type }) => {
      if (type === "forecast") queryClient.invalidateQueries({ queryKey: ["planning_forecast_suggestions"] });
      else queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] });
      toast.success("Request deleted");
      setDeleteConfirmId(null);
    },
    onError: (err) => { toast.error(`Failed to delete: ${err?.message || String(err)}`); },
  });

  const allItems = useMemo(() => {
    // Debug: log raw entity fields to identify correct quantity field names
    if (forecastItems.length > 0) {
      console.log("[RequestsTab] Raw ForecastSuggestion sample:", JSON.stringify(forecastItems[0], null, 2));
      console.log("[RequestsTab] ForecastSuggestion qty fields:", {
        order_qty: forecastItems[0].order_qty,
        forecast_qty: forecastItems[0].forecast_qty,
        suggested_qty: forecastItems[0].suggested_qty,
        quantity: forecastItems[0].quantity,
        quantity_needed: forecastItems[0].quantity_needed,
      });
    }
    if (manualItems.length > 0) {
      console.log("[RequestsTab] Raw ProductionRequest sample:", JSON.stringify(manualItems[0], null, 2));
      console.log("[RequestsTab] ProductionRequest qty fields:", {
        quantity: manualItems[0].quantity,
        quantity_needed: manualItems[0].quantity_needed,
        order_qty: manualItems[0].order_qty,
      });
    }

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
              onClick={() => deleteMutation.mutate(deleteConfirmId)}
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

  // Approve mutations
  const approveForecastMutation = useMutation({
    mutationFn: async ({ item, production_type }) => {
      console.log("Approving forecast item — creating ProductionRequest:", { item, production_type });
      // Create a new ProductionRequest from the forecast item
      const pr = await base44.entities.ProductionRequest.create({
        sku: item.sku,
        product_name: item.product_name,
        quantity_needed: item.order_qty || item.forecast_qty || item.suggested_qty || 0,
        status: "approved",
        production_type,
        source: "forecast",
        urgency: item.urgency,
      });
      console.log("ProductionRequest created:", pr);
      // Mark the ForecastSuggestion as in_production so it leaves Requests
      await base44.entities.ForecastSuggestion.update(item.id, {
        status: "in_production",
      });
      return pr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_material_check_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["planning_forecast_suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] });
      queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] });
      toast.success("Approved — moved to Batch Queue");
    },
    onError: (err) => {
      console.error("Approve forecast failed:", err);
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to approve: ${msg}`);
    },
  });

  const approveManualMutation = useMutation({
    mutationFn: ({ id, production_type }) =>
      base44.entities.ProductionRequest.update(id, {
        status: "approved",
        production_type,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] });
      queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] });
      toast.success("Approved — moved to Batch Queue");
    },
    onError: (err) => {
      console.error("Approve manual failed:", err);
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to approve: ${msg}`);
    },
  });

  // Return to requests mutations
  const returnForecastMutation = useMutation({
    mutationFn: (id) =>
      base44.entities.ForecastSuggestion.update(id, { status: "suggested" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_material_check_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["planning_forecast_suggestions"] });
      toast.success("Returned to Requests");
    },
    onError: () => toast.error("Failed to return"),
  });

  const returnManualMutation = useMutation({
    mutationFn: (id) =>
      base44.entities.ProductionRequest.update(id, { status: "pending" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] });
      queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] });
      toast.success("Returned to Requests");
    },
    onError: () => toast.error("Failed to return"),
  });

  const mcUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] });
      toast.success("Request updated");
      setMcEditDialogOpen(false);
      setMcEditForm(emptyForm);
      setMcEditingId(null);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to update: ${msg}`);
    },
  });

  const mcDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductionRequest.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_material_check_manual"] });
      queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] });
      toast.success("Request deleted");
      setMcDeleteConfirmId(null);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to delete: ${msg}`);
    },
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

  // Create Batch + update source status
  const scheduleForecastMutation = useMutation({
    mutationFn: async ({ item, batchData }) => {
      const batch = await base44.entities.Batch.create(batchData);
      await base44.entities.ForecastSuggestion.update(item.id, {
        status: "in_production",
        scheduled_batch_id: batch.id,
      });
      return batch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["planning_batches"] });
      toast.success("Batch scheduled — moved to production");
    },
    onError: () => toast.error("Failed to schedule batch"),
  });

  const scheduleManualMutation = useMutation({
    mutationFn: async ({ item, batchData }) => {
      const batch = await base44.entities.Batch.create(batchData);
      await base44.entities.ProductionRequest.update(item.id, {
        status: "in_production",
        batch_id: batch.id,
      });
      return batch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] });
      queryClient.invalidateQueries({ queryKey: ["planning_batches"] });
      toast.success("Batch scheduled — moved to production");
    },
    onError: () => toast.error("Failed to schedule batch"),
  });

  const bqUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] });
      toast.success("Request updated");
      setBqEditDialogOpen(false);
      setBqEditForm(emptyForm);
      setBqEditingId(null);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to update: ${msg}`);
    },
  });

  const bqDeleteMutation = useMutation({
    mutationFn: async (item) => {
      // Delete associated Batch entities first
      const relatedBatches = batches.filter(
        (b) => b.sku === item.sku && b.product_name === item.product_name && ["pending", "draft"].includes(b.status)
      );
      await Promise.all(
        relatedBatches.map((b) => base44.entities.Batch.delete(b.id).catch(() => {}))
      );
      // Then delete the ProductionRequest
      await base44.entities.ProductionRequest.delete(item.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] });
      queryClient.invalidateQueries({ queryKey: ["planning_batches"] });
      queryClient.invalidateQueries({ queryKey: ["planning_production_requests"] });
      toast.success("Request and associated batches deleted");
      setBqDeleteConfirmId(null);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to delete: ${msg}`);
    },
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

// ─── Schedule Tab ──────────────────────────────────────────────────────────────

const STAGE_CONFIG = {
  batching:  { label: "Batching",  bg: "bg-blue-500/20",  border: "border-blue-500/30",  text: "text-blue-400",  dot: "bg-blue-500",  fill: "bg-blue-500" },
  qc_hold:   { label: "QC Hold",   bg: "bg-amber-500/20", border: "border-amber-500/30", text: "text-amber-400", dot: "bg-amber-500", fill: "bg-amber-500" },
  filling:   { label: "Filling",   bg: "bg-green-500/20", border: "border-green-500/30", text: "text-green-400", dot: "bg-green-500", fill: "bg-green-500" },
  complete:  { label: "Complete",  bg: "bg-zinc-700/40",  border: "border-zinc-600/30",  text: "text-zinc-400",  dot: "bg-zinc-500",  fill: "bg-zinc-500" },
};

function batchStage(batch) {
  const s = batch.status;
  if (s === "added_to_inventory") return "complete";
  if (s === "approved") return "filling";
  if (s === "pending_qc" || s === "on_hold") return "qc_hold";
  return "batching";
}

function parseBatchDates(batch) {
  const batchDate = batch.production_date
    ? batch.production_date.split("T")[0]
    : null;
  let qcDate = null;
  let fillDate = null;
  const notes = batch.notes || "";
  const qcMatch = notes.match(/QC hold date:\s*(\d{4}-\d{2}-\d{2})/);
  if (qcMatch) qcDate = qcMatch[1];
  const fillMatch = notes.match(/Fill date:\s*(\d{4}-\d{2}-\d{2})/);
  if (fillMatch) fillDate = fillMatch[1];
  // Fallback: if no dates in notes, estimate from batch_date
  if (batchDate && !qcDate) qcDate = addDays(batchDate, 3);
  if (qcDate && !fillDate) fillDate = addDays(qcDate, 1);
  return { batchDate, qcDate, fillDate };
}

function parseBatchLine(batch) {
  const line = batch.production_line;
  if (line === 1) return "Line 1";
  if (line === 2) return "Line 2";
  if (line === 3) return "Melter 1";
  if (line === 4) return "Melter 2";
  return `Line ${line || "?"}`;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().split("T")[0];
}

function generateDays(startDate, count) {
  const days = [];
  for (let i = 0; i < count; i++) {
    days.push(addDays(startDate, i));
  }
  return days;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScheduleTab() {
  const queryClient = useQueryClient();
  const [view, setView] = useState("calendar");
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date().toISOString().split("T")[0]));
  const [filter, setFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState("all");
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [schedDeleteConfirm, setSchedDeleteConfirm] = useState(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["planning_schedule_batches"],
    queryFn: () => base44.entities.Batch.list("-created_date", 500),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["planning_schedule_batches"] });
    queryClient.invalidateQueries({ queryKey: ["planning_batches"] });
    queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] });
    queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_forecasts"] });
    queryClient.invalidateQueries({ queryKey: ["planning_wip_inhouse_batches"] });
  };

  const advanceStageMutation = useMutation({
    mutationFn: ({ id, newStatus }) =>
      base44.entities.Batch.update(id, { status: newStatus }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Stage updated");
      setSelectedBatch(null);
    },
    onError: (err) => {
      const msg = err?.message || String(err);
      toast.error(`Failed to update stage: ${msg}`);
    },
  });

  const returnToQueueMutation = useMutation({
    mutationFn: async (batch) => {
      // Delete the Batch entity
      await base44.entities.Batch.delete(batch.id);
      // Try to find and revert the associated ProductionRequest back to approved
      try {
        const prs = await base44.entities.ProductionRequest.filter({
          sku: batch.sku,
          status: "in_production",
        });
        if (prs.length > 0) {
          await base44.entities.ProductionRequest.update(prs[0].id, { status: "approved" });
        }
      } catch {}
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Returned to Batch Queue");
      setSelectedBatch(null);
    },
    onError: (err) => {
      const msg = err?.message || String(err);
      toast.error(`Failed to return: ${msg}`);
    },
  });

  const deleteScheduledMutation = useMutation({
    mutationFn: async (batch) => {
      // Delete the Batch entity
      await base44.entities.Batch.delete(batch.id);
      // Try to revert the associated ProductionRequest back to approved
      try {
        const prs = await base44.entities.ProductionRequest.filter({
          sku: batch.sku,
          status: "in_production",
        });
        if (prs.length > 0) {
          await base44.entities.ProductionRequest.update(prs[0].id, { status: "approved" });
        }
      } catch {}
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Batch deleted — request returned to queue");
      setSchedDeleteConfirm(null);
      setSelectedBatch(null);
    },
    onError: (err) => {
      const msg = err?.message || String(err);
      toast.error(`Failed to delete: ${msg}`);
    },
  });

  // Enrich batches with parsed dates and stage
  const enriched = useMemo(() =>
    batches
      .filter((b) => b.status && b.status !== "added_to_inventory" || filter === "all")
      .map((b) => ({
        ...b,
        stage: batchStage(b),
        dates: parseBatchDates(b),
        lineLabel: parseBatchLine(b),
      })),
    [batches, filter]
  );

  // Apply filters
  const filtered = useMemo(() => {
    let items = enriched;

    if (filter === "this_week") {
      const wStart = getMonday(new Date().toISOString().split("T")[0]);
      const wEnd = addDays(wStart, 7);
      items = items.filter((b) => {
        const d = b.dates.batchDate;
        return d && d >= wStart && d < wEnd;
      });
    } else if (filter === "next_week") {
      const wStart = addDays(getMonday(new Date().toISOString().split("T")[0]), 7);
      const wEnd = addDays(wStart, 7);
      items = items.filter((b) => {
        const d = b.dates.batchDate;
        return d && d >= wStart && d < wEnd;
      });
    }

    if (lineFilter !== "all") {
      items = items.filter((b) => String(b.production_line) === lineFilter);
    }

    return items;
  }, [enriched, filter, lineFilter]);

  const weekDays = useMemo(() => generateDays(weekStart, 7), [weekStart]);
  const ganttDays = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return generateDays(today, 30);
  }, []);

  // For calendar: group batches by date, then by stage
  const batchesByDate = useMemo(() => {
    const map = {};
    filtered.forEach((b) => {
      const { batchDate, qcDate, fillDate } = b.dates;
      // Place batch block on its batch_date
      if (batchDate) {
        if (!map[batchDate]) map[batchDate] = [];
        map[batchDate].push({ ...b, displayStage: "batching" });
      }
      // Place QC block on qc_date
      if (qcDate && qcDate !== batchDate) {
        if (!map[qcDate]) map[qcDate] = [];
        map[qcDate].push({ ...b, displayStage: "qc_hold" });
      }
      // Place fill block on fill_date
      if (fillDate && fillDate !== qcDate) {
        if (!map[fillDate]) map[fillDate] = [];
        map[fillDate].push({ ...b, displayStage: "filling" });
      }
    });
    return map;
  }, [filtered]);

  const nextStage = (batch) => {
    const stage = batchStage(batch);
    if (stage === "batching") return { label: "Move to QC Hold", status: "pending_qc" };
    if (stage === "qc_hold") return { label: "Move to Filling", status: "approved" };
    if (stage === "filling") return { label: "Mark Complete", status: "added_to_inventory" };
    return null;
  };

  const today = new Date().toISOString().split("T")[0];

  const filterButtons = [
    { key: "all", label: "All" },
    { key: "this_week", label: "This Week" },
    { key: "next_week", label: "Next Week" },
  ];

  const lineOptions = [
    { key: "all", label: "All Lines" },
    { key: "1", label: "Line 1" },
    { key: "2", label: "Line 2" },
    { key: "3", label: "Melter 1" },
    { key: "4", label: "Melter 2" },
  ];

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${cfg.fill}`}></span>
            <span className="text-zinc-400">{cfg.label}</span>
          </span>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === btn.key
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {btn.label}
            </button>
          ))}
          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lineOptions.map((o) => (
                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {view === "calendar" && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-zinc-400"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-zinc-400 w-40 text-center">
                {formatDate(weekStart)} — {formatDate(addDays(weekStart, 6))}
              </span>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-zinc-400"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === "calendar" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Calendar
            </button>
            <button
              onClick={() => setView("gantt")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === "gantt" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Gantt
            </button>
          </div>
        </div>
      </div>

      {/* Views */}
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
                <CalendarDays className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 text-sm">
                No scheduled batches. Schedule batches from the Batch Queue tab.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : view === "calendar" ? (
        /* ── CALENDAR VIEW ── */
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="grid grid-cols-7 divide-x divide-zinc-800">
              {weekDays.map((day, di) => {
                const isToday = day === today;
                const dayBatches = batchesByDate[day] || [];
                return (
                  <div key={day} className="min-h-[160px]">
                    <div className={`px-2 py-2 text-center border-b border-zinc-800 ${isToday ? "bg-green-500/10" : ""}`}>
                      <div className={`text-xs font-medium ${isToday ? "text-green-400" : "text-zinc-500"}`}>
                        {DAY_NAMES[di]}
                      </div>
                      <div className={`text-sm font-semibold ${isToday ? "text-green-400" : "text-zinc-300"}`}>
                        {new Date(day + "T00:00:00").getDate()}
                      </div>
                    </div>
                    <div className="p-1 space-y-1">
                      {dayBatches.map((b, bi) => {
                        const cfg = STAGE_CONFIG[b.displayStage] || STAGE_CONFIG.batching;
                        return (
                          <button
                            key={`${b.id}-${b.displayStage}-${bi}`}
                            onClick={() => setSelectedBatch(b)}
                            className={`w-full text-left px-1.5 py-1 rounded text-xs ${cfg.bg} ${cfg.border} border ${cfg.text} hover:brightness-125 transition-all truncate`}
                          >
                            <div className="font-medium truncate">{b.batch_id || b.product_name}</div>
                            <div className="truncate opacity-75">{cfg.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ── GANTT VIEW ── */
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Date headers */}
              <div className="flex border-b border-zinc-800">
                <div className="w-48 shrink-0 px-3 py-2 text-xs text-zinc-500 font-medium border-r border-zinc-800">
                  Batch
                </div>
                <div className="flex flex-1">
                  {ganttDays.map((day) => {
                    const isToday = day === today;
                    const d = new Date(day + "T00:00:00");
                    return (
                      <div
                        key={day}
                        className={`flex-1 min-w-[24px] px-0.5 py-2 text-center border-r border-zinc-800/50 ${
                          isToday ? "bg-green-500/5" : ""
                        }`}
                      >
                        <div className={`text-[9px] ${isToday ? "text-green-400" : "text-zinc-600"}`}>
                          {d.getDate() === 1 || day === ganttDays[0]
                            ? d.toLocaleString("en", { month: "short" })
                            : ""}
                        </div>
                        <div className={`text-[10px] font-medium ${isToday ? "text-green-400" : "text-zinc-500"}`}>
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Batch rows */}
              {filtered.map((b) => {
                const { batchDate, qcDate, fillDate } = b.dates;
                const ganttStart = ganttDays[0];
                const ganttEnd = ganttDays[ganttDays.length - 1];
                const totalDays = ganttDays.length;

                const dayIndex = (d) => {
                  if (!d) return -1;
                  const diff = (new Date(d) - new Date(ganttStart)) / 86400000;
                  return Math.round(diff);
                };

                const batchIdx = dayIndex(batchDate);
                const qcIdx = dayIndex(qcDate);
                const fillIdx = dayIndex(fillDate);

                return (
                  <div key={b.id} className="flex border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <button
                      onClick={() => setSelectedBatch(b)}
                      className="w-48 shrink-0 px-3 py-2 text-left border-r border-zinc-800 hover:bg-zinc-800/50"
                    >
                      <div className="text-xs font-medium text-zinc-200 truncate">{b.product_name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{b.batch_id || b.sku}</div>
                    </button>
                    <div className="flex flex-1 relative items-center py-1">
                      {/* Batching segment (batch_date → qc_date) */}
                      {batchIdx >= 0 && batchIdx < totalDays && qcIdx > batchIdx && (
                        <div
                          className="absolute h-5 rounded-l bg-blue-500/60 border border-blue-500/30"
                          style={{
                            left: `${(batchIdx / totalDays) * 100}%`,
                            width: `${(Math.min(qcIdx, totalDays) - batchIdx) / totalDays * 100}%`,
                          }}
                          title={`Batching: ${batchDate} → ${qcDate}`}
                        />
                      )}
                      {/* QC segment (qc_date → fill_date) */}
                      {qcIdx >= 0 && qcIdx < totalDays && fillIdx > qcIdx && (
                        <div
                          className="absolute h-5 bg-amber-500/60 border-y border-amber-500/30"
                          style={{
                            left: `${(qcIdx / totalDays) * 100}%`,
                            width: `${(Math.min(fillIdx, totalDays) - qcIdx) / totalDays * 100}%`,
                          }}
                          title={`QC Hold: ${qcDate} → ${fillDate}`}
                        />
                      )}
                      {/* Fill marker */}
                      {fillIdx >= 0 && fillIdx < totalDays && (
                        <div
                          className="absolute h-5 rounded-r bg-green-500/60 border border-green-500/30"
                          style={{
                            left: `${(fillIdx / totalDays) * 100}%`,
                            width: `${Math.max(1 / totalDays * 100, 3)}%`,
                          }}
                          title={`Fill: ${fillDate}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Detail Dialog */}
      <Dialog open={!!selectedBatch} onOpenChange={(open) => !open && setSelectedBatch(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          {selectedBatch && (() => {
            const b = selectedBatch;
            const stage = batchStage(b);
            const cfg = STAGE_CONFIG[stage];
            const { batchDate, qcDate, fillDate } = parseBatchDates(b);
            const next = nextStage(b);

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {b.batch_id || b.product_name}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                      {cfg.label}
                    </span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-zinc-500 text-xs">Product</span>
                      <p className="text-zinc-200">{b.product_name}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">SKU</span>
                      <p className="text-zinc-200 font-mono">{b.sku}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Quantity</span>
                      <p className="text-zinc-200">{b.quantity?.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Line</span>
                      <p className="text-zinc-200">{parseBatchLine(b)}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Operator</span>
                      <p className="text-zinc-200">{b.operator || "—"}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Status</span>
                      <p className="text-zinc-200">{b.status}</p>
                    </div>
                  </div>

                  {/* Dates timeline */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/50 text-xs text-zinc-400">
                    <CalendarDays className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span>
                      <span className="text-blue-400">Batch</span> {formatDate(batchDate)}
                      <span className="text-zinc-600 mx-1.5">→</span>
                      <span className="text-amber-400">QC</span> {formatDate(qcDate)}
                      <span className="text-zinc-600 mx-1.5">→</span>
                      <span className="text-green-400">Fill</span> {formatDate(fillDate)}
                    </span>
                  </div>
                </div>
                <DialogFooter className="flex-wrap gap-2">
                  <div className="flex items-center gap-2 mr-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => returnToQueueMutation.mutate(b)}
                      disabled={returnToQueueMutation.isPending || deleteScheduledMutation.isPending}
                      className="border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
                    >
                      {returnToQueueMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <ArrowLeft className="w-4 h-4 mr-1.5" />
                      )}
                      Return to Queue
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSchedDeleteConfirm(b)}
                      disabled={returnToQueueMutation.isPending || deleteScheduledMutation.isPending}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                  {next && (
                    <Button
                      onClick={() => advanceStageMutation.mutate({ id: b.id, newStatus: next.status })}
                      disabled={advanceStageMutation.isPending}
                      className={
                        next.status === "pending_qc"
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : next.status === "approved"
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : "bg-zinc-600 hover:bg-zinc-700 text-white"
                      }
                    >
                      {advanceStageMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4 mr-2" />
                      )}
                      {next.label}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedBatch(null)} className="border-zinc-700">
                    Close
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Scheduled Batch Confirmation */}
      <Dialog open={!!schedDeleteConfirm} onOpenChange={(open) => { if (!open) setSchedDeleteConfirm(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Scheduled Batch</DialogTitle>
          </DialogHeader>
          {schedDeleteConfirm && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-zinc-400">
                Delete batch <span className="text-zinc-200 font-mono">{schedDeleteConfirm.batch_id}</span> for{" "}
                <span className="text-zinc-200">{schedDeleteConfirm.product_name}</span>?
              </p>
              <p className="text-xs text-zinc-500">
                The batch will be removed from the schedule and the associated production request will be returned to the Batch Queue.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedDeleteConfirm(null)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={() => deleteScheduledMutation.mutate(schedDeleteConfirm)}
              disabled={deleteScheduledMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteScheduledMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── WIP In-House Tab ──────────────────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { key: "batching", label: "Batching", cfg: STAGE_CONFIG.batching },
  { key: "qc_hold",  label: "QC Hold",  cfg: STAGE_CONFIG.qc_hold },
  { key: "filling",  label: "Filling",  cfg: STAGE_CONFIG.filling },
  { key: "complete", label: "Complete", cfg: STAGE_CONFIG.complete },
];

function WipInHouseTab() {
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [yieldDialog, setYieldDialog] = useState(null); // batch being completed
  const [yieldUnits, setYieldUnits] = useState("");

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["planning_wip_inhouse_batches"],
    queryFn: () => base44.entities.Batch.list("-created_date", 500),
  });

  // Filter to in-house batches (production_type = make or null/undefined)
  const inHouseBatches = useMemo(() =>
    batches.filter((b) => {
      const pt = b.production_type;
      return !pt || pt === "make";
    }),
    [batches]
  );

  const enriched = useMemo(() =>
    inHouseBatches.map((b) => ({
      ...b,
      stage: batchStage(b),
      dates: parseBatchDates(b),
      lineLabel: parseBatchLine(b),
    })),
    [inHouseBatches]
  );

  const today = new Date().toISOString().split("T")[0];
  const thisWeekEnd = addDays(getMonday(today), 7);

  // Stats
  const stats = useMemo(() => {
    const active = enriched.filter((b) => b.stage !== "complete");
    const overdue = active.filter(
      (b) => b.stage === "batching" && b.dates.batchDate && b.dates.batchDate < today
    );
    const completingThisWeek = enriched.filter((b) => {
      const fd = b.dates.fillDate;
      return fd && fd >= today && fd < thisWeekEnd && b.stage !== "complete";
    });
    return {
      inProgress: active.length,
      overdue: overdue.length,
      completingThisWeek: completingThisWeek.length,
    };
  }, [enriched, today, thisWeekEnd]);

  // Group by column
  const columns = useMemo(() => {
    const map = { batching: [], qc_hold: [], filling: [], complete: [] };
    enriched.forEach((b) => {
      if (b.stage === "complete") {
        // Only show completed if toggled, and only within last 24h
        if (showCompleted) {
          const updatedAt = b.updated_date || b.created_date;
          if (updatedAt) {
            const hoursSince = (Date.now() - new Date(updatedAt).getTime()) / 3600000;
            if (hoursSince <= 24) {
              map.complete.push(b);
            }
          }
        }
      } else {
        map[b.stage]?.push(b);
      }
    });
    return map;
  }, [enriched, showCompleted]);

  // Stage advancement
  const advanceMutation = useMutation({
    mutationFn: ({ id, newStatus, extraFields }) =>
      base44.entities.Batch.update(id, { status: newStatus, ...extraFields }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_wip_inhouse_batches"] });
      queryClient.invalidateQueries({ queryKey: ["planning_schedule_batches"] });
      queryClient.invalidateQueries({ queryKey: ["planning_batches"] });
      toast.success("Stage updated");
    },
    onError: (err) => {
      const msg = err?.message || String(err);
      toast.error(`Failed to update: ${msg}`);
    },
  });

  const handleAdvance = (batch) => {
    const stage = batchStage(batch);
    if (stage === "batching") {
      advanceMutation.mutate({ id: batch.id, newStatus: "pending_qc", extraFields: {} });
    } else if (stage === "qc_hold") {
      advanceMutation.mutate({ id: batch.id, newStatus: "approved", extraFields: {} });
    } else if (stage === "filling") {
      // Open yield dialog instead of immediate advance
      setYieldDialog(batch);
      setYieldUnits(String(batch.quantity || ""));
    }
  };

  const handleComplete = () => {
    if (!yieldDialog) return;
    const actualYield = Number(yieldUnits) || 0;
    advanceMutation.mutate(
      {
        id: yieldDialog.id,
        newStatus: "added_to_inventory",
        extraFields: { actual_yield_units: actualYield },
      },
      {
        onSuccess: () => {
          // Also create a ReviewQueue entry
          base44.entities.ReviewQueue?.create?.({
            batch_id: yieldDialog.batch_id || yieldDialog.id,
            sku: yieldDialog.sku,
            product_name: yieldDialog.product_name,
            quantity: actualYield,
            planned_quantity: yieldDialog.quantity,
            status: "pending",
            created_at: new Date().toISOString(),
          }).catch(() => {});
          setYieldDialog(null);
          setYieldUnits("");
        },
      }
    );
  };

  const daysUntilNext = (batch) => {
    const stage = batchStage(batch);
    const { batchDate, qcDate, fillDate } = parseBatchDates(batch);
    let targetDate = null;
    if (stage === "batching") targetDate = qcDate;
    else if (stage === "qc_hold") targetDate = fillDate;
    else if (stage === "filling") targetDate = fillDate;
    if (!targetDate) return null;
    const diff = Math.ceil((new Date(targetDate) - new Date(today)) / 86400000);
    return diff;
  };

  const nextAction = (stage) => {
    if (stage === "batching") return "Move to QC Hold";
    if (stage === "qc_hold") return "Move to Filling";
    if (stage === "filling") return "Mark Complete";
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-orange-500/30 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">In Progress</p>
          <p className="text-2xl font-bold text-orange-500 mt-1">{stats.inProgress}</p>
          <p className="text-xs text-zinc-500 mt-0.5">active batches</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-red-500/30 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Overdue</p>
          <p className={`text-2xl font-bold mt-1 ${stats.overdue > 0 ? "text-red-400" : "text-zinc-600"}`}>
            {stats.overdue}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">past batch date, still batching</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-green-500/30 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Completing This Week</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{stats.completingThisWeek}</p>
          <p className="text-xs text-zinc-500 mt-0.5">fill date this week</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showCompleted ? "Hide Completed" : "Show Completed (24h)"}
        </button>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {KANBAN_COLUMNS.map((col) => {
            const items = columns[col.key] || [];
            if (col.key === "complete" && !showCompleted) return null;
            return (
              <div key={col.key} className="space-y-2">
                {/* Column header */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${col.cfg.bg} border ${col.cfg.border}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.cfg.dot}`}></span>
                    <span className={`text-sm font-medium ${col.cfg.text}`}>{col.label}</span>
                  </div>
                  <span className={`text-xs font-medium ${col.cfg.text}`}>{items.length}</span>
                </div>

                {/* Cards */}
                {items.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-zinc-800 text-center">
                    <p className="text-xs text-zinc-600">No batches</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((b) => {
                      const { batchDate, qcDate, fillDate } = b.dates;
                      const daysLeft = daysUntilNext(b);
                      const action = nextAction(b.stage);
                      const isOverdue = b.stage === "batching" && batchDate && batchDate < today;

                      return (
                        <Card
                          key={b.id}
                          className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors ${
                            isOverdue ? "border-red-500/30" : ""
                          } ${b.stage === "complete" ? "opacity-75" : ""}`}
                        >
                          <CardContent className="p-3 space-y-2">
                            {/* Batch ID + badges */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono text-zinc-400 truncate">
                                {b.batch_id}
                              </span>
                              {b.stage === "complete" && (
                                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                              )}
                              {isOverdue && (
                                <Badge variant="red">Overdue</Badge>
                              )}
                            </div>

                            {/* Product name */}
                            <h4 className="text-sm font-medium text-zinc-100 truncate">
                              {b.product_name}
                            </h4>

                            {/* Details */}
                            <div className="space-y-1 text-xs text-zinc-500">
                              <div className="flex justify-between">
                                <span>SKU</span>
                                <span className="text-zinc-300 font-mono">{b.sku}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Batch Size</span>
                                <span className="text-zinc-300">{b.quantity?.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Line</span>
                                <span className="text-zinc-300">{b.lineLabel}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Operator</span>
                                <span className="text-zinc-300">{b.operator || "—"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Dates</span>
                                <span className="text-zinc-400">
                                  {formatDate(batchDate).replace(/, \d{4}/, "")} → {formatDate(fillDate).replace(/, \d{4}/, "")}
                                </span>
                              </div>
                            </div>

                            {/* Days until next stage */}
                            {daysLeft !== null && b.stage !== "complete" && (
                              <div className={`flex items-center gap-1 text-xs ${
                                daysLeft < 0 ? "text-red-400" : daysLeft === 0 ? "text-amber-400" : "text-zinc-500"
                              }`}>
                                <Timer className="w-3 h-3" />
                                {daysLeft < 0
                                  ? `${Math.abs(daysLeft)}d overdue`
                                  : daysLeft === 0
                                  ? "Due today"
                                  : `${daysLeft}d to next stage`}
                              </div>
                            )}

                            {/* Yield info for completed */}
                            {b.stage === "complete" && b.actual_yield_units != null && (
                              <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800">
                                <span className="text-zinc-500">Yield</span>
                                <span className={`font-medium ${
                                  b.actual_yield_units >= b.quantity ? "text-green-400" : "text-amber-400"
                                }`}>
                                  {b.actual_yield_units?.toLocaleString()} / {b.quantity?.toLocaleString()}
                                  <span className="text-zinc-600 ml-1">
                                    ({b.quantity ? Math.round((b.actual_yield_units / b.quantity) * 100) : 0}%)
                                  </span>
                                </span>
                              </div>
                            )}

                            {/* Action button */}
                            {action && b.stage !== "complete" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAdvance(b)}
                                disabled={advanceMutation.isPending}
                                className={`w-full text-xs mt-1 ${
                                  b.stage === "batching"
                                    ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                    : b.stage === "qc_hold"
                                    ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                                    : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                                }`}
                              >
                                {advanceMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                ) : (
                                  <ArrowRight className="w-3 h-3 mr-1.5" />
                                )}
                                {action}
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Yield Input Dialog */}
      <Dialog open={!!yieldDialog} onOpenChange={(open) => { if (!open) { setYieldDialog(null); setYieldUnits(""); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          {yieldDialog && (
            <>
              <DialogHeader>
                <DialogTitle>Mark Complete — Yield</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="text-sm text-zinc-400">
                  <span className="text-zinc-200 font-medium">{yieldDialog.product_name}</span>
                  <span className="text-zinc-600 mx-1.5">·</span>
                  <span className="font-mono text-zinc-500">{yieldDialog.batch_id}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Planned Units</Label>
                    <Input
                      value={yieldDialog.quantity?.toLocaleString() || "0"}
                      disabled
                      className="bg-zinc-800 border-zinc-700 text-zinc-400 h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Actual Units Produced *</Label>
                    <Input
                      type="number"
                      value={yieldUnits}
                      onChange={(e) => setYieldUnits(e.target.value)}
                      placeholder="0"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                      autoFocus
                    />
                  </div>
                </div>
                {yieldUnits && yieldDialog.quantity && (
                  <div className={`text-xs font-medium ${
                    Number(yieldUnits) >= yieldDialog.quantity ? "text-green-400" : "text-amber-400"
                  }`}>
                    Yield: {Math.round((Number(yieldUnits) / yieldDialog.quantity) * 100)}%
                    {Number(yieldUnits) < yieldDialog.quantity && (
                      <span className="text-zinc-500 ml-1">
                        ({(yieldDialog.quantity - Number(yieldUnits)).toLocaleString()} under target)
                      </span>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setYieldDialog(null); setYieldUnits(""); }} className="border-zinc-700">
                  Cancel
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={advanceMutation.isPending || !yieldUnits}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {advanceMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Mark Complete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── WIP Co-pack Tab ──────────────────────────────────────────────────────────

const COPACK_STATUSES = [
  { key: "draft",         label: "Draft",         dot: "bg-zinc-400",   text: "text-zinc-400",   bg: "bg-zinc-500/10",  border: "border-zinc-500/20" },
  { key: "sent",          label: "Sent",          dot: "bg-blue-400",   text: "text-blue-400",   bg: "bg-blue-500/10",  border: "border-blue-500/20" },
  { key: "in_production", label: "In Production", dot: "bg-amber-400",  text: "text-amber-400",  bg: "bg-amber-500/10", border: "border-amber-500/20" },
  { key: "qc_hold",       label: "QC Hold",       dot: "bg-purple-400", text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  { key: "returned",      label: "Returned",      dot: "bg-cyan-400",   text: "text-cyan-400",   bg: "bg-cyan-500/10",  border: "border-cyan-500/20" },
  { key: "complete",      label: "Complete",       dot: "bg-green-400",  text: "text-green-400",  bg: "bg-green-500/10", border: "border-green-500/20" },
];

const COPACK_ADVANCE = {
  draft:         { next: "sent",          label: "Mark Sent",          icon: Send },
  sent:          { next: "in_production", label: "Mark In Production", icon: Hammer },
  in_production: { next: "qc_hold",       label: "Move to QC Hold",   icon: Clock },
  qc_hold:       { next: "returned",      label: "Mark Returned",     icon: RotateCcw },
  returned:      { next: "complete",      label: "Mark Complete",      icon: CheckCircle2 },
};

const emptyCopackForm = {
  product_name: "",
  sku: "",
  quantity: "",
  co_packer_name: "",
  ship_by: "",
  notes: "",
};

function WipCopackTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyCopackForm);
  const [returnDialog, setReturnDialog] = useState(null);
  const [returnDate, setReturnDate] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["planning_copack_orders"],
    queryFn: () => base44.entities.CopackOrder.list("-created_date", 500),
  });

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysOut = addDays(today, 7);

  // Alert banner: orders with ship_by within 7 days that haven't shipped yet
  const urgentShipments = useMemo(() =>
    orders.filter((o) => {
      const isPreShip = o.status === "draft";
      return isPreShip && o.ship_by && o.ship_by <= sevenDaysOut && o.ship_by >= today;
    }),
    [orders, today, sevenDaysOut]
  );

  const overdueShipments = useMemo(() =>
    orders.filter((o) => {
      const isPreShip = o.status === "draft";
      return isPreShip && o.ship_by && o.ship_by < today;
    }),
    [orders, today]
  );

  // Group orders by status
  const grouped = useMemo(() => {
    const map = {};
    COPACK_STATUSES.forEach((s) => { map[s.key] = []; });
    orders.forEach((o) => {
      if (map[o.status]) map[o.status].push(o);
      else map.draft.push(o); // fallback
    });
    return map;
  }, [orders]);

  // Stats
  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== "complete");
    const awaiting = orders.filter((o) => o.status === "draft");
    const inProd = orders.filter((o) => o.status === "in_production");
    const overdue = orders.filter((o) => {
      if (o.status === "complete") return false;
      if (o.ship_by && o.ship_by < today && o.status === "draft") return true;
      return false;
    });
    return {
      totalActive: active.length,
      awaitingShipment: awaiting.length,
      inProduction: inProd.length,
      overdue: overdue.length,
    };
  }, [orders, today]);

  // Create order
  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CopackOrder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_copack_orders"] });
      toast.success("Co-pack order created");
      setDialogOpen(false);
      setForm(emptyCopackForm);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to create order: ${msg}`);
    },
  });

  // Advance status
  const advanceMutation = useMutation({
    mutationFn: ({ id, updates }) =>
      base44.entities.CopackOrder.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning_copack_orders"] });
      toast.success("Status updated");
    },
    onError: (err) => {
      const msg = err?.message || String(err);
      toast.error(`Failed to update: ${msg}`);
    },
  });

  const handleCreate = () => {
    if (!form.product_name || !form.sku || !form.quantity || !form.co_packer_name) {
      toast.error("Product name, SKU, quantity, and co-packer are required");
      return;
    }
    createMutation.mutate({
      product_name: form.product_name,
      sku: form.sku,
      quantity: Number(form.quantity),
      co_packer_name: form.co_packer_name,
      ship_by: form.ship_by || null,
      notes: form.notes || "",
      status: "draft",
    });
  };

  const handleAdvance = (order) => {
    const advance = COPACK_ADVANCE[order.status];
    if (!advance) return;

    // If moving to "returned", open return date dialog
    if (advance.next === "returned") {
      setReturnDialog(order);
      setReturnDate(today);
      return;
    }

    const updates = { status: advance.next };
    if (advance.next === "sent") {
      updates.sent_date = today;
    }
    advanceMutation.mutate({ id: order.id, updates });
  };

  const handleReturnConfirm = () => {
    if (!returnDialog) return;
    advanceMutation.mutate(
      {
        id: returnDialog.id,
        updates: {
          status: "returned",
          actual_return_date: returnDate || today,
        },
      },
      {
        onSuccess: () => {
          setReturnDialog(null);
          setReturnDate("");
        },
      }
    );
  };

  const handleCreateQcCheck = (order) => {
    base44.entities.ReviewQueue?.create?.({
      batch_id: order.id,
      sku: order.sku,
      product_name: order.product_name,
      quantity: order.quantity,
      status: "pending",
      notes: `Co-pack return from ${order.co_packer_name}. Return date: ${order.actual_return_date || today}`,
      created_at: new Date().toISOString(),
    })
      .then(() => toast.success("QC check created in Review Queue"))
      .catch(() => toast.error("Failed to create QC check"));
  };

  const daysUntilShipBy = (order) => {
    if (!order.ship_by) return null;
    return Math.ceil((new Date(order.ship_by) - new Date(today)) / 86400000);
  };

  return (
    <div className="space-y-4">
      {/* Alert Banner */}
      {(urgentShipments.length > 0 || overdueShipments.length > 0) && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${
          overdueShipments.length > 0
            ? "bg-red-500/5 border-red-500/20"
            : "bg-amber-500/5 border-amber-500/20"
        }`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
            overdueShipments.length > 0 ? "text-red-400" : "text-amber-400"
          }`} />
          <div className="space-y-1 text-sm">
            {overdueShipments.length > 0 && (
              <p className="text-red-400 font-medium">
                {overdueShipments.length} order{overdueShipments.length > 1 ? "s" : ""} overdue for shipment
              </p>
            )}
            {urgentShipments.length > 0 && (
              <p className="text-amber-400">
                {urgentShipments.length} order{urgentShipments.length > 1 ? "s" : ""} ship within 7 days:{" "}
                <span className="text-zinc-300">
                  {urgentShipments.map((o) => o.product_name || o.sku).join(", ")}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-cyan-500/30 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Total Active</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">{stats.totalActive}</p>
          <p className="text-xs text-zinc-500 mt-0.5">open orders</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-blue-500/30 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Awaiting Shipment</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{stats.awaitingShipment}</p>
          <p className="text-xs text-zinc-500 mt-0.5">draft, not sent</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-amber-500/30 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">In Production</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{stats.inProduction}</p>
          <p className="text-xs text-zinc-500 mt-0.5">at co-packer</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-red-500/30 transition-colors">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Overdue</p>
          <p className={`text-2xl font-bold mt-1 ${stats.overdue > 0 ? "text-red-400" : "text-zinc-600"}`}>
            {stats.overdue}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">past ship-by date</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Co-pack Order
        </Button>
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showCompleted ? "Hide Completed" : "Show Completed"}
        </button>
      </div>

      {/* Grouped Status Sections */}
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {COPACK_STATUSES.map((statusDef) => {
            const items = grouped[statusDef.key] || [];
            if (statusDef.key === "complete" && !showCompleted) return null;
            if (items.length === 0 && statusDef.key === "complete") return null;

            return (
              <div key={statusDef.key} className="space-y-2">
                {/* Status header */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${statusDef.bg} border ${statusDef.border}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusDef.dot}`}></span>
                    <span className={`text-sm font-medium ${statusDef.text}`}>{statusDef.label}</span>
                  </div>
                  <span className={`text-xs font-medium ${statusDef.text}`}>{items.length}</span>
                </div>

                {/* Order cards */}
                {items.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-zinc-800 text-center">
                    <p className="text-xs text-zinc-600">No orders</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map((order) => {
                      const advance = COPACK_ADVANCE[order.status];
                      const shipDays = daysUntilShipBy(order);
                      const isOverdue = order.status === "draft" && order.ship_by && order.ship_by < today;

                      return (
                        <Card
                          key={order.id}
                          className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors ${
                            isOverdue ? "border-red-500/30" : ""
                          } ${order.status === "complete" ? "opacity-75" : ""}`}
                        >
                          <CardContent className="p-4 space-y-3">
                            {/* Header row */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="text-sm font-medium text-zinc-100 truncate">
                                  {order.product_name}
                                </h4>
                                <span className="text-xs font-mono text-zinc-500">{order.sku}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isOverdue && <Badge variant="red">Overdue</Badge>}
                                {order.status === "complete" && (
                                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                                )}
                              </div>
                            </div>

                            {/* Details */}
                            <div className="space-y-1 text-xs text-zinc-500">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  Co-packer
                                </span>
                                <span className="text-zinc-300">{order.co_packer_name}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  Quantity
                                </span>
                                <span className="text-zinc-300">{order.quantity?.toLocaleString()}</span>
                              </div>
                              {order.ship_by && (
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    Ship By
                                  </span>
                                  <span className={`font-medium ${
                                    isOverdue ? "text-red-400" : shipDays !== null && shipDays <= 7 ? "text-amber-400" : "text-zinc-300"
                                  }`}>
                                    {formatDate(order.ship_by)}
                                  </span>
                                </div>
                              )}
                              {order.sent_date && (
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1">
                                    <Send className="w-3 h-3" />
                                    Sent
                                  </span>
                                  <span className="text-zinc-300">{formatDate(order.sent_date)}</span>
                                </div>
                              )}
                              {order.actual_return_date && (
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1">
                                    <RotateCcw className="w-3 h-3" />
                                    Returned
                                  </span>
                                  <span className="text-zinc-300">{formatDate(order.actual_return_date)}</span>
                                </div>
                              )}
                            </div>

                            {/* Ship-by countdown */}
                            {shipDays !== null && order.status === "draft" && (
                              <div className={`flex items-center gap-1 text-xs ${
                                shipDays < 0 ? "text-red-400" : shipDays <= 3 ? "text-amber-400" : "text-zinc-500"
                              }`}>
                                <Timer className="w-3 h-3" />
                                {shipDays < 0
                                  ? `${Math.abs(shipDays)}d overdue`
                                  : shipDays === 0
                                  ? "Ship today"
                                  : `${shipDays}d until ship-by`}
                              </div>
                            )}

                            {/* Notes */}
                            {order.notes && (
                              <p className="text-xs text-zinc-500 italic truncate">{order.notes}</p>
                            )}

                            {/* QC Check button for returned orders */}
                            {order.status === "returned" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCreateQcCheck(order)}
                                className="w-full text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                              >
                                <ExternalLink className="w-3 h-3 mr-1.5" />
                                Create QC Check
                              </Button>
                            )}

                            {/* Advance button */}
                            {advance && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAdvance(order)}
                                disabled={advanceMutation.isPending}
                                className={`w-full text-xs ${
                                  order.status === "draft"
                                    ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                                    : order.status === "sent"
                                    ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                    : order.status === "in_production"
                                    ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                                    : order.status === "qc_hold"
                                    ? "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                                    : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                                }`}
                              >
                                {advanceMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                ) : (
                                  (() => {
                                    const AdvIcon = advance.icon;
                                    return <AdvIcon className="w-3 h-3 mr-1.5" />;
                                  })()
                                )}
                                {advance.label}
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Co-pack Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>New Co-pack Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Product Name *</Label>
                <Input
                  value={form.product_name}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                  placeholder="Lavender Body Lotion"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">SKU *</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="LAV-BL-001"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Quantity *</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="5000"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Co-packer Name *</Label>
                <Input
                  value={form.co_packer_name}
                  onChange={(e) => setForm({ ...form, co_packer_name: e.target.value })}
                  placeholder="Acme Fill Co."
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Ship By Date</Label>
              <Input
                type="date"
                value={form.ship_by}
                onChange={(e) => setForm({ ...form, ship_by: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Special instructions, packaging requirements, etc."
                rows={2}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Date Dialog */}
      <Dialog open={!!returnDialog} onOpenChange={(open) => { if (!open) { setReturnDialog(null); setReturnDate(""); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          {returnDialog && (
            <>
              <DialogHeader>
                <DialogTitle>Mark Returned</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="text-sm text-zinc-400">
                  <span className="text-zinc-200 font-medium">{returnDialog.product_name}</span>
                  <span className="text-zinc-600 mx-1.5">·</span>
                  <span className="text-zinc-400">{returnDialog.co_packer_name}</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Actual Return Date *</Label>
                  <Input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  After marking returned, you can create a QC check from the order card.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setReturnDialog(null); setReturnDate(""); }} className="border-zinc-700">
                  Cancel
                </Button>
                <Button
                  onClick={handleReturnConfirm}
                  disabled={advanceMutation.isPending || !returnDate}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  {advanceMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Confirm Return
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Recipe Sheets Tab ────────────────────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #recipe-print-area, #recipe-print-area * { visibility: visible !important; }
  #recipe-print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    background: white !important;
    color: black !important;
    font-size: 11pt !important;
    line-height: 1.4 !important;
  }
  .recipe-sheet-page {
    page-break-after: always;
    padding: 0.5in !important;
  }
  .recipe-sheet-page:last-child {
    page-break-after: auto;
  }
  .no-print { display: none !important; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; font-size: 10pt; }
  th { background: #e5e5e5 !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 16pt; margin-bottom: 4px; }
  h2 { font-size: 13pt; margin-top: 16px; margin-bottom: 6px; border-bottom: 2px solid #333; padding-bottom: 3px; }
  .sign-off-line { border-bottom: 1px solid #333; min-width: 200px; display: inline-block; height: 1.2em; }
}
`;

function RecipeSheetsTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [printRecipes, setPrintRecipes] = useState(null); // array of recipes to print
  const [batchSizes, setBatchSizes] = useState({}); // { recipeId: customBatchSize }

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ["planning_recipes"],
    queryFn: () => base44.entities.Recipe.list("-created_date", 500),
  });

  const activeRecipes = useMemo(() =>
    recipes.filter((r) => r.active !== false),
    [recipes]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return activeRecipes;
    const q = search.toLowerCase();
    return activeRecipes.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.sku?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q)
    );
  }, [activeRecipes, search]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };

  const openPrint = (recipe) => {
    setBatchSizes((prev) => ({ ...prev, [recipe.id]: recipe.batch_size || 1 }));
    setPrintRecipes([recipe]);
  };

  const openBulkPrint = () => {
    const toPrint = filtered.filter((r) => selected.has(r.id));
    if (toPrint.length === 0) {
      toast.error("No recipes selected");
      return;
    }
    const sizes = { ...batchSizes };
    toPrint.forEach((r) => {
      if (!sizes[r.id]) sizes[r.id] = r.batch_size || 1;
    });
    setBatchSizes(sizes);
    setPrintRecipes(toPrint);
  };

  const handlePrint = () => {
    window.print();
  };

  const updateBatchSize = (recipeId, val) => {
    setBatchSizes((prev) => ({ ...prev, [recipeId]: Math.max(1, Number(val) || 1) }));
  };

  const scaleQty = (originalQty, recipeBatchSize, customBatchSize) => {
    if (!recipeBatchSize || !customBatchSize) return originalQty || 0;
    const ratio = customBatchSize / recipeBatchSize;
    const scaled = (originalQty || 0) * ratio;
    return Math.round(scaled * 1000) / 1000; // 3 decimal places
  };

  const scalePackaging = (qtyPerBatch, recipeBatchSize, customBatchSize) => {
    if (!recipeBatchSize || !customBatchSize || !qtyPerBatch) return qtyPerBatch || 0;
    const ratio = customBatchSize / recipeBatchSize;
    return Math.ceil((qtyPerBatch || 0) * ratio);
  };

  const todayStr = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric"
  });

  // Inject print styles
  React.useEffect(() => {
    const id = "recipe-print-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = PRINT_STYLES;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes by name, SKU, or category…"
            className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleSelectAll}
            className="border-zinc-700 text-zinc-300 text-xs"
          >
            {selected.size === filtered.length && filtered.length > 0 ? (
              <CheckSquare className="w-3.5 h-3.5 mr-1.5 text-orange-400" />
            ) : (
              <Square className="w-3.5 h-3.5 mr-1.5" />
            )}
            {selected.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
          </Button>
          {selected.size > 0 && (
            <Button
              size="sm"
              onClick={openBulkPrint}
              className="bg-red-600 hover:bg-red-700 text-white text-xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print Selected ({selected.size})
            </Button>
          )}
        </div>
      </div>

      {/* Recipe count */}
      <p className="text-xs text-zinc-500">
        {filtered.length} recipe{filtered.length !== 1 ? "s" : ""} found
        {search && ` matching "${search}"`}
      </p>

      {/* Recipe list */}
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-8 text-center">
            <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500 text-sm">No recipes found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((recipe) => {
            const isSelected = selected.has(recipe.id);
            const ingredientCount = recipe.ingredients?.length || 0;
            const stepCount = recipe.procedures?.length || 0;
            const qcCount = recipe.qc_checks?.length || 0;

            return (
              <Card
                key={recipe.id}
                className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer ${
                  isSelected ? "border-orange-500/40 bg-orange-500/5" : ""
                }`}
                onClick={() => toggleSelect(recipe.id)}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-orange-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-600 shrink-0" />
                        )}
                        <h4 className="text-sm font-medium text-zinc-100 truncate">
                          {recipe.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-6">
                        <span className="text-xs font-mono text-zinc-500">{recipe.sku}</span>
                        {recipe.category && (
                          <Badge variant="zinc">{recipe.category}</Badge>
                        )}
                        {recipe.version > 1 && (
                          <span className="text-xs text-zinc-600">v{recipe.version}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 ml-6">
                    <div className="text-center p-1.5 rounded bg-zinc-800/50">
                      <p className="text-xs text-zinc-500">Batch</p>
                      <p className="text-sm font-medium text-zinc-200">{recipe.batch_size || "—"}</p>
                    </div>
                    <div className="text-center p-1.5 rounded bg-zinc-800/50">
                      <p className="text-xs text-zinc-500">Ingredients</p>
                      <p className="text-sm font-medium text-zinc-200">{ingredientCount}</p>
                    </div>
                    <div className="text-center p-1.5 rounded bg-zinc-800/50">
                      <p className="text-xs text-zinc-500">Steps</p>
                      <p className="text-sm font-medium text-zinc-200">{stepCount}</p>
                    </div>
                  </div>

                  {/* Print button */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPrint(recipe);
                    }}
                    className="w-full text-xs ml-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <Printer className="w-3 h-3 mr-1.5" />
                    Print Sheet
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Print Dialog */}
      <Dialog open={!!printRecipes} onOpenChange={(open) => { if (!open) setPrintRecipes(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-4xl max-h-[90vh] overflow-y-auto">
          {printRecipes && (
            <>
              <DialogHeader className="no-print">
                <DialogTitle>
                  {printRecipes.length === 1
                    ? `Recipe Sheet — ${printRecipes[0].name}`
                    : `Print ${printRecipes.length} Recipe Sheets`}
                </DialogTitle>
              </DialogHeader>

              {/* Batch size inputs (screen only) */}
              <div className="no-print space-y-3 py-2 border-b border-zinc-800">
                <p className="text-xs text-zinc-500">
                  Adjust batch sizes below. Ingredient quantities will scale automatically.
                </p>
                <div className="flex flex-wrap gap-3">
                  {printRecipes.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <Label className="text-zinc-400 text-xs whitespace-nowrap">
                        {printRecipes.length > 1 ? `${r.name}:` : "Batch Size:"}
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={batchSizes[r.id] || r.batch_size || 1}
                        onChange={(e) => updateBatchSize(r.id, e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm w-24"
                      />
                      {(batchSizes[r.id] || r.batch_size) !== r.batch_size && (
                        <span className="text-xs text-amber-400">
                          (default: {r.batch_size})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Printable content */}
              <div id="recipe-print-area">
                {printRecipes.map((recipe) => {
                  const customBatch = batchSizes[recipe.id] || recipe.batch_size || 1;
                  const origBatch = recipe.batch_size || 1;

                  return (
                    <div key={recipe.id} className="recipe-sheet-page" style={{ color: "black", background: "white", padding: "24px", fontFamily: "Arial, Helvetica, sans-serif" }}>
                      {/* Header */}
                      <div style={{ borderBottom: "3px solid #333", paddingBottom: "8px", marginBottom: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <h1 style={{ fontSize: "18pt", fontWeight: 700, margin: 0, color: "#111" }}>
                              {recipe.name}
                            </h1>
                            <div style={{ fontSize: "10pt", color: "#555", marginTop: "4px" }}>
                              SKU: <strong>{recipe.sku}</strong>
                              {recipe.category && <span> &nbsp;|&nbsp; {recipe.category}</span>}
                              {recipe.version > 1 && <span> &nbsp;|&nbsp; v{recipe.version}</span>}
                              {recipe.production_line && <span> &nbsp;|&nbsp; Line {recipe.production_line}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: "10pt", color: "#555" }}>
                            <div>Printed: {todayStr}</div>
                          </div>
                        </div>
                      </div>

                      {/* Batch info */}
                      <div style={{ display: "flex", gap: "24px", marginBottom: "16px", fontSize: "11pt" }}>
                        <div>
                          <strong>Batch ID:</strong>{" "}
                          <span style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "180px" }}>&nbsp;</span>
                        </div>
                        <div>
                          <strong>Batch Size:</strong> {customBatch.toLocaleString()} units
                          {customBatch !== origBatch && (
                            <span style={{ fontSize: "9pt", color: "#888" }}> (recipe default: {origBatch})</span>
                          )}
                        </div>
                        <div>
                          <strong>Date:</strong>{" "}
                          <span style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "120px" }}>&nbsp;</span>
                        </div>
                      </div>

                      {/* Ingredients */}
                      {recipe.ingredients && recipe.ingredients.length > 0 && (
                        <div style={{ marginBottom: "16px" }}>
                          <h2 style={{ fontSize: "13pt", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: "3px", marginBottom: "6px", color: "#111" }}>
                            Ingredients
                          </h2>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
                            <thead>
                              <tr style={{ background: "#e5e5e5" }}>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left", width: "5%" }}>#</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left", width: "30%" }}>Material</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left", width: "15%" }}>SKU</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right", width: "15%" }}>Qty (per batch)</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left", width: "10%" }}>Unit</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center", width: "25%" }}>Weighed / Checked</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recipe.ingredients.map((ing, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px" }}>{i + 1}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", fontWeight: 500 }}>{ing.material}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", fontFamily: "monospace", fontSize: "9pt" }}>{ing.sku || "—"}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>
                                    {scaleQty(ing.qty, origBatch, customBatch)}
                                  </td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px" }}>{ing.unit}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center" }}>
                                    <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid #333", marginRight: "4px", verticalAlign: "middle" }}></span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Packaging */}
                      {recipe.packaging && recipe.packaging.length > 0 && (
                        <div style={{ marginBottom: "16px" }}>
                          <h2 style={{ fontSize: "13pt", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: "3px", marginBottom: "6px", color: "#111" }}>
                            Packaging Requirements
                          </h2>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
                            <thead>
                              <tr style={{ background: "#e5e5e5" }}>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left" }}>Item</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left" }}>SKU</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right" }}>Per Unit</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right" }}>Per Batch</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center" }}>Checked</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recipe.packaging.map((pkg, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", fontWeight: 500 }}>{pkg.name}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", fontFamily: "monospace", fontSize: "9pt" }}>{pkg.sku || "—"}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right" }}>{pkg.qty_per_unit || 1}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>
                                    {scalePackaging(pkg.qty_per_batch, origBatch, customBatch)}
                                  </td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center" }}>
                                    <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid #333", verticalAlign: "middle" }}></span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Procedures */}
                      {recipe.procedures && recipe.procedures.length > 0 && (
                        <div style={{ marginBottom: "16px" }}>
                          <h2 style={{ fontSize: "13pt", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: "3px", marginBottom: "6px", color: "#111" }}>
                            Production Procedures
                          </h2>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
                            <thead>
                              <tr style={{ background: "#e5e5e5" }}>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left", width: "6%" }}>Step</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left" }}>Description</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right", width: "10%" }}>Time</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left", width: "20%" }}>Notes</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center", width: "8%" }}>Done</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recipe.procedures.map((proc, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", fontWeight: 600 }}>{proc.step || i + 1}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px" }}>{proc.description}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right" }}>
                                    {proc.duration_minutes ? `${proc.duration_minutes} min` : "—"}
                                  </td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", fontSize: "9pt", color: "#555" }}>{proc.notes || ""}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center" }}>
                                    <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid #333", verticalAlign: "middle" }}></span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* QC Checks */}
                      {recipe.qc_checks && recipe.qc_checks.length > 0 && (
                        <div style={{ marginBottom: "16px" }}>
                          <h2 style={{ fontSize: "13pt", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: "3px", marginBottom: "6px", color: "#111" }}>
                            QC Checkpoints
                          </h2>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
                            <thead>
                              <tr style={{ background: "#e5e5e5" }}>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left" }}>Checkpoint</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left" }}>Criteria</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "left" }}>Method</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center", width: "10%" }}>Pass</th>
                                <th style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center", width: "10%" }}>Fail</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recipe.qc_checks.map((qc, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", fontWeight: 500 }}>{qc.checkpoint}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px" }}>{qc.criteria}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px" }}>{qc.method || "—"}</td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center" }}>
                                    <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid #333", verticalAlign: "middle" }}></span>
                                  </td>
                                  <td style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "center" }}>
                                    <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid #333", verticalAlign: "middle" }}></span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Sign-off */}
                      <div style={{ marginTop: "24px", borderTop: "2px solid #333", paddingTop: "16px" }}>
                        <h2 style={{ fontSize: "13pt", fontWeight: 700, marginBottom: "12px", color: "#111" }}>
                          Sign-off
                        </h2>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", fontSize: "10pt" }}>
                          <div style={{ borderBottom: "none" }}>
                            <div style={{ marginBottom: "16px" }}>
                              <strong>Operator Name:</strong>{" "}
                              <span style={{ borderBottom: "1px solid #333", display: "inline-block", minWidth: "200px" }}>&nbsp;</span>
                            </div>
                            <div>
                              <strong>Operator Signature:</strong>{" "}
                              <span style={{ borderBottom: "1px solid #333", display: "inline-block", minWidth: "200px" }}>&nbsp;</span>
                            </div>
                          </div>
                          <div>
                            <div style={{ marginBottom: "16px" }}>
                              <strong>QC Name:</strong>{" "}
                              <span style={{ borderBottom: "1px solid #333", display: "inline-block", minWidth: "200px" }}>&nbsp;</span>
                            </div>
                            <div>
                              <strong>QC Signature:</strong>{" "}
                              <span style={{ borderBottom: "1px solid #333", display: "inline-block", minWidth: "200px" }}>&nbsp;</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "40px", marginTop: "16px", fontSize: "10pt" }}>
                          <div>
                            <strong>Date:</strong>{" "}
                            <span style={{ borderBottom: "1px solid #333", display: "inline-block", minWidth: "150px" }}>&nbsp;</span>
                          </div>
                          <div>
                            <strong>Batch Number:</strong>{" "}
                            <span style={{ borderBottom: "1px solid #333", display: "inline-block", minWidth: "180px" }}>&nbsp;</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dialog footer (screen only) */}
              <DialogFooter className="no-print">
                <Button variant="outline" onClick={() => setPrintRecipes(null)} className="border-zinc-700">
                  Close
                </Button>
                <Button onClick={handlePrint} className="bg-red-600 hover:bg-red-700 text-white">
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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