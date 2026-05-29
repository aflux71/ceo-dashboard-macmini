import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Calculator } from "lucide-react";
import CostingPlanDialog from "@/components/costing/CostingPlanDialog";
import { calculateCosting, fmt } from "@/components/costing/costingEngine";

const STATUS_VARIANT = {
  draft: "amber",
  finalized: "green",
  archived: "default",
};

export default function ProductCosting() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);

  const { data: plans = [] } = useQuery({
    queryKey: ["product_costing_plans"],
    queryFn: () => base44.entities.ProductCostingPlan.list("-updated_date"),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes_for_costing"],
    queryFn: () => base44.entities.Recipe.list(),
  });
  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory_for_costing"],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const inventoryBySku = useMemo(() => {
    const m = {};
    for (const i of inventory) if (i.sku) m[i.sku] = i;
    return m;
  }, [inventory]);
  const recipeById = useMemo(() => {
    const m = {};
    for (const r of recipes) m[r.id] = r;
    return m;
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter(
      (p) =>
        p.plan_name?.toLowerCase().includes(q) ||
        p.product_name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
    );
  }, [plans, search]);

  const handleDelete = async (plan) => {
    if (!confirm(`Delete costing plan "${plan.plan_name}"?`)) return;
    await base44.entities.ProductCostingPlan.delete(plan.id);
    queryClient.invalidateQueries({ queryKey: ["product_costing_plans"] });
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["product_costing_plans"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-orange-400" />
            Product Costing
          </h1>
          <p className="text-sm text-zinc-400">
            Plan new product costs, overheads, and pricing tiers.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingPlan(null);
            setDialogOpen(true);
          }}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="w-4 h-4 mr-1" /> New Costing Plan
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Search by name, product, or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-100"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-16 text-center text-zinc-500">
            No costing plans yet. Click "New Costing Plan" to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((plan) => {
            const breakdown = calculateCosting(plan, {
              recipe: recipeById[plan.recipe_id],
              inventoryBySku,
            });
            return (
              <Card key={plan.id} className="bg-zinc-900 border-zinc-800 hover:border-orange-500/40 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-zinc-100 truncate">{plan.plan_name}</h3>
                      <p className="text-xs text-zinc-500 truncate">
                        {plan.product_name} • SKU {plan.sku}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[plan.status] || "default"}>
                      {plan.status || "draft"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">Cost / Unit</div>
                      <div className="font-mono text-zinc-100">{fmt(breakdown.totalCostPerUnit)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Retail Price</div>
                      <div className="font-mono text-orange-400">{fmt(breakdown.retailPrice)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Wholesale</div>
                      <div className="font-mono text-zinc-300">{fmt(breakdown.wholesalePrice)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Private Brand</div>
                      <div className="font-mono text-zinc-300">{fmt(breakdown.privateBrandPrice)}</div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-zinc-800">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setEditingPlan(plan);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(plan)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CostingPlanDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        plan={editingPlan}
        onSaved={handleSaved}
      />
    </div>
  );
}