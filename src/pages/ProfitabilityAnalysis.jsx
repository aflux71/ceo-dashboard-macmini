import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, DollarSign, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

import ProfitabilityFilters from "@/components/profitability/ProfitabilityFilters";
import ProfitabilityStats from "@/components/profitability/ProfitabilityStats";
import ProfitabilityTable from "@/components/profitability/ProfitabilityTable";
import SKUCostBreakdown from "@/components/profitability/SKUCostBreakdown";
import EditCostsDialog from "@/components/profitability/EditCostsDialog";
import {
  buildInventoryByKey,
  computeProfitabilityRow,
} from "@/components/profitability/profitabilityEngine";

export default function ProfitabilityAnalysis() {
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [overheads, setOverheads] = useState([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("margin_asc");

  const [selectedRow, setSelectedRow] = useState(null);
  const [editRow, setEditRow] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recipesData, inventoryData, overheadData] = await Promise.all([
        base44.entities.Recipe.filter({ active: true }),
        base44.entities.Inventory.list("-updated_date", 2000),
        base44.entities.OverheadCost.list("-updated_date", 2000).catch(() => []),
      ]);
      setRecipes(recipesData || []);
      setInventory(inventoryData || []);
      setOverheads(overheadData || []);
    } catch (err) {
      console.error("Failed to load profitability data:", err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const rows = useMemo(() => {
    if (loading) return [];
    const inventoryByKey = buildInventoryByKey(inventory);
    const finishedBySku = new Map(
      inventory.filter(i => i.type === "finished_product").map(i => [i.sku?.toLowerCase().trim(), i])
    );
    const overheadBySku = new Map(
      (overheads || []).map(o => [o.recipe_sku?.toLowerCase().trim(), o])
    );

    return recipes
      .map(recipe => {
        const skuKey = recipe.sku?.toLowerCase().trim();
        const finishedProduct = finishedBySku.get(skuKey);
        const overhead = overheadBySku.get(skuKey);
        const row = computeProfitabilityRow({ recipe, finishedProduct, overhead, inventoryByKey });
        if (!row) return null;
        // Stash raw refs for the edit dialog (non-enumerable prefix for clarity)
        row._recipe = recipe;
        row._finishedProduct = finishedProduct;
        row._overhead = overhead;
        return row;
      })
      .filter(Boolean);
  }, [recipes, inventory, overheads, loading]);

  const categories = useMemo(() => {
    const set = new Set(rows.map(r => r.category).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.sku?.toLowerCase().includes(q) ||
        r.name?.toLowerCase().includes(q)
      );
    }
    if (category !== "all") list = list.filter(r => r.category === category);
    if (status === "below") list = list.filter(r => r.retail.below_target || r.wholesale.below_target);
    if (status === "on_target") list = list.filter(r => r.target_margin_pct != null && !r.retail.below_target && !r.wholesale.below_target && r.has_price);
    if (status === "no_target") list = list.filter(r => r.target_margin_pct == null && r.has_price);
    if (status === "no_price") list = list.filter(r => !r.has_price);
    if (status === "has_gaps") list = list.filter(r => r.data_gaps.length > 0);

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "margin_asc": return (a.retail.margin_pct ?? Infinity) - (b.retail.margin_pct ?? Infinity);
        case "margin_desc": return (b.retail.margin_pct ?? -Infinity) - (a.retail.margin_pct ?? -Infinity);
        case "wsmargin_asc": return (a.wholesale.margin_pct ?? Infinity) - (b.wholesale.margin_pct ?? Infinity);
        case "cost_desc": return (b.costs.total ?? 0) - (a.costs.total ?? 0);
        case "name": return (a.name || "").localeCompare(b.name || "");
        default: return 0;
      }
    });
    return sorted;
  }, [rows, search, category, status, sortBy]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Profitability Analysis</h1>
            <p className="text-sm text-zinc-500">Real-time gross margins per SKU · retail vs wholesale · dead net cost</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={loadData}
          disabled={loading}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading recipes, inventory, and overhead data…
        </div>
      ) : (
        <>
          <ProfitabilityStats rows={rows} />

          <ProfitabilityFilters
            search={search} onSearch={setSearch}
            category={category} onCategory={setCategory} categories={categories}
            status={status} onStatus={setStatus}
            sortBy={sortBy} onSortBy={setSortBy}
          />

          <div className="text-xs text-zinc-500">
            Showing <span className="text-zinc-300">{filteredRows.length}</span> of <span className="text-zinc-300">{rows.length}</span> products with recipes.
          </div>

          <ProfitabilityTable
            rows={filteredRows}
            onSelect={(r) => setSelectedRow(r)}
            onEditCosts={(r) => setEditRow(r)}
          />
        </>
      )}

      <SKUCostBreakdown
        row={selectedRow}
        open={!!selectedRow}
        onClose={() => setSelectedRow(null)}
      />
      <EditCostsDialog
        row={editRow}
        open={!!editRow}
        onClose={() => setEditRow(null)}
        onSaved={loadData}
      />
    </div>
  );
}