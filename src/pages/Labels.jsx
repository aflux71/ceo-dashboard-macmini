import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Tag,
  AlertTriangle,
  Package,
  Truck,
  Edit,
  Trash2,
  TrendingDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShoppingCart,
  Printer,
  Hash,
  Settings,
} from "lucide-react";
import LabelSerials from "./LabelSerials";
import AllSerialsSettings from "@/components/labels/AllSerialsSettings";

export default function Labels() {
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [queuedLabels, setQueuedLabels] = useState(new Set());
  const queryClient = useQueryClient();

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ["labels"],
    queryFn: () => base44.entities.Label.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: demandSummaries = [] } = useQuery({
    queryKey: ["demand_summaries_labels"],
    queryFn: () => base44.entities.DemandSummary.list(),
  });

  // Merge recipes + demand summaries into a unified product list (deduplicated by SKU)
  const allProducts = useMemo(() => {
    const seen = new Set();
    const items = [];
    // Recipes first (preferred source)
    for (const r of recipes) {
      if (!r.sku || !r.name) continue;
      const key = r.sku.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ id: r.id, sku: r.sku, name: r.name });
    }
    // Then demand summaries for any SKUs not in recipes
    for (const d of demandSummaries) {
      if (!d.sku || !d.product) continue;
      const key = d.sku.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ id: `ds-${d.id}`, sku: d.sku, name: d.product });
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, demandSummaries]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Label.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labels"] });
      setShowDialog(false);
      setEditingLabel(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Label.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labels"] });
      setShowDialog(false);
      setEditingLabel(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Label.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["labels"] }),
  });

  const filteredLabels = labels.filter((label) => {
    const matchesSearch =
      label.name?.toLowerCase().includes(search.toLowerCase()) ||
      label.sku?.toLowerCase().includes(search.toLowerCase()) ||
      label.product_name?.toLowerCase().includes(search.toLowerCase());

    if (filter === "low") {
      return matchesSearch && label.current_quantity <= label.reorder_point;
    }
    if (filter === "out") {
      return matchesSearch && label.current_quantity === 0;
    }
    return matchesSearch;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const getStockStatus = (label) => {
    if (label.current_quantity === 0) return { variant: "red", text: "Out of Stock" };
    if (label.current_quantity <= label.reorder_point) return { variant: "amber", text: "Low Stock" };
    return { variant: "green", text: "In Stock" };
  };

  const sortedLabels = [...filteredLabels].sort((a, b) => {
    if (!sortField) return 0;
    const dir = sortDir === "asc" ? 1 : -1;
    let aVal, bVal;
    switch (sortField) {
      case "name": aVal = a.name || ""; bVal = b.name || ""; break;
      case "product": aVal = a.product_name || ""; bVal = b.product_name || ""; break;
      case "quantity": aVal = a.current_quantity ?? 0; bVal = b.current_quantity ?? 0; break;
      case "status": {
        const statusOrder = { "Out of Stock": 0, "Low Stock": 1, "In Stock": 2 };
        aVal = statusOrder[getStockStatus(a).text]; bVal = statusOrder[getStockStatus(b).text]; break;
      }
      case "bin": aVal = a.bin_location || ""; bVal = b.bin_location || ""; break;
      case "supplier": aVal = a.supplier_name || ""; bVal = b.supplier_name || ""; break;
      case "lead_time": aVal = a.lead_time_days ?? 0; bVal = b.lead_time_days ?? 0; break;
      default: return 0;
    }
    if (typeof aVal === "string") return aVal.localeCompare(bVal) * dir;
    return (aVal - bVal) * dir;
  });

  const SortHeader = ({ field, children, className = "" }) => (
    <TableHead
      className={`text-zinc-400 cursor-pointer select-none hover:text-zinc-200 transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </div>
    </TableHead>
  );

  const stats = {
    total: labels.length,
    lowStock: labels.filter((l) => l.current_quantity <= l.reorder_point && l.current_quantity > 0).length,
    outOfStock: labels.filter((l) => l.current_quantity === 0).length,
    totalValue: labels.reduce((sum, l) => sum + (l.current_quantity * (l.cost_per_unit || 0)), 0),
  };

  const handlePrintRequisition = () => {
    // Use queued labels if any, otherwise default to low + out of stock
    const itemsToPrint = queuedLabels.size > 0
      ? labels.filter((l) => queuedLabels.has(l.id))
      : labels.filter((l) => l.current_quantity <= l.reorder_point);

    if (itemsToPrint.length === 0) {
      toast.error("No labels to requisition");
      return;
    }

    const today = new Date().toLocaleDateString();
    const rows = itemsToPrint.map((l) => {
      const suggested = l.reorder_qty || Math.max((l.reorder_point || 0) * 2 - (l.current_quantity || 0), 0);
      return `
        <tr>
          <td>${l.name || ""}</td>
          <td>${l.sku || ""}</td>
          <td>${l.product_name || "-"}</td>
          <td style="text-align:center;">${l.current_quantity ?? 0}</td>
          <td style="text-align:center;">${l.reorder_point ?? 0}</td>
          <td style="text-align:center; font-weight:600;">${suggested}</td>
          <td>${l.supplier_name || "-"}</td>
          <td>${l.bin_location || "-"}</td>
          <td>${l.lead_time_days ? l.lead_time_days + " days" : "-"}</td>
        </tr>
      `;
    }).join("");

    const html = `
      <!DOCTYPE html><html><head><title>Label Requisition</title>
      <style>
        @page { size: letter; margin: 0.5in; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; padding: 20px; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        th { background: #f3f4f6; font-weight: 600; }
        tr:nth-child(even) td { background: #fafafa; }
        .signatures { margin-top: 40px; display: flex; gap: 60px; font-size: 12px; }
        .sig { flex: 1; }
        .sig-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; color: #555; }
      </style></head><body>
        <h1>Label Requisition Request</h1>
        <div class="meta">
          <span><strong>Date:</strong> ${today}</span>
          <span><strong>Items:</strong> ${itemsToPrint.length}</span>
        </div>
        <table>
          <thead><tr>
            <th>Label</th><th>SKU</th><th>Product</th>
            <th>On Hand</th><th>Min</th><th>Order Qty</th>
            <th>Supplier</th><th>Bin</th><th>Lead Time</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="signatures">
          <div class="sig"><div class="sig-line">Requested By</div></div>
          <div class="sig"><div class="sig-line">Approved By</div></div>
          <div class="sig"><div class="sig-line">Date</div></div>
        </div>
      </body></html>
    `;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.print(); };
  };

  const handlePrintThermalRequisition = (label) => {
    const today = new Date().toLocaleDateString();
    const suggested = label.reorder_qty || Math.max((label.reorder_point || 0) * 2 - (label.current_quantity || 0), 0);

    const html = `
      <!DOCTYPE html><html><head><title>Requisition - ${label.name || ""}</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #000; margin: 0; padding: 6px; width: 72mm; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
        .header h1 { font-size: 20px; margin: 0; font-weight: 800; letter-spacing: 0.5px; }
        .header .date { font-size: 13px; margin-top: 4px; }
        .label-name { font-size: 22px; font-weight: 800; text-align: center; margin: 10px 0 4px; line-height: 1.15; }
        .sku { font-size: 14px; text-align: center; color: #000; margin-bottom: 12px; font-family: monospace; }
        .row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px dashed #000; }
        .row .lbl { font-size: 14px; font-weight: 600; text-transform: uppercase; }
        .row .val { font-size: 20px; font-weight: 800; text-align: right; }
        .row .val.big { font-size: 28px; }
        .verify { margin-top: 16px; border: 2px solid #000; padding: 10px; }
        .verify h2 { font-size: 14px; margin: 0 0 10px; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
        .sig-line { border-bottom: 1px solid #000; height: 28px; margin-top: 8px; }
        .sig-label { font-size: 12px; margin-top: 3px; color: #000; }
        .footer { text-align: center; font-size: 11px; margin-top: 12px; color: #000; }
      </style></head><body>
        <div class="header">
          <h1>LABEL REQUISITION</h1>
          <div class="date">${today}</div>
        </div>

        <div class="label-name">${label.name || ""}</div>
        <div class="sku">${label.sku || ""}</div>

        <div class="row">
          <span class="lbl">Bin Location</span>
          <span class="val big">${label.bin_location || "-"}</span>
        </div>
        <div class="row">
          <span class="lbl">Current Qty</span>
          <span class="val">${label.current_quantity ?? 0}</span>
        </div>
        <div class="row">
          <span class="lbl">Reorder Qty</span>
          <span class="val big">${suggested}</span>
        </div>
        <div class="row">
          <span class="lbl">Supplier</span>
          <span class="val" style="font-size:14px;">${label.supplier_name || "-"}</span>
        </div>

        <div class="verify">
          <h2>Verification</h2>
          <div class="sig-line"></div>
          <div class="sig-label">Requested By / Date</div>
          <div class="sig-line"></div>
          <div class="sig-label">Approved By / Date</div>
          <div class="sig-line"></div>
          <div class="sig-label">Received By / Date</div>
        </div>

        <div class="footer">${label.product_name || ""}</div>
      </body></html>
    `;

    const w = window.open("", "_blank", "width=400,height=700");
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.print(); };
  };

  const handleSendToLabelPO = (label) => {
    setQueuedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label.id)) {
        next.delete(label.id);
        toast("Removed from Label PO queue");
      } else {
        next.add(label.id);
        toast.success(`${label.name} added to Label PO queue`);
      }
      return next;
    });
  };

  const handleSave = (formData) => {
    if (editingLabel) {
      updateMutation.mutate({ id: editingLabel.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag className="w-7 h-7 text-orange-400" />
            Label Management
          </h1>
          <p className="text-zinc-400 mt-1">Track and manage product labels inventory</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handlePrintRequisition}
            variant="outline"
            className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Requisition {queuedLabels.size > 0 && `(${queuedLabels.size})`}
          </Button>
          <Button onClick={() => { setEditingLabel(null); setShowDialog(true); }} className="bg-orange-500 hover:bg-orange-600">
            <Plus className="w-4 h-4 mr-2" /> Add Label
          </Button>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="space-y-6">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="inventory" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-orange-400">
            <Tag className="w-4 h-4 mr-2" /> Inventory
          </TabsTrigger>
          <TabsTrigger value="serials" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-orange-400">
            <Hash className="w-4 h-4 mr-2" /> Serial Tracking
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-orange-400">
            <Settings className="w-4 h-4 mr-2" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-6 mt-0">

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Tag className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Total Labels</p>
                <p className="text-xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <TrendingDown className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Low Stock</p>
                <p className="text-xl font-bold text-amber-400">{stats.lowStock}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Out of Stock</p>
                <p className="text-xl font-bold text-red-400">{stats.outOfStock}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Package className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Total Value</p>
                <p className="text-xl font-bold text-white">${stats.totalValue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search labels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-700"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40 bg-zinc-900 border-zinc-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Labels</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="out">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <SortHeader field="name">Label</SortHeader>
                <SortHeader field="product">Product</SortHeader>
                <SortHeader field="quantity">Quantity</SortHeader>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="bin">Bin Location</SortHeader>
                <SortHeader field="supplier">Supplier</SortHeader>
                <SortHeader field="lead_time">Lead Time</SortHeader>
                <TableHead className="text-zinc-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-zinc-500 py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredLabels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-zinc-500 py-8">
                    No labels found
                  </TableCell>
                </TableRow>
              ) : (
                sortedLabels.map((label) => {
                  const status = getStockStatus(label);
                  return (
                    <TableRow key={label.id} className="border-zinc-800">
                      <TableCell>
                        <div>
                          <p className="font-medium text-white">{label.name}</p>
                          <p className="text-xs text-zinc-500">{label.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-300">{label.product_name || "-"}</TableCell>
                      <TableCell>
                        <span className={label.current_quantity <= label.reorder_point ? "text-amber-400" : "text-white"}>
                          {label.current_quantity}
                        </span>
                        <span className="text-zinc-500 text-sm"> / {label.reorder_point} min</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.text}</Badge>
                      </TableCell>
                      <TableCell className="text-zinc-300">{label.bin_location || "-"}</TableCell>
                      <TableCell className="text-zinc-300">{label.supplier_name || "-"}</TableCell>
                      <TableCell className="text-zinc-300">
                        {label.lead_time_days ? `${label.lead_time_days} days` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSendToLabelPO(label)}
                            className={queuedLabels.has(label.id) ? "text-orange-400 hover:text-orange-300" : "text-zinc-400 hover:text-orange-400"}
                            title={queuedLabels.has(label.id) ? "Remove from Label PO queue" : "Send to Label PO"}
                          >
                            <ShoppingCart className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrintThermalRequisition(label)}
                            className="text-zinc-400 hover:text-blue-400"
                            title="Print thermal requisition"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingLabel(label); setShowDialog(true); }}
                            className="text-zinc-400 hover:text-white"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(label.id)}
                            className="text-zinc-400 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <LabelDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingLabel(null); }}
        onSave={handleSave}
        label={editingLabel}
        suppliers={suppliers}
        recipes={allProducts}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
        </TabsContent>

        <TabsContent value="serials" className="mt-0">
          <LabelSerials />
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          <AllSerialsSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductCombobox({ recipes, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  const selected = recipes.find((r) => r.sku === value);
  const filtered = recipes.filter((r) =>
    !query || r.name?.toLowerCase().includes(query.toLowerCase()) || r.sku?.toLowerCase().includes(query.toLowerCase())
  );

  // Close on outside click
  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div
        className="flex items-center bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 cursor-text gap-2"
        onClick={() => { setOpen(true); setQuery(""); }}
      >
        {open ? (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            placeholder="Search product..."
          />
        ) : (
          <span className="flex-1 text-sm truncate" style={{ color: selected ? "#f4f4f5" : "#71717a" }}>
            {selected ? `${selected.name} (${selected.sku})` : "Select product..."}
          </span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
          <div
            className="px-3 py-2 text-sm text-zinc-500 cursor-pointer hover:bg-zinc-700"
            onMouseDown={() => { onChange(""); setOpen(false); }}
          >
            — None —
          </div>
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-zinc-500">No products found</div>
          )}
          {filtered.map((r) => (
            <div
              key={r.id}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-zinc-700 ${value === r.sku ? "bg-orange-500/20 text-orange-400" : "text-zinc-200"}`}
              onMouseDown={() => { onChange(r.sku); setOpen(false); setQuery(""); }}
            >
              {r.name} <span className="text-zinc-500 text-xs">({r.sku})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LabelDialog({ open, onClose, onSave, label, suppliers, recipes, isLoading }) {
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    product_sku: "",
    product_name: "",
    current_quantity: 0,
    reorder_point: 100,
    reorder_qty: 500,
    bin_location: "",
    supplier_id: "",
    supplier_name: "",
    lead_time_days: 14,
    cost_per_unit: 0,
    notes: "",
    active: true,
    print_on_demand: false,
    seasonal: false,
  });

  React.useEffect(() => {
    if (label) {
      setFormData({ ...label });
    } else {
      setFormData({
        name: "",
        sku: "",
        product_sku: "",
        product_name: "",
        current_quantity: 0,
        reorder_point: 100,
        reorder_qty: 500,
        bin_location: "",
        supplier_id: "",
        supplier_name: "",
        lead_time_days: 14,
        cost_per_unit: 0,
        notes: "",
        active: true,
        print_on_demand: false,
        seasonal: false,
      });
    }
  }, [label, open]);

  const handleProductChange = (productSku) => {
    const recipe = recipes.find((r) => r.sku === productSku);
    setFormData({
      ...formData,
      product_sku: productSku,
      product_name: recipe?.name || "",
    });
  };

  const handleSupplierChange = (supplierId) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    setFormData({
      ...formData,
      supplier_id: supplierId,
      supplier_name: supplier?.name || "",
      lead_time_days: supplier?.lead_time_days || formData.lead_time_days,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {label ? "Edit Label" : "Add New Label"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Label Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
                placeholder="e.g., Lavender Bath Bomb Label"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">SKU *</label>
              <Input
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
                placeholder="e.g., LBL-001"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Product</label>
            <ProductCombobox
              recipes={recipes}
              value={formData.product_sku}
              onChange={handleProductChange}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Current Qty</label>
              <Input
                type="number"
                value={formData.current_quantity}
                onChange={(e) => setFormData({ ...formData, current_quantity: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Reorder Point</label>
              <Input
                type="number"
                value={formData.reorder_point}
                onChange={(e) => setFormData({ ...formData, reorder_point: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Reorder Qty</label>
              <Input
                type="number"
                value={formData.reorder_qty}
                onChange={(e) => setFormData({ ...formData, reorder_qty: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Bin Location</label>
            <Input
              value={formData.bin_location}
              onChange={(e) => setFormData({ ...formData, bin_location: e.target.value })}
              className="bg-zinc-800 border-zinc-700"
              placeholder="e.g., A1-01"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Supplier</label>
              <Select value={formData.supplier_id} onValueChange={handleSupplierChange}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Select supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Lead Time (days)</label>
              <Input
                type="number"
                value={formData.lead_time_days}
                onChange={(e) => setFormData({ ...formData, lead_time_days: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Cost Per Unit ($)</label>
            <Input
              type="number"
              step="0.01"
              value={formData.cost_per_unit}
              onChange={(e) => setFormData({ ...formData, cost_per_unit: Number(e.target.value) })}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.print_on_demand}
                onChange={(e) => setFormData({ ...formData, print_on_demand: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm text-zinc-400">Print on Demand</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.seasonal}
                onChange={(e) => setFormData({ ...formData, seasonal: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm text-zinc-400">Seasonal</span>
            </label>
          </div>
          </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-700">
            Cancel
          </Button>
          <Button
            onClick={() => onSave(formData)}
            disabled={!formData.name || !formData.sku || isLoading}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isLoading ? "Saving..." : label ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}