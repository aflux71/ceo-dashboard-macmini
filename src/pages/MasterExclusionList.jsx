import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import Badge from "@/components/ui/Badge";
import { Ban, Plus, Search, Trash2, Pencil, Globe, Filter } from "lucide-react";

const SCOPE_LABEL = {
  all: "Hide everywhere",
  demand_planner: "Hide from Demand Planner only",
};

export default function MasterExclusionList() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all_scopes");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    sku: "",
    product_name: "",
    scope: "demand_planner",
    reason: "",
  });

  const { data: exclusions = [], isLoading } = useQuery({
    queryKey: ["master_exclusions"],
    queryFn: () => base44.entities.MasterExclusion.list("-created_date"),
  });

  // Pull summaries for SKU lookup convenience
  const { data: summaries = [] } = useQuery({
    queryKey: ["demand_summaries_for_exclusion"],
    queryFn: () => base44.entities.DemandSummary.list("-updated_date", 1000),
  });

  // Also pull inventory so SKUs without sales (e.g. service items) are searchable
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ["inventory_for_exclusion"],
    queryFn: () => base44.entities.Inventory.list("-updated_date", 1000),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const me = await base44.auth.me().catch(() => null);
      return base44.entities.MasterExclusion.create({
        ...data,
        added_by: me?.full_name || me?.email || "unknown",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master_exclusions"] });
      toast.success("SKU excluded");
      closeDialog();
    },
    onError: (err) => toast.error(err.message || "Failed to add exclusion"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MasterExclusion.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master_exclusions"] });
      toast.success("Exclusion updated");
      closeDialog();
    },
    onError: (err) => toast.error(err.message || "Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MasterExclusion.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master_exclusions"] });
      toast.success("Exclusion removed");
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exclusions.filter((e) => {
      if (scopeFilter !== "all_scopes" && e.scope !== scopeFilter) return false;
      if (!q) return true;
      return (
        e.sku?.toLowerCase().includes(q) ||
        e.product_name?.toLowerCase().includes(q) ||
        e.reason?.toLowerCase().includes(q)
      );
    });
  }, [exclusions, search, scopeFilter]);

  const stats = useMemo(() => {
    return {
      total: exclusions.length,
      all: exclusions.filter((e) => e.scope === "all").length,
      demandOnly: exclusions.filter((e) => e.scope === "demand_planner").length,
    };
  }, [exclusions]);

  // SKU autocomplete suggestions — merge DemandSummary + Inventory so service items show too
  const skuSuggestions = useMemo(() => {
    if (!form.sku || form.sku.length < 2) return [];
    const q = form.sku.toLowerCase();
    const excludedSkus = new Set(exclusions.map((e) => e.sku));

    const merged = new Map();
    for (const s of summaries) {
      if (!s.sku) continue;
      merged.set(s.sku, { sku: s.sku, product: s.product || "", source: "Demand" });
    }
    for (const inv of inventoryItems) {
      if (!inv.sku || merged.has(inv.sku)) continue;
      merged.set(inv.sku, { sku: inv.sku, product: inv.name || "", source: "Inventory" });
    }

    return Array.from(merged.values())
      .filter(
        (s) =>
          (s.sku?.toLowerCase().includes(q) ||
            s.product?.toLowerCase().includes(q)) &&
          !excludedSkus.has(s.sku)
      )
      .slice(0, 8);
  }, [form.sku, summaries, inventoryItems, exclusions]);

  const openAdd = () => {
    setEditing(null);
    setForm({ sku: "", product_name: "", scope: "demand_planner", reason: "" });
    setShowDialog(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      sku: item.sku || "",
      product_name: item.product_name || "",
      scope: item.scope || "demand_planner",
      reason: item.reason || "",
    });
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditing(null);
  };

  const handleSave = () => {
    if (!form.sku.trim()) {
      toast.error("SKU is required");
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      // Prevent duplicates
      if (exclusions.some((e) => e.sku === form.sku.trim())) {
        toast.error("This SKU is already excluded");
        return;
      }
      createMutation.mutate({ ...form, sku: form.sku.trim() });
    }
  };

  const handleDelete = (item) => {
    if (confirm(`Remove ${item.sku} from exclusion list?`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const toggleScope = (item) => {
    const newScope = item.scope === "all" ? "demand_planner" : "all";
    updateMutation.mutate({ id: item.id, data: { scope: newScope } });
  };

  const pickSuggestion = (s) => {
    setForm((f) => ({ ...f, sku: s.sku, product_name: s.product || f.product_name }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Ban className="w-6 h-6 text-orange-400" />
            Master Exclusion List
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Centrally manage SKUs hidden from the program or from the Demand Planner.
          </p>
        </div>
        <Button onClick={openAdd} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />
          Add Exclusion
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500 uppercase">Total Excluded</p>
            <p className="text-2xl font-bold text-zinc-100 mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500 uppercase flex items-center gap-1">
              <Globe className="w-3 h-3" /> Hidden everywhere
            </p>
            <p className="text-2xl font-bold text-red-400 mt-1">{stats.all}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500 uppercase">Demand Planner only</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{stats.demandOnly}</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Excluded SKUs ({filtered.length})</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  placeholder="Search SKU or product..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 w-64 bg-zinc-800 border-zinc-700"
                />
              </div>
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="h-9 w-48 bg-zinc-800 border-zinc-700">
                  <Filter className="w-3.5 h-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_scopes">All scopes</SelectItem>
                  <SelectItem value="all">Hidden everywhere</SelectItem>
                  <SelectItem value="demand_planner">Demand Planner only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-zinc-500 text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">
              {exclusions.length === 0
                ? "No exclusions yet. Click 'Add Exclusion' to start."
                : "No SKUs match your filters."}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-zinc-800/40 border-zinc-800"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="font-mono text-xs text-zinc-500 w-24 shrink-0">
                      {item.sku}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">
                        {item.product_name || <span className="italic text-zinc-500">No name</span>}
                      </p>
                      {item.reason && (
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{item.reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleScope(item)}
                      title="Click to toggle scope"
                      className="cursor-pointer"
                    >
                      <Badge variant={item.scope === "all" ? "red" : "amber"}>
                        {item.scope === "all" ? (
                          <><Globe className="w-3 h-3 mr-1 inline" /> Everywhere</>
                        ) : (
                          "Demand Planner"
                        )}
                      </Badge>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Exclusion" : "Add Exclusion"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 relative">
              <Label>SKU *</Label>
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="Enter SKU or search by name"
                className="bg-zinc-800 border-zinc-700"
                disabled={!!editing}
              />
              {!editing && skuSuggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg max-h-48 overflow-y-auto shadow-lg">
                  {skuSuggestions.map((s) => (
                    <button
                      key={s.sku}
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-xs flex items-center justify-between border-b border-zinc-700/50 last:border-b-0"
                    >
                      <span className="font-mono text-zinc-400">{s.sku}</span>
                      <span className="text-zinc-300 ml-2 truncate flex-1">{s.product}</span>
                      <span className="text-[10px] text-zinc-500 ml-2 shrink-0">{s.source}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                placeholder="Optional, for reference"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Scope *</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => setForm({ ...form, scope: v })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demand_planner">{SCOPE_LABEL.demand_planner}</SelectItem>
                  <SelectItem value="all">{SCOPE_LABEL.all}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                {form.scope === "all"
                  ? "This SKU will be hidden from inventory, recipes, planning, and demand views."
                  : "This SKU will only be hidden from the Demand Planner and Inventory Requirements."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Discontinued, custom-only, sample SKU"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {editing ? "Save Changes" : "Add Exclusion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}