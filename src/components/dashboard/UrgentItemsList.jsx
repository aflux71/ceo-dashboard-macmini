import React from "react";
import { AlertTriangle } from "lucide-react";

export default function UrgentItemsList({ items, title }) {
  if (!items || items.length === 0) {
    return (
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
        <p className="text-zinc-500 text-sm">No urgent items</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="font-semibold text-zinc-200">{title}</span>
        <span className="text-xs text-zinc-500">({items.length})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        {items.slice(0, 10).map((item, idx) => (
          <div key={idx} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs font-semibold text-zinc-300 shrink-0">
                {item.sku}
              </span>
              <span className="text-sm text-zinc-500 truncate">
                {item.name}
              </span>
            </div>
            <span className={`text-sm font-semibold shrink-0 ml-2 ${
              item.days_until_stockout <= 0 ? 'text-red-500' : 
              item.days_until_stockout <= 7 ? 'text-amber-500' : 'text-zinc-400'
            }`}>
              {item.days_until_stockout <= 0 ? 'OUT' : `${item.days_until_stockout}d`}
            </span>
          </div>
        ))}
      </div>
      {items.length > 10 && (
        <p className="text-xs text-zinc-500 mt-2 text-right">
          +{items.length - 10} more items
        </p>
      )}
    </div>
  );
}