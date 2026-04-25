import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  AlertTriangle, CheckCircle2, Package, FlaskConical, Calculator,
  TrendingDown, Box
} from "lucide-react";
import Badge from "@/components/ui/Badge";

/**
 * RecipeCalculatorPanel
 *
 * Props:
 *  - recipe: Recipe entity object (required)
 *  - targetUnits: number — the batch size to calculate for
 *  - className: optional extra classes
 */
export default function RecipeCalculatorPanel({ recipe, targetUnits, className = "" }) {
  const { data: inventory = [] } = useQuery({
    queryKey: ["recipe_calc_inventory"],
    queryFn: () => base44.entities.Inventory.list(),
    staleTime: 60_000,
  });

  const inventoryMap = useMemo(() => {
    const map = {};
    inventory.forEach((item) => {
      if (item.sku) map[item.sku.toLowerCase()] = item;
    });
    return map;
  }, [inventory]);

  const scaledIngredients = useMemo(() => {
    if (!recipe || !targetUnits || targetUnits <= 0) return [];
    const multiplier = targetUnits / (recipe.batch_size || 1);
    return (recipe.ingredients || []).map((ing) => {
      const scaledQty = Math.round((ing.qty || 0) * multiplier * 1000) / 1000;
      const invItem = ing.sku ? inventoryMap[ing.sku.toLowerCase()] : null;
      const onHand = invItem?.quantity ?? null;
      const sufficient = onHand === null ? null : onHand >= scaledQty;
      return {
        name: ing.material || ing.sku || "Unknown",
        sku: ing.sku || "",
        unit: ing.unit || "",
        scaledQty,
        perBatch: ing.qty || 0,
        onHand,
        sufficient,
        invItem,
      };
    });
  }, [recipe, targetUnits, inventoryMap]);

  const scaledPackaging = useMemo(() => {
    if (!recipe || !targetUnits || targetUnits <= 0) return [];
    return (recipe.packaging || []).map((pkg) => {
      const scaledQty = Math.round((pkg.qty_per_unit || 0) * targetUnits);
      const invItem = pkg.sku ? inventoryMap[pkg.sku.toLowerCase()] : null;
      const onHand = invItem?.quantity ?? null;
      const sufficient = onHand === null ? null : onHand >= scaledQty;
      return {
        name: pkg.name || pkg.sku || "Unknown",
        sku: pkg.sku || "",
        scaledQty,
        qtyPerUnit: pkg.qty_per_unit || 0,
        onHand,
        sufficient,
        invItem,
      };
    });
  }, [recipe, targetUnits, inventoryMap]);

  const shortfalls = useMemo(() => {
    const ing = scaledIngredients.filter((i) => i.sufficient === false);
    const pkg = scaledPackaging.filter((p) => p.sufficient === false);
    return [...ing, ...pkg];
  }, [scaledIngredients, scaledPackaging]);

  const batchesFromStock = useMemo(() => {
    if (!recipe || !recipe.batch_size) return null;
    // How many full batches can we run given current stock?
    const allLimiting = (recipe.ingredients || []).map((ing) => {
      if (!ing.qty || !ing.sku) return Infinity;
      const invItem = inventoryMap[ing.sku.toLowerCase()];
      if (!invItem) return 0;
      return Math.floor(invItem.quantity / ing.qty);
    });
    if (allLimiting.length === 0) return null;
    const minBatches = Math.min(...allLimiting);
    return minBatches === Infinity ? null : minBatches;
  }, [recipe, inventoryMap]);

  if (!recipe) return null;
  if (!targetUnits || targetUnits <= 0) {
    return (
      <div className={`rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center text-zinc-600 text-xs ${className}`}>
        Enter a batch size above to see the ingredient breakdown
      </div>
    );
  }

  const batches = recipe.batch_size ? (targetUnits / recipe.batch_size).toFixed(2) : "?";
  const hasIssues = shortfalls.length > 0;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 bg-zinc-800 rounded-full px-2.5 py-1 text-zinc-300">
          <Calculator className="w-3 h-3 text-zinc-400" />
          {Number(batches)} × batch{Number(batches) !== 1 ? "es" : ""}
          {recipe.batch_size && <span className="text-zinc-500 ml-1">(recipe batch = {recipe.batch_size} units)</span>}
        </span>

        {batchesFromStock !== null && (
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${batchesFromStock >= Math.ceil(Number(batches)) ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>
            <TrendingDown className="w-3 h-3" />
            Stock covers ~{batchesFromStock} full batch{batchesFromStock !== 1 ? "es" : ""}
          </span>
        )}

        {hasIssues ? (
          <span className="flex items-center gap-1.5 bg-red-500/10 text-red-400 rounded-full px-2.5 py-1">
            <AlertTriangle className="w-3 h-3" />
            {shortfalls.length} shortfall{shortfalls.length !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 bg-green-500/10 text-green-400 rounded-full px-2.5 py-1">
            <CheckCircle2 className="w-3 h-3" />
            All materials available
          </span>
        )}
      </div>

      {/* Ingredients Table */}
      {scaledIngredients.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
            <FlaskConical className="w-3.5 h-3.5" />
            Ingredients
          </div>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/50">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Material</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">SKU</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Required</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">On Hand</th>
                  <th className="text-center px-3 py-2 text-zinc-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {scaledIngredients.map((ing, i) => (
                  <tr
                    key={i}
                    className={`border-b border-zinc-800/50 last:border-0 ${ing.sufficient === false ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-3 py-2 text-zinc-200">{ing.name}</td>
                    <td className="px-3 py-2 font-mono text-zinc-500">{ing.sku || "—"}</td>
                    <td className="px-3 py-2 text-right text-zinc-200 font-medium">
                      {ing.scaledQty.toLocaleString()} <span className="text-zinc-500">{ing.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {ing.onHand !== null ? (
                        <span className={ing.sufficient === false ? "text-red-400 font-medium" : "text-zinc-300"}>
                          {ing.onHand.toLocaleString()} <span className="text-zinc-500">{ing.invItem?.unit || ing.unit}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-600">Not tracked</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {ing.sufficient === null ? (
                        <Badge variant="default">Unknown</Badge>
                      ) : ing.sufficient ? (
                        <Badge variant="green">OK</Badge>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge variant="red">Short</Badge>
                          <span className="text-red-400 text-xs font-medium">
                            Need {(ing.scaledQty - ing.onHand).toLocaleString()} more
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Packaging Table */}
      {scaledPackaging.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
            <Box className="w-3.5 h-3.5" />
            Packaging
          </div>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/50">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Item</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">SKU</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Required</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">On Hand</th>
                  <th className="text-center px-3 py-2 text-zinc-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {scaledPackaging.map((pkg, i) => (
                  <tr
                    key={i}
                    className={`border-b border-zinc-800/50 last:border-0 ${pkg.sufficient === false ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-3 py-2 text-zinc-200">{pkg.name}</td>
                    <td className="px-3 py-2 font-mono text-zinc-500">{pkg.sku || "—"}</td>
                    <td className="px-3 py-2 text-right text-zinc-200 font-medium">
                      {pkg.scaledQty.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {pkg.onHand !== null ? (
                        <span className={pkg.sufficient === false ? "text-red-400 font-medium" : "text-zinc-300"}>
                          {pkg.onHand.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-zinc-600">Not tracked</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {pkg.sufficient === null ? (
                        <Badge variant="default">Unknown</Badge>
                      ) : pkg.sufficient ? (
                        <Badge variant="green">OK</Badge>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge variant="red">Short</Badge>
                          <span className="text-red-400 text-xs font-medium">
                            Need {(pkg.scaledQty - pkg.onHand).toLocaleString()} more
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scaledIngredients.length === 0 && scaledPackaging.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-center text-zinc-600 text-xs">
          No ingredients or packaging defined in this recipe
        </div>
      )}
    </div>
  );
}