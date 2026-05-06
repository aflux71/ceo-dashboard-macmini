import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, X, Package, CheckCircle2, ClipboardList, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ProductionRequest() {
  const [search, setSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const queryClient = useQueryClient();

  const { data: recipes = [] } = useQuery({
    queryKey: ["prod_req_recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: inventoryItems = [], isLoading: loadingInv } = useQuery({
    queryKey: ["prod_req_inventory"],
    queryFn: () => base44.entities.Inventory.filter({ type: "finished_product" }),
  });

  const { data: demandSummaries = [], isLoading: loadingDemand } = useQuery({
    queryKey: ["prod_req_demand"],
    queryFn: () => base44.entities.DemandSummary.list(),
  });

  const { data: forecastSuggestions = [], isLoading: loadingForecast } = useQuery({
    queryKey: ["prod_req_forecast"],
    queryFn: () => base44.entities.ForecastSuggestion.list(),
  });

  const isLoading = loadingInv || loadingDemand || loadingForecast;

  // Build a unified product map keyed by lowercase SKU
  const allProducts = useMemo(() => {
    const map = new Map();

    const upsert = (sku, patch) => {
      if (!sku) return;
      const key = sku.toLowerCase();
      if (!map.has(key)) map.set(key, { sku, name: "", onHand: null, unit: "", active: true, sources: new Set() });
      const entry = map.get(key);
      if (patch.name && !entry.name) entry.name = patch.name;
      if (patch.onHand != null) entry.onHand = patch.onHand;
      if (patch.unit && !entry.unit) entry.unit = patch.unit;
      if (patch.active != null) entry.active = patch.active;
      if (patch.source) entry.sources.add(patch.source);
    };

    // 1. Recipes (active flag comes from here)
    recipes.forEach((r) => {
      upsert(r.sku, { name: r.name, active: r.active !== false, source: "Recipe" });
    });

    // 2. Finished product inventory
    inventoryItems.forEach((item) => {
      upsert(item.sku, { name: item.name, onHand: item.quantity, unit: item.unit, source: "Inventory" });
    });

    // 3. Demand summaries
    demandSummaries.forEach((ds) => {
      upsert(ds.sku, { name: ds.product, source: "Demand" });
    });

    // 4. Forecast suggestions
    forecastSuggestions.forEach((fs) => {
      upsert(fs.sku, { name: fs.product_name, source: "Forecast" });
    });

    return Array.from(map.values()).map((p) => ({
      ...p,
      sources: Array.from(p.sources),
      // Use SKU as id for dedup key since these are virtual merged entries
      id: p.sku,
    }));
  }, [recipes, inventoryItems, demandSummaries, forecastSuggestions]);

  const selectedIds = useMemo(() => new Set(selectedItems.map((i) => i.id)), [selectedItems]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allProducts;
    const q = search.toLowerCase();
    return allProducts.filter(
      (item) =>
        item.name?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q)
    );
  }, [allProducts, search]);

  const handleSelect = (item) => {
    if (!selectedIds.has(item.id)) {
      setSelectedItems((prev) => [...prev, { ...item, quantity_needed: "" }]);
    }
    setSearch("");
    setShowDropdown(false);
  };

  const handleRemove = (id) => {
    setSelectedItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleQtyChange = (id, value) => {
    setSelectedItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity_needed: value } : i)));
  };

  const canSubmit = selectedItems.length > 0 && selectedItems.every((i) => Number(i.quantity_needed) > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await Promise.all(
        selectedItems.map((item) =>
          base44.entities.ProductionRequest.create({
            sku: item.sku,
            product_name: item.name || item.sku,
            quantity_needed: Number(item.quantity_needed),
            status: "pending",
            urgency: "medium",
            source: "manual",
            requested_by: "Production Request",
          })
        )
      );
      setSelectedItems([]);
      setSubmitSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["production_requests"] });
      setTimeout(() => setSubmitSuccess(false), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const sourceColors = {
    Recipe: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Inventory: "bg-green-500/10 text-green-400 border-green-500/20",
    Demand: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    Forecast: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <ClipboardList className="w-6 h-6 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Production Request</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Search across all products — inventory, demand planner, forecast, and recipes
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xl" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setShowDropdown(false); }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            className="pl-10 h-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 text-sm"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setShowDropdown(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && search.trim() && (
          <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-zinc-500">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-zinc-500">No products found.</div>
            ) : (
              filtered.slice(0, 50).map((item) => {
                const alreadySelected = selectedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => !alreadySelected && handleSelect(item)}
                    disabled={alreadySelected}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-zinc-700/50 last:border-0 transition-colors ${
                      alreadySelected ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-700"
                    }`}
                  >
                    <Package className="w-4 h-4 text-zinc-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{item.name || item.sku}</p>
                      <p className="text-xs text-zinc-500 font-mono">{item.sku}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.sources.map((src) => (
                        <span key={src} className={`text-[10px] px-1.5 py-0.5 rounded border ${sourceColors[src] || "bg-zinc-700 text-zinc-400 border-zinc-600"}`}>
                          {src}
                        </span>
                      ))}
                      {item.onHand != null && (
                        <span className="text-xs text-zinc-400 ml-1">{item.onHand} {item.unit}</span>
                      )}
                    </div>
                    {alreadySelected && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Success banner */}
      {submitSuccess && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          Production requests submitted successfully.
        </div>
      )}

      {/* Selected Items */}
      {selectedItems.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Selected Products ({selectedItems.length})
            </h2>
            <button onClick={() => setSelectedItems([])} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">
              Clear all
            </button>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {selectedItems.map((item, i) => (
              <div
                key={item.id}
                className={`flex items-center gap-4 px-4 py-3 ${i < selectedItems.length - 1 ? "border-b border-zinc-800/50" : ""}`}
              >
                <div className="p-1.5 rounded-md bg-orange-500/10">
                  <Package className="w-4 h-4 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{item.name || item.sku}</p>
                  <p className="text-xs text-zinc-500 font-mono">{item.sku}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.sources.map((src) => (
                    <span key={src} className={`text-[10px] px-1.5 py-0.5 rounded border ${sourceColors[src] || "bg-zinc-700 text-zinc-400 border-zinc-600"}`}>
                      {src}
                    </span>
                  ))}
                </div>
                {item.onHand != null && (
                  <span className="text-xs text-zinc-500 shrink-0">On hand: {item.onHand} {item.unit}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={item.quantity_needed}
                    onChange={(e) => handleQtyChange(item.id, e.target.value)}
                    className="w-24 h-8 bg-zinc-800 border-zinc-700 text-zinc-100 text-sm"
                  />
                  {item.unit && <span className="text-xs text-zinc-500">{item.unit}</span>}
                </div>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {!canSubmit && (
              <span className="text-xs text-zinc-500">Enter a quantity for each product to submit.</span>
            )}
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              {submitting ? "Submitting..." : `Submit Request${selectedItems.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-700">
          <ClipboardList className="w-10 h-10 mb-3" />
          <p className="text-sm">Search and select products above to build your request</p>
        </div>
      )}
    </div>
  );
}