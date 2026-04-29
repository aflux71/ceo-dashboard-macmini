import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown,
  CheckCircle2, XCircle, Package, ChevronDown,
  LayoutGrid, List
} from "lucide-react";
import { Input } from "@/components/ui/input";

const SORT_OPTIONS = [
  { key: "name_asc", label: "Name A→Z", field: "name", dir: "asc" },
  { key: "name_desc", label: "Name Z→A", field: "name", dir: "desc" },
  { key: "sku_asc", label: "SKU A→Z", field: "sku", dir: "asc" },
  { key: "sku_desc", label: "SKU Z→A", field: "sku", dir: "desc" },
  { key: "status_active", label: "Active First", field: "active", dir: "desc" },
  { key: "status_inactive", label: "Inactive First", field: "active", dir: "asc" },
  { key: "source_asc", label: "Source A→Z", field: "source", dir: "asc" },
];

export default function InventoryActNot() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name_asc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [viewMode, setViewMode] = useState("cards");

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ["inv_act_inventory"],
    queryFn: () => base44.entities.Inventory.filter({ type: "finished_product" }),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["inv_act_recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: demandSummaries = [] } = useQuery({
    queryKey: ["inv_act_demand_summaries"],
    queryFn: () => base44.entities.DemandSummary.list(),
  });

  const updateRecipeMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.Recipe.update(id, { active }),
    onSuccess: (_, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["inv_act_recipes"] });
      toast.success(`Product marked ${active ? "Active" : "Inactive"}`);
    },
    onError: () => toast.error("Failed to update status"),
  });

  const updateInventoryMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.Inventory.update(id, { active }),
    onSuccess: (_, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["inv_act_inventory"] });
      toast.success(`Product marked ${active ? "Active" : "Inactive"}`);
    },
    onError: () => toast.error("Failed to update status"),
  });

  const products = useMemo(() => {
    const map = new Map();

    inventoryItems.forEach((item) => {
      const key = item.sku?.toLowerCase();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { sku: item.sku, name: item.name, sources: new Set(), inventoryId: item.id, recipeId: null, active: item.active !== false, qty: item.quantity });
      }
      map.get(key).sources.add("Inventory");
      map.get(key).qty = item.quantity;
      map.get(key).inventoryId = item.id;
    });

    demandSummaries.forEach((ds) => {
      const key = ds.sku?.toLowerCase();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { sku: ds.sku, name: ds.product || ds.sku, sources: new Set(), inventoryId: null, recipeId: null, active: true, qty: null });
      }
      map.get(key).sources.add("Demand");
      if (!map.get(key).name && ds.product) map.get(key).name = ds.product;
    });

    recipes.forEach((r) => {
      if (!r.sku) return;
      const key = r.sku.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { sku: r.sku, name: r.name, sources: new Set(), inventoryId: null, recipeId: r.id, active: r.active !== false, qty: null });
      }
      const entry = map.get(key);
      entry.sources.add("Recipe");
      entry.recipeId = r.id;
      entry.active = r.active !== false;
    });

    return Array.from(map.values()).map((p) => ({ ...p, sources: Array.from(p.sources) }));
  }, [inventoryItems, recipes, demandSummaries]);

  const sortConfig = SORT_OPTIONS.find((s) => s.key === sortKey) || SORT_OPTIONS[0];

  const filtered = useMemo(() => {
    let items = [...products];
    if (statusFilter === "active") items = items.filter((p) => p.active);
    if (statusFilter === "inactive") items = items.filter((p) => !p.active);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      let aVal, bVal;
      if (sortConfig.field === "name") { aVal = a.name?.toLowerCase() || ""; bVal = b.name?.toLowerCase() || ""; }
      else if (sortConfig.field === "sku") { aVal = a.sku?.toLowerCase() || ""; bVal = b.sku?.toLowerCase() || ""; }
      else if (sortConfig.field === "active") { aVal = a.active ? 1 : 0; bVal = b.active ? 1 : 0; }
      else if (sortConfig.field === "source") { aVal = a.sources[0]?.toLowerCase() || ""; bVal = b.sources[0]?.toLowerCase() || ""; }
      if (aVal < bVal) return sortConfig.dir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.dir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [products, search, statusFilter, sortConfig]);

  const counts = useMemo(() => ({
    all: products.length,
    active: products.filter((p) => p.active).length,
    inactive: products.filter((p) => !p.active).length,
  }), [products]);

  const handleToggle = (product) => {
    if (product.recipeId) {
      updateRecipeMutation.mutate({ id: product.recipeId, active: !product.active });
    } else if (product.inventoryId) {
      updateInventoryMutation.mutate({ id: product.inventoryId, active: !product.active });
    } else {
      toast.error("No recipe or inventory record found to update.");
    }
  };

  return (
    <div className="space-y-6" onClick={() => setShowSortMenu(false)}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Package className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Inventory Act/Not</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Manage active/inactive status for all finished products</p>
          </div>
        </div>
      </div>

      {/* Stats + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {[
          { key: "all", label: "All", count: counts.all },
          { key: "active", label: "Active", count: counts.active },
          { key: "inactive", label: "Inactive", count: counts.inactive },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s.key
                ? s.key === "active" ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : s.key === "inactive" ? "bg-zinc-700 text-zinc-300 border border-zinc-600"
                : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
            }`}
          >
            {s.label}
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-white/10">{s.count}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <Input
              placeholder="Search name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-60 h-9 bg-zinc-800 border-zinc-700 text-zinc-100 text-sm"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("cards")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "cards" ? "bg-orange-500/20 text-orange-400" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Card view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-orange-500/20 text-orange-400" : "text-zinc-500 hover:text-zinc-300"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Sort */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors h-9"
            >
              <ArrowUpDown className="w-4 h-4" />
              {sortConfig.label}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSortMenu ? "rotate-180" : ""}`} />
            </button>
            {showSortMenu && (
              <div className="absolute z-50 top-full mt-1 right-0 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                      sortKey === opt.key ? "bg-orange-500/10 text-orange-400" : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {opt.dir === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Products */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
          <Package className="w-12 h-12 mb-3" />
          <p className="text-sm">No products found</p>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((product) => (
            <div
              key={product.sku}
              className={`bg-zinc-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
                product.active ? "border-zinc-800 hover:border-zinc-700" : "border-zinc-800/50 opacity-60"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug ${product.active ? "text-zinc-100" : "text-zinc-400 line-through"}`}>
                  {product.name || product.sku}
                </p>
                <p className="text-xs text-zinc-600 font-mono mt-1">{product.sku}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {product.sources.map((src) => (
                    <span key={src} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                      {src}
                    </span>
                  ))}
                  {product.qty != null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                      {product.qty} on hand
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleToggle(product)}
                title={product.active ? "Click to mark Inactive" : "Click to mark Active"}
                className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  product.active
                    ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                    : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-green-500/10 hover:border-green-500/20 hover:text-green-400"
                }`}
              >
                {product.active ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Active</>
                ) : (
                  <><XCircle className="w-3.5 h-3.5" /> Inactive</>
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-2.5 border-b border-zinc-800 bg-zinc-800/50">
            <span>Product</span>
            <span className="px-3">SKU</span>
            <span className="px-3">Sources</span>
            <span className="px-3 text-right">Status</span>
          </div>
          {filtered.map((product, i) => (
            <div
              key={product.sku}
              className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-0 px-4 py-3 transition-colors ${
                i < filtered.length - 1 ? "border-b border-zinc-800/50" : ""
              } ${product.active ? "hover:bg-zinc-800/30" : "opacity-50 hover:bg-zinc-800/20"}`}
            >
              <span className={`text-sm font-medium truncate ${product.active ? "text-zinc-100" : "text-zinc-400 line-through"}`}>
                {product.name || product.sku}
              </span>
              <span className="px-3 text-xs text-zinc-500 font-mono whitespace-nowrap">{product.sku}</span>
              <div className="px-3 flex gap-1">
                {product.sources.map((src) => (
                  <span key={src} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700 whitespace-nowrap">
                    {src}
                  </span>
                ))}
                {product.qty != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700 whitespace-nowrap">
                    {product.qty} on hand
                  </span>
                )}
              </div>
              <div className="px-3 flex justify-end">
                <button
                  onClick={() => handleToggle(product)}
                  title={product.active ? "Click to mark Inactive" : "Click to mark Active"}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                    product.active
                      ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-green-500/10 hover:border-green-500/20 hover:text-green-400"
                  }`}
                >
                  {product.active ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Active</>
                  ) : (
                    <><XCircle className="w-3.5 h-3.5" /> Inactive</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}