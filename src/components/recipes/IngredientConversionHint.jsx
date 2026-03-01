import React from "react";
import { convertUnit, areUnitsCompatible, normalizeUnit } from "@/components/utils/unitConversion";
import { AlertCircle, Zap } from "lucide-react";

export default function IngredientConversionHint({ ingredient, inventoryItem }) {
  if (!inventoryItem || !ingredient) return null;

  const recipeUnit = ingredient.unit || '';
  const inventoryUnit = inventoryItem.unit || '';
  const recipeQty = ingredient.qty || 0;
  const inventoryQty = inventoryItem.quantity || 0;

  // Check if conversion needed
  const needsConversion = recipeUnit && inventoryUnit && 
    normalizeUnit(recipeUnit) !== normalizeUnit(inventoryUnit) &&
    areUnitsCompatible(recipeUnit, inventoryUnit);

  // Convert inventory quantity to recipe unit for comparison
  const convertedInventoryQty = needsConversion 
    ? convertUnit(inventoryQty, inventoryUnit, recipeUnit)
    : inventoryQty;

  // Determine stock level (per batch)
  const batchCoveragePercent = recipeQty > 0 ? (convertedInventoryQty / recipeQty) * 100 : 0;
  const isLow = batchCoveragePercent > 0 && batchCoveragePercent < 150; // less than 1.5x batch
  const isCritical = batchCoveragePercent < 100; // not enough for one batch

  return (
    <div className="space-y-1">
      {/* Conversion badge */}
      {needsConversion && (
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-blue-400" />
          <span className="text-xs text-blue-400">
            {recipeUnit} → {inventoryUnit}
          </span>
        </div>
      )}

      {/* Stock availability */}
      <div className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
        isCritical 
          ? 'bg-red-500/10 text-red-400 border border-red-500/30'
          : isLow
          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
          : 'bg-green-500/10 text-green-400 border border-green-500/30'
      }`}>
        {isCritical && <AlertCircle className="w-3 h-3" />}
        <span>
          {convertedInventoryQty.toFixed(2)} {recipeUnit} available
          {needsConversion && ` (${inventoryQty} ${inventoryUnit})`}
        </span>
      </div>

      {/* Coverage info */}
      <div className="text-xs text-zinc-500">
        {batchCoveragePercent.toFixed(0)}% of batch
      </div>
    </div>
  );
}