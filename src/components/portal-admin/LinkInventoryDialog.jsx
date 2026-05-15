import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { Search } from "lucide-react";

export default function LinkInventoryDialog({ open, onOpenChange, onLink, existingInventoryIds = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    base44.entities.Inventory.filter({ type: { $in: ["finished_product", "private_brand"] }, active: true }, "name", 1000)
      .then((res) => setItems(res || []))
      .finally(() => setLoading(false));
    setSelected(new Set());
    setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (existingInventoryIds.includes(i.id)) return false;
      if (!q) return true;
      return (i.name || "").toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q);
    });
  }, [items, search, existingInventoryIds]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleLink = () => {
    const chosen = items.filter((i) => selected.has(i.id));
    onLink(chosen);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link Inventory Items to Portal</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search inventory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white"
          />
        </div>

        <div className="max-h-96 overflow-y-auto border border-zinc-800 rounded-lg">
          {loading ? (
            <div className="p-6 text-center text-zinc-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-zinc-500">No items found</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                    <td className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                        className="accent-orange-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-white">{item.name}</td>
                    <td className="px-3 py-2 text-zinc-400">{item.sku}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Cancel</Button>
          <Button onClick={handleLink} disabled={selected.size === 0} className="bg-orange-500 hover:bg-orange-600 text-white">
            Link {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}