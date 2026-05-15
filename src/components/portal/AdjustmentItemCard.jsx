import React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { X } from "lucide-react";

export default function AdjustmentItemCard({ item, reasons, onChange, onRemove }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">{item.product_name}</div>
          <div className="text-xs text-zinc-500">SKU: {item.sku}</div>
        </div>
        <button
          onClick={() => onRemove(item.product_id)}
          className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          aria-label="Remove"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Qty</label>
          <Input
            type="number"
            value={item.quantity === 0 || item.quantity ? item.quantity : ""}
            onChange={(e) => onChange(item.product_id, "quantity", e.target.value)}
            placeholder="e.g. -2 or +1"
            className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-orange-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">
            Reason <span className="text-red-400">*</span>
          </label>
          <Select
            value={item.adjustment_reason_id || ""}
            onValueChange={(val) => onChange(item.product_id, "adjustment_reason_id", val)}
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white focus:ring-orange-500">
              <SelectValue placeholder="Select reason..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              {reasons.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
          <Input
            value={item.notes || ""}
            onChange={(e) => onChange(item.product_id, "notes", e.target.value)}
            placeholder="Optional note for this item"
            className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-orange-500"
          />
        </div>
      </div>
    </div>
  );
}