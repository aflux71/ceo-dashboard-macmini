// DEMAND PLANNER INTEGRATION (implement when ready):
// After loading DemandSummary records in DemandPlanner.jsx,
// fetch all SKUAlias records where status = 'approved'.
// Build a Set of alias_sku values from those records.
// Before rendering the Full Plan table, filter out any DemandSummary
// row whose SKU exists in the alias Set.
// This suppresses duplicate rows without deleting any underlying data.
// The SKUAlias entity is the permanent registry — add to it over time
// as products get new barcodes, UPCs, or supplier codes assigned.

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Plus, Search, Loader2, GitMerge, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AliasTable from "@/components/sku-dedup/AliasTable";
import AddAliasModal from "@/components/sku-dedup/AddAliasModal";

export default function SKUDeduplication() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [user, setUser] = useState(null);

  React.useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: aliases = [], isLoading } = useQuery({
    queryKey: ["sku_aliases"],
    queryFn: () => base44.entities.SKUAlias.list("-created_date", 500),
  });

  const { data: demandSummaries = [] } = useQuery({
    queryKey: ["demand_summaries_skumap"],
    queryFn: () => base44.entities.DemandSummary.list("-created_date", 2000),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes_skudedup"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const skuNames = useMemo(() => {
    const map = {};
    demandSummaries.forEach((s) => { if (s.sku) map[s.sku] = s.product; });
    return map;
  }, [demandSummaries]);

  const filtered = useMemo(() => {
    let items = aliases;
    if (statusFilter !== "all") items = items.filter((a) => a.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter((a) =>
        a.primary_sku?.toLowerCase().includes(q) ||
        a.alias_sku?.toLowerCase().includes(q) ||
        a.product_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [aliases, statusFilter, searchQuery]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SKUAlias.create({ ...data, status: "pending_review" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sku_aliases"] });
      toast.success("Alias pair added for review");
      setAddModalOpen(false);
      setPrefill(null);
    },
    onError: (err) => toast.error(`Failed: ${err?.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SKUAlias.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sku_aliases"] }),
    onError: (err) => toast.error(`Failed: ${err?.message}`),
  });

  const handleAddSubmit = (form) => {
    const exists = aliases.some((a) => a.alias_sku === form.alias_sku.trim() && a.status !== "rejected");
    if (exists) {
      toast.error("This alias SKU already exists in the table.");
      return;
    }
    createMutation.mutate({
      primary_sku: form.primary_sku.trim(),
      alias_sku: form.alias_sku.trim(),
      product_name: form.product_name.trim(),
      reason: form.reason.trim() || undefined,
    });
  };

  const handleApprove = (record) => {
    updateMutation.mutate(
      { id: record.id, data: { status: "approved", reviewed_by: user?.full_name || user?.email || "Unknown", reviewed_at: new Date().toISOString() } },
      {
        onSuccess: async () => {
          toast.success(`Approved: ${record.alias_sku} → ${record.primary_sku}`);
          // Auto-merge underlying Inventory records (if both exist)
          try {
            const [keeperItems, removedItems] = await Promise.all([
              base44.entities.Inventory.filter({ sku: record.primary_sku }),
              base44.entities.Inventory.filter({ sku: record.alias_sku }),
            ]);
            const keeper = keeperItems?.[0];
            const removed = removedItems?.[0];
            if (!keeper && !removed) return; // nothing to merge
            if (!keeper || !removed) {
              toast(`Alias approved. Only one inventory record exists (${keeper?.sku || removed?.sku}) — nothing to merge.`, { icon: "ℹ️" });
              return;
            }
            if (keeper.id === removed.id) return;
            const res = await base44.functions.invoke("mergeTwoInventoryItems", {
              keep_id: keeper.id,
              remove_id: removed.id,
            });
            if (res?.data?.success) {
              toast.success(`Inventory merged: ${record.alias_sku} → ${record.primary_sku} (qty ${res.data.merged_quantity})`);
              queryClient.invalidateQueries({ queryKey: ["inventory"] });
            } else {
              toast.error(`Inventory merge failed: ${res?.data?.error || "Unknown error"}`);
            }
          } catch (err) {
            console.error("Inventory auto-merge failed:", err);
            toast.error(`Inventory auto-merge failed: ${err?.message || "Unknown error"}`);
          }
        },
      }
    );
  };

  const handleReject = (record) => {
    updateMutation.mutate(
      { id: record.id, data: { status: "rejected", reviewed_by: user?.full_name || user?.email || "Unknown", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => toast("Rejected alias pair", { icon: "✕" }) }
    );
  };

  const handleAutoDetect = async () => {
    setDetecting(true);
    const summaries = await base44.entities.DemandSummary.list("-created_date", 2000);
    const existingAliasSkus = new Set(aliases.map(a => a.alias_sku));
    const approvedAliases = new Set(aliases.filter(a => a.status === "approved").map(a => a.alias_sku));
    const groups = {};
    summaries.forEach((s) => {
      const key = (s.product || "").trim().toLowerCase();
      if (!key) return;
      if (!groups[key]) groups[key] = { product_name: s.product, skus: new Set() };
      if (s.sku) groups[key].skus.add(s.sku);
    });
    const dupes = Object.values(groups)
      .filter((g) => g.skus.size >= 2)
      .map((g) => ({ product_name: g.product_name, skus: [...g.skus].filter(sku => !approvedAliases.has(sku)) }))
      .filter((g) => g.skus.length >= 2);

    let created = 0;
    for (const group of dupes) {
      const [primary, ...rest] = group.skus;
      for (const alias of rest) {
        if (!existingAliasSkus.has(alias)) {
          await base44.entities.SKUAlias.create({
            primary_sku: primary,
            alias_sku: alias,
            product_name: group.product_name,
            reason: "Auto-detected duplicate",
            status: "pending_review",
          });
          created++;
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: ["sku_aliases"] });
    setDetecting(false);
    if (created > 0) toast.success(`Added ${created} duplicate pair${created > 1 ? "s" : ""} for review`);
    else toast("No new duplicates detected", { icon: "ℹ️" });
  };

  const counts = useMemo(() => ({
    total: aliases.length,
    pending: aliases.filter((a) => a.status === "pending_review").length,
    approved: aliases.filter((a) => a.status === "approved").length,
    rejected: aliases.filter((a) => a.status === "rejected").length,
  }), [aliases]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <GitMerge className="w-6 h-6 text-orange-400" />
            SKU Deduplication Manager
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Review and approve SKU aliases to suppress duplicate rows in the Demand Planner</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={handleAutoDetect} disabled={detecting} className="border-zinc-700 text-zinc-300 hover:text-zinc-100">
            {detecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Auto-Detect Duplicates
          </Button>
          <Button onClick={() => { setPrefill(null); setAddModalOpen(true); }} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Add Alias Pair
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Aliases", value: counts.total, color: "text-zinc-200" },
          { label: "Pending Review", value: counts.pending, color: "text-amber-400" },
          { label: "Approved", value: counts.approved, color: "text-green-400" },
          { label: "Rejected", value: counts.rejected, color: "text-red-400" },
        ].map((s) => (
          <Card key={s.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by SKU or product name..."
            className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["sku_aliases"] })}
          className="border-zinc-700 text-zinc-400 hover:text-zinc-100 h-9 w-9"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </CardContent>
        </Card>
      ) : (
        <AliasTable
          records={filtered}
          skuNames={skuNames}
          onApprove={handleApprove}
          onReject={handleReject}
          isUpdating={updateMutation.isPending}
          recipes={recipes}
          onRecipeLinked={() => queryClient.invalidateQueries({ queryKey: ["recipes_skudedup"] })}
        />
      )}

      {/* Modals */}
      <AddAliasModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSubmit={handleAddSubmit}
        isPending={createMutation.isPending}
        prefill={prefill}
      />
    </div>
  );
}