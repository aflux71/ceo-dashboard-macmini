// Calculates per-unit cost breakdowns and gross margins for finished products.

/**
 * Compute material cost per unit for a recipe.
 * Sums (ingredient.qty * inventory.cost_per_unit) / batch_size for ingredients,
 * plus packaging (qty_per_unit * cost_per_unit) for each packaging line.
 */
export function computeMaterialCostPerUnit(recipe, inventoryByKey) {
  if (!recipe || !recipe.batch_size || recipe.batch_size <= 0) return { ingredient: 0, packaging: 0, gaps: ["no_batch_size"] };

  const gaps = [];

  // Ingredient cost per batch
  let ingredientCostPerBatch = 0;
  (recipe.ingredients || []).forEach(ing => {
    const key = (ing.sku || ing.material || "").toLowerCase().trim();
    const inv = inventoryByKey.get(key) || inventoryByKey.get((ing.material || "").toLowerCase().trim());
    const cost = inv?.cost_per_unit || 0;
    if (!cost) gaps.push(`missing_cost:${ing.material || ing.sku}`);
    ingredientCostPerBatch += (Number(ing.qty) || 0) * cost;
  });

  // Packaging cost (per unit fields preferred, fallback to per batch)
  let packagingCostPerUnit = 0;
  (recipe.packaging || []).forEach(p => {
    const key = (p.sku || "").toLowerCase().trim();
    const inv = inventoryByKey.get(key);
    const cost = inv?.cost_per_unit || 0;
    if (!cost) gaps.push(`missing_pkg_cost:${p.sku || p.name}`);
    if (p.qty_per_unit != null) {
      packagingCostPerUnit += (Number(p.qty_per_unit) || 0) * cost;
    } else if (p.qty_per_batch != null && recipe.batch_size) {
      packagingCostPerUnit += ((Number(p.qty_per_batch) || 0) * cost) / recipe.batch_size;
    }
  });

  return {
    ingredient: ingredientCostPerBatch / recipe.batch_size,
    packaging: packagingCostPerUnit,
    gaps,
  };
}

export function computeLaborCostPerUnit(recipe) {
  const hours = Number(recipe?.estimated_labor_hours_per_batch) || 0;
  const rate = Number(recipe?.cost_per_labor_hour) || 0;
  const batchSize = Number(recipe?.batch_size) || 0;
  if (!hours || !rate || !batchSize) return 0;
  return (hours * rate) / batchSize;
}

export function computeOverheadPerUnit(overhead) {
  if (!overhead) return { total: 0, overhead: 0, packaging: 0, shipping: 0, other: 0 };
  const ov = Number(overhead.overhead_per_unit) || 0;
  const pk = Number(overhead.packaging_cost_per_unit) || 0;
  const sh = Number(overhead.shipping_cost_per_unit) || 0;
  const ot = Number(overhead.other_variable_cost_per_unit) || 0;
  return { total: ov + pk + sh + ot, overhead: ov, packaging: pk, shipping: sh, other: ot };
}

/**
 * Full profitability row for one SKU.
 * Returns null if there is no recipe (we can't price what we can't cost).
 */
export function computeProfitabilityRow({ recipe, finishedProduct, overhead, inventoryByKey }) {
  if (!recipe) return null;

  const mat = computeMaterialCostPerUnit(recipe, inventoryByKey);
  const labor = computeLaborCostPerUnit(recipe);
  const oh = computeOverheadPerUnit(overhead);

  const deadNetCost = mat.ingredient + mat.packaging + labor + oh.total;

  const retailPrice = Number(finishedProduct?.retail_price) || 0;
  const wholesalePrice = Number(finishedProduct?.wholesale_price) || 0;

  const retailMarginAmount = retailPrice - deadNetCost;
  const wholesaleMarginAmount = wholesalePrice - deadNetCost;
  const retailMarginPct = retailPrice > 0 ? (retailMarginAmount / retailPrice) * 100 : null;
  const wholesaleMarginPct = wholesalePrice > 0 ? (wholesaleMarginAmount / wholesalePrice) * 100 : null;

  const target = Number(recipe.target_profit_margin_percentage) || null;
  const belowTargetRetail = target != null && retailMarginPct != null && retailMarginPct < target;
  const belowTargetWholesale = target != null && wholesaleMarginPct != null && wholesaleMarginPct < target;

  return {
    sku: recipe.sku,
    name: recipe.name,
    category: recipe.category,
    production_type: recipe.production_type,
    batch_size: recipe.batch_size,
    costs: {
      ingredient: mat.ingredient,
      packaging: mat.packaging + oh.packaging,
      labor,
      overhead: oh.overhead,
      shipping: oh.shipping,
      other: oh.other,
      total: deadNetCost,
    },
    retail: {
      price: retailPrice,
      margin_amount: retailMarginAmount,
      margin_pct: retailMarginPct,
      below_target: belowTargetRetail,
    },
    wholesale: {
      price: wholesalePrice,
      margin_amount: wholesaleMarginAmount,
      margin_pct: wholesaleMarginPct,
      below_target: belowTargetWholesale,
    },
    target_margin_pct: target,
    data_gaps: mat.gaps,
    has_price: retailPrice > 0 || wholesalePrice > 0,
  };
}

export function buildInventoryByKey(inventory) {
  const map = new Map();
  (inventory || []).forEach(inv => {
    if (inv.sku) map.set(inv.sku.toLowerCase().trim(), inv);
    if (inv.name) map.set(inv.name.toLowerCase().trim(), inv);
  });
  return map;
}

export function formatCurrency(n) {
  if (n == null || isNaN(n)) return "—";
  return `$${Number(n).toFixed(2)}`;
}

export function formatPercent(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Number(n).toFixed(1)}%`;
}