import React, { useState, useMemo } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Lets the user enter a desired Target Output Qty and shows ingredient
 * and packaging quantities scaled from the recipe's base batch_size.
 */
export default function RecipeScaleCalculator({ recipe }) {
  const baseBatch = recipe?.batch_size || 0;
  const [targetQty, setTargetQty] = useState(baseBatch || 0);

  const ratio = useMemo(() => {
    if (!baseBatch || baseBatch <= 0) return 1;
    const t = Number(targetQty) || 0;
    return t / baseBatch;
  }, [targetQty, baseBatch]);

  const round = (v) => {
    if (v == null || isNaN(v)) return 0;
    // Keep 3 decimals max, strip trailing zeros
    return Math.round(v * 1000) / 1000;
  };

  const scaledIngredients = (recipe?.ingredients || []).map((ing) => ({
    ...ing,
    scaled_qty: round((Number(ing.qty) || 0) * ratio),
  }));

  const scaledPackaging = (recipe?.packaging || []).map((pkg) => ({
    ...pkg,
    scaled_qty: round((Number(pkg.qty_per_unit) || 0) * (Number(targetQty) || 0)),
  }));

  if (!baseBatch || baseBatch <= 0) {
    return (
      <div className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-700 text-sm text-zinc-500">
        Set a Batch Size on this recipe to use the scaling calculator.
      </div>
    );
  }

  return (
    <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-orange-400" />
          <h3 className="font-semibold text-zinc-200">Scale Recipe</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTargetQty(baseBatch)}
          className="text-xs text-zinc-400 hover:text-orange-400 h-7"
        >
          <RotateCcw className="w-3 h-3 mr-1" /> Reset
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-500">Recipe Batch Size</Label>
          <div className="text-sm text-zinc-300 font-medium h-9 flex items-center">
            {baseBatch.toLocaleString()} units
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-500">Target Output Qty</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={targetQty}
            onChange={(e) => setTargetQty(e.target.value === "" ? "" : parseFloat(e.target.value))}
            className="bg-zinc-900 border-zinc-700 h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-500">Scale Factor</Label>
          <div className={`text-sm font-medium h-9 flex items-center ${ratio === 1 ? "text-zinc-300" : "text-orange-400"}`}>
            ×{round(ratio)}
          </div>
        </div>
      </div>

      {scaledIngredients.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Scaled Ingredients</p>
          <div className="rounded-lg border border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/50">
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Material</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-medium">Original</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-medium">Scaled</th>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Unit</th>
                </tr>
              </thead>
              <tbody>
                {scaledIngredients.map((ing, idx) => (
                  <tr key={idx} className="border-b border-zinc-800 last:border-0">
                    <td className="px-3 py-1.5 text-zinc-200">{ing.material || ing.sku}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-500">{ing.qty}</td>
                    <td className="px-3 py-1.5 text-right text-orange-400 font-medium">
                      {ing.scaled_qty}
                    </td>
                    <td className="px-3 py-1.5 text-zinc-500">{ing.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scaledPackaging.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Scaled Packaging</p>
          <div className="rounded-lg border border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/50">
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Item</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-medium">Per Unit</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-medium">Total Needed</th>
                </tr>
              </thead>
              <tbody>
                {scaledPackaging.map((pkg, idx) => (
                  <tr key={idx} className="border-b border-zinc-800 last:border-0">
                    <td className="px-3 py-1.5 text-zinc-200">{pkg.name || pkg.sku}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-500">{pkg.qty_per_unit}</td>
                    <td className="px-3 py-1.5 text-right text-blue-400 font-medium">
                      {pkg.scaled_qty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}