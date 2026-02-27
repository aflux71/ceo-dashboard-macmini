import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";

export default function PackagingSkuSelect({ inventory, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  // Filter for packaging items only
  const packagingItems = inventory.filter(i => i.type === 'packaging');
  
  const filtered = packagingItems.filter(item =>
    item.sku?.toLowerCase().includes(search.toLowerCase()) ||
    item.name?.toLowerCase().includes(search.toLowerCase())
  );

  const selected = packagingItems.find(i => i.sku === value);

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
              filtered.map((item) => (
                <div
                  key={item.id}
                  className="px-3 py-2 cursor-pointer hover:bg-zinc-700 flex justify-between items-center"
                  onClick={() => {
                    onChange(item.sku, item);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <div>
                    <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                    <span className="text-zinc-300 ml-2">{item.name}</span>
                  </div>
                  <span className="text-xs text-zinc-500">{item.quantity} {item.unit}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}