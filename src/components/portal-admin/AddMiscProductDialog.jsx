import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function AddMiscProductDialog({ open, onOpenChange, onSave, editing }) {
  const [form, setForm] = useState({
    name: "", sku: "", category: "", description: "", image_url: "", display_order: ""
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name || "",
        sku: editing.sku || "",
        category: editing.category || "",
        description: editing.description || "",
        image_url: editing.image_url || "",
        display_order: editing.display_order ?? ""
      });
    } else {
      setForm({ name: "", sku: "", category: "", description: "", image_url: "", display_order: "" });
    }
  }, [editing, open]);

  const handleSave = () => {
    if (!form.name || !form.sku) return;
    onSave({
      ...form,
      display_order: form.display_order === "" ? null : Number(form.display_order),
      source: "misc_only"
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Product" : "Add Misc Product"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-zinc-300">Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
          </div>
          <div>
            <Label className="text-zinc-300">SKU *</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
          </div>
          <div>
            <Label className="text-zinc-300">Category</Label>
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
          </div>
          <div>
            <Label className="text-zinc-300">Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
          </div>
          <div>
            <Label className="text-zinc-300">Image URL</Label>
            <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
          </div>
          <div>
            <Label className="text-zinc-300">Display Order</Label>
            <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Cancel</Button>
          <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600 text-white">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}