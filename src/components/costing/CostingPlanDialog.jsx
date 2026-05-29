import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";
import { calculateCosting } from "./costingEngine";
import CostBreakdownPanel from "./CostBreakdownPanel";
import LineItemEditor from "./LineItemEditor";

const EMPTY = {
  plan_name: "",
  product_name: "",
  sku: "",
  recipe_id: "",
  batch_size: 1,
  batch_unit: "units",
  raw_materials_override: [],
  packaging_override: [],
  custom_overheads: [],
  labor_hours_per_batch: "",
  labor_cost_per_hour: "",
  shipping_cost_per_unit_override: "",
  other_variable_cost_per_unit_override: "",
  target_gp_percentage: "",
  wholesale_markup_percentage: "",
  private_brand_markup_percentage: "",
  retail_markup_percentage: "",
  notes: "",
  status: "draft",
};

export default function CostingPlanDialog({ open, onOpenChange, plan, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [recipes, setRecipes] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    base44.entities.Recipe.list().then(setRecipes).catch(() => setRecipes([]));
    base44.entities.Inventory.list().then(setInventory).catch(() => setInventory([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, ...(plan || {}) });
  }, [open, plan]);

  const inventoryBySku = useMemo(() => {
    const m = {};
    for (const i of inventory) if (i.sku) m[i.sku] = i;
    return m;
  }, [inventory]);

  const linkedRecipe = useMemo(
    () => recipes.find((r) => r.id === form.recipe_id),
    [recipes, form.recipe_id]
  );

  const breakdown = useMemo(
    () => calculateCosting(form, { recipe: linkedRecipe, inventoryBySku }),
    [form, linkedRecipe, inventoryBySku]
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form };
    // strip empty strings on numeric fields
    [
      "labor_hours_per_batch",
      "labor_cost_per_hour",
      "shipping_cost_per_unit_override",
      "other_variable_cost_per_unit_override",
      "target_gp_percentage",
      "wholesale_markup_percentage",
      "private_brand_markup_percentage",
      "retail_markup_percentage",
    ].forEach((k) => {
      if (payload[k] === "" || payload[k] == null) delete payload[k];
    });
    if (!payload.recipe_id) delete payload.recipe_id;

    if (plan?.id) {
      await base44.entities.ProductCostingPlan.update(plan.id, payload);
    } else {
      await base44.entities.ProductCostingPlan.create(payload);
    }
    setSaving(false);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>{plan?.id ? "Edit Costing Plan" : "New Costing Plan"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Basics */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400">Plan Name *</label>
                <Input value={form.plan_name} onChange={(e) => set("plan_name", e.target.value)} className="bg-zinc-950 border-zinc-800" />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Status</label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="finalized">Finalized</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-zinc-400">Product Name *</label>
                <Input value={form.product_name} onChange={(e) => set("product_name", e.target.value)} className="bg-zinc-950 border-zinc-800" />
              </div>
              <div>
                <label className="text-xs text-zinc-400">SKU *</label>
                <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} className="bg-zinc-950 border-zinc-800" />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Batch Size *</label>
                <Input type="number" step="any" value={form.batch_size} onChange={(e) => set("batch_size", Number(e.target.value))} className="bg-zinc-950 border-zinc-800" />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Batch Unit *</label>
                <Select value={form.batch_unit} onValueChange={(v) => set("batch_unit", v)}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="units">units</SelectItem>
                    <SelectItem value="litres">litres</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-400">Link Existing Recipe (optional)</label>
                <Select value={form.recipe_id || "none"} onValueChange={(v) => set("recipe_id", v === "none" ? "" : v)}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="none">None</SelectItem>
                    {recipes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.sku} — {r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkedRecipe && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Defaults pulled from recipe: ingredients, packaging, labor. Override below to customize.
                  </p>
                )}
              </div>
            </div>

            <Tabs defaultValue="materials" className="w-full">
              <TabsList className="bg-zinc-950 border border-zinc-800">
                <TabsTrigger value="materials">Materials</TabsTrigger>
                <TabsTrigger value="packaging">Packaging</TabsTrigger>
                <TabsTrigger value="labor">Labor</TabsTrigger>
                <TabsTrigger value="overhead">Overhead</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
              </TabsList>

              <TabsContent value="materials" className="pt-4">
                <LineItemEditor
                  title="Raw Materials (per batch)"
                  items={form.raw_materials_override}
                  onChange={(v) => set("raw_materials_override", v)}
                  fields={[
                    { key: "material_sku", label: "SKU", width: "1fr" },
                    { key: "material_name", label: "Name", width: "2fr" },
                    { key: "quantity_per_batch", label: "Qty / Batch", type: "number", width: "1fr" },
                    { key: "unit_of_measure", label: "Unit", width: "0.7fr" },
                    { key: "cost_per_unit_override", label: "Cost/Unit Override", type: "number", width: "1fr" },
                  ]}
                />
                <p className="text-xs text-zinc-500 mt-2">Leave Cost/Unit Override blank to pull from Inventory by SKU.</p>
              </TabsContent>

              <TabsContent value="packaging" className="pt-4">
                <LineItemEditor
                  title="Packaging (per finished unit)"
                  items={form.packaging_override}
                  onChange={(v) => set("packaging_override", v)}
                  fields={[
                    { key: "packaging_sku", label: "SKU", width: "1fr" },
                    { key: "packaging_name", label: "Name", width: "2fr" },
                    { key: "quantity_per_unit", label: "Qty / Unit", type: "number", width: "1fr" },
                    { key: "cost_per_unit_override", label: "Cost/Unit Override", type: "number", width: "1fr" },
                  ]}
                />
              </TabsContent>

              <TabsContent value="labor" className="pt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400">Labor Hours / Batch</label>
                  <Input type="number" step="any" value={form.labor_hours_per_batch} onChange={(e) => set("labor_hours_per_batch", e.target.value === "" ? "" : Number(e.target.value))} placeholder={linkedRecipe?.estimated_labor_hours_per_batch ?? ""} className="bg-zinc-950 border-zinc-800" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Labor Cost / Hour (CAD)</label>
                  <Input type="number" step="any" value={form.labor_cost_per_hour} onChange={(e) => set("labor_cost_per_hour", e.target.value === "" ? "" : Number(e.target.value))} placeholder={linkedRecipe?.cost_per_labor_hour ?? ""} className="bg-zinc-950 border-zinc-800" />
                </div>
              </TabsContent>

              <TabsContent value="overhead" className="pt-4 space-y-4">
                <LineItemEditor
                  title="Custom Overheads (per batch)"
                  items={form.custom_overheads}
                  onChange={(v) => set("custom_overheads", v)}
                  addLabel="Add Overhead"
                  fields={[
                    { key: "name", label: "Name (e.g. Hydro, Rent)", width: "2fr" },
                    { key: "cost_per_batch", label: "Cost / Batch", type: "number", width: "1fr" },
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400">Shipping Cost / Unit</label>
                    <Input type="number" step="any" value={form.shipping_cost_per_unit_override} onChange={(e) => set("shipping_cost_per_unit_override", e.target.value === "" ? "" : Number(e.target.value))} className="bg-zinc-950 border-zinc-800" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400">Other Variable / Unit</label>
                    <Input type="number" step="any" value={form.other_variable_cost_per_unit_override} onChange={(e) => set("other_variable_cost_per_unit_override", e.target.value === "" ? "" : Number(e.target.value))} className="bg-zinc-950 border-zinc-800" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="pricing" className="pt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400">Target GP %</label>
                  <Input type="number" step="any" value={form.target_gp_percentage} onChange={(e) => set("target_gp_percentage", e.target.value === "" ? "" : Number(e.target.value))} className="bg-zinc-950 border-zinc-800" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Wholesale Markup %</label>
                  <Input type="number" step="any" value={form.wholesale_markup_percentage} onChange={(e) => set("wholesale_markup_percentage", e.target.value === "" ? "" : Number(e.target.value))} className="bg-zinc-950 border-zinc-800" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Private Brand Markup %</label>
                  <Input type="number" step="any" value={form.private_brand_markup_percentage} onChange={(e) => set("private_brand_markup_percentage", e.target.value === "" ? "" : Number(e.target.value))} className="bg-zinc-950 border-zinc-800" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Retail Markup %</label>
                  <Input type="number" step="any" value={form.retail_markup_percentage} onChange={(e) => set("retail_markup_percentage", e.target.value === "" ? "" : Number(e.target.value))} className="bg-zinc-950 border-zinc-800" />
                </div>
              </TabsContent>
            </Tabs>

            <div>
              <label className="text-xs text-zinc-400">Notes</label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="bg-zinc-950 border-zinc-800" rows={3} />
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-0">
              <CostBreakdownPanel breakdown={breakdown} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.plan_name || !form.product_name || !form.sku}>
            {saving ? "Saving..." : "Save Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}