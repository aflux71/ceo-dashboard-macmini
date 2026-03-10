import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function AddAliasModal({ open, onOpenChange, onSubmit, isPending, prefill }) {
  const [form, setForm] = useState({ primary_sku: "", alias_sku: "", product_name: "", reason: "" });

  useEffect(() => {
    if (open && prefill) {
      setForm({ primary_sku: prefill.primary_sku || "", alias_sku: prefill.alias_sku || "", product_name: prefill.product_name || "", reason: prefill.reason || "" });
    } else if (open) {
      setForm({ primary_sku: "", alias_sku: "", product_name: "", reason: "" });
    }
  }, [open, prefill]);

  const canSubmit = form.primary_sku.trim() && form.alias_sku.trim() && form.product_name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader><DialogTitle>Add Alias Pair</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Primary SKU *</Label>
            <Input value={form.primary_sku} onChange={(e) => setForm({ ...form, primary_sku: e.target.value })} placeholder="e.g. 3216" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Alias SKU (duplicate to suppress) *</Label>
            <Input value={form.alias_sku} onChange={(e) => setForm({ ...form, alias_sku: e.target.value })} placeholder="e.g. 000000003216" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Product Name *</Label>
            <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="Product name" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Reason</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. barcode vs variant SKU" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700">Cancel</Button>
          <Button onClick={() => onSubmit(form)} disabled={!canSubmit || isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Add Alias Pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}