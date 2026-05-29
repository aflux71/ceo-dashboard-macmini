/**
 * Costing Engine for ProductCostingPlan
 *
 * Given a plan, optional recipe, and inventory map (sku -> inventory item),
 * computes per-batch and per-unit cost breakdown and pricing tiers.
 */

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);

export function resolveMaterialCost(material, inventoryBySku) {
  if (material.cost_per_unit_override != null && material.cost_per_unit_override !== "") {
    return num(material.cost_per_unit_override);
  }
  const inv = inventoryBySku?.[material.material_sku || material.packaging_sku];
  return num(inv?.cost_per_unit);
}

/**
 * Computes a full costing breakdown.
 * @param {Object} plan - ProductCostingPlan record
 * @param {Object} options
 * @param {Object} [options.recipe] - Linked Recipe entity (optional)
 * @param {Object} [options.inventoryBySku] - Map of SKU -> Inventory record
 * @returns {Object} breakdown
 */
export function calculateCosting(plan, { recipe, inventoryBySku = {} } = {}) {
  const batchSize = num(plan?.batch_size) || 1;

  // --- Raw materials ---
  const rawMaterials = (plan?.raw_materials_override?.length
    ? plan.raw_materials_override
    : (recipe?.ingredients || []).map((i) => ({
        material_sku: i.sku,
        material_name: i.material,
        quantity_per_batch: i.qty,
        unit_of_measure: i.unit,
      }))
  ).map((m) => {
    const unitCost = resolveMaterialCost(m, inventoryBySku);
    const lineCost = unitCost * num(m.quantity_per_batch);
    return { ...m, resolved_unit_cost: unitCost, line_cost: lineCost };
  });
  const rawMaterialsCost = rawMaterials.reduce((s, m) => s + m.line_cost, 0);

  // --- Packaging ---
  const packaging = (plan?.packaging_override?.length
    ? plan.packaging_override
    : (recipe?.packaging || []).map((p) => ({
        packaging_sku: p.sku,
        packaging_name: p.name,
        quantity_per_unit:
          p.qty_per_unit != null ? p.qty_per_unit : num(p.qty_per_batch) / batchSize,
      }))
  ).map((p) => {
    const unitCost = resolveMaterialCost(p, inventoryBySku);
    const perUnit = unitCost * num(p.quantity_per_unit);
    return { ...p, resolved_unit_cost: unitCost, cost_per_unit: perUnit };
  });
  const packagingCostPerUnit = packaging.reduce((s, p) => s + p.cost_per_unit, 0);
  const packagingCostPerBatch = packagingCostPerUnit * batchSize;

  // --- Labor ---
  const laborHours =
    plan?.labor_hours_per_batch != null && plan.labor_hours_per_batch !== ""
      ? num(plan.labor_hours_per_batch)
      : num(recipe?.estimated_labor_hours_per_batch);
  const laborRate =
    plan?.labor_cost_per_hour != null && plan.labor_cost_per_hour !== ""
      ? num(plan.labor_cost_per_hour)
      : num(recipe?.cost_per_labor_hour);
  const laborCost = laborHours * laborRate;

  // --- Overheads ---
  const customOverheads = (plan?.custom_overheads || []).map((o) => ({
    name: o.name,
    cost_per_batch: num(o.cost_per_batch),
  }));
  const customOverheadsCost = customOverheads.reduce((s, o) => s + o.cost_per_batch, 0);

  const shippingPerUnit = num(plan?.shipping_cost_per_unit_override);
  const otherVariablePerUnit = num(plan?.other_variable_cost_per_unit_override);
  const variablePerUnit = shippingPerUnit + otherVariablePerUnit;
  const variablePerBatch = variablePerUnit * batchSize;

  // --- Totals ---
  const finishedCostPerBatch = rawMaterialsCost + laborCost + customOverheadsCost;
  const finishedCostPerUnit = finishedCostPerBatch / batchSize;
  const totalCostPerUnit = finishedCostPerUnit + packagingCostPerUnit + variablePerUnit;
  const totalCostPerBatch = totalCostPerUnit * batchSize;

  // --- Pricing tiers ---
  const markup = (cost, pct) => {
    const p = num(pct);
    if (!p) return null;
    return cost * (1 + p / 100);
  };
  const gpPrice = (cost, gpPct) => {
    const p = num(gpPct);
    if (!p || p >= 100) return null;
    return cost / (1 - p / 100);
  };

  const wholesalePrice = markup(totalCostPerUnit, plan?.wholesale_markup_percentage);
  const privateBrandPrice = markup(totalCostPerUnit, plan?.private_brand_markup_percentage);
  const retailPrice = markup(totalCostPerUnit, plan?.retail_markup_percentage);
  const gpTargetPrice = gpPrice(totalCostPerUnit, plan?.target_gp_percentage);

  return {
    batchSize,
    rawMaterials,
    rawMaterialsCost,
    packaging,
    packagingCostPerUnit,
    packagingCostPerBatch,
    laborHours,
    laborRate,
    laborCost,
    customOverheads,
    customOverheadsCost,
    shippingPerUnit,
    otherVariablePerUnit,
    variablePerBatch,
    finishedCostPerBatch,
    finishedCostPerUnit,
    totalCostPerUnit,
    totalCostPerBatch,
    gpTargetPrice,
    wholesalePrice,
    privateBrandPrice,
    retailPrice,
  };
}

export const fmt = (v, digits = 2) =>
  v == null || isNaN(v) ? "—" : `$${Number(v).toFixed(digits)}`;