import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, Tag } from "lucide-react";

export default function PackagingSkuSelect({ inventory, labels = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  // Filter for packaging items only
  const packagingItems = inventory.filter(i => i.type === 'packaging');

  // Combine packaging inventory + labels into one list
  const allItems = [
    ...packagingItems.map(i => ({ ...i, _source: 'inventory' })),
    ...labels.map(l => ({ sku: l.sku, name: l.name, quantity: l.current_quantity, unit: 'labels', _source: 'label', _label: true })),
  ];
  
  const filtered = allItems.filter(item =>
    item.sku?.toLowerCase().includes(search.toLowerCase()) ||
    item.name?.toLowerCase().includes(search.toLowerCase())
  );

  const selected = allItems.find(i => i.sku === value);

  return (
    <div className="relative">
      <div
        className="flex items-center justify-between px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md cursor-pointer hover:border-zinc-600"
        onClick={() => setOpen(!open)}
      >
        <span className={selected ? "text-zinc-200" : "text-zinc-500"}>
          {selected ? `${selected.sku} - ${selected.name}` : "Select packaging..."}
        </span>
        <ChevronDown className="w-4 h-4 text-zinc-500" />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg">
          <div className="p-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packaging..."
              className="bg-zinc-900 border-zinc-700"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">No packaging items found</div>
            ) : (
              filtered.map((item, idx) => (
                <div
                  key={item.sku + idx}
                  className="px-3 py-2 cursor-pointer hover:bg-zinc-700 flex justify-between items-center"
                  onClick={() => {
                    onChange(item.sku, item);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <div className="flex items-center gap-2">
                    {item._label && <Tag className="w-3 h-3 text-orange-400 shrink-0" />}
                    <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                    <span className="text-zinc-300 ml-1">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item._label && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">Label</span>}
                    <span className="text-xs text-zinc-500">{item.quantity} {item.unit}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}