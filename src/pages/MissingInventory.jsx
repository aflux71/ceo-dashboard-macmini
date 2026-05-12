import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Badge from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Search,
  RefreshCw,
  Link2,
  Plus,
  Ban,
  Loader2,
  Package,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

export default function MissingInventory() {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState([]);
  const [totalInventory, setTotalInventory] = useState(0);
  const [totalSummaries, setTotalSummaries] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [actioningSku, setActioningSku] = useState(null);

  // Alias dialog
  const [aliasDialog, setAliasDialog] = useState(null); // { item, primarySku }
  const [inventoryOptions, setInventoryOptions] = useState([]);
  const [aliasSearch, setAliasSearch] = useState("");

  const fetchMissing = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("findMissingInventory", {});
      const data = res.data;
      setMissing(data.missing || []);
      setTotalInventory(data.total_inventory || 0);
      setTotalSummaries(data.total_demand_summaries || 0);
    } catch (err) {
      toast.error("Failed to load: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchInventoryOptions = async () => {
    try {
      const all = [];
      let skip = 0;
      while (true) {
        const batch = await base44.entities.Inventory.filter(
          { type: { $in: ["finished_product", "private_brand"] } },
          "name",
          100,
          skip
        );
        if (!batch || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < 100) break;
        skip += 100;
      }
      setInventoryOptions(all);
    } catch (err) {
      console.error("Failed to load inventory options:", err);
    }
  };

  useEffect(() => {
    fetchMissing();
    fetchInventoryOptions();
  }, []);

  const categories = useMemo(() => {
    const set = new Set(missing.map((m) => m.category || "Other"));
    return ["all", ...Array.from(set).sort()];
  }, [missing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return missing.filter((m) => {
      if (categoryFilter !== "all" && (m.category || "Other") !== categoryFilter) return false;
      if (!q) return true;
      return (
        (m.sku || "").toLowerCase().includes(q) ||
        (m.product || "").toLowerCase().includes(q)
      );
    });
  }, [missing, search, categoryFilter]);

  const filteredAliasOptions = useMemo(() => {
    const q = aliasSearch.trim().toLowerCase();
    if (!q) return inventoryOptions.slice(0, 30);
    return inventoryOptions
      .filter(
        (i) =>
          (i.sku || "").toLowerCase().includes(q) ||
          (i.name || "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [inventoryOptions, aliasSearch]);

  // Actions
  const handleCreateAlias = async (primaryItem) => {
    if (!aliasDialog) return;
    setActioningSku(aliasDialog.item.sku);
    try {
      await base44.entities.SKUAlias.create({
        primary_sku: primaryItem.sku,
        alias_sku: aliasDialog.item.sku,
        product_name: primaryItem.name,
        reason: `Shopify sales SKU for ${primaryItem.name}`,
        status: "approved",
        reviewed_at: new Date().toISOString(),
      });
      toast.success(
        `Aliased ${aliasDialog.item.sku} → ${primaryItem.sku}`
      );
      setMissing((prev) => prev.filter((m) => m.sku !== aliasDialog.item.sku));
      setAliasDialog(null);
      setAliasSearch("");
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setActioningSku(null);
    }
  };

  const handleAddToInventory = async (item) => {
    if (!confirm(`Create inventory record for "${item.product}" (SKU ${item.sku})?`)) return;
    setActioningSku(item.sku);
    try {
      await base44.entities.Inventory.create({
        sku: item.sku,
        name: item.product || item.sku,
        type: "finished_product",
        quantity: 0,
        unit: "units",
        active: true,
        notes: `Auto-created from Shopify sales data. Avg ${item.avgMonthly}/month over ${item.periodStart} → ${item.periodEnd}.`,
      });
      toast.success(`Created inventory item for ${item.sku}`);
      setMissing((prev) => prev.filter((m) => m.sku !== item.sku));
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setActioningSku(null);
    }
  };

  const handleExclude = async (item) => {
    if (!confirm(`Exclude SKU ${item.sku} (${item.product}) from Demand Planner?`)) return;
    setActioningSku(item.sku);
    try {
      await base44.entities.MasterExclusion.create({
        sku: item.sku,
        product_name: item.product,
        scope: "demand_planner",
        reason: "Missing inventory record - excluded from planning",
      });
      toast.success(`Excluded ${item.sku}`);
      setMissing((prev) => prev.filter((m) => m.sku !== item.sku));
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setActioningSku(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            Missing Inventory
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            SKUs with Shopify sales but no inventory record
          </p>
        </div>
        <Button onClick={fetchMissing} variant="outline" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="text-xs text-zinc-400 uppercase">Missing SKUs</div>
          <div className="text-3xl font-bold text-amber-400 mt-1">{missing.length}</div>
        </Card>
        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="text-xs text-zinc-400 uppercase">Total Inventory</div>
          <div className="text-3xl font-bold text-zinc-100 mt-1">{totalInventory}</div>
        </Card>
        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="text-xs text-zinc-400 uppercase">Demand Summaries</div>
          <div className="text-3xl font-bold text-zinc-100 mt-1">{totalSummaries}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-zinc-900 border-zinc-800">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="Search SKU or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-950 border-zinc-700"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-56 bg-zinc-950 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === "all" ? "All Categories" : c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading missing inventory...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-zinc-400">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
            {missing.length === 0
              ? "Nothing missing! All sales SKUs are accounted for."
              : "No items match your filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-400 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">SKU</th>
                  <th className="text-left p-3">Product</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">Total Sold</th>
                  <th className="text-right p-3">Avg/Month</th>
                  <th className="text-left p-3">Period</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isWorking = actioningSku === item.sku;
                  return (
                    <tr
                      key={item.sku}
                      className="border-t border-zinc-800 hover:bg-zinc-950/40"
                    >
                      <td className="p-3 font-mono text-xs text-zinc-300">{item.sku}</td>
                      <td className="p-3 text-zinc-200">{item.product}</td>
                      <td className="p-3">
                        <Badge variant="default">{item.category || "Other"}</Badge>
                      </td>
                      <td className="p-3 text-right font-semibold text-zinc-100">
                        {item.totalQty}
                      </td>
                      <td className="p-3 text-right text-zinc-300">
                        {item.avgMonthly}
                      </td>
                      <td className="p-3 text-xs text-zinc-500">
                        {(item.periodStart || "").substring(0, 7)} →{" "}
                        {(item.periodEnd || "").substring(0, 7)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isWorking}
                            onClick={() => {
                              setAliasDialog({ item });
                              setAliasSearch(item.product || "");
                            }}
                            title="Alias to existing inventory SKU"
                          >
                            <Link2 className="w-3.5 h-3.5 mr-1" /> Alias
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isWorking}
                            onClick={() => handleAddToInventory(item)}
                            title="Create new inventory record"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" /> Add
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isWorking}
                            onClick={() => handleExclude(item)}
                            title="Exclude from Demand Planner"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                          {isWorking && (
                            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Alias dialog */}
      <Dialog
        open={!!aliasDialog}
        onOpenChange={(o) => {
          if (!o) {
            setAliasDialog(null);
            setAliasSearch("");
          }
        }}
      >
        <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Alias SKU</DialogTitle>
          </DialogHeader>
          {aliasDialog && (
            <div className="space-y-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-500">Sales SKU (alias)</div>
                <div className="font-mono text-amber-400">{aliasDialog.item.sku}</div>
                <div className="text-sm text-zinc-300 mt-1">
                  {aliasDialog.item.product}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {aliasDialog.item.totalQty} sold • avg {aliasDialog.item.avgMonthly}/month
                </div>
              </div>

              <div>
                <Label className="text-zinc-300">Search existing inventory to link to</Label>
                <div className="relative mt-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <Input
                    autoFocus
                    placeholder="Search by name or SKU..."
                    value={aliasSearch}
                    onChange={(e) => setAliasSearch(e.target.value)}
                    className="pl-9 bg-zinc-950 border-zinc-700"
                  />
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-zinc-800 rounded-lg">
                {filteredAliasOptions.length === 0 ? (
                  <div className="p-4 text-center text-sm text-zinc-500">
                    No matches
                  </div>
                ) : (
                  filteredAliasOptions.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => handleCreateAlias(inv)}
                      disabled={actioningSku === aliasDialog.item.sku}
                      className="w-full text-left p-3 border-b border-zinc-800 last:border-0 hover:bg-zinc-800/50 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-200 truncate">{inv.name}</div>
                        <div className="text-xs font-mono text-zinc-500">{inv.sku}</div>
                      </div>
                      <Package className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAliasDialog(null);
                setAliasSearch("");
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}