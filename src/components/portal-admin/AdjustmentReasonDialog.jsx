import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function AdjustmentReasonDialog({ open, onOpenChange, reason, onSave }) {
  const [form, setForm] = useState({ label: "", description: "", display_order: 0, is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        label: reason?.label || "",
        description: reason?.description || "",
        display_order: reason?.display_order ?? 0,
        is_active: reason?.is_active ?? true
      });
    }
  }, [open, reason]);

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await onSave({
        label: form.label.trim(),
        description: form.description.trim(),
        display_order: Number(form.display_order) || 0,
        is_active: !!form.is_active
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{reason ? "Edit Reason" : "Add Reason"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-zinc-300">Label *</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Damaged"
              className="bg-zinc-800 border-zinc-700 text-white mt-1 focus-visible:ring-orange-500"
            />
          </div>
          <div>
            <Label className="text-zinc-300">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Optional description"
              className="bg-zinc-800 border-zinc-700 text-white mt-1 focus-visible:ring-orange-500"
            />
          </div>
          <div>
            <Label className="text-zinc-300">Display Order</Label>
            <Input
              type="number"
              value={form.display_order}
              onChange={(e) => setForm({ ...form, display_order: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-white mt-1 focus-visible:ring-orange-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-zinc-300">Active</Label>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.label.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}