import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const TYPES = [
  { value: "raw_material", label: "Raw Material" },
  { value: "packaging", label: "Packaging" },
  { value: "finished_product", label: "Finished Product" },
  { value: "private_brand", label: "Private Brand" },
];

const UNITS = ["units", "kg", "g", "L", "mL", "oz", "lb", "ea", "box", "case", "roll"];

export default function QuickCreateProductDialog({ open, onOpenChange, defaultSupplier, defaultName, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    type: "raw_material",
    unit: "units",
    quantity: 0,
    cost_per_unit: 0,
    supplier: "",
    supplier_sku: "",
  });

  useEffect(() => {
    if (open) {
      setForm((f) => ({
        ...f,
        sku: "",
        name: defaultName || "",
        supplier: defaultSupplier || "",
        supplier_sku: "",
        quantity: 0,
        cost_per_unit: 0,
      }));
    }
  }, [open, defaultSupplier, defaultName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        sku: form.sku.trim() || `AUTO-${Date.now()}`,
        quantity: Number(form.quantity) || 0,
        cost_per_unit: Number(form.cost_per_unit) || 0,
      };
      const created = await base44.entities.Inventory.create(payload);
      toast.success(`${created.name} added to inventory`);
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.message || "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick Add Product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
                placeholder="Product name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="bg-zinc-800 border-zinc-700 font-mono"
                placeholder="Auto-generated if blank"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit Cost</Label>
              <Input
                type="number"
                step="0.01"
                value={form.cost_per_unit}
                onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Input
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Supplier SKU</Label>
              <Input
                value={form.supplier_sku}
                onChange={(e) => setForm({ ...form, supplier_sku: e.target.value })}
                className="bg-zinc-800 border-zinc-700 font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            This creates a minimal inventory record. Edit later from the Inventory page for full details.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={saving}>
              {saving ? "Creating..." : "Create & Add to PO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}