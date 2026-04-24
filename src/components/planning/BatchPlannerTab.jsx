import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Trash2, Printer, Package, FlaskConical,
  CheckCircle2, AlertTriangle, X, ChevronDown, ChevronUp, Layers
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────

function roundQ(n) {
  return Math.round((n || 0) * 1000) / 1000;
}

function computeAggregateMaterials(selectedItems, recipes, inventory) {
  const invMap = {};
  inventory.forEach((i) => { if (i.sku) invMap[i.sku.toLowerCase()] = i.quantity || 0; });

  const ingredientMap = {};
  const packagingMap = {};
  const warnings = [];

  selectedItems.forEach(({ sku, qty, product_name }) => {
    const recipe = recipes.find((r) => r.sku?.toLowerCase() === sku?.toLowerCase() && r.active !== false);
    if (!recipe) {
      warnings.push(`No active recipe found for SKU "${sku}" (${product_name})`);
      return;
    }
    const batchSize = recipe.batch_size || 1;
    const batches = Math.ceil(qty / batchSize);

    (recipe.ingredients || []).forEach((ing) => {
      const key = (ing.sku || ing.material || "").toLowerCase();
      if (!key) return;
      const required = roundQ((ing.qty || 0) * batches);
      if (!ingredientMap[key]) {
        ingredientMap[key] = {
          name: ing.material || ing.sku,
          sku: ing.sku,
          unit: ing.unit || "",
          required: 0,
          onHand: roundQ(invMap[key] || 0),
        };
      }
      ingredientMap[key].required = roundQ(ingredientMap[key].required + required);
    });

    (recipe.packaging || []).forEach((pkg) => {
      const key = (pkg.sku || "").toLowerCase();
      if (!key) return;
      const required = roundQ((pkg.qty_per_unit || 0) * qty);
      if (!packagingMap[key]) {
        packagingMap[key] = {
          name: pkg.name || pkg.sku,
          sku: pkg.sku,
          unit: "pcs",
          required: 0,
          onHand: roundQ(invMap[key] || 0),
        };
      }
      packagingMap[key].required = roundQ(packagingMap[key].required + required);
    });
  });

  const ingredients = Object.values(ingredientMap).map((m) => ({
    ...m, sufficient: m.onHand >= m.required, shortfall: roundQ(Math.max(0, m.required - m.onHand)),
  }));
  const packaging = Object.values(packagingMap).map((m) => ({
    ...m, sufficient: m.onHand >= m.required, shortfall: roundQ(Math.max(0, m.required - m.onHand)),
  }));

  return { ingredients, packaging, warnings };
}

// ── Print ─────────────────────────────────────────────────────────────────────

function printRunSheet(selectedItems, materials, date) {
  const { ingredients, packaging, warnings } = materials;
  const shortIng = ingredients.filter((m) => !m.sufficient);
  const shortPkg = packaging.filter((m) => !m.sufficient);

  const rows = (arr) => arr.map((m) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 10px">${m.name}${m.sku ? ` <span style="color:#9ca3af;font-size:11px">(${m.sku})</span>` : ""}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${m.required.toLocaleString()} ${m.unit}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${m.onHand.toLocaleString()} ${m.unit}</td>
      <td style="padding:6px 10px;text-align:center;color:${m.sufficient ? "#16a34a" : "#dc2626"};font-weight:600">${m.sufficient ? "✓ OK" : `−${m.shortfall.toLocaleString()}`}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><title>Production Run Sheet</title>
  <style>
    body{font-family:system-ui,sans-serif;color:#111;margin:0;padding:24px}
    h1{font-size:22px;font-weight:700;margin:0 0 4px}
    h2{font-size:15px;font-weight:600;margin:20px 0 8px;color:#374151;border-bottom:2px solid #f97316;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#f3f4f6;text-align:left;padding:6px 10px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
    .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
    .warn{background:#fef3c7;color:#92400e}
    .short{background:#fee2e2;color:#991b1b}
    @media print{body{padding:8px}}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
    <div>
      <h1>Production Run Sheet</h1>
      <p style="color:#6b7280;margin:0;font-size:13px">Generated ${date}</p>
    </div>
    <div style="text-align:right;font-size:13px;color:#374151">
      <div><strong>${selectedItems.length}</strong> SKU${selectedItems.length !== 1 ? "s" : ""}</div>
    </div>
  </div>

  <h2>SKUs in This Run</h2>
  <table>
    <thead><tr><th>Product</th><th>SKU</th><th style="text-align:right">Qty Needed</th></tr></thead>
    <tbody>
      ${selectedItems.map((s) => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:6px 10px">${s.product_name}</td>
        <td style="padding:6px 10px;font-family:monospace;color:#ea580c">${s.sku}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:600">${s.qty.toLocaleString()}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <h2>Aggregate Ingredients</h2>
  ${ingredients.length === 0 ? '<p style="color:#9ca3af;font-size:13px">No ingredients found.</p>' : `
  <table>
    <thead><tr><th>Ingredient</th><th style="text-align:right">Required</th><th style="text-align:right">On Hand</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${rows(ingredients)}</tbody>
  </table>`}

  <h2>Aggregate Packaging</h2>
  ${packaging.length === 0 ? '<p style="color:#9ca3af;font-size:13px">No packaging found.</p>' : `
  <table>
    <thead><tr><th>Packaging Item</th><th style="text-align:right">Required</th><th style="text-align:right">On Hand</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${rows(packaging)}</tbody>
  </table>`}

  ${(shortIng.length > 0 || shortPkg.length > 0) ? `
  <h2 style="color:#dc2626">Shortfall Summary</h2>
  <table>
    <thead><tr><th>Item</th><th>Type</th><th style="text-align:right">Shortfall</th></tr></thead>
    <tbody>
      ${[...shortIng.map(m=>({...m,type:"Ingredient"})), ...shortPkg.map(m=>({...m,type:"Packaging"}))].map(m=>`
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:6px 10px">${m.name}</td>
          <td style="padding:6px 10px"><span class="badge short">${m.type}</span></td>
          <td style="padding:6px 10px;text-align:right;color:#dc2626;font-weight:600">−${m.shortfall.toLocaleString()} ${m.unit}</td>
        </tr>`).join("")}
    </tbody>
  </table>` : ""}

  ${warnings.length > 0 ? `<div style="margin-top:16px;padding:10px 14px;background:#fef3c7;border-radius:6px;font-size:12px;color:#92400e">
    <strong>Warnings:</strong><br/>${warnings.join("<br/>")}
  </div>` : ""}

  <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between">
    <span>neōb Production Run Sheet · ${date}</span>
    <span>Operator: ___________________ &nbsp;&nbsp; Approved: ___________________</span>
  </div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
}

// ── SKU Selector ──────────────────────────────────────────────────────────────

function SKUSelector({ recipes, onAdd }) {
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState("");
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return recipes.slice(0, 40);
    const q = query.toLowerCase();
    return recipes.filter((r) => r.name?.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q));
  }, [recipes, query]);

  const handleAdd = () => {
    if (!selected || !qty || Number(qty) <= 0) return;
    onAdd({ sku: selected.sku, product_name: selected.name, qty: Number(qty) });
    setSelected(null);
    setQuery("");
    setQty("");
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {/* Product search */}
      <div className="relative flex-1" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <input
          className="w-full pl-9 pr-3 h-9 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-orange-500/50"
          placeholder="Search product or SKU to add..."
          value={selected ? `${selected.name} (${selected.sku})` : query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {open && (
          <div className="absolute z-50 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-56 overflow-y-auto">
            {filtered.length === 0
              ? <div className="px-3 py-3 text-xs text-zinc-500 text-center">No products found</div>
              : filtered.map((r) => (
                <button key={r.id} type="button" tabIndex={0}
                  onMouseDown={() => { setSelected(r); setQuery(""); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-700 transition-colors flex items-center gap-3"
                >
                  <span className="font-mono text-xs text-orange-400 shrink-0">{r.sku}</span>
                  <span className="text-sm text-zinc-200 truncate">{r.name}</span>
                </button>
              ))
            }
          </div>
        )}
      </div>

      {/* Qty */}
      <Input
        type="number"
        min="1"
        placeholder="Qty"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="w-24 bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
      />

      <Button
        onClick={handleAdd}
        disabled={!selected || !qty || Number(qty) <= 0}
        className="bg-orange-500 hover:bg-orange-600 text-white h-9 px-4"
      >
        <Plus className="w-4 h-4 mr-1" /> Add
      </Button>
    </div>
  );
}

// ── Materials Table ───────────────────────────────────────────────────────────

function MaterialsTable({ rows, title, icon: Icon, color }) {
  const [collapsed, setCollapsed] = useState(false);
  const shortCount = rows.filter((r) => !r.sufficient).length;

  return (
    <div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between mb-2 group"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-sm font-semibold text-zinc-200">{title}</span>
          <span className="text-xs text-zinc-500">({rows.length} items)</span>
          {shortCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
              {shortCount} short
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
      </button>
      {!collapsed && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Item</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Required</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">On Hand</th>
                <th className="text-center px-4 py-2.5 text-xs text-zinc-500 font-medium w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-zinc-200">
                    {m.name}
                    {m.sku && <span className="text-xs text-zinc-600 ml-2 font-mono">{m.sku}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-300">
                    {m.required.toLocaleString()} <span className="text-zinc-500 text-xs">{m.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-300">
                    {m.onHand.toLocaleString()} <span className="text-zinc-500 text-xs">{m.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {m.sufficient
                      ? <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>
                      : <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium"><X className="w-3.5 h-3.5" />−{m.shortfall.toLocaleString()}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BatchPlannerTab() {
  const [selectedItems, setSelectedItems] = useState([]);

  const { data: recipes = [] } = useQuery({
    queryKey: ["planner_recipes"],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["planner_inventory"],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const activeRecipes = useMemo(() =>
    recipes.filter((r) => r.sku && r.name && r.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [recipes]
  );

  const handleAdd = (item) => {
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.sku === item.sku);
      if (existing) {
        return prev.map((i) => i.sku === item.sku ? { ...i, qty: i.qty + item.qty } : i);
      }
      return [...prev, item];
    });
  };

  const handleRemove = (sku) => setSelectedItems((prev) => prev.filter((i) => i.sku !== sku));

  const handleQtyChange = (sku, val) => {
    const n = Number(val);
    if (n <= 0) return;
    setSelectedItems((prev) => prev.map((i) => i.sku === sku ? { ...i, qty: n } : i));
  };

  const materials = useMemo(() =>
    selectedItems.length > 0 ? computeAggregateMaterials(selectedItems, recipes, inventory) : null,
    [selectedItems, recipes, inventory]
  );

  const totalShort = materials
    ? materials.ingredients.filter((m) => !m.sufficient).length + materials.packaging.filter((m) => !m.sufficient).length
    : 0;

  const handlePrint = () => {
    if (!materials) return;
    const date = new Date().toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
    printRunSheet(selectedItems, materials, date);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-orange-400" />
            Batch Planner
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Bundle multiple SKUs into a single production run and calculate all material requirements at once.
          </p>
        </div>
        {selectedItems.length > 0 && (
          <Button
            onClick={handlePrint}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Run Sheet
          </Button>
        )}
      </div>

      {/* SKU Selector */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4 space-y-4">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Add SKUs to This Run</p>
          <SKUSelector recipes={activeRecipes} onAdd={handleAdd} />

          {/* Selected Items */}
          {selectedItems.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              {selectedItems.map((item) => (
                <div key={item.sku} className="flex items-center gap-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-200 truncate block">{item.product_name}</span>
                    <span className="text-xs font-mono text-orange-400">{item.sku}</span>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => handleQtyChange(item.sku, e.target.value)}
                    className="w-24 bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
                  />
                  <span className="text-xs text-zinc-500 w-8">units</span>
                  <button
                    onClick={() => handleRemove(item.sku)}
                    className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedItems.length === 0 && (
            <div className="text-center py-6 text-zinc-600 text-sm">
              No SKUs added yet. Search and add products above.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Materials */}
      {materials && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5 space-y-5">
            {/* Status banner */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Aggregate Material Requirements</p>
              {totalShort === 0
                ? <span className="flex items-center gap-1.5 text-green-400 text-sm font-medium"><CheckCircle2 className="w-4 h-4" />All materials available</span>
                : <span className="flex items-center gap-1.5 text-red-400 text-sm font-medium"><AlertTriangle className="w-4 h-4" />{totalShort} item{totalShort !== 1 ? "s" : ""} short</span>
              }
            </div>

            {/* Warnings */}
            {materials.warnings.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm space-y-1">
                {materials.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{w}</div>
                ))}
              </div>
            )}

            {/* Ingredients */}
            {materials.ingredients.length > 0 && (
              <MaterialsTable
                rows={materials.ingredients}
                title="Ingredients"
                icon={FlaskConical}
                color="text-purple-400"
              />
            )}

            {/* Packaging */}
            {materials.packaging.length > 0 && (
              <MaterialsTable
                rows={materials.packaging}
                title="Packaging"
                icon={Package}
                color="text-blue-400"
              />
            )}

            {materials.ingredients.length === 0 && materials.packaging.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-4">No recipe data found for any added SKU.</p>
            )}

            {/* Print button (bottom) */}
            <div className="pt-2 border-t border-zinc-800 flex justify-end">
              <Button onClick={handlePrint} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Printer className="w-4 h-4 mr-2" />
                Print Run Sheet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}