import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { Trash2, Upload, X, Save } from "lucide-react";

export default function BinDetailPanel({ bin, inventoryItems, onUpdate, onDelete, onClose }) {
  const [form, setForm] = useState(bin);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setForm(bin); }, [bin]);

  const itemsInBin = inventoryItems.filter(i => i.location === bin.name);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm({ ...form, photo_url: file_url });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => onUpdate(form);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Edit Bin</h3>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Location ID *</label>
          <Input
            value={form.name || ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-zinc-800 border-zinc-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Type</label>
            <Select value={form.type || "bin"} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bin">Bin</SelectItem>
                <SelectItem value="rack">Rack</SelectItem>
                <SelectItem value="shelf">Shelf</SelectItem>
                <SelectItem value="pallet">Pallet</SelectItem>
                <SelectItem value="zone">Zone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Color</label>
            <input
              type="color"
              value={form.color || "#f97316"}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-full h-9 bg-zinc-800 border border-zinc-700 rounded cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Width (px)</label>
            <Input type="number" value={form.width || 80}
              onChange={(e) => setForm({ ...form, width: Number(e.target.value) })}
              className="bg-zinc-800 border-zinc-700" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Height (px)</label>
            <Input type="number" value={form.height || 60}
              onChange={(e) => setForm({ ...form, height: Number(e.target.value) })}
              className="bg-zinc-800 border-zinc-700" />
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Photo</label>
          {form.photo_url && (
            <img src={form.photo_url} alt="" className="w-full h-32 object-cover rounded-md mb-2" />
          )}
          <label className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md cursor-pointer hover:bg-zinc-700 text-sm text-zinc-300">
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading..." : form.photo_url ? "Replace Photo" : "Upload Photo"}
            <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" disabled={uploading} />
          </label>
        </div>

        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Notes</label>
          <Input value={form.notes || ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="bg-zinc-800 border-zinc-700" />
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <p className="text-xs text-zinc-500 mb-2">Items in this location ({itemsInBin.length})</p>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {itemsInBin.length === 0 ? (
            <p className="text-xs text-zinc-600 italic">No items assigned. Set inventory item's location to "{bin.name}".</p>
          ) : itemsInBin.map(item => (
            <div key={item.id} className="flex items-center gap-2 text-sm bg-zinc-800 rounded p-2">
              {item.component_photo && (
                <img src={item.component_photo} alt="" className="w-8 h-8 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-zinc-200 truncate">{item.name}</p>
                <p className="text-xs text-zinc-500">{item.sku} · {item.quantity} {item.unit}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} className="flex-1 bg-orange-500 hover:bg-orange-600">
          <Save className="w-4 h-4 mr-2" /> Save
        </Button>
        <Button variant="outline" onClick={() => onDelete(bin.id)} className="border-red-700 text-red-400 hover:bg-red-500/10">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}