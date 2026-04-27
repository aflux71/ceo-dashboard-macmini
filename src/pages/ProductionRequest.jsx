import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, X, Package, CheckCircle2, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ProductionRequest() {
  const [search, setSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch all recipes to know which SKUs are "active"
  const { data: recipes = [] } = useQuery({
    queryKey: ["prod_req_recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  // Fetch finished product inventory
  const { data: inventoryItems = [], isLoading } = useQuery({
    queryKey: ["prod_req_inventory"],
    queryFn: () => base44.entities.Inventory.filter({ type: "finished_product" }),
  });

  // Active SKUs = recipes where active !== false
  const activeSkus = useMemo(
    () => new Set(recipes.filter((r) => r.active !== false).map((r) => r.sku?.toLowerCase())),
    [recipes]
  );

  // Active inventory items = inventory items whose SKU has an active recipe
  const activeInventory = useMemo(
    () => inventoryItems.filter((item) => activeSkus.has(item.sku?.toLowerCase())),
    [inventoryItems, activeSkus]
  );

  const selectedIds = useMemo(() => new Set(selectedItems.map((i) => i.id)), [selectedItems]);

  const filtered = useMemo(() => {
    if (!search.trim()) return activeInventory;
    const q = search.toLowerCase();
    return activeInventory.filter(
      (item) =>
        item.name?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.supplier_sku?.toLowerCase().includes(q) ||
        item.location?.toLowerCase().includes(q) ||
        item.material_type?.toLowerCase().includes(q)
    );
  }, [activeInventory, search]);

  const handleSelect = (item) => {
    if (!selectedIds.has(item.id)) {
      setSelectedItems((prev) => [...prev, item]);
    }
    setSearch("");
    setShowDropdown(false);
  };

  const handleRemove = (id) => {
    setSelectedItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <ClipboardList className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Production Request</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              Search and select active products to include in a production request
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Search by name, SKU, supplier SKU, location..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
            }}
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
          <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-zinc-500">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-zinc-500">No active products found.</div>
            ) : (
              filtered.map((item) => {
                const alreadySelected = selectedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => !alreadySelected && handleSelect(item)}
                    disabled={alreadySelected}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-zinc-700/50 last:border-0 transition-colors ${
                      alreadySelected
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-zinc-700"
                    }`}
                  >
                    <Package className="w-4 h-4 text-zinc-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{item.name}</p>
                      <p className="text-xs text-zinc-500 font-mono">{item.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-zinc-400">{item.quantity ?? 0} {item.unit}</p>
                      {item.location && (
                        <p className="text-xs text-zinc-600">{item.location}</p>
                      )}
                    </div>
                    {alreadySelected && (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Selected Items List */}
      {selectedItems.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Selected Products ({selectedItems.length})
            </h2>
            <button
              onClick={() => setSelectedItems([])}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {selectedItems.map((item, i) => (
              <div
                key={item.id}
                className={`flex items-center gap-4 px-4 py-3 ${
                  i < selectedItems.length - 1 ? "border-b border-zinc-800/50" : ""
                }`}
              >
                <div className="p-1.5 rounded-md bg-orange-500/10">
                  <Package className="w-4 h-4 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{item.name}</p>
                  <p className="text-xs text-zinc-500 font-mono">{item.sku}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-zinc-300">{item.quantity ?? 0}</p>
                  <p className="text-xs text-zinc-600">{item.unit}</p>
                </div>
                {item.location && (
                  <span className="text-xs text-zinc-600 shrink-0 hidden sm:block">{item.location}</span>
                )}
                <button
                  onClick={() => handleRemove(item.id)}
                  className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
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