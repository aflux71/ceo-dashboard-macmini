import React from "react";
import { DollarSign, Lock } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import { convertUnit, areUnitsCompatible } from "@/components/utils/unitConversion";

/**
 * Calculate batch cost from recipe ingredients and packaging with inventory costs
 * @param {Object} recipe - Recipe with ingredients and packaging arrays
 * @param {Array} inventory - Inventory items with cost_per_unit
 * @returns {{ totalCost: number, costPerUnit: number, ingredientsCost: number, packagingCost: number, ingredientsBreakdown: Array, packagingBreakdown: Array, hasMissingCosts: boolean }}
 */
export function calculateBatchCost(recipe, inventory) {
  if (!inventory?.length) {
    return { 
      totalCost: 0, 
      costPerUnit: 0, 
      ingredientsCost: 0, 
      packagingCost: 0,
      ingredientsBreakdown: [], 
      packagingBreakdown: [],
      breakdown: [], // backward compatibility
      hasMissingCosts: true 
    };
  }

  const ingredientsBreakdown = [];
  const packagingBreakdown = [];
  let ingredientsCost = 0;
  let packagingCost = 0;
  let hasMissingCosts = false;

  // Calculate ingredients cost
  (recipe?.ingredients || []).forEach(ing => {
    const invItem = inventory.find(i => 
      i.sku === ing.sku || i.name === ing.material
    );
    
    let itemCostPerUnit = invItem?.cost_per_unit || 0;
    let qty = ing.qty || 0;
    
    // Handle unit conversion for cost calculation
    // If recipe unit differs from inventory unit, convert qty to inventory unit to match cost
    if (itemCostPerUnit > 0 && invItem?.unit && ing.unit && 
        areUnitsCompatible(ing.unit, invItem.unit)) {
      const invUnitQty = convertUnit(qty, ing.unit, invItem.unit);
      qty = invUnitQty; // use converted quantity for cost
    }
    
    const lineCost = itemCostPerUnit * qty;

    if (!itemCostPerUnit && ing.qty > 0) {
      hasMissingCosts = true;
    }

    ingredientsCost += lineCost;
    ingredientsBreakdown.push({
      material: ing.material,
      sku: ing.sku,
      qty: ing.qty, // display original qty
      unit: ing.unit,
      costPerUnit: itemCostPerUnit,
      costPerUnitUnit: invItem?.unit || ing.unit,
      lineCost,
      hasCost: itemCostPerUnit > 0,
      type: 'ingredient'
    });
  });

  // Calculate packaging cost
  (recipe?.packaging || []).forEach(pkg => {
    const invItem = inventory.find(i => i.sku === pkg.sku);
    
    const itemCostPerUnit = invItem?.cost_per_unit || 0;
    const qty = pkg.qty_per_batch || 0;
    const lineCost = itemCostPerUnit * qty;

    if (!itemCostPerUnit && qty > 0) {
      hasMissingCosts = true;
    }

    packagingCost += lineCost;
    packagingBreakdown.push({
      material: pkg.name,
      sku: pkg.sku,
      qty,
      unit: 'units',
      costPerUnit: itemCostPerUnit,
      lineCost,
      hasCost: itemCostPerUnit > 0,
      type: 'packaging'
    });
  });

  const totalCost = ingredientsCost + packagingCost;
  const costPerUnit = recipe?.batch_size > 0 ? totalCost / recipe.batch_size : 0;

  return {
    totalCost,
    costPerUnit,
    ingredientsCost,
    packagingCost,
    ingredientsBreakdown,
    packagingBreakdown,
    breakdown: [...ingredientsBreakdown, ...packagingBreakdown], // backward compatibility
    hasMissingCosts
  };
}

/**
 * Display component for batch cost - only visible to authorized roles
 */
export default function BatchCostDisplay({ 
  recipe, 
  inventory, 
  showBreakdown = false,
  compact = false 
}) {
  const { floorUser, hasPermission } = useFloorPin();
  
  // Check if user has permission to view costs
  const canViewCosts = hasPermission?.("view_costs") || 
    floorUser?.role === "owner" || 
    floorUser?.role === "admin";

  if (!canViewCosts) {
    return compact ? null : (
      <div className="flex items-center gap-1.5 text-zinc-600">
        <Lock className="w-3 h-3" />
        <span className="text-xs">Cost hidden</span>
      </div>
    );
  }

  const { totalCost, costPerUnit, ingredientsCost, packagingCost, ingredientsBreakdown, packagingBreakdown, hasMissingCosts } = calculateBatchCost(recipe, inventory);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <DollarSign className="w-3.5 h-3.5 text-green-400" />
        <span className="text-sm font-medium text-green-400">
          ${totalCost.toFixed(2)}
        </span>
        {hasMissingCosts && (
          <span className="text-xs text-amber-400">*</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">Batch Cost</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-green-400">
            ${totalCost.toFixed(2)}
          </span>
          {hasMissingCosts && (
            <Badge variant="amber">Incomplete</Badge>
          )}
        </div>
      </div>
      
      {recipe.batch_size > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Cost per unit</span>
          <span className="text-zinc-300">${costPerUnit.toFixed(3)}</span>
        </div>
      )}

      {/* Summary row for ingredients vs packaging */}
      {showBreakdown && (ingredientsCost > 0 || packagingCost > 0) && (
        <div className="flex gap-4 text-xs mt-1">
          <span className="text-zinc-500">
            Materials: <span className="text-zinc-300">${ingredientsCost.toFixed(2)}</span>
          </span>
          <span className="text-zinc-500">
            Packaging: <span className="text-zinc-300">${packagingCost.toFixed(2)}</span>
          </span>
        </div>
      )}

      {showBreakdown && ingredientsBreakdown.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-2">Ingredients Breakdown</p>
          <div className="space-y-1">
            {ingredientsBreakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className={item.hasCost ? "text-zinc-400" : "text-amber-400"}>
                  {item.material} ({item.qty} {item.unit})
                </span>
                <span className={item.hasCost ? "text-zinc-300" : "text-amber-400"}>
                  {item.hasCost ? `$${item.lineCost.toFixed(2)} @ $${item.costPerUnit.toFixed(3)}/${item.costPerUnitUnit}` : "No cost"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showBreakdown && packagingBreakdown.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-2">Packaging Breakdown</p>
          <div className="space-y-1">
            {packagingBreakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className={item.hasCost ? "text-blue-400" : "text-amber-400"}>
                  {item.material} ({item.qty} {item.unit})
                </span>
                <span className={item.hasCost ? "text-zinc-300" : "text-amber-400"}>
                  {item.hasCost ? `$${item.lineCost.toFixed(2)}` : "No cost"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline cost badge for list views
 */
export function BatchCostBadge({ recipe, inventory }) {
  const { floorUser, hasPermission } = useFloorPin();
  
  const canViewCosts = hasPermission?.("view_costs") || 
    floorUser?.role === "owner" || 
    floorUser?.role === "admin";

  if (!canViewCosts) {
    return null;
  }

  const { totalCost, hasMissingCosts } = calculateBatchCost(recipe, inventory);

  if (totalCost === 0 && hasMissingCosts) {
    return null;
  }

  return (
    <Badge variant={hasMissingCosts ? "amber" : "green"}>
      <DollarSign className="w-3 h-3 mr-0.5" />
      {totalCost.toFixed(2)}
    </Badge>
  );
}