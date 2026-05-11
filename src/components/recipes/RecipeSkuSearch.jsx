import React, { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

export default function RecipeSkuSearch({ inventory, value, onChange, onSelect, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const finishedProducts = useMemo(() => {
    return (inventory || []).filter(i => i.type === "finished_product" || i.type === "private_brand");
  }, [inventory]);

  const results = useMemo(() => {
    if (!query.trim()) return finishedProducts.slice(0, 15);
    const q = query.toLowerCase();
    return finishedProducts
      .filter(i =>
        i.sku?.toLowerCase().includes(q) ||
        i.supplier_sku?.toLowerCase().includes(q) ||
        i.name?.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [query, finishedProducts]);

  const handleSelect = (item) => {
    setQuery(item.supplier_sku || item.sku);
    onChange(item.supplier_sku || item.sku);
    onSelect(item);
    setOpen(false);
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    setOpen(true);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || "Search SKU or product name..."}
          className="bg-zinc-800 border-zinc-700 pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); onChange(""); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-3 py-2 hover:bg-zinc-700 transition-colors flex items-center justify-between gap-2 border-b border-zinc-700/50 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm text-zinc-200 truncate">{item.name}</p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  SKU: {item.supplier_sku || item.sku}
                  {item.supplier_sku && item.sku !== item.supplier_sku && (
                    <span className="ml-2 text-zinc-600">UPC: {item.sku}</span>
                  )}
                </p>
              </div>
              <span className="text-xs text-zinc-500 shrink-0">{item.quantity ?? 0} on hand</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}