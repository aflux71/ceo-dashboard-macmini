import React, { useState } from "react";
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
} from "lucide-react";

export default function Labels() {
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
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

  const stats = {
    total: labels.length,
    lowStock: labels.filter((l) => l.current_quantity <= l.reorder_point && l.current_quantity > 0).length,
    outOfStock: labels.filter((l) => l.current_quantity === 0).length,
    totalValue: labels.reduce((sum, l) => sum + (l.current_quantity * (l.cost_per_unit || 0)), 0),
  };

  const handleSave = (formData) => {
    if (editingLabel) {
      updateMutation.mutate({ id: editingLabel.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getStockStatus = (label) => {
    if (label.current_quantity === 0) return { variant: "red", text: "Out of Stock" };
    if (label.current_quantity <= label.reorder_point) return { variant: "amber", text: "Low Stock" };
    return { variant: "green", text: "In Stock" };
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
        <Button onClick={() => { setEditingLabel(null); setShowDialog(true); }} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" /> Add Label
        </Button>
      </div>

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
                <TableHead className="text-zinc-400">Label</TableHead>
                <TableHead className="text-zinc-400">Product</TableHead>
                <TableHead className="text-zinc-400">Quantity</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Bin Location</TableHead>
                <TableHead className="text-zinc-400">Supplier</TableHead>
                <TableHead className="text-zinc-400">Lead Time</TableHead>
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
                filteredLabels.map((label) => {
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
        recipes={recipes}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
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
            <Select value={formData.product_sku} onValueChange={handleProductChange}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                {recipes.map((recipe) => (
                  <SelectItem key={recipe.sku} value={recipe.sku}>
                    {recipe.name} ({recipe.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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