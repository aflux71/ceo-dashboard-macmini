import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Briefcase, Plus, Search, Edit, Trash2, ArrowRight, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";

const STATUS_VARIANTS = {
  draft: "default",
  approved: "blue",
  in_production: "amber",
  complete: "green",
  shipped: "purple",
  cancelled: "red",
};

const STATUS_LABELS = {
  draft: "Draft",
  approved: "Approved",
  in_production: "In Production",
  complete: "Complete",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

const EMPTY_FORM = {
  client_id: "",
  client_name: "",
  po_number: "",
  product_name: "",
  sku: "",
  recipe_sku: "",
  quantity: 0,
  due_date: "",
  status: "draft",
  notes: "",
};

export default function PrivateLabel() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["privateLabelProducts"],
    queryFn: () => base44.entities.PrivateLabelProduct.list("-created_date"),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Supplier.filter({ is_client: true }),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-active"],
    queryFn: () => base44.entities.Recipe.filter({ active: true }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PrivateLabelProduct.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privateLabelProducts"] });
      toast.success("Private label product created");
      closeModal();
    },
    onError: (e) => toast.error(e.message || "Failed to create"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PrivateLabelProduct.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privateLabelProducts"] });
      toast.success("Updated");
      closeModal();
    },
    onError: (e) => toast.error(e.message || "Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PrivateLabelProduct.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privateLabelProducts"] });
      toast.success("Deleted");
    },
  });

  // Push to planner: create a ProductionRequest from the private label product
  const pushToPlannerMutation = useMutation({
    mutationFn: async (product) => {
      const recipe = recipes.find((r) => r.sku === product.recipe_sku);
      const pr = await base44.entities.ProductionRequest.create({
        sku: product.recipe_sku || product.sku,
        product_name: product.product_name,
        quantity_needed: product.quantity,
        status: "approved",
        source: "manual",
        urgency: "soon",
        production_type: recipe?.production_type || "make",
        due_date: product.due_date || undefined,
        reason: `Private label for ${product.client_name}${product.po_number ? ` · PO ${product.po_number}` : ""}`,
        notes: product.notes || undefined,
      });
      await base44.entities.PrivateLabelProduct.update(product.id, {
        status: "in_production",
        production_request_id: pr.id,
      });
      return pr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privateLabelProducts"] });
      toast.success("Pushed to Production Planner");
    },
    onError: (e) => toast.error(e.message || "Failed to push"),
  });

  const openModal = (product = null) => {
    if (product) {
      setEditItem(product);
      setFormData({
        client_id: product.client_id || "",
        client_name: product.client_name || "",
        po_number: product.po_number || "",
        product_name: product.product_name || "",
        sku: product.sku || "",
        recipe_sku: product.recipe_sku || "",
        quantity: product.quantity || 0,
        due_date: product.due_date || "",
        status: product.status || "draft",
        notes: product.notes || "",
      });
    } else {
      setEditItem(null);
      setFormData(EMPTY_FORM);
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditItem(null);
  };

  const handleClientChange = (clientId) => {
    const client = clients.find((c) => c.id === clientId);
    setFormData((prev) => ({
      ...prev,
      client_id: clientId,
      client_name: client?.name || "",
    }));
  };

  const handleRecipeChange = (recipeSku) => {
    const recipe = recipes.find((r) => r.sku === recipeSku);
    setFormData((prev) => ({
      ...prev,
      recipe_sku: recipeSku,
      product_name: prev.product_name || recipe?.name || "",
      sku: prev.sku || recipeSku,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.client_name || !formData.product_name || !formData.quantity) {
      toast.error("Client, product name, and quantity are required");
      return;
    }
    const payload = {
      ...formData,
      quantity: Number(formData.quantity) || 0,
      due_date: formData.due_date || undefined,
    };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !search ||
        p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        p.client_name?.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase()) ||
        p.po_number?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [products, search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Private Label Production</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Manage co-manufacturing orders for external clients
          </p>
        </div>
        <Button onClick={() => openModal()} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="w-4 h-4 mr-2" /> New Order
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search by client, product, SKU, or PO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-44 bg-zinc-800 border-zinc-700 text-zinc-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Quick links */}
      {clients.length === 0 && (
        <div className="bg-purple-950/30 border border-purple-800/30 rounded-lg p-4 text-sm text-purple-300">
          No clients yet. Add a client in <strong>Suppliers</strong> by toggling "Private Label Client" on a new contact.
        </div>
      )}

      {/* List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          <p className="col-span-full text-center text-zinc-500 py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="col-span-full text-center text-zinc-500 py-8">No private label orders found</p>
        ) : (
          filtered.map((p) => (
            <Card key={p.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-zinc-100 truncate">{p.product_name}</h3>
                      <p className="text-sm text-zinc-500 truncate">
                        for <span className="text-zinc-300">{p.client_name}</span>
                        {p.po_number && <span className="text-zinc-500"> · PO {p.po_number}</span>}
                      </p>
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANTS[p.status] || "default"}>
                    {STATUS_LABELS[p.status] || p.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm border-t border-zinc-800 pt-3">
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Quantity</div>
                    <div className="text-orange-400 font-bold">{(p.quantity || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Recipe SKU</div>
                    <div className="font-mono text-zinc-300 truncate">{p.recipe_sku || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Due</div>
                    <div className="text-zinc-300">{p.due_date || "—"}</div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-zinc-800">
                  {(p.status === "draft" || p.status === "approved") && !p.production_request_id && (
                    <Button
                      size="sm"
                      onClick={() => pushToPlannerMutation.mutate(p)}
                      disabled={pushToPlannerMutation.isPending || !p.recipe_sku}
                      className="bg-orange-500 hover:bg-orange-600 text-white flex-1"
                      title={!p.recipe_sku ? "Select a recipe first" : "Create ProductionRequest"}
                    >
                      <ArrowRight className="w-4 h-4 mr-1" /> Push to Planner
                    </Button>
                  )}
                  {p.production_request_id && (
                    <div className="flex items-center gap-1 text-xs text-green-400 flex-1">
                      <Package className="w-3.5 h-3.5" />
                      In planner
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openModal(p)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Delete this private label order?")) {
                        deleteMutation.mutate(p.id);
                      }
                    }}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Order" : "New Private Label Order"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={formData.client_id} onValueChange={handleClientChange}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                  {clients.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-zinc-500">
                      No clients. Add one in Suppliers.
                    </div>
                  ) : (
                    clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>PO Number</Label>
                <Input
                  value={formData.po_number}
                  onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Base Recipe</Label>
              <Select value={formData.recipe_sku} onValueChange={handleRecipeChange}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Select a recipe..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-h-80">
                  {recipes.map((r) => (
                    <SelectItem key={r.id} value={r.sku}>
                      {r.name} <span className="text-zinc-500">({r.sku})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Product Name</Label>
                <Input
                  value={formData.product_name}
                  onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                  required
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="(defaults to recipe SKU)"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                  required
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {editItem ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}