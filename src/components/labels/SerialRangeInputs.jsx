import React from "react";
import { Input } from "@/components/ui/input";
import { formatSerial } from "./serialUtils";

// Inline serial batch-number editor for a single PO line item.
// Model: one serial number identifies an entire batch (all units of this line share it).
// Props:
//   item            — { serial_prefix, serial_start, serial_padding }
//   onChange(field, value) — called when a field changes
//   compact         — when true, render in a single row
export default function SerialRangeInputs({ item, onChange, compact = false }) {
  const padding = item.serial_padding ?? 3;
  const preview = formatSerial(item.serial_prefix, item.serial_start, padding);

  const wrapper = compact ? "flex flex-wrap items-center gap-2" : "grid grid-cols-3 gap-2";

  // Keep serial_end == serial_start so existing readers stay consistent
  const handleStartChange = (value) => {
    const num = value === "" ? undefined : Number(value);
    onChange("serial_start", num);
    onChange("serial_end", num);
  };

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
          placeholder="Serial #"
          value={item.serial_start ?? ""}
          onChange={(e) => handleStartChange(e.target.value)}
          className="bg-zinc-800 border-zinc-700 h-7 text-xs w-24"
        />
        <Input
          type="number"
          placeholder="Padding"
          value={padding}
          onChange={(e) => onChange("serial_padding", Number(e.target.value) || 0)}
          className="bg-zinc-800 border-zinc-700 h-7 text-xs w-20"
          min={0}
          max={10}
        />
      </div>
      {preview && (
        <div className="text-[11px] text-zinc-500">
          Batch S/N: <span className="text-zinc-300 font-mono">{preview}</span>
          <span className="ml-2">(applies to all {item.quantity || 0} units)</span>
        </div>
      )}
    </div>
  );
}