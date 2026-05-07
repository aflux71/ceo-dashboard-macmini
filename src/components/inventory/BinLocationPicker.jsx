import React, { useState, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";

/**
 * Combobox-style picker for selecting a Bin/Rack location.
 * Shows existing BinLocation records but also accepts free-text entry
 * (so legacy/custom locations still work).
 */
export default function BinLocationPicker({ value, onChange, bins = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = bins.filter(b =>
    !query || b.name?.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (name) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  const handleInput = (e) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v); // free-text fallback
    setOpen(true);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <input
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          placeholder="e.g. A1-01 or pick from map"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md h-9 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((b) => (
            <div
              key={b.id}
              onMouseDown={() => handleSelect(b.name)}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-700 text-zinc-200"
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: b.color || "#f97316" }}
              />
              <span className="font-mono">{b.name}</span>
              <span className="text-xs text-zinc-500 capitalize ml-auto">{b.type || "bin"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}