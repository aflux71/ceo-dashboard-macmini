import React, { useState, useMemo } from "react";
import { Search, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import Badge from "@/components/ui/Badge";

export default function BatchSelector({ batches, selectedId, onSelect }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(
      (b) =>
        b.batch_id?.toLowerCase().includes(q) ||
        b.product_name?.toLowerCase().includes(q) ||
        b.sku?.toLowerCase().includes(q)
    );
  }, [batches, search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search batch ID, SKU, or product…"
          className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-100 h-11"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-zinc-500">No batches awaiting QC</div>
        ) : (
          filtered.map((b) => {
            const active = selectedId === b.id;
            return (
              <button
                key={b.id}
                onClick={() => onSelect(b)}
                className={`w-full text-left px-3 py-2.5 transition-colors flex items-center justify-between gap-3 ${
                  active ? "bg-orange-500/10" : "hover:bg-zinc-800/50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Package className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-sm font-medium text-zinc-100 truncate">
                      {b.product_name}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-zinc-500">{b.batch_id}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={b.status === "pending_qc" ? "amber" : "blue"}>
                    {b.status === "pending_qc" ? "QC Hold" : b.status}
                  </Badge>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}