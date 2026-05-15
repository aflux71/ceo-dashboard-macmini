import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Plus, X } from "lucide-react";

const blank = {
  store_name: "",
  contact_name: "",
  contact_email: "",
  account_type: "store",
  access_code: "",
  is_active: true,
  assigned_stores: [],
};

export default function PortalAccountDialog({ open, onOpenChange, onSave, editing, generateCode }) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [newStore, setNewStore] = useState("");

  useEffect(() => {
    if (open) {
      const base = editing ? { ...blank, ...editing } : { ...blank, access_code: generateCode() };
      if (!Array.isArray(base.assigned_stores)) base.assigned_stores = [];
      setForm(base);
      setNewStore("");
    }
  }, [open, editing, generateCode]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addAssignedStore = () => {
    const name = newStore.trim();
    if (!name) return;
    if ((form.assigned_stores || []).includes(name)) { setNewStore(""); return; }
    set("assigned_stores", [...(form.assigned_stores || []), name]);
    setNewStore("");
  };

  const removeAssignedStore = (name) => {
    set("assigned_stores", (form.assigned_stores || []).filter((s) => s !== name));
  };

  const handleSubmit = async () => {
    if (!form.store_name.trim()) { alert("Store name is required."); return; }
    if (!form.access_code || form.access_code.length < 4) { alert("Access code is required."); return; }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editing ? "Edit Store Account" : "New Store Account"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-zinc-300 mb-1.5 block">Store Name *</Label>
            <Input
              value={form.store_name}
              onChange={(e) => set("store_name", e.target.value)}
              placeholder="e.g. neōb Niagara"
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300 mb-1.5 block">Contact Name</Label>
              <Input
                value={form.contact_name}
                onChange={(e) => set("contact_name", e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-300 mb-1.5 block">Account Type</Label>
              <Select value={form.account_type} onValueChange={(v) => set("account_type", v)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="store">Store</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-zinc-300 mb-1.5 block">Contact Email</Label>
            <Input
              type="email"
              value={form.contact_email}
              onChange={(e) => set("contact_email", e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>

          <div>
            <Label className="text-zinc-300 mb-1.5 block">Access Code *</Label>
            <div className="flex gap-2">
              <Input
                value={form.access_code}
                onChange={(e) => set("access_code", e.target.value.toUpperCase())}
                maxLength={6}
                className="bg-zinc-800 border-zinc-700 text-white font-mono uppercase tracking-widest"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => set("access_code", generateCode())}
                className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                title="Generate new code"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mt-1">6-character alphanumeric code the store uses to log in.</p>
          </div>

          <div className="pt-2 border-t border-zinc-800">
            <Label className="text-zinc-300 mb-1.5 block">Assigned Stores</Label>
            <p className="text-xs text-zinc-500 mb-2">
              Stores this login can place orders for. If empty, only "{form.store_name || "the primary store"}" is used.
              When multiple stores are listed, the user will pick one after logging in.
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(form.assigned_stores || []).length === 0 ? (
                <span className="text-xs text-zinc-600">No additional stores assigned.</span>
              ) : (
                form.assigned_stores.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-full pl-3 pr-1 py-1 text-xs text-white">
                    {s}
                    <button
                      type="button"
                      onClick={() => removeAssignedStore(s)}
                      className="w-5 h-5 rounded-full hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newStore}
                onChange={(e) => setNewStore(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAssignedStore(); } }}
                placeholder="Store name to add"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addAssignedStore}
                className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label className="text-zinc-300">Account Active</Label>
            <Switch checked={!!form.is_active} onCheckedChange={(v) => set("is_active", v)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {saving ? "Saving..." : editing ? "Save Changes" : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}