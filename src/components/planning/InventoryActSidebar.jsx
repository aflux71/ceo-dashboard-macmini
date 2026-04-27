import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  X, Search, ArrowUpDown, ArrowUp, ArrowDown,
  CheckCircle2, XCircle, Package, Layers, ChevronDown
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/Badge";

const SORT_OPTIONS = [
  { key: "name_asc", label: "Name A→Z", field: "name", dir: "asc" },
  { key: "name_desc", label: "Name Z→A", field: "name", dir: "desc" },
  { key: "sku_asc", label: "SKU A→Z", field: "sku", dir: "asc" },
  { key: "sku_desc", label: "SKU Z→A", field: "sku", dir: "desc" },
  { key: "status_active", label: "Active First", field: "active", dir: "desc" },
  { key: "status_inactive", label: "Inactive First", field: "active", dir: "asc" },
  { key: "source_asc", label: "Source A→Z", field: "source", dir: "asc" },
];

export default function InventoryActSidebar({ onClose }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name_asc");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | inactive
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Fetch all sources
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

  // Build a unified product list — deduped by SKU, merging all sources
  const products = useMemo(() => {
    const map = new Map(); // key: sku.toLowerCase()

    // From inventory finished products
    inventoryItems.forEach((item) => {
      const key = item.sku?.toLowerCase();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          sku: item.sku,
          name: item.name,
          sources: new Set(),
          inventoryId: item.id,
          recipeId: null,
          active: true, // inventory items default active
          qty: item.quantity,
        });
      }
      map.get(key).sources.add("Inventory");
      map.get(key).qty = item.quantity;
    });

    // From demand summaries
    demandSummaries.forEach((ds) => {
      const key = ds.sku?.toLowerCase();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          sku: ds.sku,
          name: ds.product || ds.sku,
          sources: new Set(),
          inventoryId: null,
          recipeId: null,
          active: true,
          qty: null,
        });
      }
      map.get(key).sources.add("Demand");
      if (!map.get(key).name && ds.product) map.get(key).name = ds.product;
    });

    // From recipes (finished products) — also carry over the `active` field
    recipes.forEach((r) => {
      if (!r.sku) return;
      const key = r.sku.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          sku: r.sku,
          name: r.name,
          sources: new Set(),
          inventoryId: null,
          recipeId: r.id,
          active: r.active !== false,
          qty: null,
        });
      }
      const entry = map.get(key);
      entry.sources.add("Recipe");
      entry.recipeId = r.id;
      // Recipe's `active` is the source of truth for activation status
      entry.active = r.active !== false;
    });

    return Array.from(map.values()).map((p) => ({
      ...p,
      sources: Array.from(p.sources),
    }));
  }, [inventoryItems, recipes, demandSummaries]);

  const sortConfig = SORT_OPTIONS.find((s) => s.key === sortKey) || SORT_OPTIONS[0];

  const filtered = useMemo(() => {
    let items = [...products];

    // Status filter
    if (statusFilter === "active") items = items.filter((p) => p.active);
    if (statusFilter === "inactive") items = items.filter((p) => !p.active);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
      );
    }

    // Sort
    items.sort((a, b) => {
      let aVal, bVal;
      if (sortConfig.field === "name") {
        aVal = a.name?.toLowerCase() || "";
        bVal = b.name?.toLowerCase() || "";
      } else if (sortConfig.field === "sku") {
        aVal = a.sku?.toLowerCase() || "";
        bVal = b.sku?.toLowerCase() || "";
      } else if (sortConfig.field === "active") {
        aVal = a.active ? 1 : 0;
        bVal = b.active ? 1 : 0;
      } else if (sortConfig.field === "source") {
        aVal = a.sources[0]?.toLowerCase() || "";
        bVal = b.sources[0]?.toLowerCase() || "";
      }
      if (aVal < bVal) return sortConfig.dir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.dir === "asc" ? 1 : -1;
      return 0;
    });

    return items;
  }, [products, search, statusFilter, sortConfig]);

  const handleToggle = (product) => {
    if (!product.recipeId) {
      toast.error("No recipe found for this product — add a recipe first to manage status.");
      return;
    }
    updateRecipeMutation.mutate({ id: product.recipeId, active: !product.active });
  };

  const counts = useMemo(() => ({
    all: products.length,
    active: products.filter((p) => p.active).length,
    inactive: products.filter((p) => !p.active).length,
  }), [products]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800 w-80 min-w-[20rem]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Inventory Act/Not</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{counts.all} products</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stats row */}
      <div className="flex border-b border-zinc-800">
        {[
          { key: "all", label: "All", count: counts.all },
          { key: "active", label: "Active", count: counts.active, color: "text-green-400" },
          { key: "inactive", label: "Inactive", count: counts.inactive, color: "text-zinc-500" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`flex-1 py-2 text-center text-xs font-medium transition-colors border-b-2 ${
              statusFilter === s.key
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className={s.color || ""}>{s.count}</span>
            <br />
            {s.label}
          </button>
        ))}
      </div>

      {/* Search + Sort */}
      <div className="px-3 py-2.5 border-b border-zinc-800 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Search name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-100"
          />
        </div>
        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3 h-3" />
              {sortConfig.label}
            </div>
            <ChevronDown className={`w-3 h-3 transition-transform ${showSortMenu ? "rotate-180" : ""}`} />
          </button>
          {showSortMenu && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                    sortKey === opt.key
                      ? "bg-orange-500/10 text-orange-400"
                      : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {opt.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto" onClick={() => setShowSortMenu(false)}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
            <Package className="w-8 h-8 mb-2" />
            <p className="text-xs">No products found</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {filtered.map((product) => (
              <div
                key={product.sku}
                className={`px-3 py-3 flex items-start justify-between gap-2 hover:bg-zinc-800/40 transition-colors ${
                  !product.active ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${product.active ? "text-zinc-100" : "text-zinc-400 line-through"}`}>
                    {product.name || product.sku}
                  </p>
                  <p className="text-xs text-zinc-600 font-mono mt-0.5">{product.sku}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {product.sources.map((src) => (
                      <span
                        key={src}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700"
                      >
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
                  title={product.active ? "Mark Inactive" : "Mark Active"}
                  className={`mt-0.5 flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                    product.active
                      ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-green-500/10 hover:border-green-500/20 hover:text-green-400"
                  }`}
                >
                  {product.active ? (
                    <><CheckCircle2 className="w-3 h-3" /> Active</>
                  ) : (
                    <><XCircle className="w-3 h-3" /> Inactive</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}