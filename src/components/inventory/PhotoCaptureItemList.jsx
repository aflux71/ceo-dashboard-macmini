import React, { useState } from "react";
import { Search, Play, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORY_ORDER = ["packaging", "Lids and Caps", "label", "Labels", "raw_material", "other"];

export default function PhotoCaptureItemList({ items, onSelectItem, onStart, capturedInSession = {} }) {
  const [search, setSearch] = useState("");

  const filtered = items.filter(item =>
    !search ||
    item.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.sku?.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    const orderA = CATEGORY_ORDER.indexOf(a.type) !== -1 ? CATEGORY_ORDER.indexOf(a.type) : CATEGORY_ORDER.length;
    const orderB = CATEGORY_ORDER.indexOf(b.type) !== -1 ? CATEGORY_ORDER.indexOf(b.type) : CATEGORY_ORDER.length;
    return orderA - orderB;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg font-bold text-zinc-100 mb-1">Missing Photos</h2>
        <p className="text-sm text-zinc-400">{items.length} items need photos</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-zinc-800 border-zinc-700 h-10"
        />
      </div>

      {/* Item List */}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-zinc-500 py-8">No items found</p>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="w-full text-left p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors flex items-start justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-zinc-100 truncate">{item.name}</p>
                <p className="text-xs text-zinc-500">
                  {item.sku} · {item.type || "other"}
                </p>
                {item.reorder_point && (
                  <p className="text-xs text-zinc-600 mt-1">
                    Min: {item.reorder_point} · Stock: {item.quantity}
                  </p>
                )}
              </div>
              {capturedInSession[item.id] && (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 ml-2" />
              )}
            </button>
          ))
        )}
      </div>

      {/* Start Button */}
      {items.length > 0 && (
        <Button
          onClick={() => onStart(filtered[0])}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12"
        >
          <Play className="w-4 h-4 mr-2" />
          Start Capturing
        </Button>
      )}
    </div>
  );
}