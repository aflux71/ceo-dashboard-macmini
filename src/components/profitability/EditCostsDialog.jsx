import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

export default function EditCostsDialog({ row, open, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setForm({
      // Recipe-level
      estimated_labor_hours_per_batch: row._recipe?.estimated_labor_hours_per_batch ?? "",
      cost_per_labor_hour: row._recipe?.cost_per_labor_hour ?? "",
      target_profit_margin_percentage: row._recipe?.target_profit_margin_percentage ?? "",
      // Inventory-level (finished product)
      retail_price: row._finishedProduct?.retail_price ?? "",
      wholesale_price: row._finishedProduct?.wholesale_price ?? "",
      // Overhead
      overhead_per_unit: row._overhead?.overhead_per_unit ?? "",
      packaging_cost_per_unit: row._overhead?.packaging_cost_per_unit ?? "",
      shipping_cost_per_unit: row._overhead?.shipping_cost_per_unit ?? "",
      other_variable_cost_per_unit: row._overhead?.other_variable_cost_per_unit ?? "",
      overhead_notes: row._overhead?.notes ?? "",
    });
  }, [row]);

  if (!row || !form) return null;

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const num = (v) => v === "" || v == null ? null : Number(v);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Update Recipe
      await base44.entities.Recipe.update(row._recipe.id, {
        estimated_labor_hours_per_batch: num(form.estimated_labor_hours_per_batch),
        cost_per_labor_hour: num(form.cost_per_labor_hour),
        target_profit_margin_percentage: num(form.target_profit_margin_percentage),
      });

      // 2. Update Inventory finished product (if exists)
      if (row._finishedProduct?.id) {
        await base44.entities.Inventory.update(row._finishedProduct.id, {
          retail_price: num(form.retail_price),
          wholesale_price: num(form.wholesale_price),
        });
      }

      // 3. Upsert OverheadCost
      const overheadData = {
        recipe_sku: row.sku,
        product_name: row.name,
        overhead_per_unit: num(form.overhead_per_unit) ?? 0,
        packaging_cost_per_unit: num(form.packaging_cost_per_unit) ?? 0,
        shipping_cost_per_unit: num(form.shipping_cost_per_unit) ?? 0,
        other_variable_cost_per_unit: num(form.other_variable_cost_per_unit) ?? 0,
        notes: form.overhead_notes || "",
      };
      if (row._overhead?.id) {
        await base44.entities.OverheadCost.update(row._overhead.id, overheadData);
      } else {
        await base44.entities.OverheadCost.create(overheadData);
      }

      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Save costs failed:", err);
      alert("Failed to save: " + (err.message || "unknown error"));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">
            Edit Pricing & Costs
            <div className="text-xs text-zinc-500 font-normal mt-0.5">{row.name} · {row.sku}</div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <Section title="Pricing (from Shopify or manual)">
            <Field label="Retail Price ($)" value={form.retail_price} onChange={(v) => set("retail_price", v)} />
            <Field label="Wholesale Price ($)" value={form.wholesale_price} onChange={(v) => set("wholesale_price", v)} />
          </Section>

          <Section title="Labor (Recipe)">
            <Field label="Labor hours per batch" value={form.estimated_labor_hours_per_batch} onChange={(v) => set("estimated_labor_hours_per_batch", v)} />
            <Field label="Cost per labor hour ($)" value={form.cost_per_labor_hour} onChange={(v) => set("cost_per_labor_hour", v)} />
          </Section>

          <Section title="Per-Unit Overhead (OverheadCost)">
            <Field label="Overhead per unit ($)" value={form.overhead_per_unit} onChange={(v) => set("overhead_per_unit", v)} />
            <Field label="Extra packaging per unit ($)" value={form.packaging_cost_per_unit} onChange={(v) => set("packaging_cost_per_unit", v)} />
            <Field label="Shipping per unit ($)" value={form.shipping_cost_per_unit} onChange={(v) => set("shipping_cost_per_unit", v)} />
            <Field label="Other variable per unit ($)" value={form.other_variable_cost_per_unit} onChange={(v) => set("other_variable_cost_per_unit", v)} />
            <div className="col-span-2">
              <label className="text-xs text-zinc-500 mb-1 block">Notes</label>
              <Input
                value={form.overhead_notes}
                onChange={(e) => set("overhead_notes", e.target.value)}
                placeholder="How these overheads were calculated…"
                className="bg-zinc-950 border-zinc-700 text-zinc-200"
              />
            </div>
          </Section>

          <Section title="Target">
            <Field label="Target profit margin %" value={form.target_profit_margin_percentage} onChange={(v) => set("target_profit_margin_percentage", v)} />
          </Section>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button variant="outline" onClick={onClose} disabled={saving} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-500 text-white">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <Input
        type="number"
        step="0.01"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-950 border-zinc-700 text-zinc-200"
      />
    </div>
  );
}