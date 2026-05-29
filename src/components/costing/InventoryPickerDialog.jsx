import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function InventoryPickerDialog({ open, onOpenChange, inventory = [], filterTypes, onPick }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const items = filterTypes ? inventory.filter((i) => filterTypes.includes(i.type)) : inventory;
    const q = search.trim().toLowerCase();
    if (!q) return items.slice(0, 100);
    return items
      .filter(
        (i) =>
          i.sku?.toLowerCase().includes(q) ||
          i.name?.toLowerCase().includes(q) ||
          i.material_type?.toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [inventory, search, filterTypes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Select from Inventory</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            autoFocus
            placeholder="Search by name, SKU, or material type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-950 border-zinc-800"
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-zinc-800 border border-zinc-800 rounded-md">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">No matches.</div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onPick(item);
                  onOpenChange(false);
                  setSearch("");
                }}
                className="w-full text-left p-3 hover:bg-zinc-800/60 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-100 truncate">{item.name}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    SKU {item.sku} • {item.material_type || item.type}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono text-orange-400">
                    {item.cost_per_unit != null ? `$${Number(item.cost_per_unit).toFixed(4)}` : "—"}
                  </div>
                  <div className="text-xs text-zinc-500">per {item.unit || "unit"}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}