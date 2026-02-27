import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Badge from "@/components/ui/Badge";
import {
  Search,
  Plus,
  Minus,
  CheckCircle,
  AlertTriangle,
  Package,
  ClipboardList,
  Play,
  DollarSign
} from "lucide-react";
import { toast } from "sonner";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import { calculateBatchCost } from "@/components/recipes/BatchCostCalculator";

export default function ManualPlanner({ filterLine = null }) {
  const { floorUser, hasPermission } = useFloorPin();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState({});
  const [feasibilityResults, setFeasibilityResults] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const queryClient = useQueryClient();
  
  const canViewCosts = hasPermission?.("view_costs") || 
    floorUser?.role === "owner" || 
    floorUser?.role === "admin";

  // Fetch recipes
  const { data: recipes = [], isLoading: loadingRecipes } = useQuery({
    queryKey: ["recipes"],
    queryFn: () => base44.entities.Recipe.filter({ active: true })
  });

  // Fetch inventory
  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => base44.entities.Inventory.list()
  });

  // Filter recipes by search and production line
  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = !searchTerm ||
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLine = filterLine === null || filterLine === "all" || r.production_line === filterLine;
    return matchesSearch && matchesLine;
  });

  // Toggle product selection
  const toggleProduct = (recipeId) => {
    setSelectedProducts(prev => {
      const newSelected = { ...prev };
      if (newSelected[recipeId]) {
        delete newSelected[recipeId];
      } else {
        newSelected[recipeId] = { batches: 1 };
      }
      return newSelected;
    });
    setFeasibilityResults(null);
  };

  // Update batch count
  const updateBatches = (recipeId, delta) => {
    setSelectedProducts(prev => {
      const current = prev[recipeId]?.batches || 1;
      const newCount = Math.max(1, current + delta);
      return {
        ...prev,
        [recipeId]: { batches: newCount }
      };
    });
    setFeasibilityResults(null);
  };

  // Calculate materials needed and check feasibility
  const checkFeasibility = () => {
    setIsChecking(true);
    
    const selectedRecipes = Object.entries(selectedProducts).map(([recipeId, data]) => {
      const recipe = recipes.find(r => r.id === recipeId);
      return { recipe, batches: data.batches };
    });

    // Aggregate materials needed
    const materialsNeeded = {};
    const productStatus = [];

    selectedRecipes.forEach(({ recipe, batches }) => {
      if (!recipe) return;

      const productMaterials = [];
      let allAvailable = true;

      (recipe.ingredients || []).forEach(ing => {
        const needed = (ing.qty || 0) * batches;
        const key = ing.sku || ing.material;
        
        if (!materialsNeeded[key]) {
          materialsNeeded[key] = {
            name: ing.material,
            sku: ing.sku,
            unit: ing.unit,
            needed: 0,
            inStock: 0
          };
        }
        materialsNeeded[key].needed += needed;

        // Find inventory item
        const invItem = inventory.find(i => i.sku === ing.sku || i.name === ing.material);
        if (invItem) {
          materialsNeeded[key].inStock = invItem.quantity || 0;
        }

        const available = invItem?.quantity || 0;
        const status = available >= needed ? "ok" : "insufficient";
        if (status === "insufficient") allAvailable = false;

        productMaterials.push({
          material: ing.material,
          sku: ing.sku,
          unit: ing.unit,
          needed,
          inStock: available,
          status
        });
      });

      // Calculate cost for this product
      const costInfo = calculateBatchCost(recipe, inventory);
      const totalProductCost = costInfo.totalCost * batches;

      productStatus.push({
        recipe,
        batches,
        totalUnits: (recipe.batch_size || 0) * batches,
        materials: productMaterials,
        status: allAvailable ? "ready" : "insufficient",
        batchCost: costInfo.totalCost,
        totalCost: totalProductCost,
        hasMissingCosts: costInfo.hasMissingCosts
      });
    });

    // Calculate total cost
    const totalProductionCost = productStatus.reduce((sum, p) => sum + (p.totalCost || 0), 0);

    // Check overall material availability
    const materialsList = Object.values(materialsNeeded).map(m => ({
      ...m,
      status: m.inStock >= m.needed ? "ok" : "insufficient",
      shortfall: Math.max(0, m.needed - m.inStock)
    }));

    const overallReady = materialsList.every(m => m.status === "ok");

    setFeasibilityResults({
      products: productStatus,
      materials: materialsList,
      overallStatus: overallReady ? "ready" : "insufficient",
      totalCost: totalProductionCost
    });
    setIsChecking(false);
  };

  // Create batches mutation
  const createBatchesMutation = useMutation({
    mutationFn: async () => {
      const batches = [];
      for (const product of feasibilityResults.products) {
        for (let i = 0; i < product.batches; i++) {
          const batchId = `${product.recipe.sku.substring(0, 6)}-${Date.now().toString(36).toUpperCase()}-${i}`;
          const batch = await base44.entities.Batch.create({
            batch_id: batchId,
            recipe_id: product.recipe.id,
            sku: product.recipe.sku,
            product_name: product.recipe.name,
            quantity: product.recipe.batch_size || 0,
            production_line: product.recipe.production_line || 1,
            operator: floorUser?.name || "TBD",
            status: "pending",
            production_date: new Date().toISOString(),
            notes: "Created from Manual Planner"
          });
          batches.push(batch);
        }
      }
      return batches;
    },
    onSuccess: (batches) => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.success(`Created ${batches.length} batch(es)`);
      setSelectedProducts({});
      setFeasibilityResults(null);
    }
  });

  const selectedCount = Object.keys(selectedProducts).length;
  const totalBatches = Object.values(selectedProducts).reduce((sum, p) => sum + p.batches, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Product Selection */}
      <div className="lg:col-span-2 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800"
          />
        </div>

        {/* Product List */}
        <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
          {loadingRecipes ? (
            <p className="text-zinc-500 text-center py-8">Loading recipes...</p>
          ) : filteredRecipes.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No products found</p>
          ) : (
            filteredRecipes.map((recipe) => {
              const isSelected = !!selectedProducts[recipe.id];
              const batches = selectedProducts[recipe.id]?.batches || 1;

              return (
                <div
                  key={recipe.id}
                  className={`p-4 rounded-lg border transition-all ${
                    isSelected
                      ? "bg-orange-950/20 border-orange-500/30"
                      : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleProduct(recipe.id)}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-zinc-100">{recipe.name}</span>
                        <Badge variant="default">{recipe.category?.substring(0, 2).toUpperCase() || "BB"}</Badge>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {recipe.category} • {recipe.batch_size} per batch
                      </p>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Batches:</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 bg-zinc-800 border-zinc-700"
                          onClick={() => updateBatches(recipe.id, -1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center font-mono font-bold text-orange-400">
                          {batches}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 bg-zinc-800 border-zinc-700"
                          onClick={() => updateBatches(recipe.id, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Check Inventory Button */}
        {selectedCount > 0 && (
          <Button
            onClick={checkFeasibility}
            disabled={isChecking}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white h-12 text-base"
          >
            <ClipboardList className="w-5 h-5 mr-2" />
            Check Inventory ({selectedCount} products, {totalBatches} batches)
          </Button>
        )}
      </div>

      {/* Right: Feasibility Results */}
      <div className="space-y-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Production Status</CardTitle>
          </CardHeader>
          <CardContent>
            {!feasibilityResults ? (
              <p className="text-sm text-zinc-500">
                Select products and click "Check Inventory" to see feasibility
              </p>
            ) : (
              <div className="space-y-3">
              {feasibilityResults.products.map((product, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                <div className="flex items-center gap-2">
                  {product.status === "ready" ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                  <div>
                    <span className="text-sm text-zinc-200 truncate max-w-[120px] block">
                      {product.recipe.name}
                    </span>
                    {canViewCosts && product.totalCost > 0 && (
                      <span className="text-xs text-green-400">
                        ${product.totalCost.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant={product.status === "ready" ? "green" : "red"}>
                  ×{product.batches} {product.status === "ready" ? "READY" : "SHORT"}
                </Badge>
              </div>
              ))}
              {canViewCosts && feasibilityResults.totalCost > 0 && (
              <div className="pt-3 mt-2 border-t border-zinc-700 flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total Est. Cost</span>
                <span className="text-base font-bold text-green-400">
                  ${feasibilityResults.totalCost.toFixed(2)}
                </span>
              </div>
              )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Materials Required</CardTitle>
          </CardHeader>
          <CardContent>
            {!feasibilityResults ? (
              <p className="text-sm text-zinc-500">No materials calculated yet</p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-4 gap-2 text-xs text-zinc-500 pb-2 border-b border-zinc-800">
                  <span>Material</span>
                  <span className="text-right">Needed</span>
                  <span className="text-right">In Stock</span>
                  <span className="text-right">Status</span>
                </div>
                {feasibilityResults.materials.map((mat, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-2 text-sm py-1.5 border-b border-zinc-800/50 last:border-0">
                    <span className="text-zinc-300 truncate text-xs" title={mat.name}>
                      {mat.name}
                    </span>
                    <span className="text-right text-zinc-400 text-xs">
                      {mat.needed.toFixed(1)}
                    </span>
                    <span className="text-right text-zinc-400 text-xs">
                      {mat.inStock.toFixed(1)}
                    </span>
                    <span className="text-right">
                      {mat.status === "ok" ? (
                        <span className="text-green-400 text-xs">✓</span>
                      ) : (
                        <span className="text-red-400 text-xs">-{mat.shortfall.toFixed(1)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schedule Button */}
        {feasibilityResults && (
          <Button
            onClick={() => createBatchesMutation.mutate()}
            disabled={createBatchesMutation.isPending || feasibilityResults.overallStatus !== "ready"}
            className={`w-full h-12 text-base ${
              feasibilityResults.overallStatus === "ready"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-zinc-700 cursor-not-allowed"
            }`}
          >
            {feasibilityResults.overallStatus === "ready" ? (
              <>
                <Play className="w-5 h-5 mr-2" />
                Schedule {totalBatches} Batch(es)
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 mr-2" />
                Insufficient Materials
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}