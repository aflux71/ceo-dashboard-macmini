import React from "react";
import { Input } from "@/components/ui/input";
import { rangeCount, formatSerialRange } from "./serialUtils";

// Compact inline serial range editor for a single PO line item.
// Props:
//   item            — { serial_prefix, serial_start, serial_end, serial_padding, quantity }
//   onChange(field, value) — called when a field changes
//   compact         — when true, render in a single row (used inside tables)
export default function SerialRangeInputs({ item, onChange, compact = false }) {
  const count = rangeCount(item.serial_start, item.serial_end);
  const expected = Number(item.quantity || 0);
  const mismatch = count > 0 && expected > 0 && count !== expected;
  const preview = formatSerialRange(
    item.serial_prefix,
    item.serial_start,
    item.serial_end,
    item.serial_padding || 4
  );

  const wrapper = compact ? "flex flex-wrap items-center gap-2" : "grid grid-cols-4 gap-2";

  return (
    <div className="space-y-1">
      <div className={wrapper}>
        <Input
          placeholder="Prefix"
          value={item.serial_prefix || ""}
          onChange={(e) => onChange("serial_prefix", e.target.value)}
          className="bg-zinc-800 border-zinc-700 h-7 text-xs w-24"
        />
        <Input
          type="number"
          placeholder="Start #"
          value={item.serial_start ?? ""}
          onChange={(e) => onChange("serial_start", e.target.value === "" ? undefined : Number(e.target.value))}
          className="bg-zinc-800 border-zinc-700 h-7 text-xs w-24"
        />
        <Input
          type="number"
          placeholder="End #"
          value={item.serial_end ?? ""}
          onChange={(e) => onChange("serial_end", e.target.value === "" ? undefined : Number(e.target.value))}
          className="bg-zinc-800 border-zinc-700 h-7 text-xs w-24"
        />
        <Input
          type="number"
          placeholder="Padding"
          value={item.serial_padding ?? 4}
          onChange={(e) => onChange("serial_padding", Number(e.target.value) || 0)}
          className="bg-zinc-800 border-zinc-700 h-7 text-xs w-20"
          min={0}
          max={10}
        />
      </div>
      {preview && (
        <div className="text-[11px] text-zinc-500">
          {preview}
          <span className="ml-2">
            ({count} serial{count !== 1 ? "s" : ""})
          </span>
          {mismatch && (
            <span className="ml-2 text-amber-400">
              ⚠ does not match quantity ({expected})
            </span>
          )}
        </div>
      )}
    </div>
  );
}